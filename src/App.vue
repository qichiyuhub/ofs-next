<script setup lang="ts">
import { onMounted } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useFirmwareStore } from '@/stores/firmware'
import { config } from '@/config'
import FirmwareSelector from '@/components/FirmwareSelector.vue'

const i18nStore = useI18nStore()
const firmwareStore = useFirmwareStore()

onMounted(async () => {
  // Initialize translation
  const lang = i18nStore.detectLanguage()
  await i18nStore.loadTranslation(lang)
  
  // Initialize firmware data
  await firmwareStore.loadVersions()
  if (firmwareStore.currentVersion) {
    await firmwareStore.loadDevices(firmwareStore.currentVersion)
  }
})
</script>

<template>
  <v-app>
    <v-app-bar elevation="2" color="primary" theme="dark">
      <div class="d-flex align-center w-100">
        <a :href="config.homepage_url" target="_blank" rel="noopener noreferrer">
          <img
            src="/logo.svg"
            :alt="`${config.brand_name} Logo`"
            width="180"
            height="40"
            class="mr-4"
            style="cursor: pointer;"
          />
        </a>
        
        <v-spacer />
        
        <div class="d-flex align-center">
          <v-select
            v-model="i18nStore.currentLanguage"
            :items="i18nStore.supportedLanguages"
            item-title="name"
            item-value="code"
            density="compact"
            variant="outlined"
            hide-details
            style="min-width: 200px"
            @update:model-value="i18nStore.changeLanguage"
            class="mr-2"
          >
            <template #selection="{ item }">
              {{ item.raw.name.replace(/ \(.*/, '') }}
            </template>
          </v-select>
        </div>
      </div>
    </v-app-bar>

    <v-main>
      <v-container>
        <!-- Alert -->
        <v-alert
          v-if="firmwareStore.alertMessage"
          type="error"
          dismissible
          @click:close="firmwareStore.clearAlert"
          class="mb-4"
        >
          {{ firmwareStore.alertMessage }}
        </v-alert>

        <FirmwareSelector />
      </v-container>
    </v-main>
  </v-app>
</template>
