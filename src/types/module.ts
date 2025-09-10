// Module type definitions based on asu-advance spec.md

export interface ModuleParameter {
  name: string
  required: boolean
  default?: string
  description: string
  validation?: {
    pattern: string
  }
}

export interface ParameterizedFile {
  file: string
  parameters: ModuleParameter[]
}

export interface ModuleFeed {
  name: string
  url: string
  full_version_mode?: boolean
  type: string
}

export interface ModuleKey {
  id: string
  comment: string
  content: string
}

export interface ModuleGPGKey {
  keyid: string
  comment: string
  public_key: string
}

export interface ModuleDownload {
  url?: string  // Optional: if not provided, user must input
  name: string
  headers?: string[]
  path: string
}

export interface ModuleDefinition {
  name: string
  version: string
  description: {
    [lang: string]: string
  }
  author: string
  email: string
  website?: string
  license: string
  tags: string[]
  category: string
  feeds?: ModuleFeed[]
  keys?: ModuleKey[]
  gpg_keys?: ModuleGPGKey[]
  downloads?: ModuleDownload[]
  packages?: string[]
  parameterized_files?: ParameterizedFile[]
}

export interface ModuleFile {
  path: string
  content: string
}

export interface Module {
  id: string  // module directory name
  definition: ModuleDefinition
  files: ModuleFile[]
  readme: {
    [lang: string]: string
  }
}

export interface ModuleSource {
  id: string
  name: string
  url: string
  ref: string  // branch, tag, or commit
  modules: Module[]
  lastUpdated?: Date
}

export interface ModuleSelection {
  moduleId: string
  sourceId: string
  parameters: { [parameterName: string]: string }
  userDownloads: { [downloadName: string]: string }  // user-defined URLs for downloads without url field
}
