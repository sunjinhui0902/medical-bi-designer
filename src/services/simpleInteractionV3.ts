import type { ActionDefinitionV3, DashboardComponentV3, DashboardPageV3, DrillPathV3, EventBindingV3, EventNameV3 } from '../models/dashboard-v3.ts'
import type { ParameterDefinitionV3 } from '../models/parameters.ts'
import { escapeJsonPointerSegmentV3, type EventFieldCapabilityV3, type EventOwnerV3 } from './eventAuthoringPolicyV3.ts'
import { isQueryableServerComponentV3 } from './componentQueryRefreshV3.ts'

export type SimpleInteractionKind = 'setParameter' | 'applyLinkage' | 'navigatePage' | 'drillDown'
export interface SimpleInteractionContext {
  owner: EventOwnerV3
  events: EventNameV3[]
  fields: EventFieldCapabilityV3[]
  parameters: ParameterDefinitionV3[]
  components: DashboardComponentV3[]
  pages: Array<Pick<DashboardPageV3, 'id' | 'name' | 'type'>>
  drillPaths: DrillPathV3[]
}
export interface SimpleInteractionSelection {
  event: EventNameV3
  kind: SimpleInteractionKind
  targetId: string
  parameterId: string
  fieldPath: string
}
export function uniqueCandidateId(items: Array<{ id: string }>): string { return items.length === 1 ? items[0]!.id : '' }
export function simpleParameters(context: SimpleInteractionContext) {
  return context.parameters.filter(p => p.scope === 'application' || p.pageId === context.owner.pageId)
}
export function simpleLinkageTargets(context: SimpleInteractionContext) {
  return context.components.filter(c => isQueryableServerComponentV3(c) && (context.owner.kind !== 'component' || c.id !== context.owner.componentId) && c.dataConfig.version === 3 && c.dataConfig.parameterBindings.length > 0)
}
export function simpleNavigationTargets(context: SimpleInteractionContext) {
  return context.owner.pageType === 'standard' ? context.pages.filter(p => p.type === 'standard' && p.id !== context.owner.pageId) : []
}
export function simpleEditableAction(binding: EventBindingV3): ActionDefinitionV3 | null {
  const actions = binding.actions.filter(a => ['setParameter', 'applyLinkage', 'navigatePage', 'drillDown'].includes(a.type))
  if (actions.length !== 1) return null
  const action = actions[0]!
  if ((action.type === 'setParameter' || action.type === 'applyLinkage') && (action.assignments.length !== 1 || action.assignments[0]!.value.kind !== 'eventField')) return null
  if (action.type === 'applyLinkage' && action.targetComponentIds.length !== 1) return null
  if (action.type === 'navigatePage' && (action.assignments?.length || action.history !== 'push')) return null
  return action
}
export function createSimpleInteractionAction(context: SimpleInteractionContext, selection: SimpleInteractionSelection, id = `action-${crypto.randomUUID()}`): ActionDefinitionV3 {
  if (!context.events.includes(selection.event)) throw new Error('请选择当前对象支持的触发方式')
  const assignment = () => {
    if (!simpleParameters(context).some(p => p.id === selection.parameterId)) throw new Error('请选择目标参数；没有参数时先到参数管理创建')
    if (!context.fields.some(f => f.path === selection.fieldPath)) throw new Error('请选择要传递的字段；当前触发没有字段时请使用高级编辑')
    return { parameterId: selection.parameterId, value: { kind: 'eventField' as const, path: selection.fieldPath } }
  }
  if (selection.kind === 'setParameter') return { id, type: selection.kind, assignments: [assignment()] }
  if (selection.kind === 'applyLinkage') {
    const target = simpleLinkageTargets(context).find(c => c.id === selection.targetId)
    if (!target) throw new Error('请选择本页已绑定参数的查询组件作为联动目标')
    const value = assignment()
    if (target.dataConfig.version !== 3 || !target.dataConfig.parameterBindings.some(b => b.parameterId === value.parameterId)) throw new Error('目标组件未绑定这个参数，请先在数据配置中绑定')
    return { id, type: selection.kind, assignments: [value], targetComponentIds: [target.id] }
  }
  if (selection.kind === 'navigatePage') {
    if (!simpleNavigationTargets(context).some(p => p.id === selection.targetId)) throw new Error('请选择另一个普通页面；没有页面时先创建页面')
    return { id, type: selection.kind, pageId: selection.targetId, history: 'push' }
  }
  if (selection.kind !== 'drillDown') throw new Error('请选择交互结果')
  if (context.owner.kind !== 'component' || context.owner.pageType !== 'standard') throw new Error('下钻需要普通页面上的图表或表格触发')
  const path = context.drillPaths.find(p => p.id === selection.targetId)
  if (!path) throw new Error('请选择下钻路径；没有路径时先到下钻路径管理创建')
  const root = selection.event === 'rowClick' ? '/row/' : '/datum/'
  if (!path.levels.some(level => context.fields.some(f => f.path === root + escapeJsonPointerSegmentV3(level.field)))) throw new Error('当前组件没有这条下钻路径需要的字段，请换组件或路径')
  return { id, type: selection.kind, pathId: path.id }
}

export function replaceSimpleInteractionAction(binding: EventBindingV3, next: ActionDefinitionV3): EventBindingV3 {
  const current = simpleEditableAction(binding)
  if (!current) throw new Error('已有规则包含多个交互或复杂赋值，请在高级编辑中修改')
  const result = structuredClone(binding)
  result.actions = result.actions.map(a => a.id === current.id ? { ...next, id: current.id } : a)
  return result
}
