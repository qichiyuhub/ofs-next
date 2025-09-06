// OpenWrt package management service

import type { OpenWrtPackage, PackageFeed, PackageSearchFilter } from '@/types/package'
import { config } from '@/config'

export class PackageManagerService {
  private readonly ARCHITECTURE_FEEDS = ['base', 'luci', 'packages', 'telephony']
  private readonly TARGET_FEEDS = ['kmods', 'packages'] // Target-specific feeds

  /**
   * Generate package feed URLs for a device
   */
  generateFeedUrls(version: string, architecture: string, target?: string, kernelInfo?: { version: string; release: string; vermagic: string }): string[] {
    const urls: string[] = []
    
    // Architecture-specific feeds
    const archUrl = `${config.image_url}/releases/${version}/packages/${architecture}`
    this.ARCHITECTURE_FEEDS.forEach(feed => {
      urls.push(`${archUrl}/${feed}/Packages`)
    })
    
    // Target-specific feeds (if target is provided)
    if (target) {
      const targetUrl = `${config.image_url}/releases/${version}/targets/${target}`
      
      // Target packages
      urls.push(`${targetUrl}/packages/Packages`)
      
      // Kernel modules (if kernel info is provided)
      if (kernelInfo) {
        urls.push(`${targetUrl}/kmods/${kernelInfo.version}-${kernelInfo.release}-${kernelInfo.vermagic}/Packages`)
      }
    }
    
    return urls
  }

  /**
   * Fetch kernel information from profiles.json
   */
  async fetchKernelInfo(version: string, target: string): Promise<{ version: string; release: string; vermagic: string } | null> {
    try {
      const profilesUrl = `${config.image_url}/releases/${version}/targets/${target}/profiles.json`
      const response = await fetch(profilesUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch profiles: ${response.statusText}`)
      }

      const data = await response.json() as { linux_kernel?: { version: string; release: string; vermagic: string } }
      const kernelInfo = data.linux_kernel
      
      if (kernelInfo && kernelInfo.version && kernelInfo.release && kernelInfo.vermagic) {
        return {
          version: kernelInfo.version,
          release: kernelInfo.release,
          vermagic: kernelInfo.vermagic
        }
      }
      
      return null
    } catch (error) {
      console.error(`Error fetching kernel info for ${target}:`, error)
      return null
    }
  }

  /**
   * Fetch and parse packages from a feed URL
   */
  async fetchFeedPackages(feedUrl: string, feedName: string): Promise<OpenWrtPackage[]> {
    try {
      const response = await fetch(feedUrl)
      if (!response.ok) {
        throw new Error(`Failed to fetch packages: ${response.statusText}`)
      }

      const packagesText = await response.text()
      return this.parsePackagesFile(packagesText, feedName)
    } catch (error) {
      console.error(`Error fetching packages from ${feedUrl}:`, error)
      throw error
    }
  }

  /**
   * Parse OpenWrt Packages file format
   */
  parsePackagesFile(content: string, source: string): OpenWrtPackage[] {
    const packages: OpenWrtPackage[] = []
    const packageBlocks = content.split('\n\n').filter(block => block.trim())

    for (const block of packageBlocks) {
      try {
        const pkg = this.parsePackageBlock(block, source)
        if (pkg) {
          packages.push(pkg)
        }
      } catch (error) {
        console.warn('Failed to parse package block:', error)
      }
    }

    return packages
  }

  /**
   * Parse a single package block
   */
  private parsePackageBlock(block: string, source: string): OpenWrtPackage | null {
    const lines = block.split('\n')
    const pkg: Partial<OpenWrtPackage> = { source }

    for (const line of lines) {
      const colonIndex = line.indexOf(':')
      if (colonIndex === -1) continue

      const key = line.substring(0, colonIndex).trim()
      const value = line.substring(colonIndex + 1).trim()

      switch (key) {
        case 'Package':
          pkg.name = value
          break
        case 'Version':
          pkg.version = value
          break
        case 'Depends':
          // Parse dependencies (comma-separated, may have version constraints)
          pkg.depends = this.parseDependencies(value)
          break
        case 'License':
          pkg.license = value
          break
        case 'Section':
          pkg.section = value
          break
        case 'URL':
          pkg.url = value
          break
        case 'CPE-ID':
          pkg.cpeId = value
          break
        case 'Architecture':
          pkg.architecture = value
          break
        case 'Installed-Size':
          pkg.installedSize = parseInt(value, 10) || 0
          break
        case 'Filename':
          pkg.filename = value
          break
        case 'Size':
          pkg.size = parseInt(value, 10) || 0
          break
        case 'SHA256sum':
          pkg.sha256sum = value
          break
        case 'Description':
          pkg.description = value
          break
      }
    }

    // Validate required fields
    if (!pkg.name || !pkg.version || !pkg.architecture || !pkg.filename) {
      return null
    }

    return pkg as OpenWrtPackage
  }

  /**
   * Parse dependency string
   */
  private parseDependencies(dependsStr: string): string[] {
    if (!dependsStr) return []

    return dependsStr
      .split(',')
      .map(dep => dep.trim())
      .filter(dep => dep && dep !== 'libc') // Filter out libc as it's always available
      .map(dep => {
        // Remove version constraints like "(>= 1.0.0)"
        const match = dep.match(/^([^(]+)/)
        return match ? match[1].trim() : dep
      })
      .filter(dep => dep)
  }

  /**
   * Search packages with filters
   */
  searchPackages(packages: OpenWrtPackage[], filter: PackageSearchFilter): OpenWrtPackage[] {
    let results = packages

    // Text search
    if (filter.query) {
      const query = filter.query.toLowerCase()
      results = results.filter(pkg => 
        pkg.name.toLowerCase().includes(query) ||
        pkg.description.toLowerCase().includes(query)
      )
    }

    // Section filter
    if (filter.section) {
      results = results.filter(pkg => pkg.section === filter.section)
    }

    // Architecture filter
    if (filter.architecture) {
      results = results.filter(pkg => pkg.architecture === filter.architecture)
    }

    // Source filter
    if (filter.source) {
      results = results.filter(pkg => pkg.source === filter.source)
    }

    return results
  }

  /**
   * Get all unique sections from packages
   */
  getPackageSections(packages: OpenWrtPackage[]): string[] {
    const sections = new Set<string>()
    packages.forEach(pkg => {
      if (pkg.section) {
        sections.add(pkg.section)
      }
    })
    return Array.from(sections).sort()
  }

  /**
   * Calculate dependency tree for a package
   */
  getDependencyTree(packageName: string, packages: OpenWrtPackage[]): string[] {
    const visited = new Set<string>()
    const dependencies: string[] = []

    const addDependencies = (pkgName: string) => {
      if (visited.has(pkgName)) return

      visited.add(pkgName)
      const pkg = packages.find(p => p.name === pkgName)
      
      if (pkg && pkg.depends) {
        for (const dep of pkg.depends) {
          if (!visited.has(dep)) {
            dependencies.push(dep)
            addDependencies(dep)
          }
        }
      }
    }

    addDependencies(packageName)
    return dependencies
  }

  /**
   * Find packages that depend on a given package
   */
  getDependents(packageName: string, packages: OpenWrtPackage[]): string[] {
    return packages
      .filter(pkg => pkg.depends?.includes(packageName))
      .map(pkg => pkg.name)
  }

  /**
   * Format package size for display
   */
  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
  }

  /**
   * Get section display name
   */
  /**
   * Get feed display names
   */
  getFeedDisplayName(feedName: string): string {
    const feedNames: { [key: string]: string } = {
      'base': '基础系统',
      'luci': 'LuCI界面',
      'packages': '扩展软件包',
      'telephony': '电话通信',
      'kmods': '内核模块',
      'target-packages': '目标专用包'
    }
    return feedNames[feedName] || feedName
  }

  /**
   * Get section display names
   */
  getSectionDisplayName(section: string): string {
    const sectionNames: { [key: string]: string } = {
      'admin': '系统管理',
      'base': '基础系统',
      'boot': '启动加载',
      'devel': '开发工具',
      'firmware': '固件',
      'kernel': '内核模块',
      'lang': '编程语言',
      'libs': '系统库',
      'luci': 'Web界面',
      'mail': '邮件服务',
      'multimedia': '多媒体',
      'net': '网络',
      'sound': '音频',
      'system': '系统工具',
      'telephony': '电话通信',
      'text': '文本处理',
      'utils': '实用工具',
      'web': 'Web服务'
    }
    return sectionNames[section] || section
  }
}

export const packageManager = new PackageManagerService()