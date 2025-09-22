import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string'
import type { SavedConfiguration } from '@/types/config'

const SHARE_FORMAT_VERSION = 1

type SerializedConfiguration = Omit<SavedConfiguration, 'createdAt' | 'updatedAt'> & {
  createdAt: string
  updatedAt: string
}

interface SharedConfigEnvelope {
  v: number
  data: SerializedConfiguration
}

export function encodeConfigurationForUrl(config: SavedConfiguration): string {
  const envelope: SharedConfigEnvelope = {
    v: SHARE_FORMAT_VERSION,
    data: {
      ...config,
      createdAt: config.createdAt.toISOString(),
      updatedAt: config.updatedAt.toISOString()
    }
  }

  const json = JSON.stringify(envelope)
  return compressToEncodedURIComponent(json)
}

export function decodeConfigurationFromUrl(value: string): SavedConfiguration | null {
  try {
    const decompressed = decompressFromEncodedURIComponent(value)
    if (!decompressed) {
      return null
    }

    const envelope = JSON.parse(decompressed) as SharedConfigEnvelope
    if (envelope.v !== SHARE_FORMAT_VERSION) {
      return null
    }

    const data = envelope.data

    return {
      ...data,
      createdAt: new Date(data.createdAt),
      updatedAt: new Date(data.updatedAt)
    }
  } catch (error) {
    console.error('Failed to decode configuration from URL:', error)
    return null
  }
}
