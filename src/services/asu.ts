import { config } from '@/config'

export interface AsuBuildRequest {
  target: string
  profile: string
  packages: string[]
  version: string
  store_path?: string
  diff_packages?: boolean
  filesystem?: string
  rootfs_size_mb?: number
  defaults?: string
  repositories?: { [name: string]: string }
  repository_keys?: string[]
  // Module support
  modules?: {
    source_id: string
    url: string
    ref: string
    selected_modules: {
      module_id: string
      parameters: { [key: string]: string }
      user_downloads: { [key: string]: string }
    }[]
  }[]
}

export interface AsuBuildResponse {
  id: string
  status: 'requested' | 'building' | 'success' | 'failure' | 'no_sysupgrade'
  request_hash?: string
  detail?: string
  enqueue_at?: string
  build_at?: string
  stdout?: string
  stderr?: string
  images?: Array<{
    name: string
    sha256: string
    type: string
  }>
  manifest?: any
  build_cmd?: string[]
  bin_dir?: string
  imagebuilder_status?: string
  queue_position?: number
}

export interface AsuStatusResponse extends AsuBuildResponse {
  queue_position?: number
}

export class AsuService {
  private baseUrl: string

  constructor() {
    this.baseUrl = config.asu_url || ''
  }

  isAvailable(): boolean {
    return !!this.baseUrl
  }

  async requestBuild(request: AsuBuildRequest): Promise<AsuBuildResponse> {
    const response = await fetch(`${this.baseUrl}/api/v1/build`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
    })

    if (!response.ok) {
      throw new Error(`ASU build request failed: ${response.statusText}`)
    }

    return await response.json()
  }

  async getBuildStatus(requestHash: string): Promise<AsuStatusResponse & { httpStatus: number }> {
    const response = await fetch(`${this.baseUrl}/api/v1/build/${requestHash}`)
    
    const data = await response.json()
    
    // Add HTTP status to response for proper handling
    return {
      ...data,
      httpStatus: response.status
    }
  }

  async getServerInfo(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/api/v1/`)
    
    if (!response.ok) {
      throw new Error(`ASU server info request failed: ${response.statusText}`)
    }

    return await response.json()
  }

  buildPackagesList(
    devicePackages: string[],
    defaultPackages: string[], 
    userPackages: string[],
    extraPackages: string[] = []
  ): string[] {
    // Start with device packages and defaults
    const allPackages = new Set([...devicePackages, ...defaultPackages])
    
    // Add extra packages from config
    extraPackages.forEach(pkg => allPackages.add(pkg))
    
    // Process user packages (can include negatives with -)
    userPackages.forEach(pkg => {
      const trimmed = pkg.trim()
      if (trimmed.startsWith('-')) {
        // Remove package
        const packageName = trimmed.substring(1)
        allPackages.delete(packageName)
      } else if (trimmed) {
        // Add package
        allPackages.add(trimmed)
      }
    })
    
    return Array.from(allPackages).sort()
  }

  parsePackages(packagesText: string): string[] {
    return packagesText
      .split(/[\s,\n]+/)
      .map(pkg => pkg.trim())
      .filter(pkg => pkg.length > 0)
  }

  calculatePackagesHash(packages: string[]): string {
    const sortedPackages = [...packages].sort()
    const packagesString = sortedPackages.join(' ')
    
    // Simple hash function (for demo purposes, in production use crypto)
    let hash = 0
    for (let i = 0; i < packagesString.length; i++) {
      const char = packagesString.charCodeAt(i)
      hash = ((hash << 5) - hash) + char
      hash = hash & hash // Convert to 32bit integer
    }
    
    return Math.abs(hash).toString(16)
  }

  validateManifest(manifest: any, packages: string[]): {
    valid: boolean
    missing: string[]
    conflicts: string[]
  } {
    if (!manifest || !manifest.packages) {
      return {
        valid: false,
        missing: packages,
        conflicts: []
      }
    }

    const availablePackages = new Set(Object.keys(manifest.packages))
    const missing: string[] = []
    const conflicts: string[] = []

    for (const pkg of packages) {
      if (pkg.startsWith('-')) {
        continue // Skip negative packages
      }
      
      if (!availablePackages.has(pkg)) {
        missing.push(pkg)
      }
    }

    return {
      valid: missing.length === 0 && conflicts.length === 0,
      missing,
      conflicts
    }
  }

  formatBuildSize(sizeBytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB']
    let size = sizeBytes
    let unitIndex = 0
    
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024
      unitIndex++
    }
    
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
  }

  getProgressPercentage(status: string): number {
    const progressMap: Record<string, number> = {
      'tr-init': 10,
      'tr-container-setup': 15,
      'tr-download-imagebuilder': 20,
      'tr-validate-manifest': 30,
      'tr-unpack-imagebuilder': 40,
      'tr-calculate-packages-hash': 60,
      'tr-building-image': 80,
    }
    
    return progressMap[status] || 0
  }
}
