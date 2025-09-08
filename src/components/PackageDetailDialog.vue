<script setup lang="ts">
import { ref, defineAsyncComponent } from 'vue'
import { packageManager } from '@/services/packageManager'
import { usePackageStore } from '@/stores/package'
import type { OpenWrtPackage } from '@/types/package'

const packageStore = usePackageStore()

// Async component to avoid circular dependency
const AsyncPackageDetailDialog = defineAsyncComponent(() => import('./PackageDetailDialog.vue'))

// Props
defineProps<{
  modelValue: boolean
  packageDetail: OpenWrtPackage | null
}>()

// Emits
const emit = defineEmits<{
  'update:modelValue': [value: boolean]
  'show-dependency': [packageName: string]
}>()

// State for nested dependency dialog
const showDependencyDetail = ref(false)
const selectedDependencyDetail = ref<OpenWrtPackage | null>(null)

function closeDialog() {
  emit('update:modelValue', false)
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

function showDependencyDetails(dependencyName: string) {
  const packageInfo = packageStore.getPackageInfo(dependencyName)
  if (packageInfo) {
    selectedDependencyDetail.value = packageInfo
    showDependencyDetail.value = true
  }
}

function closeDependencyDetail() {
  showDependencyDetail.value = false
  selectedDependencyDetail.value = null
}
</script>

<template>
  <v-dialog :model-value="modelValue" @update:model-value="emit('update:modelValue', $event)" max-width="600px" scrollable>
    <v-card v-if="packageDetail">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-package-variant" class="mr-2" />
        {{ packageDetail.name }}
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          size="small"
          @click="closeDialog"
        />
      </v-card-title>

      <v-card-text>
        <div class="mb-4">
          <h4 class="text-subtitle-1 mb-2">描述</h4>
          <p class="text-body-2">{{ packageDetail.description }}</p>
        </div>

        <!-- 第一行：版本 + 许可证 -->
        <v-row>
          <v-col cols="6">
            <div class="mb-3">
              <h4 class="text-subtitle-2 mb-1">版本</h4>
              <v-chip size="small" color="primary" variant="tonal">
                v{{ packageDetail.version }}
              </v-chip>
            </div>
          </v-col>
          <v-col cols="6">
            <div class="mb-3">
              <h4 class="text-subtitle-2 mb-1">许可证</h4>
              <span class="text-body-2">{{ packageDetail.license || '未知' }}</span>
            </div>
          </v-col>
        </v-row>

        <!-- 第二行：分类 + 来源 -->
        <v-row>
          <v-col cols="6">
            <div class="mb-3">
              <h4 class="text-subtitle-2 mb-1">分类</h4>
              <v-chip size="small" color="secondary" variant="tonal">
                {{ getSectionName(packageDetail.section) }}
              </v-chip>
            </div>
          </v-col>
          <v-col cols="6">
            <div class="mb-3">
              <h4 class="text-subtitle-2 mb-1">来源</h4>
              <v-chip size="small" color="info" variant="tonal">
                {{ getFeedName(packageDetail.source || '') }}
              </v-chip>
            </div>
          </v-col>
        </v-row>

        <!-- 第三行：下载大小 + 安装大小 -->
        <v-row>
          <v-col cols="6">
            <div class="mb-3">
              <h4 class="text-subtitle-2 mb-1">下载大小</h4>
              <span class="text-body-2">{{ formatSize(packageDetail.size) }}</span>
            </div>
          </v-col>
          <v-col cols="6">
            <div class="mb-3">
              <h4 class="text-subtitle-2 mb-1">安装大小</h4>
              <span class="text-body-2">{{ formatSize(packageDetail.installedSize || 0) }}</span>
            </div>
          </v-col>
        </v-row>

        <!-- 主页链接 -->
        <div v-if="packageDetail.url" class="mb-3">
          <h4 class="text-subtitle-2 mb-1">主页</h4>
          <a :href="packageDetail.url" target="_blank" class="text-primary">
            {{ packageDetail.url }}
          </a>
        </div>

        <!-- 最后一行：依赖 -->
        <div v-if="packageDetail.depends?.length" class="mb-3">
          <h4 class="text-subtitle-2 mb-2">依赖</h4>
          <div class="d-flex flex-wrap">
            <v-chip
              v-for="dep in packageDetail.depends"
              :key="dep"
              size="x-small"
              variant="outlined"
              class="ma-1"
              :color="packageStore.getPackageInfo(dep) ? 'primary' : 'default'"
              :style="packageStore.getPackageInfo(dep) ? 'cursor: pointer' : ''"
              @click="packageStore.getPackageInfo(dep) ? showDependencyDetails(dep) : null"
            >
              <v-icon 
                v-if="packageStore.getPackageInfo(dep)" 
                size="x-small" 
                class="mr-1"
              >
                mdi-information-outline
              </v-icon>
              {{ dep }}
            </v-chip>
          </div>
        </div>
      </v-card-text>

    </v-card>
  </v-dialog>

  <!-- Nested Dependency Detail Dialog -->
  <AsyncPackageDetailDialog 
    v-if="showDependencyDetail"
    v-model="showDependencyDetail"
    :package-detail="selectedDependencyDetail"
  />
</template>