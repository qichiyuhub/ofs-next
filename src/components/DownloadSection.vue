<script setup lang="ts">
import { computed } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useFirmwareStore } from '@/stores/firmware'
import { config } from '@/config'
import type { DeviceImage } from '@/services/api'
import type { AsuBuildResponse } from '@/services/asu'

// Props
const props = defineProps<{
  buildResult?: (AsuBuildResponse & { asu_image_url: string }) | null
}>()

const i18n = useI18nStore()
const firmware = useFirmwareStore()

interface ProcessedImage extends DeviceImage {
  downloadUrl: string
  helpClass: string
  label: string
  priority: number
}

const processedImages = computed(() => {
  // If we have ASU build result, use that instead
  if (props.buildResult?.images) {
    const images = props.buildResult.images.map(image => {
      const processed: ProcessedImage = {
        ...image,
        downloadUrl: `${props.buildResult!.asu_image_url}/${image.name}`,
        helpClass: getHelpTextClass(image),
        label: getImageLabel(image),
        priority: getImagePriority(image.type)
      }
      return processed
    })

    return images.sort((a, b) => a.priority - b.priority)
  }

  // Otherwise use normal firmware images
  if (!firmware.selectedProfile?.images) return []

  const images = firmware.selectedProfile.images.map(image => {
    const processed: ProcessedImage = {
      ...image,
      downloadUrl: firmware.getDownloadUrl(image),
      helpClass: getHelpTextClass(image),
      label: getImageLabel(image),
      priority: getImagePriority(image.type)
    }
    return processed
  })

  // Sort by priority (sysupgrade first, then factory, then others)
  return images.sort((a, b) => a.priority - b.priority)
})

function getImagePriority(type: string): number {
  if (type.includes('sysupgrade')) return 0
  if (type.includes('factory')) return 1
  return 2
}

function getImageLabel(image: DeviceImage): string {
  let label = image.type.toUpperCase()

  // Add differentiating info if multiple images of same type
  const sameTypeImages = firmware.selectedProfile?.images.filter(img => img.type === image.type) || []
  if (sameTypeImages.length > 1) {
    const extra = getNameDifference(firmware.selectedProfile?.images || [], image)
    if (extra) {
      label += ` (${extra})`
    }
  }

  return label
}

function getNameDifference(images: DeviceImage[], targetImage: DeviceImage): string {
  const sameTypeImages = images.filter(img => img.type === targetImage.type)
  if (sameTypeImages.length <= 1) return ''

  const nameParts = targetImage.name.split('-')
  const otherNameParts = sameTypeImages
    .filter(img => img.name !== targetImage.name)
    .map(img => img.name.split('-'))

  // Find unique parts
  const uniqueParts = nameParts.filter(part =>
    !otherNameParts.every(otherParts => otherParts.includes(part))
  )

  return uniqueParts.join('-')
}

function getHelpTextClass(image: DeviceImage): string {
  const type = image.type
  const name = image.name

  if (type.includes('sysupgrade')) {
    return 'tr-sysupgrade-help'
  } else if (type.includes('factory') || type === 'trx' || type === 'chk') {
    return 'tr-factory-help'
  } else if (name.includes('initramfs')) {
    return 'tr-initramfs-help'
  } else if (type.includes('kernel') || type.includes('zimage') || type.includes('uimage')) {
    return 'tr-kernel-help'
  } else if (type.includes('root')) {
    return 'tr-rootfs-help'
  } else if (type.includes('sdcard')) {
    return 'tr-sdcard-help'
  } else if (type.includes('tftp')) {
    return 'tr-tftp-help'
  } else if (type.includes('.dtb')) {
    return 'tr-dtb-help'
  } else if (type.includes('cpximg')) {
    return 'tr-cpximg-help'
  } else if (type.startsWith('eva')) {
    return 'tr-eva-help'
  } else if (type.includes('uboot') || type.includes('u-boot')) {
    return 'tr-uboot-help'
  } else {
    return 'tr-other-help'
  }
}

function getHelpText(helpClass: string): string {
  const helpTexts: Record<string, string> = {
    'tr-sysupgrade-help': i18n.t('tr-sysupgrade-help', '使用 Sysupgrade 映像以更新现有运行 OpenWrt 的设备。该映像可以在 LuCI 界面或终端中使用。').replace('OpenWrt', config.brand_name),
    'tr-factory-help': i18n.t('tr-factory-help', '首次刷机时，使用 Factory 映像以刷入 OpenWrt。通常您可以在原厂固件的 Web 界面中完成此操作。').replace('OpenWrt', config.brand_name),
    'tr-initramfs-help': i18n.t('tr-initramfs-help', '集成最小文件系统的 Linux 内核。适用于首次安装或故障恢复。'),
    'tr-kernel-help': i18n.t('tr-kernel-help', '独立的 Linux 内核映像。'),
    'tr-rootfs-help': i18n.t('tr-rootfs-help', '独立的 rootfs 映像。'),
    'tr-sdcard-help': i18n.t('tr-sdcard-help', '适用于安装至 SD 卡的映像文件。'),
    'tr-tftp-help': i18n.t('tr-tftp-help', '适用于 Bootloader TFTP 模式刷入的映像文件。'),
    'tr-dtb-help': i18n.t('tr-dtb-help', '预编译设备树。此文件用于在 Linux 内核中定义硬件信息。'),
    'tr-cpximg-help': i18n.t('tr-cpximg-help', '用于在原厂固件中系统升级或内置的 cpximg 加载器。'),
    'tr-eva-help': i18n.t('tr-eva-help', '封入固件及引导程序的映像文件。'),
    'tr-uboot-help': i18n.t('tr-uboot-help', '引导程序映像。用于启动时加载操作系统的底层软件。'),
    'tr-other-help': i18n.t('tr-other-help', '其他映像类型。')
  }

  return helpTexts[helpClass] || ''
}

function getImageIcon(type: string): string {
  if (type.includes('sysupgrade')) return 'mdi-update'
  if (type.includes('factory')) return 'mdi-factory'
  if (type.includes('kernel')) return 'mdi-memory'
  if (type.includes('root')) return 'mdi-harddisk'
  if (type.includes('sdcard')) return 'mdi-sd'
  return 'mdi-download'
}

</script>

<template>
  <v-card>
    <v-card-title class="bg-secondary text-white">
      {{ props.buildResult ? i18n.t('tr-custom-downloads', '自定义下载') : i18n.t('tr-downloads', '下载映像') }}
    </v-card-title>

    <v-card-text class="pa-0">
      <v-list>
        <v-list-item
          v-for="(image, index) in processedImages"
          :key="image.name"
          class="py-4"
          :class="{ 'border-b': index < processedImages.length - 1 }"
          lines="three"
        >
          <template #prepend>
            <v-avatar color="primary" variant="tonal">
              <v-icon :icon="getImageIcon(image.type)" />
            </v-avatar>
          </template>

          <v-list-item-title class="d-flex align-center">
            <v-btn
              :href="image.downloadUrl"
              color="primary"
              variant="elevated"
              class="mr-4 download-btn"
              prepend-icon="mdi-download"
            >
              {{ image.label }}
            </v-btn>
          </v-list-item-title>

          <v-list-item-subtitle class="mt-2">
            <div class="text-body-2 mb-2">
              {{ getHelpText(image.helpClass) }}
            </div>
          </v-list-item-subtitle>

          <div class="sha256-hash" v-if="image.sha256">
            <strong>sha256sum:</strong> {{ image.sha256 }}
          </div>
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>
</template>

<style scoped>
.border-b {
  border-bottom: 1px solid rgb(var(--v-border-color));
}

.font-mono {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.75rem;
  word-break: break-all;
}

.sha256-hash {
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.75rem;
  color: #666;
  margin-top: 8px;
  word-break: break-all;
}

.download-btn {
  height: auto !important;
  min-height: 48px !important;
  padding: 12px 16px !important;
}

.download-btn :deep(.v-btn__content) {
  white-space: pre-wrap !important;
  word-break: break-word !important;
  line-height: 1.3 !important;
  text-align: left !important;
  width: 100% !important;
  justify-content: flex-start !important;
}

.download-btn :deep(.v-btn__prepend) {
  align-self: flex-start !important;
  margin-top: 2px !important;
  margin-right: 8px !important;
}
</style>
