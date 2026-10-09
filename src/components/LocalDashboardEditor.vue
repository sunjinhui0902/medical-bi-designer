<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import type { DashboardApplicationV3 } from '../models/dashboard-v3'
import { listLocalLayoutTargets, listLocalMoveTargets, previewLocalDashboardMove, previewLocalDashboardEdit, previewLocalDashboardBatchStyle, type LocalBatchStyle, type LocalEditPreview } from '../services/localDashboardEdit'
const props = defineProps<{ snapshot: () => DashboardApplicationV3; pageId: string; componentId: string; applyError: string }>()
const emit = defineEmits<{ close: []; apply: [preview: LocalEditPreview]; highlight: [ids: string[]] }>()
const request = ref('标题改为门诊收入趋势 · 试用版')
const preview = ref<LocalEditPreview | null>(null)
const error = ref('')
const selectedCharts = ref<string[]>([]), width = ref<number | string>(400), height = ref<number | string>(260)
onUnmounted(() => emit('highlight', []))
const batchFont = ref<number | string>(20), batchTitleColor = ref('#2367A3'), batchBackground = ref('#EAF3FF')
const targets = computed(() => listLocalLayoutTargets(props.snapshot(), props.pageId))
const moveTargets = computed(() => listLocalMoveTargets(props.snapshot(), props.pageId))
const selectedMoveIds = ref<string[]>([]), moveX = ref<number | string>(0), moveY = ref<number | string>(20)
watch(() => [...selectedCharts.value, ...selectedMoveIds.value], ids => emit('highlight', [...new Set(ids)]))
watch([selectedMoveIds, moveX, moveY], invalidate, { deep: true, flush: 'sync' })
function move() {
  invalidate()
  try {
    if (moveX.value === '' || moveY.value === '') throw new Error('请填写横向和纵向位移')
    preview.value = previewLocalDashboardMove(props.snapshot(), props.pageId, props.componentId, selectedMoveIds.value, Number(moveX.value), Number(moveY.value))
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '无法移动' }
}
const typeNames: Record<string, string> = { line: '折线图', bar: '柱状图', pie: '饼图', area: '面积图', combo: '组合图', scatter: '散点图', bubble: '气泡图' }
function invalidate() { preview.value = null; error.value = '' }
watch([selectedCharts, width, height], invalidate, { deep: true, flush: 'sync' })
watch([batchFont, batchTitleColor, batchBackground], invalidate, { flush: 'sync' })
watch(() => props.pageId, () => { selectedCharts.value = []; selectedMoveIds.value = []; invalidate() })
function batch(command: string) {
  invalidate()
  try { preview.value = previewLocalDashboardEdit(props.snapshot(), props.pageId, props.componentId, command, { layoutTargetIds: [...selectedCharts.value] }) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '无法调整' }
}
function resize(kind: 'width' | 'height' | 'both') {
  const values = kind === 'width' ? [width.value] : kind === 'height' ? [height.value] : [width.value, height.value]
  if (values.some(v => v === '' || !Number.isSafeInteger(Number(v)) || Number(v) < 100)) { invalidate(); error.value = '宽高需填写至少100像素的整数'; return }
  batch(kind === 'both' ? `图表尺寸统一为${width.value}×${height.value}` : `图表${kind === 'width' ? '宽度' : '高度'}统一为${values[0]}`)
}
function style(kind: LocalBatchStyle['field']) {
  invalidate()
  try {
    if (kind === 'titleSize' && batchFont.value === '') throw new Error('请填写标题字号')
    const setting: LocalBatchStyle = kind === 'titleSize' ? { field: kind, value: Number(batchFont.value) } : { field: kind, value: kind === 'titleColor' ? batchTitleColor.value : batchBackground.value }
    preview.value = previewLocalDashboardBatchStyle(props.snapshot(), props.pageId, props.componentId, [...selectedCharts.value], setting)
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '无法调整' }
}
function generate() {
  preview.value = null; error.value = ''
  try { preview.value = previewLocalDashboardEdit(props.snapshot(), props.pageId, props.componentId, request.value) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '无法调整' }
}
</script>
<template>
  <div class="edit-backdrop"><section role="dialog" aria-modal="true" aria-labelledby="local-edit-title" class="edit-panel">
    <header><h2 id="local-edit-title">调整组件与图表</h2><button @click="emit('close')">关闭</button></header>
    <section class="batch-layout" aria-label="批量移动组件">
      <h3>批量选择组件，整体移动</h3><p>支持当前页顶层图表、指标卡、表格、文本和容器。正数向右/下，负数向左/上；先预览，再应用，可撤销。</p>
      <div class="examples"><button @click="selectedMoveIds = moveTargets.map(t => t.id)">全选当前页组件</button><button @click="selectedMoveIds = []">清空移动选择</button><span>已选 {{ selectedMoveIds.length }} 个</span></div>
      <div class="chart-checklist"><label v-for="target in moveTargets" :key="target.id"><input v-model="selectedMoveIds" type="checkbox" :value="target.id" />{{ target.title || target.type }}</label></div>
      <div class="size-inputs"><label>横向位移<input v-model="moveX" aria-label="横向位移" type="number" step="1" /></label><label>纵向位移<input v-model="moveY" aria-label="纵向位移" type="number" step="1" /></label></div>
      <button @click="move">预览整体移动</button>
    </section>
    <section class="batch-layout" aria-label="勾选图表批量布局">
      <h3>勾选图表，一键整理</h3>
      <p>先勾选要调整的图表。样式可选一张或多张；对齐和尺寸需至少两张，等间距需至少三张。整理布局时建议选择同一行或同一列。</p>
      <div class="examples"><button type="button" @click="selectedCharts = targets.map(t => t.id)">全选当前页图表</button><button type="button" @click="selectedCharts = []">清空选择</button><span>已选 {{ selectedCharts.length }} 张</span></div>
      <div class="chart-checklist"><label v-for="(target, index) in targets" :key="target.id"><input v-model="selectedCharts" type="checkbox" :value="target.id" />{{ index + 1 }}. {{ target.title }} · {{ typeNames[target.type] }}</label><p v-if="!targets.length">当前页没有可调整的顶层原生图表。</p></div>
      <div class="examples"><button v-for="item in [['左对齐','图表左对齐'],['顶部对齐','图表顶部对齐'],['水平等间距','图表水平等间距分布'],['垂直等间距','图表垂直等间距分布']]" :key="item[0]" type="button" @click="batch(item[1]!)">{{ item[0] }}</button></div>
      <div class="size-inputs"><label>批量宽度<input v-model="width" type="number" min="100" step="1" /></label><label>批量高度<input v-model="height" type="number" min="100" step="1" /></label></div>
      <div class="examples"><button type="button" @click="resize('width')">统一宽度</button><button type="button" @click="resize('height')">统一高度</button><button type="button" @click="resize('both')">统一宽高</button></div>
      <h3>统一样式</h3><p>只修改勾选图表的样式，各图标题名称和数据保留。点操作查看变化，再应用。</p>
      <div class="batch-style-inputs"><label for="batch-title-size">批量标题字号<input id="batch-title-size" v-model="batchFont" type="number" min="8" max="48" step="1" /></label><label for="batch-title-color">批量标题颜色<input id="batch-title-color" v-model="batchTitleColor" type="color" /></label><label for="batch-background">批量背景色<input id="batch-background" v-model="batchBackground" type="color" /></label></div>
      <div class="examples"><button type="button" @click="style('titleSize')">统一标题字号</button><button type="button" @click="style('titleColor')">统一标题颜色</button><button type="button" @click="style('background')">统一背景色</button></div>
    </section>
    <details><summary>文字指令与单组件样式</summary>
    <p>本地指令助手。单组件样式需先选中组件；布局作用于当前页全部顶层原生图表。等间距保留整体外边界，需至少三张图且跨度足够；统一宽高需至少100像素且不越出画布。先预览，再应用。</p>
    <form @submit.prevent="generate"><label for="local-edit-request">调整要求</label><textarea id="local-edit-request" v-model="request" maxlength="150" rows="3" @input="preview = null; error = ''" />
      <div class="examples"><button v-for="example in ['标题改为门诊收入趋势 · 试用版','背景色改为#EAF3FF','字号改为24','标题颜色改为#2367A3','标题加粗','标题半粗','标题常规','当前页图表左对齐','当前页图表顶部对齐','当前页图表水平等间距分布','当前页图表垂直等间距分布','当前页图表宽度统一为400','当前页图表高度统一为260','当前页图表尺寸统一为400×260']" :key="example" type="button" @click="request = example; preview = null; error = ''">{{ example }}</button></div>
      <button type="submit">预览调整</button></form>
    </details>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="props.applyError" role="alert">{{ props.applyError }}</p>
    <div v-if="preview" class="edit-preview"><strong>{{ preview.summary }}</strong><ul><li v-for="change in preview.changes" :key="change">{{ change }}</li></ul><p v-for="warning in preview.warnings" :key="warning" class="warning">{{ warning }}</p><p>仅调整展示属性，应用后可撤销本次调整。</p><button @click="emit('apply', preview)">应用到当前看板</button></div>
  </section></div>
</template>
<style scoped>
.edit-backdrop{position:fixed;inset:0;background:#13283d66;z-index:3000;display:grid;place-items:center;padding:24px}.edit-panel{background:white;color:#243447;border-radius:16px;padding:28px;width:min(650px,100%);max-height:90vh;overflow:auto}.edit-panel header{display:flex;justify-content:space-between;align-items:center;gap:16px}.edit-panel h2{font-size:23px}.edit-panel p{line-height:1.7}.edit-panel label{display:block;margin-bottom:8px}.edit-panel textarea{box-sizing:border-box;width:100%;padding:12px;border:1px solid #c9d5e2;border-radius:8px;font:inherit}.edit-panel button{border:1px solid #c9d5e2;border-radius:7px;padding:9px 13px;background:#f2f7fb;cursor:pointer}.examples{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}.edit-preview{margin-top:20px;padding:18px;background:#f2f7fb;border-radius:12px}[role=alert]{color:#b42318}
</style>
<style scoped>.batch-style-inputs{display:flex;gap:16px;flex-wrap:wrap}.batch-style-inputs input{display:block;width:120px;height:38px;box-sizing:border-box;padding:6px;border:1px solid #c9d5e2;border-radius:7px;background:white}.batch-style-inputs input[type=color]{cursor:pointer;padding:3px}</style>
<style scoped>.warning{color:#956115}</style>
<style scoped>.batch-layout{padding:16px;background:#f2f7fb;border-radius:12px;margin-bottom:16px}.batch-layout h3{margin:0}.chart-checklist{display:grid;gap:8px;max-height:180px;overflow:auto}.chart-checklist label{display:flex;align-items:center;gap:8px;margin:0!important}.size-inputs{display:flex;gap:16px}.size-inputs input{display:block;width:120px;padding:8px;border:1px solid #c9d5e2;border-radius:7px}summary{cursor:pointer;padding:10px 0}.examples{align-items:center}</style>
