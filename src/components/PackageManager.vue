<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { usePackageStore } from '@/stores/package'
import { useFirmwareStore } from '@/stores/firmware'
import { packageManager } from '@/services/packageManager'
import type { OpenWrtPackage } from '@/types/package'
import PackageDetailDialog from './PackageDetailDialog.vue'

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

// Use a Map to cache package status to avoid repeated calculations
const packageStatusCache = ref(new Map<string, string>())

// Computed with optimized caching
const displayPackages = computed(() => {
  const packages = packageStore.filteredPackages.slice(0, 50)
  
  // Update cache only for visible packages
  packages.forEach(pkg => {
    if (!packageStatusCache.value.has(pkg.name)) {
      packageStatusCache.value.set(pkg.name, packageStore.getPackageStatus(pkg.name))
    }
  })
  
  return packages
})

// More granular cache invalidation - only clear cache for changed packages
watch(() => packageStore.selectedPackagesList, (newSelected, oldSelected) => {
  if (oldSelected) {
    // Find packages that were added or removed
    const added = newSelected.filter(pkg => !oldSelected.includes(pkg))
    const removed = oldSelected.filter(pkg => !newSelected.includes(pkg))
    
    // Only clear cache for changed packages
    const changedPackages = [...added, ...removed]
    changedPackages.forEach(pkg => {
      packageStatusCache.value.delete(pkg)
    })
  } else {
    // First time, clear all cache
    packageStatusCache.value.clear()
  }
})

watch(() => packageStore.removedPackagesList, (newRemoved, oldRemoved) => {
  if (oldRemoved) {
    // Find packages that were added or removed from removed list
    const added = newRemoved.filter(pkg => !oldRemoved.includes(pkg))
    const removed = oldRemoved.filter(pkg => !newRemoved.includes(pkg))
    
    // Only clear cache for changed packages
    const changedPackages = [...added, ...removed]
    changedPackages.forEach(pkg => {
      packageStatusCache.value.delete(pkg)
    })
  } else {
    // First time, clear all cache
    packageStatusCache.value.clear()
  }
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
  // 选中 profile 后一定有 arch_packages
  if (firmwareStore.selectedProfile) {
    return firmwareStore.selectedProfile.arch_packages
  }
  // 未选中 profile 时提示
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

// Optimized functions using cache
function getCachedPackageStatus(packageName: string): string {
  if (!packageStatusCache.value.has(packageName)) {
    packageStatusCache.value.set(packageName, packageStore.getPackageStatus(packageName))
  }
  return packageStatusCache.value.get(packageName)!
}

function getPackageIcon(packageName: string): string {
  const status = getCachedPackageStatus(packageName)
  switch (status) {
    case 'selected': return 'mdi-check-circle'
    case 'removed': return 'mdi-package-variant-remove'
    case 'default': return 'mdi-package-variant'
    default: return 'mdi-package-variant-plus'
  }
}

function getPackageColor(packageName: string): string {
  const status = getCachedPackageStatus(packageName)
  switch (status) {
    case 'selected': return 'primary'
    case 'removed': return 'error'
    case 'default': return 'secondary'
    default: return 'grey'
  }
}

function getPackageBackgroundClass(packageName: string): string {
  const status = getCachedPackageStatus(packageName)
  switch (status) {
    case 'selected': return 'bg-primary-container'
    case 'removed': return 'bg-error-container'
    case 'default': return 'bg-secondary-container'
    default: return ''
  }
}

// Note: Package loading is triggered by FirmwareSelector after device selection
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
        <div class="mb-4">
          <div class="d-flex align-center justify-space-between mb-3">
            <div class="text-subtitle-2 text-medium-emphasis">
              软件包摘要
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
          
          <!-- Package count info in rows for better mobile layout -->
          <v-row dense>
            <v-col cols="6" sm="3">
              <v-chip color="primary" variant="tonal" size="small" class="w-100 justify-center">
                已选择 {{ packageStore.selectedPackagesList.length }} 个
              </v-chip>
            </v-col>
            <v-col cols="6" sm="3" v-if="packageStore.removedPackagesList.length > 0">
              <v-chip color="error" variant="tonal" size="small" class="w-100 justify-center">
                移除 {{ packageStore.removedPackagesList.length }} 个
              </v-chip>
            </v-col>
            <v-col cols="6" sm="3">
              <v-chip color="info" variant="tonal" size="small" class="w-100 justify-center">
                下载: {{ formatSize(totalSize.downloadSize) }}
              </v-chip>
            </v-col>
            <v-col cols="6" sm="3">
              <v-chip color="warning" variant="tonal" size="small" class="w-100 justify-center">
                安装: {{ formatSize(totalSize.installedSize) }}
              </v-chip>
            </v-col>
          </v-row>
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
                    @click="showPackageDetails(packageStore.getPackageInfo(packageName) || null)"
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
                    @click="showPackageDetails(packageStore.getPackageInfo(packageName) || null)"
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
          <v-btn
            icon="mdi-close"
            variant="text"
            size="small"
            @click="closeAddDialog"
          />
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
            <!-- Package info bar -->
            <v-alert
              variant="tonal"
              color="info"
              class="mb-4"
              :icon="false"
            >
              <div class="d-flex align-center">
                <v-icon icon="mdi-information" size="small" class="mr-2" />
                <span class="text-body-2">
                  共加载 <strong>{{ packageStore.totalPackages }}</strong> 个软件包
                </span>
                <v-spacer />
                <v-chip size="small" variant="text" color="info">
                  来自 {{ packageStore.packageSources.length }} 个软件源
                </v-chip>
              </div>
            </v-alert>

            <!-- Search and filters with responsive layout -->
            <v-row class="mb-4">
              <!-- Search field - full width on mobile, main width on desktop -->
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="searchInput"
                  label="搜索软件包"
                  placeholder="输入软件包名称或描述..."
                  prepend-inner-icon="mdi-magnify"
                  variant="outlined"
                  density="compact"
                  clearable
                />
              </v-col>
              
              <!-- Filters - half width each on mobile, smaller on desktop -->
              <v-col cols="6" md="3">
                <v-select
                  v-model="packageStore.selectedSection"
                  :items="[{ title: '全部分类', value: '' }, ...packageStore.packageSections.map(s => ({ title: getSectionName(s), value: s }))]"
                  label="分类"
                  variant="outlined"
                  density="compact"
                />
              </v-col>
              
              <v-col cols="6" md="3">
                <v-select
                  v-model="packageStore.selectedSource"
                  :items="[{ title: '全部来源', value: '' }, ...packageStore.packageSources.map(s => ({ title: getFeedName(s), value: s }))]"
                  label="来源"
                  variant="outlined"
                  density="compact"
                />
              </v-col>
            </v-row>

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
                :class="getPackageBackgroundClass(pkg.name)"
              >
                <template #prepend>
                  <v-icon 
                    :icon="getPackageIcon(pkg.name)"
                    :color="getPackageColor(pkg.name)"
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

      </v-card>
    </v-dialog>

    <!-- Package Detail Dialog -->
    <PackageDetailDialog 
      v-model="showPackageDetail"
      :package-detail="selectedPackageDetail"
    />
  </v-card>
</template>

<style scoped>
.bg-primary-container {
  background-color: rgba(var(--v-theme-primary), 0.1);
}
</style>
