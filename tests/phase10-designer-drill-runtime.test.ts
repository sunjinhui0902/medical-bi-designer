import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultDashboardApplicationV3, type DashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import type { DashboardComponent } from '../src/models/dashboard.ts'
import { createDesignerEventRuntimeV3 } from '../src/services/designerEventRuntimeV3.ts'
import { ParameterRuntimeStoreV3 } from '../src/services/parameterRuntimeV3.ts'

function component(id: string, field: string): DashboardComponent {
  return { id, type: 'table', title: id, position: { x: 0, y: 0, width: 200, height: 120, zIndex: 1 }, dataConfig: { version: 3, sourceKind: 'server', datasetId: `dataset-${id}`, dimensions: [{ field, role: 'category' }], measures: [], filters: [], sort: [], limit: 100, parameterBindings: [], refreshPolicy: 'manual' }, styleConfig: { background: '#fff', borderColor: '#ddd', borderWidth: 1, borderRadius: 0, padding: 0, shadow: false, titleVisible: true, titleColor: '#000', titleSize: 12, titleWeight: 400 } }
}

function application(): DashboardApplicationV3 {
  const app = createDefaultDashboardApplicationV3()
  app.parameters = [
    { id: 'region', code: 'region', name: 'region', type: 'string', scope: 'application', required: false, defaultValue: 'R0', source: { kind: 'static', options: [] } },
    { id: 'store', code: 'store', name: 'store', type: 'string', scope: 'application', required: false, defaultValue: 'S0', source: { kind: 'static', options: [] } },
  ]
  app.drillPaths = [{ id: 'commerce', name: 'commerce', levels: [{ id: 'region-level', label: 'Region', field: 'region_code', parameterId: 'region' }, { id: 'store-level', label: 'Store', field: 'store_code', parameterId: 'store' }] }]
  const region = component('region-table', 'region_code')
  region.events = [{ id: 'region-click', enabled: true, event: 'click', actions: [{ id: 'region-down', type: 'drillDown', pathId: 'commerce' }, { id: 'to-store', type: 'navigatePage', pageId: 'page-store', history: 'push' }] }]
  app.pages[0].components = [region]
  const page = structuredClone(app.pages[0]); page.id = 'page-store'; page.code = 'store'; page.name = 'store'; page.order = 2
  const store = component('store-table', 'store_code')
  store.events = [{ id: 'store-row', enabled: true, event: 'rowClick', actions: [{ id: 'store-down', type: 'drillDown', pathId: 'commerce' }] }]
  page.components = [store]; page.pageEvents = []; app.pages.push(page)
  return app
}

test('P10.4 Designer runtime carries real datum and row payloads across page navigation', async () => {
  const app = application(); const parameters = new ParameterRuntimeStoreV3(app.parameters)
  const snapshots: string[] = []
  const runtime = createDesignerEventRuntimeV3({ application: app, parameters, queryRuntime: { describe(component) { return { component, componentId: component.id, datasetId: component.dataConfig.version === 3 ? component.dataConfig.datasetId : '', parameters: {}, limit: 100, queryKey: component.id } }, async execute(descriptor) { return { queryKey: descriptor.queryKey, source: 'network' } } }, onInteractionState(snapshot) { snapshots.push(`${snapshot.activePageId}:${snapshot.drills[0]?.frames.length ?? 0}`) } })
  const first = await runtime.triggerComponentClick('page-home', 'region-table', { region_code: 'R1' })
  assert.equal(first?.status, 'completed', JSON.stringify(first)); assert.equal(parameters.get('region'), 'R1'); assert.equal(runtime.interactionSnapshot().activePageId, 'page-store')
  const second = await runtime.triggerComponentRowClick?.('page-store', 'store-table', { store_code: 'S1' })
  assert.equal(second?.status, 'completed', JSON.stringify(second)); assert.equal(parameters.get('store'), 'S1')
  assert.deepEqual(runtime.interactionSnapshot().drills[0].frames.map((frame) => frame.value), ['R1', 'S1']); assert.deepEqual(snapshots, ['page-store:1', 'page-store:2'])
  const cleared = runtime.clearInteractions(); assert.deepEqual(cleared.drills, []); assert.equal(parameters.get('region'), 'R0'); assert.equal(parameters.get('store'), 'S0')
  runtime.cancel()
})
