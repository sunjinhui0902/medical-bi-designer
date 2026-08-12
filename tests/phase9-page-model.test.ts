import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'

function multiPageApplication() {
  const application = createDefaultDashboardApplicationV3()
  application.parameters.push({
    id: 'parameter-year', code: 'year', name: 'Year', type: 'string', scope: 'application', required: false,
    source: { kind: 'static', options: [{ label: '2026', value: '2026' }] },
  })
  application.pages.push({
    ...structuredClone(application.pages[0]),
    id: 'page-detail', name: 'Detail', code: 'detail', order: 2,
    components: [{ id: 'component-detail' } as never], controls: [], pageEvents: [],
  })
  application.pages[0].components = [{ id: 'component-home' } as never]
  application.pages[0].pageEvents = [{
    id: 'event-page-enter', enabled: true, event: 'pageEnter', actions: [
      { id: 'action-refresh', type: 'refresh', target: { kind: 'components', componentIds: ['component-home'] } },
      { id: 'action-parameter', type: 'setParameter', assignments: [
        { parameterId: 'parameter-year', value: { kind: 'fixed', value: '2026' } },
      ] },
    ],
  }]
  return application
}

test('P9.1 accepts multiple ordered pages and whitelisted event actions', () => {
  const result = validateDashboardApplicationV3(multiPageApplication())
  assert.equal(result.valid, true, JSON.stringify(result.issues))
})

test('P9.1 rejects invalid default page and duplicate page id, code or order', () => {
  for (const mutate of [
    (value: ReturnType<typeof multiPageApplication>) => { value.defaultPageId = 'missing' },
    (value: ReturnType<typeof multiPageApplication>) => { value.pages[1].id = value.pages[0].id },
    (value: ReturnType<typeof multiPageApplication>) => { value.pages[1].code = value.pages[0].code },
    (value: ReturnType<typeof multiPageApplication>) => { value.pages[1].order = value.pages[0].order },
  ]) {
    const application = multiPageApplication()
    mutate(application)
    assert.equal(validateDashboardApplicationV3(application).valid, false)
  }
})

test('P9.1 requires page.order to match array position', () => {
  const application = multiPageApplication()
  application.pages[0].order = 2
  application.pages[1].order = 1
  const result = validateDashboardApplicationV3(application)
  assert.equal(result.issues.some((issue) => issue.keyword === 'pageOrder'), true)
})

test('P9.1 enforces application-wide component, control and event ids', () => {
  const application = multiPageApplication()
  application.pages[1].components[0].id = 'component-home'
  const control = {
    id: 'control-shared', type: 'singleSelect' as const, parameterIds: ['parameter-year'],
    position: { x: 0, y: 0, width: 100, height: 32, zIndex: 1 }, styleConfig: {},
    interaction: { submitMode: 'immediate' as const, clearable: true },
  }
  application.pages[0].controls.push(control)
  application.pages[1].controls.push(structuredClone(control))
  application.pages[1].pageEvents.push(structuredClone(application.pages[0].pageEvents[0]))
  const result = validateDashboardApplicationV3(application)
  assert.equal(result.issues.some((issue) => issue.keyword === 'uniqueComponentId'), true)
  assert.equal(result.issues.some((issue) => issue.keyword === 'uniqueControlId'), true)
  assert.equal(result.issues.some((issue) => issue.keyword === 'uniqueEventId'), true)
})

test('P9.1 schema rejects Phase10 actions', () => {
  const application = multiPageApplication()
  application.pages[0].pageEvents[0].actions.push({ id: 'action-navigate', type: 'navigate', pageId: 'page-detail' } as never)
  assert.equal(validateDashboardApplicationV3(application).valid, false)
})

test('P9.1 fixed values support lossless JSON object and array round trips', () => {
  const application = multiPageApplication()
  const fixedValue = {
    hospital: 'Central',
    enabled: true,
    threshold: 12.5,
    optional: null,
    groups: ['A', 2, { nested: [false, null] }],
  }
  const action = application.pages[0].pageEvents[0].actions[1]
  if (action.type !== 'setParameter') throw new Error('fixture action must be setParameter')
  action.assignments[0].value = { kind: 'fixed', value: fixedValue }
  assert.equal(validateDashboardApplicationV3(application).valid, true)
  const roundTripped = JSON.parse(JSON.stringify(application))
  assert.deepEqual(roundTripped.pages[0].pageEvents[0].actions[1].assignments[0].value.value, fixedValue)
})

test('P9.1 rejects fixed values that cannot round trip through JSON', () => {
  class CustomValue { value = 'custom' }
  const cyclic: Record<string, unknown> = {}
  cyclic.self = cyclic
  const sparse = new Array(2)
  sparse[1] = 'value'
  const invalidValues: unknown[] = [undefined, () => 'value', 1n, new Date(), new CustomValue(), NaN, Infinity, -0, cyclic, sparse]

  for (const invalidValue of invalidValues) {
    const application = multiPageApplication()
    const action = application.pages[0].pageEvents[0].actions[1]
    if (action.type !== 'setParameter') throw new Error('fixture action must be setParameter')
    action.assignments[0].value = { kind: 'fixed', value: invalidValue } as never
    const result = validateDashboardApplicationV3(application)
    assert.equal(result.valid, false)
    assert.equal(result.issues.some((issue) => issue.keyword === 'jsonValue' && issue.path.endsWith('/value')), true)
  }
})

test('P9.1 restricts Refresh targets to the owning page with precise paths', () => {
  const crossPage = multiPageApplication()
  const refreshPage = crossPage.pages[0].pageEvents[0].actions[0]
  if (refreshPage.type !== 'refresh') throw new Error('fixture action must be refresh')
  refreshPage.target = { kind: 'page', pageId: 'page-detail' }
  const pageResult = validateDashboardApplicationV3(crossPage)
  assert.equal(pageResult.issues.some((issue) => issue.keyword === 'refreshPageScope'
    && issue.path === '/pages/0/pageEvents/0/actions/0/target/pageId'), true)

  const crossComponent = multiPageApplication()
  const refreshComponent = crossComponent.pages[0].pageEvents[0].actions[0]
  if (refreshComponent.type !== 'refresh') throw new Error('fixture action must be refresh')
  refreshComponent.target = { kind: 'components', componentIds: ['component-detail'] }
  const componentResult = validateDashboardApplicationV3(crossComponent)
  assert.equal(componentResult.issues.some((issue) => issue.keyword === 'refreshComponentScope'
    && issue.path === '/pages/0/pageEvents/0/actions/0/target/componentIds/0'), true)
})

test('P9.1 keeps legacy dialog pages readable', () => {
  const application = multiPageApplication()
  application.pages[1].type = 'dialog'
  assert.equal(validateDashboardApplicationV3(application).valid, true)
})
