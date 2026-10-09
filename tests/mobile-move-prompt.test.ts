import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import type { DashboardComponent } from '../src/models/dashboard.ts'
import { responsiveLayoutV3 } from '../src/services/responsiveLayoutV3.ts'
import { listLocalMoveTargets, previewLocalDashboardMove } from '../src/services/localDashboardEdit.ts'
import { buildOutpatientPortablePrompt, compileOutpatientPromptPlan, outpatientPlanExample, parseOutpatientPromptPlan } from '../src/services/outpatientPromptPlan.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'
import { createComponentQueryRefreshV3 } from '../src/services/componentQueryRefreshV3.ts'
import { QueryRuntimeCacheV3 } from '../src/services/queryRuntimeCacheV3.ts'

function fixture() {
  const app = createDefaultDashboardApplicationV3(), page = app.pages[0]!
  page.canvas.height = 1600
  const component = (id: string, x: number, y: number): DashboardComponent => ({ id, title: id, type: 'line', position: { x, y, width: 300, height: 200, zIndex: 1 }, dataConfig: { version: 3, sourceKind: 'mock', datasetId: 'income', dimensions: [], measures: [], filters: [], sort: [], limit: 200, parameterBindings: [], refreshPolicy: 'onPageEnter' }, styleConfig: { background: '#fff', titleColor: '#243447', titleSize: 16, titleWeight: 600, titleVisible: true } })
  page.components = [component('a', 24, 24), component('b', 500, 24), component('c', 24, 400)]
  return app
}
test('mobile reflows rows without mutating desktop coordinates or data and events', () => {
  const app = fixture(), before = structuredClone(app)
  const layout = responsiveLayoutV3(app.pages[0]!.components, 390)
  assert.equal(layout.positions.a!.width, 366)
  assert.ok(layout.positions.b!.y >= layout.positions.a!.y + layout.positions.a!.height)
  assert.ok(layout.positions.c!.y >= layout.positions.b!.y + layout.positions.b!.height)
  assert.deepEqual(app, before)
  assert.throws(() => responsiveLayoutV3(app.pages[0]!.components, NaN))
})
test('group movement preserves relative positions and refuses partial out-of-bounds changes', () => {
  const app = fixture(), page = app.pages[0]!, before = structuredClone(app)
  assert.equal(listLocalMoveTargets(app, page.id).length, 3)
  const edit = previewLocalDashboardMove(app, page.id, '', ['a', 'b'], 20, 30)
  assert.equal(edit.after.pages[0]!.components[1]!.position.x - edit.after.pages[0]!.components[0]!.position.x, 476)
  assert.deepEqual(edit.after.pages[0]!.components[2], page.components[2])
  assert.deepEqual(edit.after.pages[0]!.components[0]!.dataConfig, page.components[0]!.dataConfig)
  assert.throws(() => previewLocalDashboardMove(app, page.id, '', ['a', 'b'], -25, 0), /越出/)
  assert.deepEqual(app, before)
  assert.match(previewLocalDashboardMove(app, page.id, '', ['a'], 0, 300).warnings[0]!, /重叠/)
})

test('server page sizes and unpaged results never share a query cache key', () => {
  const component = fixture().pages[0]!.components[0]!
  component.type = 'table'; component.dataConfig.sourceKind = 'server'
  const runtime = createComponentQueryRefreshV3({ cache: new QueryRuntimeCacheV3(), load: async () => ({ rows: [] }) })
  const originalKey = runtime.describe(component, {})!.queryKey
  component.tableConfig = { columns: [], striped: true, showHeader: true, pagination: { enabled: true, mode: 'server', pageSize: 20, showTotal: true } }
  const pagedKey = runtime.describe(component, {})!.queryKey
  component.tableConfig.pagination!.pageSize = 50
  assert.notEqual(originalKey, pagedKey)
  assert.notEqual(pagedKey, runtime.describe(component, {})!.queryKey)
})
test('portable plan compiles native V3 and rejects executable, invented or unavailable fields', () => {
  const months = ['2025-08', '2026-08'], sample = { month: '2026-08', departmentCount: 8, doctorCount: 80, observedAt: 'fixture' }
  const plan = outpatientPlanExample()
  const app = compileOutpatientPromptPlan(parseOutpatientPromptPlan(JSON.stringify(plan), months), months, sample)
  assert.equal(validateDashboardApplicationV3(app).valid, true)
  assert.equal(app.pages.length, 5)
  assert.ok(app.pages[0]!.components.some(c => c.events?.some(e => e.actions.some(a => a.type === 'drillDown'))))
  assert.deepEqual(app.extensionRefs.responsiveLayout, { enabled: true, breakpoint: 768, mode: 'stack' })
  for (const patch of [{ sql: 'select 1' }, { month: '2026-09' }, { pageTitles: ['只有一页'] }, { accentColor: 'red' }, { mobileResponsive: 'true' }]) assert.throws(() => parseOutpatientPromptPlan(JSON.stringify({ ...plan, ...patch }), months))
  assert.throws(() => parseOutpatientPromptPlan('<think>规划</think>' + JSON.stringify(plan), months))
  const prompt = buildOutpatientPortablePrompt('运营', months, sample)
  assert.match(prompt, /不能叫全院医生排名/)
  assert.ok(!prompt.includes('staff_number'))
})
