import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultDashboardApplicationV3, type DashboardApplicationV3, type DialogPresentationV3, type JsonValueV3 } from '../src/models/dashboard-v3.ts'
import { EventBusV3 } from '../src/services/eventBusV3.ts'
import { ParameterRuntimeStoreV3 } from '../src/services/parameterRuntimeV3.ts'
import { createDialogLifecyclePortV3, createPageSessionEventIntegrationV3, PageSessionRuntimeV3 } from '../src/services/pageSessionRuntimeV3.ts'
import type { InteractionActionRequestV3, ResolvedInteractionActionRequestV3 } from '../src/services/eventRuntimeTypesV3.ts'

const parameters = [{ id: 'hospital', code: 'hospital', name: 'hospital', type: 'string' as const, scope: 'application' as const, required: false, defaultValue: 'H0', source: { kind: 'static' as const, options: [] } }]
const presentation: DialogPresentationV3 = { width: 640, height: 420, minWidth: 320, minHeight: 240, maxWidth: 960, maxHeight: 720, draggable: true, resizable: true, closeOnEscape: true, closeOnBackdrop: false }
const environment = { viewport: () => ({ width: 1200, height: 800 }), protectedRegions: () => [] }

function application(): DashboardApplicationV3 {
  const app = createDefaultDashboardApplicationV3()
  app.parameters = structuredClone(parameters)
  const dialog = structuredClone(app.pages[0]); dialog.id = 'page-dialog'; dialog.code = 'dialog'; dialog.order = 2; dialog.type = 'dialog'; dialog.pageEvents = []; dialog.components = []; dialog.controls = []
  const nested = structuredClone(dialog); nested.id = 'page-nested'; nested.code = 'nested'; nested.order = 3
  const detail = structuredClone(app.pages[0]); detail.id = 'page-detail'; detail.code = 'detail'; detail.order = 4; detail.pageEvents = []
  app.pages.push(dialog, nested, detail)
  return app
}

function request(runtime: PageSessionRuntimeV3, app: DashboardApplicationV3, action: ResolvedInteractionActionRequestV3, lease = runtime.captureSessionLease()): InteractionActionRequestV3 {
  const snapshot = runtime.snapshot(); const top = snapshot.dialogs.at(-1)
  return { action, context: { transactionId: `event-${action.id}`, depth: 1, applicationId: app.id, eventBindingId: 'event', eventName: 'pageEnter', source: { kind: 'page', pageId: top?.pageId ?? snapshot.activePageId, pageType: top ? 'dialog' : 'standard' }, occurredAt: 1, payload: {} }, parameterSnapshot: {}, refreshClaimSnapshot: [], signal: new AbortController().signal, sessionLease: lease }
}

function open(id: string, pageId: string, value: JsonValueV3, custom = presentation): ResolvedInteractionActionRequestV3 {
  return { id, type: 'openDialog', pageId, presentation: custom, assignments: [{ parameterId: 'hospital', value }] }
}

test('P10.5 nested dialog stack restores parameters one atomic layer at a time', () => {
  const app = application(); const store = new ParameterRuntimeStoreV3(parameters); const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'dialog-nested', dialogEnvironment: environment })
  const lifecycle = createDialogLifecyclePortV3(runtime)
  const first = runtime.executeDialog(request(runtime, app, open('open-1', 'page-dialog', 'H1')))
  assert.equal(first.status, 'succeeded'); assert.equal(store.get('hospital'), 'H1')
  const second = runtime.executeDialog(request(runtime, app, open('open-2', 'page-nested', 'H2')))
  assert.equal(second.status, 'succeeded'); assert.equal(store.get('hospital'), 'H2'); assert.deepEqual(runtime.snapshot().dialogs.map((item) => item.pageId), ['page-dialog', 'page-nested'])
  const closeSecond = runtime.executeDialog(request(runtime, app, { id: 'close-2', type: 'closeDialog' }))
  assert.equal(closeSecond.status, 'succeeded'); assert.equal(store.get('hospital'), 'H1'); assert.equal(runtime.snapshot().dialogs.length, 1)
  lifecycle.dismiss(lifecycle.capture()!, 'button')
  assert.equal(store.get('hospital'), 'H0'); assert.deepEqual(runtime.snapshot().dialogs, [])
  assert.equal(runtime.executeDialog(request(runtime, app, { id: 'empty', type: 'closeDialog' })).status, 'skipped')
})

test('P10.5 dialog transition fails atomically for invalid target, value, environment and stale lease', () => {
  for (const mutate of [
    (runtime: PageSessionRuntimeV3, app: DashboardApplicationV3) => runtime.executeDialog(request(runtime, app, open('standard', 'page-detail', 'H1'))),
    (runtime: PageSessionRuntimeV3, app: DashboardApplicationV3) => runtime.executeDialog(request(runtime, app, open('invalid-value', 'page-dialog', 42))),
  ]) {
    const app = application(); const store = new ParameterRuntimeStoreV3(parameters); const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'atomic', dialogEnvironment: environment }); const before = runtime.snapshot()
    const result = mutate(runtime, app); assert.equal(result.status, 'failed'); assert.deepEqual(runtime.snapshot(), before); assert.equal(store.get('hospital'), 'H0')
  }
  const app = application(); const store = new ParameterRuntimeStoreV3(parameters); const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'stale', dialogEnvironment: environment })
  const lease = runtime.captureSessionLease(); runtime.clear()
  const stale = runtime.executeDialog(request(runtime, app, open('late', 'page-dialog', 'H1'), lease))
  assert.equal(stale.issue?.code, 'CANCELLED'); assert.deepEqual(runtime.snapshot().dialogs, []); assert.equal(store.get('hospital'), 'H0')
  const blocked = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'blocked', dialogEnvironment: { viewport: () => ({ width: 100, height: 100 }), protectedRegions: () => [{ x: 0, y: 0, width: 100, height: 100 }] } })
  assert.equal(blocked.executeDialog(request(blocked, app, open('blocked-open', 'page-dialog', 'H1'))).status, 'failed'); assert.deepEqual(blocked.snapshot().dialogs, [])
})

test('P10.5 geometry, close policies, navigation cleanup and snapshots remain session-only', () => {
  const app = application(); const serialized = JSON.stringify(app); const store = new ParameterRuntimeStoreV3(parameters)
  const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'geometry', dialogEnvironment: { viewport: () => ({ width: 1200, height: 800 }), protectedRegions: () => [{ x: 0, y: 0, width: 1200, height: 120 }] } })
  const lifecycle = createDialogLifecyclePortV3(runtime)
  runtime.executeDialog(request(runtime, app, open('open', 'page-dialog', 'H1')))
  const dialog = runtime.snapshot().dialogs[0]
  assert.equal(Object.isFrozen(dialog), true); assert.ok(dialog.geometry.y >= 120)
  lifecycle.move(lifecycle.capture()!, -100, -100); assert.equal(runtime.snapshot().dialogs[0].geometry.y, 120)
  lifecycle.resize(lifecycle.capture()!, 'se', 5000, -410); assert.equal(runtime.snapshot().dialogs[0].geometry.width, 960); assert.equal(runtime.snapshot().dialogs[0].geometry.height, 240)
  const unchanged = lifecycle.dismiss(lifecycle.capture()!, 'backdrop'); assert.equal(unchanged.dialogs.length, 1)
  const navigated = runtime.execute(request(runtime, app, { id: 'navigate', type: 'navigatePage', pageId: 'page-detail', history: 'push', assignments: [] }))
  assert.equal(navigated.status, 'succeeded'); assert.deepEqual(runtime.snapshot().dialogs, []); assert.equal(store.get('hospital'), 'H0'); assert.equal(JSON.stringify(app), serialized)
})

test('P10.5 dialog sessions are isolated and EventBus requires trusted provenance', async () => {
  const app = application(); const firstStore = new ParameterRuntimeStoreV3(parameters); const secondStore = new ParameterRuntimeStoreV3(parameters)
  const first = new PageSessionRuntimeV3({ application: app, parameters: firstStore, sessionId: 'first', dialogEnvironment: environment }); const second = new PageSessionRuntimeV3({ application: app, parameters: secondStore, sessionId: 'second', dialogEnvironment: environment })
  first.executeDialog(request(first, app, open('open', 'page-dialog', 'H1')))
  assert.equal(first.snapshot().dialogs.length, 1); assert.equal(second.snapshot().dialogs.length, 0); assert.equal(secondStore.get('hospital'), 'H0')

  app.pages[0].pageEvents = [{ id: 'event', enabled: true, event: 'pageEnter', actions: [{ id: 'open-event', type: 'openDialog', pageId: 'page-dialog', presentation, assignments: [{ parameterId: 'hospital', value: { kind: 'fixed', value: 'H2' } }] }] }]
  const trustedStore = new ParameterRuntimeStoreV3(parameters); const trustedRuntime = new PageSessionRuntimeV3({ application: app, parameters: trustedStore, sessionId: 'trusted', dialogEnvironment: environment })
  const trusted = new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'skipped' } } }, refresh: { async execute() { return { status: 'skipped' } } }, interaction: createPageSessionEventIntegrationV3(trustedRuntime) }, idFactory: () => 'event-dialog' })
  const result = await trusted.trigger({ application: app, source: { kind: 'page', pageId: 'page-home', pageType: 'standard' }, eventName: 'pageEnter', payload: {}, parameterSnapshot: { hospital: 'H0' } })
  assert.equal(result.status, 'completed', JSON.stringify(result)); assert.equal(trustedRuntime.snapshot().dialogs.length, 1); assert.equal(trustedStore.get('hospital'), 'H2')

  const lease = { sessionId: 'forged', epoch: 1, revision: 1 }
  const forged = new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'skipped' } } }, refresh: { async execute() { return { status: 'skipped' } } }, interaction: { captureSessionLease: () => lease, async execute() { return { status: 'succeeded', effectApplied: true } } } }, idFactory: () => 'event-forged' })
  const rejected = await forged.trigger({ application: app, source: { kind: 'page', pageId: 'page-home', pageType: 'standard' }, eventName: 'pageEnter', payload: {}, parameterSnapshot: { hospital: 'H0' } })
  assert.equal(rejected.status, 'failed'); assert.equal(rejected.issues[0]?.code, 'PORT_CONTRACT_VIOLATION')
})

test('P10.5 sealed lifecycle leases reject stale or non-top intents and close restores parameters', () => {
  const app = application(); const store = new ParameterRuntimeStoreV3(parameters); const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'lifecycle', dialogEnvironment: environment }); const lifecycle = createDialogLifecyclePortV3(runtime)
  runtime.executeDialog(request(runtime, app, open('open-1', 'page-dialog', 'H1'))); const stale = lifecycle.capture()!
  runtime.executeDialog(request(runtime, app, open('open-2', 'page-nested', 'H2')))
  assert.equal(lifecycle.dismiss(stale, 'button').dialogs.length, 2); assert.equal(store.get('hospital'), 'H2')
  runtime.close(); assert.equal(store.get('hospital'), 'H0'); assert.deepEqual(runtime.snapshot().dialogs, []); assert.equal(runtime.snapshot().closed, true)
  assert.equal(lifecycle.dismiss(stale, 'button').closed, true)
})
