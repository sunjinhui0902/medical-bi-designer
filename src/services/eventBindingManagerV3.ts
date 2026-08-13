import type {
  ActionDefinitionV3,
  DashboardApplicationV3,
  EventBindingV3,
  EventConditionV3,
  EventNameV3,
  ValueExpressionV3,
} from '../models/dashboard-v3.ts'
import { validateDashboardApplicationV3 } from './dashboardValidationV3.ts'
import { safeUnknownMessageV3 } from './eventJsonValueV3.ts'
import {
  authorableEventNamesV3,
  eventFieldCapabilitiesV3,
  resolveEventOwnerV3,
  type EventOwnerV3,
  type ResolvedEventOwnerV3,
} from './eventAuthoringPolicyV3.ts'

export type EventEntityKindV3 = 'event' | 'action' | 'condition'
export type EventIdFactoryV3 = (kind: EventEntityKindV3) => string
export interface EventBindingAuthorabilityV3 { authorable: boolean; readOnly: boolean; reasons: string[] }
const CONDITION_OPERATORS = new Set(['eq', 'ne', 'in', 'notIn', 'isEmpty', 'notEmpty'])

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function defaultId(kind: EventEntityKindV3): string { return `${kind}-${crypto.randomUUID()}` }

function ownerEvents(application: DashboardApplicationV3, resolved: ResolvedEventOwnerV3): EventBindingV3[] {
  const page = application.pages.find((candidate) => candidate.id === resolved.owner.pageId)!
  return resolved.owner.kind === 'page' ? page.pageEvents : (resolved.component!.events ?? [])
}

function collectEntityIds(application: DashboardApplicationV3): Set<string> {
  const ids = new Set<string>([application.id, ...application.parameters.map((item) => item.id)])
  for (const page of application.pages) {
    ids.add(page.id)
    page.controls.forEach((item) => ids.add(item.id))
    for (const component of page.components) ids.add(component.id)
    for (const binding of [...page.pageEvents, ...page.components.flatMap((item) => item.events ?? [])]) {
      ids.add(binding.id)
      binding.actions.forEach((item) => ids.add(item.id))
    }
  }
  return ids
}

function inspectExpression(
  expression: ValueExpressionV3,
  event: EventNameV3,
  resolved: ResolvedEventOwnerV3,
  application: DashboardApplicationV3,
  path: string,
  reasons: string[],
): void {
  if (!expression || typeof expression !== 'object' || !['eventField', 'parameter', 'fixed'].includes(expression.kind)) {
    reasons.push(`${path} 值来源类型不受支持`)
  } else if (expression.kind === 'eventField') {
    if (!eventFieldCapabilitiesV3(event, resolved.component).some((field) => field.path === expression.path)) {
      reasons.push(`${path} 事件字段不在真实绑定目录中：${expression.path}`)
    }
  } else if (expression.kind === 'parameter' && !application.parameters.some((item) => item.id === expression.parameterId)) {
    reasons.push(`${path} 参数不存在：${expression.parameterId}`)
  } else if (expression.kind === 'fixed' && !isJsonValue(expression.value)) {
    reasons.push(`${path} 固定值必须是可无损往返的 JSON 值`)
  }
}

function isJsonValue(value: unknown, seen = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (seen.has(value)) return false
  seen.add(value)
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, seen))
  if (Object.getPrototypeOf(value) !== Object.prototype) return false
  return Object.entries(value).every(([, item]) => isJsonValue(item, seen))
}

function inspectCondition(
  condition: EventConditionV3,
  index: number,
  binding: EventBindingV3,
  resolved: ResolvedEventOwnerV3,
  application: DashboardApplicationV3,
  reasons: string[],
): void {
  const path = `conditions[${index}]`
  if (!CONDITION_OPERATORS.has(condition.operator)) {
    reasons.push(`${path} 条件运算符不受支持：${String(condition.operator)}`)
    return
  }
  inspectExpression(condition.left, binding.event, resolved, application, `${path}.left`, reasons)
  if (condition.operator === 'isEmpty' || condition.operator === 'notEmpty') {
    if (condition.right !== undefined) reasons.push(`${path} 的 ${condition.operator} 不能保存 right`)
    return
  }
  if (!condition.right) { reasons.push(`${path} 的 ${condition.operator} 必须配置 right`); return }
  inspectExpression(condition.right, binding.event, resolved, application, `${path}.right`, reasons)
  if ((condition.operator === 'in' || condition.operator === 'notIn')
    && (condition.right.kind !== 'fixed' || !Array.isArray(condition.right.value))) {
    reasons.push(`${path} 的 ${condition.operator} 右值必须是 fixed JSON 数组`)
  }
}

function inspectAction(
  action: ActionDefinitionV3,
  index: number,
  binding: EventBindingV3,
  resolved: ResolvedEventOwnerV3,
  application: DashboardApplicationV3,
  reasons: string[],
): void {
  const path = `actions[${index}]`
  const inspectAssignments = (assignments: Array<{ parameterId: string; value: ValueExpressionV3 }>, assignmentPath: string): void => {
    const parameterIds = assignments.map((item) => item.parameterId)
    if (!assignments.length) reasons.push(`${assignmentPath} 至少需要一个赋值`)
    if (new Set(parameterIds).size !== parameterIds.length) reasons.push(`${assignmentPath} 不能重复赋值同一参数`)
    assignments.forEach((assignment, assignmentIndex) => {
      if (!application.parameters.some((item) => item.id === assignment.parameterId)) {
        reasons.push(`${assignmentPath}[${assignmentIndex}] 参数不存在：${assignment.parameterId}`)
      }
      inspectExpression(assignment.value, binding.event, resolved, application, `${assignmentPath}[${assignmentIndex}].value`, reasons)
    })
  }
  const inspectCarry = (parameterIds: string[] | undefined, carryPath: string): void => {
    parameterIds?.forEach((parameterId) => {
      if (!application.parameters.some((item) => item.id === parameterId)) reasons.push(`${carryPath} 参数不存在：${parameterId}`)
    })
  }
  if (action.type === 'setParameter') {
    inspectAssignments(action.assignments, `${path}.assignments`)
    return
  }
  if (action.type === 'refresh') {
    if (action.target.kind === 'page') {
      if (action.target.pageId !== resolved.owner.pageId) reasons.push(`${path} Refresh 只能指向 owner 页面`)
    } else {
      const componentIds = new Set(application.pages.find((item) => item.id === resolved.owner.pageId)!.components.map((item) => item.id))
      if (!action.target.componentIds.length) reasons.push(`${path} Refresh 组件目标不能为空`)
      if (new Set(action.target.componentIds).size !== action.target.componentIds.length) reasons.push(`${path} Refresh 组件目标不能重复`)
      action.target.componentIds.forEach((id) => { if (!componentIds.has(id)) reasons.push(`${path} Refresh 组件不属于 owner 页面：${id}`) })
    }
    return
  }
  if (action.type === 'navigatePage' || action.type === 'openPageWindow') {
    if (action.type === 'navigatePage' && resolved.owner.pageType === 'dialog') reasons.push(`${path} dialog 页面不得直接导航 standard 页面`)
    if (application.pages.find((item) => item.id === action.pageId)?.type !== 'standard') reasons.push(`${path} 目标必须是 standard 页面：${action.pageId}`)
    if (action.type === 'navigatePage') { if (action.assignments) inspectAssignments(action.assignments, `${path}.assignments`) }
    else inspectCarry(action.carryParameterIds, `${path}.carryParameterIds`)
    return
  }
  if (action.type === 'openDialog') {
    if (application.pages.find((item) => item.id === action.pageId)?.type !== 'dialog') reasons.push(`${path} 目标必须是 dialog 页面：${action.pageId}`)
    if (action.assignments) inspectAssignments(action.assignments, `${path}.assignments`)
    return
  }
  if (action.type === 'closeDialog') {
    return
  }
  if (action.type === 'pageBack') {
    if (resolved.owner.pageType !== 'standard') reasons.push(`${path} pageBack 只能由 standard 页面触发`)
    return
  }
  if (action.type === 'applyLinkage') {
    inspectAssignments(action.assignments, `${path}.assignments`)
    const ownerComponents = new Set(application.pages.find((item) => item.id === resolved.owner.pageId)!.components.map((item) => item.id))
    action.targetComponentIds.forEach((componentId) => { if (!ownerComponents.has(componentId)) reasons.push(`${path} 联动组件不属于 owner 页面：${componentId}`) })
    return
  }
  if (action.type === 'clearLinkage') {
    if (action.linkageActionId) {
      const target = application.pages.flatMap((page) => [...page.pageEvents, ...page.components.flatMap((component) => component.events ?? [])]).flatMap((event) => event.actions).find((item) => item.id === action.linkageActionId)
      if (target?.type !== 'applyLinkage') reasons.push(`${path} 清除目标不是存在的 applyLinkage：${action.linkageActionId}`)
    }
    return
  }
  if (action.type === 'drillDown' || action.type === 'drillBack' || action.type === 'clearDrill') {
    if (!(application.drillPaths ?? []).some((item) => item.id === action.pathId)) reasons.push(`${path} DrillPath 不存在：${action.pathId}`)
    return
  }
  if (action.type === 'openExternalLink') {
    inspectCarry(action.carryParameterIds, `${path}.carryParameterIds`)
    try { const parsed = new URL(action.url); const protocol = parsed.protocol; if ((protocol !== 'http:' && protocol !== 'https:') || parsed.username || parsed.password || action.url.trim() !== action.url || /[\u0000-\u001f\u007f]/.test(action.url)) throw new Error('unsupported URL') }
    catch { reasons.push(`${path} 外链必须是可解析的 http/https 绝对 URL`) }
    return
  }
  reasons.push(`${path} 不支持的动作类型：${String((action as { type?: unknown }).type)}`)
}

export function inspectEventBindingAuthorabilityV3(
  application: DashboardApplicationV3,
  ownerSnapshot: EventOwnerV3,
  binding: EventBindingV3,
): EventBindingAuthorabilityV3 {
  const reasons: string[] = []
  let resolved: ResolvedEventOwnerV3
  try { resolved = resolveEventOwnerV3(application, ownerSnapshot) }
  catch (reason) {
    reasons.push(safeUnknownMessageV3(reason, '事件 owner 不存在'))
    return { authorable: false, readOnly: true, reasons }
  }
  if (!authorableEventNamesV3(resolved.owner).includes(binding.event)) reasons.push(`当前 owner 不允许 ${binding.event} 事件`)
  if (!binding.actions.length) reasons.push('事件至少需要一个动作')
  if (binding.debounceMs !== undefined && (!Number.isInteger(binding.debounceMs) || binding.debounceMs < 0)) reasons.push('debounceMs 必须是非负整数')
  binding.conditions?.forEach((condition, index) => inspectCondition(condition, index, binding, resolved, application, reasons))
  binding.actions.forEach((action, index) => inspectAction(action, index, binding, resolved, application, reasons))
  const browserActions = binding.actions.filter((action) => action.type === 'openPageWindow' || action.type === 'openExternalLink')
  if (browserActions.length && (browserActions.length !== 1 || binding.actions[0] !== browserActions[0] || resolved.owner.kind !== 'component' || (binding.event !== 'click' && binding.event !== 'doubleClick' && binding.event !== 'rowClick'))) reasons.push('浏览器动作必须是直接组件手势中的唯一且首个浏览器动作')
  if (ownerEvents(application, resolved).some((item) => item.id !== binding.id && item.event === binding.event)) {
    reasons.push(`同一 owner 已存在 ${binding.event} 事件`)
  }
  return { authorable: reasons.length === 0, readOnly: reasons.length > 0, reasons }
}

function requireAuthorable(application: DashboardApplicationV3, owner: EventOwnerV3, binding: EventBindingV3): ResolvedEventOwnerV3 {
  const inspection = inspectEventBindingAuthorabilityV3(application, owner, binding)
  if (!inspection.authorable) throw new Error(inspection.reasons.join('；'))
  return resolveEventOwnerV3(application, owner)
}

function replaceOwnerEvents(next: DashboardApplicationV3, resolved: ResolvedEventOwnerV3, events: EventBindingV3[]): void {
  const page = next.pages.find((item) => item.id === resolved.owner.pageId)!
  if (resolved.owner.kind === 'page') page.pageEvents = events
  else {
    const componentId = resolved.owner.componentId
    page.components.find((item) => item.id === componentId)!.events = events
  }
}

function validateNext(next: DashboardApplicationV3): void {
  const validation = validateDashboardApplicationV3(next)
  if (!validation.valid) throw new Error(validation.issues.map((issue) => `${issue.path}：${issue.message}`).join('；'))
}

export function listOwnerEventsV3(application: DashboardApplicationV3, owner: EventOwnerV3): EventBindingV3[] {
  const resolved = resolveEventOwnerV3(application, owner)
  return clone(ownerEvents(application, resolved))
}

export function createEventDraftV3(event: EventNameV3, idFactory: EventIdFactoryV3 = defaultId): EventBindingV3 {
  return { id: idFactory('event'), enabled: true, event, actions: [] }
}

export function createSetParameterActionDraftV3(parameterId: string, idFactory: EventIdFactoryV3 = defaultId): ActionDefinitionV3 {
  return { id: idFactory('action'), type: 'setParameter', assignments: [{ parameterId, value: { kind: 'fixed', value: null } }] }
}

export function createRefreshActionDraftV3(owner: EventOwnerV3, idFactory: EventIdFactoryV3 = defaultId): ActionDefinitionV3 {
  return { id: idFactory('action'), type: 'refresh', target: { kind: 'page', pageId: owner.pageId } }
}

export function createEventBindingV3(application: DashboardApplicationV3, owner: EventOwnerV3, binding: EventBindingV3): DashboardApplicationV3 {
  const resolved = requireAuthorable(application, owner, binding)
  if (collectEntityIds(application).has(binding.id)) throw new Error(`事件 ID 已存在：${binding.id}`)
  const next = clone(application)
  replaceOwnerEvents(next, resolved, [...ownerEvents(application, resolved), clone(binding)])
  validateNext(next)
  return next
}

export function updateEventBindingV3(application: DashboardApplicationV3, owner: EventOwnerV3, binding: EventBindingV3): DashboardApplicationV3 {
  const resolved = resolveEventOwnerV3(application, owner)
  const existing = ownerEvents(application, resolved).find((item) => item.id === binding.id)
  if (!existing) throw new Error(`当前 owner 的事件不存在：${binding.id}`)
  requireAuthorable(application, resolved.owner, existing)
  requireAuthorable(application, resolved.owner, binding)
  const next = clone(application)
  replaceOwnerEvents(next, resolved, ownerEvents(application, resolved).map((item) => item.id === binding.id ? clone(binding) : clone(item)))
  validateNext(next)
  return next
}

export function deleteEventBindingV3(application: DashboardApplicationV3, owner: EventOwnerV3, eventId: string): DashboardApplicationV3 {
  const resolved = resolveEventOwnerV3(application, owner)
  const existing = ownerEvents(application, resolved).find((item) => item.id === eventId)
  if (!existing) throw new Error(`当前 owner 的事件不存在：${eventId}`)
  requireAuthorable(application, resolved.owner, existing)
  const next = clone(application)
  replaceOwnerEvents(next, resolved, ownerEvents(application, resolved).filter((item) => item.id !== eventId).map(clone))
  validateNext(next)
  return next
}
