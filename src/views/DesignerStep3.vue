<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  IconActivityHeartbeat,
  IconBed,
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
import CanvasChart from '../components/CanvasChart.vue'

type PropertyTab = 'data' | 'style' | 'interaction' | 'layout' | 'advanced'
type ComponentType = 'kpi' | 'line' | 'bar' | 'pie' | 'table' | 'text' | 'income' | 'outpatient' | 'ranking' | 'bed'

interface Position {
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

interface DashboardComponent {
  id: string
  type: ComponentType
  title: string
  position: Position
  dataConfig: { datasetId: string; field: string }
  styleConfig: { background: string; titleColor: string }
}

interface PointerAction {
  id: string
  mode: 'move' | 'resize'
  startClientX: number
  startClientY: number
  start: Position
}

const CANVAS_WIDTH = 600
const CANVAS_HEIGHT = 520
const MIN_WIDTH = 120
const MIN_HEIGHT = 78

const catalog = [
  { group: '基础组件', label: '指标卡', type: 'kpi' as const, icon: IconActivityHeartbeat, tone: 'blue' },
  { group: '基础组件', label: '折线图', type: 'line' as const, icon: IconChartLine, tone: 'cyan' },
  { group: '基础组件', label: '柱状图', type: 'bar' as const, icon: IconChartBar, tone: 'orange' },
  { group: '基础组件', label: '饼图', type: 'pie' as const, icon: IconChartPie, tone: 'purple' },
  { group: '基础组件', label: '数据表格', type: 'table' as const, icon: IconTable, tone: 'green' },
  { group: '基础组件', label: '文本', type: 'text' as const, icon: IconTypography, tone: 'slate' },
  { group: '医疗业务组件', label: '收入分析卡', type: 'income' as const, icon: IconTrendingUp, tone: 'blue' },
  { group: '医疗业务组件', label: '门诊趋势', type: 'outpatient' as const, icon: IconBuildingHospital, tone: 'cyan' },
  { group: '医疗业务组件', label: '科室排名', type: 'ranking' as const, icon: IconChartBar, tone: 'orange' },
  { group: '医疗业务组件', label: '床位利用率', type: 'bed' as const, icon: IconBed, tone: 'green' },
]

const tabs: Array<{ id: PropertyTab; label: string }> = [
  { id: 'data', label: '数据' },
  { id: 'style', label: '样式' },
  { id: 'interaction', label: '交互' },
  { id: 'layout', label: '布局' },
  { id: 'advanced', label: '高级' },
]

const components = ref<DashboardComponent[]>([
  createInitial('kpi_income', 'income', '总收入', 0, 0, 185, 112),
  createInitial('kpi_visit', 'kpi', '门诊量', 200, 0, 185, 112),
  createInitial('kpi_bed', 'bed', '床位利用率', 400, 0, 185, 112),
  createInitial('chart_income', 'line', '收入趋势', 0, 128, 385, 272),
  createInitial('chart_dept', 'ranking', '科室收入排名', 400, 128, 185, 272),
])

const activeTab = ref<PropertyTab>('data')
const query = ref('')
const selectedId = ref('kpi_income')
const canvasElement = ref<HTMLDivElement | null>(null)
let pointerAction: PointerAction | null = null

function createInitial(id: string, type: ComponentType, title: string, x: number, y: number, width: number, height: number): DashboardComponent {
  return {
    id,
    type,
    title,
    position: { x, y, width, height, zIndex: 1 },
    dataConfig: { datasetId: 'income_month', field: type === 'bed' ? 'usage_rate' : 'amount' },
    styleConfig: { background: '#ffffff', titleColor: '#243447' },
  }
}

const groupedCatalog = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  const filtered = keyword ? catalog.filter((item) => item.label.toLowerCase().includes(keyword)) : catalog
  return ['基础组件', '医疗业务组件']
    .map((label) => ({ label, items: filtered.filter((item) => item.group === label) }))
    .filter((group) => group.items.length)
})

const selected = computed(() => components.value.find((component) => component.id === selectedId.value))
const dashboardJson = computed(() => JSON.stringify({ name: '医院运营概览', canvas: { width: CANVAS_WIDTH, height: CANVAS_HEIGHT }, components: components.value }, null, 2))
const selectedJson = computed(() => selected.value ? JSON.stringify(selected.value, null, 2) : '{}')

function defaultSize(type: ComponentType) {
  if (['line', 'bar', 'pie', 'outpatient', 'ranking'].includes(type)) return { width: 280, height: 220 }
  if (type === 'table') return { width: 360, height: 220 }
  if (type === 'text') return { width: 260, height: 90 }
  return { width: 185, height: 112 }
}

function addComponent(type: ComponentType, dropX?: number, dropY?: number) {
  const item = catalog.find((entry) => entry.type === type)
  if (!item) return
  const size = defaultSize(type)
  const offset = (components.value.length * 18) % 150
  const x = clamp(dropX ?? 24 + offset, 0, CANVAS_WIDTH - size.width)
  const y = clamp(dropY ?? 24 + offset, 0, CANVAS_HEIGHT - size.height)
  const id = `${type}_${Date.now().toString(36)}`
  components.value.push(createInitial(id, type, item.label, x, y, size.width, size.height))
  selectedId.value = id
  activeTab.value = 'layout'
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

function startPointer(event: PointerEvent, component: DashboardComponent, mode: 'move' | 'resize') {
  const target = event.target as HTMLElement
  if (mode === 'move' && target.closest('button, input')) return
  event.preventDefault()
  selectedId.value = component.id
  component.position.zIndex = Math.max(...components.value.map((item) => item.position.zIndex), 1) + 1
  pointerAction = {
    id: component.id,
    mode,
    startClientX: event.clientX,
    startClientY: event.clientY,
    start: { ...component.position },
  }
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', endPointer, { once: true })
}

function handlePointerMove(event: PointerEvent) {
  if (!pointerAction) return
  const component = components.value.find((item) => item.id === pointerAction?.id)
  if (!component) return
  const deltaX = event.clientX - pointerAction.startClientX
  const deltaY = event.clientY - pointerAction.startClientY

  if (pointerAction.mode === 'move') {
    component.position.x = Math.round(clamp(pointerAction.start.x + deltaX, 0, CANVAS_WIDTH - component.position.width))
    component.position.y = Math.round(clamp(pointerAction.start.y + deltaY, 0, CANVAS_HEIGHT - component.position.height))
  } else {
    component.position.width = Math.round(clamp(pointerAction.start.width + deltaX, MIN_WIDTH, CANVAS_WIDTH - component.position.x))
    component.position.height = Math.round(clamp(pointerAction.start.height + deltaY, MIN_HEIGHT, CANVAS_HEIGHT - component.position.y))
  }
}

function endPointer() {
  pointerAction = null
  window.removeEventListener('pointermove', handlePointerMove)
}

function normalizeSelected() {
  if (!selected.value) return
  const position = selected.value.position
  position.width = Math.round(clamp(position.width, MIN_WIDTH, CANVAS_WIDTH))
  position.height = Math.round(clamp(position.height, MIN_HEIGHT, CANVAS_HEIGHT))
  position.x = Math.round(clamp(position.x, 0, CANVAS_WIDTH - position.width))
  position.y = Math.round(clamp(position.y, 0, CANVAS_HEIGHT - position.height))
}

function deleteSelected() {
  if (!selected.value) return
  const index = components.value.findIndex((component) => component.id === selectedId.value)
  components.value.splice(index, 1)
  selectedId.value = components.value[Math.min(index, components.value.length - 1)]?.id ?? ''
}

function handleKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement
  if ((event.key === 'Delete' || event.key === 'Backspace') && !target.closest('input, textarea')) deleteSelected()
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max))
}

function componentStyle(component: DashboardComponent) {
  const { x, y, width, height, zIndex } = component.position
  return { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px`, zIndex, background: component.styleConfig.background }
}

function chartKind(type: ComponentType): 'line' | 'bar' | 'pie' {
  if (type === 'pie') return 'pie'
  if (type === 'bar' || type === 'ranking') return 'bar'
  return 'line'
}

function isChart(type: ComponentType) {
  return ['line', 'bar', 'pie', 'outpatient', 'ranking'].includes(type)
}

onMounted(() => window.addEventListener('keydown', handleKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('pointermove', handlePointerMove)
})
</script>

<template>
  <div class="designer-shell step3-shell">
    <header class="designer-toolbar">
      <div class="brand-block"><span class="brand-mark"><IconDeviceDesktopAnalytics :size="20" /></span><div><b>医疗 BI Designer</b><small>MVP · Step 3 布局交互</small></div></div>
      <div class="dashboard-identity"><span>当前看板</span><button type="button">医院运营概览 <IconChevronDown :size="15" /></button><em>{{ components.length }} 个组件</em></div>
      <div class="toolbar-actions">
        <button type="button" disabled><IconFileImport :size="17" />导入</button><button type="button" disabled><IconFileExport :size="17" />导出</button><button type="button" disabled><IconEye :size="17" />预览</button><button class="primary-action" type="button" disabled><IconDeviceFloppy :size="17" />保存</button>
      </div>
    </header>

    <main class="designer-workspace">
      <aside class="component-panel" aria-label="组件库">
        <div class="panel-heading"><div><small>COMPONENTS</small><h1>组件库</h1></div><span>{{ catalog.length }}</span></div>
        <label class="component-search"><IconSearch :size="17" /><input v-model="query" type="search" placeholder="搜索组件" aria-label="搜索组件" /></label>
        <div class="component-groups">
          <section v-for="group in groupedCatalog" :key="group.label">
            <h2>{{ group.label }}</h2>
            <div class="component-grid">
              <button v-for="item in group.items" :key="item.type" draggable="true" type="button" :data-component-type="item.type" title="单击添加，或拖入画布" @dragstart="handleDragStart($event, item.type)" @click="addComponent(item.type)">
                <span :class="`tone-${item.tone}`"><component :is="item.icon" :size="20" /></span>{{ item.label }}<IconPlus class="add-indicator" :size="13" />
              </button>
            </div>
          </section>
        </div>
        <div class="panel-footnote active-note"><i></i>单击添加，或拖入画布指定位置</div>
      </aside>

      <section class="canvas-stage" aria-label="看板画布">
        <div class="canvas-meta"><div><IconLayoutDashboard :size="16" />医院运营概览 <span>/</span><b>布局模式</b></div><button type="button" @click="activeTab = 'advanced'"><IconCode :size="14" />布局 JSON</button></div>
        <div class="artboard-wrap">
          <div class="artboard interactive-artboard">
            <div class="artboard-heading"><div><small>HOSPITAL OPERATIONS</small><h2>医院运营概览</h2></div><span>拖动组件调整位置 · 拖动右下角调整尺寸</span></div>
            <div ref="canvasElement" class="interactive-canvas" :style="{ width: `${CANVAS_WIDTH}px`, height: `${CANVAS_HEIGHT}px` }" @dragover.prevent @drop.prevent="handleDrop">
              <article v-for="component in components" :key="component.id" class="design-component" :class="{ 'is-selected': component.id === selectedId }" :data-component-id="component.id" :style="componentStyle(component)" @pointerdown="startPointer($event, component, 'move')" @click.stop="selectedId = component.id">
                <div v-if="component.id === selectedId" class="selection-label">当前选中</div>
                <button class="widget-grip" type="button" aria-label="移动组件"><IconGripVertical :size="16" /></button>
                <div class="design-component-header"><span :style="{ color: component.styleConfig.titleColor }">{{ component.title }}</span><IconDots :size="17" /></div>
                <div class="design-component-body">
                  <CanvasChart v-if="isChart(component.type)" :kind="chartKind(component.type)" />
                  <template v-else-if="component.type === 'table'"><table><tbody><tr><td>内科</td><td>2,480</td></tr><tr><td>外科</td><td>2,160</td></tr><tr><td>医技</td><td>1,840</td></tr></tbody></table></template>
                  <template v-else-if="component.type === 'text'"><strong class="text-preview">医院运营分析说明</strong><p class="text-note">支持标题和说明文本。</p></template>
                  <template v-else><strong class="kpi-value">{{ component.type === 'bed' ? '91.6' : component.type === 'kpi' ? '126,580' : '8,420.6' }}<small>{{ component.type === 'bed' ? '%' : component.type === 'kpi' ? '人次' : '万元' }}</small></strong><p class="kpi-trend"><IconTrendingUp :size="15" />同比增长 12.8%</p></template>
                </div>
                <button v-if="component.id === selectedId" class="inline-delete" type="button" aria-label="删除组件" @pointerdown.stop @click.stop="deleteSelected"><IconTrash :size="14" /></button>
                <i v-if="component.id === selectedId" class="resize-handle" aria-label="调整组件大小" @pointerdown.stop="startPointer($event, component, 'resize')"></i>
              </article>
              <div v-if="!components.length" class="canvas-empty"><IconPlus :size="28" /><b>画布为空</b><span>从左侧添加或拖入组件</span></div>
            </div>
          </div>
        </div>
      </section>

      <aside class="property-panel" aria-label="属性配置">
        <div class="property-header"><div><small>INSPECTOR</small><h2>属性配置</h2></div><span v-if="selected"><IconActivityHeartbeat :size="15" />{{ selected.type }}</span></div>
        <div class="property-tabs" role="tablist"><button v-for="item in tabs" :key="item.id" :class="{ active: activeTab === item.id }" type="button" role="tab" :aria-selected="activeTab === item.id" @click="activeTab = item.id">{{ item.label }}</button></div>
        <div v-if="selected" class="property-body">
          <section v-if="activeTab === 'data'" class="property-section"><h3><span>01</span>数据绑定</h3><label>数据集<input v-model="selected.dataConfig.datasetId" /></label><label>字段<input v-model="selected.dataConfig.field" /></label><p>真实查询结果绑定将在 Step 4 开放。</p></section>
          <section v-else-if="activeTab === 'style'" class="property-section"><h3><span>01</span>标题与容器</h3><label>组件标题<input v-model="selected.title" /></label><div class="color-row"><label>标题色<input v-model="selected.styleConfig.titleColor" type="color" /></label><label>背景色<input v-model="selected.styleConfig.background" type="color" /></label></div></section>
          <div v-else-if="activeTab === 'interaction'" class="reserved-state"><IconSettings :size="28" /><b>交互能力已预留</b><span>组件联动与页面跳转将在 V2 实现。</span></div>
          <section v-else-if="activeTab === 'layout'" class="property-section"><h3><span>01</span>位置与尺寸</h3><div class="layout-fields editable"><label>X<input v-model.number="selected.position.x" type="number" @change="normalizeSelected" /></label><label>Y<input v-model.number="selected.position.y" type="number" @change="normalizeSelected" /></label><label>W<input v-model.number="selected.position.width" type="number" @change="normalizeSelected" /></label><label>H<input v-model.number="selected.position.height" type="number" @change="normalizeSelected" /></label></div><p>坐标范围自动限制在 1200 × 600 画布内。</p></section>
          <section v-else class="property-section json-section"><h3><span>01</span>组件 JSON</h3><pre>{{ selectedJson }}</pre><details><summary>查看完整看板 JSON</summary><pre>{{ dashboardJson }}</pre></details></section>
        </div>
        <div v-else class="property-body"><div class="reserved-state"><IconLayoutDashboard :size="28" /><b>未选择组件</b><span>单击画布组件查看配置。</span></div></div>
        <footer><span>{{ selected ? selected.id : '未选择组件' }}</span><button type="button" :disabled="!selected" @click="deleteSelected"><IconTrash :size="14" />删除</button></footer>
      </aside>
    </main>
  </div>
</template>

<style src="../styles/designer-workspace.css"></style>
<style src="../styles/designer-step3.css"></style>
