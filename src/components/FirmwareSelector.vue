<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useFirmwareStore } from '@/stores/firmware'
import { usePackageStore } from '@/stores/package'
import { config } from '@/config'
import DeviceSelector from './DeviceSelector.vue'
import DeviceDetails from './DeviceDetails.vue'

// Props
const props = defineProps<{
  customBuildRef?: any
}>()

const i18n = useI18nStore()
const firmware = useFirmwareStore()
const packageStore = usePackageStore()

const selectedModel = ref('')

async function loadProfileForModel(model: string) {
  if (!model) return

  await firmware.selectDevice(model)

  if (firmware.selectedProfile && firmware.currentVersion && firmware.selectedDevice?.target) {
    const arch = firmware.selectedProfile.arch_packages
    await packageStore.loadPackagesForDevice(
      firmware.currentVersion,
      arch,
      firmware.selectedDevice.target
    )
  }
}

// Watch for version changes
watch(
  () => firmware.currentVersion,
  async (newVersion, oldVersion) => {
    if (!newVersion || newVersion === oldVersion) return

    const currentModel = selectedModel.value

    await firmware.changeVersion(newVersion)

    if (currentModel) {
      packageStore.clearAllPackages()
      await loadProfileForModel(currentModel)
    }
  }
)

// Watch for model selection
watch(selectedModel, async (newModel, oldModel) => {
  if (newModel) {
    // Clear package selections when switching devices to avoid architecture conflicts
    if (oldModel && oldModel !== newModel) {
      packageStore.clearAllPackages()
    }

    await loadProfileForModel(newModel)
  } else {
    firmware.selectedDevice = null
    firmware.selectedProfile = null
  }
})

// Watch for firmware store changes to sync selectedModel
watch(() => firmware.selectedDevice, (newDevice) => {
  const newTitle = newDevice?.title || ''
  if (selectedModel.value !== newTitle) {
    selectedModel.value = newTitle
  }
}, { immediate: true })

const sortedVersions = computed(() => {
  return [...firmware.versions].sort((b, a) =>
    (a + (a.indexOf("-") < 0 ? "-Z" : "")).localeCompare(
      b + (b.indexOf("-") < 0 ? "-Z" : ""),
      undefined,
      { numeric: true }
    )
  )
})
</script>

<template>
  <div>
    <!-- Title and Description -->
    <v-row class="mb-6">
      <v-col cols="12">
        <h1 class="text-h4 mb-3">
          {{ i18n.t('tr-load', 'Download OpenWrt firmware for your device').replace('OpenWrt', config.brand_name) }}
        </h1>
        <p class="text-body-1 text-medium-emphasis">
          {{ i18n.t('tr-message', '输入设备的名称或型号，然后选择一个稳定或快照版本。') }}
        </p>
      </v-col>
    </v-row>

    <!-- Device and Version Selection -->
    <v-row class="mb-6">
      <v-col cols="12" md="8">
        <DeviceSelector v-model="selectedModel" />
      </v-col>
      <v-col cols="12" md="4">
        <v-select
          v-model="firmware.currentVersion"
          :items="sortedVersions"
          :label="i18n.t('tr-version', '版本')"
          variant="outlined"
          density="comfortable"
          :loading="firmware.isLoadingVersions"
        >
          <template #item="{ item, props }">
            <v-list-item v-bind="props" :title="item.raw === 'latest' ? i18n.t('tr-latest-releases', '最新') : item.raw">
            </v-list-item>
          </template>
          <template #selection="{ item }">
            {{ item.raw === 'latest' ? i18n.t('tr-latest-releases', '最新') : item.raw }}
          </template>
        </v-select>
      </v-col>
    </v-row>

    <!-- No Model Found Message -->
    <v-alert
      v-if="selectedModel && !firmware.selectedDevice && !firmware.isLoadingProfile"
      type="info"
      variant="tonal"
      class="mb-6"
    >
      {{ i18n.t('tr-not-found', '未找到型号！') }}
    </v-alert>

    <!-- Device Details -->
    <DeviceDetails 
      v-if="firmware.selectedDevice && firmware.selectedProfile" 
      :custom-build-ref="props.customBuildRef"
    />

    <!-- Footer -->
    <v-row class="mt-8">
      <v-col cols="12" class="text-center">
        <div class="text-body-2 text-medium-emphasis">
          <a 
            href="https://downloads.openwrt.org" 
            class="text-decoration-none"
            target="_blank"
          >
            {{ i18n.t('tr-server-link', '所有文件') }}
          </a>
          |
          <a 
            href="https://forum.openwrt.org/t/the-openwrt-firmware-selector/81721"
            class="text-decoration-none"
            target="_blank"
          >
            {{ i18n.t('tr-feedback-link', '反馈') }}
          </a>
          |
          <a 
            href="https://github.com/openwrt/firmware-selector-openwrt-org/"
            class="text-decoration-none"
            target="_blank"
          >
            OFS 0.0.0
          </a>
        </div>
      </v-col>
    </v-row>
  </div>
</template>
