<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useFirmwareStore } from '@/stores/firmware'
import { useModuleStore } from '@/stores/module'
import { useConfigStore } from '@/stores/config'
import { usePackageStore } from '@/stores/package'
import { config } from '@/config'
import FirmwareSelector from '@/components/FirmwareSelector.vue'
import ConfigurationManager from '@/components/ConfigurationManager.vue'
import type { SavedConfiguration } from '@/types/config'

const i18nStore = useI18nStore()
const firmwareStore = useFirmwareStore()
const moduleStore = useModuleStore()
const configStore = useConfigStore()
const packageStore = usePackageStore()

// Configuration Manager state
const showConfigManager = ref(false)

// Store reference to CustomBuild component for accessing form data
const customBuildRef = ref<any>(null)

// Global app state management for configuration system
function getAllAppState() {
  // Get current CustomBuild form data if available
  const customBuildData = customBuildRef.value?.getCurrentCustomBuildConfig?.() || {
    packages: packageStore.buildPackagesList || [], // Directly access package store
    repositories: [],
    repositoryKeys: []
  }

  return {
    customBuild: customBuildData
  }
}

function applyAppState(config: SavedConfiguration) {
  // Apply custom build configuration directly via stores
  if (config.customBuild) {
    // Apply package selections directly to package store
    if (config.customBuild.packages) {
      packageStore.setSelectedPackages(config.customBuild.packages)
    }
    
    // If CustomBuild component is available, also apply other settings
    if (customBuildRef.value?.applyCustomBuildConfig) {
      customBuildRef.value.applyCustomBuildConfig(config.customBuild)
    }
  }
}

onMounted(async () => {
  // Register global app state handlers for configuration system
  configStore.setAppStateGetter(getAllAppState)
  configStore.setAppStateApplier(applyAppState)

  // Initialize translation
  const lang = i18nStore.detectLanguage()
  await i18nStore.loadTranslation(lang)
  
  // Initialize firmware data
  await firmwareStore.loadVersions()
  if (firmwareStore.currentVersion) {
    await firmwareStore.loadDevices(firmwareStore.currentVersion)
  }
})
</script>

<template>
  <v-app>
    <v-app-bar elevation="2" color="primary" theme="dark">
      <div class="d-flex align-center w-100">
        <a :href="config.homepage_url" target="_blank" rel="noopener noreferrer">
          <img
            src="/logo.svg"
            :alt="`${config.brand_name} Logo`"
            width="180"
            height="40"
            class="mr-4"
            style="cursor: pointer;"
          />
        </a>
        
        <v-spacer />
        
        <div class="d-flex align-center">
          <!-- Configuration Manager Button -->
          <v-btn
            icon="mdi-cog-box"
            variant="text"
            class="mr-2"
            @click="showConfigManager = !showConfigManager"
          />
          
          <v-select
            v-model="i18nStore.currentLanguage"
            :items="i18nStore.supportedLanguages"
            item-title="name"
            item-value="code"
            density="compact"
            variant="outlined"
            hide-details
            style="min-width: 200px"
            @update:model-value="i18nStore.changeLanguage"
            class="mr-2"
          >
            <template #selection="{ item }">
              {{ item.raw.name.replace(/ \(.*/, '') }}
            </template>
          </v-select>
        </div>
      </div>
    </v-app-bar>

    <v-main>
      <v-container>
        <!-- Configuration Manager -->
        <div v-if="showConfigManager" class="mb-6">
          <ConfigurationManager />
        </div>

        <!-- Alert -->
        <v-alert
          v-if="firmwareStore.alertMessage"
          type="error"
          dismissible
          @click:close="firmwareStore.clearAlert"
          class="mb-4"
        >
          {{ firmwareStore.alertMessage }}
        </v-alert>

        <!-- Current Config Display -->
        <v-alert
          v-if="configStore.currentConfigName"
          type="info"
          variant="tonal"
          class="mb-4"
        >
          <template #prepend>
            <v-icon icon="mdi-information" />
          </template>
          当前配置: <strong>{{ configStore.currentConfigName }}</strong>
          <template #append>
            <v-btn
              size="small"
              variant="text"
              @click="configStore.newConfiguration"
            >
              新建配置
            </v-btn>
          </template>
        </v-alert>

        <FirmwareSelector :custom-build-ref="customBuildRef" />
      </v-container>
    </v-main>
  </v-app>
</template>
