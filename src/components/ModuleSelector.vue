<script setup lang="ts">
import { ref, computed } from 'vue'
import { useModuleStore } from '@/stores/module'
import { moduleValidationService } from '@/services/moduleValidation'
import type { Module, ModuleSource, ModuleSelection } from '@/types/module'

const moduleStore = useModuleStore()

// Component state
const expandedPanels = ref<string[]>([])
const showParameterDialog = ref(false)
const currentModule = ref<{ module: Module; source: ModuleSource } | null>(null)

// Computed
const groupedModules = computed(() => {
  const groups: { [category: string]: Array<{ module: Module; source: ModuleSource }> } = {}
  
  for (const source of moduleStore.sources) {
    for (const module of source.modules) {
      const category = module.definition.category || 'uncategorized'
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push({ module, source })
    }
  }
  
  return groups
})

const selectedCount = computed(() => moduleStore.selections.length)

const validationSummary = computed(() => {
  const result = moduleStore.validateAllSelections()
  return {
    isValid: result.isValid,
    errorCount: Object.keys(result.errors).length,
    errors: result.errors
  }
})

// Check if a module has validation errors
function hasValidationErrors(source: ModuleSource, module: Module): boolean {
  if (!moduleStore.isModuleSelected(source.id, module.id)) return false
  
  const result = moduleStore.validateModuleSelection(source.id, module.id)
  return !result.isValid
}

// Methods
function toggleModule(source: ModuleSource, module: Module) {
  if (moduleStore.isModuleSelected(source.id, module.id)) {
    moduleStore.deselectModule(source.id, module.id)
  } else {
    moduleStore.selectModule(source.id, module.id)
    
    // Show parameter dialog if module has parameterized files or user downloads
    if (hasConfigurableParameters(module)) {
      openParameterDialog(module, source)
    }
  }
}

function hasConfigurableParameters(module: Module): boolean {
  return !!(module.definition.parameterized_files?.length || 
            module.definition.downloads?.some(d => !d.url))
}

function openParameterDialog(module: Module, source: ModuleSource) {
  // Ensure module is selected before configuring parameters
  if (!moduleStore.isModuleSelected(source.id, module.id)) {
    moduleStore.selectModule(source.id, module.id)
  }
  
  currentModule.value = { module, source }
  showParameterDialog.value = true
}

function closeParameterDialog() {
  showParameterDialog.value = false
  currentModule.value = null
}

function getParameterKey(filePath: string, paramName: string): string {
  return `${filePath}:${paramName}`
}

function getParameterValue(selection: ModuleSelection, filePath: string, paramName: string): string {
  const key = getParameterKey(filePath, paramName)
  return selection.parameters[key] || ''
}

function updateParameter(selection: ModuleSelection, filePath: string, paramName: string, value: string) {
  const key = getParameterKey(filePath, paramName)
  moduleStore.updateModuleParameter(selection.sourceId, selection.moduleId, key, value)
}

function getCategoryIcon(category: string): string {
  const icons: { [key: string]: string } = {
    network: 'mdi-network',
    system: 'mdi-cog',
    applications: 'mdi-application',
    security: 'mdi-shield',
    storage: 'mdi-harddisk',
    multimedia: 'mdi-play-circle',
    development: 'mdi-code-tags',
    uncategorized: 'mdi-package-variant'
  }
  return icons[category] || 'mdi-package-variant'
}

function getCategoryName(category: string): string {
  const names: { [key: string]: string } = {
    network: '网络',
    system: '系统',
    applications: '应用',
    security: '安全',
    storage: '存储',
    multimedia: '多媒体',
    development: '开发',
    uncategorized: '未分类'
  }
  return names[category] || category
}

function formatTags(tags: string[]): string {
  return tags.join(', ')
}

function getAuthorInfo(module: Module): string {
  return module.definition.email ? 
    `${module.definition.author} <${module.definition.email}>` : 
    module.definition.author
}

// Get validation rules for a parameter
function getParameterRules(param: any) {
  return moduleValidationService.getVuetifyRules(param)
}

// Get download URL validation rules
function getDownloadRules() {
  return moduleValidationService.getDownloadUrlRules()
}

// Get module name by key for error display
function getModuleNameByKey(moduleKey: string): string {
  const [sourceId, moduleId] = moduleKey.split(':')
  const source = moduleStore.sources.find(s => s.id === sourceId)
  const module = source?.modules.find(m => m.id === moduleId)
  
  if (module && source) {
    return `${module.definition.name} (${source.name})`
  }
  
  return moduleKey
}
</script>

<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <v-icon icon="mdi-puzzle" class="mr-2" />
      模块选择
      <v-spacer />
      <div v-if="selectedCount > 0" class="d-flex align-center gap-2">
        <v-chip color="primary">
          已选择 {{ selectedCount }} 个模块
        </v-chip>
        <v-chip 
          v-if="!validationSummary.isValid" 
          color="error" 
          variant="outlined"
        >
          {{ validationSummary.errorCount }} 个验证错误
        </v-chip>
        <v-chip 
          v-if="validationSummary.isValid && selectedCount > 0" 
          color="success" 
          variant="outlined"
          prepend-icon="mdi-check"
        >
          参数验证通过
        </v-chip>
      </div>
    </v-card-title>

    <v-card-text>
      <!-- Validation Error Summary -->
      <v-alert
        v-if="!validationSummary.isValid && selectedCount > 0"
        type="error"
        variant="tonal"
        class="mb-4"
        dismissible
      >
        <template #title>
          <div class="d-flex align-center">
            <v-icon icon="mdi-alert-circle" class="mr-2" />
            发现 {{ validationSummary.errorCount }} 个参数验证错误
          </div>
        </template>
        
        <div class="mt-2">
          <div v-for="(errors, moduleKey) in validationSummary.errors" :key="moduleKey" class="mb-2">
            <strong class="text-error">{{ getModuleNameByKey(String(moduleKey)) }}:</strong>
            <ul class="ml-4 mt-1">
              <li v-for="error in errors" :key="error" class="text-body-2">{{ error }}</li>
            </ul>
          </div>
          <div class="text-body-2 text-medium-emphasis mt-3">
            点击对应模块的"配置参数"按钮进行修正
          </div>
        </div>
      </v-alert>

      <div v-if="moduleStore.totalModules === 0" class="text-center py-8">
        <v-icon icon="mdi-puzzle-outline" size="64" color="grey-lighten-1" />
        <p class="text-h6 mt-4 text-grey">暂无可用模块</p>
        <p class="text-grey">请先添加模块源</p>
      </div>

      <v-expansion-panels v-else v-model="expandedPanels" multiple>
        <v-expansion-panel
          v-for="(modules, category) in groupedModules"
          :key="category"
          :value="category"
        >
          <v-expansion-panel-title>
            <template #default="{ expanded }">
              <v-icon :icon="getCategoryIcon(String(category))" class="mr-3" />
              {{ getCategoryName(String(category)) }}
              <v-spacer />
              <v-chip size="small" color="primary" variant="tonal">
                {{ modules.length }}
              </v-chip>
            </template>
          </v-expansion-panel-title>

          <v-expansion-panel-text>
            <v-row>
              <v-col
                v-for="{ module, source } in modules"
                :key="`${source.id}-${module.id}`"
                cols="12"
                md="6"
              >
                <v-card
                  variant="outlined"
                  :class="{ 'border-primary': moduleStore.isModuleSelected(source.id, module.id) }"
                  height="300"
                  class="d-flex flex-column"
                >
                  <v-card-title class="d-flex align-center">
                    <v-checkbox
                      :model-value="moduleStore.isModuleSelected(source.id, module.id)"
                      @update:model-value="toggleModule(source, module)"
                      hide-details
                      class="mr-2"
                    />
                    {{ module.definition.name }}
                    <v-spacer />
                    <v-chip 
                      v-if="hasValidationErrors(source, module)"
                      size="x-small" 
                      color="error" 
                      class="mr-2"
                    >
                      参数错误
                    </v-chip>
                    <v-chip size="x-small" color="secondary">
                      v{{ module.definition.version }}
                    </v-chip>
                  </v-card-title>

                  <v-card-text class="flex-grow-1 d-flex flex-column">
                    <div class="flex-grow-1">
                      <p class="text-body-2 mb-2">
                        {{ module.definition.description.zh_CN || module.definition.description.en }}
                      </p>

                      <div class="text-caption text-grey mb-2">
                        <strong>作者:</strong> {{ getAuthorInfo(module) }}
                      </div>

                      <div class="text-caption text-grey mb-2">
                        <strong>模块源:</strong> {{ source.name }}
                      </div>

                      <div class="text-caption text-grey mb-2">
                        <strong>许可证:</strong> {{ module.definition.license }}
                      </div>

                      <div v-if="module.definition.tags?.length" class="text-caption text-grey mb-2">
                        <strong>标签:</strong> {{ formatTags(module.definition.tags) }}
                      </div>

                      <div v-if="module.definition.packages?.length" class="text-caption text-grey mb-2">
                        <strong>软件包:</strong> {{ module.definition.packages.join(', ') }}
                      </div>
                    </div>

                    <div v-if="hasConfigurableParameters(module)" class="mt-auto">
                      <v-btn
                        size="small"
                        variant="outlined"
                        prepend-icon="mdi-cog"
                        @click="openParameterDialog(module, source)"
                      >
                        配置参数
                      </v-btn>
                    </div>
                  </v-card-text>
                </v-card>
              </v-col>
            </v-row>
          </v-expansion-panel-text>
        </v-expansion-panel>
      </v-expansion-panels>
    </v-card-text>

    <!-- Parameter Configuration Dialog -->
    <v-dialog v-model="showParameterDialog" max-width="800px" scrollable>
      <v-card v-if="currentModule">
        <v-card-title>
          <v-icon icon="mdi-cog" class="mr-2" />
          配置模块: {{ currentModule.module.definition.name }}
        </v-card-title>

        <v-card-text>
          <div v-if="currentModule.module.definition.parameterized_files?.length">
            <h3 class="text-h6 mb-4">参数化文件配置</h3>
            
            <v-expansion-panels class="mb-6">
              <v-expansion-panel
                v-for="paramFile in currentModule.module.definition.parameterized_files"
                :key="paramFile.file"
              >
                <v-expansion-panel-title>
                  <v-icon icon="mdi-file-cog" class="mr-2" />
                  {{ paramFile.file }}
                </v-expansion-panel-title>
                
                <v-expansion-panel-text>
                  <v-form>
                    <div
                      v-for="param in paramFile.parameters"
                      :key="param.name"
                      class="mb-4"
                    >
                      <v-text-field
                        :model-value="getParameterValue(
                          moduleStore.getModuleSelection(currentModule.source.id, currentModule.module.id)!,
                          paramFile.file,
                          param.name
                        )"
                        @update:model-value="updateParameter(
                          moduleStore.getModuleSelection(currentModule.source.id, currentModule.module.id)!,
                          paramFile.file,
                          param.name,
                          $event
                        )"
                        :label="param.name"
                        :placeholder="param.default"
                        :hint="param.description"
                        :required="param.required"
                        persistent-hint
                        :rules="getParameterRules(param)"
                      />
                    </div>
                  </v-form>
                </v-expansion-panel-text>
              </v-expansion-panel>
            </v-expansion-panels>
          </div>

          <div v-if="currentModule.module.definition.downloads?.some(d => !d.url)">
            <h3 class="text-h6 mb-4">用户自定义下载</h3>
            
            <div
              v-for="download in currentModule.module.definition.downloads.filter(d => !d.url)"
              :key="download.name"
              class="mb-4"
            >
              <v-text-field
                :model-value="moduleStore.getModuleSelection(currentModule.source.id, currentModule.module.id)?.userDownloads[download.name] || ''"
                @update:model-value="moduleStore.updateUserDownload(
                  currentModule.source.id,
                  currentModule.module.id,
                  download.name,
                  $event
                )"
                :label="`${download.name} URL`"
                :hint="`文件将下载到: ${download.path}`"
                placeholder="https://example.com/file"
                persistent-hint
                :rules="getDownloadRules()"
              />
              
              <div v-if="download.headers?.length" class="text-caption text-grey mt-1">
                <strong>请求头:</strong> {{ download.headers.join(', ') }}
              </div>
            </div>
          </div>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn @click="closeParameterDialog">关闭</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>