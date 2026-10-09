import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import type { DashboardComponent } from '../src/models/dashboard.ts'
import { previewLocalDashboardEdit, assertLocalEditCurrent, listLocalLayoutTargets } from '../src/services/localDashboardEdit.ts'

function fixture() {
  const app = createDefaultDashboardApplicationV3()
  const page = app.pages[0]!; page.canvas.height = 1400
  const chart = (id: string, x: number, y: number, width: number, height: number): DashboardComponent => ({ id, title: id, type: 'line', position: { x, y, width, height, zIndex: 1 }, dataConfig: { version: 3, sourceKind: 'server', datasetId: 'local-series:income:2026-01:2026-08', dimensions: [{ field: 'month', role: 'category' }], measures: [{ field: 'value', aggregation: 'sum' }], filters: [], sort: [], limit: 200, parameterBindings: [], refreshPolicy: 'onPageEnter' }, styleConfig: { background: '#fff', titleColor: '#243447', titleSize: 16, titleWeight: 600, titleVisible: true } })
  page.components = [chart('a',24,24,150,120), chart('b',230,300,200,140), chart('c',800,700,150,120)]
  const nested = chart('nested',1,1,150,120), tabs = chart('tabs',24,1100,500,200)
  tabs.type = 'tabs'; tabs.tabsConfig = { items: [{ id: 'item', label: '标签', value: 'item', componentIds: ['nested'], visible: true, padding: 8, gap: 8, background: '#fff' }], activeItemId: 'item', alignment: 'left', titlePosition: 'top', stylePreset: 'default', titleSize: 38 }
  const nonChart = chart('medical',700,1100,200,200); nonChart.type = 'income'
  page.components.push(nested,tabs,nonChart)
  const other = structuredClone(page); other.id = 'other'; other.code = 'other'; other.order = 2; other.components = []
  app.pages.push(other); app.extensionRefs.localGeneration = { metricDefinition: 'PROVISIONAL_LOCAL_USE' }
  return app
}
test('unequal charts distribute equal edge gaps within the original envelope and only change one coordinate', () => {
  for (const [command, axis, dimension, middle] of [['当前页图表水平等间距分布','x','width',387], ['当前页图表垂直等间距分布','y','height',352]] as const) {
    const app = fixture(), original = JSON.stringify(app)
    const edit = previewLocalDashboardEdit(app, app.pages[0]!.id, '', command)
    const expected = JSON.parse(original); expected.pages[0].components[1].position[axis] = middle
    assert.deepEqual(edit.after, expected); assert.equal(JSON.stringify(app), original)
    const [a,b,c] = edit.after.pages[0]!.components
    assert.equal(b!.position[axis] - a!.position[axis] - a!.position[dimension], c!.position[axis] - b!.position[axis] - b!.position[dimension])
    assert.throws(() => previewLocalDashboardEdit(edit.after, app.pages[0]!.id, '', command), /无需调整/)
    assertLocalEditCurrent(edit.after, edit.after)
    assert.deepEqual(edit.before, app)
  }
})
test('width, height and combined size only change requested dimensions, preserving all excluded components', () => {
  for (const [command,width,height] of [['当前页图表宽度统一为400',400,undefined], ['当前页图表高度统一为260',undefined,260], ['当前页图表尺寸统一为400×260',400,260], ['图表尺寸统一为400x260',400,260]] as const) {
    const app = fixture(), original = JSON.stringify(app)
    const edit = previewLocalDashboardEdit(app, app.pages[0]!.id, '', command)
    const expected = JSON.parse(original)
    expected.pages[0].components.slice(0,3).forEach(c => { if (width !== undefined) c.position.width = width; if (height !== undefined) c.position.height = height })
    assert.deepEqual(edit.after, expected); assert.equal(JSON.stringify(app), original)
    const stale = structuredClone(edit.after); stale.pages[0]!.components[0]!.position.width++
    assert.throws(() => assertLocalEditCurrent(stale, edit.after), /发生变化/)
  }
})
test('insufficient span, canvas overflow and invalid sizes fail atomically', () => {
  const app = fixture(), page = app.pages[0]!
  for (const command of ['图表尺寸统一为99×260','图表宽度统一为0','图表宽度统一为500','图表高度统一为800','图表尺寸统一为400×-1','图表尺寸统一为400.5x260']) {
    const original = JSON.stringify(app)
    assert.throws(() => previewLocalDashboardEdit(app, page.id, '', command))
    assert.equal(JSON.stringify(app), original)
  }
  page.components[2]!.position.x = 300
  assert.throws(() => previewLocalDashboardEdit(app, page.id, '', '图表水平等间距分布'), /跨度不足/)
  page.components.splice(2,1)
  assert.throws(() => previewLocalDashboardEdit(app, page.id, '', '图表垂直等间距分布'), /三个/)
})
test('new resizing overlaps are warned and stable original component order is retained', () => {
  const app = fixture(), page = app.pages[0]!
  page.components[1]!.position.y = 24
  const edit = previewLocalDashboardEdit(app, page.id, '', '图表宽度统一为400')
  assert.match(edit.warnings[0]!, /新增1处组件重叠/)
  assert.deepEqual(edit.after.pages[0]!.components.map(c => c.id), page.components.map(c => c.id))
})

test('explicit subset changes only selected positions and dimensions, preserving other charts and bindings', () => {
  for (const command of ['图表左对齐', '图表顶部对齐', '图表尺寸统一为200×150', '图表宽度统一为300', '图表高度统一为200']) {
    const app = fixture(), original = structuredClone(app), pageId = app.pages[0]!.id
    const edit = previewLocalDashboardEdit(app, pageId, '', command, { layoutTargetIds: ['a', 'b'] })
    const expected = structuredClone(original)
    for (const id of ['a', 'b']) {
      const component = expected.pages[0]!.components.find(c => c.id === id)!
      if (command.includes('左对齐')) component.position.x = 24
      else if (command.includes('顶部对齐')) component.position.y = 24
      else if (command.includes('尺寸')) { component.position.width = 200; component.position.height = 150 }
      else if (command.includes('宽度')) component.position.width = 300
      else component.position.height = 200
    }
    assert.deepEqual(edit.after, expected); assert.deepEqual(app, original)
    assert.match(edit.summary, /选中2/)
  }
})

test('empty, duplicate, missing, nested, nonchart and cross-page selections never fall back to all charts', () => {
  const app = fixture(), original = structuredClone(app), pageId = app.pages[0]!.id
  const otherChart = structuredClone(app.pages[0]!.components[0]!); otherChart.id = 'other-chart'
  app.pages[1]!.components.push(otherChart)
  const frozen = structuredClone(app)
  assert.deepEqual(listLocalLayoutTargets(app, pageId).map(c => c.id), ['a', 'b', 'c'])
  for (const ids of [[], ['a', 'a'], ['a', 'missing'], ['a', 'nested'], ['a', 'medical'], ['a', 'other-chart']]) {
    assert.throws(() => previewLocalDashboardEdit(app, pageId, '', '图表左对齐', { layoutTargetIds: ids }), /重新勾选/)
    assert.deepEqual(app, frozen)
  }
  assert.throws(() => previewLocalDashboardEdit(app, pageId, '', '图表水平等间距分布', { layoutTargetIds: ['a', 'b'] }), /三个/)
  assert.throws(() => previewLocalDashboardEdit(app, pageId, '', '图表宽度统一为9999', { layoutTargetIds: ['a', 'b'] }), /越出/)
  assert.deepEqual(app.pages[0], original.pages[0])
})

test('selected distribution keeps selected envelope and warns about overlaps with unselected charts', () => {
  for (const [command, axis, middle] of [['图表水平等间距分布', 'x', 387], ['图表垂直等间距分布', 'y', 352]] as const) {
    const app = fixture(), page = app.pages[0]!, untouched = structuredClone(page.components[0]!)
    untouched.id = 'untouched'; untouched.position.x = 1100; untouched.position.y = 1000; page.components.push(untouched)
    const expected = structuredClone(app); expected.pages[0]!.components[1]!.position[axis] = middle
    const edit = previewLocalDashboardEdit(app, page.id, '', command, { layoutTargetIds: ['c', 'a', 'b'] })
    assert.deepEqual(edit.after, expected)
  }
  const app = fixture(), page = app.pages[0]!
  page.components[2]!.position = { x: 400, y: 24, width: 150, height: 120, zIndex: 1 }
  const edit = previewLocalDashboardEdit(app, page.id, '', '图表宽度统一为500', { layoutTargetIds: ['a', 'b'] })
  assert.ok(edit.warnings.some(w => /重叠/.test(w)))
  assert.deepEqual(edit.after.pages[0]!.components[2], page.components[2])
  const stale = structuredClone(edit.before); stale.pages[0]!.components[2]!.position.y++
  assert.throws(() => assertLocalEditCurrent(stale, edit.before), /发生变化/)
})
