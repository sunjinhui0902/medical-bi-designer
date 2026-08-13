import assert from 'node:assert/strict'
import test from 'node:test'

import type { DashboardComponentV3 } from '../src/models/dashboard-v3.ts'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import {
  copyPageV3,
  createPageV3,
  deletePageV3,
  reorderPagesV3,
  setDefaultPageV3,
  type PageIdFactoryV3,
} from '../src/services/pageManagerV3.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'

const copiedId: PageIdFactoryV3 = (kind, sourceId) => `copy-${kind}-${sourceId}`

function component(id: string): DashboardComponentV3 {
  return {
    id, type: 'bar', title: id,
    position: { x: 0, y: 0, width: 320, height: 240, zIndex: 1 },
    dataConfig: { version: 2, sourceKind: 'dataset', datasetId: 'dataset-a', dimensions: [], measures: [], filters: [], sort: [], limit: 100 },
    styleConfig: { background: '#fff', titleColor: '#000', titleSize: 16, titleWeight: 600, titleVisible: true },
  }
}

function sourceApplication() {
  const application = createDefaultDashboardApplicationV3()
  application.parameters.push({
    id: 'parameter-year', code: 'year', name: 'Year', type: 'string', scope: 'application', required: false,
    source: { kind: 'static', options: [{ label: '2026', value: '2026' }] },
  })
  application.pages[0].controls.push({
    id: 'control-year', type: 'singleSelect', parameterIds: ['parameter-year'],
    position: { x: 0, y: 0, width: 100, height: 32, zIndex: 1 }, styleConfig: {},
    interaction: { submitMode: 'immediate', clearable: true },
  })
  const chart = component('component-chart')
  chart.events = [{
    id: 'event-chart-click', enabled: true, event: 'click', actions: [{
      id: 'action-refresh-component', type: 'refresh', target: { kind: 'components', componentIds: ['component-chart'] },
    }],
  }]
  application.pages[0].components.push(chart)
  application.pages[0].pageEvents.push({
    id: 'event-page-enter', enabled: true, event: 'pageEnter', actions: [{
      id: 'action-refresh-page', type: 'refresh', target: { kind: 'page', pageId: application.pages[0].id },
    }],
  })
  return application
}

test('P9.1 creates an empty page without mutating its source', () => {
  const source = sourceApplication()
  const result = createPageV3(source, { name: 'Detail', code: 'detail' }, copiedId)
  assert.equal(source.pages.length, 1)
  assert.equal(result.application.pages.length, 2)
  assert.equal(result.application.pages[1].order, 2)
  assert.deepEqual(result.application.pages[1].components, [])
})

test('P9.1 copies page entities and rewrites internal refresh targets', () => {
  const source = sourceApplication()
  const result = copyPageV3(source, source.defaultPageId, { name: 'Copy', code: 'copy' }, copiedId)
  const copied = result.application.pages[1]
  assert.equal(copied.id, 'copy-page-page-home')
  assert.equal(copied.components[0].id, 'copy-component-component-chart')
  assert.equal(copied.controls[0].id, 'copy-control-control-year')
  assert.equal(copied.pageEvents[0].id, 'copy-event-event-page-enter')
  assert.equal(copied.pageEvents[0].actions[0].id, 'copy-action-action-refresh-page')
  assert.deepEqual(copied.pageEvents[0].actions[0], {
    id: 'copy-action-action-refresh-page', type: 'refresh', target: { kind: 'page', pageId: copied.id },
  })
  assert.deepEqual(copied.components[0].events?.[0].actions[0], {
    id: 'copy-action-action-refresh-component', type: 'refresh',
    target: { kind: 'components', componentIds: ['copy-component-component-chart'] },
  })
  assert.equal(validateDashboardApplicationV3(result.application).valid, true)
})

test('P9.1 rejects deletion of the last or current default page', () => {
  const source = sourceApplication()
  assert.throws(() => deletePageV3(source, source.defaultPageId))
  const created = createPageV3(source, { name: 'Detail', code: 'detail' }, copiedId).application
  assert.throws(() => deletePageV3(created, created.defaultPageId))
})

test('P9.1 deletes a non-default page and normalizes order', () => {
  const created = createPageV3(sourceApplication(), { name: 'Detail', code: 'detail' }, copiedId)
  const deleted = deletePageV3(created.application, created.pageId)
  assert.equal(deleted.pages.length, 1)
  assert.equal(deleted.pages[0].order, 1)
})

test('P9.1 reorders every page exactly once', () => {
  const created = createPageV3(sourceApplication(), { name: 'Detail', code: 'detail' }, copiedId).application
  const reordered = reorderPagesV3(created, [created.pages[1].id, created.pages[0].id])
  assert.deepEqual(reordered.pages.map((page) => [page.id, page.order]), [[created.pages[1].id, 1], [created.pages[0].id, 2]])
  assert.throws(() => reorderPagesV3(created, [created.pages[0].id, created.pages[0].id]))
})

test('P9.1 sets default page only to an existing page', () => {
  const created = createPageV3(sourceApplication(), { name: 'Detail', code: 'detail' }, copiedId)
  assert.equal(setDefaultPageV3(created.application, created.pageId).defaultPageId, created.pageId)
  assert.throws(() => setDefaultPageV3(created.application, 'missing'))
})

test('P10.1 page commands explicitly create and preserve dialog page types', () => {
  const source = sourceApplication()
  const created = createPageV3(source, { name: 'Dialog', code: 'dialog', type: 'dialog' }, copiedId)
  assert.equal(created.application.pages[1].type, 'dialog')
  assert.equal(validateDashboardApplicationV3(created.application).valid, true)

  source.pages[0].type = 'dialog'
  assert.equal(validateDashboardApplicationV3(source).valid, true)
  const copied = copyPageV3(source, source.defaultPageId, { name: 'Dialog copy', code: 'dialog_copy' }, copiedId)
  assert.equal(copied.application.pages[1].type, 'dialog')
})
