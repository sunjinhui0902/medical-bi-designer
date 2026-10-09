import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import { previewLocalDashboardEdit, assertLocalEditCurrent } from '../src/services/localDashboardEdit.ts'

function fixture() {
  const app = createDefaultDashboardApplicationV3()
  app.pages[0]!.components = [{ id: 'chart', type: 'line', title: '收入趋势', position: { x: 24, y: 24, width: 500, height: 300, zIndex: 1 }, dataConfig: { version: 3, sourceKind: 'server', datasetId: 'local-series:income:2026-01:2026-08', dimensions: [{ field: 'month', role: 'category' }], measures: [{ field: 'value', aggregation: 'sum' }], filters: [], sort: [], limit: 200, parameterBindings: [], refreshPolicy: 'onPageEnter' }, styleConfig: { background: '#ffffff', titleSize: 16 } }]
  app.extensionRefs.localGeneration = { metricDefinition: 'PROVISIONAL_LOCAL_USE' }
  return app
}
test('presentation commands clone input and preserve all unrelated fields', () => {
  for (const [command, field, value] of [['标题改为收入走势','title','收入走势'],['背景色改为#EAF3FF','background','#EAF3FF'],['字号改为24','titleSize',24],['标题颜色改为#2367A3','titleColor','#2367A3'],['标题加粗','titleWeight',700],['标题半粗','titleWeight',600],['标题常规','titleWeight',400],['标题粗细改为600','titleWeight',600]] as const) {
    const app = fixture(), original = JSON.stringify(app)
    const edit = previewLocalDashboardEdit(app, app.pages[0]!.id, 'chart', command)
    assert.equal(JSON.stringify(app), original)
    const expected = JSON.parse(original)
    if (field === 'title') expected.pages[0].components[0].title = value
    else expected.pages[0].components[0].styleConfig[field] = value
    assert.deepEqual(edit.after, expected)
    assertLocalEditCurrent(edit.after, edit.after)
    assert.deepEqual(edit.before, app)
  }
})
test('invalid commands and targets cannot mutate the application', () => {
  const app = fixture()
  for (const command of ['背景色改为red','标题颜色改为red','标题粗细改为999','字号改为0','字号改为999','删除全部组件','当前页图表左对齐']) {
    assert.throws(() => previewLocalDashboardEdit(app, app.pages[0]!.id, 'chart', command))
  }
  assert.throws(() => previewLocalDashboardEdit(app, app.pages[0]!.id, 'missing', '字号改为24'))
})
test('page alignment changes only one coordinate of top-level native charts, excluding tabs ownership', () => {
  for (const [command, axis] of [['当前页图表左对齐', 'x'], ['当前页图表顶部对齐','y']] as const) {
    const app = fixture(), page = app.pages[0]!
    const second = structuredClone(page.components[0]!); second.id = 'second'; second.position.x = 600; second.position.y = 400
    const third = structuredClone(second); third.id = 'third'; third.position.x = 40; third.position.y = 800
    const nested = structuredClone(second); nested.id = 'nested'; nested.position.x = 1; nested.position.y = 1
    const tabs = structuredClone(second); tabs.id = 'tabs'; tabs.type = 'tabs'; tabs.position.y = 1200
    tabs.tabsConfig = { items: [{ id: 'item', label: '标签', value: 'item', componentIds: ['nested'], visible: true, padding: 8, gap: 8, background: '#fff' }], activeItemId: 'item', alignment: 'left', titlePosition: 'top', stylePreset: 'default', titleSize: 38 }
    const nonChart = structuredClone(second); nonChart.id = 'medical'; nonChart.type = 'income'; nonChart.position.y = 1800
    page.components.push(second, third, nested, tabs, nonChart)
    const otherPage = structuredClone(page); otherPage.id = 'other'; otherPage.code = 'other'; otherPage.order = 2
    otherPage.components = []; app.pages.push(otherPage)
    const original = JSON.stringify(app)
    const edit = previewLocalDashboardEdit(app, page.id, '', command)
    assert.equal(JSON.stringify(app), original)
    const expected = JSON.parse(original)
    for (const c of expected.pages[0].components.slice(0,3)) c.position[axis] = 24
    assert.deepEqual(edit.after, expected)
    assert.equal(edit.changes.length, 2)
    const changed = structuredClone(edit.before); changed.pages[0]!.components[1]!.position.x++
    assert.throws(() => assertLocalEditCurrent(changed, edit.before), /发生变化/)
  }
})
test('alignment reports new overlaps and rejects already-aligned charts', () => {
  const app = fixture(), page = app.pages[0]!
  const second = structuredClone(page.components[0]!); second.id = 'second'; second.position.x = 600
  page.components.push(second)
  const edit = previewLocalDashboardEdit(app, page.id, '', '图表左对齐')
  assert.match(edit.warnings[0]!, /新增1处组件重叠/)
  assert.throws(() => previewLocalDashboardEdit(edit.after, page.id, '', '图表左对齐'), /已经对齐/)
  assert.equal(JSON.stringify(edit.before), JSON.stringify(app))
})
test('stale preview and later manual changes block apply or undo', () => {
  const app = fixture(), edit = previewLocalDashboardEdit(app, app.pages[0]!.id, 'chart', '标题改为收入走势')
  assertLocalEditCurrent(app, edit.before)
  assertLocalEditCurrent({ ...app, updatedAt: '2026-09-29' }, edit.before)
  assert.throws(() => assertLocalEditCurrent(edit.after, edit.before), /发生变化/)
  const changed = structuredClone(edit.after); changed.name = '手工更名'
  assert.throws(() => assertLocalEditCurrent(changed, edit.after), /发生变化/)
  assert.equal(JSON.stringify(edit.before), JSON.stringify(app))
})
test('editing a non-default page preserves other pages and runtime metadata', () => {
  const app = fixture()
  const page = structuredClone(app.pages[0]!); page.id = 'second'; page.code = 'second'; page.order = 2; page.components[0]!.id = 'second-chart'
  app.pages.push(page)
  const edit = previewLocalDashboardEdit(app, 'second', 'second-chart', '标题改为第二页走势')
  assert.deepEqual(edit.after.pages[0], app.pages[0])
  assert.equal(edit.after.defaultPageId, app.defaultPageId)
  assert.deepEqual(edit.after.runtimePolicy, app.runtimePolicy)
  assert.deepEqual(edit.after.parameters, app.parameters)
})
