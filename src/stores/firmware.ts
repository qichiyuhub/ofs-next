import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ApiService, type DeviceProfile, type OverviewResponse, type DeviceImage } from '@/services/api'
import { config } from '@/config'

export interface ProcessedDevice {
  id: string
  target: string
  title: string
  profile: DeviceProfile
}

export const useFirmwareStore = defineStore('firmware', () => {
  const apiService = new ApiService(config.image_url)

  // State
  const versions = ref<string[]>(config.versions)
  const defaultVersion = ref(config.default_version)
  const currentVersion = ref('')
  const imageUrlOverride = ref<string>()

  const devices = ref<Record<string, ProcessedDevice>>({})
  const selectedDevice = ref<ProcessedDevice | null>(null)
  const selectedProfile = ref<DeviceProfile | null>(null)

  const isLoadingVersions = ref(false)
  const isLoadingDevices = ref(false)
  const isLoadingProfile = ref(false)

  const alertMessage = ref('')

  // Computed
  const deviceTitles = computed(() => Object.keys(devices.value))

  const imageUrls = computed(() => {
    const urls: Record<string, string> = {}
    const baseUrl = imageUrlOverride.value || '../misc'

    versions.value.forEach(version => {
      if (version === 'SNAPSHOT') {
        urls[version] = `${baseUrl}/snapshots/`
      } else {
        urls[version] = `${baseUrl}/releases/${version}`
      }
    })

    return urls
  })

  // Actions
  async function loadVersions() {
    isLoadingVersions.value = true
    try {
      const response = await apiService.getVersions()

      // Filter out unsupported versions
      const unsupportedVersionsRe = /^(19\.07\.\d|18\.06\.\d|17\.01\.\d)$/
      let filteredVersions = response.versions_list.filter(version =>
        !unsupportedVersionsRe.test(version)
      )

      // Add snapshot versions if enabled
      if (config.show_snapshots) {
        filteredVersions = insertSnapshotVersions(filteredVersions)
      }

      versions.value = filteredVersions

      if (response.stable_version) {
        defaultVersion.value = response.stable_version
      }

      if (response.image_url_override) {
        imageUrlOverride.value = response.image_url_override
      }

      // Set current version if not already set
      if (!currentVersion.value) {
        currentVersion.value = defaultVersion.value
      }

    } catch (error) {
      console.error('Failed to load versions:', error)
      alertMessage.value = `Failed to load versions: ${error}`
    } finally {
      isLoadingVersions.value = false
    }
  }

  async function loadDevices(version: string) {
    if (!version) return

    isLoadingDevices.value = true
    try {
      const overview = await apiService.getOverview(version, imageUrlOverride.value)

      const processedDevices: Record<string, ProcessedDevice> = {}
      const duplicates: Record<string, ProcessedDevice> = {}

      // Process profiles and handle duplicates
      for (const profile of overview.profiles) {
        const titles = getModelTitles(profile.titles)

        for (const title of titles) {
          if (title.length === 0) {
            console.warn(`Empty device title for model id: ${profile.target}, ${profile.id}`)
            continue
          }

          const device: ProcessedDevice = {
            id: profile.id,
            target: profile.target,
            title: title,
            profile: profile
          }

          // Handle duplicates by appending target
          const titleUpper = title.toUpperCase()
          if (titleUpper in duplicates) {
            device.title += ` (${profile.target})`
            const existing = duplicates[titleUpper]
            if (existing.title.toUpperCase() === titleUpper) {
              existing.title += ` (${existing.target})`
              processedDevices[existing.title] = existing
            }
          } else {
            duplicates[titleUpper] = device
          }

          processedDevices[device.title] = device
        }
      }

      devices.value = processedDevices

    } catch (error) {
      console.error('Failed to load devices:', error)
      alertMessage.value = `Failed to load devices: ${error}`
    } finally {
      isLoadingDevices.value = false
    }
  }

  async function selectDevice(title: string) {
    const device = devices.value[title]
    if (!device) {
      selectedDevice.value = null
      selectedProfile.value = null
      return
    }

    isLoadingProfile.value = true
    try {
      const profiles = await apiService.getProfiles(
        currentVersion.value,
        device.target,
        imageUrlOverride.value
      )

      const profile = profiles.profiles[device.id]
      if (profile) {
        selectedProfile.value = {
          ...profile,
          version_number: profiles.version_number,
          version_code: profiles.version_code,
          build_at: profiles.build_at,
          default_packages: profiles.default_packages,
          arch_packages: profiles.arch_packages,
          linux_kernel: profiles.linux_kernel,
          target: device.target
        }
        selectedDevice.value = device
      }

    } catch (error) {
      console.error('Failed to load device profile:', error)
      alertMessage.value = `Failed to load device profile: ${error}`
    } finally {
      isLoadingProfile.value = false
    }
  }

  function clearAlert() {
    alertMessage.value = ''
  }

  function insertSnapshotVersions(versions: string[]): string[] {
    const result = [...versions]
    
    // Add branch snapshots for each version
    for (const version of versions) {
      const branch = version.split('.').slice(0, -1).join('.') + '-SNAPSHOT'
      if (!result.includes(branch)) {
        result.push(branch)
      }
    }
    
    // Add main SNAPSHOT
    result.push('SNAPSHOT')
    
    return result
  }

  function getModelTitles(titles: Array<{title?: string, vendor: string, model: string, variant?: string}>): string[] {
    return titles.map((e) => {
      if (e.title) {
        return e.title
      } else {
        return (
          (e.vendor || '') +
          ' ' +
          (e.model || '') +
          ' ' +
          (e.variant || '')
        ).trim()
      }
    })
  }

  function getImageFolder(): string {
    if (!selectedDevice.value || !currentVersion.value) return ''

    return apiService.buildImageFolder(
      currentVersion.value,
      selectedDevice.value.target,
      imageUrlOverride.value
    )
  }

  function getDownloadUrl(image: DeviceImage): string {
    const folder = getImageFolder()
    return apiService.buildDownloadUrl(folder, image.name)
  }

  function formatDate(date: string): string {
    if (date) {
      const d = Date.parse(date)
      return new Date(d).toLocaleString()
    }
    return date
  }

  async function changeVersion(version: string) {
    currentVersion.value = version
    selectedDevice.value = null
    selectedProfile.value = null
    await loadDevices(version)
  }

  return {
    // State
    versions,
    defaultVersion,
    currentVersion,
    devices,
    selectedDevice,
    selectedProfile,
    isLoadingVersions,
    isLoadingDevices,
    isLoadingProfile,
    alertMessage,

    // Computed
    deviceTitles,
    imageUrls,

    // Actions
    loadVersions,
    loadDevices,
    selectDevice,
    clearAlert,
    getImageFolder,
    getDownloadUrl,
    formatDate,
    changeVersion
  }
})
