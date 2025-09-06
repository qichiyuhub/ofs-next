import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface Translation {
  [key: string]: string
}

export const useI18nStore = defineStore('i18n', () => {
  const currentLanguage = ref('zh-cn')
  const currentTranslation = ref<Translation>({})
  const isLoading = ref(false)
  
  const supportedLanguages = [
    { code: 'ar', name: 'العربية (Arabic)' },
    { code: 'ast', name: 'Asturianu (Asturian)' },
    { code: 'bg', name: 'български (Bulgarian)' },
    { code: 'bn', name: 'বাংলা (Bengali)' },
    { code: 'ca', name: 'Català (Catalan)' },
    { code: 'cs', name: 'Čeština (Czech)' },
    { code: 'da', name: 'Dansk (Danish)' },
    { code: 'de', name: 'Deutsch (German)' },
    { code: 'el', name: 'Ελληνικά (Greek)' },
    { code: 'en', name: 'English' },
    { code: 'es', name: 'Español (Spanish)' },
    { code: 'fa', name: 'فارسی (Persian)' },
    { code: 'fi', name: 'Suomalainen (Finnish)' },
    { code: 'fil', name: 'Pilipino (Filipino)' },
    { code: 'fr', name: 'Français (French)' },
    { code: 'ga', name: 'Gaeilge (Irish)' },
    { code: 'gl', name: 'Galego (Galician)' },
    { code: 'hi', name: 'हिंदी (Hindi)' },
    { code: 'hu', name: 'Magyar (Hungarian)' },
    { code: 'id', name: 'Bahasa Indonesia (Indonesian)' },
    { code: 'it', name: 'Italiano (Italian)' },
    { code: 'ja', name: '日本 (Japanese)' },
    { code: 'ka', name: 'ქართული (Georgian)' },
    { code: 'ko', name: '한국어 (Korean)' },
    { code: 'lt', name: 'Lietuvių (Lithuanian)' },
    { code: 'lv', name: 'Latviešu (Latvian)' },
    { code: 'ml', name: 'മലയാളം (Malayalam)' },
    { code: 'mr', name: 'मराठी (Marathi)' },
    { code: 'no', name: 'Norsk (Norwegian)' },
    { code: 'pl', name: 'Polski (Polish)' },
    { code: 'pt', name: 'Português (Portuguese)' },
    { code: 'pt-br', name: 'Português do Brasil (Brazilian Portuguese)' },
    { code: 'ro', name: 'Română (Romanian)' },
    { code: 'ru', name: 'Русский (Russian)' },
    { code: 'sgs', name: 'Žemaitiu kalba (Samogitian)' },
    { code: 'sr_Cyrl', name: 'Српски (Serbian)' },
    { code: 'sr_Latn', name: 'Srpski (Serbian)' },
    { code: 'sk', name: 'Slovenčina (Slovak)' },
    { code: 'sv', name: 'Svenska (Swedish)' },
    { code: 'ta', name: 'தமிழ் (Tamil)' },
    { code: 'te', name: 'తెలుగు (Telugu)' },
    { code: 'tr', name: 'Türkçe (Turkish)' },
    { code: 'uk', name: 'Українська (Ukrainian)' },
    { code: 'vi', name: 'Tiếng Việt (Vietnamese)' },
    { code: 'zh-cn', name: '简体中文 (Chinese Simplified)' },
    { code: 'zh-tw', name: '繁體中文 (Chinese Traditional)' }
  ]

  const currentLanguageName = computed(() => {
    const lang = supportedLanguages.find(l => l.code === currentLanguage.value)
    return lang ? lang.name.replace(/ \(.*/, '') : 'English'
  })

  async function loadTranslation(lang: string, force: boolean = false) {
    if (!force && lang === currentLanguage.value && Object.keys(currentTranslation.value).length > 0) {
      return
    }
    
    isLoading.value = true
    try {
      const response = await fetch(`/langs/${lang}.json`)
      if (response.ok) {
        const translation = await response.json()
        currentTranslation.value = translation
        currentLanguage.value = lang
      } else {
        throw new Error(`Failed to fetch translation for ${lang}`)
      }
    } catch (error) {
      console.error('Failed to load translation:', error)
      if (lang !== 'en') {
        // Fallback to English
        await loadTranslation('en', force)
      }
    } finally {
      isLoading.value = false
    }
  }

  async function changeLanguage(lang: string) {
    await loadTranslation(lang, true)
  }

  function t(key: string, fallback?: string): string {
    return currentTranslation.value[key] || fallback || key
  }

  // Auto-detect language
  function detectLanguage() {
    const long = (navigator.language || (navigator as any).userLanguage || 'en').toLowerCase()
    const short = long.split('-')[0]
    
    if (supportedLanguages.find(l => l.code === long)) {
      return long
    } else if (supportedLanguages.find(l => l.code === short)) {
      return short
    } else {
      return 'zh-cn' // Default to Chinese
    }
  }

  return {
    currentLanguage,
    currentTranslation,
    currentLanguageName,
    supportedLanguages,
    isLoading,
    loadTranslation,
    changeLanguage,
    detectLanguage,
    t
  }
})