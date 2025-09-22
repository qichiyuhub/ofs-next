<script setup lang="ts">
import { ref, computed } from 'vue'
import { useConfigStore } from '@/stores/config'
import type { ConfigurationSummary, ExportOptions } from '@/types/config'

const configStore = useConfigStore()

// Component state
const showSaveDialog = ref(false)
const showLoadDialog = ref(false)
const showImportDialog = ref(false)
const showExportDialog = ref(false)
const isCopyingShareLink = ref(false)
const shareSnackbar = ref(false)
const shareSnackbarMessage = ref('')
const shareSnackbarColor = ref<'success' | 'error'>('success')

const saveForm = ref({
  name: '',
  description: ''
})

const importForm = ref({
  content: '',
  format: 'json' as 'json' | 'yaml'
})

const exportForm = ref({
  configId: '',
  options: {
    includeModuleSources: true,
    includePackages: true,
    includeUciDefaults: true,
    format: 'json' as 'json' | 'yaml'
  } as ExportOptions
})

// File input ref
const fileInput = ref<HTMLInputElement>()

// Computed
const sortedConfigurations = computed(() => {
  return [...configStore.savedConfigurations].sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  )
})

// Methods
async function copyShareLink() {
  if (isCopyingShareLink.value) return

  const result = configStore.getShareConfigParam()
  if (!result.success) {
    shareSnackbarColor.value = 'error'
    shareSnackbarMessage.value = result.message || '生成共享配置失败'
    shareSnackbar.value = true
    return
  }

  const url = new URL(window.location.href)
  url.searchParams.set('config', result.value)

  const shareUrl = url.toString()
  isCopyingShareLink.value = true

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(shareUrl)
    } else {
      const textarea = document.createElement('textarea')
      textarea.value = shareUrl
      textarea.setAttribute('readonly', '')
      textarea.style.position = 'absolute'
      textarea.style.left = '-9999px'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    shareSnackbarColor.value = 'success'
    shareSnackbarMessage.value = '链接已复制，可以分享当前配置。'
  } catch (error) {
    console.error('Failed to copy share link', error)
    shareSnackbarColor.value = 'error'
    shareSnackbarMessage.value = '复制链接失败，请重试。'
  } finally {
    shareSnackbar.value = true
    isCopyingShareLink.value = false
  }
}

function openSaveDialog() {
  if (configStore.currentConfigName) {
    saveForm.value.name = configStore.currentConfigName
  } else {
    saveForm.value.name = `配置 ${new Date().toLocaleDateString()}`
  }
  saveForm.value.description = ''
  showSaveDialog.value = true
}

function closeSaveDialog() {
  showSaveDialog.value = false
  saveForm.value = { name: '', description: '' }
}

async function saveConfiguration() {
  const success = await configStore.saveCurrentConfiguration(
    saveForm.value.name,
    saveForm.value.description
  )
  
  if (success) {
    closeSaveDialog()
  }
}

function openLoadDialog() {
  showLoadDialog.value = true
}

function closeLoadDialog() {
  showLoadDialog.value = false
}

async function loadConfiguration(config: ConfigurationSummary) {
  try {
    const success = await configStore.loadConfiguration(config.id)
    if (success) {
      closeLoadDialog()
    } else {
      // Error is handled by the store and displayed in the error alert
    }
  } catch (error) {
    console.error('Failed to load configuration:', error)
  }
}

function deleteConfiguration(config: ConfigurationSummary, event: Event) {
  event.stopPropagation()
  if (confirm(`确定要删除配置"${config.name}"吗？`)) {
    configStore.deleteConfiguration(config.id)
  }
}

function openImportDialog() {
  importForm.value = { content: '', format: 'json' }
  showImportDialog.value = true
}

function closeImportDialog() {
  showImportDialog.value = false
  importForm.value = { content: '', format: 'json' }
}

function importFromFile() {
  fileInput.value?.click()
}

function handleFileImport(event: Event) {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

  const reader = new FileReader()
  reader.onload = (e) => {
    const content = e.target?.result as string
    if (content) {
      importForm.value.content = content
      importForm.value.format = file.name.endsWith('.yaml') || file.name.endsWith('.yml') ? 'yaml' : 'json'
    }
  }
  reader.readAsText(file)
}

function importConfiguration() {
  const result = configStore.importConfiguration(
    importForm.value.content,
    importForm.value.format
  )
  
  if (result.success) {
    closeImportDialog()
    if (result.warnings?.length) {
      alert(`导入成功，但有以下警告：\n${result.warnings.join('\n')}`)
    }
  } else {
    alert(result.message)
  }
}

function openExportDialog(config: ConfigurationSummary) {
  exportForm.value.configId = config.id
  showExportDialog.value = true
}

function closeExportDialog() {
  showExportDialog.value = false
  exportForm.value = {
    configId: '',
    options: {
      includeModuleSources: true,
      includePackages: true,
      includeUciDefaults: true,
      format: 'json'
    }
  }
}

function exportConfiguration() {
  configStore.exportConfiguration(exportForm.value.configId, exportForm.value.options)
  closeExportDialog()
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(date)
}
</script>

<template>
  <div>
    <!-- Toolbar -->
    <v-card class="mb-4">
      <v-card-title class="d-flex align-center">
        <v-icon icon="mdi-cog-box" class="mr-2" />
        配置管理
        <v-spacer />
        
        <!-- Desktop buttons -->
        <div v-if="!$vuetify.display.mobile" class="d-flex">
          <v-btn
            variant="outlined"
            prepend-icon="mdi-content-save"
            @click="openSaveDialog"
            class="mr-3"
          >
            保存配置
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-folder-open"
            @click="openLoadDialog"
            class="mr-3"
          >
            加载配置
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-link-variant"
            :loading="isCopyingShareLink"
            @click="copyShareLink"
            class="mr-3"
          >
            复制分享链接
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-import"
            @click="openImportDialog"
          >
            导入配置
          </v-btn>
        </div>
        
        <!-- Mobile buttons -->
        <div v-else class="d-flex">
          <v-btn
            icon="mdi-content-save"
            variant="outlined"
            @click="openSaveDialog"
            class="mr-2"
          />
          <v-btn
            icon="mdi-folder-open"
            variant="outlined"
            @click="openLoadDialog"
            class="mr-2"
          />
          <v-btn
            icon="mdi-link-variant"
            variant="outlined"
            :disabled="isCopyingShareLink"
            @click="copyShareLink"
            class="mr-2"
          />
          <v-btn
            icon="mdi-import"
            variant="outlined"
            @click="openImportDialog"
          />
        </div>
      </v-card-title>

    </v-card>

    <!-- Error Alert -->
    <v-alert
      v-if="configStore.error"
      type="error"
      dismissible
      @click:close="configStore.clearError"
      class="mb-4"
    >
      {{ configStore.error }}
    </v-alert>

    <!-- Save Dialog -->
    <v-dialog v-model="showSaveDialog" max-width="500px">
      <v-card>
        <v-card-title>保存配置</v-card-title>
        <v-card-text>
          <v-form>
            <v-text-field
              v-model="saveForm.name"
              label="配置名称"
              required
              variant="outlined"
            />
            <v-textarea
              v-model="saveForm.description"
              label="描述（可选）"
              variant="outlined"
              rows="3"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="closeSaveDialog">取消</v-btn>
          <v-btn
            color="primary"
            :loading="configStore.isLoading"
            :disabled="!saveForm.name"
            @click="saveConfiguration"
          >
            保存
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Load Dialog -->
    <v-dialog v-model="showLoadDialog" max-width="800px" scrollable>
      <v-card>
        <v-card-title>加载配置</v-card-title>
        <v-card-text>
          <div v-if="sortedConfigurations.length === 0" class="text-center py-8">
            <v-icon icon="mdi-folder-open-outline" size="64" color="grey-lighten-1" />
            <p class="text-h6 mt-4 text-grey">暂无保存的配置</p>
          </div>

          <v-list v-else lines="three">
            <v-list-item
              v-for="config in sortedConfigurations"
              :key="config.id"
              @click="loadConfiguration(config)"
              :disabled="configStore.isLoading"
              class="mb-2"
            >
              <template #prepend>
                <v-avatar color="primary">
                  <v-icon icon="mdi-cog" />
                </v-avatar>
              </template>

              <v-list-item-title>{{ config.name }}</v-list-item-title>
              <v-list-item-subtitle>
                <div>{{ config.description || '无描述' }}</div>
                <div class="text-caption">
                  <strong>设备:</strong> {{ config.deviceModel }} | 
                  <strong>版本:</strong> {{ config.version }} | 
                  <strong>模块:</strong> {{ config.moduleCount }} | 
                  <strong>软件包:</strong> {{ config.packageCount }}
                </div>
                <div class="text-caption text-medium-emphasis">
                  更新时间: {{ formatDate(config.updatedAt) }}
                </div>
              </v-list-item-subtitle>

              <template #append>
                <div class="d-flex align-center">
                  <v-btn
                    icon="mdi-export"
                    variant="text"
                    size="small"
                    @click="openExportDialog(config)"
                  />
                  <v-btn
                    icon="mdi-delete"
                    variant="text"
                    size="small"
                    color="error"
                    @click="deleteConfiguration(config, $event)"
                  />
                </div>
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>
        
        <v-progress-linear 
          v-if="configStore.isLoading" 
          indeterminate 
          color="primary"
        />
        
        <v-card-actions>
          <div v-if="configStore.isLoading" class="text-body-2 text-medium-emphasis">
            正在加载配置，请稍候...
          </div>
          <v-spacer />
          <v-btn 
            @click="closeLoadDialog"
            :disabled="configStore.isLoading"
          >
            关闭
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Import Dialog -->
    <v-dialog v-model="showImportDialog" max-width="600px" scrollable>
      <v-card>
        <v-card-title>导入配置</v-card-title>
        <v-card-text>
          <div class="mb-4">
            <v-btn
              variant="outlined"
              prepend-icon="mdi-file"
              @click="importFromFile"
              class="mr-2"
            >
              选择文件
            </v-btn>
            <v-select
              v-model="importForm.format"
              :items="[
                { title: 'JSON', value: 'json' },
                { title: 'YAML', value: 'yaml' }
              ]"
              label="格式"
              variant="outlined"
              density="compact"
              style="max-width: 150px; display: inline-block;"
            />
          </div>

          <v-textarea
            v-model="importForm.content"
            label="配置内容"
            variant="outlined"
            rows="10"
            placeholder="粘贴配置内容或选择文件..."
          />

          <input
            ref="fileInput"
            type="file"
            accept=".json,.yaml,.yml"
            style="display: none"
            @change="handleFileImport"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="closeImportDialog">取消</v-btn>
          <v-btn
            color="primary"
            :disabled="!importForm.content"
            @click="importConfiguration"
          >
            导入
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Export Dialog -->
    <v-dialog v-model="showExportDialog" max-width="500px">
      <v-card>
        <v-card-title>导出配置</v-card-title>
        <v-card-text>
          <v-form>
            <v-select
              v-model="exportForm.options.format"
              :items="[
                { title: 'JSON', value: 'json' },
                { title: 'YAML', value: 'yaml' }
              ]"
              label="导出格式"
              variant="outlined"
            />

            <div class="mt-4">
              <p class="text-subtitle-2 mb-2">导出内容:</p>
              <v-checkbox
                v-model="exportForm.options.includeModuleSources"
                label="包含模块源"
                density="compact"
              />
              <v-checkbox
                v-model="exportForm.options.includePackages"
                label="包含软件包列表"
                density="compact"
              />
              <v-checkbox
                v-model="exportForm.options.includeUciDefaults"
                label="包含UCI默认配置"
                density="compact"
              />
            </div>
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="closeExportDialog">取消</v-btn>
          <v-btn
            color="primary"
            @click="exportConfiguration"
          >
            导出
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar
      v-model="shareSnackbar"
      :color="shareSnackbarColor"
      timeout="3000"
      location="bottom"
    >
      {{ shareSnackbarMessage }}
    </v-snackbar>
  </div>
</template>
