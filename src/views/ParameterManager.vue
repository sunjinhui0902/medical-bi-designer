<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  IconArrowLeft,
  IconBraces,
  IconCheck,
  IconCopy,
  IconDatabase,
  IconDeviceFloppy,
  IconEdit,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTable,
  IconTrash,
} from '@tabler/icons-vue'
import { BUILTIN_DICTIONARIES_V3 } from '../data/builtinDictionaries'
import { SYSTEM_PARAMETER_TEMPLATES_V3 } from '../data/systemParameters'
import type {
  ParameterDefinitionV3,
  ParameterTypeV3,
  ParameterValueSourceV3,
} from '../models/parameters'
import type { DashboardApplicationV3 } from '../models/dashboard-v3'
import {
  ParameterRegistryErrorV3,
  ParameterRegistryV3,
} from '../services/parameterRegistry'
import {
  loadDashboardApplicationV3,
  saveDashboardApplicationV3,
} from '../services/dashboardStorageV3'

interface OptionForm {
  label: string
  value: string
}

interface ParameterForm {
  id: string
  code: string
  name: string
  type: ParameterTypeV3
  required: boolean
  hasDefault: boolean
  defaultValue: string
  rangeStart: string
  rangeEnd: string
  sourceKind: ParameterValueSourceV3['kind']
  dictionaryCode: string
  systemCode: string
  options: OptionForm[]
}

const query = ref('')
const parameters = ref<ParameterDefinitionV3[]>([])
const selectedId = ref('')
const feedback = ref('正在读取 V3 草稿…')
const feedbackTone = ref<'neutral' | 'success' | 'error'>('neutral')
const application = ref<DashboardApplicationV3 | null>(null)
let registry = new ParameterRegistryV3()

const form = reactive<ParameterForm>(emptyForm())
const selected = computed(() => parameters.value.find((item) => item.id === selectedId.value))
const filteredParameters = computed(() => {
  const keyword = query.value.trim().toLocaleLowerCase()
  if (!keyword) return parameters.value
  return parameters.value.filter((parameter) =>
    parameter.code.toLocaleLowerCase().includes(keyword)
    || parameter.name.toLocaleLowerCase().includes(keyword)
    || (parameter.aliases || []).some((alias) => alias.toLocaleLowerCase().includes(keyword)))
})

function emptyForm(): ParameterForm {
  return {
    id: '',
    code: '',
    name: '',
    type: 'string',
    required: false,
    hasDefault: false,
    defaultValue: '',
    rangeStart: '',
    rangeEnd: '',
    sourceKind: 'static',
    dictionaryCode: 'builtin.year',
    systemCode: 'currentDate',
    options: [],
  }
}

function resetForm(): void {
  Object.assign(form, emptyForm())
  selectedId.value = ''
  setFeedback('正在新建应用参数', 'neutral')
}

function editParameter(parameter: ParameterDefinitionV3): void {
  selectedId.value = parameter.id
  const defaultValue = parameter.defaultValue
  const range = parameter.type === 'dateRange' && Array.isArray(defaultValue)
    ? defaultValue
    : ['', '']
  Object.assign(form, {
    id: parameter.id,
    code: parameter.code,
    name: parameter.name,
    type: parameter.type,
    required: parameter.required,
    hasDefault: defaultValue !== undefined,
    defaultValue: parameter.type === 'multiSelect' && Array.isArray(defaultValue)
      ? defaultValue.join(', ')
      : parameter.type === 'dateRange'
        ? ''
        : defaultValue === undefined ? '' : String(defaultValue),
    rangeStart: String(range[0] || ''),
    rangeEnd: String(range[1] || ''),
    sourceKind: parameter.source.kind,
    dictionaryCode: parameter.source.kind === 'dictionary'
      ? parameter.source.dictionaryCode
      : 'builtin.year',
    systemCode: parameter.source.kind === 'system'
      ? parameter.source.systemCode
      : 'currentDate',
    options: parameter.source.kind === 'static'
      ? parameter.source.options.map((option) => ({
          label: option.label,
          value: String(option.value),
        }))
      : [],
  })
}

function buildDefaultValue(): unknown {
  if (!form.hasDefault) return undefined
  if (form.type === 'number') {
    const value = Number(form.defaultValue)
    if (!Number.isFinite(value)) throw new Error('数字默认值格式无效')
    return value
  }
  if (form.type === 'dateRange') return [form.rangeStart, form.rangeEnd]
  if (form.type === 'multiSelect') {
    return form.defaultValue.split(',').map((item) => item.trim()).filter(Boolean)
  }
  return form.defaultValue
}

function buildSource(): ParameterValueSourceV3 {
  if (form.sourceKind === 'dictionary') {
    return { kind: 'dictionary', dictionaryCode: form.dictionaryCode }
  }
  if (form.sourceKind === 'system') {
    return { kind: 'system', systemCode: form.systemCode }
  }
  return {
    kind: 'static',
    options: form.options.map((option) => ({
      label: option.label.trim(),
      value: form.type === 'number' ? Number(option.value) : option.value,
    })),
  }
}

function buildDefinition(): Omit<ParameterDefinitionV3, 'id'> {
  return {
    code: form.code.trim(),
    name: form.name.trim(),
    type: form.type,
    scope: 'application',
    required: form.required,
    ...(form.hasDefault ? { defaultValue: buildDefaultValue() } : {}),
    source: buildSource(),
    validation: { allowEmpty: !form.required },
    aliases: [],
  }
}

function persistRegistry(message: string): boolean {
  if (!application.value) return false
  application.value.parameters = registry.toJSON()
  const result = saveDashboardApplicationV3(localStorage, application.value)
  if (!result.success) {
    setFeedback(result.errors.join('；'), 'error')
    return false
  }
  parameters.value = registry.list()
  setFeedback(message, 'success')
  return true
}

function saveParameter(): void {
  try {
    const definition = buildDefinition()
    const saved = form.id
      ? registry.update(form.id, definition)
      : registry.create(definition)
    if (persistRegistry(form.id ? '参数修改已保存' : '参数已创建')) {
      editParameter(saved)
    }
  } catch (error) {
    showError(error)
  }
}

function copyParameter(parameter: ParameterDefinitionV3): void {
  try {
    const copied = registry.copy(parameter.id)
    if (persistRegistry('参数副本已创建')) editParameter(copied)
  } catch (error) {
    showError(error)
  }
}

function removeParameter(parameter: ParameterDefinitionV3): void {
  if (!window.confirm(`确认删除参数“${parameter.name}（${parameter.code}）”？`)) return
  registry.remove(parameter.id)
  if (persistRegistry('参数已删除')) {
    if (selectedId.value === parameter.id) resetForm()
  }
}

function createFromTemplate(code: string): void {
  try {
    const parameter = registry.createFromTemplate(code)
    if (persistRegistry('系统参数模板已创建')) editParameter(parameter)
  } catch (error) {
    showError(error)
  }
}

function addOption(): void {
  form.options.push({ label: '', value: '' })
}

function removeOption(index: number): void {
  form.options.splice(index, 1)
}

function showError(error: unknown): void {
  if (error instanceof ParameterRegistryErrorV3) {
    setFeedback(error.issues.map((item) => item.message).join('；'), 'error')
    return
  }
  setFeedback(error instanceof Error ? error.message : '参数操作失败', 'error')
}

function setFeedback(message: string, tone: 'neutral' | 'success' | 'error'): void {
  feedback.value = message
  feedbackTone.value = tone
}

function sourceLabel(parameter: ParameterDefinitionV3): string {
  if (parameter.source.kind === 'dictionary') return `字典 · ${parameter.source.dictionaryCode}`
  if (parameter.source.kind === 'system') return `系统 · ${parameter.source.systemCode}`
  if (parameter.source.kind === 'dataset') return `数据集 · ${parameter.source.datasetId}`
  return `静态 · ${parameter.source.options.length} 项`
}

function defaultLabel(parameter: ParameterDefinitionV3): string {
  if (parameter.defaultValue === undefined) return '未设置'
  if (Array.isArray(parameter.defaultValue)) return parameter.defaultValue.join(' — ')
  return String(parameter.defaultValue)
}

onMounted(() => {
  const result = loadDashboardApplicationV3(localStorage)
  application.value = result.application
  try {
    registry = new ParameterRegistryV3(result.application.parameters)
    parameters.value = registry.list()
    const details = [
      `来源：${result.source.toUpperCase()}`,
      result.persisted ? 'V3 草稿已就绪' : '当前为内存草稿',
      ...result.warnings,
      ...result.errors,
    ]
    setFeedback(details.join(' · '), result.errors.length ? 'error' : 'success')
  } catch (error) {
    showError(error)
  }
})
</script>

<template>
  <div class="parameter-center">
    <header class="parameter-toolbar">
      <div class="parameter-brand">
        <span><IconBraces :size="21" /></span>
        <div><b>医疗 BI Parameter Center</b><small>Phase7 · 应用参数定义</small></div>
      </div>
      <nav>
        <RouterLink to="/"><IconArrowLeft :size="16" />返回设计器</RouterLink>
        <RouterLink to="/data-sources"><IconDatabase :size="16" />数据源</RouterLink>
        <RouterLink to="/datasets"><IconTable :size="16" />数据集</RouterLink>
      </nav>
    </header>

    <main class="parameter-layout">
      <aside class="parameter-sidebar">
        <div class="parameter-section-title">
          <div><small>SYSTEM TEMPLATES</small><h1>系统参数模板</h1></div>
          <span>{{ SYSTEM_PARAMETER_TEMPLATES_V3.length }}</span>
        </div>
        <p>模板只创建参数定义，不读取机构、医生或数据集。</p>
        <div class="template-list">
          <button
            v-for="template in SYSTEM_PARAMETER_TEMPLATES_V3"
            :key="template.code"
            type="button"
            @click="createFromTemplate(template.code)"
          >
            <span><b>{{ template.name }}</b><code>{{ template.code }}</code></span>
            <IconPlus :size="15" />
          </button>
        </div>
        <div class="dictionary-summary">
          <small>BUILT-IN DICTIONARIES</small>
          <div v-for="dictionary in BUILTIN_DICTIONARIES_V3" :key="dictionary.code">
            <span>{{ dictionary.name }}</span><code>{{ dictionary.code }}</code>
          </div>
        </div>
      </aside>

      <section class="parameter-catalog">
        <div class="parameter-section-title">
          <div><small>APPLICATION PARAMETERS</small><h1>参数中心</h1></div>
          <button type="button" aria-label="新建参数" @click="resetForm"><IconPlus :size="17" /></button>
        </div>
        <label class="parameter-search">
          <IconSearch :size="16" />
          <input v-model="query" type="search" placeholder="搜索名称、编码或别名" />
        </label>
        <div class="parameter-items">
          <article
            v-for="parameter in filteredParameters"
            :key="parameter.id"
            :class="{ active: selectedId === parameter.id }"
            @click="editParameter(parameter)"
          >
            <div><b>{{ parameter.name }}</b><code>{{ parameter.code }}</code></div>
            <span>{{ parameter.type }}</span>
            <small>{{ sourceLabel(parameter) }}</small>
            <div class="parameter-item-actions">
              <button type="button" title="编辑" @click.stop="editParameter(parameter)"><IconEdit :size="14" /></button>
              <button type="button" title="复制" @click.stop="copyParameter(parameter)"><IconCopy :size="14" /></button>
              <button type="button" title="删除" @click.stop="removeParameter(parameter)"><IconTrash :size="14" /></button>
            </div>
          </article>
          <div v-if="!filteredParameters.length" class="parameter-empty">
            <IconSettings :size="28" />
            <b>暂无匹配参数</b>
            <span>新建参数或使用左侧系统模板。</span>
          </div>
        </div>
      </section>

      <section class="parameter-editor">
        <div class="parameter-editor-head">
          <div><small>PARAMETER DEFINITION</small><h2>{{ form.id ? `编辑 ${form.name}` : '新建应用参数' }}</h2></div>
          <span :class="`tone-${feedbackTone}`"><IconCheck v-if="feedbackTone === 'success'" :size="14" />{{ feedback }}</span>
        </div>

        <form @submit.prevent="saveParameter">
          <div class="parameter-form-grid">
            <label>参数名称<input v-model="form.name" placeholder="例如：统计年度" /></label>
            <label>参数编码<input v-model="form.code" placeholder="例如：year_code" /></label>
            <label>参数类型
              <select v-model="form.type">
                <option value="string">字符串</option>
                <option value="number">数字</option>
                <option value="date">日期</option>
                <option value="dateRange">日期范围</option>
                <option value="singleSelect">单选</option>
                <option value="multiSelect">多选</option>
              </select>
            </label>
            <label>数据来源
              <select v-model="form.sourceKind">
                <option value="static">静态选项</option>
                <option value="dictionary">内置字典</option>
                <option value="system">系统上下文</option>
              </select>
            </label>
          </div>

          <div class="parameter-flags">
            <label><input v-model="form.required" type="checkbox" />必填参数</label>
            <label><input v-model="form.hasDefault" type="checkbox" />设置默认值</label>
            <span>范围固定为 application</span>
          </div>

          <div v-if="form.hasDefault" class="parameter-default">
            <template v-if="form.type === 'dateRange'">
              <label>开始日期<input v-model="form.rangeStart" type="date" /></label>
              <label>结束日期<input v-model="form.rangeEnd" type="date" /></label>
            </template>
            <label v-else>默认值
              <input
                v-model="form.defaultValue"
                :type="form.type === 'number' ? 'number' : form.type === 'date' ? 'date' : 'text'"
                :placeholder="form.type === 'multiSelect' ? '多个值使用逗号分隔' : '输入默认值'"
              />
            </label>
          </div>

          <div v-if="form.sourceKind === 'dictionary'" class="parameter-source-block">
            <label>内置字典
              <select v-model="form.dictionaryCode">
                <option v-for="dictionary in BUILTIN_DICTIONARIES_V3" :key="dictionary.code" :value="dictionary.code">
                  {{ dictionary.name }}（{{ dictionary.code }}）
                </option>
              </select>
            </label>
          </div>

          <div v-else-if="form.sourceKind === 'system'" class="parameter-source-block">
            <label>系统来源
              <select v-model="form.systemCode"><option value="currentDate">当前日期</option></select>
            </label>
            <p>Phase7 只保存受控系统来源定义，不计算运行值。</p>
          </div>

          <div v-else class="parameter-source-block">
            <div class="source-block-head">
              <span><b>静态选项</b><small>选项值在同一参数内必须唯一</small></span>
              <button type="button" @click="addOption"><IconPlus :size="14" />添加选项</button>
            </div>
            <div class="option-list">
              <div v-for="(option, index) in form.options" :key="index">
                <input v-model="option.label" placeholder="显示名称" />
                <input v-model="option.value" placeholder="选项值" />
                <button type="button" aria-label="删除选项" @click="removeOption(index)"><IconTrash :size="14" /></button>
              </div>
              <p v-if="!form.options.length">暂无静态选项；字符串、机构和医生模板可以保持为空。</p>
            </div>
          </div>

          <div v-if="selected" class="parameter-preview">
            <small>CURRENT VALUE</small>
            <span>默认值：{{ defaultLabel(selected) }}</span>
            <code>{{ selected.id }}</code>
          </div>

          <div class="parameter-form-actions">
            <button type="button" @click="resetForm">取消 / 新建</button>
            <button class="primary" type="submit"><IconDeviceFloppy :size="15" />保存到 V3 草稿</button>
          </div>
        </form>
      </section>
    </main>
  </div>
</template>

<style src="../styles/parameter-manager.css"></style>
