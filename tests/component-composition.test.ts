import test from 'node:test'
import assert from 'node:assert/strict'
import type { DashboardComponent } from '../src/models/dashboard.ts'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import { compositionMembersV3, compositionBoundsV3, createCompositionV3, dissolveCompositionV3, cleanCompositionsV3, transformCompositionV3, reorderCompositionV3 } from '../src/services/componentCompositionV3.ts'
import { responsiveLayoutV3 } from '../src/services/responsiveLayoutV3.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'
import { createPageDesignerAdapterV3, applyDesignerDashboardToPageV3 } from '../src/services/dashboardDesignerAdapterV3.ts'
import { reparentComponentV3, tabContentSizeV3 } from '../src/services/tabContainerV3.ts'

function item(id: string, x = 40, y = 40, width = 200, height = 100): DashboardComponent {
  return { id, title: id, type: 'kpi', position: { x, y, width, height, zIndex: 1 }, styleConfig: { background: 'transparent', titleColor: '#000000', titleSize: 14, titleWeight: 500, titleVisible: false }, dataConfig: { version: 3, sourceKind: 'mock', datasetId: 'income', dimensions: [], measures: [], filters: [], sort: [], limit: 200, parameterBindings: [], refreshPolicy: 'onPageEnter' } }
}
function fixture() { const a = item('a'), b = item('b', 60, 50, 100, 60), c = item('c', 300, 40); a.position.zIndex = 1; b.position.zIndex = 2; c.position.zIndex = 3; return [a, b, c] }
function tab(children: string[]): DashboardComponent { return { ...item('tabs', 0, 0, 600, 500), type: 'tabs', tabsConfig: { activeItemId: 'first', alignment: 'left', titlePosition: 'top', titleSize: 38, stylePreset: 'default', items: [{ id: 'first', label: 'first', value: 'first', visible: true, padding: 12, gap: 8, background: '#fff', componentIds: children }] } } }

test('combining retains data and rejects partial invalid membership without mutation', () => {
  const items = fixture(), before = structuredClone(items)
  assert.throws(() => createCompositionV3(items, ['a', 'unknown'], 'g'))
  assert.deepEqual(items, before)
  createCompositionV3(items, ['a', 'b'], 'g')
  assert.deepEqual(compositionMembersV3(items, 'a').map(c => c.id), ['a', 'b'])
  assert.deepEqual(items[0]!.dataConfig, before[0]!.dataConfig)
  dissolveCompositionV3(items, 'b')
  assert.deepEqual(items, before)
})

test('group affine resize and movement preserve overlap and apply atomically within bounds', () => {
  const items = fixture(); createCompositionV3(items, ['a', 'b'], 'g')
  const original = Object.fromEntries(items.slice(0, 2).map(c => [c.id, { ...c.position }]))
  const bounds = compositionBoundsV3(items.slice(0, 2))
  transformCompositionV3(items, original, { ...bounds, x: 80, y: 70, width: 400, height: 200 }, { width: 1000, height: 600, padding: 0 })
  assert.equal(items[1]!.position.x - items[0]!.position.x, 40)
  assert.equal(items[1]!.position.width, 200)
  assert.deepEqual(items[2]!.position, fixture()[2]!.position)
  const stable = structuredClone(items)
  assert.throws(() => transformCompositionV3(items, original, { ...bounds, x: -1 }, { width: 1000, height: 600, padding: 0 }), /超出/)
  assert.deepEqual(items, stable)
  assert.throws(() => transformCompositionV3(items, original, { ...bounds, width: 5 }, { width: 1000, height: 600, padding: 0 }), /最小/)
  assert.deepEqual(items, stable)
})

test('layer changes keep grouped relative order and avoid touching other scopes', () => {
  const items = fixture(); createCompositionV3(items, ['a', 'b'], 'g')
  reorderCompositionV3(items, 'a', 'top')
  assert.equal(items[2]!.position.zIndex, 1)
  assert.ok(items[0]!.position.zIndex < items[1]!.position.zIndex)
  reorderCompositionV3(items, 'b', 'bottom')
  assert.equal(items[0]!.position.zIndex, 1)
  assert.equal(items[1]!.position.zIndex, 2)
  assert.equal(items[2]!.position.zIndex, 3)
})

test('mobile keeps overlapping groups together and scales child geometry without changing desktop data', () => {
  const items = fixture(); createCompositionV3(items, ['a', 'b'], 'g')
  const before = structuredClone(items), layout = responsiveLayoutV3(items, 390), scale = 366 / 200
  assert.equal(layout.scales.a, scale)
  assert.equal(layout.positions.b!.x - layout.positions.a!.x, 20 * scale)
  assert.equal(layout.positions.b!.y - layout.positions.a!.y, 10 * scale)
  assert.ok(layout.positions.c!.y >= layout.positions.a!.y + layout.positions.a!.height)
  assert.deepEqual(items, before)
})

test('Tab content grouping survives mobile reflow, cross-container movement is explicitly rejected', () => {
  const items = fixture(), container = tab(['a', 'b']); items.push(container)
  createCompositionV3(items, ['a', 'b'], 'g')
  assert.throws(() => createCompositionV3(items, ['b', 'c'], 'another'))
  const before = structuredClone(items)
  assert.equal(reparentComponentV3(items, 'a', { kind: 'canvas', canvas: { width: 1000, height: 600 } }, { x: 50, y: 50 }).success, false)
  assert.deepEqual(items, before)
  const layout = responsiveLayoutV3(items, 390)
  assert.ok(layout.scales.a)
  assert.equal(layout.scales.a, layout.scales.b)
})

test('mobile Tab content contains groups and independent cards for every title direction without modifying desktop geometry', () => {
  for (const width of [320, 390, 768]) {
    for (const direction of ['top', 'bottom', 'left', 'right'] as const) {
      for (const titleVisible of [false, true]) {
        for (const padding of [0, 12, 24]) {
          const items = fixture(), container = tab(['a', 'b', 'c'])
          container.tabsConfig!.titlePosition = direction
          container.tabsConfig!.titleSize = direction === 'left' || direction === 'right' ? 96 : 52
          container.tabsConfig!.items[0]!.padding = padding
          container.styleConfig.titleVisible = titleVisible
          items.push(container)
          createCompositionV3(items, ['a', 'b'], 'g')
          const before = structuredClone(items), layout = responsiveLayoutV3(items, width)
          const mobileContainer = { ...container, position: layout.positions[container.id]! }
          const size = tabContentSizeV3(mobileContainer, container.tabsConfig!.items[0]!)
          for (const id of ['a', 'b', 'c']) {
            const position = layout.positions[id]!
            const label = `${width}/${direction}/${titleVisible}/${padding}/${id}`
            assert.ok(position.x >= padding && position.y >= padding, `${label}: leading padding`)
            assert.ok(position.x + position.width <= size.width - padding + .01, `${label}: right edge`)
            assert.ok(position.y + position.height <= size.height - padding + .01, `${label}: bottom edge`)
          }
          assert.equal(layout.scales.a, layout.scales.b)
          assert.deepEqual(items, before)
        }
      }
    }
  }
})

test('composition and click-through persist across native adapter and validator; invalid scopes are rejected', () => {
  const app = createDefaultDashboardApplicationV3(), page = app.pages[0]!
  page.components = fixture(); createCompositionV3(page.components, ['a', 'b'], 'g')
  page.components[0]!.styleConfig.pointerEvents = 'none'
  assert.equal(validateDashboardApplicationV3(app).valid, true)
  const editor = createPageDesignerAdapterV3(app, page.id)
  const saved = applyDesignerDashboardToPageV3(app, page.id, editor.dashboard)
  assert.deepEqual(saved.pages[0]!.components, page.components)
  page.components.splice(1, 1)
  assert.equal(validateDashboardApplicationV3(app).valid, false)
  cleanCompositionsV3(page.components)
  assert.equal(validateDashboardApplicationV3(app).valid, true)
  page.components[0]!.groupId = 'bad'; page.components[1]!.groupId = 'bad'; page.components.push(tab(['a']))
  assert.equal(validateDashboardApplicationV3(app).valid, false)
})
