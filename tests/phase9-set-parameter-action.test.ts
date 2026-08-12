import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultDashboardApplicationV3, type DashboardApplicationV3, type EventBindingV3, type JsonValueV3 } from '../src/models/dashboard-v3.ts'
import type { DashboardComponent } from '../src/models/dashboard.ts'
import { EventBusV3 } from '../src/services/eventBusV3.ts'
import { ParameterRuntimeStoreV3 } from '../src/services/parameterRuntimeV3.ts'
import { createQueryRuntimeKeyV3, QueryRuntimeCacheV3 } from '../src/services/queryRuntimeCacheV3.ts'
import { createSetParameterActionPortV3, createSetParameterRefreshCoordinatorV3, type SetParameterRefreshCoordinatorV3 } from '../src/services/setParameterActionPortV3.ts'
import type { EventActionResultV3, SetParameterActionRequestV3 } from '../src/services/eventRuntimeTypesV3.ts'

const parameters = [
  { id: 'p', code: 'p', name: 'p', type: 'number' as const, scope: 'application' as const, required: false, defaultValue: 1, source: { kind: 'static' as const, options: [] } },
  { id: 'q', code: 'q', name: 'q', type: 'number' as const, scope: 'application' as const, required: false, defaultValue: 0, source: { kind: 'static' as const, options: [] } },
]
const owner = { kind: 'page' as const, pageId: 'page-home', pageType: 'standard' as const }
const noRefresh: SetParameterRefreshCoordinatorV3 = { async refresh() { return { attemptedComponentIds: [], succeededComponentIds: [], failed: [] } } }
function request(assignments: Array<{ parameterId: string; value: JsonValueV3 }>, signal = new AbortController().signal): SetParameterActionRequestV3 {
  return { action: { id: 'set', type: 'setParameter', assignments }, context: { transactionId: 'event-tx', depth: 1, applicationId: 'dashboard-default', eventBindingId: 'event', eventName: 'pageEnter', source: owner, occurredAt: 1, payload: {} }, parameterSnapshot: { p: 999 }, signal }
}

test('P9.5 multi-assignment commits exactly once, separates transactions and freezes evidence', async () => {
  const store = new ParameterRuntimeStoreV3(parameters, { transactionId: () => 'parameter-tx-1' })
  let commits = 0; const original = store.commit.bind(store); store.commit = ((...args: Parameters<typeof store.commit>) => { commits++; return original(...args) }) as typeof store.commit
  const result = await createSetParameterActionPortV3({ applicationId: 'dashboard-default', store, refreshCoordinator: noRefresh }).execute(request([{ parameterId: 'p', value: 2 }, { parameterId: 'q', value: 3 }]))
  assert.equal(commits, 1); assert.equal(result.status, 'succeeded'); assert.equal(result.effectApplied, true)
  assert.equal(result.parameterCommit?.eventTransactionId, 'event-tx'); assert.equal(result.parameterCommit?.parameterTransactionId, 'parameter-tx-1')
  assert.deepEqual(store.snapshot().values, { p: 2, q: 3 }); assert.equal(Object.isFrozen(result.evidence), true); assert.equal(Object.isFrozen(result.parameterCommit?.values), true)
})

test('P9.5 invalid and duplicate assignments are atomic while same values skip refresh and new tx', async () => {
  for (const assignments of [[], [{ parameterId: 'p', value: 2 }, { parameterId: 'p', value: 3 }], [{ parameterId: 'missing', value: 2 }], [{ parameterId: 'p', value: 'bad' as never }]]) {
    const store = new ParameterRuntimeStoreV3(parameters); let refreshes = 0
    const port = createSetParameterActionPortV3({ applicationId: 'dashboard-default', store, refreshCoordinator: { async refresh() { refreshes++; return { attemptedComponentIds: [], succeededComponentIds: [], failed: [] } } } })
    const before = store.snapshot(); const result = await port.execute(request(assignments))
    assert.equal(result.status, 'failed'); assert.deepEqual(store.snapshot(), before); assert.equal(refreshes, 0)
  }
  const store = new ParameterRuntimeStoreV3(parameters); let refreshes = 0
  const same = await createSetParameterActionPortV3({ applicationId: 'dashboard-default', store, refreshCoordinator: { async refresh() { refreshes++; return { attemptedComponentIds: [], succeededComponentIds: [], failed: [] } } } }).execute(request([{ parameterId: 'p', value: 1 }]))
  assert.equal(same.status, 'skipped'); assert.equal(same.effectApplied, false); assert.equal(store.snapshot().transactionId, 'parameter-tx-initial'); assert.equal(refreshes, 0)
})

function component(id: string, policy: 'onParameterChange' | 'manual' | 'onPageEnter' = 'onParameterChange', parameterId = 'p'): DashboardComponent {
  return { id, type: 'table', title: id, position: { x: 0, y: 0, width: 100, height: 100, zIndex: 1 }, dataConfig: { version: 3, sourceKind: 'server', datasetId: 'dataset', dimensions: [], measures: [], filters: [], sort: [], limit: 100, parameterBindings: [{ datasetParameterCode: 'code', parameterId }], refreshPolicy: policy }, styleConfig: { background: '#fff', borderColor: '#ddd', borderWidth: 1, borderRadius: 0, padding: 0, shadow: false, titleVisible: true, titleColor: '#000', titleSize: 12, titleWeight: 400 } }
}
function application(): DashboardApplicationV3 { const app = createDefaultDashboardApplicationV3(); app.parameters = structuredClone(parameters); app.pages[0].components = [component('auto'), component('manual', 'manual'), component('enter', 'onPageEnter'), component('other-param', 'onParameterChange', 'q')]; const other = structuredClone(app.pages[0]); other.id = 'other-page'; other.code = 'other'; other.components = [component('other-page-auto')]; app.pages.push(other); return app }

test('P9.5 refresh coordinator targets owner-page onParameterChange dependencies with new values and existing cache keys', async () => {
  const app = application(); const cache = new QueryRuntimeCacheV3<number>(); let loads = 0; const seen: Array<{ id: string; value: unknown; source: string }> = []
  const coordinator = createSetParameterRefreshCoordinatorV3({ application: app, async refreshComponent(input) { const key = createQueryRuntimeKeyV3('dataset', input.datasetParameters, 100); const result = await cache.execute(key, async () => ++loads); seen.push({ id: input.component.id, value: input.datasetParameters.code, source: result.source }) } })
  const base = { applicationId: app.id, eventTransactionId: 'e', parameterTransactionId: 'p', sourcePageId: 'page-home', changedParameterIds: ['p'], parameterValues: { p: 2 }, signal: new AbortController().signal }
  await coordinator.refresh(base); await coordinator.refresh(base)
  assert.deepEqual(seen, [{ id: 'auto', value: 2, source: 'network' }, { id: 'auto', value: 2, source: 'cache' }]); assert.equal(loads, 1)
})

test('P9.5 refresh is all-settled for partial/all failure and port reports applied failure', async () => {
  const app = application(); app.pages[0].components = [component('a'), component('b'), component('c')]
  for (const failing of [new Set(['b']), new Set(['a', 'b', 'c'])]) {
    const coordinator = createSetParameterRefreshCoordinatorV3({ application: app, async refreshComponent({ component }) { if (failing.has(component.id)) throw new Error(`fail-${component.id}`) } })
    const store = new ParameterRuntimeStoreV3(parameters); const result = await createSetParameterActionPortV3({ applicationId: app.id, store, refreshCoordinator: coordinator }).execute(request([{ parameterId: 'p', value: 2 }]))
    assert.equal(result.status, 'failed'); assert.equal(result.effectApplied, true); assert.deepEqual(store.snapshot().values.p, 2)
    const refresh = (result.evidence as { refresh: { attemptedComponentIds: string[]; failed: unknown[] } }).refresh
    assert.deepEqual(refresh.attemptedComponentIds, ['a', 'b', 'c']); assert.equal(refresh.failed.length, failing.size)
  }
})

test('P9.5 cancellation before commit, after commit, during refresh and after completion has exact boundaries', async () => {
  const pre = new AbortController(); pre.abort(); const preStore = new ParameterRuntimeStoreV3(parameters); let preRefresh = 0
  const preResult = await createSetParameterActionPortV3({ applicationId: 'dashboard-default', store: preStore, refreshCoordinator: { async refresh() { preRefresh++; return { attemptedComponentIds: [], succeededComponentIds: [], failed: [] } } } }).execute(request([{ parameterId: 'p', value: 2 }], pre.signal))
  assert.equal(preResult.effectApplied, false); assert.equal(preStore.get('p'), 1); assert.equal(preRefresh, 0)

  const afterCommit = new AbortController(); const postStore = new ParameterRuntimeStoreV3(parameters); const original = postStore.commit.bind(postStore); postStore.commit = ((...args: Parameters<typeof postStore.commit>) => { const value = original(...args); afterCommit.abort(); return value }) as typeof postStore.commit
  const postResult = await createSetParameterActionPortV3({ applicationId: 'dashboard-default', store: postStore, refreshCoordinator: noRefresh }).execute(request([{ parameterId: 'p', value: 2 }], afterCommit.signal))
  assert.equal(postResult.status, 'failed'); assert.equal(postResult.issue?.code, 'CANCELLED'); assert.equal(postResult.effectApplied, true); assert.equal(postStore.get('p'), 2)

  const app = application(); app.pages[0].components = [component('a'), component('b')]; const during = new AbortController(); const visited: string[] = []
  const coordinator = createSetParameterRefreshCoordinatorV3({ application: app, async refreshComponent({ component }) { visited.push(component.id); during.abort(); throw new Error('cancel') } })
  const duringResult = await createSetParameterActionPortV3({ applicationId: app.id, store: new ParameterRuntimeStoreV3(parameters), refreshCoordinator: coordinator }).execute(request([{ parameterId: 'p', value: 2 }], during.signal))
  assert.equal(duringResult.issue?.code, 'CANCELLED'); assert.equal(duringResult.effectApplied, true); assert.deepEqual(visited, ['a'])

  const late = new AbortController(); const lateResult = await createSetParameterActionPortV3({ applicationId: app.id, store: new ParameterRuntimeStoreV3(parameters), refreshCoordinator: { async refresh() { late.abort(); return { attemptedComponentIds: ['a'], succeededComponentIds: ['a'], failed: [] } } } }).execute(request([{ parameterId: 'p', value: 2 }], late.signal))
  assert.equal(lateResult.status, 'succeeded')
})

function setBinding(id: string, actions: EventBindingV3['actions'], event: 'pageEnter' | 'click' = 'pageEnter'): EventBindingV3 { return { id, enabled: true, event, actions } }
test('P9.5 valid handoff updates later and nested parameter snapshots; refresh failure retains commit and stops later actions', async () => {
  const app = application(); app.pages[0].components = [component('nested') as never]
  app.pages[0].pageEvents = [setBinding('root', [
    { id: 'set-p', type: 'setParameter', assignments: [{ parameterId: 'p', value: { kind: 'fixed', value: 2 } }] },
    { id: 'set-q-later', type: 'setParameter', assignments: [{ parameterId: 'q', value: { kind: 'parameter', parameterId: 'p' } }] },
  ])]
  app.pages[0].components[0].events = [setBinding('nested-event', [{ id: 'set-q', type: 'setParameter', assignments: [{ parameterId: 'q', value: { kind: 'parameter', parameterId: 'p' } }] }], 'click')]
  const store = new ParameterRuntimeStoreV3(parameters); const real = createSetParameterActionPortV3({ applicationId: app.id, store, refreshCoordinator: noRefresh })
  const emitting = { async execute(input: SetParameterActionRequestV3): Promise<EventActionResultV3> { const result = await real.execute(input); return input.action.id === 'set-p' ? { ...result, emittedEvents: [{ source: { kind: 'component', pageId: 'page-home', pageType: 'standard', componentId: 'nested', componentType: 'table' }, eventName: 'click', payload: { datum: {} } }] } : result } }
  const busResult = await new EventBusV3({ ports: { setParameter: emitting, refresh: { async execute() { return { status: 'succeeded' } } } }, idFactory: () => 'event-root' }).trigger({ application: app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: { p: 1, q: 0 } })
  assert.equal(busResult.status, 'completed'); assert.deepEqual(store.snapshot().values, { p: 2, q: 2 })

  const failedStore = new ParameterRuntimeStoreV3(parameters); app.pages[0].pageEvents[0].actions.push({ id: 'never', type: 'setParameter', assignments: [{ parameterId: 'q', value: { kind: 'fixed', value: 9 } }] }); let refreshCall = 0
  const failedPort = createSetParameterActionPortV3({ applicationId: app.id, store: failedStore, refreshCoordinator: { async refresh() { refreshCall++; return refreshCall === 1 ? { attemptedComponentIds: [], succeededComponentIds: [], failed: [] } : { attemptedComponentIds: ['x'], succeededComponentIds: [], failed: [{ componentId: 'x', code: 'ACTION_FAILED', message: 'x' }] } } } })
  const failed = await new EventBusV3({ ports: { setParameter: failedPort, refresh: { async execute() { return { status: 'succeeded' } } } } }).trigger({ application: app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: { p: 1, q: 0 } })
  assert.equal(failed.status, 'failed'); assert.equal(failed.partiallyApplied, true); assert.equal(failedStore.get('p'), 2); assert.equal(failedStore.get('q'), 2); assert.equal(refreshCall, 2)
})

test('P9.5 malicious handoff and emitted setParameter without handoff fail closed', async () => {
  const app = application(); app.pages[0].pageEvents = [setBinding('root', [{ id: 'set', type: 'setParameter', assignments: [{ parameterId: 'p', value: { kind: 'fixed', value: 2 } }] }])]
  for (const result of [
    { status: 'succeeded', effectApplied: true, parameterCommit: { kind: 'parameterCommit', applicationId: app.id, actionId: 'wrong', eventTransactionId: 'tx', parameterTransactionId: 'p', changedParameterIds: ['p'], values: { p: 2 } } },
    { status: 'succeeded', emittedEvents: [] },
  ] as EventActionResultV3[]) {
    const actual = await new EventBusV3({ ports: { setParameter: { async execute() { return result } }, refresh: { async execute() { return { status: 'succeeded' } } } }, idFactory: () => 'tx' }).trigger({ application: app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: { p: 1 } })
    assert.equal(actual.issues[0].code, 'PORT_CONTRACT_VIOLATION')
  }
})

test('P9.5 effectApplied is recorded before invalid evidence or handoff parsing', async () => {
  const app = application(); app.pages[0].pageEvents = [setBinding('root', [{ id: 'set', type: 'setParameter', assignments: [{ parameterId: 'p', value: { kind: 'fixed', value: 2 } }] }])]
  for (const result of [
    { status: 'failed', effectApplied: true, evidence: (() => 1) as never },
    { status: 'failed', effectApplied: true, parameterCommit: { bad: Array.from({ length: 100_001 }, () => 1) } as never },
  ] as EventActionResultV3[]) {
    const actual = await new EventBusV3({ ports: { setParameter: { async execute() { return result } }, refresh: { async execute() { return { status: 'succeeded' } } } }, idFactory: () => 'tx' }).trigger({ application: app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: { p: 1, q: 0 } })
    assert.equal(actual.status, 'failed'); assert.equal(actual.partiallyApplied, true)
  }
})

test('P9.5 commit null malformed accessor rejection and post-snapshot failure never reject after possible mutation', async () => {
  const cases: Array<'null' | 'malformed' | 'accessor' | 'reject' | 'snapshot'> = ['null', 'malformed', 'accessor', 'reject', 'snapshot']
  for (const kind of cases) {
    let state = { transactionId: 'parameter-tx-initial', values: { p: 1, q: 0 }, source: {}, updatedAt: {} }; let snapshots = 0; let getterCalls = 0
    const store = {
      snapshot() { snapshots++; if (kind === 'snapshot' && snapshots > 1) throw new Error('after snapshot'); return structuredClone(state) },
      commit() {
        state = { ...state, transactionId: 'parameter-tx-hostile', values: { p: 2, q: 0 } }
        if (kind === 'null') return null
        if (kind === 'malformed') return { changed: true }
        if (kind === 'accessor') { const value = { changed: true, changedParameterIds: ['p'] } as Record<string, unknown>; Object.defineProperty(value, 'state', { enumerable: true, get() { getterCalls++; return state } }); return value }
        if (kind === 'reject') throw new Error('commit rejected after write')
        return { changed: true, changedParameterIds: ['p'], state }
      },
    }
    const result = await createSetParameterActionPortV3({ applicationId: 'dashboard-default', store: store as never, refreshCoordinator: noRefresh }).execute(request([{ parameterId: 'p', value: 2 }]))
    assert.equal(result.status, 'failed'); assert.equal(result.effectApplied, true); assert.equal(getterCalls, 0); assert.equal((result.evidence as { commitOutcome: string }).commitOutcome, 'UNKNOWN_COMMIT_OUTCOME')
  }
})

test('P9.5 malformed and inconsistent refresh DTOs fail structurally after commit', async () => {
  let getterCalls = 0
  const accessor = {} as Record<string, unknown>; Object.defineProperty(accessor, 'attemptedComponentIds', { enumerable: true, get() { getterCalls++; return [] } })
  const cases: Array<() => Promise<unknown>> = [
    async () => null,
    async () => ({ attemptedComponentIds: [] }),
    async () => accessor,
    async () => { throw new Error('reject') },
    async () => ({ attemptedComponentIds: ['a'], succeededComponentIds: [], failed: [] }),
    async () => ({ attemptedComponentIds: ['a'], succeededComponentIds: ['a'], failed: [{ componentId: 'a', code: 'x', message: 'x' }] }),
  ]
  for (const refresh of cases) {
    const store = new ParameterRuntimeStoreV3(parameters)
    const result = await createSetParameterActionPortV3({ applicationId: 'dashboard-default', store, refreshCoordinator: { refresh: refresh as never } }).execute(request([{ parameterId: 'p', value: 2 }]))
    assert.equal(result.status, 'failed'); assert.equal(result.effectApplied, true); assert.equal(store.get('p'), 2)
  }
  assert.equal(getterCalls, 0)
})

test('P9.5 correctly bound but semantically forged handoffs fail closed', async () => {
  const app = application(); app.pages[0].pageEvents = [setBinding('root', [{ id: 'set', type: 'setParameter', assignments: [{ parameterId: 'p', value: { kind: 'fixed', value: 2 } }] }])]
  const base = { kind: 'parameterCommit' as const, applicationId: app.id, actionId: 'set', eventTransactionId: 'tx', parameterTransactionId: 'parameter-tx', changedParameterIds: ['p'], values: { p: 2, q: 0 } }
  const forged = [
    { ...base, changedParameterIds: ['q'] },
    { ...base, values: { p: 3, q: 0 } },
    { ...base, values: { p: 2, q: 9 } },
    { ...base, values: { q: 0 } },
  ]
  for (const parameterCommit of forged) {
    const result = await new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'succeeded' as const, effectApplied: true, parameterCommit } } }, refresh: { async execute() { return { status: 'succeeded' } } } }, idFactory: () => 'tx' }).trigger({ application: app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: { p: 1, q: 0 } })
    assert.equal(result.issues[0].code, 'PORT_CONTRACT_VIOLATION'); assert.equal(result.partiallyApplied, true)
  }
})

test('P9.5 Phase8 empty assignments delete existing values but still commit missing-to-empty transitions', async () => {
  for (const empty of [null, '', []] as JsonValueV3[]) {
    for (const parameterId of ['p', 'missing-empty']) {
      const definitions = [...parameters, { id: 'missing-empty', code: 'missing_empty', name: 'missing', type: 'string' as const, scope: 'application' as const, required: false, source: { kind: 'static' as const, options: [] } }]
      const store = new ParameterRuntimeStoreV3(definitions); const beforeTx = store.snapshot().transactionId; let refreshes = 0
      const port = createSetParameterActionPortV3({ applicationId: 'dashboard-default', store, refreshCoordinator: { async refresh() { refreshes++; return { attemptedComponentIds: [], succeededComponentIds: [], failed: [] } } } })
      const result = await port.execute(request([{ parameterId, value: empty }]))
      assert.equal(result.status, 'succeeded'); assert.equal(result.effectApplied, true); assert.equal(Object.hasOwn(store.snapshot().values, parameterId), false)
      assert.notEqual(store.snapshot().transactionId, beforeTx); assert.deepEqual(result.parameterCommit?.changedParameterIds, [parameterId]); assert.equal(refreshes, 1)
    }
  }
  const store = new ParameterRuntimeStoreV3(parameters); const beforeTx = store.snapshot().transactionId; let refreshes = 0
  const same = await createSetParameterActionPortV3({ applicationId: 'dashboard-default', store, refreshCoordinator: { async refresh() { refreshes++; return { attemptedComponentIds: [], succeededComponentIds: [], failed: [] } } } }).execute(request([{ parameterId: 'p', value: 1 }]))
  assert.equal(same.status, 'skipped'); assert.equal(store.snapshot().transactionId, beforeTx); assert.equal(refreshes, 0)
})

test('P9.5 forged empty handoffs cannot retain the cleared key, delete another key or lie about changed ids', async () => {
  const app = application(); app.pages[0].pageEvents = [setBinding('root', [{ id: 'clear', type: 'setParameter', assignments: [{ parameterId: 'p', value: { kind: 'fixed', value: null } }] }])]
  const base = { kind: 'parameterCommit' as const, applicationId: app.id, actionId: 'clear', eventTransactionId: 'tx', parameterTransactionId: 'parameter-tx', changedParameterIds: ['p'], values: { q: 0 } }
  for (const parameterCommit of [{ ...base, values: { p: null, q: 0 } }, { ...base, values: {} }, { ...base, changedParameterIds: ['q'] }]) {
    const result = await new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'succeeded' as const, effectApplied: true, parameterCommit } } }, refresh: { async execute() { return { status: 'succeeded' } } } }, idFactory: () => 'tx' }).trigger({ application: app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: { p: 1, q: 0 } })
    assert.equal(result.issues[0].code, 'PORT_CONTRACT_VIOLATION'); assert.equal(result.partiallyApplied, true)
  }
})
