<script setup lang="ts">
import { ref, computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useFirmwareStore } from '@/stores/firmware'
import DownloadSection from './DownloadSection.vue'
import CustomBuild from './CustomBuild.vue'
import type { AsuBuildResponse } from '@/services/asu'

// Props
const props = defineProps<{
  customBuildRef?: any
}>()

const i18n = useI18nStore()
const firmware = useFirmwareStore()

// Build state management
const isBuilding = ref(false)
const buildResult = ref<(AsuBuildResponse & { asu_image_url: string }) | null>(null)

const deviceTitles = computed(() => {
  if (!firmware.selectedProfile?.titles) return ''
  return firmware.selectedProfile.titles.map((title: any) => {
    if (title.title) {
      return title.title
    } else {
      return (
        (title.vendor || '') +
        ' ' +
        (title.model || '') +
        ' ' +
        (title.variant || '')
      ).trim()
    }
  }).join(' / ')
})

const infoUrl = computed(() => {
  if (!firmware.selectedDevice) return '#'
  const baseUrl = 'https://openwrt.org/start?do=search&id=toh&q={title} @toh'
  return baseUrl.replace('{title}', encodeURI(firmware.selectedDevice.title))
})

const deviceUrl = computed(() => {
  if (!firmware.selectedDevice || !firmware.selectedProfile) return '#'
  const base = window.location.href.split('?')[0]
  return `${base}?version=${encodeURIComponent(firmware.selectedProfile.version_number)}&target=${encodeURIComponent(firmware.selectedDevice.target)}&id=${encodeURIComponent(firmware.selectedDevice.id)}`
})

const imageFolder = computed(() => firmware.getImageFolder())

// Build event handlers
function onBuildStart() {
  isBuilding.value = true
  buildResult.value = null
}

function onBuildSuccess(result: AsuBuildResponse & { asu_image_url: string }) {
  isBuilding.value = false
  buildResult.value = result
}

function onBuildError(error: string) {
  isBuilding.value = false
  buildResult.value = null
}

function onBuildReset() {
  isBuilding.value = false
  buildResult.value = null
}
</script>

<template>
  <v-card v-if="firmware.selectedProfile" class="mb-6">
    <v-card-title class="bg-primary text-white">
      {{ i18n.t('tr-version-build', '关于此构建') }}
    </v-card-title>
    
    <v-card-text class="pa-6">
      <v-row dense>
        <v-col cols="12" sm="6" md="4">
          <div class="text-subtitle2 text-medium-emphasis mb-1">
            {{ i18n.t('tr-model', '型号') }}
          </div>
          <div class="text-body-1">{{ deviceTitles }}</div>
        </v-col>
        
        <v-col cols="12" sm="6" md="4">
          <div class="text-subtitle2 text-medium-emphasis mb-1">
            {{ i18n.t('tr-target', '平台') }}
          </div>
          <div class="text-body-1">{{ firmware.selectedDevice?.target }}</div>
        </v-col>
        
        <v-col cols="12" sm="6" md="4">
          <div class="text-subtitle2 text-medium-emphasis mb-1">
            {{ i18n.t('tr-version', '版本') }}
          </div>
          <div class="text-body-1">
            {{ firmware.selectedProfile.version_number }} 
            ({{ firmware.selectedProfile.version_code }})
          </div>
        </v-col>
      </v-row>
      
      <v-row class="mt-4" dense>
        <v-col cols="12">
          <div class="text-subtitle2 text-medium-emphasis mb-2">
            {{ i18n.t('tr-links', '链接') }}
          </div>
          <div class="d-flex flex-wrap">
            <v-btn
              :href="imageFolder"
              target="_blank"
              variant="outlined"
              size="small"
              prepend-icon="mdi-folder-open"
              class="mr-3"
            >
              Folder
            </v-btn>
            
            <v-btn
              :href="infoUrl"
              target="_blank"
              variant="outlined"
              size="small"
              prepend-icon="mdi-information"
              class="mr-3"
            >
              Info
            </v-btn>
            
            <v-btn
              :href="deviceUrl"
              variant="outlined"
              size="small"
              prepend-icon="mdi-link"
            >
              Link
            </v-btn>
          </div>
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>

  <!-- Custom Build Section -->
  <CustomBuild 
    v-if="firmware.selectedProfile" 
    :ref="props.customBuildRef"
    class="mb-8"
    @build-start="onBuildStart"
    @build-success="onBuildSuccess"
    @build-error="onBuildError"
    @build-reset="onBuildReset"
  />

  <!-- Download Section -->
  <DownloadSection 
    v-if="firmware.selectedProfile && !isBuilding" 
    :build-result="buildResult"
    class="mt-8"
  />
</template>