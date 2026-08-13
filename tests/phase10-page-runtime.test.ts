import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultDashboardApplicationV3, type DashboardApplicationV3, type JsonValueV3 } from '../src/models/dashboard-v3.ts'
import { EventBusV3 } from '../src/services/eventBusV3.ts'
import { ParameterRuntimeStoreV3 } from '../src/services/parameterRuntimeV3.ts'
import { createPageSessionEventIntegrationV3, PageSessionRuntimeV3, verifyPageSessionInteractionCommitV3 } from '../src/services/pageSessionRuntimeV3.ts'
import { createDesignerEventRuntimeV3 } from '../src/services/designerEventRuntimeV3.ts'
import type { InteractionActionRequestV3, ResolvedInteractionActionRequestV3 } from '../src/services/eventRuntimeTypesV3.ts'

const parameters = [
  { id: 'hospital', code: 'hospital', name: 'hospital', type: 'string' as const, scope: 'application' as const, required: false, defaultValue: 'H0', source: { kind: 'static' as const, options: [] } },
  { id: 'department', code: 'department', name: 'department', type: 'string' as const, scope: 'application' as const, required: false, source: { kind: 'static' as const, options: [] } },
]
const fakeLease = { sessionId: 'fake-session', epoch: 1, revision: 1 }

function application(): DashboardApplicationV3 {
  const app = createDefaultDashboardApplicationV3()
  app.parameters = structuredClone(parameters)
  const detail = structuredClone(app.pages[0]); detail.id = 'page-detail'; detail.code = 'detail'; detail.order = 2; detail.pageEvents = []
  const doctor = structuredClone(app.pages[0]); doctor.id = 'page-doctor'; doctor.code = 'doctor'; doctor.order = 3; doctor.pageEvents = []
  app.pages.push(detail, doctor)
  return app
}

function request(action: ResolvedInteractionActionRequestV3, values: Record<string, JsonValueV3>, signal = new AbortController().signal): InteractionActionRequestV3 {
  return { action, context: { transactionId: `event-${action.id}`, depth: 1, applicationId: 'dashboard-default', eventBindingId: 'event', eventName: 'pageEnter', source: { kind: 'page', pageId: 'page-home', pageType: 'standard' }, occurredAt: 1, payload: {} }, parameterSnapshot: values, refreshClaimSnapshot: [], signal, sessionLease: { sessionId: 'unbound', epoch: 1, revision: 1 } }
}

function execute(runtime: PageSessionRuntimeV3, action: ResolvedInteractionActionRequestV3, values: Record<string, JsonValueV3>, signal = new AbortController().signal) {
  return runtime.execute({ ...request(action, values, signal), sessionLease: runtime.captureSessionLease() })
}

function navigate(id: string, pageId: string, history: 'push' | 'replace', assignments: Array<{ parameterId: string; value: JsonValueV3 }> = []): ResolvedInteractionActionRequestV3 {
  return { id, type: 'navigatePage', pageId, history, assignments }
}

test('P10.2 page push, replace and back restore parameter baselines', () => {
  const store = new ParameterRuntimeStoreV3(parameters, { transactionId: (() => { let id = 0; return () => `parameter-${++id}` })() })
  const runtime = new PageSessionRuntimeV3({ application: application(), parameters: store, sessionId: 'session-a' })
  const pushed = execute(runtime, navigate('push', 'page-detail', 'push', [{ parameterId: 'hospital', value: 'H1' }]), { hospital: 'H0' })
  assert.equal(pushed.status, 'succeeded'); assert.deepEqual(store.snapshot().values, { hospital: 'H1' }); assert.equal(runtime.snapshot().activePageId, 'page-detail')

  const replaced = execute(runtime, navigate('replace', 'page-doctor', 'replace', [{ parameterId: 'department', value: 'D1' }]), { hospital: 'H1' })
  assert.equal(replaced.status, 'succeeded'); assert.deepEqual(store.snapshot().values, { hospital: 'H1', department: 'D1' }); assert.deepEqual(runtime.snapshot().stack.map((item) => item.pageId), ['page-home', 'page-doctor'])

  const backed = execute(runtime, { id: 'back', type: 'pageBack' }, { hospital: 'H1', department: 'D1' })
  assert.equal(backed.status, 'succeeded'); assert.deepEqual(store.snapshot().values, { hospital: 'H0' }); assert.equal(runtime.snapshot().activePageId, 'page-home')
  assert.deepEqual(backed.parameterCommit?.assignments, [{ parameterId: 'hospital', value: 'H0' }, { parameterId: 'department', value: null }])
})

test('P10.2 non-default preview roots its PageSession at the active standard page', async () => {
  const app = application()
  const component = {
    id: 'component-detail', type: 'text' as const, title: 'detail',
    position: { x: 0, y: 0, width: 200, height: 100, zIndex: 1 },
    dataConfig: { version: 2 as const, sourceKind: 'dataset' as const, datasetId: 'mock-empty', dimensions: [], measures: [], filters: [], sort: [], limit: 100 },
    styleConfig: { background: '#fff', titleColor: '#000', titleSize: 14, titleWeight: 600, titleVisible: true },
    events: [{ id: 'detail-click', enabled: true, event: 'click' as const, actions: [{ id: 'detail-navigate', type: 'navigatePage' as const, pageId: 'page-doctor', history: 'push' as const }] }],
  }
  app.pages[1].components = [component]
  const store = new ParameterRuntimeStoreV3(parameters)
  const runtime = createDesignerEventRuntimeV3({ application: app, parameters: store, initialPageId: 'page-detail', queryRuntime: { describe() { return undefined }, async execute() { throw new Error('not expected') } } })
  assert.equal(runtime.interactionSnapshot().activePageId, 'page-detail')
  const result = await runtime.triggerComponentClick('page-detail', component.id, {})
  assert.equal(result?.status, 'completed')
  assert.equal(runtime.interactionSnapshot().activePageId, 'page-doctor')
  assert.equal(runtime.clearInteractions().activePageId, 'page-detail')
})

test('P10.2 page push fails closed at the frozen session stack budget', () => {
  let sequence = 0
  const store = new ParameterRuntimeStoreV3(parameters)
  const runtime = new PageSessionRuntimeV3({ application: application(), parameters: store, sessionId: 'budget-session', idFactory: () => `instance-${++sequence}` })
  for (let index = 1; index < 100; index++) assert.equal(execute(runtime, navigate(`push-${index}`, 'page-detail', 'push'), { hospital: 'H0' }).status, 'succeeded')
  const before = runtime.snapshot()
  const rejected = execute(runtime, navigate('push-overflow', 'page-detail', 'push'), { hospital: 'H0' })
  assert.equal(rejected.status, 'failed')
  assert.match(rejected.issue?.message ?? '', /depth/)
  assert.deepEqual(runtime.snapshot(), before)
})

test('P10.2 invalid parameter transaction does not mutate page state', () => {
  const store = new ParameterRuntimeStoreV3(parameters)
  const runtime = new PageSessionRuntimeV3({ application: application(), parameters: store, sessionId: 'session-atomic' })
  const beforeState = runtime.snapshot(); const beforeParameters = store.snapshot()
  const result = execute(runtime, navigate('invalid', 'page-detail', 'push', [{ parameterId: 'hospital', value: 123 }]), { hospital: 'H0' })
  assert.equal(result.status, 'failed'); assert.equal(result.effectApplied, false); assert.deepEqual(runtime.snapshot(), beforeState); assert.deepEqual(store.snapshot(), beforeParameters)
})

test('P10.2 root back skips, clear restores root, and close invalidates the session', () => {
  const store = new ParameterRuntimeStoreV3(parameters)
  const runtime = new PageSessionRuntimeV3({ application: application(), parameters: store, sessionId: 'session-lifecycle' })
  assert.equal(execute(runtime, { id: 'root-back', type: 'pageBack' }, { hospital: 'H0' }).status, 'skipped')
  execute(runtime, navigate('push', 'page-detail', 'push', [{ parameterId: 'hospital', value: 'H2' }]), { hospital: 'H0' })
  const beforeClearEpoch = runtime.snapshot().epoch
  assert.equal(runtime.clear().activePageId, 'page-home'); assert.equal(runtime.snapshot().epoch, beforeClearEpoch + 1); assert.deepEqual(store.snapshot().values, { hospital: 'H0' })
  const closed = runtime.close(); assert.equal(closed.closed, true); assert.equal(closed.stack.length, 0)
  const rejected = runtime.execute({ ...request(navigate('late', 'page-detail', 'push'), { hospital: 'H0' }), sessionLease: { sessionId: 'session-lifecycle', epoch: 1, revision: 1 } })
  assert.equal(rejected.issue?.code, 'CANCELLED')
})

test('P10.2 plans and validates page instance identity before parameter commit', () => {
  const store = new ParameterRuntimeStoreV3(parameters)
  const ids = ['root-instance', 'root-instance']
  const runtime = new PageSessionRuntimeV3({ application: application(), parameters: store, sessionId: 'identity-session', idFactory: () => ids.shift()! })
  const before = store.snapshot()
  assert.throws(() => execute(runtime, navigate('collision', 'page-detail', 'push', [{ parameterId: 'hospital', value: 'H8' }]), { hospital: 'H0' }), /unique/)
  assert.deepEqual(store.snapshot(), before); assert.equal(runtime.snapshot().activePageId, 'page-home')
})

test('P10.2 page sessions are isolated and snapshots are immutable', () => {
  const app = application(); const firstStore = new ParameterRuntimeStoreV3(parameters); const secondStore = new ParameterRuntimeStoreV3(parameters)
  const first = new PageSessionRuntimeV3({ application: app, parameters: firstStore, sessionId: 'first' })
  const second = new PageSessionRuntimeV3({ application: app, parameters: secondStore, sessionId: 'second' })
  execute(first, navigate('push', 'page-detail', 'push', [{ parameterId: 'hospital', value: 'H9' }]), { hospital: 'H0' })
  assert.equal(first.snapshot().activePageId, 'page-detail'); assert.equal(second.snapshot().activePageId, 'page-home'); assert.equal(secondStore.get('hospital'), 'H0')
  assert.equal(Object.isFrozen(first.snapshot()), true); assert.equal(Object.isFrozen(first.snapshot().stack), true)
})

test('P10.2 EventBus routes navigation through interaction port and carries committed parameters', async () => {
  const app = application(); const store = new ParameterRuntimeStoreV3(parameters, { transactionId: () => 'parameter-navigation' })
  app.pages[0].pageEvents = [{ id: 'navigation-event', enabled: true, event: 'pageEnter', actions: [{ id: 'navigate', type: 'navigatePage', pageId: 'page-detail', history: 'push', assignments: [{ parameterId: 'hospital', value: { kind: 'fixed', value: 'H3' } }] }] }]
  const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'event-session' })
  const bus = new EventBusV3({ ports: { setParameter: { async execute() { throw new Error('wrong port') } }, refresh: { async execute() { throw new Error('wrong port') } }, interaction: createPageSessionEventIntegrationV3(runtime) }, idFactory: () => 'event-navigation' })
  const result = await bus.trigger({ application: app, source: { kind: 'page', pageId: 'page-home', pageType: 'standard' }, eventName: 'pageEnter', payload: {}, parameterSnapshot: { hospital: 'H0' } })
  assert.equal(result.status, 'completed'); assert.deepEqual(result.completedActionIds, ['navigate']); assert.equal(runtime.snapshot().activePageId, 'page-detail'); assert.equal(store.get('hospital'), 'H3')
})

test('P10.2 EventBus rejects forged interaction parameter handoff', async () => {
  const app = application(); app.pages[0].pageEvents = [{ id: 'navigation-event', enabled: true, event: 'pageEnter', actions: [{ id: 'navigate', type: 'navigatePage', pageId: 'page-detail', history: 'push', assignments: [{ parameterId: 'hospital', value: { kind: 'fixed', value: 'H3' } }] }] }]
  const interaction = { captureSessionLease: () => fakeLease, async execute() { return { status: 'succeeded' as const, effectApplied: true, parameterCommit: { kind: 'parameterCommit' as const, applicationId: app.id, actionId: 'navigate', eventTransactionId: 'event-navigation', parameterTransactionId: 'parameter-navigation', changedParameterIds: ['hospital'], values: { hospital: 'FORGED' }, assignments: [{ parameterId: 'hospital', value: 'FORGED' }], sessionLease: fakeLease } } } }
  const bus = new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'skipped' } } }, refresh: { async execute() { return { status: 'skipped' } } }, interaction }, idFactory: () => 'event-navigation' })
  const result = await bus.trigger({ application: app, source: { kind: 'page', pageId: 'page-home', pageType: 'standard' }, eventName: 'pageEnter', payload: {}, parameterSnapshot: { hospital: 'H0' } })
  assert.equal(result.status, 'failed'); assert.equal(result.issues[0]?.code, 'PORT_CONTRACT_VIOLATION')
})

test('P10.2 EventBus enforces interaction effect/commit symmetry and trusted back provenance', async () => {
  const app = application()
  const navigation = { id: 'navigate', type: 'navigatePage' as const, pageId: 'page-detail', history: 'push' as const, assignments: [{ parameterId: 'hospital', value: { kind: 'fixed' as const, value: 'H3' } }] }
  app.pages[0].pageEvents = [{ id: 'event', enabled: true, event: 'pageEnter', actions: [navigation] }]
  const owner = { kind: 'page' as const, pageId: 'page-home', pageType: 'standard' as const }
  for (const result of [
    { status: 'succeeded' as const, effectApplied: true },
    { status: 'skipped' as const, effectApplied: true, parameterCommit: { kind: 'parameterCommit' as const, applicationId: app.id, actionId: 'navigate', eventTransactionId: 'event-tx', parameterTransactionId: 'parameter-tx', changedParameterIds: ['hospital'], values: { hospital: 'H3' }, assignments: [{ parameterId: 'hospital', value: 'H3' }], sessionLease: fakeLease } },
  ]) {
    const bus = new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'skipped' } } }, refresh: { async execute() { return { status: 'skipped' } } }, interaction: { captureSessionLease: () => fakeLease, async execute() { return result } } }, idFactory: () => 'event-tx' })
    const outcome = await bus.trigger({ application: app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: { hospital: 'H0' } })
    assert.equal(outcome.issues[0]?.code, 'PORT_CONTRACT_VIOLATION')
  }

  app.pages[0].pageEvents[0].actions = [{ id: 'back', type: 'pageBack' }]
  const forgedBack = { captureSessionLease: () => fakeLease, async execute() { return { status: 'succeeded' as const, effectApplied: true, parameterCommit: { kind: 'parameterCommit' as const, applicationId: app.id, actionId: 'back', eventTransactionId: 'event-back', parameterTransactionId: 'parameter-back', changedParameterIds: ['hospital'], values: { hospital: 'FORGED' }, assignments: [{ parameterId: 'hospital', value: 'FORGED' }], sessionLease: fakeLease } } } }
  const rejected = await new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'skipped' } } }, refresh: { async execute() { return { status: 'skipped' } } }, interaction: forgedBack }, idFactory: () => 'event-back' }).trigger({ application: app, source: owner, eventName: 'pageEnter', payload: {}, parameterSnapshot: { hospital: 'H3' } })
  assert.equal(rejected.issues[0]?.code, 'PORT_CONTRACT_VIOLATION')
})

test('P10.2 trusted pageBack handoff and navigated pageEnter remain inside EventBus', async () => {
  const app = application(); const store = new ParameterRuntimeStoreV3(parameters, { transactionId: (() => { let id = 0; return () => `parameter-${++id}` })() })
  app.pages[0].pageEvents = [{ id: 'navigate-event', enabled: true, event: 'pageEnter', actions: [{ id: 'navigate', type: 'navigatePage', pageId: 'page-detail', history: 'push', assignments: [{ parameterId: 'hospital', value: { kind: 'fixed', value: 'H4' } }] }] }]
  app.pages[1].pageEvents = [{ id: 'detail-enter', enabled: true, event: 'pageEnter', actions: [{ id: 'detail-noop', type: 'setParameter', assignments: [{ parameterId: 'hospital', value: { kind: 'fixed', value: 'H4' } }] }] }]
  const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'trusted-session' }); const integration = createPageSessionEventIntegrationV3(runtime)
  const bus = new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'skipped', effectApplied: false } } }, refresh: { async execute() { return { status: 'skipped' } } }, interaction: integration }, idFactory: () => 'event-navigation' })
  const navigated = await bus.trigger({ application: app, source: { kind: 'page', pageId: 'page-home', pageType: 'standard' }, eventName: 'pageEnter', payload: {}, parameterSnapshot: { hospital: 'H0' } })
  assert.equal(navigated.status, 'completed'); assert.deepEqual(navigated.attemptedActionIds, ['navigate', 'detail-noop']); assert.equal(runtime.snapshot().activePageId, 'page-detail')

  app.pages[1].pageEvents[0].actions = [{ id: 'back', type: 'pageBack' }]
  const backed = await new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'skipped' } } }, refresh: { async execute() { return { status: 'skipped' } } }, interaction: integration }, idFactory: () => 'event-back' }).trigger({ application: app, source: { kind: 'page', pageId: 'page-detail', pageType: 'standard' }, eventName: 'pageEnter', payload: {}, parameterSnapshot: { hospital: 'H4' } })
  assert.equal(backed.status, 'completed'); assert.equal(runtime.snapshot().activePageId, 'page-home'); assert.equal(store.get('hospital'), 'H0')
})

test('P10.2 clear cancels pending preview navigation and isolates the replacement epoch', async () => {
  const app = application(); const store = new ParameterRuntimeStoreV3(parameters)
  app.pages[0].pageEvents = [{ id: 'delayed-navigation', enabled: true, event: 'pageEnter', debounceMs: 50, actions: [{ id: 'navigate', type: 'navigatePage', pageId: 'page-detail', history: 'push' }] }]
  const runtime = createDesignerEventRuntimeV3({ application: app, parameters: store, queryRuntime: { describe() { return undefined }, async execute() { throw new Error('not expected') } } })
  const pending = runtime.triggerPageEnter('page-home'); const cleared = runtime.clearInteractions(); const result = await pending
  assert.equal(cleared.activePageId, 'page-home'); assert.notEqual(result?.status, 'completed'); assert.equal(runtime.interactionSnapshot().activePageId, 'page-home')
})

test('P10.2 stale session requests and trusted commits cannot cross clear epoch', async () => {
  const app = application(); const store = new ParameterRuntimeStoreV3(parameters, { transactionId: (() => { let id = 0; return () => `parameter-${++id}` })() })
  const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'lease-session' }); const port = createPageSessionEventIntegrationV3(runtime)
  const oldLease = runtime.captureSessionLease()
  const staleRequest = { ...request(navigate('stale', 'page-detail', 'push'), { hospital: 'H0' }), sessionLease: oldLease }
  runtime.clear()
  const stale = await port.execute(staleRequest)
  assert.equal(stale.issue?.code, 'CANCELLED'); assert.equal(runtime.snapshot().activePageId, 'page-home')

  const navigationLease = runtime.captureSessionLease()
  await port.execute({ ...request(navigate('setup', 'page-detail', 'push', [{ parameterId: 'hospital', value: 'H5' }]), { hospital: 'H0' }), sessionLease: navigationLease })
  const backLease = runtime.captureSessionLease()
  const backAction = { id: 'back-proof', type: 'pageBack' as const }
  const back = await port.execute({ ...request(backAction, { hospital: 'H5' }), sessionLease: backLease })
  assert.ok(back.parameterCommit)
  runtime.clear()
  const replayAccepted = verifyPageSessionInteractionCommitV3(port, { application: app, action: backAction, eventTransactionId: 'event-back-proof', before: { hospital: 'H5' }, commit: back.parameterCommit!, sessionLease: backLease })
  assert.equal(replayAccepted, false); assert.equal(runtime.snapshot().activePageId, 'page-home')
})

test('P10.2 dedicated integration rejects subclass self-signing and verification is non-consuming', async () => {
  const app = application(); const store = new ParameterRuntimeStoreV3(parameters)
  class ForgedRuntime extends PageSessionRuntimeV3 {
    override execute() { return { status: 'succeeded' as const, effectApplied: true } }
    override acceptsCompletedLease() { return true }
  }
  assert.throws(() => new ForgedRuntime({ application: app, parameters: store, sessionId: 'forged-session' }), /subclassing/)

  const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'real-session' }); const port = createPageSessionEventIntegrationV3(runtime)
  await port.execute({ ...request(navigate('setup-proof', 'page-detail', 'push', [{ parameterId: 'hospital', value: 'H6' }]), { hospital: 'H0' }), sessionLease: runtime.captureSessionLease() })
  const backLease = runtime.captureSessionLease(); const backAction = { id: 'back-non-consuming', type: 'pageBack' as const }
  const back = await port.execute({ ...request(backAction, { hospital: 'H6' }), sessionLease: backLease })
  const verification = { application: app, action: backAction, eventTransactionId: 'event-back-non-consuming', before: { hospital: 'H6' }, commit: back.parameterCommit!, sessionLease: backLease }
  const tampered = structuredClone(back.parameterCommit!); tampered.values.hospital = 'FORGED'
  assert.equal(verifyPageSessionInteractionCommitV3(port, { ...verification, commit: tampered }), false)
  assert.equal(verifyPageSessionInteractionCommitV3(port, verification), true)
})

test('P10.2 authentic runtime rejects instance override and prototype rebinding', () => {
  const app = application(); const store = new ParameterRuntimeStoreV3(parameters)
  const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'sealed-session' })
  assert.equal(Object.isSealed(runtime), true); assert.equal(Object.isFrozen(PageSessionRuntimeV3.prototype), true)
  assert.throws(() => Object.defineProperty(runtime, 'captureSessionLease', { value: () => ({ sessionId: 'forged', epoch: 1, revision: 1 }) }))
  assert.throws(() => Object.setPrototypeOf(runtime, {}))
  assert.throws(() => Object.defineProperty(PageSessionRuntimeV3.prototype, 'execute', { value: () => ({ status: 'succeeded' }) }))
  assert.doesNotThrow(() => createPageSessionEventIntegrationV3(runtime))
})
