// OpenWrt package types

export interface OpenWrtPackage {
  name: string // Package name
  version: string
  depends?: string[] // Dependencies (parsed from comma-separated string)
  license?: string
  section: string // Category like 'net', 'utils', 'kernel', etc.
  url?: string // Homepage URL
  cpeId?: string // CPE ID for security tracking
  architecture: string // Target architecture
  installedSize?: number // Size when installed (in bytes)
  filename: string // .ipk filename
  size: number // Download size (in bytes)
  sha256sum: string // File hash
  description: string
  source?: string // Which feed this package comes from (base, luci, packages, telephony)
}

export interface PackageFeed {
  name: string // Feed name: base, luci, packages, telephony
  url: string // Full URL to Packages file
  packages: OpenWrtPackage[]
  lastUpdated?: Date
  isLoading: boolean
  error?: string
}

export interface PackageSearchFilter {
  query?: string // Search in name/description
  section?: string // Filter by section
  architecture?: string // Filter by architecture
  source?: string // Filter by feed source
  installedOnly?: boolean // Show only installed packages
}

export interface PackageInstallInfo {
  name: string
  isInstalled: boolean
  dependencies: string[]
  dependents: string[] // Packages that depend on this one
  size: number
  installedSize: number
}