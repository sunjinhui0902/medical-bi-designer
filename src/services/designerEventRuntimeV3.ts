import type { DashboardApplicationV3, EventNameV3, JsonObjectV3, JsonValueV3 } from '../models/dashboard-v3.ts'
import type { ParameterRuntimeStoreV3 } from './parameterRuntimeV3.ts'
import type { ComponentQueryDescriptorV3, ComponentQueryRefreshRuntimeV3 } from './componentQueryRefreshV3.ts'
import { EventBusV3 } from './eventBusV3.ts'
import { createRefreshActionPortV3 } from './refreshActionPortV3.ts'
import { createSetParameterActionPortV3, createSetParameterRefreshCoordinatorV3 } from './setParameterActionPortV3.ts'
import { safeCloneJsonValueV3 } from './eventJsonValueV3.ts'
import { createLinkageRefreshPortV3 } from './linkageRefreshPortV3.ts'
import { createDialogLifecyclePortV3, createInteractionLifecyclePortV3, createPageLifecyclePortV3, createPageSessionEventIntegrationV3, PageSessionRuntimeV3, type PageSessionSnapshotV3 } from './pageSessionRuntimeV3.ts'
import type { DialogRectV3, DialogResizeDirectionV3, DialogViewportV3 } from './dialogGeometryV3.ts'
import type { EventTransactionResultV3 } from './eventRuntimeTypesV3.ts'
import type { EventOwnerV3 } from './eventAuthoringPolicyV3.ts'
import { createSafeBrowserPortV3 } from './safeBrowserPortV3.ts'

export interface DesignerEventRuntimeStatusV3 {
  state: 'idle' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'partial'
  message: string
  result?: EventTransactionResultV3
}

export interface DesignerEventRuntimeV3 {
  triggerPageEnter(pageId: string): Promise<EventTransactionResultV3 | null>
  triggerComponentClick(pageId: string, componentId: string, datum?: JsonObjectV3): Promise<EventTransactionResultV3 | null>
  triggerComponentDoubleClick(pageId: string, componentId: string, datum?: JsonObjectV3): Promise<EventTransactionResultV3 | null>
  triggerControlValueChange(pageId: string, controlId: string, value: JsonValueV3): Promise<EventTransactionResultV3 | null>
  triggerComponentRowClick?(pageId: string, componentId: string, row: JsonObjectV3): Promise<EventTransactionResultV3 | null>
  interactionSnapshot(): PageSessionSnapshotV3
  clearInteractions(): PageSessionSnapshotV3
  clearLinkage(): Promise<PageSessionSnapshotV3>
  drillBack(pathId: string): Promise<PageSessionSnapshotV3>
  pageBack(): PageSessionSnapshotV3
  dismissDialog(reason: 'button' | 'escape' | 'backdrop'): PageSessionSnapshotV3
  moveDialog(instanceId: string, x: number, y: number): PageSessionSnapshotV3 | undefined
  resizeDialog(instanceId: string, direction: DialogResizeDirectionV3, deltaX: number, deltaY: number): PageSessionSnapshotV3 | undefined
  cancel(): void
}

export type DesignerQueryUiStateV3 = 'loading' | 'succeeded' | 'failed'
export function createDesignerQueryStateGuardV3(write: (componentId: string, state: DesignerQueryUiStateV3, message?: string) => void) {
  const latest = new Map<string, symbol>()
  let generation = 0
  return { begin(componentId: string, queryIdentity = '') {
    const leaseGeneration = generation
    const token = Symbol(componentId); latest.set(componentId, token); write(componentId, 'loading')
    const current = (identity = queryIdentity) => leaseGeneration === generation && latest.get(componentId) === token && identity === queryIdentity
    const settle = (state: Exclude<DesignerQueryUiStateV3, 'loading'>, message?: string) => { if (!current()) return false; latest.delete(componentId); write(componentId, state, message); return true }
    return { queryIdentity, current, apply: (identity: string, callback: () => void) => { if (!current(identity)) return false; callback(); return true }, succeed: () => settle('succeeded'), fail: (message: string) => settle('failed', message), cancel: () => settle('succeeded') }
  }, invalidateAll() { generation++; latest.clear() } }
}

function isJsonValue(value: unknown): value is JsonValueV3 {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.every(isJsonValue)
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) return false
  return Object.values(value).every(isJsonValue)
}

export function safeParameterRuntimeValuesV3(raw: unknown): Record<string, JsonValueV3> {
  const cloned = safeCloneJsonValueV3(raw)
  if (!cloned.ok || !isJsonValue(cloned.value) || !cloned.value || typeof cloned.value !== 'object' || Array.isArray(cloned.value)) throw new Error(cloned.ok ? 'parameter values must be a JSON object' : cloned.message)
  return cloned.value
}

export function createDesignerEventRuntimeV3(options: {
  application: DashboardApplicationV3
  parameters: ParameterRuntimeStoreV3
  initialPageId?: string
  queryRuntime: ComponentQueryRefreshRuntimeV3
  onParameters?(values: Readonly<Record<string, JsonValueV3>>): void
  onInteractionState?(snapshot: PageSessionSnapshotV3): void
  onStatus?(status: DesignerEventRuntimeStatusV3): void
  onQueryState?(componentId: string, state: 'loading' | 'succeeded' | 'failed', message?: string, queryKey?: string, descriptor?: ComponentQueryDescriptorV3): void
  dialogEnvironment?: { viewport(): DialogViewportV3; protectedRegions(): ReadonlyArray<DialogRectV3> }
}): DesignerEventRuntimeV3 {
  let epoch = 0
  const activeQueryComponents = new Map<string, ComponentQueryDescriptorV3>()
  const eventQueryRuntime: ComponentQueryRefreshRuntimeV3 = {
    describe: options.queryRuntime.describe.bind(options.queryRuntime),
    async execute(descriptor, force, signal) {
      const queryEpoch = epoch
      activeQueryComponents.set(descriptor.componentId, descriptor)
      options.onQueryState?.(descriptor.componentId, 'loading', undefined, descriptor.queryKey, descriptor)
      try { const result = await options.queryRuntime.execute(descriptor, force, signal); if (queryEpoch === epoch) options.onQueryState?.(descriptor.componentId, 'succeeded', undefined, descriptor.queryKey, descriptor); return result }
      catch (reason) { if (queryEpoch === epoch) options.onQueryState?.(descriptor.componentId, 'failed', reason instanceof Error ? reason.message : '数据集执行失败', descriptor.queryKey, descriptor); throw reason }
      finally { if (queryEpoch === epoch && activeQueryComponents.get(descriptor.componentId) === descriptor) activeQueryComponents.delete(descriptor.componentId) }
    },
  }
  const refreshCoordinator = createSetParameterRefreshCoordinatorV3({ application: options.application, queryRuntime: eventQueryRuntime })
  const setParameter = createSetParameterActionPortV3({ applicationId: options.application.id, store: options.parameters, refreshCoordinator })
  const refresh = createRefreshActionPortV3({ application: options.application, queryRuntime: eventQueryRuntime })
  const linkageRefresh = createLinkageRefreshPortV3({ application: options.application, queryRuntime: eventQueryRuntime })
  const browserPort = typeof window === 'undefined' ? undefined : createSafeBrowserPortV3({
    application: options.application, baseUrl: new URL(import.meta.env.BASE_URL, window.location.origin).href,
    adapter: { open(url, target, features) { window.open(url, target, features); return 'requested' } },
  })
  const pageSession = new PageSessionRuntimeV3({ application: options.application, parameters: options.parameters, initialPageId: options.initialPageId, linkageRefresh, drillRefresh: refreshCoordinator, ...(options.dialogEnvironment ? { dialogEnvironment: options.dialogEnvironment } : {}), ...(browserPort ? { browserPort } : {}) })
  const dialogLifecycle = createDialogLifecyclePortV3(pageSession)
  const pageLifecycle = createPageLifecyclePortV3(pageSession)
  const interactionLifecycle = createInteractionLifecyclePortV3(pageSession)
  const interaction = createPageSessionEventIntegrationV3(pageSession)
  const bus = new EventBusV3({ ports: { setParameter, refresh, interaction } })
  const controller = new AbortController()
  controller.signal.addEventListener('abort', () => options.onInteractionState?.(pageSession.close()), { once: true })

  const parameterValues = () => safeParameterRuntimeValuesV3(options.parameters.snapshot().values)

  const hasBinding = (owner: EventOwnerV3, eventName: EventNameV3) => {
    const page = options.application.pages.find((item) => item.id === owner.pageId)
    if (!page) return false
    const bindings = owner.kind === 'page' ? page.pageEvents : owner.kind === 'control' ? page.controls.find((item) => item.id === owner.controlId)?.events : page.components.find((item) => item.id === owner.componentId)?.events
    return bindings?.some((item) => item.event === eventName) ?? false
  }
  const trigger = async (source: EventOwnerV3, eventName: EventNameV3, payload: JsonObjectV3) => {
    if (controller.signal.aborted || !hasBinding(source, eventName)) return null
    const callEpoch = epoch
    options.onStatus?.({ state: 'running', message: `${eventName} 执行中` })
    const result = await bus.trigger({ application: options.application, source, eventName, payload, parameterSnapshot: parameterValues(), signal: controller.signal })
    if (callEpoch !== epoch || controller.signal.aborted) return result
    options.onParameters?.(parameterValues())
    options.onInteractionState?.(pageSession.snapshot())
    const failed = result.status === 'failed' || result.partiallyApplied
    options.onStatus?.({ state: result.partiallyApplied ? 'partial' : failed ? 'failed' : result.status === 'cancelled' ? 'cancelled' : 'succeeded', message: result.partiallyApplied ? '事件部分完成，已保留已生效副作用' : result.status === 'completed' ? '事件执行成功' : result.status === 'cancelled' ? '事件已取消' : result.issues[0]?.message ?? '事件未执行', result })
    return result
  }

  return {
    triggerPageEnter(pageId) { return trigger({ kind: 'page', pageId, pageType: options.application.pages.find((item) => item.id === pageId)?.type ?? 'standard' }, 'pageEnter', {}) },
    triggerComponentClick(pageId, componentId, datum = {}) {
      const page = options.application.pages.find((item) => item.id === pageId)
      const component = page?.components.find((item) => item.id === componentId)
      if (!page || !component) return Promise.resolve(null)
      return trigger({ kind: 'component', pageId, pageType: page.type, componentId, componentType: component.type }, 'click', { datum })
    },
    triggerComponentDoubleClick(pageId, componentId, datum = {}) {
      const page = options.application.pages.find((item) => item.id === pageId)
      const component = page?.components.find((item) => item.id === componentId)
      if (!page || !component) return Promise.resolve(null)
      return trigger({ kind: 'component', pageId, pageType: page.type, componentId, componentType: component.type }, 'doubleClick', { datum })
    },
    triggerControlValueChange(pageId, controlId, value) {
      const page = options.application.pages.find((item) => item.id === pageId)
      const control = page?.controls.find((item) => item.id === controlId)
      if (!page || !control) return Promise.resolve(null)
      return trigger({ kind: 'control', pageId, pageType: page.type, controlId, controlType: control.type }, 'valueChange', { value })
    },
    triggerComponentRowClick(pageId, componentId, row) {
      const page = options.application.pages.find((item) => item.id === pageId)
      const component = page?.components.find((item) => item.id === componentId)
      if (!page || !component) return Promise.resolve(null)
      return trigger({ kind: 'component', pageId, pageType: page.type, componentId, componentType: component.type }, 'rowClick', { row })
    },
    interactionSnapshot() { return pageSession.snapshot() },
    pageBack() { const transition = pageLifecycle.back(); options.onParameters?.(parameterValues()); options.onInteractionState?.(transition.snapshot); return transition.snapshot },
    clearInteractions() { epoch++; bus.cancelAll(); const snapshot = pageSession.clear(); options.onParameters?.(parameterValues()); options.onInteractionState?.(snapshot); return snapshot },
    async clearLinkage() { const transition = await interactionLifecycle.clearLinkage(); options.onParameters?.(parameterValues()); options.onInteractionState?.(transition.snapshot); return transition.snapshot },
    async drillBack(pathId) { const transition = await interactionLifecycle.drillBack(pathId); options.onParameters?.(parameterValues()); options.onInteractionState?.(transition.snapshot); return transition.snapshot },
    dismissDialog(reason) { const lease = dialogLifecycle.capture(); if (!lease) return pageSession.snapshot(); const snapshot = dialogLifecycle.dismiss(lease, reason); options.onParameters?.(parameterValues()); options.onInteractionState?.(snapshot); return snapshot },
    moveDialog(instanceId, x, y) { const lease = dialogLifecycle.capture(); if (!lease || lease.instanceId !== instanceId) return undefined; const snapshot = dialogLifecycle.move(lease, x, y); options.onInteractionState?.(snapshot); return snapshot },
    resizeDialog(instanceId, direction, deltaX, deltaY) { const lease = dialogLifecycle.capture(); if (!lease || lease.instanceId !== instanceId) return undefined; const snapshot = dialogLifecycle.resize(lease, direction, deltaX, deltaY); options.onInteractionState?.(snapshot); return snapshot },
    cancel() { epoch++; for (const [componentId, descriptor] of activeQueryComponents) options.onQueryState?.(componentId, 'succeeded', undefined, descriptor.queryKey, descriptor); activeQueryComponents.clear(); bus.cancelAll(); const snapshot = pageSession.close(); options.onParameters?.(parameterValues()); options.onInteractionState?.(snapshot); controller.abort(); options.onStatus?.({ state: 'cancelled', message: '预览事件已取消' }) },
  }
}
