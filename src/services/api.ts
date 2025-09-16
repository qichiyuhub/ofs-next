export interface DeviceProfile {
  id: string
  target: string
  titles: Array<{
    title?: string
    vendor: string
    model: string
    variant?: string
  }>
  images: DeviceImage[]
  device_packages: string[]
  version_number: string
  version_code: string
  build_at: string
  default_packages: string[]
  arch_packages: string
  linux_kernel: {
    version: string
    release: string
    vermagic: string
  }
  manifest?: any
}

export interface DeviceImage {
  name: string
  type: string
  sha256?: string
}

export interface OverviewResponse {
  profiles: DeviceProfile[]
}

export interface ProfilesResponse {
  version_number: string
  version_code: string
  build_at: string
  arch_packages: string
  linux_kernel: {
    version: string
    release: string
    vermagic: string
  }
  profiles: {
    [key: string]: {
      id: string
      images: DeviceImage[]
      titles: Array<{
        title?: string
        vendor: string
        model: string
        variant?: string
      }>
      device_packages: string[]
    }
  }
  default_packages: string[]
}

export interface VersionsResponse {
  versions_list: string[]
  stable_version: string
  image_url_override?: string
  upcoming_version?: string
}

export class ApiService {
  private baseUrl: string
  
  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || '../misc'
  }

  async getVersions(): Promise<VersionsResponse> {
    const response = await fetch(`${this.baseUrl}/.versions.json`, {
      cache: 'no-cache'
    })
    
    if (response.status === 200) {
      return await response.json()
    } else {
      // .versions.json is optional
      return { versions_list: [], stable_version: '23.05.4' }
    }
  }

  async getOverview(version: string, imageUrl?: string): Promise<OverviewResponse> {
    const overviewUrl = this.buildOverviewUrl(version, imageUrl)
    const response = await fetch(`${overviewUrl}/.overview.json`, {
      cache: 'no-cache'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch overview for version ${version}`)
    }
    
    return await response.json()
  }

  async getProfiles(version: string, target: string, imageUrl?: string): Promise<ProfilesResponse> {
    const baseUrl = this.buildImageUrl(version, imageUrl)
    const response = await fetch(`${baseUrl}/targets/${target}/profiles.json`, {
      cache: 'no-cache'
    })
    
    if (!response.ok) {
      throw new Error(`Failed to fetch profiles for ${target}`)
    }
    
    return await response.json()
  }

  private buildOverviewUrl(version: string, imageUrlOverride?: string): string {
    const baseUrl = imageUrlOverride || this.baseUrl
    if (version === 'SNAPSHOT') {
      return `${baseUrl}/snapshots/`
    } else {
      return `${baseUrl}/releases/${version}`
    }
  }

  private buildImageUrl(version: string, imageUrlOverride?: string): string {
    const baseUrl = imageUrlOverride || this.baseUrl
    if (version === 'SNAPSHOT') {
      return `${baseUrl}/snapshots/`
    } else {
      return `${baseUrl}/releases/${version}`
    }
  }

  buildImageFolder(version: string, target: string, imageUrlOverride?: string): string {
    const baseUrl = this.buildImageUrl(version, imageUrlOverride)
    return `${baseUrl}/targets/${target}`
  }

  buildDownloadUrl(imageFolder: string, imageName: string): string {
    return `${imageFolder}/${imageName}`
  }
}
