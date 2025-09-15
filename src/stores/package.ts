// Package management store

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { packageManager } from '@/services/packageManager'
import { useFirmwareStore } from '@/stores/firmware'
import type { OpenWrtPackage, PackageFeed, PackageSearchFilter } from '@/types/package'

export const usePackageStore = defineStore('package', () => {
  const firmwareStore = useFirmwareStore()
  // State
  const feeds = ref<PackageFeed[]>([])
  const selectedPackages = ref<Set<string>>(new Set())
  const removedPackages = ref<Set<string>>(new Set())
  const isLoading = ref(false)
  const error = ref<string>('')

  // Search and filters
  const searchQuery = ref('')
  const selectedSection = ref('')
  const selectedSource = ref('')

  // Computed
  const allPackages = computed(() => {
    return feeds.value.flatMap(feed => feed.packages)
  })

  const filteredPackages = computed(() => {
    const filter: PackageSearchFilter = {
      query: searchQuery.value,
      section: selectedSection.value || undefined,
      source: selectedSource.value || undefined
    }
    return packageManager.searchPackages(allPackages.value, filter)
  })

  const packageSections = computed(() => {
    return packageManager.getPackageSections(allPackages.value)
  })

  const packageSources = computed(() => {
    return [...new Set(feeds.value.map(feed => feed.name))]
  })

  const totalPackages = computed(() => allPackages.value.length)

  const selectedPackagesList = computed(() => {
    return Array.from(selectedPackages.value)
  })

  const removedPackagesList = computed(() => {
    return Array.from(removedPackages.value)
  })

  // Build packages list with proper prefixes
  const buildPackagesList = computed(() => {
    const packages: string[] = []
    const defaultPackages = firmwareStore.selectedProfile?.default_packages || []
    
    // Start with default packages, excluding those marked for removal
    defaultPackages.forEach(pkg => {
      if (!removedPackages.value.has(pkg)) {
        packages.push(pkg)
      }
    })
    
    // Add explicitly selected non-default packages
    selectedPackagesList.value.forEach(pkg => {
      if (!defaultPackages.includes(pkg)) {
        packages.push(pkg)
      }
    })
    
    // Add removed packages with - prefix (only for default packages that are explicitly removed)
    removedPackagesList.value.forEach(pkg => {
      if (defaultPackages.includes(pkg)) {
        packages.push(`-${pkg}`)
      }
    })
    
    return packages
  })

  // Actions
  async function loadPackagesForDevice(version: string, architecture: string, target?: string): Promise<void> {
    isLoading.value = true
    error.value = ''

    try {
      // First, try kernel info from selectedProfile to avoid extra profiles.json requests
      const kernelInfo: { version: string; release: string; vermagic: string } | null =
        firmwareStore.selectedProfile ? firmwareStore.selectedProfile.linux_kernel : null

      // Generate feed URLs with optional target and kernel info
      const feedUrls = packageManager.generateFeedUrls(version, architecture, target, kernelInfo || undefined)
      
      // Define feed names based on what URLs we got
      const baseFeedNames = ['base', 'luci', 'packages', 'telephony']
      const feedNames = [
        ...baseFeedNames,
        ...(target ? ['target-packages'] : []),
        ...(target && kernelInfo ? ['kmods'] : [])
      ]

      // Reset feeds
      feeds.value = feedNames.map((name, index) => ({
        name,
        url: feedUrls[index] || '',
        packages: [],
        isLoading: true,
        error: undefined
      })).filter(feed => feed.url) // Only include feeds with valid URLs

      // Load all feeds in parallel
      const loadPromises = feeds.value.map(async (feed) => {
        try {
          const packages = await packageManager.fetchFeedPackages(feed.url, feed.name)
          feed.packages = packages
          feed.lastUpdated = new Date()
          feed.isLoading = false
        } catch (err) {
          console.error(`Failed to load ${feed.name} feed:`, err)
          feed.error = `加载失败: ${err instanceof Error ? err.message : '未知错误'}`
          feed.isLoading = false
        }
      })

      await Promise.all(loadPromises)
    } catch (err) {
      error.value = `加载软件包列表失败: ${err instanceof Error ? err.message : '未知错误'}`
    } finally {
      isLoading.value = false
    }
  }

  function addPackage(packageName: string): void {
    selectedPackages.value.add(packageName)
  }

  function removePackage(packageName: string): void {
    selectedPackages.value.delete(packageName)
  }

  function togglePackage(packageName: string): void {
    const isDefaultPackage = isPackageInDefaults(packageName)
    
    if (isDefaultPackage) {
      // If it's a default package, toggle between normal state and removed state
      if (removedPackages.value.has(packageName)) {
        removeRemovedPackage(packageName) // Remove from removed list (back to default)
      } else {
        addRemovedPackage(packageName) // Add to removed list (will be excluded)
      }
    } else {
      // If it's not a default package, toggle between not selected and selected
      if (selectedPackages.value.has(packageName)) {
        removePackage(packageName) // Remove from selected list
      } else {
        addPackage(packageName) // Add to selected list
      }
    }
  }

  function isPackageInDefaults(packageName: string): boolean {
    const defaultPackages = firmwareStore.selectedProfile?.default_packages || []
    return defaultPackages.includes(packageName)
  }

  function isPackageSelected(packageName: string): boolean {
    const isDefaultPackage = isPackageInDefaults(packageName)
    
    if (isDefaultPackage) {
      // For default packages, "selected" means not in removed list
      return !removedPackages.value.has(packageName)
    } else {
      // For non-default packages, "selected" means in selected list
      return selectedPackages.value.has(packageName)
    }
  }

  function clearSelectedPackages(): void {
    selectedPackages.value.clear()
  }

  function addRemovedPackage(packageName: string): void {
    // Only allow removing packages that are in the default package list
    if (isPackageInDefaults(packageName)) {
      removedPackages.value.add(packageName)
      // Remove from selected if it was there
      selectedPackages.value.delete(packageName)
    }
  }

  function removeRemovedPackage(packageName: string): void {
    removedPackages.value.delete(packageName)
  }

  function isPackageRemoved(packageName: string): boolean {
    return removedPackages.value.has(packageName)
  }

  function clearRemovedPackages(): void {
    removedPackages.value.clear()
  }

  function clearAllPackages(): void {
    selectedPackages.value.clear() // Clear explicitly added packages
    removedPackages.value.clear()  // Clear explicitly removed default packages
    // Also clear loaded package data to force reload for new device
    feeds.value = []
    error.value = ''
  }

  function addCustomFeedPackages(feedName: string, packages: OpenWrtPackage[]): void {
    // Check if this feed already exists
    const existingFeedIndex = feeds.value.findIndex(feed => feed.name === feedName)
    
    if (existingFeedIndex >= 0) {
      // Update existing feed
      feeds.value[existingFeedIndex].packages = packages
      feeds.value[existingFeedIndex].lastUpdated = new Date()
      feeds.value[existingFeedIndex].isLoading = false
      feeds.value[existingFeedIndex].error = undefined
    } else {
      // Add new feed
      feeds.value.push({
        name: feedName,
        url: '', // Custom feeds don't need to store URL here
        packages,
        isLoading: false,
        lastUpdated: new Date()
      })
    }

    // allPackages is computed from feeds, no need to update manually
  }

  function removeCustomFeedPackages(feedName: string): void {
    const feedIndex = feeds.value.findIndex(feed => feed.name === feedName)
    if (feedIndex >= 0) {
      feeds.value.splice(feedIndex, 1)
      // allPackages is computed from feeds, no need to update manually
    }
  }

  function setSelectedPackages(packages: string[]): void {
    const defaultPackages = firmwareStore.selectedProfile?.default_packages || []
    
    // 只将非默认包添加到 selectedPackages
    selectedPackages.value = new Set(packages.filter(pkg => 
      !pkg.startsWith('-') && !defaultPackages.includes(pkg)
    ))
    
    // 处理被移除的默认包
    removedPackages.value = new Set(packages.filter(pkg => pkg.startsWith('-')).map(pkg => pkg.substring(1)))
  }

  // 新增：设置用户包配置（更清晰的API）
  function setPackageConfiguration(config: { addedPackages: string[]; removedPackages: string[] }): void {
    selectedPackages.value = new Set(config.addedPackages)
    removedPackages.value = new Set(config.removedPackages)
  }

  // 新增：获取用户包配置（用于导出）
  function getPackageConfiguration(): { addedPackages: string[]; removedPackages: string[] } {
    return {
      addedPackages: Array.from(selectedPackages.value),
      removedPackages: Array.from(removedPackages.value)
    }
  }

  function getPackageInfo(packageName: string): OpenWrtPackage | undefined {
    return allPackages.value.find(pkg => pkg.name === packageName)
  }

  function getDependencies(packageName: string): string[] {
    return packageManager.getDependencyTree(packageName, allPackages.value)
  }

  function getDependents(packageName: string): string[] {
    return packageManager.getDependents(packageName, allPackages.value)
  }

  function addPackageWithDependencies(packageName: string): void {
    const dependencies = getDependencies(packageName)
    
    // Add the package itself
    addPackage(packageName)
    
    // Add all dependencies
    dependencies.forEach(dep => addPackage(dep))
  }

  function removePackageWithDependents(packageName: string): void {
    const dependents = getDependents(packageName)
    
    // Remove all dependents first
    dependents.forEach(dep => removePackage(dep))
    
    // Remove the package itself
    removePackage(packageName)
  }

  function getSelectedPackagesInfo(): Array<{ name: string; size: number; installedSize: number }> {
    return selectedPackagesList.value
      .map(name => {
        const pkg = getPackageInfo(name)
        return pkg ? {
          name,
          size: pkg.size,
          installedSize: pkg.installedSize || 0
        } : null
      })
      .filter(Boolean) as Array<{ name: string; size: number; installedSize: number }>
  }

  function getTotalSize(): { downloadSize: number; installedSize: number } {
    const info = getSelectedPackagesInfo()
    return {
      downloadSize: info.reduce((sum, pkg) => sum + pkg.size, 0),
      installedSize: info.reduce((sum, pkg) => sum + pkg.installedSize, 0)
    }
  }

  function getPackageStatus(packageName: string): 'selected' | 'removed' | 'default' | 'none' {
    const isDefaultPackage = isPackageInDefaults(packageName)
    
    if (isDefaultPackage) {
      // Default packages are "selected" by default, unless explicitly removed
      return removedPackages.value.has(packageName) ? 'removed' : 'default'
    } else {
      // Non-default packages are "none" by default, unless explicitly selected
      return selectedPackages.value.has(packageName) ? 'selected' : 'none'
    }
  }

  function clearError(): void {
    error.value = ''
  }

  function setSearchQuery(query: string): void {
    searchQuery.value = query
  }

  function setSelectedSection(section: string): void {
    selectedSection.value = section
  }

  function setSelectedSource(source: string): void {
    selectedSource.value = source
  }

  function clearFilters(): void {
    searchQuery.value = ''
    selectedSection.value = ''
    selectedSource.value = ''
  }

  return {
    // State
    feeds,
    selectedPackages,
    removedPackages,
    isLoading,
    error,
    searchQuery,
    selectedSection,
    selectedSource,

    // Computed
    allPackages,
    filteredPackages,
    packageSections,
    packageSources,
    totalPackages,
    selectedPackagesList,
    removedPackagesList,
    buildPackagesList,

    // Actions
    loadPackagesForDevice,
    addPackage,
    removePackage,
    togglePackage,
    isPackageSelected,
    clearSelectedPackages,
    addRemovedPackage,
    removeRemovedPackage,
    isPackageRemoved,
    clearRemovedPackages,
    clearAllPackages,
    addCustomFeedPackages,
    removeCustomFeedPackages,
    setSelectedPackages,
    setPackageConfiguration,
    getPackageConfiguration,
    getPackageInfo,
    getDependencies,
    getDependents,
    addPackageWithDependencies,
    removePackageWithDependents,
    getSelectedPackagesInfo,
    getTotalSize,
    getPackageStatus,
    isPackageInDefaults,
    clearError,
    setSearchQuery,
    setSelectedSection,
    setSelectedSource,
    clearFilters
  }
})
