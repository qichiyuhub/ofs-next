// Configuration management service for import/export

import * as YAML from 'js-yaml'
import type { 
  SavedConfiguration, 
  ConfigurationSummary, 
  ImportResult, 
  ExportOptions 
} from '@/types/config'

export class ConfigurationManager {
  private readonly STORAGE_KEY = 'openwrt-configs'
  private readonly LAST_CONFIG_KEY = 'openwrt-last-config'
  private readonly CURRENT_VERSION = '1.0.0'

  /**
   * Save configuration to localStorage
   */
  saveConfiguration(config: SavedConfiguration): boolean {
    try {
      const configs = this.getAllConfigurations()
      const existingIndex = configs.findIndex(c => c.id === config.id)
      
      config.updatedAt = new Date()
      config.version = this.CURRENT_VERSION
      
      if (existingIndex >= 0) {
        configs[existingIndex] = config
      } else {
        configs.push(config)
      }
      
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(configs))
      // Set as last used configuration
      this.setLastUsedConfigId(config.id)
      return true
    } catch (error) {
      console.error('Failed to save configuration:', error)
      return false
    }
  }

  /**
   * Load configuration by ID
   */
  loadConfiguration(id: string): SavedConfiguration | null {
    try {
      const configs = this.getAllConfigurations()
      return configs.find(c => c.id === id) || null
    } catch (error) {
      console.error('Failed to load configuration:', error)
      return null
    }
  }

  /**
   * Get all saved configurations summary
   */
  getConfigurationSummaries(): ConfigurationSummary[] {
    try {
      const configs = this.getAllConfigurations()
      return configs
        .filter(config => config.customBuild.packageConfiguration) // 忽略旧格式配置
        .map(config => ({
          id: config.id,
          name: config.name,
          description: config.description,
          deviceModel: config.device.model,
          version: config.device.version,
          moduleCount: config.modules?.selections.length || 0,
          packageCount: config.customBuild.packageConfiguration.addedPackages.length + config.customBuild.packageConfiguration.removedPackages.length,
          createdAt: new Date(config.createdAt),
          updatedAt: new Date(config.updatedAt)
        }))
    } catch (error) {
      console.error('Failed to get configuration summaries:', error)
      return []
    }
  }

  /**
   * Get last used configuration ID
   */
  getLastUsedConfigId(): string | null {
    try {
      return localStorage.getItem(this.LAST_CONFIG_KEY)
    } catch (error) {
      console.error('Failed to get last used config ID:', error)
      return null
    }
  }

  /**
   * Set last used configuration ID
   */
  setLastUsedConfigId(id: string): void {
    try {
      localStorage.setItem(this.LAST_CONFIG_KEY, id)
    } catch (error) {
      console.error('Failed to set last used config ID:', error)
    }
  }

  /**
   * Clear last used configuration ID
   */
  clearLastUsedConfigId(): void {
    try {
      localStorage.removeItem(this.LAST_CONFIG_KEY)
    } catch (error) {
      console.error('Failed to clear last used config ID:', error)
    }
  }

  /**
   * Delete configuration
   */
  deleteConfiguration(id: string): boolean {
    try {
      const configs = this.getAllConfigurations()
      const filtered = configs.filter(c => c.id !== id)
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(filtered))
      
      // Clear last used config if it's being deleted
      if (this.getLastUsedConfigId() === id) {
        this.clearLastUsedConfigId()
      }
      
      return true
    } catch (error) {
      console.error('Failed to delete configuration:', error)
      return false
    }
  }

  /**
   * Export configuration to file
   */
  exportConfiguration(config: SavedConfiguration, options: ExportOptions = {}): string {
    const {
      includeModuleSources = true,
      includePackages = true,
      includeUciDefaults = true,
      format = 'json'
    } = options

    // Create export data
    const exportData: any = {
      ...config,
      exportedAt: new Date(),
      exportVersion: this.CURRENT_VERSION
    }

    // Filter based on options
    if (!includeModuleSources) {
      exportData.modules.sources = []
    }

    if (!includePackages) {
      exportData.customBuild.packages = []
    }

    if (!includeUciDefaults) {
      delete exportData.customBuild.uciDefaults
    }

    // Format output
    if (format === 'yaml') {
      return YAML.dump(exportData, { indent: 2 })
    } else {
      return JSON.stringify(exportData, null, 2)
    }
  }

  /**
   * Import configuration from file content
   */
  importConfiguration(content: string, format?: 'json' | 'yaml'): ImportResult {
    try {
      let data: any

      // Parse content
      if (format === 'yaml' || content.trim().startsWith('---')) {
        data = YAML.load(content)
      } else {
        data = JSON.parse(content)
      }

      // Validate structure
      const validation = this.validateConfigurationData(data)
      if (!validation.isValid) {
        return {
          success: false,
          message: `配置文件格式错误: ${validation.errors.join(', ')}`
        }
      }

      // Convert to SavedConfiguration
      const config: SavedConfiguration = {
        ...data,
        id: data.id || this.generateId(),
        createdAt: data.createdAt ? new Date(data.createdAt) : new Date(),
        updatedAt: new Date(),
        version: this.CURRENT_VERSION
      }

      // Check for compatibility issues
      const warnings: string[] = []
      if (data.version && data.version !== this.CURRENT_VERSION) {
        warnings.push(`配置版本 ${data.version} 可能与当前系统不完全兼容`)
      }

      return {
        success: true,
        message: '配置导入成功',
        config,
        warnings: warnings.length > 0 ? warnings : undefined
      }
    } catch (error) {
      return {
        success: false,
        message: `配置解析失败: ${error instanceof Error ? error.message : '未知错误'}`
      }
    }
  }

  /**
   * Download configuration as file
   */
  downloadConfiguration(config: SavedConfiguration, options: ExportOptions = {}): void {
    const content = this.exportConfiguration(config, options)
    const format = options.format || 'json'
    const filename = `${config.name.replace(/[^a-z0-9]/gi, '_')}.${format}`
    
    const blob = new Blob([content], { 
      type: format === 'json' ? 'application/json' : 'application/x-yaml'
    })
    
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `config_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Get all configurations from localStorage
   */
  private getAllConfigurations(): SavedConfiguration[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY)
      if (!data) return []
      
      const configs = JSON.parse(data)
      
      // Convert date strings back to Date objects
      return configs.map((config: any) => ({
        ...config,
        createdAt: new Date(config.createdAt),
        updatedAt: new Date(config.updatedAt)
      }))
    } catch (error) {
      console.error('Failed to parse configurations:', error)
      return []
    }
  }

  /**
   * Validate configuration data structure
   */
  private validateConfigurationData(data: any): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!data || typeof data !== 'object') {
      errors.push('无效的配置文件格式')
      return { isValid: false, errors }
    }

    // Check required fields
    if (!data.name || typeof data.name !== 'string') {
      errors.push('缺少配置名称')
    }

    if (!data.device || typeof data.device !== 'object') {
      errors.push('缺少设备配置')
    } else {
      // Profile is derived from target + model; do not require it here
      const required = ['model', 'target', 'version']
      for (const field of required) {
        if (!data.device[field]) {
          errors.push(`缺少设备配置字段: ${field}`)
        }
      }
    }

    if (!data.customBuild || typeof data.customBuild !== 'object') {
      errors.push('缺少自定义构建配置')
    } else {
      // Expect new packageConfiguration shape with added/removed arrays
      const pc = data.customBuild.packageConfiguration
      if (!pc || typeof pc !== 'object' || !Array.isArray(pc.addedPackages) || !Array.isArray(pc.removedPackages)) {
        errors.push('软件包配置格式错误')
      }
      if (!Array.isArray(data.customBuild.repositories)) {
        errors.push('仓库配置格式错误')
      }
      if (!Array.isArray(data.customBuild.repositoryKeys)) {
        errors.push('仓库密钥配置格式错误')
      }
    }

    // Modules are optional; validate only if provided
    if (data.modules !== undefined) {
      if (!data.modules || typeof data.modules !== 'object') {
        errors.push('模块配置格式错误')
      } else {
        if (!Array.isArray(data.modules.sources)) {
          errors.push('模块源配置格式错误')
        }
        if (!Array.isArray(data.modules.selections)) {
          errors.push('模块选择配置格式错误')
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }
}

// Export singleton instance
export const configManager = new ConfigurationManager()
