// Configuration management store

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useFirmwareStore } from './firmware'
import { useModuleStore } from './module'
import { usePackageStore } from './package'
import { configManager } from '@/services/configManager'
import type { 
  SavedConfiguration, 
  ConfigurationSummary, 
  ImportResult,
  ExportOptions 
} from '@/types/config'

export const useConfigStore = defineStore('config', () => {
  // State
  const savedConfigurations = ref<ConfigurationSummary[]>([])
  const currentConfigId = ref<string>('')
  const currentConfigName = ref<string>('')
  const isLoading = ref(false)
  const error = ref<string>('')

  // Get other stores
  const firmwareStore = useFirmwareStore()
  const moduleStore = useModuleStore()
  const packageStore = usePackageStore()

  // Computed
  const hasCurrentConfig = computed(() => !!currentConfigId.value)
  const currentConfigSummary = computed(() => {
    return savedConfigurations.value.find(c => c.id === currentConfigId.value)
  })

  // Actions
  function loadSavedConfigurations() {
    try {
      savedConfigurations.value = configManager.getConfigurationSummaries()
    } catch (err) {
      error.value = '加载配置列表失败'
      console.error(err)
    }
  }

  // Global reference to get all current application state for configuration
  let getAllAppState: (() => any) | null = null
  
  function setAppStateGetter(getter: () => any) {
    getAllAppState = getter
  }

  async function saveCurrentConfiguration(name: string, description?: string): Promise<boolean> {
    if (!firmwareStore.selectedDevice || !firmwareStore.selectedProfile) {
      error.value = '请先选择设备'
      return false
    }

    isLoading.value = true
    error.value = ''

    try {
      // Create configuration object
      const config: SavedConfiguration = {
        id: currentConfigId.value || `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        name,
        description,
        version: '1.0.0',
        createdAt: currentConfigId.value ? currentConfigSummary.value?.createdAt || new Date() : new Date(),
        updatedAt: new Date(),
        
        // Device configuration
        device: {
          model: firmwareStore.selectedDevice.title, // Use title as key
          target: firmwareStore.selectedDevice.target,
          profile: firmwareStore.selectedProfile.id,
          version: firmwareStore.currentVersion || 'latest'
        },

        // Custom build configuration  
        customBuild: getAllAppState ? getAllAppState().customBuild : {
          packages: [],
          repositories: [],
          repositoryKeys: []
        },

        // Module configuration
        modules: {
          sources: moduleStore.sources.map(source => ({
            id: source.id,
            name: source.name,
            url: source.url,
            ref: source.ref,
            resolvedSHA: source.resolvedSHA
          })),
          selections: moduleStore.selections.map(selection => ({
            sourceId: selection.sourceId,
            moduleId: selection.moduleId,
            parameters: { ...selection.parameters },
            userDownloads: { ...selection.userDownloads }
          }))
        }
      }

      const success = configManager.saveConfiguration(config)
      if (success) {
        currentConfigId.value = config.id
        currentConfigName.value = config.name
        loadSavedConfigurations()
        return true
      } else {
        error.value = '保存配置失败'
        return false
      }
    } catch (err) {
      error.value = '保存配置时出错'
      console.error(err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  // Function to apply configuration to application
  let applyAppState: ((config: any) => void) | null = null
  
  function setAppStateApplier(applier: (config: any) => void) {
    applyAppState = applier
  }

  async function loadConfiguration(id: string): Promise<boolean> {
    isLoading.value = true
    error.value = ''

    try {
      const config = configManager.loadConfiguration(id)
      if (!config) {
        error.value = '配置不存在'
        return false
      }

      // Apply device configuration
      await firmwareStore.changeVersion(config.device.version)
      
      // Wait for devices to actually load with proper retry mechanism
      let retries = 0
      const maxRetries = 50 // 5 seconds max wait
      while (Object.keys(firmwareStore.devices).length === 0 && retries < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 100))
        retries++
      }

      if (Object.keys(firmwareStore.devices).length === 0) {
        error.value = '设备列表加载失败，请重试'
        return false
      }

      const device = firmwareStore.devices[config.device.model]
      if (device) {
        await firmwareStore.selectDevice(config.device.model)
        
        // Wait for profile to be fully loaded
        let profileRetries = 0
        const maxProfileRetries = 50
        while (!firmwareStore.selectedProfile && profileRetries < maxProfileRetries) {
          await new Promise(resolve => setTimeout(resolve, 100))
          profileRetries++
        }
        
        // Load package feeds if not loaded and profile is available
        if (packageStore.totalPackages === 0 && firmwareStore.selectedProfile && firmwareStore.selectedProfile.arch_packages) {
          // Use arch_packages from profile data
          await packageStore.loadPackagesForDevice(
            config.device.version,
            firmwareStore.selectedProfile.arch_packages,
            config.device.target
          )
        }
      } else {
        error.value = `未找到设备: ${config.device.model}，可能版本不匹配或设备已下线`
        return false
      }

      // Apply module sources
      moduleStore.sources = []
      moduleStore.selections = []
      
      for (const sourceConfig of config.modules.sources) {
        try {
          await moduleStore.addModuleSource(
            sourceConfig.url,
            sourceConfig.name,
            sourceConfig.ref
          )
        } catch (err) {
          console.warn(`Failed to load module source: ${sourceConfig.name}`, err)
        }
      }

      // Wait for sources to load, then apply selections
      await new Promise(resolve => setTimeout(resolve, 500))
      
      for (const selectionConfig of config.modules.selections) {
        try {
          moduleStore.selectModule(selectionConfig.sourceId, selectionConfig.moduleId)
          
          // Apply parameters
          for (const [key, value] of Object.entries(selectionConfig.parameters)) {
            moduleStore.updateModuleParameter(
              selectionConfig.sourceId,
              selectionConfig.moduleId,
              key,
              value
            )
          }

          // Apply user downloads
          for (const [name, url] of Object.entries(selectionConfig.userDownloads)) {
            moduleStore.updateUserDownload(
              selectionConfig.sourceId,
              selectionConfig.moduleId,
              name,
              url
            )
          }
        } catch (err) {
          console.warn(`Failed to apply module selection: ${selectionConfig.moduleId}`, err)
        }
      }

      // Apply full configuration to application (wait for package feeds to load)
      if (applyAppState) {
        // Wait for package feeds to finish loading before applying package selections
        let retries = 0
        const maxRetries = 100 // 10 seconds max wait
        
        // Wait for package loading to complete AND packages to be actually loaded
        while ((packageStore.isLoading || packageStore.totalPackages === 0) && retries < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 100))
          retries++
        }
        
        // Apply configuration after packages are loaded
        applyAppState(config)
      }

      currentConfigId.value = config.id
      currentConfigName.value = config.name
      
      // Set as last used configuration
      configManager.setLastUsedConfigId(config.id)

      return true
    } catch (err) {
      error.value = '加载配置失败'
      console.error(err)
      return false
    } finally {
      isLoading.value = false
    }
  }

  function deleteConfiguration(id: string): boolean {
    try {
      const success = configManager.deleteConfiguration(id)
      if (success) {
        if (currentConfigId.value === id) {
          currentConfigId.value = ''
          currentConfigName.value = ''
        }
        loadSavedConfigurations()
        
        // Auto-load next most recent config if available
        const configs = savedConfigurations.value
        if (configs.length > 0) {
          const nextConfig = configs.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())[0]
          loadConfiguration(nextConfig.id)
        }
      }
      return success
    } catch (err) {
      error.value = '删除配置失败'
      console.error(err)
      return false
    }
  }

  function exportConfiguration(id: string, options?: ExportOptions): void {
    try {
      const config = configManager.loadConfiguration(id)
      if (config) {
        configManager.downloadConfiguration(config, options)
      } else {
        error.value = '配置不存在'
      }
    } catch (err) {
      error.value = '导出配置失败'
      console.error(err)
    }
  }

  function importConfiguration(content: string, format?: 'json' | 'yaml'): ImportResult {
    try {
      const result = configManager.importConfiguration(content, format)
      if (result.success && result.config) {
        // Save imported configuration
        configManager.saveConfiguration(result.config)
        loadSavedConfigurations()
      }
      return result
    } catch (err) {
      return {
        success: false,
        message: '导入配置失败'
      }
    }
  }

  function newConfiguration(): void {
    currentConfigId.value = ''
    currentConfigName.value = ''
    // Clear last used configuration when creating new one
    configManager.clearLastUsedConfigId()
  }

  function clearError(): void {
    error.value = ''
  }

  // Auto-load last used configuration on startup
  async function autoLoadLastConfig(): Promise<void> {
    const lastConfigId = configManager.getLastUsedConfigId()
    if (lastConfigId) {
      const config = configManager.loadConfiguration(lastConfigId)
      if (config) {
        await loadConfiguration(lastConfigId)
      } else {
        // Config was deleted, clear the reference
        configManager.clearLastUsedConfigId()
      }
    }
  }

  // Initialize
  loadSavedConfigurations()
  // Auto-load last config after a short delay to ensure other stores are initialized
  setTimeout(autoLoadLastConfig, 100)

  return {
    // State
    savedConfigurations,
    currentConfigId,
    currentConfigName,
    isLoading,
    error,

    // Computed
    hasCurrentConfig,
    currentConfigSummary,

    // Actions
    loadSavedConfigurations,
    saveCurrentConfiguration,
    loadConfiguration,
    deleteConfiguration,
    exportConfiguration,
    importConfiguration,
    newConfiguration,
    clearError,
    setAppStateGetter,
    setAppStateApplier,
    autoLoadLastConfig
  }
})