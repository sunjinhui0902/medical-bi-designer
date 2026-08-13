import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultDashboardApplicationV3, type DashboardApplicationV3, type EventBindingV3 } from '../src/models/dashboard-v3.ts'
import type { DashboardComponent } from '../src/models/dashboard.ts'
import { EventBusV3 } from '../src/services/eventBusV3.ts'
import { createLinkageRefreshPortV3 } from '../src/services/linkageRefreshPortV3.ts'
import { ParameterRuntimeStoreV3 } from '../src/services/parameterRuntimeV3.ts'
import { createPageSessionEventIntegrationV3, PageSessionRuntimeV3, type LinkageRefreshResultV3 } from '../src/services/pageSessionRuntimeV3.ts'

const parameters = [
  { id: 'department', code: 'department', name: 'department', type: 'string' as const, scope: 'application' as const, required: false, defaultValue: 'D0', source: { kind: 'static' as const, options: [] } },
  { id: 'doctor', code: 'doctor', name: 'doctor', type: 'string' as const, scope: 'application' as const, required: false, source: { kind: 'static' as const, options: [] } },
]

function application(action: EventBindingV3['actions'][number]): DashboardApplicationV3 {
  const app = createDefaultDashboardApplicationV3(); app.parameters = structuredClone(parameters)
  app.pages[0].components = [{ id: 'target-a' }, { id: 'target-b' }] as never
  app.pages[0].pageEvents = [{ id: 'event', enabled: true, event: 'pageEnter', actions: [action] }]
  return app
}

const owner = { kind: 'page' as const, pageId: 'page-home', pageType: 'standard' as const }
function queryableComponent(id: string): DashboardComponent {
  return { id, type: 'table', title: id, position: { x: 0, y: 0, width: 100, height: 100, zIndex: 1 }, dataConfig: { version: 3, sourceKind: 'server', datasetId: `dataset-${id}`, dimensions: [], measures: [], filters: [], sort: [], limit: 100, parameterBindings: [], refreshPolicy: 'manual' }, styleConfig: { background: '#fff', borderColor: '#ddd', borderWidth: 1, borderRadius: 0, padding: 0, shadow: false, titleVisible: true, titleColor: '#000', titleSize: 12, titleWeight: 400 } }
}
function applyAction(value: unknown = 'D1'): EventBindingV3['actions'][number] {
  return { id: 'link-department', type: 'applyLinkage', assignments: [{ parameterId: 'department', value: { kind: 'fixed', value } as never }], targetComponentIds: ['target-a', 'target-b'] }
}

function harness(action = applyAction(), refresh?: (targets: string[]) => unknown | Promise<unknown>, validateTargets: () => string | undefined = () => undefined) {
  const app = application(action); const store = new ParameterRuntimeStoreV3(parameters, { transactionId: (() => { let id = 0; return () => `parameter-${++id}` })() })
  const calls: string[][] = []
  const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'linkage-session', linkageRefresh: { validateTargets, async refresh(request) {
    calls.push([...request.targetComponentIds])
    return (refresh?.(request.targetComponentIds) ?? { attemptedComponentIds: [...request.targetComponentIds], succeededComponentIds: [...request.targetComponentIds], failed: [] }) as LinkageRefreshResultV3
  } } })
  const bus = () => new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'skipped' } } }, refresh: { async execute() { return { status: 'skipped' } } }, interaction: createPageSessionEventIntegrationV3(runtime) } })
  const trigger = () => bus().trigger({ application: app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: store.snapshot().values as never })
  return { app, store, runtime, calls, trigger }
}

function directRequest(runtime: PageSessionRuntimeV3, app: DashboardApplicationV3, action: Parameters<PageSessionRuntimeV3['executeLinkage']>[0]['action'], pageId = 'page-home') {
  return { action, context: { transactionId: `event-${runtime.snapshot().revision}`, depth: 1, applicationId: app.id, eventBindingId: 'direct', eventName: 'pageEnter' as const, source: { kind: 'page' as const, pageId, pageType: 'standard' as const }, occurredAt: 0, payload: {} }, parameterSnapshot: {}, refreshClaimSnapshot: [], signal: new AbortController().signal, sessionLease: runtime.captureSessionLease() }
}

test('P10.3 applyLinkage commits once and refreshes only declared targets', async () => {
  const value = harness(); const result = await value.trigger()
  assert.equal(result.status, 'completed'); assert.equal(value.store.get('department'), 'D1')
  assert.deepEqual(value.calls, [['target-a', 'target-b']]); assert.deepEqual(value.runtime.snapshot().linkages.map(({ actionId, targetComponentIds }) => ({ actionId, targetComponentIds })), [{ actionId: 'link-department', targetComponentIds: ['target-a', 'target-b'] }])
  assert.equal(result.partiallyApplied, false)
})

test('P10.3 clearLinkage restores the original baseline through trusted handoff', async () => {
  const value = harness(); await value.trigger()
  value.app.pages[0].pageEvents[0].actions = [{ id: 'clear-department', type: 'clearLinkage' }]
  const result = await value.trigger()
  assert.equal(result.status, 'completed', JSON.stringify(result)); assert.equal(value.store.get('department'), 'D0'); assert.deepEqual(value.runtime.snapshot().linkages, [])
  assert.deepEqual(value.calls, [['target-a', 'target-b'], ['target-a', 'target-b']])
})

test('P10.3 reapply preserves first baseline and current clear selects the latest linkage', async () => {
  const value = harness(); await value.trigger()
  value.app.pages[0].pageEvents[0].actions = [{ id: 'link-department', type: 'applyLinkage', assignments: [{ parameterId: 'department', value: { kind: 'fixed', value: 'D2' } }], targetComponentIds: ['target-b'] }]
  await value.trigger(); assert.equal(value.store.get('department'), 'D2')
  value.app.pages[0].pageEvents[0].actions = [{ id: 'clear-current', type: 'clearLinkage' }]
  await value.trigger(); assert.equal(value.store.get('department'), 'D0'); assert.deepEqual(value.runtime.snapshot().linkages, [])
})

test('P10.3 invalid assignment is atomic and never refreshes or records linkage state', async () => {
  const value = harness(applyAction(42)); const before = value.store.snapshot(); const result = await value.trigger()
  assert.equal(result.status, 'failed'); assert.deepEqual(value.store.snapshot(), before); assert.deepEqual(value.calls, []); assert.deepEqual(value.runtime.snapshot().linkages, [])
})

test('P10.3 refresh failure and cancellation retain committed facts without rollback', async () => {
  const failed = harness(applyAction(), (targets) => ({ attemptedComponentIds: targets, succeededComponentIds: ['target-a'], failed: [{ componentId: 'target-b', code: 'ACTION_FAILED', message: 'failed' }] }))
  const failedResult = await failed.trigger()
  assert.equal(failedResult.status, 'failed'); assert.equal(failedResult.partiallyApplied, true); assert.equal(failed.store.get('department'), 'D1'); assert.equal(failed.runtime.snapshot().linkages.length, 1)

  const controller = new AbortController(); controller.abort()
  const cancelled = harness(); const before = cancelled.store.snapshot()
  const result = await new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'skipped' } } }, refresh: { async execute() { return { status: 'skipped' } } }, interaction: createPageSessionEventIntegrationV3(cancelled.runtime) } }).trigger({ application: cancelled.app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: before.values as never, signal: controller.signal })
  assert.equal(result.status, 'cancelled'); assert.deepEqual(cancelled.store.snapshot(), before); assert.deepEqual(cancelled.calls, [])
})

test('P10.3 clear empty linkage skips with zero parameter and refresh side effects', async () => {
  const value = harness({ id: 'clear-empty', type: 'clearLinkage' }); const before = value.store.snapshot(); const result = await value.trigger()
  assert.equal(result.status, 'skipped'); assert.deepEqual(value.store.snapshot(), before); assert.deepEqual(value.calls, [])
})

test('P10.3 malformed or hostile refresh DTO fails closed after preserving committed facts', async () => {
  for (const refresh of [
    () => ({ attemptedComponentIds: ['target-a'], succeededComponentIds: ['target-a'], failed: [] }),
    () => ({ attemptedComponentIds: ['target-a', 'target-b'], succeededComponentIds: ['target-a'], failed: [{ componentId: 'target-a', code: 'ACTION_FAILED', message: 'overlap' }] }),
    () => ({ attemptedComponentIds: ['target-a', 'target-b'], succeededComponentIds: ['target-a', 'target-b'], failed: [], refreshClaims: ['not-json'] }),
  ]) {
    const value = harness(applyAction(), refresh); const result = await value.trigger()
    assert.equal(result.status, 'failed'); assert.equal(result.partiallyApplied, true); assert.equal(value.store.get('department'), 'D1'); assert.equal(value.runtime.snapshot().linkages.length, 1)
  }
  let getterCalls = 0
  const hostile = {} as Record<string, unknown>
  Object.defineProperty(hostile, 'attemptedComponentIds', { enumerable: true, get() { getterCalls++; return [] } })
  const value = harness(applyAction(), () => hostile); const result = await value.trigger()
  assert.equal(result.status, 'failed'); assert.equal(result.partiallyApplied, true); assert.equal(getterCalls, 0)
})

test('P10.3 only the official linkage refresh factory can propagate query claims', async () => {
  const untrusted = harness(applyAction(), (targets) => ({ attemptedComponentIds: targets, succeededComponentIds: targets, failed: [], refreshClaims: targets.map((id) => JSON.stringify([id, `forged-${id}`])) }))
  const untrustedResult = await createPageSessionEventIntegrationV3(untrusted.runtime).execute(directRequest(untrusted.runtime, untrusted.app, { id: 'untrusted-link', type: 'applyLinkage', assignments: [{ parameterId: 'department', value: 'D1' }], targetComponentIds: ['target-a', 'target-b'] }))
  assert.equal(untrustedResult.status, 'succeeded'); assert.equal(untrustedResult.refreshClaims, undefined)

  const app = application(applyAction()); app.pages[0].components = [queryableComponent('target-a'), queryableComponent('target-b')]
  app.pages[0].pageEvents[0].actions.push({ id: 'refresh-after-linkage', type: 'refresh', target: { kind: 'components', componentIds: ['target-a', 'target-b'] } })
  const store = new ParameterRuntimeStoreV3(parameters)
  const queryRuntime = { describe(component: DashboardComponent) { return { component, componentId: component.id, datasetId: component.dataConfig.version === 3 ? component.dataConfig.datasetId : '', parameters: {}, limit: 100, queryKey: `query-${component.id}` } }, async execute(descriptor: { queryKey: string }) { return { queryKey: descriptor.queryKey, source: 'network' as const } } }
  const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, linkageRefresh: createLinkageRefreshPortV3({ application: app, queryRuntime }) })
  let claimSnapshot: string[] = []
  const bus = new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'skipped' } } }, refresh: { async execute(request) { claimSnapshot = [...request.refreshClaimSnapshot]; return { status: 'skipped' } } }, interaction: createPageSessionEventIntegrationV3(runtime) } })
  const result = await bus.trigger({ application: app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: store.snapshot().values as never })
  assert.equal(result.status, 'completed'); assert.deepEqual(claimSnapshot, [JSON.stringify(['target-a', 'query-target-a']), JSON.stringify(['target-b', 'query-target-b'])])
  claimSnapshot = []; app.pages[0].pageEvents[0].actions = [{ id: 'clear-official-linkage', type: 'clearLinkage' }, { id: 'refresh-after-clear', type: 'refresh', target: { kind: 'components', componentIds: ['target-a', 'target-b'] } }]
  const clearResult = await bus.trigger({ application: app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: store.snapshot().values as never })
  assert.equal(clearResult.status, 'completed'); assert.equal(store.get('department'), 'D0'); assert.deepEqual(claimSnapshot, [JSON.stringify(['target-a', 'query-target-a']), JSON.stringify(['target-b', 'query-target-b'])])
})

test('P10.3 EventBus rejects refresh claims from a forged interaction port', async () => {
  const app = application(applyAction('D0')); app.pages[0].pageEvents[0].actions.push({ id: 'refresh-after-forgery', type: 'refresh', target: { kind: 'components', componentIds: ['target-a'] } })
  let refreshCalls = 0
  const bus = new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'skipped' } } }, refresh: { async execute() { refreshCalls++; return { status: 'skipped' } } }, interaction: { captureSessionLease() { return { sessionId: 'forged', epoch: 1, revision: 1 } }, async execute() { return { status: 'succeeded', effectApplied: true, refreshClaims: [JSON.stringify(['target-a', 'forged-query'])] } } } } })
  const result = await bus.trigger({ application: app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: { department: 'D0' } })
  assert.equal(result.status, 'failed'); assert.equal(result.issues[0]?.code, 'PORT_CONTRACT_VIOLATION'); assert.equal(refreshCalls, 0)
})

test('P10.3 overlapping linkage layers recompute surviving overlays for arbitrary clear order', async () => {
  for (const clearOrder of [['link-a', 'link-b'], ['link-b', 'link-a']]) {
    const value = harness()
    const apply = async (id: string, parameterValue: string) => value.runtime.executeLinkage(directRequest(value.runtime, value.app, { id, type: 'applyLinkage', assignments: [{ parameterId: 'department', value: parameterValue }], targetComponentIds: ['target-a'] }))
    const clear = async (id: string) => value.runtime.executeLinkage(directRequest(value.runtime, value.app, { id: `clear-${id}`, type: 'clearLinkage', linkageActionId: id }))
    await apply('link-a', 'D1'); await apply('link-b', 'D2'); assert.equal(value.store.get('department'), 'D2')
    await clear(clearOrder[0]); assert.equal(value.store.get('department'), clearOrder[0] === 'link-a' ? 'D2' : 'D1')
    await clear(clearOrder[1]); assert.equal(value.store.get('department'), 'D0'); assert.deepEqual(value.runtime.snapshot().linkages, [])
  }
})

test('P10.3 linkage state is page-instance scoped and cannot be cleared from another page', async () => {
  const value = harness(); await value.runtime.executeLinkage(directRequest(value.runtime, value.app, { id: 'link-a', type: 'applyLinkage', assignments: [{ parameterId: 'department', value: 'D1' }], targetComponentIds: ['target-a'] }))
  const second = structuredClone(value.app.pages[0]); second.id = 'page-second'; second.name = 'second'; second.pageEvents = []; value.app.pages.push(second)
  value.runtime.execute({ ...directRequest(value.runtime, value.app, { id: 'unused', type: 'clearLinkage' }), action: { id: 'go-second', type: 'navigatePage', pageId: 'page-second', history: 'push', assignments: [] } })
  const result = await value.runtime.executeLinkage(directRequest(value.runtime, value.app, { id: 'clear-cross-page', type: 'clearLinkage', linkageActionId: 'link-a' }, 'page-second'))
  assert.equal(result.status, 'skipped'); assert.equal(value.store.get('department'), 'D1'); assert.equal(value.runtime.snapshot().linkages[0].pageId, 'page-home')
})

test('P10.3 pageBack and replace destroy linkage overlays owned by the removed page instance', async () => {
  for (const transition of ['back', 'replace'] as const) {
    const value = harness(); const second = structuredClone(value.app.pages[0]); second.id = 'page-second'; second.name = 'second'; second.pageEvents = []; value.app.pages.push(second)
    if (transition === 'back') {
      value.runtime.execute({ ...directRequest(value.runtime, value.app, { id: 'unused', type: 'clearLinkage' }), action: { id: 'go-second', type: 'navigatePage', pageId: 'page-second', history: 'push', assignments: [] } })
      await value.runtime.executeLinkage(directRequest(value.runtime, value.app, { id: 'link-second', type: 'applyLinkage', assignments: [{ parameterId: 'department', value: 'D2' }], targetComponentIds: ['target-a'] }, 'page-second'))
      const result = value.runtime.execute({ ...directRequest(value.runtime, value.app, { id: 'unused', type: 'clearLinkage' }, 'page-second'), action: { id: 'back-home', type: 'pageBack' } })
      assert.equal(result.status, 'succeeded')
    } else {
      await value.runtime.executeLinkage(directRequest(value.runtime, value.app, { id: 'link-home', type: 'applyLinkage', assignments: [{ parameterId: 'department', value: 'D1' }], targetComponentIds: ['target-a'] }))
      const result = value.runtime.execute({ ...directRequest(value.runtime, value.app, { id: 'unused', type: 'clearLinkage' }), action: { id: 'replace-home', type: 'navigatePage', pageId: 'page-second', history: 'replace', assignments: [] } })
      assert.equal(result.status, 'succeeded')
    }
    assert.equal(value.store.get('department'), 'D0'); assert.deepEqual(value.runtime.snapshot().linkages, []); assert.equal(value.runtime.snapshot().activePageId, transition === 'back' ? 'page-home' : 'page-second')
  }
})

test('P10.3 replace computes its back baseline after removing the destroyed linkage overlay', async () => {
  const value = harness(); const second = structuredClone(value.app.pages[0]); second.id = 'page-second'; second.name = 'second'; second.pageEvents = []; const third = structuredClone(second); third.id = 'page-third'; third.name = 'third'; value.app.pages.push(second, third)
  value.runtime.execute({ ...directRequest(value.runtime, value.app, { id: 'unused', type: 'clearLinkage' }), action: { id: 'push-second', type: 'navigatePage', pageId: 'page-second', history: 'push', assignments: [] } })
  await value.runtime.executeLinkage(directRequest(value.runtime, value.app, { id: 'link-second', type: 'applyLinkage', assignments: [{ parameterId: 'department', value: 'D1' }], targetComponentIds: ['target-a'] }, 'page-second'))
  value.runtime.execute({ ...directRequest(value.runtime, value.app, { id: 'unused', type: 'clearLinkage' }, 'page-second'), action: { id: 'replace-third', type: 'navigatePage', pageId: 'page-third', history: 'replace', assignments: [{ parameterId: 'department', value: 'D2' }] } })
  assert.equal(value.store.get('department'), 'D2'); assert.deepEqual(value.runtime.snapshot().linkages, [])
  const result = value.runtime.execute({ ...directRequest(value.runtime, value.app, { id: 'unused', type: 'clearLinkage' }, 'page-third'), action: { id: 'back-home', type: 'pageBack' } })
  assert.equal(result.status, 'succeeded'); assert.equal(value.store.get('department'), 'D0'); assert.equal(value.runtime.snapshot().activePageId, 'page-home')
})

test('P10.3 target validation fails before parameter commit and refresh I/O', async () => {
  const value = harness(applyAction(), undefined, () => 'target is not queryable'); const before = value.store.snapshot(); const result = await value.trigger()
  assert.equal(result.status, 'failed'); assert.equal(result.partiallyApplied, false); assert.deepEqual(value.store.snapshot(), before); assert.deepEqual(value.calls, []); assert.deepEqual(value.runtime.snapshot().linkages, [])
})

test('P10.3 duplicate linkage targets fail atomically before commit and refresh I/O', async () => {
  const value = harness(); const before = value.store.snapshot()
  const result = await value.runtime.executeLinkage(directRequest(value.runtime, value.app, { id: 'duplicate-targets', type: 'applyLinkage', assignments: [{ parameterId: 'department', value: 'D1' }], targetComponentIds: ['target-a', 'target-a'] }))
  assert.equal(result.status, 'failed'); assert.equal(result.effectApplied, false); assert.deepEqual(value.store.snapshot(), before); assert.deepEqual(value.calls, []); assert.deepEqual(value.runtime.snapshot().linkages, [])
})

test('P10.3 clear and close invalidate late refresh completion without restoring linkage state', async () => {
  for (const transition of ['clear', 'close'] as const) {
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const value = harness(applyAction(), async (targets) => { await pending; return { attemptedComponentIds: targets, succeededComponentIds: targets, failed: [] } })
    const resultPromise = value.trigger(); while (!value.calls.length) await Promise.resolve()
    value.runtime[transition](); release(); const result = await resultPromise
    assert.equal(result.status, 'failed'); assert.deepEqual(value.runtime.snapshot().linkages, []); assert.equal(value.runtime.snapshot().closed, transition === 'close')
  }
})

test('P10.3 independent sessions never share linkage baselines or state', async () => {
  const first = harness(); const second = harness(); await first.trigger()
  assert.equal(first.store.get('department'), 'D1'); assert.equal(second.store.get('department'), 'D0'); assert.equal(second.runtime.snapshot().linkages.length, 0)
  const result = await second.runtime.executeLinkage(directRequest(second.runtime, second.app, { id: 'clear-first', type: 'clearLinkage', linkageActionId: 'link-department' }))
  assert.equal(result.status, 'skipped'); assert.equal(first.store.get('department'), 'D1')
})
