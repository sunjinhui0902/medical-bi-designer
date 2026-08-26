import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultDashboardApplicationV3, type EventBindingV3 } from '../src/models/dashboard-v3.ts'
import {
  authorableEventNamesV3,
  eventFieldCapabilitiesForOwnerV3,
  type EventOwnerV3,
} from '../src/services/eventAuthoringPolicyV3.ts'
import {
  createEventBindingV3,
  createEventDraftV3,
  deleteEventBindingV3,
  inspectEventBindingAuthorabilityV3,
  updateEventBindingV3,
} from '../src/services/eventBindingManagerV3.ts'
import { createPageV3 } from '../src/services/pageManagerV3.ts'
import { useEventConfigEditorV3 } from '../src/composables/useEventConfigEditorV3.ts'

function fixture() {
  const base = createDefaultDashboardApplicationV3()
  base.parameters.push({ id: 'parameter-year', code: 'year', name: 'Year', type: 'string', scope: 'application', required: false, source: { kind: 'static', options: [] } })
  base.pages[0].components = [
    {
      id: 'component-chart', type: 'bar', title: 'Chart',
      dataConfig: {
        dimensions: [{ field: 'dept/name', role: 'category' }],
        measures: [{ field: 'amount~net', aggregation: 'sum', axis: 'left' }, { field: '__proto__', aggregation: 'sum', axis: 'left' }],
      },
    } as never,
    {
      id: 'component-table', type: 'table', title: 'Table',
      dataConfig: { dimensions: [{ field: 'department', role: 'category' }], measures: [{ field: 'amount', aggregation: 'sum', axis: 'left' }] },
      tableConfig: { columns: [{ field: 'department' }, { field: 'amount' }, { field: 'constructor' }] },
    } as never,
    {
      id: 'component-tabs', type: 'tabs', title: 'Tabs', dataConfig: { dimensions: [], measures: [] },
      tabsConfig: { items: [{ id: 'overview', label: '概览', value: 'overview', componentIds: [], visible: true, padding: 12, gap: 8, background: '#fff' }], activeItemId: 'overview', alignment: 'left', titlePosition: 'top', stylePreset: 'default', titleSize: 38 },
    } as never,
  ]
  return createPageV3(base, { name: 'Detail', code: 'detail' }, () => 'page-detail').application
}
const pageOwner = (): EventOwnerV3 => ({ kind: 'page', pageId: 'page-home', pageType: 'standard' })
const chartOwner = (): EventOwnerV3 => ({ kind: 'component', pageId: 'page-home', pageType: 'standard', componentId: 'component-chart', componentType: 'bar' })
const tableOwner = (): EventOwnerV3 => ({ kind: 'component', pageId: 'page-home', pageType: 'standard', componentId: 'component-table', componentType: 'table' })
const tabsOwner = (): EventOwnerV3 => ({ kind: 'component', pageId: 'page-home', pageType: 'standard', componentId: 'component-tabs', componentType: 'tabs' })

function refresh(id = 'action-refresh', componentIds?: string[]) {
  return componentIds
    ? { id, type: 'refresh' as const, target: { kind: 'components' as const, componentIds } }
    : { id, type: 'refresh' as const, target: { kind: 'page' as const, pageId: 'page-home' } }
}

function pageEvent(overrides: Partial<EventBindingV3> = {}): EventBindingV3 {
  return { id: 'event-page-enter', enabled: true, event: 'pageEnter', actions: [refresh()], ...overrides }
}

function clickEvent(overrides: Partial<EventBindingV3> = {}): EventBindingV3 {
  return {
    id: 'event-click', enabled: true, event: 'click',
    conditions: [{ left: { kind: 'eventField', path: '/datum/dept~1name' }, operator: 'notEmpty' }],
    actions: [refresh('action-chart-refresh', ['component-chart'])],
    ...overrides,
  }
}

test('P9.3 frozen eventField contract has no pageEnter field and uses escaped real bindings', () => {
  const source = fixture()
  assert.deepEqual(authorableEventNamesV3(pageOwner()), ['pageEnter'])
  assert.deepEqual(authorableEventNamesV3(chartOwner()), ['click', 'doubleClick'])
  assert.deepEqual(authorableEventNamesV3(tableOwner()), ['click', 'doubleClick', 'rowClick'])
  assert.deepEqual(eventFieldCapabilitiesForOwnerV3(source, pageOwner(), 'pageEnter'), [])
  assert.deepEqual(eventFieldCapabilitiesForOwnerV3(source, chartOwner(), 'click').map((item) => item.path), [
    '/datum/dept~1name', '/datum/amount~0net',
  ])
  assert.deepEqual(eventFieldCapabilitiesForOwnerV3(source, tableOwner(), 'rowClick').map((item) => item.path), [
    '/row/department', '/row/amount',
  ])
  assert.deepEqual(eventFieldCapabilitiesForOwnerV3(source, tabsOwner(), 'click').map((item) => item.path), [
    '/datum/tab_id', '/datum/tab_label', '/datum/tab_value',
  ])
  assert.throws(() => createEventBindingV3(source, pageOwner(), pageEvent({ conditions: [
    { left: { kind: 'eventField', path: '/page/id' }, operator: 'isEmpty' },
  ] })), /真实绑定目录/)
  assert.throws(() => createEventBindingV3(source, chartOwner(), clickEvent({ conditions: [
    { left: { kind: 'eventField', path: '/datum/__proto__' }, operator: 'isEmpty' },
  ] })), /真实绑定目录/)
})

test('P9.3 create and update preserve order and source immutability', () => {
  const source = fixture()
  const created = createEventBindingV3(source, pageOwner(), pageEvent({ actions: [
    { id: 'action-parameter', type: 'setParameter', assignments: [{ parameterId: 'parameter-year', value: { kind: 'fixed', value: '2026' } }] },
    refresh(),
  ] }))
  const updated = updateEventBindingV3(created, pageOwner(), pageEvent({ enabled: false, actions: [refresh(), {
    id: 'action-parameter', type: 'setParameter', assignments: [{ parameterId: 'parameter-year', value: { kind: 'fixed', value: '2026' } }],
  }] }))
  assert.deepEqual(source.pages[0].pageEvents, [])
  assert.equal(updated.pages[0].pageEvents[0].enabled, false)
  assert.deepEqual(updated.pages[0].pageEvents[0].actions.map((item) => item.id), ['action-refresh', 'action-parameter'])
})

test('P9.3 authorability makes over-policy legacy bindings fully read-only', () => {
  const source = fixture()
  const legacy = clickEvent({ conditions: [{ left: { kind: 'eventField', path: 'datum.value' }, operator: 'isEmpty' }] })
  source.pages[0].components[0].events = [legacy]
  const inspection = inspectEventBindingAuthorabilityV3(source, chartOwner(), legacy)
  assert.equal(inspection.authorable, false)
  assert.equal(inspection.readOnly, true)
  assert.match(inspection.reasons.join('；'), /真实绑定目录/)
  assert.throws(() => updateEventBindingV3(source, chartOwner(), { ...legacy, enabled: false }), /真实绑定目录/)
  assert.throws(() => deleteEventBindingV3(source, chartOwner(), legacy.id), /真实绑定目录/)
  assert.equal(source.pages[0].components[0].events?.[0].enabled, true)
})

test('P10.7 resolved dialog owner supports safe event authoring despite a stale page type snapshot', () => {
  const source = fixture()
  const existing = pageEvent()
  source.pages[0].pageEvents = [existing]
  source.pages[0].type = 'dialog'
  const stale = pageOwner()
  assert.equal(inspectEventBindingAuthorabilityV3(source, stale, existing).readOnly, false)
  assert.equal(updateEventBindingV3(source, stale, { ...existing, enabled: false }).pages[0].pageEvents[0].enabled, false)
  assert.equal(deleteEventBindingV3(source, stale, existing.id).pages[0].pageEvents.length, 0)
  assert.equal(source.pages[0].pageEvents[0].enabled, true)
})

test('P9.3 create ID collision and missing or cross-owner update fail atomically', () => {
  const source = fixture()
  const withClick = createEventBindingV3(source, chartOwner(), clickEvent())
  assert.throws(() => createEventBindingV3(withClick, pageOwner(), pageEvent({ id: 'event-click' })), /ID 已存在/)
  assert.throws(() => updateEventBindingV3(withClick, pageOwner(), pageEvent({ id: 'missing' })), /事件不存在/)
  assert.throws(() => updateEventBindingV3(withClick, pageOwner(), { ...clickEvent(), event: 'pageEnter', conditions: undefined }), /事件不存在/)
  assert.deepEqual(withClick.pages[0].pageEvents, [])
  assert.equal(withClick.pages[0].components[0].events?.length, 1)
})

test('P9.3 validates right values, references, duplicate names and multi-component Refresh', () => {
  const source = fixture()
  assert.throws(() => createEventBindingV3(source, pageOwner(), pageEvent({ conditions: [
    { left: { kind: 'fixed', value: 1 }, operator: 'eq' },
  ] })), /必须配置 right/)
  assert.throws(() => createEventBindingV3(source, pageOwner(), pageEvent({ actions: [{
    id: 'bad-parameter', type: 'setParameter', assignments: [{ parameterId: 'missing', value: { kind: 'fixed', value: null } }],
  }] })), /参数不存在/)
  const multi = createEventBindingV3(source, chartOwner(), clickEvent({ actions: [
    refresh('multi-refresh', ['component-chart', 'component-table']),
  ] }))
  assert.deepEqual((multi.pages[0].components[0].events?.[0].actions[0] as { target: { componentIds: string[] } }).target.componentIds,
    ['component-chart', 'component-table'])
  assert.throws(() => createEventBindingV3(multi, chartOwner(), { ...clickEvent({ id: 'event-click-2' }), conditions: undefined }), /已存在 click/)
})

test('P9.3 empty debounce is omitted and failed editor apply preserves the input', () => {
  const editor = useEventConfigEditorV3()
  const draft = createEventDraftV3('pageEnter', () => 'event-new')
  assert.equal('debounceMs' in draft, false)
  editor.begin(pageEvent())
  editor.draft.value!.enabled = false
  editor.markDirty()
  const before = JSON.parse(JSON.stringify(editor.draft.value!)) as EventBindingV3
  assert.equal(editor.apply(() => 'validation failed'), false)
  assert.deepEqual(editor.draft.value, before)
  assert.equal(editor.dirty.value, true)
  assert.equal(editor.error.value, 'validation failed')
})
