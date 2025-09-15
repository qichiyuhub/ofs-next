// OpenWrt package management service

import type { OpenWrtPackage, PackageFeed, PackageSearchFilter } from '@/types/package'
import { config } from '@/config'
// Import ADB parser for apk v3 package index
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - JS module export without types
import { parsePackagesAdbFromBytes } from '@/tools/adbdump.js'

export class PackageManagerService {
  private readonly ARCHITECTURE_FEEDS = ['base', 'luci', 'packages', 'telephony']
  private readonly TARGET_FEEDS = ['kmods', 'packages'] // Target-specific feeds

  /**
   * Generate package feed URLs for a device
   */
  generateFeedUrls(version: string, architecture: string, target?: string, kernelInfo?: { version: string; release: string; vermagic: string }): string[] {
    const urls: string[] = []
    const baseUrl = this.isSnapshot(version) ? `${config.image_url}/snapshots` : `${config.image_url}/releases/${version}`
    const fileName = this.isApkVersion(version) ? 'packages.adb' : 'Packages'

    // Architecture-specific feeds
    const archUrl = `${baseUrl}/packages/${architecture}`
    this.ARCHITECTURE_FEEDS.forEach(feed => {
      urls.push(`${archUrl}/${feed}/${fileName}`)
    })

    // Target-specific feeds (if target is provided)
    if (target) {
      const targetUrl = `${baseUrl}/targets/${target}`

      // Target packages
      urls.push(`${targetUrl}/packages/${fileName}`)

      // Kernel modules (if kernel info is provided)
      if (kernelInfo) {
        urls.push(`${targetUrl}/kmods/${kernelInfo.version}-${kernelInfo.release}-${kernelInfo.vermagic}/${fileName}`)
      }
    }

    return urls
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

      // Detect APK v3 ADB index by filename
      if (feedUrl.toLowerCase().endsWith('packages.adb')) {
        const buf = await response.arrayBuffer()
        const decoded: { packages: any[] } = await parsePackagesAdbFromBytes(new Uint8Array(buf))
        return this.mapAdbPackages(decoded.packages || [], feedName)
      } else {
        const packagesText = await response.text()
        return this.parsePackagesFile(packagesText, feedName)
      }
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
   * Map APK v3 ADB package entries to OpenWrtPackage
   */
  private mapAdbPackages(entries: any[], source: string): OpenWrtPackage[] {
    const out: OpenWrtPackage[] = []
    for (const e of entries) {
      if (!e || !e.name || !e.version || !e.arch) continue
      const name: string = e.name
      const version: string = e.version
      const architecture: string = e.arch
      const size: number = Number(e['file-size'] || 0)
      const installedSize: number = Number(e['installed-size'] || 0)
      const description: string = e.description || ''
      const license: string | undefined = e.license
      const url: string | undefined = e.url
      const sha256sum: string = e.hashes || ''
      const dependsRaw: string[] = Array.isArray(e.depends) ? e.depends : []
      const depends: string[] = dependsRaw
        .map(d => this.cleanAdbDependency(String(d)))
        .filter(d => d && d !== 'libc')

      // ADB index does not include section/filename; provide sensible defaults
      const section = ''
      const filename = `${name}_${version}_${architecture}.apk`

      out.push({
        name,
        version,
        depends,
        license,
        section,
        url,
        architecture,
        installedSize,
        filename,
        size,
        sha256sum,
        description,
        source
      })
    }
    return out
  }

  /** Strip version/op from ADB dependency strings like 'foo>=1.2' or '!bar' */
  private cleanAdbDependency(dep: string): string {
    const m = dep.replace(/^!/, '').match(/^([^<>=~\s]+)/)
    return m ? m[1].trim() : dep.trim()
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

  private isSnapshot(version: string): boolean {
    return version === 'SNAPSHOT' || version.endsWith('-SNAPSHOT')
  }

  private isApkVersion(version: string): boolean {
    const list = (config as any).apk_versions as string[] | undefined
    return Array.isArray(list) ? list.includes(version) : false
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
    if (!section) return '无'
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
