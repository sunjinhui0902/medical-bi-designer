<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import {
  IconActivityHeartbeat,
  IconBed,
  IconBraces,
  IconBuildingHospital,
  IconChartBar,
  IconChartLine,
  IconChartPie,
  IconChevronDown,
  IconCode,
  IconDatabase,
  IconDeviceDesktopAnalytics,
  IconDeviceFloppy,
  IconDots,
  IconEye,
  IconEyeOff,
  IconFileExport,
  IconFileImport,
  IconGripVertical,
  IconLayoutDashboard,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTable,
  IconTrash,
  IconTrendingUp,
  IconTypography,
} from '@tabler/icons-vue'
import DataChart from '../components/DataChart.vue'
import DatasetCatalog, { type CatalogDataset, type CatalogField } from '../components/DatasetCatalog.vue'
import { findBuiltinDictionaryV3 } from '../data/builtinDictionaries'
import { getMockDataset, mockDatasets } from '../data/mockDatasets'
import type { ComponentDataConfigV3, DatasetQueryParameterV3, QueryResult } from '../models/bi'
import {
  createDefaultDashboardApplicationV3,
  type DashboardApplicationV3,
  type ParameterControlV3,
} from '../models/dashboard-v3'
import type { ParameterDefinitionV3 } from '../models/parameters'
import type { ComponentType, DashboardComponent, DashboardModelV2, Position } from '../models/dashboard'
import {
  applyDesignerDashboardToApplicationV3,
  createDefaultPageDesignerAdapterV3,
} from '../services/dashboardDesignerAdapterV3'
import {
  suggestDatasetParameterBindingsV3,
  upgradeComponentDataConfigV3,
  validateDatasetParameterBindingsV3,
} from '../services/datasetParameterBindingV3'
import {
  exportDashboardApplicationV3,
  importDashboardApplicationV3,
  loadDashboardApplicationV3,
  saveDashboardApplicationV3,
} from '../services/dashboardStorageV3'
import { comparisonColor, comparisonRate, formatKpiValue, targetProgress } from '../services/kpi'
import { ParameterRuntimeStoreV3 } from '../services/parameterRuntimeV3'
import {
  componentsAffectedByParameterCommitV3,
  componentsForPageEnterV3,
  resolveDatasetParameterValuesV3,
} from '../services/parameterRefreshV3'
import { createQueryRuntimeKeyV3, QueryRuntimeCacheV3 } from '../services/queryRuntimeCacheV3'
import { instantiateMedicalTemplate, normalizeMedicalTemplates, saveMedicalTemplate, type MedicalComponentTemplate } from '../services/componentTemplates'
import { buildComponentDataView, normalizeQueryResult } from '../services/queryResult'

type PropertyTab = 'data' | 'style' | 'interaction' | 'layout' | 'advanced'
type ResizeDirection = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w'

interface DesignerField extends CatalogField { label: string }
interface PointerAction {
  id: string
  mode: 'move' | 'resize'
  direction?: ResizeDirection
  startClientX: number
  startClientY: number
  start: Position
}

const TEMPLATE_STORAGE_KEY = 'medical-bi-designer-component-templates-v1'
const MIN_COMPONENT_WIDTH = 120
const MIN_COMPONENT_HEIGHT = 78
const queryRuntimeCache = new QueryRuntimeCacheV3<Record<string, unknown>>({ ttlMs: 15_000, maxEntries: 50 })
const resizeDirections: ResizeDirection[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w']

const catalog = [
  { group: '基础组件', label: '指标卡', type: 'kpi' as const, icon: IconActivityHeartbeat, tone: 'blue' },
  { group: '基础组件', label: '折线图', type: 'line' as const, icon: IconChartLine, tone: 'cyan' },
  { group: '基础组件', label: '柱状图', type: 'bar' as const, icon: IconChartBar, tone: 'orange' },
  { group: '基础组件', label: '面积图', type: 'area' as const, icon: IconChartLine, tone: 'cyan' },
  { group: '基础组件', label: '组合图', type: 'combo' as const, icon: IconDeviceDesktopAnalytics, tone: 'blue' },
  { group: '基础组件', label: '散点图', type: 'scatter' as const, icon: IconActivityHeartbeat, tone: 'purple' },
  { group: '基础组件', label: '气泡图', type: 'bubble' as const, icon: IconActivityHeartbeat, tone: 'green' },
  { group: '基础组件', label: '饼图', type: 'pie' as const, icon: IconChartPie, tone: 'purple' },
  { group: '基础组件', label: '数据表格', type: 'table' as const, icon: IconTable, tone: 'green' },
  { group: '基础组件', label: '文本', type: 'text' as const, icon: IconTypography, tone: 'slate' },
  { group: '医疗业务组件', label: '收入分析卡', type: 'income' as const, icon: IconTrendingUp, tone: 'blue' },
  { group: '医疗业务组件', label: '门诊趋势', type: 'outpatient' as const, icon: IconBuildingHospital, tone: 'cyan' },
  { group: '医疗业务组件', label: '科室排名', type: 'ranking' as const, icon: IconChartBar, tone: 'orange' },
  { group: '医疗业务组件', label: '床位利用率', type: 'bed' as const, icon: IconBed, tone: 'green' },
]
const tabs: Array<{ id: PropertyTab; label: string }> = [
  { id: 'data', label: '字段' }, { id: 'style', label: '样式' }, { id: 'interaction', label: '交互' },
  { id: 'layout', label: '布局' }, { id: 'advanced', label: '高级' },
]

const dashboardApplication = ref<DashboardApplicationV3>(
  createDefaultDashboardApplicationV3({ name: '医院运营概览' }),
)
const dashboard = ref<DashboardModelV2>(createDefaultDashboard())
const activeTab = ref<PropertyTab>('data')
const query = ref('')
const showBasicComponents = ref(true)
const showMedicalComponents = ref(true)
const medicalTemplates = ref<MedicalComponentTemplate[]>([])
const leftPanelWidth = ref(210)
const rightPanelWidth = ref(330)
const selectedId = ref('kpi_income')
const previewMode = ref(false)
const saveState = ref('未保存')
const canvasElement = ref<HTMLDivElement | null>(null)
const importInput = ref<HTMLInputElement | null>(null)
const datasetCatalogOpen = ref(false)
const serverDatasets = ref<Record<string, CatalogDataset>>({})
const runtimeDatasets = ref<Record<string, QueryResult>>({})
const datasetLoading = ref<Record<string, boolean>>({})
const datasetErrors = ref<Record<string, string>>({})
const parameterRuntime = shallowRef<ParameterRuntimeStoreV3 | null>(null)
const parameterRuntimeValues = ref<Record<string, unknown>>({})
const pendingControlValues = ref<Record<string, unknown>>({})
let pointerAction: PointerAction | null = null
let panelResize: { side: 'left' | 'right'; startX: number; startWidth: number } | null = null
let stateTimer: number | undefined
let medicalTemplateClickTimer: number | undefined

const components = computed(() => dashboard.value.components)
const selected = computed(() => components.value.find((component) => component.id === selectedId.value))
const visibleTabs = computed(() => selected.value ? tabs : tabs.filter((item) => ['style', 'layout', 'advanced'].includes(item.id)))
const selectedMedicalTemplate = computed(() => selected.value ? medicalTemplates.value.find((item) => item.sourceComponentId === selected.value?.id) : undefined)
const activePageControls = computed(() => dashboardApplication.value.pages
  .find((page) => page.id === dashboardApplication.value.defaultPageId)?.controls ?? [])
const medicalTemplateGroups = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  const filtered = keyword
    ? medicalTemplates.value.filter((item) => `${item.name} ${item.category}`.toLowerCase().includes(keyword))
    : medicalTemplates.value
  return [...new Set(filtered.map((item) => item.category))].sort((a, b) => a.localeCompare(b, 'zh-CN'))
    .map((category) => ({ category, items: filtered.filter((item) => item.category === category) }))
})
const dashboardJson = computed(() => JSON.stringify(
  applyDesignerDashboardToApplicationV3(dashboardApplication.value, dashboard.value),
  null,
  2,
))
const selectedJson = computed(() => selected.value ? JSON.stringify(selected.value, null, 2) : '{}')
const selectedDimensionField = computed({
  get: () => selected.value?.dataConfig.dimensions[0]?.field ?? '',
  set: (field: string) => {
    if (!selected.value) return
    selected.value.dataConfig.dimensions = field ? [{ field, role: 'category' }] : []
    markDirty()
  },
})
const selectedMeasureField = computed({
  get: () => selected.value?.dataConfig.measures[0]?.field ?? '',
  set: (field: string) => {
    if (!selected.value) return
    selected.value.dataConfig.measures = field ? [{ field, aggregation: 'sum', axis: 'left' }] : []
    markDirty()
  },
})
const workspaceStyle = computed(() => ({
  gridTemplateColumns: `${leftPanelWidth.value}px minmax(0, 1fr) ${rightPanelWidth.value}px`,
}))
const artboardWidth = computed(() => Math.max(dashboard.value.canvas.width + 58, 658))
const canvasBackground = computed(() => ({
  width: `${dashboard.value.canvas.width}px`,
  height: `${dashboard.value.canvas.height}px`,
  backgroundColor: dashboard.value.canvas.background,
  '--grid-size': `${dashboard.value.canvas.gridSize}px`,
}))

const groupedCatalog = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  const filtered = keyword ? catalog.filter((item) => item.label.toLowerCase().includes(keyword)) : catalog
  const order = showBasicComponents.value ? ['基础组件', '医疗业务组件'] : ['医疗业务组件']
  return order
    .filter((label) => label !== '基础组件' || showBasicComponents.value)
    .filter((label) => label !== '医疗业务组件' || showMedicalComponents.value)
    .map((label) => ({ label, items: filtered.filter((item) => item.group === label) }))
    .filter((group) => group.items.length)
})

function createDefaultDashboard(): DashboardModelV2 {
  return {
    version: 2,
    name: '医院运营概览',
    canvas: { width: 1200, height: 600, background: '#f7f9fb', showGrid: true, gridSize: 12 },
    titleStyle: { show: true, fontSize: 24, color: '#243447', fontWeight: 700, align: 'left' },
    components: [
      createComponent('kpi_income', 'income', '总收入', 0, 0, 185, 112, 'income_month', 'month_code', 'amount'),
      createComponent('kpi_visit', 'kpi', '门诊量', 200, 0, 185, 112, 'op_visit_month', 'month_code', 'visit_count'),
      createComponent('kpi_bed', 'bed', '床位利用率', 400, 0, 185, 112, 'bed_usage', 'dept_name', 'usage_rate'),
      createComponent('chart_income', 'line', '收入趋势', 0, 128, 385, 272, 'income_month', 'month_code', 'amount'),
      createComponent('chart_dept', 'ranking', '科室收入排名', 400, 128, 185, 272, 'dept_income_rank', 'dept_name', 'amount'),
    ],
  }
}

function createComponent(id: string, type: ComponentType, title: string, x: number, y: number, width: number, height: number, datasetId = 'income_month', dimension = 'month_code', field = 'amount'): DashboardComponent {
  return {
    id, type, title,
    position: { x, y, width, height, zIndex: 1 },
    dataConfig: {
      version: 2,
      sourceKind: 'mock',
      datasetId,
      dimensions: dimension ? [{ field: dimension, role: 'category' }] : [],
      measures: field ? [{ field, aggregation: type === 'bed' ? 'avg' : 'sum', axis: 'left', chartType: type === 'bar' || type === 'ranking' ? 'bar' : type === 'area' ? 'area' : type === 'combo' ? 'bar' : 'line', labelConfig: { show: false, showCategory: false, showSeries: false, mode: 'value', decimals: 0, position: 'top', unit: '', percentageBase: 'category' } }] : [],
      filters: [],
      sort: [],
      limit: 200,
    },
    styleConfig: { background: '#ffffff', titleColor: '#243447', titleSize: 10, titleWeight: 650, titleVisible: true },
    ...(isChart(type) ? { analysisConfig: { xMin: null, xMax: null, yLeftMin: null, yLeftMax: null, yRightMin: null, yRightMax: null, showLabels: false, labelDecimals: 0, labelPosition: 'top' as const, labelMode: 'value' as const, labelShowCategory: false, labelShowSeries: false, labelUnit: '', percentageBase: 'category' as const, leftAxisTitle: '', leftAxisUnit: '', leftAxisColor: '#64748b', rightAxisTitle: '', rightAxisUnit: '', rightAxisColor: '#64748b', legendVisible: true, legendPosition: 'bottom' as const, warningLines: [] } } : {}),
    ...(isKpi(type) ? { kpiConfig: { primaryMeasureField: field, unit: '', decimals: type === 'bed' ? 1 : 0, useGrouping: true, yoyField: '', momField: '', positiveColor: '#2f9e44', negativeColor: '#d9485f', targetMode: 'fixed' as const, targetValue: 0, targetField: '', showProgress: false, progressColor: '#1477c9' } } : {}),
    ...(type === 'table' ? { tableConfig: { columns: [
      ...(dimension ? [{ field: dimension, label: dimension, width: 120, format: 'auto' as const, summary: 'none' as const }] : []),
      ...(field ? [{ field, label: field, width: 120, format: 'number' as const, summary: 'none' as const }] : []),
    ], striped: true, showHeader: true } } : {}),
  }
}

function defaultSize(type: ComponentType) {
  if (['line', 'bar', 'pie', 'area', 'combo', 'scatter', 'bubble', 'outpatient', 'ranking'].includes(type)) return { width: 280, height: 220 }
  if (type === 'table') return { width: 360, height: 220 }
  if (type === 'text') return { width: 260, height: 90 }
  return { width: 185, height: 112 }
}

function defaultBinding(type: ComponentType) {
  if (type === 'outpatient') return { datasetId: 'op_visit_month', dimension: 'month_code', field: 'visit_count' }
  if (type === 'ranking') return { datasetId: 'dept_income_rank', dimension: 'dept_name', field: 'amount' }
  if (type === 'bed') return { datasetId: 'bed_usage', dimension: 'dept_name', field: 'usage_rate' }
  return { datasetId: 'income_month', dimension: 'month_code', field: 'amount' }
}

function addComponent(type: ComponentType, dropX?: number, dropY?: number) {
  const item = catalog.find((entry) => entry.type === type)
  if (!item) return
  const size = defaultSize(type)
  const binding = defaultBinding(type)
  const offset = (components.value.length * 18) % 150
  const x = clamp(dropX ?? 24 + offset, 0, dashboard.value.canvas.width - size.width)
  const y = clamp(dropY ?? 24 + offset, 0, dashboard.value.canvas.height - size.height)
  const id = `${type}_${Date.now().toString(36)}`
  const component = createComponent(id, type, item.label, x, y, size.width, size.height, binding.datasetId, binding.dimension, binding.field)
  component.position.zIndex = Math.max(0, ...components.value.map((entry) => entry.position.zIndex)) + 1
  if (type === 'bubble') component.dataConfig.measures.forEach((measure) => { if (measure.labelConfig) measure.labelConfig.show = true })
  components.value.push(component)
  selectedId.value = id
  activeTab.value = 'layout'
  markDirty()
}

function persistMedicalTemplates() {
  localStorage.setItem(TEMPLATE_STORAGE_KEY, JSON.stringify(medicalTemplates.value))
}

function registerSelectedMedical(event: Event) {
  if (!selected.value) return
  const checked = (event.target as HTMLInputElement).checked
  const existing = selectedMedicalTemplate.value
  if (!checked) {
    if (existing) medicalTemplates.value = medicalTemplates.value.filter((item) => item.id !== existing.id)
  } else {
    const saved = saveMedicalTemplate(selected.value, existing?.category || '自定义医疗组件', existing)
    medicalTemplates.value = [...medicalTemplates.value.filter((item) => item.id !== saved.id), saved]
  }
  persistMedicalTemplates()
}

function updateSelectedMedicalTemplate() {
  if (!selected.value || !selectedMedicalTemplate.value) return
  const saved = saveMedicalTemplate(selected.value, selectedMedicalTemplate.value.category, selectedMedicalTemplate.value)
  medicalTemplates.value = [...medicalTemplates.value.filter((item) => item.id !== saved.id), saved]
  persistMedicalTemplates()
  setSaveState('医疗业务组件已更新')
}

function updateMedicalCategory(category: string) {
  if (!selectedMedicalTemplate.value) return
  selectedMedicalTemplate.value.category = category.trim() || '自定义医疗组件'
  selectedMedicalTemplate.value.updatedAt = new Date().toISOString()
  persistMedicalTemplates()
}

function renameMedicalTemplate(template: MedicalComponentTemplate) {
  if (medicalTemplateClickTimer) window.clearTimeout(medicalTemplateClickTimer)
  medicalTemplateClickTimer = undefined
  const name = window.prompt('重命名医疗业务组件', template.name)
  if (name === null || !name.trim()) return
  template.name = name.trim()
  template.component.title = template.name
  template.updatedAt = new Date().toISOString()
  persistMedicalTemplates()
}

function queueMedicalTemplate(template: MedicalComponentTemplate) {
  if (medicalTemplateClickTimer) window.clearTimeout(medicalTemplateClickTimer)
  medicalTemplateClickTimer = window.setTimeout(() => {
    addMedicalTemplate(template)
    medicalTemplateClickTimer = undefined
  }, 220)
}

function renameMedicalCategory(category: string) {
  const next = window.prompt('重命名组件分类', category)
  if (next === null || !next.trim() || next.trim() === category) return
  const normalized = next.trim()
  for (const template of medicalTemplates.value.filter((item) => item.category === category)) {
    template.category = normalized
    template.updatedAt = new Date().toISOString()
  }
  persistMedicalTemplates()
}

function addMedicalTemplate(template: MedicalComponentTemplate) {
  const offset = (components.value.length * 18) % 150
  const id = `${template.component.type}_${Date.now().toString(36)}`
  const component = instantiateMedicalTemplate(template, id, 24 + offset, 24 + offset)
  component.position.zIndex = Math.max(0, ...components.value.map((entry) => entry.position.zIndex)) + 1
  components.value.push(component)
  normalizeComponent(component)
  template.sourceComponentId = id
  template.updatedAt = new Date().toISOString()
  persistMedicalTemplates()
  selectedId.value = id
  activeTab.value = 'layout'
  markDirty()
}

function handleDragStart(event: DragEvent, type: ComponentType) {
  event.dataTransfer?.setData('application/x-medical-bi-component', type)
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'copy'
}

function handleDrop(event: DragEvent) {
  const type = event.dataTransfer?.getData('application/x-medical-bi-component') as ComponentType
  if (!type || !canvasElement.value) return
  const rect = canvasElement.value.getBoundingClientRect()
  const size = defaultSize(type)
  addComponent(type, event.clientX - rect.left - size.width / 2, event.clientY - rect.top - 24)
}

function startPointer(event: PointerEvent, component: DashboardComponent, mode: 'move' | 'resize', direction?: ResizeDirection) {
  const target = event.target as HTMLElement
  if (mode === 'move' && target.closest('button, input, select')) return
  event.preventDefault()
  selectedId.value = component.id
  component.position.zIndex = Math.max(...components.value.map((item) => item.position.zIndex), 1) + 1
  pointerAction = { id: component.id, mode, direction, startClientX: event.clientX, startClientY: event.clientY, start: { ...component.position } }
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', endPointer, { once: true })
}

function handlePointerMove(event: PointerEvent) {
  if (!pointerAction) return
  const component = components.value.find((item) => item.id === pointerAction?.id)
  if (!component) return
  const dx = event.clientX - pointerAction.startClientX
  const dy = event.clientY - pointerAction.startClientY
  const start = pointerAction.start

  if (pointerAction.mode === 'move') {
    component.position.x = Math.round(clamp(start.x + dx, 0, dashboard.value.canvas.width - component.position.width))
    component.position.y = Math.round(clamp(start.y + dy, 0, dashboard.value.canvas.height - component.position.height))
    return
  }

  const direction = pointerAction.direction ?? 'se'
  let left = start.x
  let top = start.y
  let right = start.x + start.width
  let bottom = start.y + start.height

  if (direction.includes('w')) left = clamp(start.x + dx, 0, right - MIN_COMPONENT_WIDTH)
  if (direction.includes('e')) right = clamp(start.x + start.width + dx, left + MIN_COMPONENT_WIDTH, dashboard.value.canvas.width)
  if (direction.includes('n')) top = clamp(start.y + dy, 0, bottom - MIN_COMPONENT_HEIGHT)
  if (direction.includes('s')) bottom = clamp(start.y + start.height + dy, top + MIN_COMPONENT_HEIGHT, dashboard.value.canvas.height)

  component.position.x = Math.round(left)
  component.position.y = Math.round(top)
  component.position.width = Math.round(right - left)
  component.position.height = Math.round(bottom - top)
}

function endPointer() {
  if (pointerAction) markDirty()
  pointerAction = null
  window.removeEventListener('pointermove', handlePointerMove)
}

function normalizeSelected() {
  if (!selected.value) return
  normalizeComponent(selected.value)
  markDirty()
}

function normalizeComponent(component: DashboardComponent) {
  const canvas = dashboard.value.canvas
  component.position.width = Math.round(clamp(component.position.width, MIN_COMPONENT_WIDTH, canvas.width))
  component.position.height = Math.round(clamp(component.position.height, MIN_COMPONENT_HEIGHT, canvas.height))
  component.position.x = Math.round(clamp(component.position.x, 0, canvas.width - component.position.width))
  component.position.y = Math.round(clamp(component.position.y, 0, canvas.height - component.position.height))
}

function normalizeCanvas() {
  const canvas = dashboard.value.canvas
  canvas.width = Math.round(clamp(canvas.width, 320, 1920))
  canvas.height = Math.round(clamp(canvas.height, 240, 1080))
  canvas.gridSize = Math.round(clamp(canvas.gridSize, 4, 40))
  components.value.forEach(normalizeComponent)
  markDirty()
}

function deleteSelected() {
  if (!selected.value) return
  const index = components.value.findIndex((component) => component.id === selectedId.value)
  components.value.splice(index, 1)
  selectedId.value = components.value[Math.min(index, components.value.length - 1)]?.id ?? ''
  markDirty()
}

function selectCanvas() {
  selectedId.value = ''
  activeTab.value = 'layout'
}

function sourceKindFor(component: DashboardComponent) {
  return component.dataConfig.sourceKind ?? 'mock'
}

function syncDatasetFields() {
  if (!selected.value) return
  selected.value.dataConfig.sourceKind = 'mock'
  const dataset = getMockDataset(selected.value.dataConfig.datasetId)
  const stringField = dataset.fields.find((field) => field.type === 'string') ?? dataset.fields[0]
  const numberField = dataset.fields.find((field) => field.type === 'number') ?? dataset.fields[0]
  selected.value.dataConfig.dimensions = stringField ? [{ field: stringField.name, role: 'category' }] : []
  selected.value.dataConfig.measures = numberField ? [{ field: numberField.name, aggregation: 'sum', axis: 'left' }] : []
  markDirty()
}

function switchToMock() {
  if (!selected.value) return
  selected.value.dataConfig.sourceKind = 'mock'
  selected.value.dataConfig.datasetId = mockDatasets[0].id
  syncDatasetFields()
}

async function chooseServerDataset(dataset: CatalogDataset) {
  if (!selected.value) return
  serverDatasets.value = { ...serverDatasets.value, [dataset.id]: dataset }
  selected.value.dataConfig.sourceKind = 'server'
  selected.value.dataConfig.datasetId = dataset.id
  const dimension = dataset.fields.find((field) => field.type === 'string' || field.type === 'date') ?? dataset.fields[0]
  const metric = dataset.fields.find((field) => field.type === 'number') ?? dataset.fields[0]
  selected.value.dataConfig.dimensions = dimension ? [{ field: dimension.name, role: 'category' }] : []
  selected.value.dataConfig.measures = metric ? [{ field: metric.name, aggregation: 'sum', axis: 'left' }] : []
  selected.value.dataConfig = upgradeComponentDataConfigV3(selected.value.dataConfig)
  applySuggestedParameterBindings(selected.value, dataset.parameters ?? [])
  datasetCatalogOpen.value = false
  markDirty()
  await loadServerDataset(selected.value)
}

function datasetParametersFor(component: DashboardComponent): DatasetQueryParameterV3[] {
  return serverDatasets.value[component.dataConfig.datasetId]?.parameters ?? []
}

function componentDataConfigV3(component: DashboardComponent): ComponentDataConfigV3 {
  if (component.dataConfig.version !== 3) component.dataConfig = upgradeComponentDataConfigV3(component.dataConfig)
  return component.dataConfig
}

function parameterBindingFor(component: DashboardComponent, datasetParameterCode: string): string {
  if (component.dataConfig.version !== 3) return ''
  return component.dataConfig.parameterBindings.find((item) => item.datasetParameterCode === datasetParameterCode)?.parameterId ?? ''
}

function applySuggestedParameterBindings(component: DashboardComponent, datasetParameters = datasetParametersFor(component)) {
  const bindings = suggestDatasetParameterBindingsV3(datasetParameters, dashboardApplication.value.parameters)
    .filter((candidate) => candidate.parameterId)
    .map((candidate) => ({
      datasetParameterCode: candidate.datasetParameterCode,
      parameterId: candidate.parameterId!,
    }))
  component.dataConfig = upgradeComponentDataConfigV3(component.dataConfig, bindings)
}

function autoBindSelectedParameters() {
  if (!selected.value) return
  applySuggestedParameterBindings(selected.value)
  const result = validateDatasetParameterBindingsV3(
    componentDataConfigV3(selected.value).parameterBindings,
    datasetParametersFor(selected.value),
    dashboardApplication.value.parameters,
  )
  setSaveState(result.valid ? '参数已自动绑定' : result.issues[0]?.message ?? '参数绑定需检查')
  markDirty()
}

function setSelectedParameterBinding(datasetParameterCode: string, event: Event) {
  if (!selected.value) return
  const parameterId = (event.target as HTMLSelectElement).value
  const config = componentDataConfigV3(selected.value)
  const bindings = config.parameterBindings.filter((item) => item.datasetParameterCode !== datasetParameterCode)
  if (parameterId) bindings.push({ datasetParameterCode, parameterId })
  selected.value.dataConfig = upgradeComponentDataConfigV3(config, bindings)
  const result = validateDatasetParameterBindingsV3(
    bindings,
    datasetParametersFor(selected.value),
    dashboardApplication.value.parameters,
  )
  setSaveState(result.valid ? '参数绑定已更新' : result.issues[0]?.message ?? '参数绑定需检查')
  markDirty()
}

function setSelectedRefreshPolicy(event: Event) {
  if (!selected.value) return
  const policy = (event.target as HTMLSelectElement).value as ComponentDataConfigV3['refreshPolicy']
  const config = componentDataConfigV3(selected.value)
  selected.value.dataConfig = upgradeComponentDataConfigV3(config, config.parameterBindings, policy)
  markDirty()
}

function fieldsFor(component: DashboardComponent): DesignerField[] {
  if (sourceKindFor(component) === 'mock') {
    return getMockDataset(component.dataConfig.datasetId).fields.map((field) => ({ ...field }))
  }
  const serverFields = serverDatasets.value[component.dataConfig.datasetId]?.fields
  if (serverFields) return serverFields.map((field) => ({ ...field, label: field.name }))
  const runtimeFields = runtimeDatasets.value[component.id]?.fields ?? []
  return runtimeFields.map((field) => ({ name: field.name, type: field.dataType, label: field.label ?? field.name }))
}

function rowsFor(component: DashboardComponent): Array<Record<string, unknown>> {
  if (sourceKindFor(component) === 'mock') return getMockDataset(component.dataConfig.datasetId).rows
  return runtimeDatasets.value[component.id]?.rows ?? []
}

function datasetNameFor(component: DashboardComponent) {
  if (sourceKindFor(component) === 'mock') return getMockDataset(component.dataConfig.datasetId).name
  return serverDatasets.value[component.dataConfig.datasetId]?.name ?? '已保存数据集'
}

function datasetDescriptionFor(component: DashboardComponent) {
  if (sourceKindFor(component) === 'mock') return getMockDataset(component.dataConfig.datasetId).description
  return serverDatasets.value[component.dataConfig.datasetId]?.notes || 'PostgreSQL / Greenplum 只读数据集'
}

function datasetRowCountFor(component: DashboardComponent) {
  if (sourceKindFor(component) === 'mock') return rowsFor(component).length
  return runtimeDatasets.value[component.id]?.rowCount ?? 0
}

function isDatasetLoading(component: DashboardComponent) {
  return sourceKindFor(component) === 'server' && Boolean(datasetLoading.value[component.id])
}

function datasetErrorFor(component: DashboardComponent) {
  return sourceKindFor(component) === 'server' ? datasetErrors.value[component.id] || '' : ''
}

function initializeParameterRuntime(application: DashboardApplicationV3) {
  parameterRuntime.value = new ParameterRuntimeStoreV3(application.parameters)
  parameterRuntimeValues.value = parameterRuntime.value.snapshot().values
  pendingControlValues.value = {}
}

function parameterFor(parameterId: string): ParameterDefinitionV3 | undefined {
  return dashboardApplication.value.parameters.find((parameter) => parameter.id === parameterId)
}

function optionsForParameter(parameter: ParameterDefinitionV3) {
  if (parameter.source.kind === 'static') return parameter.source.options
  if (parameter.source.kind === 'dictionary') return findBuiltinDictionaryV3(parameter.source.dictionaryCode)?.options ?? []
  return []
}

function controlValue(parameterId: string): unknown {
  return Object.hasOwn(pendingControlValues.value, parameterId)
    ? pendingControlValues.value[parameterId]
    : parameterRuntimeValues.value[parameterId]
}

function scalarControlValue(parameterId: string): string | number {
  const value = controlValue(parameterId)
  return typeof value === 'number' || typeof value === 'string' ? value : ''
}

function dateRangeControlValue(parameterId: string, index: number): string {
  const value = controlValue(parameterId)
  return Array.isArray(value) && typeof value[index] === 'string' ? value[index] : ''
}

async function commitControlAssignments(assignments: Array<{ parameterId: string; value: unknown }>) {
  if (!parameterRuntime.value || !assignments.length) return
  try {
    const commit = parameterRuntime.value.commit(assignments)
    parameterRuntimeValues.value = commit.state.values
    if (!commit.changed) {
      setSaveState('参数值未变化，无需刷新')
      return
    }
    const affected = componentsAffectedByParameterCommitV3(components.value, commit.changedParameterIds)
      .filter((component) => sourceKindFor(component) === 'server')
    await Promise.all(affected.map((component) => loadServerDataset(component)))
    setSaveState(`参数已提交，刷新 ${affected.length} 个组件`)
  } catch (reason) {
    setSaveState(reason instanceof Error ? reason.message : '参数提交失败')
  }
}

function normalizedControlInput(parameter: ParameterDefinitionV3, event: Event): unknown {
  const target = event.target as HTMLInputElement | HTMLSelectElement
  if (parameter.type === 'number') return target.value === '' ? undefined : Number(target.value)
  if (parameter.type === 'multiSelect' && target instanceof HTMLSelectElement) {
    return [...target.selectedOptions].map((option) => option.value)
  }
  return target.value || undefined
}

function updateControlValue(control: ParameterControlV3, parameterId: string, event: Event) {
  const parameter = parameterFor(parameterId)
  if (!parameter) return
  setControlValue(control, parameterId, normalizedControlInput(parameter, event))
}

function setControlValue(control: ParameterControlV3, parameterId: string, value: unknown) {
  if (control.interaction.submitMode === 'immediate') void commitControlAssignments([{ parameterId, value }])
  else pendingControlValues.value = { ...pendingControlValues.value, [parameterId]: value }
}

function updateDateRangeControl(control: ParameterControlV3, parameterId: string, index: number, event: Event) {
  const current = Array.isArray(controlValue(parameterId)) ? [...controlValue(parameterId) as unknown[]] : ['', '']
  current[index] = (event.target as HTMLInputElement).value
  if (control.interaction.submitMode === 'immediate' && current.every(Boolean)) {
    void commitControlAssignments([{ parameterId, value: current }])
  } else pendingControlValues.value = { ...pendingControlValues.value, [parameterId]: current }
}

function submitControl(control: ParameterControlV3) {
  const assignments = control.parameterIds
    .filter((parameterId) => Object.hasOwn(pendingControlValues.value, parameterId))
    .map((parameterId) => ({ parameterId, value: pendingControlValues.value[parameterId] }))
  if (!assignments.length) return
  const submittedIds = new Set(assignments.map((item) => item.parameterId))
  pendingControlValues.value = Object.fromEntries(Object.entries(pendingControlValues.value)
    .filter(([parameterId]) => !submittedIds.has(parameterId)))
  void commitControlAssignments(assignments)
}

function clearControl(control: ParameterControlV3) {
  pendingControlValues.value = Object.fromEntries(Object.entries(pendingControlValues.value)
    .filter(([parameterId]) => !control.parameterIds.includes(parameterId)))
  void commitControlAssignments(control.parameterIds.map((parameterId) => ({ parameterId, value: undefined })))
}

async function loadServerMetadata() {
  try {
    const response = await fetch('/api/datasets')
    const datasets: CatalogDataset[] = await response.json()
    if (!response.ok) throw new Error('数据集目录加载失败')
    serverDatasets.value = Object.fromEntries(datasets.map((dataset) => [dataset.id, dataset]))
    await Promise.all(componentsForPageEnterV3(components.value)
      .filter((component) => sourceKindFor(component) === 'server')
      .map((component) => loadServerDataset(component)))
  } catch {
    // Mock 数据仍可离线使用；真实数据组件会在刷新时显示具体错误。
  }
}

function serverRuntimeView(component: DashboardComponent, dataset: CatalogDataset) {
  const fieldIndex = (field: string) => dataset.fields.findIndex((item) => item.name === field)
  const dimensions = component.dataConfig.dimensions.map((item) => fieldIndex(item.field)).filter((index) => index >= 0)
  const measures = component.dataConfig.measures
    .map((item) => ({ field: fieldIndex(item.field), aggregation: item.aggregation }))
    .filter((item) => item.field >= 0 && item.aggregation !== 'none')
  if (!dimensions.length && !measures.length) return undefined
  const sort = component.dataConfig.sort.flatMap((item) => {
    const dimensionIndex = component.dataConfig.dimensions.findIndex((dimension) => dimension.field === item.field)
    if (dimensionIndex >= 0) return [{ kind: 'dimension', index: dimensionIndex, direction: item.direction }]
    const measureIndex = component.dataConfig.measures.findIndex((measure) => measure.field === item.field && measure.aggregation !== 'none')
    return measureIndex >= 0 ? [{ kind: 'measure', index: measureIndex, direction: item.direction }] : []
  })
  return { dimensions, measures, sort, limit: component.dataConfig.limit }
}

async function loadServerDataset(component: DashboardComponent, force = false) {
  const datasetId = component.dataConfig.datasetId
  if (!datasetId) return
  const key = component.id
  datasetLoading.value = { ...datasetLoading.value, [key]: true }
  datasetErrors.value = { ...datasetErrors.value, [key]: '' }
  try {
    const dataset = serverDatasets.value[datasetId]
    const parameters = resolveDatasetParameterValuesV3(component, parameterRuntimeValues.value)
    const view = dataset ? serverRuntimeView(component, dataset) : undefined
    const requestBody = { parameters, limit: component.dataConfig.limit, view }
    const key = createQueryRuntimeKeyV3(datasetId, parameters, component.dataConfig.limit, view)
    const cached = await queryRuntimeCache.execute(key, async () => {
      const response = await fetch(`/api/datasets/${encodeURIComponent(datasetId)}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || `请求失败（${response.status}）`)
      return result as Record<string, unknown>
    }, force)
    const result = cached.value
    runtimeDatasets.value = { ...runtimeDatasets.value, [key]: normalizeQueryResult(datasetId, result) }
  } catch (reason) {
    datasetErrors.value = {
      ...datasetErrors.value,
      [key]: reason instanceof Error ? reason.message : '数据集执行失败',
    }
  } finally {
    datasetLoading.value = { ...datasetLoading.value, [key]: false }
  }
}

function refreshSelectedDataset() {
  if (selected.value && sourceKindFor(selected.value) === 'server') {
    void loadServerDataset(selected.value, true)
  }
}

function aggregationOptionsFor(component: DashboardComponent, fieldName: string) {
  const type = fieldsFor(component).find((field) => field.name === fieldName)?.type
  if (type === 'number') return [{ value: 'sum', label: 'SUM' }, { value: 'avg', label: 'AVG' }, { value: 'count', label: 'COUNT' }, { value: 'countDistinct', label: 'COUNT DISTINCT' }, { value: 'min', label: 'MIN' }, { value: 'max', label: 'MAX' }, { value: 'none', label: '无聚合' }]
  if (type === 'date' || type === 'datetime') return [{ value: 'count', label: 'COUNT' }, { value: 'countDistinct', label: 'COUNT DISTINCT' }, { value: 'min', label: 'MIN' }, { value: 'max', label: 'MAX' }, { value: 'none', label: '无聚合' }]
  return [{ value: 'count', label: 'COUNT' }, { value: 'countDistinct', label: 'COUNT DISTINCT' }, { value: 'none', label: '无聚合' }]
}
function supportsSeriesStyle(type: ComponentType) { return ['line', 'bar', 'area', 'combo', 'outpatient', 'ranking'].includes(type) }
function measureRole(type: ComponentType, index: number) {
  if (type === 'scatter') return ['X 轴', 'Y 轴'][index] || `辅助指标 ${index + 1}`
  if (type === 'bubble') return ['X 轴', 'Y 轴', '气泡大小'][index] || `辅助指标 ${index + 1}`
  return ''
}

function measureSortDirection(field: string) {
  return selected.value?.dataConfig.sort.find((item) => item.field === field)?.direction ?? 'none'
}

function setMeasureSort(field: string, event: Event) {
  if (!selected.value) return
  const direction = (event.target as HTMLSelectElement).value
  selected.value.dataConfig.sort = direction === 'asc' || direction === 'desc'
    ? [{ field, direction }]
    : []
  markDirty()
}

function addDimensionField() {
  if (!selected.value) return
  const fields = fieldsFor(selected.value)
  const unused = fields.find((field) => !selected.value?.dataConfig.dimensions.some((item) => item.field === field.name))
  if (!unused) return
  selected.value.dataConfig.dimensions.push({ field: unused.name, role: selected.value.dataConfig.dimensions.length ? 'series' : 'category' })
  markDirty()
}

function addMeasureField() {
  if (!selected.value) return
  const fields = fieldsFor(selected.value)
  const unused = fields.find((field) => field.type === 'number' && !selected.value?.dataConfig.measures.some((item) => item.field === field.name))
    ?? fields.find((field) => !selected.value?.dataConfig.measures.some((item) => item.field === field.name))
  if (!unused) return
  selected.value.dataConfig.measures.push({
    field: unused.name, aggregation: 'sum', axis: selected.value.dataConfig.measures.length ? 'right' : 'left',
    chartType: selected.value.type === 'bar' ? 'bar' : selected.value.type === 'area' ? 'area' : selected.value.type === 'combo' ? (selected.value.dataConfig.measures.length ? 'line' : 'bar') : 'line',
    labelConfig: { show: selected.value.type === 'bubble', showCategory: false, showSeries: false, mode: 'value', decimals: 0, position: 'top', unit: '', percentageBase: 'category' },
  })
  markDirty()
}

function removeDimensionField(index: number) { selected.value?.dataConfig.dimensions.splice(index, 1); markDirty() }
function removeMeasureField(index: number) {
  if (!selected.value) return
  const [removed] = selected.value.dataConfig.measures.splice(index, 1)
  if (removed) selected.value.dataConfig.sort = selected.value.dataConfig.sort.filter((item) => item.field !== removed.field)
  markDirty()
}
function moveBinding(items: unknown[], index: number, direction: -1 | 1) {
  const target = index + direction
  if (target < 0 || target >= items.length) return
  const [item] = items.splice(index, 1)
  items.splice(target, 0, item)
  markDirty()
}
function addWarningLine() {
  selected.value?.analysisConfig?.warningLines.push({ id: `warning_${Date.now().toString(36)}`, value: 0, label: '预警线', color: '#e03131', axis: 'y', source: 'fixed', percentile: 90, axisSide: 'left', lineStyle: 'dashed' })
  markDirty()
}
function removeWarningLine(index: number) { selected.value?.analysisConfig?.warningLines.splice(index, 1); markDirty() }

function dataViewFor(component: DashboardComponent) {
  if (sourceKindFor(component) === 'server') {
    return buildComponentDataView(rowsFor(component), {
      ...component.dataConfig,
      measures: component.dataConfig.measures.map((measure) => ({ ...measure, aggregation: 'none' })),
    })
  }
  return buildComponentDataView(rowsFor(component), component.dataConfig)
}

function categoriesFor(component: DashboardComponent) {
  return dataViewFor(component).categories
}

function valuesFor(component: DashboardComponent) {
  return dataViewFor(component).series[0]?.values ?? []
}

function metricValuesFor(component: DashboardComponent, field: string) {
  const seriesValues = dataViewFor(component).series.filter((item) => item.field === field).flatMap((item) => item.values)
  if (seriesValues.length) return seriesValues
  return rowsFor(component).map((row) => Number(row[field])).filter(Number.isFinite)
}

function metricFor(component: DashboardComponent) {
  const field = component.kpiConfig?.primaryMeasureField || component.dataConfig.measures[0]?.field || ''
  const values = field ? metricValuesFor(component, field) : valuesFor(component)
  if (!values.length) return 0
  if (component.type === 'bed') return values.reduce((sum, value) => sum + value, 0) / values.length
  return values.reduce((sum, value) => sum + value, 0)
}

function kpiConfigFor(component: DashboardComponent) {
  if (!component.kpiConfig) throw new Error(`组件 ${component.id} 不是指标卡`)
  return component.kpiConfig
}

function formattedMetric(component: DashboardComponent) {
  return formatKpiValue(metricFor(component), kpiConfigFor(component))
}

function metricUnit(component: DashboardComponent) {
  const config = kpiConfigFor(component)
  if (config.unit) return config.unit
  if (component.dataConfig.measures[0]?.unit) return component.dataConfig.measures[0].unit
  if (sourceKindFor(component) === 'server') {
    const field = component.dataConfig.measures[0]?.field.toLowerCase() ?? ''
    if (field.includes('rate') || field.includes('ratio') || field.includes('percent')) return '%'
    if (field.startsWith('is_') || field.includes('count') || field.includes('num')) return '条'
    return ''
  }
  if (component.type === 'bed') return '%'
  if (component.dataConfig.measures[0]?.field === 'visit_count') return '人次'
  return '万元'
}

function isKpi(type: ComponentType) { return ['kpi', 'income', 'bed'].includes(type) }
function metricValueByField(component: DashboardComponent, field: string) { return metricValuesFor(component, field).reduce((sum, value) => sum + value, 0) }
function kpiComparison(component: DashboardComponent, kind: 'yoy' | 'mom') {
  const config = kpiConfigFor(component)
  const field = kind === 'yoy' ? config.yoyField : config.momField
  return field ? comparisonRate(metricFor(component), metricValueByField(component, field)) : null
}
function kpiComparisonColor(component: DashboardComponent, rate: number) { return comparisonColor(rate, kpiConfigFor(component)) }
function kpiTarget(component: DashboardComponent) { const config = kpiConfigFor(component); return config.targetMode === 'field' && config.targetField ? metricValueByField(component, config.targetField) : config.targetValue }
function kpiProgress(component: DashboardComponent) { return targetProgress(metricFor(component), kpiTarget(component)) }

function tableColumnsFor(component: DashboardComponent) {
  const available = dataViewFor(component).columns
  const configured = component.tableConfig?.columns ?? []
  const configuredFields = new Set(configured.map((item) => item.field))
  return [
    ...configured.filter((item) => available.some((column) => column.field === item.field)),
    ...available.filter((column) => !configuredFields.has(column.field)).map((column) => ({
      field: column.field, label: column.label, width: 120, format: column.role === 'measure' ? 'number' as const : 'auto' as const, summary: 'none' as const,
    })),
  ]
}

function tableValue(value: unknown, format: string) {
  if (format === 'percentage') return `${(Number(value) || 0).toFixed(1)}%`
  if (format === 'number') return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(Number(value) || 0)
  if (format === 'date' && value) return new Date(String(value)).toLocaleDateString('zh-CN')
  return value ?? ''
}

function tableSummary(component: DashboardComponent, field: string, summary: string) {
  if (summary === 'none') return ''
  const values = dataViewFor(component).rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined && value !== '')
  if (summary === 'count') return values.length
  const numbers = values.map(Number).filter(Number.isFinite)
  if (!numbers.length) return ''
  if (summary === 'avg') return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
  return numbers.reduce((sum, value) => sum + value, 0)
}

function chartKind(type: ComponentType): 'line' | 'bar' | 'pie' | 'area' | 'combo' | 'scatter' | 'bubble' {
  if (['pie', 'area', 'combo', 'scatter', 'bubble'].includes(type)) return type as 'pie' | 'area' | 'combo' | 'scatter' | 'bubble'
  if (type === 'bar' || type === 'ranking') return 'bar'
  return 'line'
}

function isChart(type: ComponentType) {
  return ['line', 'bar', 'pie', 'area', 'combo', 'scatter', 'bubble', 'outpatient', 'ranking'].includes(type)
}

function componentStyle(component: DashboardComponent) {
  const { x, y, width, height, zIndex } = component.position
  return { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, zIndex, background: component.styleConfig.background }
}

function currentApplicationSnapshot(): DashboardApplicationV3 {
  return applyDesignerDashboardToApplicationV3(dashboardApplication.value, dashboard.value)
}

function applyDashboardApplication(application: DashboardApplicationV3) {
  dashboardApplication.value = application
  initializeParameterRuntime(application)
  dashboard.value = createDefaultPageDesignerAdapterV3(application).dashboard
  normalizeCanvas()
  selectedId.value = dashboard.value.components[0]?.id ?? ''
}

function saveDashboard() {
  const application = currentApplicationSnapshot()
  const result = saveDashboardApplicationV3(localStorage, application)
  if (!result.success) {
    setSaveState(`保存失败：${result.errors[0] ?? 'V3 校验未通过'}`)
    return
  }
  dashboardApplication.value = application
  setSaveState('V3 草稿已保存到本机')
}

function loadSavedDashboard() {
  const result = loadDashboardApplicationV3(localStorage)

  if (result.source === 'default' && result.persisted && !result.errors.length) {
    const application = applyDesignerDashboardToApplicationV3(
      result.application,
      createDefaultDashboard(),
    )
    const saveResult = saveDashboardApplicationV3(localStorage, application)
    applyDashboardApplication(application)
    setSaveState(saveResult.success ? '已建立 V3 草稿' : 'V3 草稿初始化失败')
    return
  }

  applyDashboardApplication(result.application)
  if (result.errors.length) {
    setSaveState('草稿恢复失败，已使用安全回退')
  } else if (result.source === 'v3') {
    setSaveState('已恢复 V3 草稿')
  } else {
    setSaveState(`${result.source.toUpperCase()} 草稿已迁移到 V3`)
  }
}

function exportDashboard() {
  try {
    const json = exportDashboardApplicationV3(currentApplicationSnapshot())
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${dashboard.value.name || 'medical-bi-dashboard'}.v3.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setSaveState('V3 JSON 已导出')
  } catch {
    setSaveState('V3 JSON 导出失败')
  }
}

function openImport() {
  importInput.value?.click()
}

async function importDashboard(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const result = importDashboardApplicationV3(await file.text())
    if (!result.application || !result.report.success) {
      throw new Error(result.report.errors.join('；'))
    }
    applyDashboardApplication(result.application)
    setSaveState(result.report.sourceVersion === 3 ? 'V3 JSON 已导入' : '旧版 JSON 已迁移导入')
  } catch {
    setSaveState('JSON 格式或模型无效')
  } finally {
    input.value = ''
  }
}

function markDirty() {
  setSaveState('有未保存修改')
}

function setSaveState(message: string) {
  saveState.value = message
  if (stateTimer) window.clearTimeout(stateTimer)
  stateTimer = window.setTimeout(() => {
    if (saveState.value !== '有未保存修改') saveState.value = '当前草稿'
  }, 2600)
}

function startPanelResize(side: 'left' | 'right', event: PointerEvent) {
  event.preventDefault()
  panelResize = {
    side,
    startX: event.clientX,
    startWidth: side === 'left' ? leftPanelWidth.value : rightPanelWidth.value,
  }
  window.addEventListener('pointermove', handlePanelResize)
  window.addEventListener('pointerup', stopPanelResize, { once: true })
}

function handlePanelResize(event: PointerEvent) {
  if (!panelResize) return
  const delta = event.clientX - panelResize.startX
  if (panelResize.side === 'left') leftPanelWidth.value = clamp(panelResize.startWidth + delta, 150, 420)
  else rightPanelWidth.value = clamp(panelResize.startWidth - delta, 260, 620)
}

function stopPanelResize() {
  panelResize = null
  window.removeEventListener('pointermove', handlePanelResize)
}

function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if ((event.key === 'Delete' || event.key === 'Backspace') && !target.closest('input, textarea, select')) deleteSelected()
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault()
    saveDashboard()
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Number(value) || min, min), Math.max(min, max))
}

onMounted(() => {
  try { medicalTemplates.value = normalizeMedicalTemplates(JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) || '[]')) } catch { medicalTemplates.value = [] }
  loadSavedDashboard()
  void loadServerMetadata()
  window.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('pointermove', handlePointerMove)
  stopPanelResize()
  if (stateTimer) window.clearTimeout(stateTimer)
  if (medicalTemplateClickTimer) window.clearTimeout(medicalTemplateClickTimer)
})
</script>

<template>
  <div class="designer-shell step4-shell" :class="{ 'is-preview': previewMode }">
    <header class="designer-toolbar">
      <div class="brand-block"><span class="brand-mark"><IconDeviceDesktopAnalytics :size="20" /></span><div><b>医疗 BI Designer</b><small>Step 5.1 · 真实数据集绑定</small></div></div>
      <div class="dashboard-identity"><span>当前看板</span><button type="button" @click="selectCanvas">{{ dashboard.name }} <IconChevronDown :size="15" /></button><em>{{ saveState }}</em></div>
      <div class="toolbar-actions">
        <input ref="importInput" class="visually-hidden" type="file" accept="application/json,.json" @change="importDashboard" />
        <button type="button" @click="openImport"><IconFileImport :size="17" />导入</button>
        <button type="button" @click="exportDashboard"><IconFileExport :size="17" />导出</button>
        <button type="button" @click="previewMode = !previewMode"><component :is="previewMode ? IconEyeOff : IconEye" :size="17" />{{ previewMode ? '退出预览' : '预览' }}</button>
        <button class="primary-action" type="button" @click="saveDashboard"><IconDeviceFloppy :size="17" />保存</button>
      </div>
    </header>

    <main class="designer-workspace" :style="workspaceStyle">
      <aside class="component-panel" aria-label="组件库">
        <i class="panel-width-handle panel-width-handle-right" aria-label="拖拽调整组件库宽度" @pointerdown="startPanelResize('left', $event)"></i>
        <div class="panel-heading"><div><small>COMPONENTS</small><h1>组件库</h1></div><span>{{ catalog.length }}</span></div>
        <label class="component-search"><IconSearch :size="17" /><input v-model="query" type="search" placeholder="搜索组件或分类" aria-label="搜索组件" /></label>
        <div class="component-visibility-controls"><button type="button" :class="{ active: showBasicComponents }" @click="showBasicComponents = !showBasicComponents">基础 {{ showBasicComponents ? '隐藏' : '展示' }}</button><button type="button" :class="{ active: showMedicalComponents }" @click="showMedicalComponents = !showMedicalComponents">医疗 {{ showMedicalComponents ? '隐藏' : '展示' }}</button></div>
        <div class="component-groups">
          <section v-for="group in groupedCatalog" :key="group.label"><h2><span>{{ group.label }}</span></h2><div class="component-grid">
            <button v-for="item in group.items" :key="item.type" draggable="true" type="button" :data-component-type="item.type" title="单击添加，或拖入画布" @dragstart="handleDragStart($event, item.type)" @click="addComponent(item.type)"><span :class="`tone-${item.tone}`"><component :is="item.icon" :size="15" /></span><b>{{ item.label }}</b><IconPlus class="add-indicator" :size="11" /></button>
          </div></section>
          <template v-if="showMedicalComponents"><section v-for="group in medicalTemplateGroups" :key="group.category" class="medical-template-group"><h2><span title="双击重命名分类" @dblclick="renameMedicalCategory(group.category)">{{ group.category }}</span><em>{{ group.items.length }}</em></h2><div class="medical-template-grid"><button v-for="template in group.items" :key="template.id" type="button" class="medical-template-card" :title="`单击复用，双击重命名：${template.name}`" @click="queueMedicalTemplate(template)" @dblclick="renameMedicalTemplate(template)"><span class="tone-blue"><IconDeviceDesktopAnalytics :size="15" /></span><b>{{ template.name }}</b><IconPlus class="add-indicator" :size="11" /></button></div></section></template>
          <section class="library-data-section"><h2><span>数据管理</span></h2><div class="library-navigation"><RouterLink to="/data-sources"><IconDatabase :size="14" />数据源</RouterLink><RouterLink to="/datasets"><IconTable :size="14" />数据集</RouterLink><RouterLink to="/parameters"><IconBraces :size="14" />参数中心</RouterLink></div><template v-if="selected"><button class="bind-dataset-button" type="button" @click="datasetCatalogOpen = true"><IconDatabase :size="14" />为当前组件选择数据集</button><div class="library-bound-dataset"><small>当前绑定</small><b>{{ datasetNameFor(selected) }}</b><span>{{ datasetRowCountFor(selected) }} 行</span></div><button v-if="sourceKindFor(selected) === 'server'" class="bind-dataset-button secondary" type="button" :disabled="isDatasetLoading(selected)" @click="refreshSelectedDataset">{{ isDatasetLoading(selected) ? '读取中…' : '刷新真实数据' }}</button></template></section>
        </div>
        <div class="panel-footnote active-note"><i></i>组件库与数据管理可独立滚动</div>
      </aside>

      <section class="canvas-stage" aria-label="看板画布">
        <div v-if="activePageControls.length" class="parameter-control-runtime" aria-label="运行时筛选条件">
          <section v-for="control in activePageControls" :key="control.id" class="runtime-control-card">
            <template v-for="parameterId in control.parameterIds" :key="parameterId">
              <label v-if="parameterFor(parameterId)" class="runtime-control-field">
                <span>{{ parameterFor(parameterId)!.name }}</span>
                <div v-if="control.type === 'buttonGroup'" class="runtime-button-group">
                  <button v-for="option in optionsForParameter(parameterFor(parameterId)!)" :key="String(option.value)" type="button" :class="{ active: controlValue(parameterId) === option.value }" @click="setControlValue(control, parameterId, option.value)">{{ option.label }}</button>
                </div>
                <select v-else-if="control.type === 'singleSelect'" :value="scalarControlValue(parameterId)" @change="updateControlValue(control, parameterId, $event)"><option value="">请选择</option><option v-for="option in optionsForParameter(parameterFor(parameterId)!)" :key="String(option.value)" :value="option.value">{{ option.label }}</option></select>
                <select v-else-if="control.type === 'multiSelect'" multiple :value="controlValue(parameterId)" @change="updateControlValue(control, parameterId, $event)"><option v-for="option in optionsForParameter(parameterFor(parameterId)!)" :key="String(option.value)" :value="option.value">{{ option.label }}</option></select>
                <span v-else-if="control.type === 'dateRange'" class="runtime-date-range"><input type="date" :value="dateRangeControlValue(parameterId, 0)" @change="updateDateRangeControl(control, parameterId, 0, $event)" /><i>至</i><input type="date" :value="dateRangeControlValue(parameterId, 1)" @change="updateDateRangeControl(control, parameterId, 1, $event)" /></span>
                <input v-else :type="control.type === 'date' ? 'date' : parameterFor(parameterId)!.type === 'number' ? 'number' : 'text'" :value="scalarControlValue(parameterId)" @change="updateControlValue(control, parameterId, $event)" />
              </label>
            </template>
            <div class="runtime-control-actions"><button v-if="control.interaction.submitMode === 'manual'" type="button" @click="submitControl(control)">应用</button><button v-if="control.interaction.clearable" type="button" @click="clearControl(control)">清空</button></div>
          </section>
        </div>
        <div class="canvas-meta"><div><IconLayoutDashboard :size="16" />{{ dashboard.name }} <span>/</span><b>{{ previewMode ? '预览模式' : '设计模式' }}</b></div><div class="canvas-meta-actions"><button type="button" @click="selectCanvas"><IconSettings :size="14" />画布设置</button><button type="button" @click="activeTab = 'advanced'"><IconCode :size="14" />看板 JSON</button></div></div>
        <div class="artboard-wrap">
          <div class="artboard interactive-artboard" :style="{ width: `${artboardWidth}px` }">
            <div class="artboard-heading" :style="{ textAlign: dashboard.titleStyle.align }"><div><small>HOSPITAL OPERATIONS</small><h2 v-if="dashboard.titleStyle.show" :style="{ fontSize: `${dashboard.titleStyle.fontSize}px`, color: dashboard.titleStyle.color, fontWeight: dashboard.titleStyle.fontWeight }">{{ dashboard.name }}</h2></div><span>Mock + PostgreSQL / Greenplum · 保存后可恢复</span></div>
            <div ref="canvasElement" class="interactive-canvas" :class="{ 'grid-hidden': !dashboard.canvas.showGrid }" :style="canvasBackground" @dragover.prevent @drop.prevent="handleDrop" @click.self="selectCanvas">
              <article v-for="component in components" :key="component.id" class="design-component" :class="{ 'is-selected': component.id === selectedId && !previewMode }" :data-component-id="component.id" :style="componentStyle(component)" @pointerdown="!previewMode && startPointer($event, component, 'move')" @click.stop="!previewMode && (selectedId = component.id)">
                <div v-if="component.id === selectedId && !previewMode" class="selection-label">当前选中</div>
                <button v-if="!previewMode && component.styleConfig.titleVisible" class="widget-grip" type="button" aria-label="移动组件"><IconGripVertical :size="16" /></button>
                <div v-if="component.styleConfig.titleVisible" class="design-component-header" :class="{ 'preview-title': previewMode }"><span :style="{ color: component.styleConfig.titleColor, fontSize: `${component.styleConfig.titleSize}px`, fontWeight: component.styleConfig.titleWeight }">{{ component.title }}</span><IconDots v-if="!previewMode" :size="17" /></div>
                <div class="design-component-body">
                  <div v-if="isDatasetLoading(component)" class="runtime-state"><i></i><span>正在读取数据集</span></div>
                  <div v-else-if="datasetErrorFor(component)" class="runtime-state error"><IconDatabase :size="18" /><span>{{ datasetErrorFor(component) }}</span></div>
                  <template v-else>
                    <DataChart v-if="isChart(component.type) && component.analysisConfig" :kind="chartKind(component.type)" :categories="categoriesFor(component)" :series="dataViewFor(component).series" :analysis="component.analysisConfig" />
                    <template v-else-if="component.type === 'table'"><table :class="{ striped: component.tableConfig?.striped }"><thead v-if="component.tableConfig?.showHeader !== false"><tr><th v-for="column in tableColumnsFor(component)" :key="column.field" :style="{ width: `${column.width}px` }">{{ column.label }}</th></tr></thead><tbody><tr v-for="(row, index) in dataViewFor(component).rows.slice(0, 20)" :key="index"><td v-for="column in tableColumnsFor(component)" :key="column.field">{{ tableValue(row[column.field], column.format) }}</td></tr></tbody><tfoot v-if="tableColumnsFor(component).some((column) => column.summary !== 'none')"><tr><td v-for="column in tableColumnsFor(component)" :key="column.field">{{ tableValue(tableSummary(component, column.field, column.summary), column.format) }}</td></tr></tfoot></table></template>
                    <template v-else-if="component.type === 'text'"><strong class="text-preview">医院运营分析说明</strong><p class="text-note">支持标题和说明文本。</p></template>
                    <template v-else-if="component.kpiConfig"><strong class="kpi-value">{{ formattedMetric(component) }}<small>{{ metricUnit(component) }}</small></strong><div v-if="kpiComparison(component, 'yoy') !== null || kpiComparison(component, 'mom') !== null" class="kpi-comparisons"><p v-if="kpiComparison(component, 'yoy') !== null" class="kpi-trend" :style="{ color: kpiComparisonColor(component, kpiComparison(component, 'yoy') ?? 0) }"><IconTrendingUp :size="15" />同比 {{ (kpiComparison(component, 'yoy') ?? 0).toFixed(1) }}%</p><p v-if="kpiComparison(component, 'mom') !== null" class="kpi-trend" :style="{ color: kpiComparisonColor(component, kpiComparison(component, 'mom') ?? 0) }"><IconTrendingUp :size="15" />环比 {{ (kpiComparison(component, 'mom') ?? 0).toFixed(1) }}%</p></div><p v-else class="kpi-trend"><IconTrendingUp :size="15" />{{ sourceKindFor(component) === 'server' ? '数据库数据集实时计算' : 'Mock 数据实时计算' }}</p><div v-if="component.kpiConfig.showProgress" class="kpi-progress"><div><span>目标达成</span><b>{{ kpiProgress(component).toFixed(1) }}%</b></div><i><em :style="{ width: `${Math.min(100, kpiProgress(component))}%`, background: component.kpiConfig.progressColor }"></em></i></div></template>
                  </template>
                </div>
                <button v-if="component.id === selectedId && !previewMode" class="inline-delete" type="button" aria-label="删除组件" @pointerdown.stop @click.stop="deleteSelected"><IconTrash :size="14" /></button>
                <i v-for="direction in resizeDirections" v-if="component.id === selectedId && !previewMode" :key="direction" class="resize-handle resize-handle-all" :class="`handle-${direction}`" :data-resize-direction="direction" :aria-label="`${direction} 方向调整大小`" @pointerdown.stop="startPointer($event, component, 'resize', direction)"></i>
              </article>
              <div v-if="!components.length" class="canvas-empty"><IconPlus :size="28" /><b>画布为空</b><span>从左侧添加组件</span></div>
            </div>
          </div>
        </div>
      </section>

      <aside class="property-panel" aria-label="属性配置">
        <i class="panel-width-handle panel-width-handle-left" aria-label="拖拽调整配置区宽度" @pointerdown="startPanelResize('right', $event)"></i>
        <div class="property-header"><div><small>INSPECTOR</small><h2>{{ selected ? '组件配置' : '画布配置' }}</h2></div><span><component :is="selected ? IconActivityHeartbeat : IconLayoutDashboard" :size="15" />{{ selected ? selected.type : 'canvas' }}</span></div>
        <div class="property-tabs" role="tablist"><button v-for="item in visibleTabs" :key="item.id" :class="{ active: activeTab === item.id }" type="button" role="tab" :aria-selected="activeTab === item.id" @click="activeTab = item.id">{{ item.label }}</button></div>

        <div v-if="selected" class="property-body">
          <section v-if="activeTab === 'data'" class="property-section dataset-binding-section">
            <h3><span>01</span>维度与指标</h3>
            <div class="field-slot-group"><div class="field-slot-heading"><b>维度</b><button type="button" @click="addDimensionField"><IconPlus :size="13" />添加</button></div><div v-for="(dimension, index) in selected.dataConfig.dimensions" :key="dimension.field" class="field-slot-row"><span>{{ index + 1 }}</span><select v-model="dimension.field" title="维度字段" @change="markDirty"><option v-for="field in fieldsFor(selected)" :key="field.name" :value="field.name">{{ field.label }} · {{ field.type }}</option></select><select v-model="dimension.role" title="维度用途" @change="markDirty"><option value="category">分类</option><option value="series">系列</option><option value="detail">明细</option></select><select v-model="dimension.sort" title="排序" @change="markDirty"><option value="none">不排序</option><option value="asc">升序</option><option value="desc">降序</option></select><button type="button" title="删除维度" @click="removeDimensionField(index)">×</button></div></div>
            <div class="field-slot-group"><div class="field-slot-heading"><b>指标</b><button type="button" @click="addMeasureField"><IconPlus :size="13" />添加</button></div><div v-for="(measure, index) in selected.dataConfig.measures" :key="measure.field" class="measure-slot-card"><b v-if="measureRole(selected.type, index)" class="measure-role">{{ measureRole(selected.type, index) }}</b><div><span>{{ index + 1 }}</span><select v-model="measure.field" title="指标字段" @change="markDirty"><option v-for="field in fieldsFor(selected)" :key="field.name" :value="field.name">{{ field.label }} · {{ field.type }}</option></select><button type="button" title="删除指标" @click="removeMeasureField(index)">×</button></div><div><select v-model="measure.aggregation" title="聚合方式" @change="markDirty"><option v-for="option in aggregationOptionsFor(selected, measure.field)" :key="option.value" :value="option.value">{{ option.label }}</option></select><select :value="measureSortDirection(measure.field)" title="按聚合结果排序" @change="setMeasureSort(measure.field, $event)"><option value="none">不排序</option><option value="asc">升序</option><option value="desc">降序</option></select><select v-if="supportsSeriesStyle(selected.type)" v-model="measure.chartType" @change="markDirty"><option value="bar">柱</option><option value="line">线</option><option value="area">面积</option></select><select v-if="supportsSeriesStyle(selected.type)" v-model="measure.axis" @change="markDirty"><option value="left">左轴</option><option value="right">右轴</option></select><input v-model="measure.alias" placeholder="系列名称" @input="markDirty" /></div></div></div>
            <template v-if="sourceKindFor(selected) === 'server' && datasetParametersFor(selected).length">
              <div class="parameter-binding-heading"><h3><span>02</span>参数绑定</h3><button type="button" @click="autoBindSelectedParameters">按编码/别名匹配</button></div>
              <p class="parameter-binding-help">客户端只保存“数据集参数编码 → 看板参数 ID”，字段名与运算符由服务端数据集定义决定。</p>
              <label class="parameter-refresh-policy">刷新策略<select :value="componentDataConfigV3(selected).refreshPolicy" @change="setSelectedRefreshPolicy"><option value="onParameterChange">参数变化时刷新</option><option value="onPageEnter">首次进入刷新</option><option value="manual">仅手工刷新</option></select></label>
              <div v-for="parameter in datasetParametersFor(selected)" :key="parameter.id" class="parameter-binding-row">
                <label><b>{{ parameter.name }}</b><small>{{ parameter.code }} · {{ parameter.sqlName }} · {{ parameter.operator }}</small></label>
                <select :value="parameterBindingFor(selected, parameter.code)" @change="setSelectedParameterBinding(parameter.code, $event)">
                  <option value="">{{ parameter.required ? '请选择（必填）' : '不绑定' }}</option>
                  <option v-for="candidate in dashboardApplication.parameters" :key="candidate.id" :value="candidate.id">{{ candidate.name }} · {{ candidate.code }} · {{ candidate.type }}</option>
                </select>
              </div>
            </template>
          </section>
          <section v-else-if="activeTab === 'style'" class="property-section"><h3><span>01</span>标题与容器</h3><label>组件标题<input v-model="selected.title" @input="markDirty" /></label><div class="switch-row"><span>显示组件标题</span><input v-model="selected.styleConfig.titleVisible" type="checkbox" @change="markDirty" /></div><div class="number-pair"><label>标题字号<input v-model.number="selected.styleConfig.titleSize" type="number" min="8" max="48" @change="markDirty" /></label><label>标题粗细<select v-model.number="selected.styleConfig.titleWeight" @change="markDirty"><option :value="400">常规</option><option :value="600">半粗</option><option :value="700">粗体</option></select></label></div><div class="color-row"><label>标题色<input v-model="selected.styleConfig.titleColor" type="color" @input="markDirty" /></label><label>背景色<input v-model="selected.styleConfig.background" type="color" @input="markDirty" /></label></div><template v-if="isChart(selected.type) && selected.analysisConfig"><h3><span>02</span>坐标轴与标签</h3><div class="axis-config-block"><b>{{ selected.type === 'scatter' || selected.type === 'bubble' ? 'X 轴' : '左 Y 轴' }}</b><div class="analysis-grid"><label>轴标题<input v-model="selected.analysisConfig.leftAxisTitle" placeholder="可选" @input="markDirty" /></label><label>单位<input v-model="selected.analysisConfig.leftAxisUnit" placeholder="万元、人次" @input="markDirty" /></label><label>坐标轴颜色<input v-model="selected.analysisConfig.leftAxisColor" type="color" @input="markDirty" /></label><span></span></div></div><div class="axis-config-block"><b>{{ selected.type === 'scatter' || selected.type === 'bubble' ? 'Y 轴' : '右 Y 轴' }}</b><div class="analysis-grid"><label>轴标题<input v-model="selected.analysisConfig.rightAxisTitle" placeholder="可选" @input="markDirty" /></label><label>单位<input v-model="selected.analysisConfig.rightAxisUnit" placeholder="%、天" @input="markDirty" /></label><span></span><span></span></div></div><div v-if="selected.type === 'scatter' || selected.type === 'bubble'" class="analysis-grid"><label>X 轴最小<input v-model.number="selected.analysisConfig.xMin" type="number" placeholder="自动" @change="markDirty" /></label><label>X 轴最大<input v-model.number="selected.analysisConfig.xMax" type="number" placeholder="自动" @change="markDirty" /></label><label>Y 轴最小<input v-model.number="selected.analysisConfig.yLeftMin" type="number" placeholder="自动" @change="markDirty" /></label><label>Y 轴最大<input v-model.number="selected.analysisConfig.yLeftMax" type="number" placeholder="自动" @change="markDirty" /></label></div><div v-else class="analysis-grid"><label>左轴最小<input v-model.number="selected.analysisConfig.yLeftMin" type="number" placeholder="自动" @change="markDirty" /></label><label>左轴最大<input v-model.number="selected.analysisConfig.yLeftMax" type="number" placeholder="自动" @change="markDirty" /></label><label>右轴最小<input v-model.number="selected.analysisConfig.yRightMin" type="number" placeholder="自动" @change="markDirty" /></label><label>右轴最大<input v-model.number="selected.analysisConfig.yRightMax" type="number" placeholder="自动" @change="markDirty" /></label></div><template v-if="(selected.type === 'combo' || selected.dataConfig.measures.length > 1) && selected.type !== 'bubble' && selected.type !== 'scatter'"><div class="series-style-labels"><div v-for="(measure, index) in selected.dataConfig.measures" :key="`label-${measure.field}`" class="series-style-card"><b>{{ measure.alias || measure.field || `指标 ${index + 1}` }}</b><div class="switch-row"><span>显示标签</span><input v-model="measure.labelConfig!.show" type="checkbox" @change="markDirty" /></div><div class="switch-row"><span>显示分类名</span><input v-model="measure.labelConfig!.showCategory" type="checkbox" @change="markDirty" /></div><div class="switch-row"><span>显示系列名</span><input v-model="measure.labelConfig!.showSeries" type="checkbox" @change="markDirty" /></div><label>值显示形式<select v-model="measure.labelConfig!.mode" @change="markDirty"><option value="value">数值</option><option value="percentage">百分比</option><option value="both">数值 + 百分比</option></select></label><div class="number-pair"><label>单位<input v-model="measure.labelConfig!.unit" @input="markDirty" /></label><label>小数位<input v-model.number="measure.labelConfig!.decimals" type="number" min="0" max="6" @change="markDirty" /></label></div></div></div></template><template v-else><div class="switch-row"><span>显示数据标签</span><input v-model="selected.analysisConfig.showLabels" type="checkbox" @change="markDirty" /></div><div class="switch-row"><span>显示分类名</span><input v-model="selected.analysisConfig.labelShowCategory" type="checkbox" @change="markDirty" /></div><template v-if="selected.type === 'bubble'"><div class="series-style-labels bubble-labels"><div v-for="(measure, index) in selected.dataConfig.measures.slice(0, 3)" :key="`bubble-label-${measure.field}`" class="series-style-card"><b>{{ ['X 轴值', 'Y 轴值', '气泡大小'][index] }} · {{ measure.alias || measure.field }}</b><div class="switch-row"><span>显示该值</span><input v-model="measure.labelConfig!.show" type="checkbox" @change="markDirty" /></div><label>显示形式<select v-model="measure.labelConfig!.mode" @change="markDirty"><option value="value">数值</option><option value="percentage">百分比</option><option value="both">数值 + 百分比</option></select></label><div class="number-pair"><label>单位<input v-model="measure.labelConfig!.unit" @input="markDirty" /></label><label>小数位<input v-model.number="measure.labelConfig!.decimals" type="number" min="0" max="6" @change="markDirty" /></label></div></div></div></template><template v-else><div class="switch-row"><span>显示系列名</span><input v-model="selected.analysisConfig.labelShowSeries" type="checkbox" @change="markDirty" /></div><div class="number-pair"><label>小数位<input v-model.number="selected.analysisConfig.labelDecimals" type="number" min="0" max="6" @change="markDirty" /></label><label>标签位置<select v-model="selected.analysisConfig.labelPosition" @change="markDirty"><option value="top">顶部</option><option value="inside">内部</option><option value="outside">外部</option></select></label></div><label>标签单位<input v-model="selected.analysisConfig.labelUnit" placeholder="留空则使用指标单位" @input="markDirty" /></label><label>值显示形式<select v-model="selected.analysisConfig.labelMode" @change="markDirty"><option value="value">数值</option><option value="percentage">百分比</option><option value="both">数值 + 百分比</option></select></label></template></template><div class="legend-config"><h3><span>03</span>图例</h3><div class="switch-row"><span>显示图例</span><input v-model="selected.analysisConfig.legendVisible" type="checkbox" @change="markDirty" /></div><label v-if="selected.analysisConfig.legendVisible">图例位置<select v-model="selected.analysisConfig.legendPosition" @change="markDirty"><option value="top">顶部</option><option value="left">左侧</option><option value="right">右侧</option><option value="bottom">下方</option></select></label></div><div class="warning-heading"><b>预警线</b><button type="button" @click="addWarningLine"><IconPlus :size="13" />添加</button></div><div v-for="(line, index) in selected.analysisConfig.warningLines" :key="line.id" class="warning-row dynamic"><select v-model="line.axis" title="预警线方向" @change="markDirty"><option value="x">X 轴</option><option value="y">Y 轴</option></select><select v-model="line.source" @change="markDirty"><option value="fixed">固定值</option><option value="average">平均值</option><option value="min">最小值</option><option value="max">最大值</option><option value="median">中位数</option><option value="percentile">百分位</option><option value="measure">指标平均值</option><option v-if="line.axis === 'y'" value="target">目标值字段（动态曲线）</option></select><input v-if="line.source === 'fixed'" v-model.number="line.value" type="number" @change="markDirty" /><input v-else-if="line.source === 'percentile'" v-model.number="line.percentile" type="number" min="0" max="100" @change="markDirty" /><select v-else-if="line.source === 'measure' || line.source === 'target'" v-model="line.measureField" @change="markDirty"><option v-for="measure in selected.dataConfig.measures" :key="measure.field" :value="measure.field">{{ measure.alias || measure.field }}</option></select><span v-else>自动计算</span><select v-if="line.axis === 'y'" v-model="line.axisSide" title="预警线轴"><option value="left">左轴</option><option value="right">右轴</option></select><select v-model="line.lineStyle" title="线型"><option value="solid">实线</option><option value="dashed">虚线</option><option value="dotted">点线</option></select><input v-model="line.label" @input="markDirty" /><input v-model="line.color" type="color" @input="markDirty" /><button type="button" @click="removeWarningLine(index)">×</button></div></template><template v-if="isKpi(selected.type) && selected.kpiConfig"><h3><span>02</span>指标卡配置</h3><label>主指标字段<select v-model="selected.kpiConfig.primaryMeasureField" @change="markDirty"><option v-for="field in fieldsFor(selected).filter((item) => item.type === 'number')" :key="field.name" :value="field.name">{{ field.label }}</option></select></label><div class="number-pair"><label>单位<input v-model="selected.kpiConfig.unit" placeholder="万元、人次、%" @input="markDirty" /></label><label>小数位<input v-model.number="selected.kpiConfig.decimals" type="number" min="0" max="6" @change="markDirty" /></label></div><div class="switch-row"><span>使用千分位</span><input v-model="selected.kpiConfig.useGrouping" type="checkbox" @change="markDirty" /></div><div class="number-pair"><label>同比基准字段<select v-model="selected.kpiConfig.yoyField" @change="markDirty"><option value="">不显示</option><option v-for="field in fieldsFor(selected)" :key="field.name" :value="field.name">{{ field.label }}</option></select></label><label>环比基准字段<select v-model="selected.kpiConfig.momField" @change="markDirty"><option value="">不显示</option><option v-for="field in fieldsFor(selected)" :key="field.name" :value="field.name">{{ field.label }}</option></select></label></div><div class="color-row"><label>上升颜色<input v-model="selected.kpiConfig.positiveColor" type="color" @input="markDirty" /></label><label>下降颜色<input v-model="selected.kpiConfig.negativeColor" type="color" @input="markDirty" /></label></div><div class="switch-row"><span>显示目标进度条</span><input v-model="selected.kpiConfig.showProgress" type="checkbox" @change="markDirty" /></div><template v-if="selected.kpiConfig.showProgress"><label>目标来源<select v-model="selected.kpiConfig.targetMode" @change="markDirty"><option value="fixed">固定目标</option><option value="field">目标字段</option></select></label><label v-if="selected.kpiConfig.targetMode === 'fixed'">目标值<input v-model.number="selected.kpiConfig.targetValue" type="number" @change="markDirty" /></label><label v-else>目标字段<select v-model="selected.kpiConfig.targetField" @change="markDirty"><option v-for="field in fieldsFor(selected)" :key="field.name" :value="field.name">{{ field.label }}</option></select></label><label>进度颜色<input v-model="selected.kpiConfig.progressColor" type="color" @input="markDirty" /></label></template></template><template v-if="selected.type === 'table' && selected.tableConfig"><h3><span>02</span>表格专属配置</h3><div class="switch-row"><span>显示表头</span><input v-model="selected.tableConfig.showHeader" type="checkbox" @change="markDirty" /></div><div class="switch-row"><span>斑马纹</span><input v-model="selected.tableConfig.striped" type="checkbox" @change="markDirty" /></div><div v-for="column in selected.tableConfig.columns" :key="column.field" class="table-column-config"><input v-model="column.label" placeholder="列名" @input="markDirty" /><input v-model.number="column.width" type="number" min="60" max="600" title="列宽" @change="markDirty" /><select v-model="column.format" title="格式" @change="markDirty"><option value="auto">自动</option><option value="number">数值</option><option value="percentage">百分比</option><option value="date">日期</option></select><select v-model="column.summary" title="汇总" @change="markDirty"><option value="none">不汇总</option><option value="sum">合计</option><option value="avg">平均</option><option value="count">计数</option></select></div></template></section>
          <div v-else-if="activeTab === 'interaction'" class="reserved-state"><IconSettings :size="28" /><b>交互能力已预留</b><span>组件联动与页面跳转将在 V2 实现。</span></div>
          <section v-else-if="activeTab === 'layout'" class="property-section"><h3><span>01</span>位置与尺寸</h3><div class="layout-fields editable"><label>X<input v-model.number="selected.position.x" type="number" @change="normalizeSelected" /></label><label>Y<input v-model.number="selected.position.y" type="number" @change="normalizeSelected" /></label><label>W<input v-model.number="selected.position.width" type="number" @change="normalizeSelected" /></label><label>H<input v-model.number="selected.position.height" type="number" @change="normalizeSelected" /></label></div><p>选中组件后可使用四角和四边中心共 8 个缩放手柄。</p></section>
          <section v-else class="property-section json-section"><h3><span>01</span>组件复用</h3><div class="medical-template-registration"><label class="template-checkbox"><input type="checkbox" :checked="Boolean(selectedMedicalTemplate)" @change="registerSelectedMedical($event)" /><span>转为医疗业务组件，可在其他看板复用</span></label><template v-if="selectedMedicalTemplate"><label>组件分类<input :value="selectedMedicalTemplate.category" placeholder="例如：门诊运营、收入分析" @change="updateMedicalCategory(($event.target as HTMLInputElement).value)" /></label><button type="button" @click="updateSelectedMedicalTemplate">更新当前配置到组件库</button></template></div><h3><span>02</span>组件 JSON</h3><pre>{{ selectedJson }}</pre><details><summary>查看完整看板 JSON</summary><pre>{{ dashboardJson }}</pre></details></section>
        </div>

        <div v-else class="property-body">
          <section v-if="activeTab === 'layout'" class="property-section"><h3><span>01</span>画布尺寸</h3><div class="layout-fields editable"><label>W<input v-model.number="dashboard.canvas.width" type="number" @change="normalizeCanvas" /></label><label>H<input v-model.number="dashboard.canvas.height" type="number" @change="normalizeCanvas" /></label></div><div class="canvas-presets"><button type="button" @click="dashboard.canvas.width = 1200; dashboard.canvas.height = 600; normalizeCanvas()">1200 × 600</button><button type="button" @click="dashboard.canvas.width = 960; dashboard.canvas.height = 540; normalizeCanvas()">960 × 540</button></div><label class="mt-3">网格间距<input v-model.number="dashboard.canvas.gridSize" type="number" min="4" max="40" @change="normalizeCanvas" /></label><div class="switch-row"><span>显示网格</span><input v-model="dashboard.canvas.showGrid" type="checkbox" @change="markDirty" /></div></section>
          <section v-else-if="activeTab === 'style'" class="property-section"><h3><span>01</span>看板与标题</h3><label>看板标题<input v-model="dashboard.name" @input="markDirty" /></label><div class="switch-row"><span>显示看板标题</span><input v-model="dashboard.titleStyle.show" type="checkbox" @change="markDirty" /></div><div class="number-pair"><label>标题字号<input v-model.number="dashboard.titleStyle.fontSize" type="number" min="12" max="72" @change="markDirty" /></label><label>标题对齐<select v-model="dashboard.titleStyle.align" @change="markDirty"><option value="left">左对齐</option><option value="center">居中</option><option value="right">右对齐</option></select></label></div><div class="color-row"><label>标题颜色<input v-model="dashboard.titleStyle.color" type="color" @input="markDirty" /></label><label>画布背景<input v-model="dashboard.canvas.background" type="color" @input="markDirty" /></label></div></section>
          <section v-else-if="activeTab === 'advanced'" class="property-section json-section"><h3><span>01</span>完整看板 JSON</h3><pre>{{ dashboardJson }}</pre></section>
          <div v-else class="reserved-state"><IconLayoutDashboard :size="28" /><b>画布级配置</b><span>请使用“样式”“布局”或“高级”Tab。</span></div>
        </div>

        <footer><span>{{ selected ? selected.id : `${dashboard.canvas.width} × ${dashboard.canvas.height}` }}</span><button v-if="selected" type="button" @click="deleteSelected"><IconTrash :size="14" />删除</button><button v-else type="button" class="save-footer" @click="saveDashboard"><IconDeviceFloppy :size="14" />保存画布</button></footer>
      </aside>
    </main>
    <DatasetCatalog v-if="datasetCatalogOpen" :current-id="selected?.dataConfig.datasetId" @choose="chooseServerDataset" @close="datasetCatalogOpen = false" />
  </div>
</template>

<style src="../styles/designer-workspace.css"></style>
<style src="../styles/designer-step3.css"></style>
<style src="../styles/designer-step4.css"></style>
<style src="../styles/designer-step51.css"></style>
<style src="../styles/designer-v2-fields.css"></style>
<style src="../styles/designer-phase8-binding.css"></style>
<style src="../styles/designer-phase8-controls.css"></style>
