// User configuration types for import/export

export interface SavedConfiguration {
  // Metadata
  id: string
  name: string
  description?: string
  version: string // Format version for compatibility
  createdAt: Date
  updatedAt: Date
  
  // Device configuration
  device: {
    model: string
    target: string
    profile: string
    version: string // OpenWrt version
  }
  
  // Custom build configuration
  customBuild: {
    packageConfiguration: {
      addedPackages: string[]
      removedPackages: string[]
    }
    uciDefaults?: string
    rootfsSizeMb?: number
    repositories: Array<{
      name: string
      url: string
    }>
    repositoryKeys: string[]
  }
  
  // Module configuration (optional - only if module management is enabled)
  modules?: {
    sources: Array<{
      id: string
      name: string
      url: string
      ref: string
    }>
    selections: Array<{
      sourceId: string
      moduleId: string
      parameters: { [key: string]: string }
      userDownloads: { [key: string]: string }
    }>
  }
}

export interface ConfigurationSummary {
  id: string
  name: string
  description?: string
  deviceModel: string
  version: string
  moduleCount: number
  packageCount: number
  createdAt: Date
  updatedAt: Date
}

export interface ImportResult {
  success: boolean
  message: string
  config?: SavedConfiguration
  warnings?: string[]
}

export interface ExportOptions {
  includeModuleSources?: boolean
  includePackages?: boolean
  includeUciDefaults?: boolean
  format?: 'json' | 'yaml'
}
