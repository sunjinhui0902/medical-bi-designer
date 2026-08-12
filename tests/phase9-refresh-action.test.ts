import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultDashboardApplicationV3, type DashboardApplicationV3, type EventBindingV3, type JsonValueV3 } from '../src/models/dashboard-v3.ts'
import type { DashboardComponent } from '../src/models/dashboard.ts'
import { QueryRuntimeCacheV3 } from '../src/services/queryRuntimeCacheV3.ts'
import { createComponentQueryRefreshV3 } from '../src/services/componentQueryRefreshV3.ts'
import { createRefreshActionPortV3 } from '../src/services/refreshActionPortV3.ts'
import { EventBusV3 } from '../src/services/eventBusV3.ts'
import { ParameterRuntimeStoreV3 } from '../src/services/parameterRuntimeV3.ts'
import { createSetParameterActionPortV3, createSetParameterRefreshCoordinatorV3 } from '../src/services/setParameterActionPortV3.ts'
import type { RefreshActionRequestV3 } from '../src/services/eventRuntimeTypesV3.ts'

function component(id: string, options: { policy?: 'manual' | 'onParameterChange' | 'onPageEnter'; source?: 'server' | 'mock'; datasetId?: string; parameter?: string } = {}): DashboardComponent {
  return { id, type: 'table', title: id, position: { x: 0, y: 0, width: 100, height: 100, zIndex: 1 }, dataConfig: { version: 3, sourceKind: options.source ?? 'server', datasetId: options.datasetId === undefined ? 'dataset' : options.datasetId, dimensions: [], measures: [], filters: [], sort: [], limit: 100, parameterBindings: options.parameter ? [{ datasetParameterCode: 'p', parameterId: options.parameter }] : [], refreshPolicy: options.policy ?? 'onParameterChange' }, styleConfig: { background: '#fff', borderColor: '#ddd', borderWidth: 1, borderRadius: 0, padding: 0, shadow: false, titleVisible: true, titleColor: '#000', titleSize: 12, titleWeight: 400 } }
}
function app(): DashboardApplicationV3 {
  const value = createDefaultDashboardApplicationV3(); value.parameters = [{ id: 'p', code: 'p', name: 'p', type: 'number', scope: 'application', required: false, defaultValue: 1, source: { kind: 'static', options: [] } }]
  value.pages[0].components = [component('auto', { parameter: 'p' }), component('manual', { policy: 'manual' }), component('mock', { source: 'mock' }), component('no-dataset', { datasetId: '' })]
  const other = structuredClone(value.pages[0]); other.id = 'other-page'; other.code = 'other'; other.components = [component('cross')]; value.pages.push(other); return value
}
const owner = { kind: 'page' as const, pageId: 'page-home', pageType: 'standard' as const }
function request(target: RefreshActionRequestV3['action']['target'], signal = new AbortController().signal, parameters: Record<string, JsonValueV3> = { p: 1 }, claims: string[] = []): RefreshActionRequestV3 {
  return { action: { id: 'refresh', type: 'refresh', target }, context: { transactionId: 'event-tx', depth: 1, applicationId: 'dashboard-default', eventBindingId: 'event', eventName: 'pageEnter', source: owner, occurredAt: 1, payload: {} }, parameterSnapshot: parameters, signal, refreshClaimSnapshot: claims }
}
function runtime(load: Parameters<typeof createComponentQueryRefreshV3<number>>[0]['load']) { return createComponentQueryRefreshV3({ cache: new QueryRuntimeCacheV3<number>(), load }) }

test('P9.6 page target expands every queryable owner-page server component including manual', async () => {
  const calls: string[] = []; const port = createRefreshActionPortV3({ application: app(), queryRuntime: runtime(async ({ componentId }) => { calls.push(componentId); return 1 }) })
  const result = await port.execute(request({ kind: 'page', pageId: 'page-home' }))
  assert.equal(result.status, 'succeeded'); assert.equal(result.effectApplied, true); assert.deepEqual(calls, ['auto', 'manual'])
  assert.deepEqual((result.evidence as { resolvedComponentIds: string[] }).resolvedComponentIds, ['auto', 'manual'])
})

test('P9.6 every invalid target fails atomically before query I/O and empty page skips', async () => {
  let calls = 0; const source = app(); const port = createRefreshActionPortV3({ application: source, queryRuntime: runtime(async () => { calls++; return 1 }) })
  for (const target of [{ kind: 'page', pageId: 'other-page' }, { kind: 'components', componentIds: [] }, { kind: 'components', componentIds: ['auto', 'auto'] }, { kind: 'components', componentIds: ['missing'] }, { kind: 'components', componentIds: ['mock'] }, { kind: 'components', componentIds: ['cross'] }] as RefreshActionRequestV3['action']['target'][]) { const result = await port.execute(request(target)); assert.equal(result.effectApplied, false); assert.equal(Object.isFrozen(result.evidence), true); assert.deepEqual((result.evidence as { attemptedComponentIds: string[] }).attemptedComponentIds, []) }
  assert.equal(calls, 0)
  source.pages[0].components = [component('mock', { source: 'mock' })]
  assert.equal((await port.execute(request({ kind: 'page', pageId: 'page-home' }))).status, 'skipped'); assert.equal(calls, 0)
})

test('P9.6 force bypasses valid cache and concurrent forced requests merge only by query key', async () => {
  let loads = 0; const releases: Array<() => void> = []; const shared = runtime(async () => { loads++; await new Promise<void>((resolve) => releases.push(resolve)); return loads })
  const source = app(); source.pages[0].components = [component('auto', { parameter: 'p' })]; const descriptor = shared.describe(source.pages[0].components[0], { p: 1 })!
  const warm = shared.execute(descriptor, false, new AbortController().signal); releases.shift()!(); await warm
  const port = createRefreshActionPortV3({ application: source, queryRuntime: shared })
  const first = port.execute(request({ kind: 'components', componentIds: ['auto'] })); const second = port.execute(request({ kind: 'components', componentIds: ['auto'] }))
  await Promise.resolve(); assert.equal(loads, 2); releases.shift()!(); assert.equal((await first).status, 'succeeded'); assert.equal((await second).status, 'succeeded')
  const left = port.execute(request({ kind: 'components', componentIds: ['auto'] }, undefined, { p: 2 })); const right = port.execute(request({ kind: 'components', componentIds: ['auto'] }, undefined, { p: 3 }))
  await Promise.resolve(); assert.equal(loads, 4); releases.splice(0).forEach((release) => release()); await Promise.all([left, right])
})

test('P9.6 onResolved runs once per successful caller and fails only the caller when callback rejects', async () => {
  const source = app(); source.pages[0].components = [component('auto')]; const cache = new QueryRuntimeCacheV3<number>(); const releases: Array<() => void> = []; let loads = 0; const resolved: string[] = []; let rejectCallback = false
  const shared = createComponentQueryRefreshV3({ cache, async load() { const value = ++loads; if (value === 2) await new Promise<void>((resolve) => releases.push(resolve)); if (value === 3) throw new Error('load failed'); return value }, onResolved({ source: resultSource }) { resolved.push(resultSource); if (rejectCallback) throw new Error('apply failed') } }); const descriptor = shared.describe(source.pages[0].components[0], {})!
  assert.equal((await shared.execute(descriptor, false, new AbortController().signal)).source, 'network')
  assert.equal((await shared.execute(descriptor, false, new AbortController().signal)).source, 'cache')
  const first = shared.execute(descriptor, true, new AbortController().signal); const second = shared.execute(descriptor, true, new AbortController().signal); await Promise.resolve(); releases.shift()!(); await Promise.all([first, second])
  assert.deepEqual(resolved, ['network', 'cache', 'network', 'merged'])
  cache.clear(); await assert.rejects(shared.execute(descriptor, false, new AbortController().signal), /load failed/); assert.equal(resolved.length, 4)
  rejectCallback = true; await assert.rejects(shared.execute(descriptor, false, new AbortController().signal), /apply failed/); assert.equal(resolved.length, 5)
})

test('P9.6 shared component query runtime keeps P9.5 parameter refresh non-forced', async () => {
  const source = app(); source.pages[0].components = [component('auto', { parameter: 'p' })]; let loads = 0
  const shared = runtime(async () => ++loads); const descriptor = shared.describe(source.pages[0].components[0], { p: 2 })!
  await shared.execute(descriptor, false, new AbortController().signal)
  const coordinator = createSetParameterRefreshCoordinatorV3({ application: source, queryRuntime: shared })
  await coordinator.refresh({ applicationId: source.id, eventTransactionId: 'e', parameterTransactionId: 'p', sourcePageId: 'page-home', changedParameterIds: ['p'], parameterValues: { p: 2 }, signal: new AbortController().signal })
  assert.equal(loads, 1)
})

test('P9.6 cancelling the first forced waiter does not cancel a merged live waiter', async () => {
  const source = app(); source.pages[0].components = [component('auto')]; let loads = 0; let release!: () => void
  const shared = runtime(async () => { loads++; await new Promise<void>((resolve) => { release = resolve }); return 1 }); const port = createRefreshActionPortV3({ application: source, queryRuntime: shared })
  const firstController = new AbortController(); const secondController = new AbortController()
  const first = port.execute(request({ kind: 'components', componentIds: ['auto'] }, firstController.signal)); const second = port.execute(request({ kind: 'components', componentIds: ['auto'] }, secondController.signal))
  await Promise.resolve(); firstController.abort(); assert.equal((await first).issue?.code, 'CANCELLED'); assert.equal(loads, 1)
  release(); assert.equal((await second).status, 'succeeded'); assert.equal(loads, 1)
})

test('P9.6 cancelling the only forced waiter aborts loader and prevents late cache writes', async () => {
  const source = app(); source.pages[0].components = [component('auto')]; const cache = new QueryRuntimeCacheV3<number>(); let loads = 0; let loaderSignal!: AbortSignal; let release!: () => void
  const shared = createComponentQueryRefreshV3({ cache, async load({ signal }) { loads++; loaderSignal = signal; if (loads === 1) await new Promise<void>((resolve) => { release = resolve }); return loads } }); const descriptor = shared.describe(source.pages[0].components[0], {})!
  const controller = new AbortController(); const forced = shared.execute(descriptor, true, controller.signal); await Promise.resolve(); controller.abort()
  await assert.rejects(forced, /cancelled/); assert.equal(loaderSignal.aborted, true); release(); await new Promise<void>((resolve) => setImmediate(resolve)); assert.equal(cache.size, 0)
  assert.equal((await shared.execute(descriptor, false, new AbortController().signal)).source, 'network'); assert.equal(loads, 2)
})

test('P9.6 cancelling every merged waiter aborts shared loader and prevents late cache writes', async () => {
  const source = app(); source.pages[0].components = [component('auto')]; const cache = new QueryRuntimeCacheV3<number>(); let loads = 0; let loaderSignal!: AbortSignal; let release!: () => void
  const shared = createComponentQueryRefreshV3({ cache, async load({ signal }) { loads++; loaderSignal = signal; if (loads === 1) await new Promise<void>((resolve) => { release = resolve }); return loads } }); const descriptor = shared.describe(source.pages[0].components[0], {})!
  const firstController = new AbortController(); const secondController = new AbortController(); const first = shared.execute(descriptor, true, firstController.signal); const second = shared.execute(descriptor, true, secondController.signal)
  await Promise.resolve(); firstController.abort(); assert.equal(loaderSignal.aborted, false); secondController.abort(); await Promise.all([assert.rejects(first, /cancelled/), assert.rejects(second, /cancelled/)])
  assert.equal(loaderSignal.aborted, true); assert.equal(loads, 1); release(); await new Promise<void>((resolve) => setImmediate(resolve)); assert.equal(cache.size, 0)
  await shared.execute(descriptor, false, new AbortController().signal); assert.equal(loads, 2)
})

test('P9.6 a retired cancelled request cannot absorb or delete a replacement forced request', async () => {
  const source = app(); source.pages[0].components = [component('auto')]; const cache = new QueryRuntimeCacheV3<number>(); const releases: Array<() => void> = []; const loaderSignals: AbortSignal[] = []; let loads = 0
  const shared = createComponentQueryRefreshV3({ cache, async load({ signal }) { const value = ++loads; loaderSignals.push(signal); await new Promise<void>((resolve) => releases.push(resolve)); return value } }); const descriptor = shared.describe(source.pages[0].components[0], {})!
  const oldController = new AbortController(); const old = shared.execute(descriptor, true, oldController.signal); await Promise.resolve(); oldController.abort(); await assert.rejects(old, /cancelled/)
  assert.equal(loaderSignals[0].aborted, true)
  const replacement = shared.execute(descriptor, true, new AbortController().signal); await Promise.resolve(); assert.equal(loads, 2); assert.equal(loaderSignals[1].aborted, false)
  const merged = shared.execute(descriptor, true, new AbortController().signal); await Promise.resolve(); assert.equal(loads, 2)
  releases[0](); await new Promise<void>((resolve) => setImmediate(resolve)); assert.equal(cache.size, 0)
  releases[1](); assert.equal((await replacement).source, 'network'); assert.equal((await merged).source, 'merged'); assert.equal(loads, 2); assert.equal(cache.size, 1)
})

test('P9.6 refresh is all-settled and reports partial or total failure as applied', async () => {
  const source = app(); source.pages[0].components = [component('a'), component('b'), component('c')]
  for (const failures of [new Set(['b']), new Set(['a', 'b', 'c'])]) {
    const calls: string[] = []; const port = createRefreshActionPortV3({ application: source, queryRuntime: runtime(async ({ componentId }) => { calls.push(componentId); if (failures.has(componentId)) throw new Error(componentId); return 1 }) })
    const result = await port.execute(request({ kind: 'page', pageId: 'page-home' })); assert.equal(result.status, 'failed'); assert.equal(result.effectApplied, true); assert.deepEqual(calls, ['a', 'b', 'c'])
    assert.equal((result.evidence as { failed: unknown[] }).failed.length, failures.size)
    assert.equal(result.refreshClaims?.length ?? 0, 3 - failures.size)
  }
})

test('P9.6 cancellation distinguishes pre-I/O, in-flight and too-late completion', async () => {
  const source = app(); source.pages[0].components = [component('a'), component('b')]
  const pre = new AbortController(); pre.abort(); let calls = 0
  const preResult = await createRefreshActionPortV3({ application: source, queryRuntime: runtime(async () => { calls++; return 1 }) }).execute(request({ kind: 'page', pageId: 'page-home' }, pre.signal)); assert.equal(preResult.issue?.code, 'CANCELLED'); assert.equal(preResult.effectApplied, false); assert.equal(Object.isFrozen(preResult.evidence), true); assert.equal((preResult.evidence as { cancelled: boolean }).cancelled, true); assert.equal(calls, 0)
  const during = new AbortController(); const visited: string[] = []
  const duringResult = await createRefreshActionPortV3({ application: source, queryRuntime: runtime(async ({ componentId }) => { visited.push(componentId); during.abort(); throw new Error('cancel') }) }).execute(request({ kind: 'page', pageId: 'page-home' }, during.signal)); assert.equal(duringResult.issue?.code, 'CANCELLED'); assert.equal(duringResult.effectApplied, true); assert.deepEqual(visited, ['a'])
  const late = new AbortController(); const lateResult = await createRefreshActionPortV3({ application: source, queryRuntime: runtime(async () => 1) }).execute(request({ kind: 'page', pageId: 'page-home' }, late.signal)); late.abort(); assert.equal(lateResult.status, 'succeeded')
})

const binding = (actions: EventBindingV3['actions']): EventBindingV3 => ({ id: 'root', enabled: true, event: 'pageEnter', actions })
test('P9.6 EventBus deduplicates overlapping refresh claims but parameter handoff creates a new query key', async () => {
  const source = app(); source.pages[0].components = [component('auto', { parameter: 'p' })]; source.pages[0].pageEvents = [binding([
    { id: 'r1', type: 'refresh', target: { kind: 'page', pageId: 'page-home' } }, { id: 'r2', type: 'refresh', target: { kind: 'components', componentIds: ['auto'] } },
    { id: 'set', type: 'setParameter', assignments: [{ parameterId: 'p', value: { kind: 'fixed', value: 2 } }] }, { id: 'r3', type: 'refresh', target: { kind: 'page', pageId: 'page-home' } },
  ])]
  let loads = 0; const refresh = createRefreshActionPortV3({ application: source, queryRuntime: runtime(async () => ++loads) }); const store = new ParameterRuntimeStoreV3(source.parameters)
  const setParameter = createSetParameterActionPortV3({ applicationId: source.id, store, refreshCoordinator: { async refresh() { return { attemptedComponentIds: [], succeededComponentIds: [], failed: [] } } } })
  const result = await new EventBusV3({ ports: { refresh, setParameter }, idFactory: () => 'event-tx' }).trigger({ application: source, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: { p: 1 } })
  assert.equal(result.status, 'completed'); assert.equal(loads, 2); assert.equal(store.get('p'), 2)
  const evidence = result.trace.filter((item) => item.kind === 'actionDetail').map((item) => item.evidence as { deduplicatedComponentIds?: string[] })
  assert.deepEqual(evidence[1].deduplicatedComponentIds, ['auto'])
})

test('P9.6 EventBus rejects Refresh parameterCommit, emittedEvents and hostile evidence while preserving applied truth', async () => {
  const source = app(); source.pages[0].pageEvents = [binding([{ id: 'refresh', type: 'refresh', target: { kind: 'page', pageId: 'page-home' } }])]
  for (const malicious of [{ parameterCommit: { kind: 'parameterCommit' } }, { emittedEvents: [] }, { evidence: (() => 1) }, { refreshClaims: ['not-a-claim'] }]) {
    const result = await new EventBusV3({ ports: { refresh: { async execute() { return { status: 'succeeded' as const, effectApplied: true, ...malicious } as never } }, setParameter: { async execute() { return { status: 'skipped' } } } } }).trigger({ application: source, source: owner, eventName: 'pageEnter', payload: {} })
    assert.equal(result.status, 'failed'); assert.equal(result.partiallyApplied, true); assert.equal(result.issues[0].code, 'PORT_CONTRACT_VIOLATION')
  }
  const noEffect = await new EventBusV3({ ports: { refresh: { async execute() { return { status: 'succeeded' as const, emittedEvents: [] } } }, setParameter: { async execute() { return { status: 'skipped' } } } } }).trigger({ application: source, source: owner, eventName: 'pageEnter', payload: {} })
  assert.equal(noEffect.issues[0].code, 'PORT_CONTRACT_VIOLATION')
})
