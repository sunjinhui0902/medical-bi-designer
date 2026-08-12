import assert from 'node:assert/strict'
import test from 'node:test'
import { ref } from 'vue'
import { createDefaultDashboardApplicationV3, type DashboardApplicationV3, type EventBindingV3, type JsonValueV3 } from '../src/models/dashboard-v3.ts'
import type { DashboardComponent } from '../src/models/dashboard.ts'
import { QueryRuntimeCacheV3 } from '../src/services/queryRuntimeCacheV3.ts'
import { createComponentQueryRefreshV3 } from '../src/services/componentQueryRefreshV3.ts'
import { ParameterRuntimeStoreV3 } from '../src/services/parameterRuntimeV3.ts'
import { createDesignerEventRuntimeV3, createDesignerQueryStateGuardV3, type DesignerEventRuntimeStatusV3, type DesignerEventRuntimeV3 } from '../src/services/designerEventRuntimeV3.ts'
import { useDesignerPreviewRuntimeV3 } from '../src/composables/useDesignerPreviewRuntimeV3.ts'

function component(id: string, parameter = 'p'): DashboardComponent {
  return { id, type: 'table', title: id, position: { x: 0, y: 0, width: 100, height: 100, zIndex: 1 }, dataConfig: { version: 3, sourceKind: 'server', datasetId: 'dataset', dimensions: [{ field: 'x', role: 'category' }], measures: [], filters: [], sort: [], limit: 100, parameterBindings: [{ datasetParameterCode: 'p', parameterId: parameter }], refreshPolicy: 'onParameterChange' }, styleConfig: { background: '#fff', borderColor: '#ddd', borderWidth: 1, borderRadius: 0, padding: 0, shadow: false, titleVisible: true, titleColor: '#000', titleSize: 12, titleWeight: 400 } }
}
function binding(id: string, event: EventBindingV3['event'], value: JsonValueV3, conditions?: EventBindingV3['conditions']): EventBindingV3 { return { id, enabled: true, event, ...(conditions ? { conditions } : {}), actions: [{ id: `${id}-set`, type: 'setParameter', assignments: [{ parameterId: 'p', value: { kind: 'fixed', value } }] }] } }
function application(): DashboardApplicationV3 {
  const value = createDefaultDashboardApplicationV3(); value.parameters = [{ id: 'p', code: 'p', name: 'p', type: 'number', scope: 'application', required: false, defaultValue: 1, source: { kind: 'static', options: [] } }]
  const item = component('chart'); item.events = [binding('click', 'click', 3, [{ left: { kind: 'eventField', path: '/datum/x' }, operator: 'isEmpty' }])]
  value.pages[0].components = [item, component('silent')]; value.pages[0].pageEvents = [binding('enter', 'pageEnter', 2)]; return value
}

test('P9.7 designer runtime triggers pageEnter/click, shares store and ignores missing bindings', async () => {
  const app = application(); const store = new ParameterRuntimeStoreV3(app.parameters); const synced: Array<Record<string, JsonValueV3>> = []; const queryStates: string[] = []; let loads = 0
  const queryRuntime = createComponentQueryRefreshV3({ cache: new QueryRuntimeCacheV3<number>(), async load() { return ++loads } })
  const runtime = createDesignerEventRuntimeV3({ application: app, parameters: store, queryRuntime, onParameters(values) { synced.push({ ...values }) }, onQueryState(componentId, state) { queryStates.push(`${componentId}:${state}`) } })
  const entered = await runtime.triggerPageEnter(app.defaultPageId); assert.equal(entered?.status, 'completed', JSON.stringify(entered)); assert.equal(store.get('p'), 2)
  const clicked = await runtime.triggerComponentClick(app.defaultPageId, 'chart'); assert.equal(clicked?.status, 'completed', JSON.stringify(clicked)); assert.equal(store.get('p'), 3)
  assert.equal(await runtime.triggerComponentClick(app.defaultPageId, 'silent'), null); assert.equal(store.get('p'), 3); assert.equal(synced.length, 2); assert.equal(loads, 2); assert.equal(queryStates.filter((item) => item.endsWith(':loading')).length, 4); assert.equal(queryStates.filter((item) => item.endsWith(':succeeded')).length, 4)
})

test('P9.7 cancellation epoch prevents late status and partial failures retain parameter sync', async () => {
  const app = application(); const store = new ParameterRuntimeStoreV3(app.parameters); const statuses: DesignerEventRuntimeStatusV3[] = []; const synced: Array<Record<string, JsonValueV3>> = []; let release!: () => void
  const queryRuntime = createComponentQueryRefreshV3({ cache: new QueryRuntimeCacheV3<number>(), async load() { await new Promise<void>((resolve) => { release = resolve }); return 1 } })
  const runtime = createDesignerEventRuntimeV3({ application: app, parameters: store, queryRuntime, onStatus(status) { statuses.push(status) }, onParameters(values) { synced.push({ ...values }) } })
  const pending = runtime.triggerPageEnter(app.defaultPageId); await Promise.resolve(); runtime.cancel(); assert.equal(statuses.at(-1)?.state, 'cancelled'); release(); await pending; assert.equal(statuses.at(-1)?.state, 'cancelled'); assert.equal(synced.at(-1)?.p, 2)
  const failedStatuses: DesignerEventRuntimeStatusV3[] = []; const failedStore = new ParameterRuntimeStoreV3(app.parameters)
  const failedQueryStates: string[] = []; const failed = createDesignerEventRuntimeV3({ application: app, parameters: failedStore, queryRuntime: createComponentQueryRefreshV3({ cache: new QueryRuntimeCacheV3(), async load() { throw new Error('query failed') } }), onStatus(status) { failedStatuses.push(status) }, onQueryState(componentId, state) { failedQueryStates.push(`${componentId}:${state}`) } })
  const result = await failed.triggerPageEnter(app.defaultPageId); assert.equal(result?.partiallyApplied, true); assert.equal(failedStore.get('p'), 2); assert.equal(failedStatuses.at(-1)?.state, 'partial'); assert.match(failedStatuses.at(-1)?.message ?? '', /保留已生效副作用/); assert.ok(failedQueryStates.includes('chart:failed'))
})

test('P9.7 cancelled query callbacks cannot overwrite the replacement epoch with late success or failure', async () => {
  for (const outcome of ['success', 'failure'] as const) {
    const app = application(); const store = new ParameterRuntimeStoreV3(app.parameters); const base = createComponentQueryRefreshV3({ cache: new QueryRuntimeCacheV3<number>(), async load() { return 1 } }); let release!: () => void
    const queryRuntime = { describe: base.describe, async execute(descriptor: NonNullable<ReturnType<typeof base.describe>>, _force: boolean, _signal: AbortSignal) { await new Promise<void>((resolve) => { release = resolve }); if (outcome === 'failure') throw new Error('late failure'); return { queryKey: descriptor.queryKey, source: 'network' as const } } }
    const states: string[] = []; const parameters: Array<Readonly<Record<string, JsonValueV3>>> = []; const runtime = createDesignerEventRuntimeV3({ application: app, parameters: store, queryRuntime, onQueryState(componentId, state, message) { states.push(`${componentId}:${state}:${message ?? ''}`) }, onParameters(values) { parameters.push(values) } })
    const pending = runtime.triggerPageEnter(app.defaultPageId); await Promise.resolve(); assert.deepEqual(states, ['chart:loading:']); runtime.cancel(); const afterCancel = [...states]; const parametersAfterCancel = parameters.length; assert.equal(parameters.at(-1)?.p, 2); release(); await pending; assert.deepEqual(states, afterCancel); assert.equal(parameters.length, parametersAfterCancel); assert.deepEqual(afterCancel, ['chart:loading:', 'chart:succeeded:'])
  }
})

test('P9.7 component query UI guard lets only the latest request settle and cancellation stays non-error', () => {
  const states: string[] = []; const guard = createDesignerQueryStateGuardV3((id, state, message) => states.push(`${id}:${state}:${message ?? ''}`))
  const old = guard.begin('same'); const current = guard.begin('same'); assert.equal(old.fail('old failure'), false); assert.equal(old.succeed(), false); assert.equal(current.cancel(), true)
  assert.deepEqual(states, ['same:loading:', 'same:loading:', 'same:succeeded:'])
})

test('P9.7 older parameter success cannot overwrite newer component data', () => {
  const guard = createDesignerQueryStateGuardV3(() => {}); const runtimeDatasets: Record<string, number> = {}
  const old = guard.begin('same', 'p=old'); const current = guard.begin('same', 'p=new')
  assert.equal(current.apply('p=new', () => { runtimeDatasets.same = 2 }), true); assert.equal(current.succeed(), true)
  assert.equal(old.apply('p=old', () => { runtimeDatasets.same = 1 }), false); assert.equal(old.succeed(), false); assert.equal(runtimeDatasets.same, 2)
})

test('P9.7 old app descriptor cannot write or settle a new same-id same-key caller lease', () => {
  const guard = createDesignerQueryStateGuardV3(() => {}); const runtimeDatasets: Record<string, number> = { same: 9 }; const leases = new WeakMap<object, ReturnType<typeof guard.begin>>(); const oldDescriptor = {}; const old = guard.begin('same', 'same-key'); leases.set(oldDescriptor, old)
  guard.invalidateAll(); for (const key of Object.keys(runtimeDatasets)) delete runtimeDatasets[key]
  const newDescriptor = {}; const current = guard.begin('same', 'same-key'); leases.set(newDescriptor, current)
  assert.equal(leases.get(oldDescriptor)?.apply('same-key', () => { runtimeDatasets.same = 1 }), false); assert.equal(old.succeed(), false); assert.equal(current.current('same-key'), true)
  assert.equal(leases.get(newDescriptor)?.apply('same-key', () => { runtimeDatasets.same = 2 }), true); assert.equal(current.succeed(), true); assert.equal(runtimeDatasets.same, 2)
})

test('P9.7 preview controller creates one bus per session and design boundary is silent', async () => {
  const activePageId = ref('page-home'); let created = 0; let entered = 0; let clicks = 0; let cancelled = 0; const order: string[] = []
  let releasePrepare!: () => void; const controller = useDesignerPreviewRuntimeV3({ activePageId, applicationSnapshot: application, async preparePage() { order.push('prepare'); await Promise.allSettled([Promise.reject(new Error('visible load failure'))]); if (!created) return; await new Promise<void>((resolve) => { releasePrepare = resolve }) }, createRuntime(_application, onStatus): DesignerEventRuntimeV3 { created++; onStatus({ state: 'idle', message: 'ready' }); return { async triggerPageEnter() { order.push('pageEnter'); entered++; return null }, async triggerComponentClick() { clicks++; return null }, cancel() { cancelled++ } } } })
  assert.equal(await controller.componentClick('chart'), null); assert.equal(clicks, 0)
  const starting = controller.start(); await new Promise<void>((resolve) => setImmediate(resolve)); assert.equal(await controller.componentClick('chart'), null); assert.equal(clicks, 0); releasePrepare(); await starting; assert.equal(controller.ready.value, true); assert.equal(created, 1); assert.equal(entered, 1); assert.deepEqual(order, ['prepare', 'pageEnter']); await controller.componentClick('chart'); assert.equal(clicks, 1)
  const changing = controller.pageChanged(); await new Promise<void>((resolve) => setImmediate(resolve)); assert.equal(controller.ready.value, false); releasePrepare(); await changing; assert.equal(created, 2); assert.equal(entered, 2); assert.equal(cancelled, 1); await controller.componentClick('chart'); assert.equal(clicks, 2); controller.stop(); assert.equal(controller.ready.value, false); assert.equal(cancelled, 2)
})
