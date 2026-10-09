<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import type { ActionDefinitionV3, EventBindingV3, EventNameV3 } from '../models/dashboard-v3.ts'
import { createSimpleInteractionAction, simpleEditableAction, simpleLinkageTargets, simpleNavigationTargets, simpleParameters, uniqueCandidateId, type SimpleInteractionContext, type SimpleInteractionKind } from '../services/simpleInteractionV3.ts'
const props = defineProps<{ context: SimpleInteractionContext; bindings: EventBindingV3[]; editing: EventBindingV3 | null; blocked: boolean; fieldCapabilities: (event: EventNameV3) => SimpleInteractionContext['fields'] }>()
const emit = defineEmits<{ generate: [event: EventNameV3, action: ActionDefinitionV3]; edit: [id: string]; advanced: [] }>()
const selection = reactive({ event: '' as EventNameV3 | '', kind: 'setParameter' as SimpleInteractionKind, targetId: '', parameterId: '', fieldPath: '' })
const context = computed(() => ({ ...props.context, fields: selection.event ? props.fieldCapabilities(selection.event) : [] }))
const parameters = computed(() => {
  const all = simpleParameters(context.value)
  if (selection.kind !== 'applyLinkage') return all
  const target = simpleLinkageTargets(context.value).find(c => c.id === selection.targetId)
  return target && target.dataConfig.version === 3 ? all.filter(p => target.dataConfig.version === 3 && target.dataConfig.parameterBindings.some(b => b.parameterId === p.id)) : []
})
const targets = computed(() => selection.kind === 'applyLinkage' ? simpleLinkageTargets(context.value).map(c => ({ id: c.id, name: c.title })) : selection.kind === 'navigatePage' ? simpleNavigationTargets(context.value) : selection.kind === 'drillDown' ? props.context.drillPaths : [])
const existing = computed(() => props.bindings.find(b => b.event === selection.event))
const editingExisting = computed(() => Boolean(existing.value && props.editing?.id === existing.value.id))
const businessLabels: Record<string, string> = { month: '月份', dept_id: '科室编码', department: '科室名称', doctor_id: '医生编码', doctor: '医生编号', visits: '门诊人次' }
const isBusinessSample = computed(() => props.context.components.some(c => c.dataConfig.version === 3 && c.dataConfig.datasetId.startsWith('local-business:')))
function fieldLabel(path: string, fallback: string) {
  const key = path.split('/').at(-1) ?? ''
  return isBusinessSample.value ? businessLabels[key] ?? fallback : fallback
}
watch(() => props.context.events.join(','), () => { if (!props.context.events.includes(selection.event as EventNameV3)) selection.event = props.context.events.length === 1 ? props.context.events[0]! : '' }, { immediate: true })
watch(() => [selection.kind, targets.value.map(t => t.id).join(',')], () => { if (!targets.value.some(t => t.id === selection.targetId)) selection.targetId = uniqueCandidateId(targets.value) }, { immediate: true })
watch(() => parameters.value.map(p => p.id).join(','), () => { if (!parameters.value.some(p => p.id === selection.parameterId)) selection.parameterId = uniqueCandidateId(parameters.value) }, { immediate: true })
watch(() => context.value.fields.map(f => f.path).join(','), () => { if (!context.value.fields.some(f => f.path === selection.fieldPath)) selection.fieldPath = context.value.fields.length === 1 ? context.value.fields[0]!.path : '' }, { immediate: true })
watch(() => props.editing, binding => {
  if (!binding) return
  const action = simpleEditableAction(binding)
  if (!action) return
  selection.event = binding.event; selection.kind = action.type as SimpleInteractionKind
  if (action.type === 'navigatePage') selection.targetId = action.pageId
  if (action.type === 'drillDown') selection.targetId = action.pathId
  if (action.type === 'setParameter' || action.type === 'applyLinkage') {
    selection.parameterId = action.assignments[0]!.parameterId
    const value = action.assignments[0]!.value
    selection.fieldPath = value.kind === 'eventField' ? value.path : ''
    if (action.type === 'applyLinkage') selection.targetId = action.targetComponentIds[0]!
  }
}, { immediate: true })
const labels: Record<string, string> = { click: '点击图表', doubleClick: '双击图表', rowClick: '点击表格行', valueChange: '改变控件值', pageEnter: '进入页面', setParameter: '设置参数', applyLinkage: '联动组件', navigatePage: '跳转页面', drillDown: '逐层下钻' }
const preview = computed(() => {
  try { return { action: createSimpleInteractionAction(context.value, { ...selection, event: selection.event as EventNameV3 }, 'simple-preview'), error: '' } }
  catch (e) { return { action: null, error: e instanceof Error ? e.message : '请完成选择' } }
})
function generate() { if (!preview.value.action || props.blocked || (existing.value && !editingExisting.value)) return; emit('generate', selection.event as EventNameV3, { ...preview.value.action, id: `action-${crypto.randomUUID()}` }) }
</script>
<template>
  <section class="simple-wizard" aria-label="三步交互配置">
    <p>选三步即可配置。唯一候选自动填入，多个候选请选择。</p>
    <label>1 · 什么时候触发<select v-model="selection.event" aria-label="简易触发方式"><option value="">请选择触发方式</option><option v-for="event in context.events" :key="event" :value="event">{{ labels[event] }}</option></select></label>
    <label>2 · 想发生什么<select v-model="selection.kind" aria-label="简易交互结果"><option value="setParameter">设置参数</option><option value="applyLinkage">联动组件</option><option value="navigatePage">跳转页面</option><option value="drillDown">逐层下钻</option></select></label>
    <fieldset><legend>3 · 选目标</legend>
      <label v-if="selection.kind !== 'setParameter'">{{ selection.kind === 'drillDown' ? '下钻路径' : selection.kind === 'navigatePage' ? '目标页面' : '目标组件' }}<select v-model="selection.targetId" aria-label="简易目标"><option value="">请选择目标</option><option v-for="target in targets" :key="target.id" :value="target.id">{{ target.name }}</option></select></label>
      <template v-if="selection.kind === 'setParameter' || selection.kind === 'applyLinkage'">
        <label>写入哪个参数<select v-model="selection.parameterId" aria-label="简易目标参数"><option value="">请选择参数</option><option v-for="p in parameters" :key="p.id" :value="p.id">{{ p.name }}</option></select></label>
        <label>传递哪个值<select v-model="selection.fieldPath" aria-label="简易传递字段"><option value="">请选择字段</option><option v-for="f in context.fields" :key="f.path" :value="f.path">{{ fieldLabel(f.path, f.label) }}</option></select></label>
      </template>
      <p v-if="selection.kind === 'drillDown'">使用已有路径，按当前下钻层级取值；跨页继续前请确保目标组件提供下一层字段。</p>
    </fieldset>
    <p v-if="existing && !editingExisting" class="notice">这个触发已有规则，配置前请明确进入编辑。<button :disabled="blocked" @click="emit('edit', existing.id)">编辑已有规则</button></p>
    <p v-else-if="editingExisting && !simpleEditableAction(existing!)" class="notice">已有规则包含复杂交互，请使用高级编辑。<button @click="emit('advanced')">打开高级编辑</button></p>
    <p v-if="blocked" class="notice">当前有未应用草稿，请先应用或取消修改。</p>
    <p v-else-if="preview.error" role="status">{{ preview.error }}</p>
    <p v-else class="summary">{{ labels[selection.event] }} → {{ labels[selection.kind] }}{{ selection.kind === 'setParameter' || selection.kind === 'applyLinkage' ? ` · ${fieldLabel(selection.fieldPath, context.fields.find(f => f.path === selection.fieldPath)?.label ?? '')} → ${parameters.find(p => p.id === selection.parameterId)?.name}` : ` · ${targets.find(t => t.id === selection.targetId)?.name}` }}</p>
    <button type="button" class="generate" :disabled="blocked || !preview.action || (Boolean(existing) && (!editingExisting || !simpleEditableAction(existing!)))" @click="generate">生成配置草稿</button>
    <small>生成后点“应用”，再进入预览测试；保存可留存。</small>
  </section>
</template>
<style scoped>
.simple-wizard { padding: 16px 18px; display: grid; gap: 12px; background: #f6f9fc; }
p { margin: 0; line-height: 1.6; color: #526477; }
label { display: grid; gap: 6px; font-weight: 600; }
select, button { padding: 9px; border: 1px solid #ced9e3; border-radius: 6px; background: white; font: inherit; }
fieldset { display: grid; gap: 12px; margin: 0; padding: 12px; border: 1px solid #dce5ec; border-radius: 8px; }
.notice { padding: 10px; background: #fff4da; }
.notice button { margin-left: 8px; }
.summary { padding: 10px; background: #e7f2ff; color: #175ca0; }
.generate { color: white; background: #1477c9; cursor: pointer; }
button:disabled { opacity: .5; cursor: default; }
small { color: #61758a; }
</style>
