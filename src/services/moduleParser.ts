// Module parsing service

import * as YAML from 'js-yaml'
import JSZip from 'jszip'
import type { Module, ModuleDefinition, ModuleFile } from '@/types/module'

export class ModuleParserService {
  /**
   * Parse module source from zip blob
   */
  async parseModuleSource(zipBlob: Blob): Promise<Module[]> {
    const zip = await JSZip.loadAsync(zipBlob)
    const modules: Module[] = []

    // Find all potential module directories in the root
    const rootEntries = Object.keys(zip.files).filter(path => {
      const parts = path.split('/')
      return parts.length >= 3 && !zip.files[path].dir // Skip the repo root folder
    })

    // Group by module directory (second level directories after repo name)
    const moduleGroups: { [moduleName: string]: string[] } = {}
    
    rootEntries.forEach(path => {
      const parts = path.split('/')
      if (parts.length >= 3) {
        const moduleName = parts[1] // Skip repo name, get module directory name
        if (!moduleGroups[moduleName]) {
          moduleGroups[moduleName] = []
        }
        moduleGroups[moduleName].push(path)
      }
    })

    // Process each potential module
    for (const [moduleName, paths] of Object.entries(moduleGroups)) {
      try {
        const module = await this.parseModule(zip, moduleName, paths)
        if (module) {
          modules.push(module)
        }
      } catch (error) {
        console.warn(`Failed to parse module ${moduleName}:`, error)
      }
    }

    return modules
  }

  /**
   * Parse a single module from zip entries
   */
  private async parseModule(zip: JSZip, moduleName: string, paths: string[]): Promise<Module | null> {
    // Check for required files
    const moduleYamlPath = paths.find(path => path.endsWith('/module.yaml'))
    const readmeEnPath = paths.find(path => path.endsWith('/README/en.md'))

    if (!moduleYamlPath || !readmeEnPath) {
      console.warn(`Module ${moduleName} missing required files (module.yaml or README/en.md)`)
      return null
    }

    // Parse module.yaml
    const moduleYamlContent = await zip.file(moduleYamlPath)?.async('string')
    if (!moduleYamlContent) {
      throw new Error(`Cannot read module.yaml for ${moduleName}`)
    }

    let definition: ModuleDefinition
    try {
      definition = YAML.load(moduleYamlContent) as ModuleDefinition
    } catch (error) {
      throw new Error(`Invalid YAML in module.yaml for ${moduleName}: ${error}`)
    }

    // Collect all files
    const files: ModuleFile[] = []
    for (const path of paths) {
      const file = zip.file(path)
      if (file && !file.dir) {
        const content = await file.async('string')
        // Remove the repo name prefix from path
        const relativePath = path.split('/').slice(2).join('/')
        files.push({
          path: relativePath,
          content
        })
      }
    }

    // Parse README files
    const readme: { [lang: string]: string } = {}
    const readmePaths = paths.filter(path => path.includes('/README/') && path.endsWith('.md'))
    
    for (const readmePath of readmePaths) {
      const file = zip.file(readmePath)
      if (file) {
        const content = await file.async('string')
        const filename = readmePath.split('/').pop()
        if (filename) {
          const lang = filename.replace('.md', '')
          readme[lang] = content
        }
      }
    }

    return {
      id: moduleName,
      definition,
      files,
      readme
    }
  }

  /**
   * Validate module definition
   */
  validateModule(module: Module): string[] {
    const errors: string[] = []
    const def = module.definition

    if (!def.name) errors.push('Missing module name')
    if (!def.version) errors.push('Missing module version')
    if (!def.description?.en) errors.push('Missing English description')
    if (!def.author) errors.push('Missing module author')
    if (!def.license) errors.push('Missing module license')
    if (!def.category) errors.push('Missing module category')
    if (!module.readme.en) errors.push('Missing English README')

    // Validate parameterized files
    if (def.parameterized_files) {
      for (const paramFile of def.parameterized_files) {
        if (!paramFile.file.startsWith('files/')) {
          errors.push(`Parameterized file ${paramFile.file} must be under files/ directory`)
        }
        
        for (const param of paramFile.parameters) {
          if (!param.name) {
            errors.push(`Parameter missing name in file ${paramFile.file}`)
          }
          if (param.required === undefined) {
            errors.push(`Parameter ${param.name} missing required field`)
          }
        }
      }
    }

    // Validate downloads
    if (def.downloads) {
      for (const download of def.downloads) {
        if (!download.name) {
          errors.push('Download missing name')
        }
        if (!download.path || !download.path.startsWith('files/')) {
          errors.push(`Download ${download.name} path must be under files/ directory`)
        }
      }
    }

    return errors
  }
}

export const moduleParserService = new ModuleParserService()