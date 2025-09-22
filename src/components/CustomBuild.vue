<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useFirmwareStore } from '@/stores/firmware'
import { useModuleStore } from '@/stores/module'
import { usePackageStore } from '@/stores/package'
import { AsuService, type AsuBuildRequest, type AsuBuildResponse } from '@/services/asu'
import { config } from '@/config'
import { packageManager } from '@/services/packageManager'
import type { OpenWrtPackage } from '@/types/package'
import ModuleSource from './ModuleSource.vue'
import ModuleSelector from './ModuleSelector.vue'
import PackageManager from './PackageManager.vue'
import PackageDetailDialog from './PackageDetailDialog.vue'

// Define emits
const emit = defineEmits<{
  'build-start': []
  'build-success': [buildResult: AsuBuildResponse & { asu_image_url: string }]
  'build-error': [error: string]
  'build-reset': []
}>()

const i18n = useI18nStore()
const firmware = useFirmwareStore()
const moduleStore = useModuleStore()
const packageStore = usePackageStore()
const asuService = new AsuService()

// Form data
const uciDefaultsContent = ref('')
const rootfsSizeMb = ref<number | null>(null)
const repositories = ref<Array<{ name: string; url: string; loading?: boolean; packages?: OpenWrtPackage[]; error?: string }>>([])
const repositoryKeys = ref<string[]>([])

// Build state
const buildStatus = ref<AsuBuildResponse | null>(null)
const isBuilding = ref(false)
const buildError = ref('')
const pollInterval = ref<number | null>(null)
const expandedLogPanels = ref<string[]>([])
const stderrLogRef = ref<HTMLElement | null>(null)
const stdoutLogRef = ref<HTMLElement | null>(null)

// Validation error dialog
const showValidationErrorDialog = ref(false)
const validationErrors = ref<{ [moduleKey: string]: string[] }>({})

// Package detail dialog
const showPackageDetail = ref(false)
const selectedPackageDetail = ref<OpenWrtPackage | null>(null)

// Computed
const isAsuAvailable = computed(() => asuService.isAvailable())


const finalPackages = computed(() => {
  if (!firmware.selectedProfile) return []
  
  // Collect packages from package manager (includes both selected and removed packages with - prefix)
  const managerPackages = packageStore.buildPackagesList
  
  // Collect packages from selected modules (if module management is enabled)
  const modulePackages: string[] = []
  if (config.enable_module_management) {
    for (const { module } of moduleStore.selectedModules) {
      if (module.definition.packages) {
        modulePackages.push(...module.definition.packages)
      }
    }
  }
  
  return asuService.buildPackagesList(
    firmware.selectedProfile.device_packages || [],
    firmware.selectedProfile.default_packages || [],
    [], // No manual packages text input anymore
    [...(config.asu_extra_packages || []), ...modulePackages, ...managerPackages]
  )
})


const statusMessage = computed(() => {
  if (!buildStatus.value) return ''

  const httpStatus = (buildStatus.value as (AsuBuildResponse & { httpStatus?: number })).httpStatus
  if (httpStatus === 202) {
    return `${i18n.t('tr-building-image', '正在生成固件映像')} · HTTP 202`
  }
  if (httpStatus === 200) {
    return `${i18n.t('tr-build-successful', '构建成功')} · HTTP 200`
  }
  if (httpStatus && httpStatus >= 400) {
    const detail = buildStatus.value.detail
    const base = detail && detail.length > 0 ? detail : i18n.t('tr-build-failed', '构建失败')
    return `${base} · HTTP ${httpStatus}`
  }

  const statusMessages: Record<string, string> = {
    requested: i18n.t('tr-init', '已收到构建请求'),
    building: i18n.t('tr-building-image', '正在生成固件映像'),
    success: i18n.t('tr-build-successful', '构建成功'),
    failure: i18n.t('tr-build-failed', '构建失败'),
    no_sysupgrade: '设备不支持 sysupgrade'
  }

  return statusMessages[buildStatus.value.status] || buildStatus.value.status
})

const statusAlertType = computed(() => {
  if (!buildStatus.value) return 'info'
  const httpStatus = (buildStatus.value as (AsuBuildResponse & { httpStatus?: number })).httpStatus
  if (httpStatus === 200) return 'success'
  if (httpStatus === 202 || httpStatus === undefined || httpStatus === null) {
    // fall back to status field when code missing
    const status = buildStatus.value.status
    if (status === 'success') return 'success'
    if (status === 'failure') return 'error'
    return 'info'
  }
  if (httpStatus >= 400) return 'error'
  return 'info'
})

const canBuild = computed(() => {
  return !isBuilding.value && 
         firmware.selectedDevice && 
         firmware.selectedProfile &&
         isAsuAvailable.value
})

// Watch for device changes
watch(
  () => firmware.selectedDevice,
  (newDevice, oldDevice) => {
    if (!oldDevice) return
    resetCustomConfiguration()
  }
)

watch(
  () => firmware.currentVersion,
  (newVersion, oldVersion) => {
    if (oldVersion && newVersion !== oldVersion) {
      resetCustomConfiguration()
    }
  }
)

watch(
  () => [buildStatus.value?.stderr, buildStatus.value?.stdout],
  ([stderr, stdout]) => {
    const panels: string[] = []
    if (stderr) panels.push('stderr')
    if (stdout) panels.push('stdout')
    expandedLogPanels.value = panels
    nextTick(() => {
      scrollToBottom(stderrLogRef.value)
      scrollToBottom(stdoutLogRef.value)
    })
  },
  { immediate: true }
)

function scrollToBottom(element: HTMLElement | null) {
  if (!element) return
  element.scrollTop = element.scrollHeight
}

// Helper functions
function getModuleDisplayName(moduleKey: string): string {
  const [sourceId, moduleId] = moduleKey.split(':')
  const source = moduleStore.sources.find(s => s.id === sourceId)
  const module = source?.modules.find(m => m.id === moduleId)
  
  if (module && source) {
    return `${module.definition.name} (来源: ${source.name})`
  }
  
  return moduleKey
}

function closeValidationErrorDialog() {
  showValidationErrorDialog.value = false
  validationErrors.value = {}
}

function resetCustomConfiguration() {
  stopPolling()
  buildStatus.value = null
  buildError.value = ''
  expandedLogPanels.value = []
  showValidationErrorDialog.value = false
  validationErrors.value = {}
  showPackageDetail.value = false
  selectedPackageDetail.value = null

  uciDefaultsContent.value = ''
  rootfsSizeMb.value = null
  repositories.value = []
  repositoryKeys.value = []

  packageStore.clearAllPackages()
  if (config.enable_module_management) {
    moduleStore.resetAll()
  }
}

// Get current custom build configuration for saving
function getCurrentCustomBuildConfig() {
  return {
    packageConfiguration: packageStore.getPackageConfiguration(),
    uciDefaults: uciDefaultsContent.value,
    rootfsSizeMb: rootfsSizeMb.value,
    repositories: repositories.value.filter(repo => repo.name && repo.url),
    repositoryKeys: repositoryKeys.value.filter(key => key.trim())
  }
}

// Apply custom build configuration from loaded config
function applyCustomBuildConfig(customBuild: Record<string, unknown>) {
  if (customBuild.packageConfiguration && typeof customBuild.packageConfiguration === 'object' && customBuild.packageConfiguration !== null) {
    packageStore.setPackageConfiguration(customBuild.packageConfiguration as { addedPackages: string[]; removedPackages: string[] })
  }
  if (customBuild.uciDefaults && typeof customBuild.uciDefaults === 'string') {
    uciDefaultsContent.value = customBuild.uciDefaults
  }
  if (customBuild.rootfsSizeMb && typeof customBuild.rootfsSizeMb === 'number') {
    rootfsSizeMb.value = customBuild.rootfsSizeMb
  }
  if (customBuild.repositories && Array.isArray(customBuild.repositories)) {
    repositories.value = [...customBuild.repositories]
  }
  if (customBuild.repositoryKeys && Array.isArray(customBuild.repositoryKeys)) {
    repositoryKeys.value = [...customBuild.repositoryKeys]
  }
}

// Note: Configuration management is now handled at the App level

// Expose methods for configuration management
defineExpose({
  getCurrentCustomBuildConfig,
  applyCustomBuildConfig
})

// Methods
async function requestBuild() {
  if (!firmware.selectedDevice || !firmware.selectedProfile) return
  
  // Validate all selected modules first (if module management is enabled)
  if (config.enable_module_management) {
    const validationResult = moduleStore.validateAllSelections()
    if (!validationResult.isValid) {
      validationErrors.value = validationResult.errors
      showValidationErrorDialog.value = true
      return
    }
  }
  
  isBuilding.value = true
  buildError.value = ''
  
  // Notify parent that build has started
  emit('build-start')
  
  try {
    // Prepare repositories
    const repoMap: { [name: string]: string } = {}
    repositories.value.forEach(repo => {
      if (repo.name && repo.url) {
        repoMap[repo.name] = repo.url
      }
    })

    // Prepare repository keys
    const repoKeys = repositoryKeys.value
      .map(key => key.trim())
      .filter(key => key.length > 0)

    // Prepare module data if any modules are selected and module management is enabled
    let modules = undefined
    if (config.enable_module_management && moduleStore.selectedModules.length > 0) {
      interface ModuleData {
        source_id: string
        url: string
        ref: string
        selected_modules: Array<{
          module_id: string
          parameters: { [key: string]: string }
          user_downloads: { [key: string]: string }
        }>
      }
      
      const moduleData = new Map<string, ModuleData>()
      
      for (const { module, source, selection } of moduleStore.selectedModules) {
        if (!moduleData.has(source.id)) {
          moduleData.set(source.id, {
            source_id: source.id,
            url: source.url,
            ref: source.ref,
            selected_modules: []
          })
        }
        
        moduleData.get(source.id)!.selected_modules.push({
          module_id: module.id,
          parameters: selection.parameters,
          user_downloads: selection.userDownloads
        })
      }
      
      modules = Array.from(moduleData.values())
    }

    const request: AsuBuildRequest = {
      target: firmware.selectedDevice.target,
      profile: firmware.selectedDevice.id,
      packages: finalPackages.value,
      version: firmware.selectedProfile.version_number,
      defaults: uciDefaultsContent.value || undefined,
      rootfs_size_mb: rootfsSizeMb.value || undefined,
      repositories: Object.keys(repoMap).length > 0 ? repoMap : undefined,
      repository_keys: repoKeys.length > 0 ? repoKeys : undefined,
      modules
    }
    
    const response = await asuService.requestBuild(request)
    buildStatus.value = response
    
    if (response.request_hash) {
      startPolling(response.request_hash)
    }
    
  } catch (error) {
    const errorMsg = `构建请求失败: ${error}`
    buildError.value = errorMsg
    emit('build-error', errorMsg)
  } finally {
    isBuilding.value = false
  }
}

function startPolling(requestHash: string) {
  stopPolling()
  
  pollInterval.value = window.setInterval(async () => {
    try {
      const status = await asuService.getBuildStatus(requestHash)
      buildStatus.value = status
      
      // Use HTTP status code to determine build state (like original implementation)
      if (status.httpStatus === 200) {
        // Build successful
        stopPolling()
        // Use bin_dir from response if available, otherwise use request_hash
        const binDir = status.bin_dir || requestHash
        const buildResult = {
          ...status,
          asu_image_url: `${config.asu_url}/store/${binDir}`
        }
        emit('build-success', buildResult)
      } else if (status.httpStatus === 202) {
        // Build in progress - continue polling
        // No action needed, just continue
      } else if (status.httpStatus >= 400) {
        // Build failed
        stopPolling()
        emit('build-error', status.detail || `构建失败 (HTTP ${status.httpStatus})`)
      }
    } catch (error) {
      console.error('Failed to poll build status:', error)
      stopPolling()
      emit('build-error', `构建状态检查失败: ${error}`)
    }
  }, 5000)
}

function stopPolling() {
  if (pollInterval.value) {
    clearInterval(pollInterval.value)
    pollInterval.value = null
  }
}

function resetBuild() {
  buildStatus.value = null
  buildError.value = ''
  stopPolling()
  emit('build-reset')
}

function loadTemplate() {
  // Load a sample uci-defaults template
  uciDefaultsContent.value = `#!/bin/sh
# This script will be executed once after the first boot

# Example: Set hostname
uci set system.@system[0].hostname='OpenWrt-Custom'

# Example: Configure network
# uci set network.lan.ipaddr='192.168.1.1'

# Commit changes
uci commit
`
}

// Repository management methods
function addRepository() {
  repositories.value.push({ name: '', url: '' })
}

async function loadRepositoryIndex(repo: { name: string; url: string; loading?: boolean; packages?: OpenWrtPackage[]; error?: string }) {
  if (!repo.url) return
  
  repo.loading = true
  repo.error = undefined
  
  try {
    // Ensure the URL ends with '/Packages' for the feed URL
    let feedUrl = repo.url.trim()
    if (!feedUrl.endsWith('/Packages')) {
      // Add trailing slash if needed, then append 'Packages'
      if (!feedUrl.endsWith('/')) {
        feedUrl += '/'
      }
      feedUrl += 'Packages'
    }
    
    const packages = await packageManager.fetchFeedPackages(feedUrl, repo.name || 'custom')
    repo.packages = packages
    
    // Add these packages to the main package store for browsing
    packageStore.addCustomFeedPackages(repo.name || 'custom', packages)
  } catch (error) {
    repo.error = error instanceof Error ? error.message : '加载失败'
    console.error('Failed to load repository index:', error)
  } finally {
    repo.loading = false
  }
}

// Watch for URL changes and auto-load when both name and url are filled
watch(repositories, async (newRepos, oldRepos) => {
  for (let i = 0; i < newRepos.length; i++) {
    const newRepo = newRepos[i]
    const oldRepo = oldRepos?.[i]
    
    console.log('Repository watch triggered:', {
      index: i,
      name: newRepo.name,
      url: newRepo.url,
      loading: newRepo.loading,
      hasPackages: !!newRepo.packages,
      urlChanged: !oldRepo || oldRepo.url !== newRepo.url
    })
    
    // Auto-load when both name and url are filled
    if (newRepo.name.trim() && newRepo.url.trim() && 
        !newRepo.loading && !newRepo.packages) {
      console.log('Loading repository index for:', newRepo.name)
      await loadRepositoryIndex(newRepo)
    }
  }
}, { deep: true })

function removeRepository(index: number) {
  const repo = repositories.value[index]
  
  // Remove packages from package store if they were loaded
  if (repo && repo.name && repo.packages) {
    packageStore.removeCustomFeedPackages(repo.name)
  }
  
  repositories.value.splice(index, 1)
}

// Repository keys management methods
function addRepositoryKey() {
  repositoryKeys.value.push('')
}

function removeRepositoryKey(index: number) {
  repositoryKeys.value.splice(index, 1)
}

// Package detail methods
function showPackageDetails(packageName: string) {
  const packageInfo = packageStore.getPackageInfo(packageName)
  selectedPackageDetail.value = packageInfo || null
  showPackageDetail.value = true
}



// Cleanup
onUnmounted(() => {
  stopPolling()
})
</script>

<template>
  <v-expansion-panels v-if="isAsuAvailable">
    <v-expansion-panel>
      <v-expansion-panel-title>
        <div class="d-flex align-center">
          <v-icon class="mr-3">mdi-cog</v-icon>
          <span>{{ i18n.t('tr-customize', '自定义软件包管理和首次启动脚本') }}</span>
        </div>
      </v-expansion-panel-title>
      
      <v-expansion-panel-text>
        <!-- Module Management -->
        <div v-if="config.enable_module_management" class="mb-6">
          <ModuleSource class="mb-4" />
          <ModuleSelector v-if="moduleStore.sources.length > 0" />
        </div>

        <v-divider v-if="config.enable_module_management" class="my-6" />

        <v-row>
          <!-- Package Manager -->
          <v-col cols="12">
            <PackageManager class="mb-6" />
          </v-col>


          <!-- UCI Defaults Script -->
          <v-col cols="12">
            <div class="d-flex align-center justify-space-between mb-3">
              <h4 class="text-h6">{{ i18n.t('tr-defaults', '首次启动时运行的脚本（uci-defaults）') }}</h4>
              <v-btn
                size="small"
                variant="outlined"
                @click="loadTemplate"
              >
                加载模板
              </v-btn>
            </div>
            <v-textarea
              v-model="uciDefaultsContent"
              rows="10"
              variant="outlined"
              placeholder="输入首次启动脚本内容"
              hint="这个脚本将在设备首次启动时执行一次"
              persistent-hint
            />
          </v-col>
        </v-row>

        <v-divider class="my-6" />

        <!-- Advanced Configuration -->
        <v-row>
          <v-col cols="12">
            <h4 class="text-h6 mb-3">高级配置</h4>
          </v-col>

          <!-- Root Filesystem Size -->
          <v-col cols="12" md="6">
            <v-text-field
              v-model.number="rootfsSizeMb"
              label="根文件系统大小 (MB)"
              placeholder="256"
              type="number"
              variant="outlined"
              hint="设置根文件系统的大小，单位为MB (可选)"
              persistent-hint
              :min="1"
              :max="2048"
              clearable
            />
          </v-col>

          <!-- Repositories -->
          <v-col cols="12">
            <div class="d-flex align-center mb-3">
              <h5 class="text-subtitle1">自定义软件源</h5>
              <v-spacer />
              <v-btn
                size="small"
                prepend-icon="mdi-plus"
                @click="addRepository"
              >
                添加软件源
              </v-btn>
            </div>
            
            <div v-if="repositories.length === 0" class="text-grey text-body-2 mb-4">
              暂无自定义软件源
            </div>

            <v-card v-for="(repo, index) in repositories" :key="index" variant="outlined" class="mb-3">
              <v-card-title class="d-flex align-center pa-3">
                <v-icon icon="mdi-package-variant" class="mr-2" />
                软件源 {{ index + 1 }}
                <v-spacer />
                <v-btn
                  icon="mdi-delete"
                  variant="text"
                  color="error"
                  size="small"
                  @click="removeRepository(index)"
                />
              </v-card-title>
              
              <v-card-text class="pt-0">
                <v-row>
                  <v-col cols="12" md="4">
                    <v-text-field
                      v-model="repo.name"
                      label="源名称"
                      variant="outlined"
                      density="compact"
                      placeholder="my-repo"
                    />
                  </v-col>
                  <v-col cols="12" md="8">
                    <v-text-field
                      v-model="repo.url"
                      label="源地址"
                      variant="outlined"
                      density="compact"
                      placeholder="https://downloads.example.com/packages/Packages"
                      :loading="repo.loading"
                      :error="!!repo.error"
                      :error-messages="repo.error"
                    />
                    <div v-if="repo.packages" class="text-caption text-success mt-1">
                      ✓ 已加载 {{ repo.packages.length }} 个软件包
                    </div>
                  </v-col>
                </v-row>
              </v-card-text>
            </v-card>
          </v-col>

          <!-- Repository Keys -->
          <v-col cols="12">
            <div class="d-flex align-center mb-3">
              <h5 class="text-subtitle1">软件源签名密钥</h5>
              <v-spacer />
              <v-btn
                size="small"
                prepend-icon="mdi-plus"
                @click="addRepositoryKey"
              >
                添加密钥
              </v-btn>
            </div>
            
            <div v-if="repositoryKeys.length === 0" class="text-grey text-body-2 mb-4">
              暂无签名密钥
            </div>

            <v-card v-for="(key, index) in repositoryKeys" :key="index" variant="outlined" class="mb-3">
              <v-card-title class="d-flex align-center pa-3">
                <v-icon icon="mdi-key-variant" class="mr-2" />
                签名密钥 {{ index + 1 }}
                <v-spacer />
                <v-btn
                  icon="mdi-delete"
                  variant="text"
                  color="error"
                  size="small"
                  @click="removeRepositoryKey(index)"
                />
              </v-card-title>
              
              <v-card-text class="pt-0">
                <v-textarea
                  v-model="repositoryKeys[index]"
                  label="usign 公钥"
                  variant="outlined"
                  rows="3"
                  density="compact"
                  placeholder="untrusted comment: OpenWrt usign key&#10;RWQKvaZaSStIhx4t06ISyV42CIpK7niKfR+Yro/WHiKLa122SEh2j3Z4"
                  hint="用于验证自定义软件源的 usign 公钥"
                  persistent-hint
                />
              </v-card-text>
            </v-card>
          </v-col>
        </v-row>

        <!-- Package Summary -->
        <v-card v-if="finalPackages.length > 0" variant="elevated" class="mt-4 mb-4">
          <v-card-title class="text-subtitle1">
            软件包摘要 ({{ finalPackages.length }} 个)
          </v-card-title>
          <v-card-text>
            <div class="d-flex flex-wrap">
              <v-chip
                v-for="pkg in finalPackages"
                :key="pkg"
                size="small"
                variant="outlined"
                class="ma-1"
                :color="pkg.startsWith('-') ? 'error' : 'primary'"
                :class="{ 'text-decoration-line-through': pkg.startsWith('-') }"
                @click="packageStore.getPackageInfo(pkg.replace(/^-/, '')) ? showPackageDetails(pkg.replace(/^-/, '')) : null"
                :style="packageStore.getPackageInfo(pkg.replace(/^-/, '')) ? 'cursor: pointer' : ''"
              >
                <v-icon 
                  v-if="packageStore.getPackageInfo(pkg.replace(/^-/, ''))" 
                  size="x-small" 
                  class="mr-1"
                >
                  mdi-information-outline
                </v-icon>
                {{ pkg }}
              </v-chip>
            </div>
          </v-card-text>
        </v-card>

        <!-- Build Button -->
        <div class="d-flex justify-center">
          <v-btn
            :disabled="!canBuild"
            :loading="isBuilding"
            color="primary"
            size="large"
            prepend-icon="mdi-hammer-wrench"
            @click="requestBuild"
          >
            {{ i18n.t('tr-request-build', '请求构建') }}
          </v-btn>
        </div>

        <!-- Build Status -->
        <div v-if="buildStatus" class="mt-6">
          <v-alert
            :type="statusAlertType"
            :closable="buildStatus.status !== 'building'"
            @click:close="resetBuild"
          >
            <div class="d-flex align-center">
              <v-progress-circular
                v-if="buildStatus.status === 'building' || buildStatus.status === 'requested'"
                indeterminate
                size="24"
                class="mr-3"
              />
              <div>
                <div>{{ statusMessage }}</div>
                <div v-if="buildStatus.queue_position" class="text-caption">
                  队列位置: {{ buildStatus.queue_position }}
                </div>
              </div>
            </div>
            
            <!-- Build Success - Show download links -->
            <div v-if="buildStatus.status === 'success' && buildStatus.images" class="mt-3">
              <v-divider class="mb-3" />
              <div class="text-subtitle2 mb-2">{{ i18n.t('tr-custom-downloads', '自定义下载') }}</div>
              <div class="d-flex flex-wrap gap-2">
                <v-btn
                  v-for="image in buildStatus.images"
                  :key="image.name"
                  :href="`${config.asu_url}/store/${buildStatus.request_hash}/${image.name}`"
                  target="_blank"
                  color="success"
                  variant="elevated"
                  size="small"
                  prepend-icon="mdi-download"
                >
                  {{ image.type.toUpperCase() }}
                </v-btn>
              </div>
            </div>
          </v-alert>
        </div>

        <!-- Build Error -->
        <v-alert
          v-if="buildError"
          type="error"
          closable
          class="mt-4"
          @click:close="buildError = ''"
        >
          {{ buildError }}
        </v-alert>

        <!-- Build Logs -->
        <div v-if="buildStatus && (buildStatus.stdout || buildStatus.stderr)" class="mt-6">
          <v-divider class="mb-4" />
          <div class="d-flex align-center mb-2">
            <v-icon icon="mdi-text-box-outline" size="small" class="mr-2" />
            <span class="text-subtitle2">构建日志</span>
          </div>
          <v-expansion-panels
            v-model="expandedLogPanels"
            variant="accordion"
            multiple
          >
            <v-expansion-panel v-if="buildStatus.stderr" value="stderr">
              <v-expansion-panel-title>
                <code>STDERR</code>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <pre ref="stderrLogRef" class="build-log">{{ buildStatus.stderr }}</pre>
              </v-expansion-panel-text>
            </v-expansion-panel>

            <v-expansion-panel v-if="buildStatus.stdout" value="stdout">
              <v-expansion-panel-title>
                <code>STDOUT</code>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <pre ref="stdoutLogRef" class="build-log">{{ buildStatus.stdout }}</pre>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </div>
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>

  <!-- Validation Error Dialog -->
  <v-dialog v-model="showValidationErrorDialog" max-width="600px" scrollable>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-alert-circle" color="error" class="mr-2" />
        模块参数验证失败
      </v-card-title>

      <v-divider />

      <v-card-text class="pt-4">
        <v-alert type="error" variant="tonal" class="mb-4">
          <strong>无法开始构建，以下模块存在参数错误：</strong>
        </v-alert>

        <div v-for="(errors, moduleKey) in validationErrors" :key="moduleKey" class="mb-4">
          <div class="d-flex align-center mb-2">
            <v-icon icon="mdi-puzzle" size="small" color="primary" class="mr-2" />
            <strong>{{ getModuleDisplayName(String(moduleKey)) }}</strong>
          </div>
          
          <v-list density="compact" class="bg-error-container/10 rounded">
            <v-list-item
              v-for="(error, index) in errors"
              :key="index"
              class="text-error"
            >
              <template #prepend>
                <v-icon icon="mdi-circle-small" size="small" />
              </template>
              <v-list-item-title class="text-body-2">{{ error }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </div>

        <v-alert type="info" variant="tonal" class="mt-4">
          <div class="text-body-2">
            <strong>解决方法：</strong>
            <ul class="mt-2">
              <li>检查标红的必填参数是否已填写</li>
              <li>确保参数格式符合要求（如IP地址、URL等）</li>
              <li>为用户自定义下载提供有效的URL</li>
              <li>点击模块的"配置参数"按钮进行修正</li>
            </ul>
          </div>
        </v-alert>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn @click="closeValidationErrorDialog">关闭</v-btn>
        <v-btn 
          color="primary" 
          variant="outlined"
          @click="closeValidationErrorDialog"
        >
          去修正参数
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>

  <!-- Package Detail Dialog -->
  <PackageDetailDialog 
    v-model="showPackageDetail"
    :package-detail="selectedPackageDetail"
  />
</template>

<style scoped>
.build-log {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
}
</style>
