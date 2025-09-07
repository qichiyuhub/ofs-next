// Package management store

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { packageManager } from '@/services/packageManager'
import type { OpenWrtPackage, PackageFeed, PackageSearchFilter } from '@/types/package'

export const usePackageStore = defineStore('package', () => {
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
    
    // Add selected packages
    selectedPackagesList.value.forEach(pkg => packages.push(pkg))
    
    // Add removed packages with - prefix
    removedPackagesList.value.forEach(pkg => packages.push(`-${pkg}`))
    
    return packages
  })

  // Actions
  async function loadPackagesForDevice(version: string, architecture: string, target?: string): Promise<void> {
    isLoading.value = true
    error.value = ''

    try {
      // First, get kernel info if target is provided
      let kernelInfo: { version: string; release: string; vermagic: string } | null = null
      if (target) {
        kernelInfo = await packageManager.fetchKernelInfo(version, target)
      }

      // Generate feed URLs with optional target and kernel info
      const feedUrls = packageManager.generateFeedUrls(version, architecture, target, kernelInfo || undefined)
      
      // Define feed names based on what URLs we got
      const baseFeedNames = ['base', 'luci', 'packages', 'telephony']
      let feedNames = [...baseFeedNames]
      
      if (target) {
        feedNames.push('target-packages')
        if (kernelInfo) {
          feedNames.push('kmods')
        }
      }

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
    if (selectedPackages.value.has(packageName)) {
      removePackage(packageName)
    } else {
      addPackage(packageName)
    }
  }

  function isPackageSelected(packageName: string): boolean {
    return selectedPackages.value.has(packageName)
  }

  function clearSelectedPackages(): void {
    selectedPackages.value.clear()
  }

  function addRemovedPackage(packageName: string): void {
    removedPackages.value.add(packageName)
    // Remove from selected if it was there
    selectedPackages.value.delete(packageName)
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
    selectedPackages.value.clear()
    removedPackages.value.clear()
    // Also clear loaded package data to force reload for new device
    allPackages.value = []
    feeds.value = []
    error.value = ''
  }

  function setSelectedPackages(packages: string[]): void {
    selectedPackages.value = new Set(packages.filter(pkg => !pkg.startsWith('-')))
    removedPackages.value = new Set(packages.filter(pkg => pkg.startsWith('-')).map(pkg => pkg.substring(1)))
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

  function getPackageStatus(packageName: string): 'selected' | 'removed' | 'none' {
    if (selectedPackages.value.has(packageName)) return 'selected'
    if (removedPackages.value.has(packageName)) return 'removed'
    return 'none'
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
    setSelectedPackages,
    getPackageInfo,
    getDependencies,
    getDependents,
    addPackageWithDependencies,
    removePackageWithDependents,
    getSelectedPackagesInfo,
    getTotalSize,
    getPackageStatus,
    clearError,
    setSearchQuery,
    setSelectedSection,
    setSelectedSource,
    clearFilters
  }
})