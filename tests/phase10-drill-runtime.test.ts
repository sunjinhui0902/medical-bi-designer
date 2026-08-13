import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  createDefaultDashboardApplicationV3,
  type DashboardApplicationV3,
  type EventBindingV3,
  type EventNameV3,
  type JsonObjectV3,
  type JsonValueV3,
  type ParameterDefinitionV3,
} from '../src/models/dashboard-v3.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'
import { EventBusV3 } from '../src/services/eventBusV3.ts'
import { ParameterRuntimeStoreV3 } from '../src/services/parameterRuntimeV3.ts'
import {
  createPageSessionEventIntegrationV3,
  PageSessionRuntimeV3,
  type DrillFrameV3,
} from '../src/services/pageSessionRuntimeV3.ts'
import type {
  EventActionResultV3,
  InteractionActionRequestV3,
  ResolvedInteractionActionRequestV3,
} from '../src/services/eventRuntimeTypesV3.ts'
import type {
  SetParameterRefreshCoordinatorV3,
  SetParameterRefreshRequestV3,
  SetParameterRefreshResultV3,
} from '../src/services/setParameterActionPortV3.ts'

const regionField = 'region/code~v1'
const parameters: ParameterDefinitionV3[] = [
  stringParameter('region', 'R0'),
  stringParameter('store', 'S0'),
  stringParameter('product', 'P0'),
]

function stringParameter(id: string, defaultValue: string): ParameterDefinitionV3 {
  return {
    id,
    code: id,
    name: id,
    type: 'string',
    scope: 'application',
    required: false,
    defaultValue,
    source: { kind: 'static', options: [] },
  }
}

function component(id: string, fields: string[]) {
  return {
    id,
    type: 'table',
    title: id,
    position: { x: 0, y: 0, width: 400, height: 300, zIndex: 1 },
    dataConfig: {
      version: 3,
      sourceKind: 'server',
      datasetId: `dataset-${id}`,
      dimensions: fields.map((field) => ({ field, role: 'category' })),
      measures: [],
      filters: [],
      sort: [],
      limit: 100,
      parameterBindings: [],
      refreshPolicy: 'manual',
    },
    tableConfig: { columns: fields.map((field) => ({ field })) },
    styleConfig: {
      background: '#fff',
      borderColor: '#ddd',
      borderWidth: 1,
      borderRadius: 0,
      padding: 0,
      shadow: false,
      titleVisible: true,
      titleColor: '#000',
      titleSize: 12,
      titleWeight: 400,
    },
    events: [],
  } as never
}

function application(): DashboardApplicationV3 {
  const app = createDefaultDashboardApplicationV3()
  app.parameters = structuredClone(parameters)
  app.drillPaths = [{
    id: 'commerce-path',
    name: 'Region to product',
    levels: [
      { id: 'region-level', label: 'Region', field: regionField, parameterId: 'region' },
      { id: 'store-level', label: 'Store', field: 'store_code', parameterId: 'store' },
      { id: 'product-level', label: 'Product', field: 'product_code', parameterId: 'product' },
    ],
  }]
  app.pages[0].components = [component('region-table', [regionField])]
  app.pages[0].pageEvents = []
  const storePage = structuredClone(app.pages[0])
  storePage.id = 'page-store'
  storePage.code = 'store'
  storePage.name = 'Store'
  storePage.order = 2
  storePage.components = [component('store-table', ['store_code'])]
  const productPage = structuredClone(app.pages[0])
  productPage.id = 'page-product'
  productPage.code = 'product'
  productPage.name = 'Product'
  productPage.order = 3
  productPage.components = [component('product-table', ['product_code'])]
  app.pages.push(storePage, productPage)
  return app
}

function contractApplication(): DashboardApplicationV3 {
  const app = createDefaultDashboardApplicationV3()
  app.parameters = structuredClone(parameters)
  app.drillPaths = structuredClone(application().drillPaths)
  return app
}

function owner(pageId: string, componentId: string) {
  return { kind: 'component' as const, pageId, pageType: 'standard' as const, componentId, componentType: 'table' }
}

function bind(
  app: DashboardApplicationV3,
  pageId: string,
  componentId: string,
  event: EventNameV3,
  action: EventBindingV3['actions'][number],
) {
  const target = app.pages.find((page) => page.id === pageId)!.components.find((item) => item.id === componentId)!
  target.events = [{ id: `event-${action.id}`, enabled: true, event, actions: [action] }]
}

function drillAction(id: string, type: 'drillDown' | 'drillBack' | 'clearDrill' = 'drillDown') {
  return { id, type, pathId: 'commerce-path' } as const
}

function directRequest(
  runtime: PageSessionRuntimeV3,
  action: ResolvedInteractionActionRequestV3,
  pageId: string,
  componentId: string,
  eventName: EventNameV3,
  payload: JsonObjectV3,
  signal = new AbortController().signal,
  lease = runtime.captureSessionLease(),
): InteractionActionRequestV3 {
  return {
    action,
    context: {
      transactionId: `event-${action.id}-${lease.revision}`,
      depth: 1,
      applicationId: 'dashboard-default',
      eventBindingId: `binding-${action.id}`,
      eventName,
      source: owner(pageId, componentId),
      occurredAt: 1,
      payload,
    },
    parameterSnapshot: {},
    refreshClaimSnapshot: [],
    signal,
    sessionLease: lease,
  }
}

async function executeDrill(
  runtime: PageSessionRuntimeV3,
  action: ReturnType<typeof drillAction>,
  pageId: string,
  componentId: string,
  eventName: EventNameV3,
  payload: JsonObjectV3,
  signal = new AbortController().signal,
  lease = runtime.captureSessionLease(),
) {
  const drillRuntime = runtime as PageSessionRuntimeV3 & {
    executeDrill(request: InteractionActionRequestV3): Promise<EventActionResultV3>
  }
  return drillRuntime.executeDrill(directRequest(runtime, action, pageId, componentId, eventName, payload, signal, lease))
}

function executeNavigation(runtime: PageSessionRuntimeV3, action: ResolvedInteractionActionRequestV3, pageId: string, componentId: string) {
  return runtime.execute(directRequest(runtime, action, pageId, componentId, 'click', {}))
}

function frames(runtime: PageSessionRuntimeV3, pathId = 'commerce-path'): DrillFrameV3[] {
  return runtime.snapshot().drills.find((item) => item.pathId === pathId)?.frames ?? []
}

function eventBus(runtime: PageSessionRuntimeV3, idFactory = (() => { let id = 0; return () => `event-${++id}` })()) {
  return new EventBusV3({
    ports: {
      setParameter: { async execute() { return { status: 'skipped' } } },
      refresh: { async execute() { return { status: 'skipped' } } },
      interaction: createPageSessionEventIntegrationV3(runtime),
    },
    idFactory,
  })
}

async function trigger(
  runtime: PageSessionRuntimeV3,
  app: DashboardApplicationV3,
  store: ParameterRuntimeStoreV3,
  pageId: string,
  componentId: string,
  eventName: EventNameV3,
  payload: JsonObjectV3,
  signal?: AbortSignal,
) {
  return eventBus(runtime).trigger({
    application: app,
    source: owner(pageId, componentId),
    eventName,
    payload,
    parameterSnapshot: store.snapshot().values as Record<string, JsonValueV3>,
    ...(signal ? { signal } : {}),
  })
}

function harness(options: { sessionId?: string; refresh?: SetParameterRefreshCoordinatorV3 } = {}) {
  const app = application()
  const store = new ParameterRuntimeStoreV3(parameters, {
    transactionId: (() => { let id = 0; return () => `parameter-${++id}` })(),
  })
  const runtime = new PageSessionRuntimeV3({
    application: app,
    parameters: store,
    sessionId: options.sessionId ?? 'drill-session',
    drillRefresh: options.refresh,
  })
  return { app, store, runtime }
}

test('P10.4 DrillPath contract freezes level bounds, unique parameters, and safe fields', () => {
  const accepted = contractApplication()
  assert.equal(validateDashboardApplicationV3(accepted).valid, true)

  const tooShort = structuredClone(accepted)
  tooShort.drillPaths![0].levels = tooShort.drillPaths![0].levels.slice(0, 1)
  assert.equal(validateDashboardApplicationV3(tooShort).valid, false)

  const tooLong = structuredClone(accepted)
  tooLong.parameters = Array.from({ length: 101 }, (_, index) => stringParameter(`level-${index}`, `V${index}`))
  tooLong.drillPaths![0].levels = tooLong.parameters.map((parameter, index) => ({ id: `level-${index}`, label: `Level ${index}`, field: `field-${index}`, parameterId: parameter.id }))
  assert.equal(validateDashboardApplicationV3(tooLong).valid, false)

  const duplicateParameter = structuredClone(accepted)
  duplicateParameter.drillPaths![0].levels[1].parameterId = duplicateParameter.drillPaths![0].levels[0].parameterId
  assert.equal(validateDashboardApplicationV3(duplicateParameter).valid, false)

  for (const field of ['__proto__', 'prototype', 'constructor']) {
    const dangerous = structuredClone(accepted)
    dangerous.drillPaths![0].levels[0].field = field
    assert.equal(validateDashboardApplicationV3(dangerous).valid, false, field)
  }
})

test('P10.4 click and doubleClick read datum while rowClick reads row with escaped own fields', async () => {
  for (const eventName of ['click', 'doubleClick'] as const) {
    const value = harness()
    bind(value.app, 'page-home', 'region-table', eventName, drillAction(`down-${eventName}`))
    const result = await trigger(value.runtime, value.app, value.store, 'page-home', 'region-table', eventName, { datum: { [regionField]: 'R1' } })
    assert.equal(result.status, 'completed', `${eventName}: ${JSON.stringify(result)}`)
    assert.equal(value.store.get('region'), 'R1')
  }

  const rowValue = harness()
  bind(rowValue.app, 'page-home', 'region-table', 'rowClick', drillAction('down-row'))
  const rowResult = await trigger(rowValue.runtime, rowValue.app, rowValue.store, 'page-home', 'region-table', 'rowClick', { row: { [regionField]: 'R2' } })
  assert.equal(rowResult.status, 'completed')
  assert.equal(rowValue.store.get('region'), 'R2')
})

test('P10.4 missing, inherited, accessor, proxy, undefined, and non-JSON fields fail closed', async () => {
  const malformedPayloads: unknown[] = [
    { datum: {} },
    { datum: Object.create({ [regionField]: 'INHERITED' }) },
    { datum: { [regionField]: undefined } },
    { datum: { [regionField]: 1n } },
  ]
  let getterCalls = 0
  const accessor: Record<string, unknown> = {}
  Object.defineProperty(accessor, regionField, { enumerable: true, get() { getterCalls++; return 'GETTER' } })
  malformedPayloads.push({ datum: accessor })
  malformedPayloads.push({ datum: new Proxy({}, { getOwnPropertyDescriptor() { throw new Error('proxy trap') } }) })

  for (const [index, payload] of malformedPayloads.entries()) {
    const value = harness()
    bind(value.app, 'page-home', 'region-table', 'click', drillAction(`unsafe-${index}`))
    const before = value.store.snapshot()
    const result = await trigger(value.runtime, value.app, value.store, 'page-home', 'region-table', 'click', payload as JsonObjectV3)
    assert.notEqual(result.status, 'completed', `payload ${index}`)
    assert.deepEqual(value.store.snapshot(), before)
    assert.deepEqual(frames(value.runtime), [])
  }
  assert.equal(getterCalls, 0)
})

test('P10.4 same path continues across pages and components using the next level', async () => {
  const value = harness()
  await executeDrill(value.runtime, drillAction('region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } })
  executeNavigation(value.runtime, { id: 'to-store', type: 'navigatePage', pageId: 'page-store', history: 'push', assignments: [] }, 'page-home', 'region-table')
  await executeDrill(value.runtime, drillAction('store'), 'page-store', 'store-table', 'rowClick', { row: { store_code: 'S1' } })
  executeNavigation(value.runtime, { id: 'to-product', type: 'navigatePage', pageId: 'page-product', history: 'push', assignments: [] }, 'page-store', 'store-table')
  await executeDrill(value.runtime, drillAction('product'), 'page-product', 'product-table', 'doubleClick', { datum: { product_code: 'P1' } })

  assert.deepEqual(value.store.snapshot().values, { region: 'R1', store: 'S1', product: 'P1' })
  assert.deepEqual(frames(value.runtime).map(({ levelId, parameterId, value, sourceComponentId }) => ({ levelId, parameterId, value, sourceComponentId })), [
    { levelId: 'region-level', parameterId: 'region', value: 'R1', sourceComponentId: 'region-table' },
    { levelId: 'store-level', parameterId: 'store', value: 'S1', sourceComponentId: 'store-table' },
    { levelId: 'product-level', parameterId: 'product', value: 'P1', sourceComponentId: 'product-table' },
  ])
})

test('P10.4 a continuing component missing the current level field fails atomically', async () => {
  const value = harness()
  await executeDrill(value.runtime, drillAction('region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } })
  executeNavigation(value.runtime, { id: 'to-store', type: 'navigatePage', pageId: 'page-store', history: 'push', assignments: [] }, 'page-home', 'region-table')
  const beforeParameters = value.store.snapshot()
  const beforeSnapshot = value.runtime.snapshot()
  const result = await executeDrill(value.runtime, drillAction('missing-store'), 'page-store', 'store-table', 'rowClick', { row: { product_code: 'P1' } })
  assert.equal(result.status, 'failed')
  assert.equal(result.effectApplied, false)
  assert.deepEqual(value.store.snapshot(), beforeParameters)
  assert.deepEqual(value.runtime.snapshot(), beforeSnapshot)
})

test('P10.4 different pathIds keep independent stacks in one session', async () => {
  const app = application()
  app.drillPaths!.push({
    id: 'alternate-path',
    name: 'Alternate path',
    levels: [
      { id: 'alternate-region-level', label: 'Alternate region', field: 'alternate_region', parameterId: 'alternate_region' },
      { id: 'alternate-store-level', label: 'Alternate store', field: 'alternate_store', parameterId: 'alternate_store' },
    ],
  })
  const definitions = [...parameters, stringParameter('alternate_region', 'AR0'), stringParameter('alternate_store', 'AS0')]
  app.parameters = structuredClone(definitions)
  const store = new ParameterRuntimeStoreV3(definitions)
  const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'multi-path-session' })
  await executeDrill(runtime, drillAction('primary-region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } })
  await executeDrill(runtime, { id: 'alternate-region', type: 'drillDown', pathId: 'alternate-path' }, 'page-home', 'region-table', 'click', { datum: { alternate_region: 'AR1' } })
  assert.deepEqual(runtime.snapshot().drills.map(({ pathId, frames: stackFrames }) => ({ pathId, levels: stackFrames.map((frame) => frame.levelId) })), [
    { pathId: 'commerce-path', levels: ['region-level'] },
    { pathId: 'alternate-path', levels: ['alternate-region-level'] },
  ])
})

test('P10.4 drill and linkage overlays preserve the latest surviving interaction in both orders', async () => {
  for (const order of ['drill-first', 'linkage-first'] as const) {
    const app = application(); const store = new ParameterRuntimeStoreV3(parameters); const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: order, linkageRefresh: { validateTargets() { return undefined }, async refresh(request) { return { attemptedComponentIds: request.targetComponentIds, succeededComponentIds: request.targetComponentIds, failed: [] } } } })
    const linkage = { id: 'region-linkage', type: 'applyLinkage' as const, assignments: [{ parameterId: 'region', value: 'RL' }], targetComponentIds: ['region-table'] }
    if (order === 'drill-first') {
      await executeDrill(runtime, drillAction('region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'RD' } })
      await runtime.executeLinkage(directRequest(runtime, linkage, 'page-home', 'region-table', 'click', {}))
      await runtime.executeLinkage(directRequest(runtime, { id: 'clear-linkage', type: 'clearLinkage' }, 'page-home', 'region-table', 'click', {}))
      assert.equal(store.get('region'), 'RD')
      await executeDrill(runtime, drillAction('clear-drill', 'clearDrill'), 'page-home', 'region-table', 'click', {})
    } else {
      await runtime.executeLinkage(directRequest(runtime, linkage, 'page-home', 'region-table', 'click', {}))
      await executeDrill(runtime, drillAction('region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'RD' } })
      await runtime.executeLinkage(directRequest(runtime, { id: 'clear-linkage', type: 'clearLinkage' }, 'page-home', 'region-table', 'click', {}))
      assert.equal(store.get('region'), 'RD')
      await executeDrill(runtime, drillAction('clear-drill', 'clearDrill'), 'page-home', 'region-table', 'click', {})
    }
    assert.equal(store.get('region'), 'R0'); assert.deepEqual(runtime.snapshot().drills, []); assert.deepEqual(runtime.snapshot().linkages, [])
  }
})

test('P10.4 pageBack restores the popped page checkpoint atomically', async () => {
  const value = harness()
  await executeDrill(value.runtime, drillAction('region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } })
  executeNavigation(value.runtime, { id: 'to-store', type: 'navigatePage', pageId: 'page-store', history: 'push', assignments: [] }, 'page-home', 'region-table')
  await executeDrill(value.runtime, drillAction('store'), 'page-store', 'store-table', 'rowClick', { row: { store_code: 'S1' } })
  executeNavigation(value.runtime, { id: 'to-product', type: 'navigatePage', pageId: 'page-product', history: 'push', assignments: [] }, 'page-store', 'store-table')
  await executeDrill(value.runtime, drillAction('product'), 'page-product', 'product-table', 'click', { datum: { product_code: 'P1' } })

  const result = executeNavigation(value.runtime, { id: 'back-store', type: 'pageBack' }, 'page-product', 'product-table')
  assert.equal(result.status, 'succeeded')
  assert.equal(value.runtime.snapshot().activePageId, 'page-store')
  assert.deepEqual(value.store.snapshot().values, { region: 'R1', store: 'S1', product: 'P0' })
  assert.deepEqual(frames(value.runtime).map((frame) => frame.levelId), ['region-level', 'store-level'])
  assert.deepEqual(result.parameterCommit?.changedParameterIds, ['product'])
  assert.deepEqual(result.parameterCommit?.assignments?.find((assignment) => assignment.parameterId === 'product'), { parameterId: 'product', value: 'P0' })
})

test('P10.4 replace restores the current page checkpoint before transferring lineage', async () => {
  const value = harness()
  await executeDrill(value.runtime, drillAction('region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } })
  executeNavigation(value.runtime, { id: 'to-store', type: 'navigatePage', pageId: 'page-store', history: 'push', assignments: [] }, 'page-home', 'region-table')
  await executeDrill(value.runtime, drillAction('store'), 'page-store', 'store-table', 'click', { datum: { store_code: 'S1' } })

  const result = executeNavigation(value.runtime, { id: 'replace-product', type: 'navigatePage', pageId: 'page-product', history: 'replace', assignments: [] }, 'page-store', 'store-table')
  assert.equal(result.status, 'succeeded')
  assert.equal(value.runtime.snapshot().activePageId, 'page-product')
  assert.deepEqual(value.runtime.snapshot().stack.map((entry) => entry.pageId), ['page-home', 'page-product'])
  assert.deepEqual(value.store.snapshot().values, { region: 'R1', store: 'S0', product: 'P0' })
  assert.deepEqual(frames(value.runtime).map((frame) => frame.levelId), ['region-level'])
})

test('P10.4 drillBack and clearDrill restore baselines with one atomic commit each', async () => {
  const value = harness()
  await executeDrill(value.runtime, drillAction('region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } })
  await executeDrill(value.runtime, drillAction('store'), 'page-home', 'region-table', 'click', { datum: { store_code: 'S1' } })
  await executeDrill(value.runtime, drillAction('product'), 'page-home', 'region-table', 'click', { datum: { product_code: 'P1' } })

  const backed = await executeDrill(value.runtime, drillAction('back', 'drillBack'), 'page-home', 'region-table', 'click', {})
  assert.equal(backed.status, 'succeeded')
  assert.deepEqual(backed.parameterCommit?.assignments, [{ parameterId: 'product', value: 'P0' }])
  assert.deepEqual(value.store.snapshot().values, { region: 'R1', store: 'S1', product: 'P0' })

  const cleared = await executeDrill(value.runtime, drillAction('clear', 'clearDrill'), 'page-home', 'region-table', 'click', {})
  assert.equal(cleared.status, 'succeeded')
  assert.deepEqual(cleared.parameterCommit?.assignments, [
    { parameterId: 'region', value: 'R0' },
    { parameterId: 'store', value: 'S0' },
  ])
  assert.deepEqual(value.store.snapshot().values, { region: 'R0', store: 'S0', product: 'P0' })
  assert.deepEqual(frames(value.runtime), [])
})

test('P10.4 invalid next-level value is atomic and leaves parameters and breadcrumbs unchanged', async () => {
  const value = harness()
  await executeDrill(value.runtime, drillAction('region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } })
  const beforeParameters = value.store.snapshot()
  const beforeSnapshot = value.runtime.snapshot()
  const result = await executeDrill(value.runtime, drillAction('invalid-store'), 'page-home', 'region-table', 'click', { datum: { store_code: 42 } })
  assert.equal(result.status, 'failed')
  assert.equal(result.effectApplied, false)
  assert.deepEqual(value.store.snapshot(), beforeParameters)
  assert.deepEqual(value.runtime.snapshot(), beforeSnapshot)
})

test('P10.4 same-value drill advances once without a false commit and terminal depth skips', async () => {
  const value = harness()
  const same = await executeDrill(value.runtime, drillAction('same-region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R0' } })
  assert.equal(same.status, 'succeeded')
  assert.equal(same.effectApplied, true)
  assert.equal(same.parameterCommit, undefined)
  assert.equal(frames(value.runtime).length, 1)

  await executeDrill(value.runtime, drillAction('store'), 'page-home', 'region-table', 'click', { datum: { store_code: 'S1' } })
  await executeDrill(value.runtime, drillAction('product'), 'page-home', 'region-table', 'click', { datum: { product_code: 'P1' } })
  const before = value.runtime.snapshot()
  const terminal = await executeDrill(value.runtime, drillAction('terminal'), 'page-home', 'region-table', 'click', { datum: { product_code: 'P2' } })
  assert.equal(terminal.status, 'skipped')
  assert.equal(terminal.effectApplied, false)
  assert.equal(terminal.parameterCommit, undefined)
  assert.deepEqual(value.runtime.snapshot(), before)
})

test('P10.4 breadcrumb snapshots are deeply frozen and cannot mutate runtime state', async () => {
  const value = harness()
  await executeDrill(value.runtime, drillAction('region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } })
  const snapshot = value.runtime.snapshot()
  assert.equal(Object.isFrozen(snapshot), true)
  assert.equal(Object.isFrozen(snapshot.drills), true)
  assert.equal(Object.isFrozen(snapshot.drills[0]), true)
  assert.equal(Object.isFrozen(snapshot.drills[0].frames), true)
  assert.equal(Object.isFrozen(snapshot.drills[0].frames[0]), true)
  assert.throws(() => { snapshot.drills[0].frames[0].label = 'tampered' })
  assert.equal(frames(value.runtime)[0].label, 'Region')
})

test('P10.4 path state is isolated by session and clear epoch rejects stale work', async () => {
  const first = harness({ sessionId: 'session-a' })
  const second = harness({ sessionId: 'session-b' })
  const staleLease = first.runtime.captureSessionLease()
  await executeDrill(first.runtime, drillAction('first-region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } }, undefined, staleLease)
  assert.equal(first.store.get('region'), 'R1')
  assert.equal(second.store.get('region'), 'R0')
  assert.deepEqual(frames(second.runtime), [])

  first.runtime.clear()
  const stale = await executeDrill(first.runtime, drillAction('stale'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R9' } }, undefined, staleLease)
  assert.equal(stale.status, 'failed')
  assert.equal(stale.issue?.code, 'CANCELLED')
  assert.equal(first.store.get('region'), 'R0')
  assert.deepEqual(frames(first.runtime), [])
})

test('P10.4 EventBus rejects a forged drill parameter handoff', async () => {
  const app = application()
  bind(app, 'page-home', 'region-table', 'click', drillAction('forged-drill'))
  const fakeLease = { sessionId: 'forged-session', epoch: 1, revision: 1 }
  const interaction = {
    captureSessionLease: () => fakeLease,
    async execute() {
      return {
        status: 'succeeded' as const,
        effectApplied: true,
        parameterCommit: {
          kind: 'parameterCommit' as const,
          applicationId: app.id,
          actionId: 'forged-drill',
          eventTransactionId: 'event-forged',
          parameterTransactionId: 'parameter-forged',
          changedParameterIds: ['region'],
          values: { region: 'R9', store: 'S0', product: 'P0' },
          assignments: [{ parameterId: 'region', value: 'R9' }],
          sessionLease: fakeLease,
        },
      }
    },
  }
  const bus = new EventBusV3({
    ports: {
      setParameter: { async execute() { return { status: 'skipped' } } },
      refresh: { async execute() { return { status: 'skipped' } } },
      interaction,
    },
    idFactory: () => 'event-forged',
  })
  const result = await bus.trigger({ application: app, source: owner('page-home', 'region-table'), eventName: 'click', payload: { datum: { [regionField]: 'R9' } }, parameterSnapshot: { region: 'R0', store: 'S0', product: 'P0' } })
  assert.equal(result.status, 'failed')
  assert.equal(result.issues[0]?.code, 'PORT_CONTRACT_VIOLATION')
})

test('P10.4 cancellation before commit is empty while cancellation after commit preserves facts', async () => {
  const controller = new AbortController()
  controller.abort()
  const cancelled = harness()
  bind(cancelled.app, 'page-home', 'region-table', 'click', drillAction('pre-cancelled'))
  const before = cancelled.store.snapshot()
  const preResult = await trigger(cancelled.runtime, cancelled.app, cancelled.store, 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } }, controller.signal)
  assert.equal(preResult.status, 'cancelled')
  assert.deepEqual(cancelled.store.snapshot(), before)
  assert.deepEqual(frames(cancelled.runtime), [])

  let releaseRefresh!: (value: SetParameterRefreshResultV3) => void
  let refreshStarted!: (request: SetParameterRefreshRequestV3) => void
  const started = new Promise<SetParameterRefreshRequestV3>((resolve) => { refreshStarted = resolve })
  const refresh = new Promise<SetParameterRefreshResultV3>((resolve) => { releaseRefresh = resolve })
  const late = harness({ refresh: { refresh(request) { refreshStarted(request); return refresh } } })
  const lateController = new AbortController()
  const pending = executeDrill(late.runtime, drillAction('late-cancelled'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } }, lateController.signal)
  await started
  lateController.abort()
  releaseRefresh({ attemptedComponentIds: [], succeededComponentIds: [], failed: [], cancelled: true })
  const lateResult = await pending
  assert.equal(lateResult.status, 'failed')
  assert.equal(lateResult.issue?.code, 'CANCELLED')
  assert.equal(lateResult.effectApplied, true)
  assert.equal(late.store.get('region'), 'R1')
  assert.equal(frames(late.runtime).length, 1)
})

test('P10.4 navigation assignments remain the latest overlay when clearing inherited drill state', async () => {
  const value = harness()
  await executeDrill(value.runtime, drillAction('region'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } })
  const navigated = executeNavigation(value.runtime, { id: 'to-store-nav', type: 'navigatePage', pageId: 'page-store', history: 'push', assignments: [{ parameterId: 'region', value: 'NAV' }] }, 'page-home', 'region-table')
  assert.equal(navigated.status, 'succeeded'); assert.equal(value.store.get('region'), 'NAV')

  const cleared = await executeDrill(value.runtime, drillAction('clear-after-nav', 'clearDrill'), 'page-store', 'store-table', 'click', {})
  assert.equal(cleared.status, 'succeeded'); assert.equal(value.store.get('region'), 'NAV'); assert.deepEqual(value.runtime.snapshot().drills, [])

  const backed = executeNavigation(value.runtime, { id: 'back-nav', type: 'pageBack' }, 'page-store', 'store-table')
  assert.equal(backed.status, 'succeeded'); assert.equal(value.store.get('region'), 'R1'); assert.deepEqual(frames(value.runtime).map((frame) => frame.levelId), ['region-level'])
})

test('P10.4 clear during late refresh invalidates the old epoch without late state writeback', async () => {
  let releaseRefresh!: (value: SetParameterRefreshResultV3) => void
  let refreshStarted!: () => void
  const started = new Promise<void>((resolve) => { refreshStarted = resolve })
  const refresh = new Promise<SetParameterRefreshResultV3>((resolve) => { releaseRefresh = resolve })
  const value = harness({ refresh: { refresh() { refreshStarted(); return refresh } } })
  const pending = executeDrill(value.runtime, drillAction('late-clear'), 'page-home', 'region-table', 'click', { datum: { [regionField]: 'R1' } })
  await started
  const cleared = value.runtime.clear()
  releaseRefresh({ attemptedComponentIds: [], succeededComponentIds: [], failed: [] })
  const result = await pending
  assert.equal(result.status, 'failed')
  assert.equal(result.issue?.code, 'CANCELLED')
  assert.equal(value.runtime.snapshot().epoch, cleared.epoch)
  assert.equal(value.store.get('region'), 'R0')
  assert.deepEqual(frames(value.runtime), [])
})

test('P10.4 core drill executor contains no fixture-specific business branching', () => {
  const source = readFileSync(new URL('../src/services/pageSessionRuntimeV3.ts', import.meta.url), 'utf8')
  assert.doesNotMatch(source, /hospital|department|doctor|医院|科室|医生/i)
})
