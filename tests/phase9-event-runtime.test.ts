import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { createDefaultDashboardApplicationV3, type DashboardApplicationV3, type EventBindingV3, type JsonObjectV3, type JsonValueV3 } from '../src/models/dashboard-v3.ts'
import type { EventOwnerV3 } from '../src/services/eventAuthoringPolicyV3.ts'
import { resolveEventValueV3, resolveSafeJsonPointerV3 } from '../src/services/eventValueResolverV3.ts'
import { evaluateEventConditionsV3 } from '../src/services/eventConditionEvaluatorV3.ts'
import { EventBusV3 } from '../src/services/eventBusV3.ts'
import type { EmittedEventV3, EventActionPortV3, EventClockV3, EventRuntimeContextV3 } from '../src/services/eventRuntimeTypesV3.ts'
import { createRecordingEventActionPortsV3, createUnavailableEventActionPortsV3 } from '../src/services/eventActionPortsV3.ts'
import { consumeJsonStructureBudgetV3, createJsonStructureBudgetV3, safeCloneJsonValueV3 } from '../src/services/eventJsonValueV3.ts'
import { ApplicationEventSchedulerV3 } from '../src/services/eventRuntimeSchedulerV3.ts'

const pageOwner = (pageType: 'standard' | 'dialog' = 'standard'): EventOwnerV3 => ({ kind: 'page', pageId: 'page-home', pageType })
const componentOwner = (id: string): EventOwnerV3 => ({ kind: 'component', pageId: 'page-home', pageType: 'standard', componentId: id, componentType: 'bar' })
const action = (id: string) => ({ id, type: 'refresh' as const, target: { kind: 'page' as const, pageId: 'page-home' } })
const emitAction = (id: string) => ({ id, type: 'setParameter' as const, assignments: [{ parameterId: 'runtime-emission', value: { kind: 'fixed' as const, value: id } }] })
const binding = (id: string, event: 'pageEnter' | 'click', actionId = `${id}-action`): EventBindingV3 => ({ id, enabled: true, event, actions: [action(actionId)] })
function component(id: string, event?: EventBindingV3) { return { id, type: 'bar', title: id, dataConfig: { dimensions: [{ field: 'x', role: 'category' }], measures: [] }, ...(event ? { events: [event] } : {}) } as never }
function app(): DashboardApplicationV3 { const value = createDefaultDashboardApplicationV3(); value.parameters.push({ id: 'runtime-emission', code: 'runtime_emission', name: 'runtime emission', type: 'string', scope: 'application', required: false, source: { kind: 'static', options: [] } }); value.pages[0].pageEvents = [binding('root', 'pageEnter')]; return value }
function context(payload: JsonObjectV3): EventRuntimeContextV3 { return { transactionId: 'tx', depth: 1, applicationId: 'dashboard-default', eventBindingId: 'event', eventName: 'click', source: componentOwner('a'), occurredAt: 1, payload } }

test('P9.4 safe JSON Pointer supports RFC6901 and rejects prototype, getters and bad array indexes', () => {
  assert.deepEqual(resolveSafeJsonPointerV3({ datum: { 'a/b': { 'x~y': 3 } } }, '/datum/a~1b/x~0y'), { kind: 'value', value: 3 })
  assert.equal(resolveSafeJsonPointerV3({ datum: {} }, '/datum/missing').kind, 'missing')
  for (const pointer of ['/datum/__proto__', '/datum/a~2b', '/rows/01']) assert.equal(resolveSafeJsonPointerV3({ datum: {}, rows: [1] }, pointer).kind, 'error')
  const getter = Object.create(null) as Record<string, unknown>; Object.defineProperty(getter, 'x', { get: () => 1 })
  assert.equal(resolveSafeJsonPointerV3({ datum: getter }, '/datum/x').kind, 'missing')
})

test('P9.4 condition semantics are strict, deep and define empty without coercion', () => {
  const parameters = { p: { b: 2, a: 1 }, zero: 0, blank: ' ' }
  assert.equal(evaluateEventConditionsV3([{ left: { kind: 'parameter', parameterId: 'p' }, operator: 'eq', right: { kind: 'fixed', value: { a: 1, b: 2 } } }], context({ datum: {} }), parameters).matched, true)
  assert.equal(evaluateEventConditionsV3([{ left: { kind: 'fixed', value: 1 }, operator: 'eq', right: { kind: 'fixed', value: '1' } }], context({ datum: {} }), parameters).matched, false)
  assert.equal(evaluateEventConditionsV3([{ left: { kind: 'fixed', value: 2 }, operator: 'in', right: { kind: 'fixed', value: [1, 2] } }], context({ datum: {} }), parameters).matched, true)
  for (const value of [0, false, ' ', {}]) assert.equal(evaluateEventConditionsV3([{ left: { kind: 'fixed', value: value as never }, operator: 'isEmpty' }], context({ datum: {} }), parameters).matched, false)
  for (const value of [null, '', []]) assert.equal(evaluateEventConditionsV3([{ left: { kind: 'fixed', value: value as never }, operator: 'isEmpty' }], context({ datum: {} }), parameters).matched, true)
  assert.equal(evaluateEventConditionsV3([{ left: { kind: 'parameter', parameterId: 'missing' }, operator: 'notEmpty' }], context({ datum: {} }), parameters).matched, false)
})

function recordingPort(emitter?: (actionId: string) => EmittedEventV3[]): { port: EventActionPortV3; calls: string[] } {
  const calls: string[] = []
  return { calls, port: { async execute(request) { calls.push(request.action.id); if (!emitter) return { status: 'succeeded', evidence: 'recorded' }; return { status: 'succeeded', effectApplied: true, parameterCommit: { kind: 'parameterCommit', applicationId: request.context.applicationId, actionId: request.action.id, eventTransactionId: request.context.transactionId, parameterTransactionId: `parameter-${request.action.id}`, changedParameterIds: ['runtime-emission'], values: { ...request.parameterSnapshot, 'runtime-emission': request.action.id } }, emittedEvents: emitter(request.action.id), evidence: 'recorded' } } } }
}

test('P9.4 runs FIFO actions, propagates one immutable transaction id and stops after failure', async () => {
  const source = app(); source.pages[0].pageEvents[0].actions = [action('a1'), action('a2'), action('a3')]
  const calls: string[] = []; const ids: string[] = []
  const port: EventActionPortV3 = { async execute(request) { calls.push(request.action.id); ids.push(request.context.transactionId); return request.action.id === 'a2' ? { status: 'failed', issue: { code: 'ACTION_FAILED', message: 'boom' } } : { status: 'succeeded' } } }
  const result = await new EventBusV3({ ports: { refresh: port, setParameter: port }, idFactory: () => 'tx-1' }).trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.deepEqual(calls, ['a1', 'a2']); assert.deepEqual(ids, ['tx-1', 'tx-1']); assert.equal(result.partiallyApplied, true); assert.deepEqual(result.completedActionIds, ['a1'])
})

function chain(length: number, maxDepth: number) {
  const source = app(); source.runtimePolicy.maxEventDepth = maxDepth; source.pages[0].pageEvents = []
  for (let index = 0; index < length; index++) { const event = binding(`e${index}`, 'click', `a${index}`); event.actions = [emitAction(`a${index}`)]; source.pages[0].components.push(component(`c${index}`, event)) }
  const rec = recordingPort((id) => { const next = Number(id.slice(1)) + 1; return next < length ? [{ source: componentOwner(`c${next}`), eventName: 'click', payload: { datum: { x: next } } }] : [] })
  return { source, rec }
}

test('P9.4 depth boundaries 1, 10 and 100 are exact and nested overflow fails before enqueue', async () => {
  for (const max of [1, 10, 100]) {
    const { source, rec } = chain(max, max)
    const ok = await new EventBusV3({ ports: { refresh: rec.port, setParameter: rec.port }, idFactory: () => `tx-${max}` }).trigger({ application: source, source: componentOwner('c0'), eventName: 'click', payload: { datum: { x: 0 } } })
    assert.equal(ok.status, 'completed'); assert.equal(rec.calls.length, max)
  }
  for (const max of [1, 10, 100]) {
    const { source, rec } = chain(max + 1, max)
    const failed = await new EventBusV3({ ports: { refresh: rec.port, setParameter: rec.port } }).trigger({ application: source, source: componentOwner('c0'), eventName: 'click', payload: { datum: { x: 0 } } })
    assert.equal(failed.issues[0].code, 'MAX_EVENT_DEPTH_EXCEEDED'); assert.equal(rec.calls.length, max)
  }
})

test('P9.4 detects self, two-node and diamond revisits with event keys', async () => {
  for (const edges of [
    { a0: ['c0'] },
    { a0: ['c1'], a1: ['c0'] },
    { a0: ['c1', 'c2'], a1: ['c3'], a2: ['c3'] },
  ] as Array<Record<string, string[]>>) {
    const ids = [...new Set(['c0', ...Object.values(edges).flat()])]
    const source = app(); source.pages[0].pageEvents = []; source.runtimePolicy.maxEventDepth = 100
    ids.forEach((id) => { const event = binding(`e${id.slice(1)}`, 'click', `a${id.slice(1)}`); event.actions = [emitAction(`a${id.slice(1)}`)]; source.pages[0].components.push(component(id, event)) })
    const rec = recordingPort((id) => (edges[id] ?? []).map((target) => ({ source: componentOwner(target), eventName: 'click', payload: { datum: { x: 1 } } })))
    const result = await new EventBusV3({ ports: { refresh: rec.port, setParameter: rec.port } }).trigger({ application: source, source: componentOwner('c0'), eventName: 'click', payload: { datum: { x: 0 } } })
    assert.equal(result.issues[0].code, 'EVENT_LOOP_DETECTED')
  }
})

class FakeClock implements EventClockV3 {
  time = 0; tasks: Array<{ at: number; callback: () => void; cancelled: boolean }> = []
  now() { return this.time }
  setTimeout(callback: () => void, delay: number) { const task = { at: this.time + delay, callback, cancelled: false }; this.tasks.push(task); return task }
  clearTimeout(handle: unknown) { (handle as { cancelled: boolean }).cancelled = true }
  tick(ms: number) { this.time += ms; for (const task of this.tasks.filter((item) => !item.cancelled && item.at <= this.time)) { task.cancelled = true; task.callback() } }
}

test('P9.4 debounce is trailing last-call-wins and superseded promises settle without sleep', async () => {
  const source = app(); source.pages[0].pageEvents[0].debounceMs = 50
  const clock = new FakeClock(); const rec = recordingPort(); let id = 0
  const bus = new EventBusV3({ clock, ports: { refresh: rec.port, setParameter: rec.port }, idFactory: () => `tx-${++id}` })
  const first = bus.trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  const second = bus.trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.equal((await first).status, 'superseded'); clock.tick(50); assert.equal((await second).status, 'completed'); assert.equal(rec.calls.length, 1)
  const controller = new AbortController()
  const cancelled = bus.trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {}, signal: controller.signal })
  controller.abort()
  assert.equal((await cancelled).issues[0].code, 'CANCELLED')
})

test('P9.4 fails closed for disabled, dialog, duplicate and unavailable executors without Phase8 side effects', async () => {
  const disabled = app(); disabled.pages[0].pageEvents[0].enabled = false
  assert.equal((await new EventBusV3().trigger({ application: disabled, source: pageOwner(), eventName: 'pageEnter', payload: {} })).status, 'skipped')
  const dialog = app(); dialog.pages[0].type = 'dialog'
  assert.equal((await new EventBusV3().trigger({ application: dialog, source: pageOwner(), eventName: 'pageEnter', payload: {} })).status, 'failed')
  const duplicate = app(); duplicate.pages[0].pageEvents.push(binding('duplicate', 'pageEnter'))
  assert.equal((await new EventBusV3().trigger({ application: duplicate, source: pageOwner(), eventName: 'pageEnter', payload: {} })).status, 'failed')
  const unavailable = await new EventBusV3().trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.equal(unavailable.issues[0].code, 'EXECUTOR_UNAVAILABLE')
  assert.equal(JSON.stringify(app()).includes('transactionId'), false)
})

test('P9.4 enforces fixed event and action budgets', async () => {
  const eventHeavy = app(); eventHeavy.runtimePolicy.maxEventDepth = 100
  eventHeavy.pages[0].pageEvents[0].actions = [emitAction('root-action')]
  for (let index = 0; index < 999; index++) { const event = binding(`budget-event-${index}`, 'click', `budget-action-${index}`); event.actions = [emitAction(`budget-action-${index}`)]; eventHeavy.pages[0].components.push(component(`budget-${index}`, event)) }
  const eventPort = recordingPort((id) => id === 'root-action'
    ? eventHeavy.pages[0].components.map((item) => ({ source: componentOwner(item.id), eventName: 'click', payload: { datum: { x: 1 } } }))
    : [])
  const exactEvent = await new EventBusV3({ ports: { refresh: eventPort.port, setParameter: eventPort.port } }).trigger({ application: eventHeavy, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.equal(exactEvent.status, 'completed')
  for (let index = 999; index < 1000; index++) { const event = binding(`budget-event-${index}`, 'click', `budget-action-${index}`); event.actions = [emitAction(`budget-action-${index}`)]; eventHeavy.pages[0].components.push(component(`budget-${index}`, event)) }
  const eventResult = await new EventBusV3({ ports: { refresh: eventPort.port, setParameter: eventPort.port } }).trigger({ application: eventHeavy, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.equal(eventResult.issues[0].code, 'EVENT_BUDGET_EXCEEDED'); assert.equal(eventPort.calls.length, 1001)

  const exactActions = app(); exactActions.pages[0].pageEvents[0].actions = Array.from({ length: 10000 }, (_, index) => action(`exact-${index}`))
  const exactPort = recordingPort()
  assert.equal((await new EventBusV3({ ports: { refresh: exactPort.port, setParameter: exactPort.port } }).trigger({ application: exactActions, source: pageOwner(), eventName: 'pageEnter', payload: {} })).status, 'completed')
  const actionHeavy = app(); actionHeavy.pages[0].pageEvents[0].actions = Array.from({ length: 10001 }, (_, index) => action(`many-${index}`))
  const actionPort = recordingPort()
  const actionResult = await new EventBusV3({ ports: { refresh: actionPort.port, setParameter: actionPort.port } }).trigger({ application: actionHeavy, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.equal(actionResult.issues[0].code, 'ACTION_BUDGET_EXCEEDED'); assert.equal(actionPort.calls.length, 10000)
})

test('P9.4 serializes roots per application, allows cross-application concurrency and cancelAll reaches queued work', async () => {
  const started: string[] = []; const releases: Array<() => void> = []
  const port: EventActionPortV3 = { execute: (request) => new Promise((resolve) => { started.push(request.context.applicationId); releases.push(() => resolve({ status: 'succeeded' })) }) }
  const bus = new EventBusV3({ ports: { refresh: port, setParameter: port } })
  const firstApp = app(); const secondApp = app(); secondApp.id = 'other-app'
  const first = bus.trigger({ application: firstApp, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  const queued = bus.trigger({ application: firstApp, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  const parallel = bus.trigger({ application: secondApp, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  await Promise.resolve(); await Promise.resolve()
  assert.deepEqual(started.sort(), ['dashboard-default', 'other-app'])
  bus.cancelAll()
  const afterCancel = bus.trigger({ application: firstApp, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  await Promise.resolve(); await Promise.resolve(); assert.equal(started.length, 2)
  const firstCancelled = await first
  assert.equal(firstCancelled.issues[0].code, 'CANCELLED'); assert.equal(firstCancelled.partiallyApplied, true); assert.deepEqual(firstCancelled.attemptedActionIds, ['root-action'])
  assert.equal((await queued).issues[0].code, 'CANCELLED')
  assert.equal((await parallel).issues[0].code, 'CANCELLED')
  releases.slice(0, 2).forEach((release) => release()); await new Promise<void>((resolve) => setImmediate(resolve))
  assert.equal(started.length, 3); releases[2](); assert.equal((await afterCancel).status, 'completed')
  await Promise.resolve(); assert.equal(bus.getLateAudits().filter((item) => item.unknownSideEffect).length, 2)
})

test('P9.4 trigger rejects hostile JSON inputs without invoking getter or toJSON and snapshots before async work', async () => {
  let getterCalls = 0; let toJsonCalls = 0
  const hostile = {} as JsonObjectV3
  Object.defineProperty(hostile, 'datum', { enumerable: true, get() { getterCalls++; return {} } })
  assert.equal((await new EventBusV3().trigger({ application: app(), source: componentOwner('missing'), eventName: 'click', payload: hostile })).issues[0].code, 'INVALID_INPUT')
  const withToJson = { toJSON() { toJsonCalls++; return {} } } as never
  assert.equal((await new EventBusV3().trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {}, parameterSnapshot: { bad: withToJson } })).issues[0].code, 'INVALID_INPUT')
  const cycle: Record<string, unknown> = {}; cycle.self = cycle
  assert.equal((await new EventBusV3().trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {}, parameterSnapshot: cycle as never })).issues[0].code, 'INVALID_INPUT')
  assert.equal(getterCalls, 0); assert.equal(toJsonCalls, 0)

  const source = app(); source.pages[0].pageEvents[0].debounceMs = 5
  const clock = new FakeClock(); const rec = recordingPort(); const bus = new EventBusV3({ clock, ports: { refresh: rec.port, setParameter: rec.port } })
  const pending = bus.trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  source.pages[0].pageEvents[0].enabled = false; source.pages[0].pageEvents[0].actions.length = 0
  clock.tick(5); assert.equal((await pending).status, 'completed'); assert.deepEqual(rec.calls, ['root-action'])
})

test('P9.4 resolves eventField and parameters before typed ports and keeps actions strictly serial', async () => {
  const source = app(); source.parameters.push({ id: 'p', code: 'p', name: 'p', type: 'number', scope: 'application', required: false, source: { kind: 'static', options: [] } })
  source.pages[0].pageEvents = []
  const event = binding('click-resolve', 'click', 'set')
  event.conditions = [
    { left: { kind: 'eventField', path: '/datum/x' }, operator: 'ne', right: { kind: 'fixed', value: 1 } },
    { left: { kind: 'eventField', path: '/datum/x' }, operator: 'notIn', right: { kind: 'fixed', value: [1, 2] } },
  ]
  event.actions = [
    { id: 'set', type: 'setParameter', assignments: [{ parameterId: 'p', value: { kind: 'eventField', path: '/datum/x' } }] }, action('after'),
  ]
  source.pages[0].components.push(component('resolver', event))
  let release!: () => void; const starts: string[] = []
  const recording = createRecordingEventActionPortsV3(async (request) => {
    starts.push(request.action.id)
    if (request.action.id === 'set') await new Promise<void>((resolve) => { release = resolve })
    return { status: 'succeeded' }
  })
  const promise = new EventBusV3({ ports: recording.ports, idFactory: () => 'nested-root' }).trigger({ application: source, source: componentOwner('resolver'), eventName: 'click', payload: { datum: { x: 3 } }, parameterSnapshot: { p: 0 } })
  await Promise.resolve(); await Promise.resolve(); assert.deepEqual(starts, ['set'])
  const resolved = recording.requests[0].action
  assert.equal(resolved.type, 'setParameter'); assert.deepEqual(resolved.type === 'setParameter' ? resolved.assignments[0].value : null, 3)
  release(); assert.equal((await promise).status, 'completed'); assert.deepEqual(starts, ['set', 'after'])
})

test('P9.4 emitted batches validate atomically before traversal and enforce port contract', async () => {
  const emittingSource = app(); emittingSource.pages[0].pageEvents[0].actions = [emitAction('root-action')]
  const huge = new Array(100_000_000) as EmittedEventV3[]
  const hugePort = recordingPort(() => huge).port
  const hugeResult = await new EventBusV3({ ports: { refresh: hugePort, setParameter: hugePort } }).trigger({ application: emittingSource, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.equal(hugeResult.issues[0].code, 'EVENT_BUDGET_EXCEEDED'); assert.equal(hugeResult.completedActionIds.length, 1)
  const badPort: EventActionPortV3 = { async execute() { return { status: 'skipped', emittedEvents: [] } } }
  assert.equal((await new EventBusV3({ ports: { refresh: badPort, setParameter: badPort } }).trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {} })).issues[0].code, 'PORT_CONTRACT_VIOLATION')
  const invalidBatches: unknown[] = []
  const extra = [] as unknown as Record<PropertyKey, unknown>; extra.extra = true; invalidBatches.push(extra)
  const symbol = [] as unknown as Record<PropertyKey, unknown>; symbol[Symbol('extra')] = true; invalidBatches.push(symbol)
  const accessor: unknown[] = []; Object.defineProperty(accessor, '0', { enumerable: true, get: () => ({}) }); invalidBatches.push(accessor)
  for (const emittedEvents of invalidBatches) {
    const port = recordingPort(() => emittedEvents as EmittedEventV3[]).port
    const result = await new EventBusV3({ ports: { refresh: port, setParameter: port } }).trigger({ application: emittingSource, source: pageOwner(), eventName: 'pageEnter', payload: {} })
    assert.equal(result.issues[0].code, 'PORT_CONTRACT_VIOLATION')
  }
})

test('P9.4 official port factories stay isolated and unavailable remains fail closed', async () => {
  const source = app(); const before = structuredClone(source)
  const recording = createRecordingEventActionPortsV3()
  assert.equal((await new EventBusV3({ ports: recording.ports }).trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} })).status, 'completed')
  assert.equal(recording.requests.length, 1)
  assert.deepEqual(source, before); assert.equal(/transactionId|attemptedActionIds|trace/.test(JSON.stringify(source)), false)
  assert.equal((await new EventBusV3({ ports: createUnavailableEventActionPortsV3() }).trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {} })).issues[0].code, 'EXECUTOR_UNAVAILABLE')
})

test('P9.4 nested events inherit transaction while independent roots isolate ids and visited state', async () => {
  const source = app(); source.pages[0].pageEvents = []
  const firstEvent = binding('ne0', 'click', 'na0'); firstEvent.actions = [emitAction('na0')]; const secondEvent = binding('ne1', 'click', 'na1'); secondEvent.actions = [emitAction('na1')]
  source.pages[0].components.push(component('n0', firstEvent), component('n1', secondEvent))
  const rec = recordingPort((id) => id === 'na0' ? [{ source: componentOwner('n1'), eventName: 'click', payload: { datum: { x: 1 } } }] : []); const ids: string[] = []; const port: EventActionPortV3 = { async execute(request) { ids.push(request.context.transactionId); return rec.port.execute(request as never) } }
  let sequence = 0; const bus = new EventBusV3({ ports: { refresh: port, setParameter: port }, idFactory: () => `root-${++sequence}` })
  assert.equal((await bus.trigger({ application: source, source: componentOwner('n0'), eventName: 'click', payload: { datum: { x: 0 } } })).status, 'completed')
  assert.equal((await bus.trigger({ application: source, source: componentOwner('n0'), eventName: 'click', payload: { datum: { x: 0 } } })).status, 'completed')
  assert.deepEqual(ids, ['root-1', 'root-1', 'root-2', 'root-2'])
})

test('P9.4 debounceMs zero is immediate and over-policy bindings fail closed', async () => {
  const source = app(); source.pages[0].pageEvents[0].debounceMs = 0
  const rec = recordingPort(); let id = 0; const bus = new EventBusV3({ ports: { refresh: rec.port, setParameter: rec.port }, idFactory: () => `zero-${++id}` })
  const results = await Promise.all([bus.trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} }), bus.trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} })])
  assert.deepEqual(results.map((item) => item.status), ['completed', 'completed']); assert.deepEqual(results.map((item) => item.transactionId), ['zero-1', 'zero-2'])
  const legacy = app(); legacy.pages[0].pageEvents[0].conditions = [{ left: { kind: 'eventField', path: '/bad' }, operator: 'isEmpty' }]
  assert.equal((await new EventBusV3().trigger({ application: legacy, source: pageOwner(), eventName: 'pageEnter', payload: {} })).issues[0].code, 'INVALID_EVENT')
})

test('P9.4 unified JSON structure budgets reject deep, wide, dense and oversized application inputs', async () => {
  const limits = { maxTotalNodes: 20, maxDepth: 3, maxObjectKeys: 3, maxArrayLength: 4 }
  assert.equal(safeCloneJsonValueV3([1, 2, 3, 4, 5], limits).ok, false)
  assert.equal(safeCloneJsonValueV3({ a: 1, b: 2, c: 3, d: 4 }, limits).ok, false)
  assert.equal(safeCloneJsonValueV3([[[[1]]]], limits).ok, false)
  assert.equal(safeCloneJsonValueV3([[1, 2, 3], [4, 5, 6], [7, 8, 9]], { ...limits, maxArrayLength: 10, maxTotalNodes: 10 }).ok, false)
  const oversized = app(); oversized.pages[0].pageEvents[0].actions = Array.from({ length: 20_001 }, (_, index) => action(`oversized-${index}`))
  const result = await new EventBusV3().trigger({ application: oversized, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.equal(result.issues[0].code, 'STRUCTURE_BUDGET_EXCEEDED')
})

test('P9.4 pre-aborted and Proxy trap inputs settle structurally with zero port calls', async () => {
  const rec = recordingPort(); const controller = new AbortController(); controller.abort()
  const pre = await new EventBusV3({ ports: { refresh: rec.port, setParameter: rec.port } }).trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {}, signal: controller.signal })
  assert.equal(pre.status, 'cancelled'); assert.equal(rec.calls.length, 0)
  const proxy = new Proxy(app(), { getPrototypeOf() { throw new Error('proxy trap') } })
  let promise: Promise<unknown> | undefined
  assert.doesNotThrow(() => { promise = new EventBusV3().trigger({ application: proxy, source: pageOwner(), eventName: 'pageEnter', payload: {} }) })
  assert.equal(((await promise) as { issues: Array<{ code: string }> }).issues[0].code, 'INVALID_INPUT')
})

test('P9.4 late audit records actual succeeded failed and skipped results without rewriting cancelled result', async () => {
  for (const actual of ['succeeded', 'failed', 'skipped'] as const) {
    let release!: (result: never) => void; let started!: () => void
    const ready = new Promise<void>((resolve) => { started = resolve })
    const port: EventActionPortV3 = { execute: () => new Promise((resolve) => { release = resolve as never; started() }) }
    const controller = new AbortController(); const bus = new EventBusV3({ ports: { refresh: port as never, setParameter: port as never }, idFactory: () => `late-${actual}` })
    const pending = bus.trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {}, signal: controller.signal })
    await ready; controller.abort(); const terminal = await pending
    assert.equal(terminal.status, 'cancelled'); assert.equal(terminal.partiallyApplied, true)
    const response = actual === 'failed'
      ? { status: actual, issue: { code: 'ACTION_FAILED' as const, message: 'late failed' }, evidence: actual }
      : { status: actual, evidence: actual }
    release(response as never); await new Promise<void>((resolve) => setImmediate(resolve))
    const audit = bus.getLateAudits()[0]
    assert.deepEqual({ id: audit.actionId, port: audit.portType, status: audit.actualStatus, evidence: audit.evidence, cancelled: audit.cancellationRequested }, { id: 'root-action', port: 'refresh', status: actual, evidence: actual, cancelled: true })
    assert.equal(terminal.status, 'cancelled')
  }
})

test('P9.4 executor sync throw, rejection and clock throw never escape or hang', async () => {
  const sync: EventActionPortV3 = { execute() { throw new Error('sync boom') } }
  const rejected: EventActionPortV3 = { async execute() { throw new Error('reject boom') } }
  for (const port of [sync, rejected]) {
    let resultPromise: Promise<unknown> | undefined
    assert.doesNotThrow(() => { resultPromise = new EventBusV3({ ports: { refresh: port as never, setParameter: port as never } }).trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {} }) })
    assert.equal(((await resultPromise) as { status: string }).status, 'failed')
  }
  const debounced = app(); debounced.pages[0].pageEvents[0].debounceMs = 5
  const throwingClock: EventClockV3 = { now: () => 0, setTimeout() { throw new Error('clock boom') }, clearTimeout() {} }
  assert.equal((await new EventBusV3({ clock: throwingClock }).trigger({ application: debounced, source: pageOwner(), eventName: 'pageEnter', payload: {} })).status, 'failed')
})

test('P9.4 missing/error eventField short-circuits before ports and Phase8 side-effect sentinels remain untouched', async () => {
  const hostileDatum = new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('eventField descriptor trap') } })
  const evaluatorError = evaluateEventConditionsV3([{ left: { kind: 'eventField', path: '/datum/x' }, operator: 'eq', right: { kind: 'fixed', value: 1 } }], context({ datum: hostileDatum as never }), {})
  assert.match(evaluatorError.error ?? '', /descriptor trap/)
  const source = app(); source.pages[0].pageEvents = []
  const event = binding('missing-value', 'click', 'set-missing')
  event.actions = [{ id: 'set-missing', type: 'setParameter', assignments: [{ parameterId: 'missing', value: { kind: 'eventField', path: '/datum/x' } }] }]
  source.parameters.push({ id: 'missing', code: 'missing', name: 'missing', type: 'number', scope: 'application', required: false, source: { kind: 'static', options: [] } })
  source.pages[0].components.push(component('missing-component', event))
  const rec = recordingPort(); let fetchCalls = 0; const originalFetch = globalThis.fetch
  globalThis.fetch = (() => { fetchCalls++; throw new Error('Phase8 side effect called') }) as typeof fetch
  try {
    const result = await new EventBusV3({ ports: { refresh: rec.port, setParameter: rec.port } }).trigger({ application: source, source: componentOwner('missing-component'), eventName: 'click', payload: { datum: {} } })
    assert.equal(result.status, 'failed'); assert.equal(rec.calls.length, 0); assert.equal(fetchCalls, 0)
    const defaultResult = await new EventBusV3().trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {} })
    assert.equal(defaultResult.issues[0].code, 'EXECUTOR_UNAVAILABLE'); assert.equal(fetchCalls, 0)
  } finally { globalThis.fetch = originalFetch }
  const sourceText = readFileSync(new URL('../src/services/eventBusV3.ts', import.meta.url), 'utf8')
  assert.equal(/parameterRuntime|parameterRefresh|queryRuntime|fetch\s*\(/.test(sourceText), false)
})

test('P9.4 transaction JSON budget is cumulative and parameterSnapshot shares the public trigger gate', async () => {
  const source = app(); source.pages[0].pageEvents[0].actions = [action('budget-a'), action('budget-b'), action('budget-c')]
  const measure = createJsonStructureBudgetV3()
  for (const value of [source, pageOwner(), {}, {}]) assert.equal(safeCloneJsonValueV3(value, measure).ok, true)
  const rec = createRecordingEventActionPortsV3(() => ({ status: 'succeeded', evidence: { nested: [1] } }))
  const cumulative = await new EventBusV3({ ports: rec.ports, structureLimits: { ...measure.limits, maxTotalNodes: measure.nodesUsed + 5 } }).trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.equal(cumulative.issues[0].code, 'STRUCTURE_BUDGET_EXCEEDED'); assert.equal(cumulative.partiallyApplied, true); assert.deepEqual(cumulative.completedActionIds, ['budget-a', 'budget-b']); assert.equal(rec.requests.length, 2)

  const base = createJsonStructureBudgetV3()
  for (const value of [app(), pageOwner(), {}]) assert.equal(safeCloneJsonValueV3(value, base).ok, true)
  const noCalls = recordingPort()
  const parameterResult = await new EventBusV3({ ports: { refresh: noCalls.port, setParameter: noCalls.port }, structureLimits: { ...base.limits, maxTotalNodes: base.nodesUsed + 2 } }).trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {}, parameterSnapshot: { huge: [1, 2, 3] } })
  assert.equal(parameterResult.issues[0].code, 'STRUCTURE_BUDGET_EXCEEDED'); assert.equal(noCalls.calls.length, 0)
})

test('P9.4 hostile thrown values are formatted without coercion in trigger and evaluator paths', async () => {
  let coerced = false
  const hostileProxy = new Proxy({}, { getOwnPropertyDescriptor() { throw Symbol('descriptor') } })
  const values: unknown[] = [hostileProxy, Symbol('boom'), {}, { [Symbol.toPrimitive]() { coerced = true; throw new Error('coercion') } }]
  for (const thrown of values) {
    const port: EventActionPortV3 = { execute() { throw thrown } }
    let pending: Promise<unknown> | undefined
    assert.doesNotThrow(() => { pending = new EventBusV3({ ports: { refresh: port as never, setParameter: port as never } }).trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {} }) })
    assert.equal(((await pending) as { status: string }).status, 'failed')
    const datum = new Proxy({}, { getOwnPropertyDescriptor() { throw thrown } })
    assert.doesNotThrow(() => evaluateEventConditionsV3([{ left: { kind: 'eventField', path: '/datum/x' }, operator: 'eq', right: { kind: 'fixed', value: 1 } }], context({ datum: datum as never }), {}))
  }
  assert.equal(coerced, false)
})

test('P9.4 completion boundary wins over late cancellation and remains auditable', async () => {
  const scheduler = new ApplicationEventSchedulerV3(); const controller = new AbortController(); let release!: () => void
  const gate = new Promise<void>((resolve) => { release = resolve })
  const completed = { status: 'completed', marker: '' }
  const pending = scheduler.schedule('app', async (_signal, effectsFinished) => { effectsFinished(completed); await gate; return completed }, () => ({ status: 'cancelled', marker: '' }), () => ({ status: 'failed', marker: '' }), undefined, controller.signal, (value) => ({ ...value, marker: 'cancellation-too-late' }))
  controller.abort(); assert.deepEqual(await pending, { status: 'completed', marker: 'cancellation-too-late' }); release(); await Promise.resolve()
})

test('P9.4 late rejection and evidence audits are isolated, frozen and tolerate a throwing late clock', async () => {
  let reject!: (reason: unknown) => void; let started!: () => void; let nowCalls = 0
  const ready = new Promise<void>((resolve) => { started = resolve })
  const clock: EventClockV3 = { now() { if (nowCalls++ === 0) return 7; throw new Error('late clock') }, setTimeout: (callback) => callback, clearTimeout() {} }
  const port: EventActionPortV3 = { execute: () => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; started() }) }
  const controller = new AbortController(); const bus = new EventBusV3({ clock, ports: { refresh: port as never, setParameter: port as never } })
  const pending = bus.trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {}, signal: controller.signal })
  await ready; controller.abort(); const terminal = await pending; reject({ [Symbol.toPrimitive]() { throw new Error('never coerce') } }); await new Promise<void>((resolve) => setImmediate(resolve))
  const audit = bus.getLateAudits()[0]
  assert.equal(terminal.status, 'cancelled'); assert.equal(terminal.partiallyApplied, true); assert.equal(audit.actualStatus, 'rejected'); assert.equal(audit.code, 'ACTION_FAILED'); assert.equal(audit.completedAt, 0); assert.equal(Object.isFrozen(audit), true)

  let release!: (value: never) => void; let began!: () => void
  const begun = new Promise<void>((resolve) => { began = resolve })
  const evidencePort: EventActionPortV3 = { execute: () => new Promise((resolve) => { release = resolve as never; began() }) }
  const evidenceController = new AbortController(); const evidenceBus = new EventBusV3({ ports: { refresh: evidencePort as never, setParameter: evidencePort as never } })
  const evidencePending = evidenceBus.trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {}, signal: evidenceController.signal })
  await begun; evidenceController.abort(); await evidencePending; release({ status: 'succeeded', evidence: { nested: [1] } } as never); await new Promise<void>((resolve) => setImmediate(resolve))
  const first = evidenceBus.getLateAudits(); assert.equal(Object.isFrozen(first[0].evidence), true); assert.throws(() => { (first[0].evidence as { nested: number[] }).nested[0] = 9 })
  assert.deepEqual(evidenceBus.getLateAudits()[0].evidence, { nested: [1] })
})

test('P9.4 invalid port status, throwing clearTimeout and public result mutation fail safely', async () => {
  const invalid: EventActionPortV3 = { async execute() { return { status: 'invalid' as never } } }
  const invalidResult = await new EventBusV3({ ports: { refresh: invalid as never, setParameter: invalid as never } }).trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.equal(invalidResult.issues[0].code, 'PORT_CONTRACT_VIOLATION')

  const source = app(); source.pages[0].pageEvents[0].debounceMs = 5; const callbacks: Array<() => void> = []; const rec = recordingPort()
  const clock: EventClockV3 = { now: () => 1, setTimeout(callback) { callbacks.push(callback); return callback }, clearTimeout() { throw new Error('clear failed') } }
  const bus = new EventBusV3({ clock, ports: { refresh: rec.port, setParameter: rec.port } })
  const first = bus.trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} }); const second = bus.trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.equal((await first).status, 'superseded'); callbacks[1](); assert.equal((await second).status, 'completed'); callbacks[0](); await Promise.resolve(); assert.equal(rec.calls.length, 1)

  const evidencePort: EventActionPortV3 = { async execute() { return { status: 'succeeded', evidence: { nested: [1] } } } }
  const immutable = await new EventBusV3({ ports: { refresh: evidencePort as never, setParameter: evidencePort as never } }).trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {} })
  const evidenceTrace = immutable.trace.find((item) => item.evidence !== undefined)!; assert.equal(Object.isFrozen(immutable), true); assert.equal(Object.isFrozen(immutable.trace), true); assert.throws(() => { (evidenceTrace.evidence as { nested: number[] }).nested[0] = 2 })
})

test('P9.4 emitted over remaining budget reads length before ownKeys', async () => {
  let ownKeysCalls = 0
  const dense = Array.from({ length: 1000 }, () => ({ source: pageOwner(), eventName: 'pageEnter' as const, payload: {} }))
  const emitted = new Proxy(dense, { ownKeys(target) { ownKeysCalls++; return Reflect.ownKeys(target) } })
  const port = recordingPort(() => emitted).port; const source = app(); source.pages[0].pageEvents[0].actions = [emitAction('root-action')]
  const result = await new EventBusV3({ ports: { refresh: port as never, setParameter: port as never } }).trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.equal(result.issues[0].code, 'EVENT_BUDGET_EXCEEDED'); assert.equal(ownKeysCalls, 0); assert.deepEqual(result.completedActionIds, ['root-action'])
})

test('P9.4 real outcomes survive invalid normal and late evidence', async () => {
  const invalidEvidence: EventActionPortV3 = { async execute() { return { status: 'succeeded', evidence: (() => 1) as never } } }
  const failed = await new EventBusV3({ ports: { refresh: invalidEvidence as never, setParameter: invalidEvidence as never } }).trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {} })
  const succeededOutcome = failed.trace.find((item) => item.kind === 'actionOutcome')!; const invalidDetail = failed.trace.find((item) => item.kind === 'actionDetail')!
  assert.equal(failed.status, 'failed'); assert.equal(failed.partiallyApplied, true); assert.deepEqual(failed.completedActionIds, ['root-action']); assert.equal(failed.issues[0].code, 'PORT_CONTRACT_VIOLATION'); assert.equal(succeededOutcome.status, 'succeeded'); assert.equal(invalidDetail.detailStatus, 'invalid')
  const accessorResult = { status: 'succeeded' }; Object.defineProperty(accessorResult, 'evidence', { get() { throw new Error('evidence getter') } })
  const accessorPort: EventActionPortV3 = { async execute() { return accessorResult as never } }
  const accessorFailure = await new EventBusV3({ ports: { refresh: accessorPort as never, setParameter: accessorPort as never } }).trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.deepEqual(accessorFailure.completedActionIds, ['root-action']); assert.equal(accessorFailure.partiallyApplied, true)

  for (const actualStatus of ['succeeded', 'failed', 'skipped'] as const) {
    let release!: (value: never) => void; let began!: () => void
    const ready = new Promise<void>((resolve) => { began = resolve })
    const port: EventActionPortV3 = { execute: () => new Promise((resolve) => { release = resolve as never; began() }) }
    const controller = new AbortController(); const bus = new EventBusV3({ ports: { refresh: port as never, setParameter: port as never } })
    const pending = bus.trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {}, signal: controller.signal })
    await ready; controller.abort(); assert.equal((await pending).status, 'cancelled')
    release({ status: actualStatus, ...(actualStatus === 'failed' ? { issue: { code: 'ACTION_FAILED', message: 'failed' } } : {}), evidence: (() => 1) as never } as never); await new Promise<void>((resolve) => setImmediate(resolve))
    const audit = bus.getLateAudits()[0]
    assert.equal(audit.actualStatus, actualStatus); assert.equal(audit.evidenceStatus, 'invalid'); assert.match(audit.evidenceError ?? '', /不是 JSON 值/)
  }
})

test('P9.4 trusted frozen parameter provenance is reused across actions without budget recharge', async () => {
  const source = app(); source.parameters.push({ id: 'shared', code: 'shared', name: 'shared', type: 'multiSelect', scope: 'application', required: false, source: { kind: 'static', options: [] } })
  source.pages[0].pageEvents[0].actions = Array.from({ length: 5 }, (_, index) => ({ id: `shared-${index}`, type: 'setParameter' as const, assignments: [{ parameterId: 'shared', value: { kind: 'parameter' as const, parameterId: 'shared' } }] }))
  const parameterSnapshot = { shared: Array.from({ length: 500 }, (_, index) => `value-${index}`) }
  const measure = createJsonStructureBudgetV3(); for (const value of [source, pageOwner(), {}, parameterSnapshot]) assert.equal(safeCloneJsonValueV3(value, measure).ok, true)
  const rec = createRecordingEventActionPortsV3()
  const result = await new EventBusV3({ ports: rec.ports, structureLimits: { ...measure.limits, maxTotalNodes: measure.nodesUsed + 15 } }).trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {}, parameterSnapshot })
  assert.equal(result.status, 'completed'); assert.equal(rec.requests.length, 5); assert.equal((rec.requests[0].action.type === 'setParameter' ? rec.requests[0].action.assignments[0].value : null), (rec.requests[4].action.type === 'setParameter' ? rec.requests[4].action.assignments[0].value : null))
  const fake = { limits: measure.limits, nodesUsed: 0 }; assert.equal(consumeJsonStructureBudgetV3(fake as never, 1, 'fake').code, 'INVALID_INPUT'); assert.equal(Object.isFrozen(measure), true); assert.equal(Object.isFrozen(measure.limits), true); assert.throws(() => Object.defineProperty(measure, 'nodesUsed', { value: -1 }))
})

test('P9.4 debounce supports synchronous clock callbacks without hanging', async () => {
  const source = app(); source.pages[0].pageEvents[0].debounceMs = 1; const rec = recordingPort(); let callbacks = 0
  const clock: EventClockV3 = { now: () => 1, setTimeout(callback) { callbacks++; callback(); return { handle: callbacks } }, clearTimeout() { throw new Error('clear should not affect settlement') } }
  const result = await new EventBusV3({ clock, ports: { refresh: rec.port, setParameter: rec.port } }).trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} })
  assert.equal(result.status, 'completed'); assert.equal(callbacks, 1); assert.equal(rec.calls.length, 1)
})

test('P9.4 late audit storage is bounded and reports oldest eviction', async () => {
  let currentController!: AbortController
  const port: EventActionPortV3 = { execute() { currentController.abort(); return Promise.resolve({ status: 'skipped' }) } }
  let sequence = 0; const bus = new EventBusV3({ ports: { refresh: port as never, setParameter: port as never }, idFactory: () => `audit-${++sequence}` })
  for (let index = 0; index < 1001; index++) {
    currentController = new AbortController()
    await bus.trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {}, signal: currentController.signal })
  }
  await new Promise<void>((resolve) => setImmediate(resolve))
  const audits = bus.getLateAudits(); assert.equal(audits.length, 1000); assert.equal(bus.getLateAuditDroppedCount(), 1); assert.equal(audits[0].transactionId, 'audit-2'); assert.equal(audits[999].transactionId, 'audit-1001')
})

test('P9.4 invalid structure limits fail publicly before any port call', async () => {
  const valid = { maxTotalNodes: 200_000, maxDepth: 128, maxObjectKeys: 20_000, maxArrayLength: 20_000 }
  const invalid: unknown[] = []
  for (const field of Object.keys(valid) as Array<keyof typeof valid>) { const missing = { ...valid } as Partial<typeof valid>; delete missing[field]; invalid.push(missing) }
  for (const field of Object.keys(valid) as Array<keyof typeof valid>) for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5, Number.MAX_SAFE_INTEGER + 1]) invalid.push({ ...valid, [field]: value })
  for (const structureLimits of invalid) {
    const rec = recordingPort(); const result = await new EventBusV3({ ports: { refresh: rec.port, setParameter: rec.port }, structureLimits: structureLimits as never }).trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {} })
    assert.equal(result.issues[0].code, 'INVALID_STRUCTURE_LIMITS'); assert.equal(rec.calls.length, 0)
  }
})

test('P9.4 public clone plus shallow freeze cannot forge trusted provenance', () => {
  const cloned = safeCloneJsonValueV3({ nested: { value: 1 as unknown } }); assert.equal(cloned.ok, true)
  if (!cloned.ok) return
  Object.freeze(cloned.value); cloned.value.nested.value = BigInt(1)
  const budget = createJsonStructureBudgetV3()
  const resolved = resolveEventValueV3({ kind: 'fixed', value: cloned.value as never }, context({ datum: {} }), {}, budget)
  assert.equal(resolved.kind, 'error'); assert.ok(budget.nodesUsed > 0)
})

test('P9.4 failed and skipped outcomes remain in trace when evidence is invalid', async () => {
  for (const status of ['failed', 'skipped'] as const) {
    const port: EventActionPortV3 = { async execute() { return { status, ...(status === 'failed' ? { issue: { code: 'ACTION_FAILED' as const, message: 'real failure' } } : {}), evidence: (() => 1) as never } } }
    const result = await new EventBusV3({ ports: { refresh: port as never, setParameter: port as never } }).trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {} })
    const outcome = result.trace.find((item) => item.kind === 'actionOutcome')!; const detail = result.trace.find((item) => item.kind === 'actionDetail')!
    assert.equal(result.status, 'failed'); assert.deepEqual(result.completedActionIds, []); assert.equal(outcome.status, status); assert.equal(detail.detailStatus, 'invalid'); assert.equal(Object.isFrozen(outcome), true)
    if (status === 'failed') { assert.equal(outcome.code, 'ACTION_FAILED'); assert.equal(outcome.message, 'real failure') }
  }
})

test('P9.4 late audit reads never leak internals and node-cost capacity evicts oldest', async () => {
  let controller!: AbortController; let evidence: JsonValueV3 = null
  const port: EventActionPortV3 = { execute() { controller.abort(); return Promise.resolve({ status: 'succeeded', evidence }) } }
  const limits = { maxTotalNodes: 300_000, maxDepth: 128, maxObjectKeys: 20_000, maxArrayLength: 20_000 }
  const readBus = new EventBusV3({ ports: { refresh: port as never, setParameter: port as never }, structureLimits: limits, idFactory: () => 'read-large' })
  evidence = { chunks: Array.from({ length: 11 }, () => Array.from({ length: 19_000 }, () => 1)) }; controller = new AbortController()
  await readBus.trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {}, signal: controller.signal }); await new Promise<void>((resolve) => setImmediate(resolve))
  const firstRead = readBus.getLateAudits(); const secondRead = readBus.getLateAudits()
  assert.equal(firstRead[0].evidence, undefined); assert.match(firstRead[0].readError ?? '', /总节点超过/); assert.notEqual(firstRead[0], secondRead[0]); assert.equal(Object.isFrozen(firstRead[0]), true)

  let sequence = 0; const nodeBus = new EventBusV3({ ports: { refresh: port as never, setParameter: port as never }, structureLimits: limits, idFactory: () => `node-${++sequence}` })
  evidence = { chunks: Array.from({ length: 9 }, () => Array.from({ length: 19_000 }, () => 1)) }
  for (let index = 0; index < 3; index++) { controller = new AbortController(); await nodeBus.trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {}, signal: controller.signal }) }
  await new Promise<void>((resolve) => setImmediate(resolve)); const audits = nodeBus.getLateAudits()
  assert.equal(audits.length, 2); assert.equal(nodeBus.getLateAuditDroppedCount(), 1); assert.equal(audits[0].transactionId, 'node-2')
})

test('P9.4 resolver rejects non-JSON primitives while accepting safe primitives', async () => {
  for (const value of [BigInt(1), () => 1, Symbol('bad'), undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
    const budget = createJsonStructureBudgetV3(); const resolved = resolveEventValueV3({ kind: 'fixed', value: value as never }, context({ datum: {} }), {}, budget)
    assert.equal(resolved.kind, 'error'); assert.equal(resolved.kind === 'error' ? resolved.code : undefined, 'INVALID_INPUT')
    const source = app(); source.pages[0].pageEvents[0].conditions = [{ left: { kind: 'fixed', value: value as never }, operator: 'isEmpty' }]
    const rec = recordingPort(); const result = await new EventBusV3({ ports: { refresh: rec.port, setParameter: rec.port } }).trigger({ application: source, source: pageOwner(), eventName: 'pageEnter', payload: {} })
    assert.equal(result.issues[0].code, 'INVALID_INPUT'); assert.equal(rec.calls.length, 0)
  }
  for (const value of [null, 'safe', true, 1]) { const budget = createJsonStructureBudgetV3(); const resolved = resolveEventValueV3({ kind: 'fixed', value }, context({ datum: {} }), {}, budget); assert.equal(resolved.kind, 'value'); assert.equal(budget.nodesUsed, 0) }
})

test('P9.4 flat late evidence above audit node limit is minimized without argument spreading', async () => {
  let controller!: AbortController
  const evidence = Array.from({ length: 510_000 }, () => 1)
  const port: EventActionPortV3 = { execute() { controller.abort(); return Promise.resolve({ status: 'succeeded', evidence }) } }
  const bus = new EventBusV3({ ports: { refresh: port as never, setParameter: port as never }, structureLimits: { maxTotalNodes: 700_000, maxDepth: 128, maxObjectKeys: 20_000, maxArrayLength: 600_000 } })
  controller = new AbortController(); const terminal = await bus.trigger({ application: app(), source: pageOwner(), eventName: 'pageEnter', payload: {}, signal: controller.signal }); await new Promise<void>((resolve) => setImmediate(resolve))
  const audit = bus.getLateAudits()[0]
  assert.equal(terminal.status, 'cancelled'); assert.equal(audit.evidence, undefined); assert.match(audit.readError ?? '', /存储节点上限/); assert.equal(bus.getLateAuditDroppedCount(), 1)
})
