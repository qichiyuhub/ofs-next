<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useFirmwareStore } from '@/stores/firmware'
import { useConfigStore } from '@/stores/config'
import { usePackageStore } from '@/stores/package'
import { config } from '@/config'
import FirmwareSelector from '@/components/FirmwareSelector.vue'
import ConfigurationManager from '@/components/ConfigurationManager.vue'
import type { SavedConfiguration } from '@/types/config'

const i18nStore = useI18nStore()
const firmwareStore = useFirmwareStore()
const configStore = useConfigStore()
const packageStore = usePackageStore()

const initialSharedConfigParam = typeof window !== 'undefined'
  ? new URL(window.location.href).searchParams.get('config')
  : null

if (initialSharedConfigParam) {
  configStore.disableAutoLoad()
}

// Configuration Manager state
const showConfigManager = ref(false)

// Store reference to CustomBuild component for accessing form data  
const customBuildRef = ref<{
  getCurrentCustomBuildConfig?: () => {
    packageConfiguration: { addedPackages: string[]; removedPackages: string[] };
    repositories: Array<{ name: string; url: string; }>;
    repositoryKeys: string[];
  };
  applyCustomBuildConfig?: (config: {
    packageConfiguration: { addedPackages: string[]; removedPackages: string[] };
    repositories: Array<{ name: string; url: string; }>;
    repositoryKeys: string[];
  }) => void;
} | null>(null)

// Global app state management for configuration system
function getAllAppState() {
  // Get current CustomBuild form data if available
  const customBuildData = customBuildRef.value?.getCurrentCustomBuildConfig?.() || {
    // 使用新的配置结构，只保存用户的增量操作
    packageConfiguration: packageStore.getPackageConfiguration(),
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
    // 使用新的配置结构
    if (config.customBuild.packageConfiguration) {
      packageStore.setPackageConfiguration(config.customBuild.packageConfiguration)
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

  if (initialSharedConfigParam) {
    const success = await configStore.loadSharedConfiguration(initialSharedConfigParam)
    configStore.enableAutoLoad()
    if (!success) {
      await configStore.autoLoadLastConfig(true)
    }
  }
})
</script>

<template>
  <v-app>
    <v-app-bar elevation="2" color="primary">
      <div class="d-flex align-center w-100">
        <!-- Logo - responsive sizing -->
        <a :href="config.homepage_url" target="_blank" rel="noopener noreferrer">
          <img
            src="/logo.svg"
            :alt="`${config.brand_name} Logo`"
            :width="$vuetify.display.mobile ? 140 : 180"
            :height="$vuetify.display.mobile ? 30 : 40"
            class="mr-2 mr-sm-4"
            style="cursor: pointer;"
          />
        </a>
        
        <v-spacer />
        
        <!-- Desktop controls -->
        <div v-if="!$vuetify.display.mobile" class="d-flex align-center">
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
        
        <!-- Mobile controls -->
        <div v-else class="d-flex align-center">
          <!-- Configuration Manager Button -->
          <v-btn
            icon="mdi-cog-box"
            variant="text"
            class="mr-1"
            @click="showConfigManager = !showConfigManager"
          />
          
          <!-- Language switch with icon -->
          <v-menu>
            <template v-slot:activator="{ props }">
              <v-btn
                icon="mdi-translate"
                variant="text"
                v-bind="props"
              />
            </template>
            <v-list density="compact">
              <v-list-item
                v-for="lang in i18nStore.supportedLanguages"
                :key="lang.code"
                @click="i18nStore.changeLanguage(lang.code)"
                :class="{ 'v-list-item--active': i18nStore.currentLanguage === lang.code }"
              >
                <v-list-item-title>{{ lang.name.replace(/ \(.*/, '') }}</v-list-item-title>
                <template #append>
                  <v-icon v-if="i18nStore.currentLanguage === lang.code" icon="mdi-check" color="primary" />
                </template>
              </v-list-item>
            </v-list>
          </v-menu>
        </div>
      </div>
    </v-app-bar>

    <v-main>
      <v-container 
        :class="$vuetify.display.mobile ? 'pa-3' : 'pa-6'"
        style="max-width: 1100px; margin: 0 auto;"
      >
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
