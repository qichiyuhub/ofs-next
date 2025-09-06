<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useI18nStore } from '@/stores/i18n'
import { useFirmwareStore } from '@/stores/firmware'

const props = defineProps<{
  modelValue: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const i18n = useI18nStore()
const firmware = useFirmwareStore()

const searchInput = ref('')
const isMenuOpen = ref(false)
const inputRef = ref<HTMLInputElement>()

// Computed properties for search functionality
const searchTerm = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value)
})

const searchPatterns = computed(() => {
  if (!searchInput.value) return []
  return searchInput.value.toUpperCase().match(/[^\s,]+/g) || []
})

const filteredDevices = computed(() => {
  if (!searchPatterns.value.length) return []
  
  const matches = firmware.deviceTitles.filter(title => {
    const upperTitle = title.toUpperCase()
    return searchPatterns.value.every(pattern => 
      upperTitle.includes(pattern)
    )
  })
  
  // Sort matches by relevance and limit to 15
  return matches
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .slice(0, 15)
})

const hasMatches = computed(() => filteredDevices.value.length > 0)

// Watch for changes in search input
watch(searchInput, async (newValue) => {
  if (newValue && firmware.deviceTitles.includes(newValue)) {
    // Exact match found
    searchTerm.value = newValue
    isMenuOpen.value = false
  } else {
    // Partial match, show suggestions
    isMenuOpen.value = newValue.length > 0 && filteredDevices.value.length > 0
  }
})

function selectDevice(deviceTitle: string) {
  searchInput.value = deviceTitle
  searchTerm.value = deviceTitle
  isMenuOpen.value = false
}

function onInputFocus() {
  if (searchInput.value && filteredDevices.value.length > 0) {
    isMenuOpen.value = true
  }
}

function onInputBlur() {
  // Delay closing to allow for item selection
  setTimeout(() => {
    isMenuOpen.value = false
  }, 200)
}

function onKeyDown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    if (filteredDevices.value.length === 1) {
      selectDevice(filteredDevices.value[0])
    } else if (firmware.deviceTitles.includes(searchInput.value)) {
      selectDevice(searchInput.value)
    }
  } else if (event.key === 'Escape') {
    isMenuOpen.value = false
    inputRef.value?.blur()
  }
}

// Highlight matching text
function highlightMatches(text: string): string {
  if (!searchPatterns.value.length) return text
  
  let result = text
  const upperText = text.toUpperCase()
  
  // Find all matches
  const matches: Array<{start: number, end: number}> = []
  
  for (const pattern of searchPatterns.value) {
    let startIndex = 0
    let matchIndex = upperText.indexOf(pattern, startIndex)
    
    while (matchIndex !== -1) {
      matches.push({
        start: matchIndex,
        end: matchIndex + pattern.length
      })
      startIndex = matchIndex + 1
      matchIndex = upperText.indexOf(pattern, startIndex)
    }
  }
  
  // Sort matches by start position
  matches.sort((a, b) => a.start - b.start)
  
  // Merge overlapping matches
  const mergedMatches: Array<{start: number, end: number}> = []
  for (const match of matches) {
    if (mergedMatches.length === 0) {
      mergedMatches.push(match)
    } else {
      const lastMatch = mergedMatches[mergedMatches.length - 1]
      if (match.start <= lastMatch.end) {
        lastMatch.end = Math.max(lastMatch.end, match.end)
      } else {
        mergedMatches.push(match)
      }
    }
  }
  
  // Build highlighted result
  let highlightedResult = ''
  let lastEnd = 0
  
  for (const match of mergedMatches) {
    highlightedResult += text.substring(lastEnd, match.start)
    highlightedResult += `<strong>${text.substring(match.start, match.end)}</strong>`
    lastEnd = match.end
  }
  highlightedResult += text.substring(lastEnd)
  
  return highlightedResult
}
</script>

<template>
  <div class="position-relative">
    <v-text-field
      ref="inputRef"
      v-model="searchInput"
      :label="i18n.t('tr-model', '型号')"
      variant="outlined"
      density="comfortable"
      :loading="firmware.isLoadingDevices"
      autofocus
      @focus="onInputFocus"
      @blur="onInputBlur"
      @keydown="onKeyDown"
    />
    
    <!-- Suggestions Menu -->
    <v-menu
      v-model="isMenuOpen"
      :close-on-content-click="false"
      location="bottom"
      offset="4"
      max-height="300"
      :activator="inputRef"
    >
      <v-list v-if="hasMatches" density="compact">
        <v-list-item
          v-for="device in filteredDevices"
          :key="device"
          @click="selectDevice(device)"
          class="cursor-pointer"
        >
          <v-list-item-title>
            <span v-html="highlightMatches(device)" />
          </v-list-item-title>
        </v-list-item>
        
        <v-list-item v-if="filteredDevices.length >= 15">
          <v-list-item-title class="text-medium-emphasis">
            ...
          </v-list-item-title>
        </v-list-item>
      </v-list>
    </v-menu>
  </div>
</template>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}

:deep(strong) {
  font-weight: bold;
  color: rgb(var(--v-theme-primary));
}
</style>