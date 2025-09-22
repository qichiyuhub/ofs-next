// Module management store

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { ModuleSource, ModuleSelection, Module } from '@/types/module'
import { githubService } from '@/services/github'
import { moduleParserService } from '@/services/moduleParser'
import { moduleValidationService } from '@/services/moduleValidation'

export const useModuleStore = defineStore('module', () => {
  // State
  const sources = ref<ModuleSource[]>([])
  const selections = ref<ModuleSelection[]>([])
  const isLoading = ref(false)
  const error = ref<string>('')

  // Computed
  const totalModules = computed(() => {
    return sources.value.reduce((total, source) => total + source.modules.length, 0)
  })

  const selectedModules = computed(() => {
    const result: Array<{ module: Module; source: ModuleSource; selection: ModuleSelection }> = []
    
    for (const selection of selections.value) {
      const source = sources.value.find(s => s.id === selection.sourceId)
      if (source) {
        const module = source.modules.find(m => m.id === selection.moduleId)
        if (module) {
          result.push({ module, source, selection })
        }
      }
    }
    
    return result
  })

  // Actions
  async function addModuleSource(url: string, name: string, ref: string = 'main'): Promise<void> {
    isLoading.value = true
    error.value = ''

    try {
      const repoInfo = githubService.parseRepoUrl(url)
      if (!repoInfo) {
        throw new Error('Invalid GitHub repository URL')
      }

      // Check if source already exists
      const sourceId = `${repoInfo.owner}/${repoInfo.repo}@${ref}`
      if (sources.value.find(s => s.id === sourceId)) {
        throw new Error('Module source already exists')
      }

      // Download repository archive directly
      const zipBlob = await githubService.downloadRepository(repoInfo.owner, repoInfo.repo, ref)

      // Parse modules from archive
      const modules = await moduleParserService.parseModuleSource(zipBlob)

      // Add module source (no validation)
      const moduleSource: ModuleSource = {
        id: sourceId,
        name,
        url,
        ref,
        modules,
        lastUpdated: new Date()
      }

      sources.value.push(moduleSource)

    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function removeModuleSource(sourceId: string): void {
    const index = sources.value.findIndex(s => s.id === sourceId)
    if (index !== -1) {
      sources.value.splice(index, 1)
      // Remove related selections
      selections.value = selections.value.filter(s => s.sourceId !== sourceId)
    }
  }

  async function refreshModuleSource(sourceId: string): Promise<void> {
    const source = sources.value.find(s => s.id === sourceId)
    if (!source) {
      throw new Error('Module source not found')
    }

    isLoading.value = true
    error.value = ''

    try {
      const repoInfo = githubService.parseRepoUrl(source.url)
      if (!repoInfo) {
        throw new Error('Invalid GitHub repository URL')
      }

      // Download repository archive directly
      const zipBlob = await githubService.downloadRepository(repoInfo.owner, repoInfo.repo, source.ref)

      // Parse modules from archive
      const modules = await moduleParserService.parseModuleSource(zipBlob)

      // Update source (no validation)
      source.modules = modules
      source.lastUpdated = new Date()

      // Remove selections for modules that no longer exist
      const existingModuleIds = new Set(modules.map(m => m.id))
      selections.value = selections.value.filter(s => 
        s.sourceId !== sourceId || existingModuleIds.has(s.moduleId)
      )

    } catch (err) {
      error.value = err instanceof Error ? err.message : 'Unknown error occurred'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  function selectModule(sourceId: string, moduleId: string): void {
    // Check if already selected
    if (selections.value.find(s => s.sourceId === sourceId && s.moduleId === moduleId)) {
      return
    }

    const source = sources.value.find(s => s.id === sourceId)
    const module = source?.modules.find(m => m.id === moduleId)
    
    if (!source || !module) {
      throw new Error('Module or source not found')
    }

    // Initialize selection with default parameters
    const selection: ModuleSelection = {
      sourceId,
      moduleId,
      parameters: {},
      userDownloads: {}
    }

    // Set default parameter values
    if (module.definition.parameterized_files) {
      for (const paramFile of module.definition.parameterized_files) {
        for (const param of paramFile.parameters) {
          if (param.default !== undefined) {
            selection.parameters[`${paramFile.file}:${param.name}`] = param.default
          }
        }
      }
    }

    selections.value.push(selection)
  }

  function deselectModule(sourceId: string, moduleId: string): void {
    const index = selections.value.findIndex(s => s.sourceId === sourceId && s.moduleId === moduleId)
    if (index !== -1) {
      selections.value.splice(index, 1)
    }
  }

  function updateModuleParameter(sourceId: string, moduleId: string, parameterKey: string, value: string): void {
    const selection = selections.value.find(s => s.sourceId === sourceId && s.moduleId === moduleId)
    if (selection) {
      selection.parameters[parameterKey] = value
    }
  }

  function updateUserDownload(sourceId: string, moduleId: string, downloadName: string, url: string): void {
    const selection = selections.value.find(s => s.sourceId === sourceId && s.moduleId === moduleId)
    if (selection) {
      selection.userDownloads[downloadName] = url
    }
  }

  function clearError(): void {
    error.value = ''
  }

  function getModuleSelection(sourceId: string, moduleId: string): ModuleSelection | undefined {
    return selections.value.find(s => s.sourceId === sourceId && s.moduleId === moduleId)
  }

  function isModuleSelected(sourceId: string, moduleId: string): boolean {
    return !!selections.value.find(s => s.sourceId === sourceId && s.moduleId === moduleId)
  }

  function validateModuleSelection(sourceId: string, moduleId: string): { isValid: boolean; errors: string[] } {
    const selection = getModuleSelection(sourceId, moduleId)
    const source = sources.value.find(s => s.id === sourceId)
    const module = source?.modules.find(m => m.id === moduleId)
    
    if (!selection || !module) {
      return { isValid: false, errors: ['模块选择不存在'] }
    }

    const errors: string[] = []

    // Validate parameterized files
    if (module.definition.parameterized_files) {
      for (const paramFile of module.definition.parameterized_files) {
        for (const param of paramFile.parameters) {
          const paramKey = `${paramFile.file}:${param.name}`
          const value = selection.parameters[paramKey] || ''
          
          const result = moduleValidationService.validateParameter(param, value)
          if (!result.isValid) {
            errors.push(`${paramFile.file} - ${result.errorMessage}`)
          }
        }
      }
    }

    // Validate user downloads
    if (module.definition.downloads) {
      for (const download of module.definition.downloads) {
        if (!download.url) { // User-defined download
          const userUrl = selection.userDownloads[download.name] || ''
          const result = moduleValidationService.validateDownloadUrl(userUrl)
          if (!result.isValid) {
            errors.push(`${download.name} - ${result.errorMessage}`)
          }
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    }
  }

  function validateAllSelections(): { isValid: boolean; errors: { [moduleId: string]: string[] } } {
    const allErrors: { [moduleId: string]: string[] } = {}
    
    for (const selection of selections.value) {
      const result = validateModuleSelection(selection.sourceId, selection.moduleId)
      if (!result.isValid) {
        const key = `${selection.sourceId}:${selection.moduleId}`
        allErrors[key] = result.errors
      }
    }

    return {
      isValid: Object.keys(allErrors).length === 0,
      errors: allErrors
    }
  }

  function resetAll(): void {
    sources.value = []
    selections.value = []
    error.value = ''
  }

  return {
    // State
    sources,
    selections,
    isLoading,
    error,

    // Computed
    totalModules,
    selectedModules,

    // Actions
    addModuleSource,
    removeModuleSource,
    refreshModuleSource,
    selectModule,
    deselectModule,
    updateModuleParameter,
    updateUserDownload,
    clearError,
    getModuleSelection,
    isModuleSelected,
    validateModuleSelection,
    validateAllSelections,
    resetAll
  }
})
