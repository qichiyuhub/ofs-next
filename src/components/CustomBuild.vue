<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useFirmwareStore } from '@/stores/firmware'
import { AsuService, type AsuBuildRequest, type AsuBuildResponse } from '@/services/asu'
import { config } from '@/config'

// Define emits
const emit = defineEmits<{
  'build-start': []
  'build-success': [buildResult: AsuBuildResponse & { asu_image_url: string }]
  'build-error': [error: string]
  'build-reset': []
}>()

const i18n = useI18nStore()
const firmware = useFirmwareStore()
const asuService = new AsuService()

// Form data
const packagesText = ref('')
const uciDefaultsContent = ref('')
const rootfsSizeMb = ref<number | null>(null)
const repositories = ref<{ name: string; url: string }[]>([])
const repositoryKeys = ref<string[]>([])
const isExpanded = ref(false)

// Build state
const buildStatus = ref<AsuBuildResponse | null>(null)
const isBuilding = ref(false)
const buildError = ref('')
const pollInterval = ref<number | null>(null)

// Computed
const isAsuAvailable = computed(() => asuService.isAvailable())

const packagesList = computed(() => {
  if (!packagesText.value) return []
  return asuService.parsePackages(packagesText.value)
})

const finalPackages = computed(() => {
  if (!firmware.selectedProfile) return []
  
  return asuService.buildPackagesList(
    firmware.selectedProfile.device_packages || [],
    firmware.selectedProfile.default_packages || [],
    packagesList.value,
    config.asu_extra_packages || []
  )
})

const buildProgress = computed(() => {
  if (!buildStatus.value) return 0
  return asuService.getProgressPercentage(buildStatus.value.status)
})

const statusMessage = computed(() => {
  if (!buildStatus.value) return ''
  
  const statusMessages: Record<string, string> = {
    'requested': i18n.t('tr-init', '已收到构建请求'),
    'building': i18n.t('tr-building-image', '正在生成固件映像'),
    'success': i18n.t('tr-build-successful', '构建成功'),
    'failure': i18n.t('tr-build-failed', '构建失败'),
    'no_sysupgrade': '设备不支持 sysupgrade'
  }
  
  return statusMessages[buildStatus.value.status] || buildStatus.value.status
})

const canBuild = computed(() => {
  return !isBuilding.value && 
         firmware.selectedDevice && 
         firmware.selectedProfile &&
         isAsuAvailable.value
})

// Watch for device changes
watch(() => firmware.selectedDevice, () => {
  // Reset build status when device changes
  buildStatus.value = null
  buildError.value = ''
  stopPolling()
})

// Methods
async function requestBuild() {
  if (!firmware.selectedDevice || !firmware.selectedProfile) return
  
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

    const request: AsuBuildRequest = {
      target: firmware.selectedDevice.target,
      profile: firmware.selectedDevice.id,
      packages: finalPackages.value,
      version: firmware.selectedProfile.version_number,
      defaults: uciDefaultsContent.value || undefined,
      rootfs_size_mb: rootfsSizeMb.value || undefined,
      repositories: Object.keys(repoMap).length > 0 ? repoMap : undefined,
      repository_keys: repoKeys.length > 0 ? repoKeys : undefined
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
  }, 2000)
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

function removeRepository(index: number) {
  repositories.value.splice(index, 1)
}

// Repository keys management methods
function addRepositoryKey() {
  repositoryKeys.value.push('')
}

function removeRepositoryKey(index: number) {
  repositoryKeys.value.splice(index, 1)
}

// Initialize packages with device packages
watch(() => firmware.selectedProfile, (profile) => {
  if (profile && !packagesText.value) {
    const allPackages = [
      ...(profile.device_packages || []),
      ...(profile.default_packages || []),
      ...(config.asu_extra_packages || [])
    ]
    packagesText.value = allPackages.join(' ')
  }
})

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
          <span>{{ i18n.t('tr-customize', '自定义预安装软件包和/或首次启动脚本') }}</span>
        </div>
      </v-expansion-panel-title>
      
      <v-expansion-panel-text>
        <!-- Build Status -->
        <v-alert
          v-if="buildStatus"
          :type="buildStatus.status === 'success' ? 'success' : 
                buildStatus.status === 'failure' ? 'error' : 'info'"
          class="mb-4"
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
          
          <!-- Build Logs -->
          <div v-if="buildStatus.stdout || buildStatus.stderr" class="mt-3">
            <v-expansion-panels variant="accordion" class="mt-2">
              <v-expansion-panel v-if="buildStatus.stderr">
                <v-expansion-panel-title>
                  <code>STDERR</code>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <pre class="build-log">{{ buildStatus.stderr }}</pre>
                </v-expansion-panel-text>
              </v-expansion-panel>
              
              <v-expansion-panel v-if="buildStatus.stdout">
                <v-expansion-panel-title>
                  <code>STDOUT</code>
                </v-expansion-panel-title>
                <v-expansion-panel-text>
                  <pre class="build-log">{{ buildStatus.stdout }}</pre>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>
        </v-alert>

        <!-- Build Error -->
        <v-alert
          v-if="buildError"
          type="error"
          closable
          class="mb-4"
          @click:close="buildError = ''"
        >
          {{ buildError }}
        </v-alert>

        <v-row>
          <!-- Installed Packages -->
          <v-col cols="12">
            <h4 class="text-h6 mb-3">{{ i18n.t('tr-packages', '预安装的软件包') }}</h4>
            <v-textarea
              v-model="packagesText"
              rows="10"
              variant="outlined"
              placeholder="输入软件包名称，用空格或换行分隔"
              hint="使用 '-' 前缀来移除软件包，例如: -ppp -ppp-mod-pppoe"
              persistent-hint
            />
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

            <div v-for="(repo, index) in repositories" :key="index" class="mb-3">
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
                <v-col cols="12" md="7">
                  <v-text-field
                    v-model="repo.url"
                    label="源地址"
                    variant="outlined"
                    density="compact"
                    placeholder="https://downloads.example.com/packages"
                  />
                </v-col>
                <v-col cols="12" md="1">
                  <v-btn
                    icon="mdi-delete"
                    variant="text"
                    color="error"
                    @click="removeRepository(index)"
                  />
                </v-col>
              </v-row>
            </div>
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

            <div v-for="(key, index) in repositoryKeys" :key="index" class="mb-3">
              <v-row>
                <v-col cols="12" md="11">
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
                </v-col>
                <v-col cols="12" md="1">
                  <v-btn
                    icon="mdi-delete"
                    variant="text"
                    color="error"
                    @click="removeRepositoryKey(index)"
                  />
                </v-col>
              </v-row>
            </div>
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
              >
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
      </v-expansion-panel-text>
    </v-expansion-panel>
  </v-expansion-panels>
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