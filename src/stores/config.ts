// Configuration management store

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useFirmwareStore } from './firmware'
import { useModuleStore } from './module'
import { usePackageStore } from './package'
import { configManager } from '@/services/configManager'
import { config } from '@/config'
import type { 
  SavedConfiguration, 
  ConfigurationSummary, 
  ImportResult,
  ExportOptions 
} from '@/types/config'

// Helper function to wait for a condition with reactive state
function waitForCondition(conditionFn: () => boolean, timeout = 5000): Promise<boolean> {
  return new Promise(resolve => {
    if (conditionFn()) {
      resolve(true)
      return
    }
    
    const interval = setInterval(() => {
      if (conditionFn()) {
        clearInterval(interval)
        resolve(true)
      }
    }, 100)
    
    setTimeout(() => {
      clearInterval(interval)
      resolve(false)
    }, timeout)
  })
}

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
  let getAllAppState: (() => { customBuild: unknown }) | null = null
  
  function setAppStateGetter(getter: () => { customBuild: unknown }) {
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
      const configData: SavedConfiguration = {
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
        customBuild: getAllAppState ? getAllAppState().customBuild as {
          packageConfiguration: { addedPackages: string[]; removedPackages: string[] };
          uciDefaults?: string;
          rootfsSizeMb?: number;
          repositories: { name: string; url: string; }[];
          repositoryKeys: string[];
        } : {
          packageConfiguration: { addedPackages: [], removedPackages: [] },
          repositories: [],
          repositoryKeys: []
        },

        // Module configuration (only if module management is enabled)
        ...(config.enable_module_management ? {
          modules: {
            sources: moduleStore.sources.map(source => ({
              id: source.id,
              name: source.name,
              url: source.url,
              ref: source.ref
            })),
            selections: moduleStore.selections.map(selection => ({
              sourceId: selection.sourceId,
              moduleId: selection.moduleId,
              parameters: { ...selection.parameters },
              userDownloads: { ...selection.userDownloads }
            }))
          }
        } : {})
      }

      const success = configManager.saveConfiguration(configData)
      if (success) {
        currentConfigId.value = configData.id
        currentConfigName.value = configData.name
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
  let applyAppState: ((config: SavedConfiguration) => void) | null = null
  
  function setAppStateApplier(applier: (config: SavedConfiguration) => void) {
    applyAppState = applier
  }

  async function loadConfiguration(id: string): Promise<boolean> {
    isLoading.value = true
    error.value = ''

    try {
      const savedConfig = configManager.loadConfiguration(id)
      if (!savedConfig) {
        error.value = '配置不存在'
        return false
      }

      // Apply device configuration
      await firmwareStore.changeVersion(savedConfig.device.version)
      
      // Wait for devices to load
      const devicesLoaded = await waitForCondition(
        () => Object.keys(firmwareStore.devices).length > 0
      )

      if (!devicesLoaded) {
        error.value = '设备列表加载失败，请重试'
        return false
      }

      const device = firmwareStore.devices[savedConfig.device.model]
      if (device) {
        await firmwareStore.selectDevice(savedConfig.device.model)
        
        // Wait for profile to be fully loaded
        await waitForCondition(
          () => !!firmwareStore.selectedProfile
        )
        
        // Load package feeds if not loaded and profile is available
        if (packageStore.totalPackages === 0 && firmwareStore.selectedProfile) {
          // Use arch_packages from profile data
          await packageStore.loadPackagesForDevice(
            savedConfig.device.version,
            firmwareStore.selectedProfile.arch_packages,
            savedConfig.device.target
          )
        }
      } else {
        error.value = `未找到设备: ${savedConfig.device.model}，可能版本不匹配或设备已下线`
        return false
      }

      // Apply module sources (only if module management is enabled and config has modules)
      if (config.enable_module_management && savedConfig.modules) {
        moduleStore.sources = []
        moduleStore.selections = []
        
        for (const sourceConfig of savedConfig.modules.sources) {
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
        
        for (const selectionConfig of savedConfig.modules.selections) {
          try {
            moduleStore.selectModule(selectionConfig.sourceId, selectionConfig.moduleId)
          
          // Apply parameters
          for (const [key, value] of Object.entries(selectionConfig.parameters)) {
            moduleStore.updateModuleParameter(
              selectionConfig.sourceId,
              selectionConfig.moduleId,
              key,
              value as string
            )
          }

          // Apply user downloads
          for (const [name, url] of Object.entries(selectionConfig.userDownloads)) {
            moduleStore.updateUserDownload(
              selectionConfig.sourceId,
              selectionConfig.moduleId,
              name,
              url as string
            )
          }
          } catch (err) {
            console.warn(`Failed to apply module selection: ${selectionConfig.moduleId}`, err)
          }
        }
      }

      // Apply full configuration to application (wait for package feeds to load)
      if (applyAppState) {
        // Wait for package loading to complete
        await waitForCondition(
          () => !packageStore.isLoading && packageStore.totalPackages > 0,
          10000 // 10 seconds max wait
        )
        
        // Apply configuration after packages are loaded
        applyAppState(savedConfig)
      }

      currentConfigId.value = savedConfig.id
      currentConfigName.value = savedConfig.name
      
      // Set as last used configuration
      configManager.setLastUsedConfigId(savedConfig.id)

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
    } catch {
      return {
        success: false,
        message: '导入配置失败'
      }
    }
  }

  function newConfiguration(): void {
    currentConfigId.value = ''
    currentConfigName.value = ''
    
    // Clear all selections
    firmwareStore.selectedDevice = null
    firmwareStore.selectedProfile = null
    
    // Clear package selections
    packageStore.clearAllPackages()
    
    // Clear module selections (only if module management is enabled)
    if (config.enable_module_management) {
      moduleStore.sources = []
      moduleStore.selections = []
    }
    
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
