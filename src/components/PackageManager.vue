<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePackageStore } from '@/stores/package'
import { useFirmwareStore } from '@/stores/firmware'
import { packageManager } from '@/services/packageManager'
import type { OpenWrtPackage } from '@/types/package'

const packageStore = usePackageStore()
const firmwareStore = useFirmwareStore()

// Component state
const searchInput = ref('')
const showAddDialog = ref(false)
const selectedPackageDetail = ref<OpenWrtPackage | null>(null)
const showPackageDetail = ref(false)

// Debounced search
const searchDebounce = ref<NodeJS.Timeout>()
watch(searchInput, (newValue) => {
  clearTimeout(searchDebounce.value)
  searchDebounce.value = setTimeout(() => {
    packageStore.setSearchQuery(newValue)
  }, 300)
})

// Computed
const displayPackages = computed(() => {
  return packageStore.filteredPackages.slice(0, 50) // Limit results for performance
})

const totalSize = computed(() => {
  return packageStore.getTotalSize()
})

// Methods
function openAddDialog() {
  // Auto-load packages if not loaded and device is selected
  if (packageStore.totalPackages === 0 && firmwareStore.selectedDevice) {
    loadPackagesForCurrentDevice()
  }
  showAddDialog.value = true
}

function closeAddDialog() {
  showAddDialog.value = false
  packageStore.clearFilters()
  searchInput.value = ''
}

async function loadPackagesForCurrentDevice() {
  if (!firmwareStore.selectedDevice || !firmwareStore.currentVersion) {
    return
  }

  const architecture = getDeviceArchitecture()
  if (architecture) {
    await packageStore.loadPackagesForDevice(
      firmwareStore.currentVersion, 
      architecture, 
      firmwareStore.selectedDevice.target
    )
  }
}

function getDeviceArchitecture(): string | null {
  // Use arch_packages from selected profile if available
  if (firmwareStore.selectedProfile?.arch_packages) {
    return firmwareStore.selectedProfile.arch_packages
  }
  
  // Fallback: warn if profile not available
  if (firmwareStore.selectedDevice) {
    console.warn(`Profile not loaded for device: ${firmwareStore.selectedDevice.title}, cannot determine architecture`)
  }
  
  return null
}

function addPackage(packageName: string) {
  packageStore.addPackage(packageName)
  // Remove from removed list if it was there
  packageStore.removeRemovedPackage(packageName)
}

function removePackage(packageName: string) {
  // Use the smart toggle logic that handles both default and non-default packages
  packageStore.togglePackage(packageName)
}

function showPackageDetails(pkg: OpenWrtPackage | null) {
  selectedPackageDetail.value = pkg
  showPackageDetail.value = true
}

function closePackageDetail() {
  showPackageDetail.value = false
  selectedPackageDetail.value = null
}


function formatSize(bytes: number) {
  return packageManager.formatSize(bytes)
}

function getSectionName(section: string) {
  return packageManager.getSectionDisplayName(section)
}

function getFeedName(feedName: string) {
  return packageManager.getFeedDisplayName(feedName)
}

function clearAllPackages() {
  packageStore.clearAllPackages()
}

// Auto-load packages when device changes
watch(() => firmwareStore.selectedDevice, (newDevice) => {
  if (newDevice && packageStore.totalPackages === 0) {
    loadPackagesForCurrentDevice()
  }
})
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-package-variant" class="mr-2" />
      软件包管理
      <v-spacer />
      <v-btn
        color="primary"
        prepend-icon="mdi-plus"
        @click="openAddDialog"
        :disabled="!firmwareStore.selectedDevice"
      >
        添加软件包
      </v-btn>
    </v-card-title>

    <v-card-text>
      <!-- Selected packages list -->
      <div v-if="packageStore.selectedPackagesList.length === 0 && packageStore.removedPackagesList.length === 0" class="text-center py-4">
        <v-icon icon="mdi-package-variant-closed" size="48" color="grey-lighten-1" />
        <p class="text-body-1 mt-2 text-grey">暂未选择任何软件包</p>
        <p class="text-caption text-grey">点击"添加软件包"开始选择</p>
      </div>

      <div v-else>
        <!-- Summary -->
        <div class="d-flex align-center mb-4">
          <div class="flex-grow-1">
            <v-chip color="primary" variant="tonal" class="mr-2">
              已选择 {{ packageStore.selectedPackagesList.length }} 个软件包
            </v-chip>
            <v-chip v-if="packageStore.removedPackagesList.length > 0" color="error" variant="tonal" class="mr-2">
              要移除 {{ packageStore.removedPackagesList.length }} 个软件包
            </v-chip>
            <v-chip color="info" variant="tonal" class="mr-2">
              下载: {{ formatSize(totalSize.downloadSize) }}
            </v-chip>
            <v-chip color="warning" variant="tonal">
              安装: {{ formatSize(totalSize.installedSize) }}
            </v-chip>
          </div>
          <v-btn
            size="small"
            variant="outlined"
            color="error"
            @click="clearAllPackages"
          >
            清空全部
          </v-btn>
        </div>

        <!-- Package lists -->
        <v-list lines="two">
          <!-- Selected packages -->
          <template v-for="packageName in packageStore.selectedPackagesList" :key="'selected-' + packageName">
            <v-list-item>
              <template #prepend>
                <v-icon icon="mdi-package-variant" color="primary" />
              </template>

              <v-list-item-title>{{ packageName }}</v-list-item-title>
              <v-list-item-subtitle>
                <span v-if="packageStore.getPackageInfo(packageName)">
                  {{ packageStore.getPackageInfo(packageName)!.description }}
                </span>
                <span v-else class="text-medium-emphasis">加载中...</span>
              </v-list-item-subtitle>

              <template #append>
                <div class="d-flex align-center">
                  <v-btn
                    icon="mdi-information-outline"
                    variant="text"
                    size="small"
                    @click="showPackageDetails(packageStore.getPackageInfo(packageName))"
                    v-if="packageStore.getPackageInfo(packageName)"
                  />
                  <v-btn
                    :icon="packageStore.isPackageInDefaults(packageName) ? 'mdi-delete' : 'mdi-close'"
                    variant="text"
                    size="small"
                    color="error"
                    :title="packageStore.isPackageInDefaults(packageName) ? '从默认包列表中排除' : '取消选择'"
                    @click="removePackage(packageName)"
                  />
                </div>
              </template>
            </v-list-item>
          </template>

          <!-- Divider if both lists exist -->
          <v-divider v-if="packageStore.selectedPackagesList.length > 0 && packageStore.removedPackagesList.length > 0" class="my-2" />

          <!-- Removed packages -->
          <template v-for="packageName in packageStore.removedPackagesList" :key="'removed-' + packageName">
            <v-list-item class="bg-error-container/10">
              <template #prepend>
                <v-icon icon="mdi-package-variant-remove" color="error" />
              </template>

              <v-list-item-title class="text-decoration-line-through text-error">
                -{{ packageName }}
              </v-list-item-title>
              <v-list-item-subtitle class="text-error">
                <span v-if="packageStore.getPackageInfo(packageName)">
                  {{ packageStore.getPackageInfo(packageName)!.description }}
                </span>
                <span v-else class="text-medium-emphasis">此软件包将在构建时移除</span>
              </v-list-item-subtitle>

              <template #append>
                <div class="d-flex align-center">
                  <v-btn
                    icon="mdi-information-outline"
                    variant="text"
                    size="small"
                    @click="showPackageDetails(packageStore.getPackageInfo(packageName))"
                    v-if="packageStore.getPackageInfo(packageName)"
                  />
                  <v-btn
                    icon="mdi-restore"
                    variant="text"
                    size="small"
                    color="success"
                    title="恢复到默认状态"
                    @click="packageStore.removeRemovedPackage(packageName)"
                  />
                </div>
              </template>
            </v-list-item>
          </template>
        </v-list>
      </div>
    </v-card-text>

    <!-- Add Package Dialog -->
    <v-dialog v-model="showAddDialog" max-width="1000px" scrollable>
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-package-variant-plus" class="mr-2" />
          添加软件包
          <v-spacer />
          <v-chip v-if="packageStore.totalPackages > 0" variant="tonal">
            共 {{ packageStore.totalPackages }} 个软件包
          </v-chip>
        </v-card-title>

        <v-card-text>
          <!-- Loading state -->
          <div v-if="packageStore.isLoading" class="text-center py-8">
            <v-progress-circular indeterminate color="primary" size="48" />
            <p class="text-body-1 mt-4">正在加载软件包列表...</p>
            <p class="text-caption text-medium-emphasis">首次加载需要一些时间</p>
          </div>

          <!-- Error state -->
          <v-alert
            v-if="packageStore.error"
            type="error"
            class="mb-4"
            dismissible
            @click:close="packageStore.clearError"
          >
            {{ packageStore.error }}
          </v-alert>

          <!-- Search and filters -->
          <div v-if="!packageStore.isLoading && packageStore.totalPackages > 0">
            <div class="d-flex mb-4">
              <v-text-field
                v-model="searchInput"
                label="搜索软件包"
                placeholder="输入软件包名称或描述..."
                prepend-inner-icon="mdi-magnify"
                variant="outlined"
                density="compact"
                clearable
                class="flex-grow-1 mr-3"
              />

              <v-select
                v-model="packageStore.selectedSection"
                :items="[{ title: '全部分类', value: '' }, ...packageStore.packageSections.map(s => ({ title: getSectionName(s), value: s }))]"
                label="分类"
                variant="outlined"
                density="compact"
                style="min-width: 150px"
                class="mr-3"
              />

              <v-select
                v-model="packageStore.selectedSource"
                :items="[{ title: '全部来源', value: '' }, ...packageStore.packageSources.map(s => ({ title: getFeedName(s), value: s }))]"
                label="来源"
                variant="outlined"
                density="compact"
                style="min-width: 120px"
              />
            </div>

            <!-- Results info -->
            <div class="d-flex align-center mb-3">
              <span class="text-body-2 text-medium-emphasis">
                显示前50个结果，共找到 {{ packageStore.filteredPackages.length }} 个软件包
              </span>
              <v-spacer />
              <v-btn
                size="small"
                variant="outlined"
                @click="packageStore.clearFilters"
                v-if="searchInput || packageStore.selectedSection || packageStore.selectedSource"
              >
                清除筛选
              </v-btn>
            </div>

            <!-- Package list -->
            <v-list lines="three" max-height="400" style="overflow-y: auto">
              <v-list-item
                v-for="pkg in displayPackages"
                :key="pkg.name"
                :class="{ 
                  'bg-primary-container': packageStore.getPackageStatus(pkg.name) === 'selected',
                  'bg-error-container': packageStore.getPackageStatus(pkg.name) === 'removed',
                  'bg-secondary-container': packageStore.getPackageStatus(pkg.name) === 'default'
                }"
              >
                <template #prepend>
                  <v-icon 
                    :icon="packageStore.getPackageStatus(pkg.name) === 'selected' ? 'mdi-check-circle' : 
                           packageStore.getPackageStatus(pkg.name) === 'removed' ? 'mdi-package-variant-remove' :
                           packageStore.getPackageStatus(pkg.name) === 'default' ? 'mdi-package-variant' :
                           'mdi-package-variant-plus'"
                    :color="packageStore.getPackageStatus(pkg.name) === 'selected' ? 'primary' :
                            packageStore.getPackageStatus(pkg.name) === 'removed' ? 'error' :
                            packageStore.getPackageStatus(pkg.name) === 'default' ? 'secondary' :
                            'grey'"
                  />
                </template>

                <v-list-item-title class="font-weight-medium">
                  {{ pkg.name }}
                  <v-chip v-if="packageStore.isPackageInDefaults(pkg.name)" size="x-small" color="secondary" variant="tonal" class="ml-2">
                    默认
                  </v-chip>
                </v-list-item-title>
                <v-list-item-subtitle>
                  <div>{{ pkg.description }}</div>
                  <div class="d-flex align-center mt-1">
                    <v-chip size="x-small" color="secondary" variant="tonal" class="mr-1">
                      {{ getSectionName(pkg.section) }}
                    </v-chip>
                    <v-chip size="x-small" color="info" variant="tonal" class="mr-1">
                      {{ getFeedName(pkg.source || '') }}
                    </v-chip>
                    <span class="text-caption text-medium-emphasis">
                      {{ formatSize(pkg.size) }}
                    </span>
                  </div>
                </v-list-item-subtitle>

                <template #append>
                  <div class="d-flex align-center">
                    <v-btn
                      icon="mdi-information-outline"
                      variant="text"
                      size="small"
                      @click="showPackageDetails(pkg)"
                    />
                    
                    <!-- 非默认包的按钮逻辑 -->
                    <template v-if="!packageStore.isPackageInDefaults(pkg.name)">
                      <v-btn
                        v-if="!packageStore.isPackageSelected(pkg.name)"
                        icon="mdi-plus"
                        variant="text"
                        size="small"
                        color="primary"
                        title="添加"
                        @click="packageStore.togglePackage(pkg.name)"
                      />
                      <v-btn
                        v-else
                        icon="mdi-close"
                        variant="text"
                        size="small"
                        color="error"
                        title="取消添加"
                        @click="packageStore.togglePackage(pkg.name)"
                      />
                    </template>
                    
                    <!-- 默认包的按钮逻辑 -->
                    <template v-else>
                      <v-btn
                        v-if="packageStore.isPackageSelected(pkg.name)"
                        icon="mdi-delete"
                        variant="text"
                        size="small"
                        color="error"
                        title="排除"
                        @click="packageStore.togglePackage(pkg.name)"
                      />
                      <v-btn
                        v-else
                        icon="mdi-restore"
                        variant="text"
                        size="small"
                        color="success"
                        title="取消排除"
                        @click="packageStore.togglePackage(pkg.name)"
                      />
                    </template>
                  </div>
                </template>
              </v-list-item>
            </v-list>
          </div>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn @click="closeAddDialog">关闭</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Package Detail Dialog -->
    <v-dialog v-model="showPackageDetail" max-width="600px" scrollable>
      <v-card v-if="selectedPackageDetail">
        <v-card-title class="d-flex align-center">
          <v-icon icon="mdi-package-variant" class="mr-2" />
          {{ selectedPackageDetail.name }}
          <v-spacer />
          <v-chip size="small" color="secondary">
            v{{ selectedPackageDetail.version }}
          </v-chip>
        </v-card-title>

        <v-card-text>
          <div class="mb-4">
            <h4 class="text-subtitle-1 mb-2">描述</h4>
            <p class="text-body-2">{{ selectedPackageDetail.description }}</p>
          </div>

          <v-row>
            <v-col cols="6">
              <div class="mb-3">
                <h4 class="text-subtitle-2 mb-1">分类</h4>
                <v-chip size="small" color="secondary" variant="tonal">
                  {{ getSectionName(selectedPackageDetail.section) }}
                </v-chip>
              </div>
            </v-col>
            <v-col cols="6">
              <div class="mb-3">
                <h4 class="text-subtitle-2 mb-1">来源</h4>
                <v-chip size="small" color="info" variant="tonal">
                  {{ getFeedName(selectedPackageDetail.source || '') }}
                </v-chip>
              </div>
            </v-col>
          </v-row>

          <v-row>
            <v-col cols="6">
              <div class="mb-3">
                <h4 class="text-subtitle-2 mb-1">下载大小</h4>
                <span class="text-body-2">{{ formatSize(selectedPackageDetail.size) }}</span>
              </div>
            </v-col>
            <v-col cols="6">
              <div class="mb-3">
                <h4 class="text-subtitle-2 mb-1">安装大小</h4>
                <span class="text-body-2">{{ formatSize(selectedPackageDetail.installedSize || 0) }}</span>
              </div>
            </v-col>
          </v-row>

          <div v-if="selectedPackageDetail.depends?.length" class="mb-3">
            <h4 class="text-subtitle-2 mb-2">依赖</h4>
            <div class="d-flex flex-wrap gap-1">
              <v-chip
                v-for="dep in selectedPackageDetail.depends"
                :key="dep"
                size="x-small"
                variant="outlined"
              >
                {{ dep }}
              </v-chip>
            </div>
          </div>

          <div v-if="selectedPackageDetail.license" class="mb-3">
            <h4 class="text-subtitle-2 mb-1">许可证</h4>
            <span class="text-body-2">{{ selectedPackageDetail.license }}</span>
          </div>

          <div v-if="selectedPackageDetail.url" class="mb-3">
            <h4 class="text-subtitle-2 mb-1">主页</h4>
            <a :href="selectedPackageDetail.url" target="_blank" class="text-primary">
              {{ selectedPackageDetail.url }}
            </a>
          </div>
        </v-card-text>

        <v-card-actions>
          <v-btn
            v-if="packageStore.getPackageStatus(selectedPackageDetail.name) === 'none'"
            color="primary"
            prepend-icon="mdi-plus"
            @click="addPackage(selectedPackageDetail.name)"
          >
            添加
          </v-btn>
          <v-btn
            v-if="packageStore.getPackageStatus(selectedPackageDetail.name) === 'none'"
            color="error"
            prepend-icon="mdi-delete-forever"
            @click="markForRemoval(selectedPackageDetail.name)"
          >
            标记删除
          </v-btn>
          <v-btn
            v-else-if="packageStore.getPackageStatus(selectedPackageDetail.name) === 'selected'"
            color="warning"
            prepend-icon="mdi-minus"
            @click="removePackage(selectedPackageDetail.name)"
          >
            取消选择
          </v-btn>
          <v-btn
            v-if="packageStore.getPackageStatus(selectedPackageDetail.name) === 'selected'"
            color="error"
            prepend-icon="mdi-delete-forever"
            @click="markForRemoval(selectedPackageDetail.name)"
          >
            标记删除
          </v-btn>
          <v-btn
            v-else-if="packageStore.getPackageStatus(selectedPackageDetail.name) === 'removed'"
            color="success"
            prepend-icon="mdi-restore"
            @click="packageStore.removeRemovedPackage(selectedPackageDetail.name)"
          >
            恢复
          </v-btn>
          <v-spacer />
          <v-btn @click="closePackageDetail">关闭</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>

<style scoped>
.bg-primary-container {
  background-color: rgba(var(--v-theme-primary), 0.1);
}
</style>