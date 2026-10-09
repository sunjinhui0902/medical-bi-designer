import test from 'node:test'
import assert from 'node:assert/strict'
import { createBusinessInteractionDraft } from '../src/services/businessInteractionDraft.ts'
import { createDesignerEventRuntimeV3 } from '../src/services/designerEventRuntimeV3.ts'
import { ParameterRuntimeStoreV3 } from '../src/services/parameterRuntimeV3.ts'
const sample = { month: '2026-08', observedAt: '2026-09-29', departmentCount: 8, doctorCount: 80 }
test('sample pages contain their components without clipping or coordinate repair on entry', () => {
  const app = createBusinessInteractionDraft(sample, 'bounds')
  for (const page of app.pages) for (const component of page.components) {
    assert.ok(component.position.x + component.position.width <= page.canvas.width)
    assert.ok(component.position.y + component.position.height <= page.canvas.height)
  }
})
function fixture() {
  const app = createBusinessInteractionDraft(sample, 'business'), store = new ParameterRuntimeStoreV3(app.parameters)
  const runtime = createDesignerEventRuntimeV3({ application: app, parameters: store, queryRuntime: { describe(component) { return { component, componentId: component.id, datasetId: component.dataConfig.datasetId, parameters: {}, limit: 200, queryKey: component.id } }, async execute(descriptor) { return { queryKey: descriptor.queryKey, source: 'network' } } } })
  return { app, store, runtime }
}
test('business draft validates and carries sample/provenance without actual records in configuration', () => {
  const { app } = fixture()
  assert.equal(app.pages.length, 3); assert.equal(app.drillPaths![0]!.levels.length, 2)
  assert.equal(app.extensionRefs.localGeneration.businessSample, true)
  assert.ok(app.pages[0]!.components.some(c => c.textConfig?.content.includes('不是实时数据或全院合计')))
  assert.throws(() => createBusinessInteractionDraft({ ...sample, doctorCount: 0 }), /尚不可用/)
})
test('empty payload never drills or navigates and rapid clicks advance only once', async () => {
  const { app, store, runtime } = fixture(), home = app.pages[0]!.id
  await runtime.triggerComponentRowClick!(home, 'business-drill-source', { dept_id: null })
  assert.equal(runtime.interactionSnapshot().drills.length, 0); assert.equal(runtime.interactionSnapshot().activePageId, home)
  const row = { dept_id: 'a'.repeat(32), department: '科室', visits: 10, month: '2026-08' }
  await Promise.all([runtime.triggerComponentRowClick!(home, 'business-drill-source', row), runtime.triggerComponentRowClick!(home, 'business-drill-source', row)])
  assert.equal(runtime.interactionSnapshot().drills[0]!.frames.length, 1)
  assert.equal(runtime.interactionSnapshot().activePageId, 'business-doctors-page'); assert.equal(store.get('business-department'), row.dept_id)
  runtime.cancel()
})
test('doctor drill, cross-page return and one-click restart restore parameters and frames', async () => {
  const { app, store, runtime } = fixture(), home = app.pages[0]!.id
  await runtime.triggerComponentRowClick!(home, 'business-drill-source', { dept_id: 'a'.repeat(32) })
  await runtime.triggerComponentRowClick!('business-doctors-page', 'business-doctors', { dept_id: 'a'.repeat(32), doctor_id: 'b'.repeat(32) })
  assert.equal(runtime.interactionSnapshot().drills[0]!.frames.length, 2)
  assert.equal(store.get('business-doctor'), 'b'.repeat(32))
  runtime.pageBack(); assert.equal(runtime.interactionSnapshot().activePageId, 'business-doctors-page')
  await runtime.triggerComponentClick('business-doctors-page', 'business-doctor-reset')
  assert.equal(runtime.interactionSnapshot().activePageId, home)
  assert.equal(runtime.interactionSnapshot().drills.length, 0); assert.equal(runtime.interactionSnapshot().linkages.length, 0)
  assert.ok(store.get('business-department') == null); assert.ok(store.get('business-doctor') == null)
  runtime.cancel()
})

test('clear linkage restores both empty and explicit department baselines', async () => {
  for (const baseline of [null, 'c'.repeat(32)]) {
    const { app, store, runtime } = fixture(), home = app.pages[0]!.id
    if (baseline !== null) store.commit([{ parameterId: 'business-department', value: baseline }])
    await runtime.triggerComponentRowClick!(home, 'business-link-source', { dept_id: 'a'.repeat(32) })
    assert.equal(store.get('business-department'), 'a'.repeat(32))
    await runtime.clearLinkage()
    assert.equal(store.get('business-department') ?? null, baseline)
    assert.equal(runtime.interactionSnapshot().linkages.length, 0)
    runtime.cancel()
  }
})
