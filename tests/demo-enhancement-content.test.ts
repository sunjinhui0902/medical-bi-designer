import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultDashboardApplicationV3, darkThemeTokensV3 } from '../src/models/dashboard-v3.ts'
import { migrateDashboardToV3 } from '../src/services/dashboardMigrationV3.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'
import { isSafeEmbeddedImageV3, parseSafeGeoJsonV3, projectGeoJsonV3 } from '../src/services/controlledAssetsV3.ts'

const square = JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { code: 'A', name: '测试区' }, geometry: { type: 'Polygon', coordinates: [[[120, 32], [121, 32], [121, 33], [120, 32]]] } }] })

test('DE-3 GeoJSON parser accepts local polygon data and projection stays in viewBox', () => {
  const parsed = parseSafeGeoJsonV3(square)
  assert.equal(parsed.features.length, 1)
  const projection = projectGeoJsonV3(parsed, 1000, 600)
  assert.match(projection.paths[0], /^M/)
  const [x, y] = projection.project(120.5, 32.5)
  assert.ok(x >= 0 && x <= 1000)
  assert.ok(y >= 0 && y <= 600)
})

test('DE-2 controlled image policy rejects remote URLs and SVG payloads', () => {
  assert.equal(isSafeEmbeddedImageV3('https://example.com/a.png'), false)
  assert.equal(isSafeEmbeddedImageV3('data:image/svg+xml;base64,PHN2Zz4='), false)
  assert.equal(isSafeEmbeddedImageV3('data:image/png;base64,aGVsbG8='), true)
})

test('DE-2 schema rejects a remote image source', () => {
  const app = createDefaultDashboardApplicationV3()
  app.pages[0].components.push({ id: 'unsafe-image', type: 'image', imageConfig: { source: 'https://example.com/a.png', alt: 'x', objectFit: 'contain', opacity: 1 } } as never)
  assert.equal(validateDashboardApplicationV3(app).valid, false)
})

test('DE-1 schema rejects remote CSS resources and oversized imported canvases', () => {
  const unsafeTheme = createDefaultDashboardApplicationV3()
  unsafeTheme.theme.tokens.panelBackground = 'url(https://example.com/panel.png)'
  assert.equal(validateDashboardApplicationV3(unsafeTheme).valid, false)

  const unsafeComponent = createDefaultDashboardApplicationV3()
  unsafeComponent.pages[0].components.push({
    id: 'unsafe-style', type: 'text', title: 'unsafe',
    position: { x: 0, y: 0, width: 120, height: 80, zIndex: 1 },
    dataConfig: { version: 2, sourceKind: 'mock', datasetId: '', dimensions: [], measures: [], filters: [], sort: [], limit: 20 },
    styleConfig: { background: 'url(https://example.com/component.png)', titleColor: '#000', titleSize: 12, titleWeight: 400, titleVisible: true },
    textConfig: { content: 'unsafe', color: '#000', fontSize: 12, fontWeight: 400, align: 'left', verticalAlign: 'top', lineHeight: 1.4 },
  } as never)
  assert.equal(validateDashboardApplicationV3(unsafeComponent).valid, false)

  const unsafeTab = createDefaultDashboardApplicationV3()
  unsafeTab.pages[0].components.push({
    id: 'unsafe-tab', type: 'tabs',
    tabsConfig: { items: [{ id: 'tab-1', label: '页签', value: 'tab', componentIds: [], visible: true, padding: 12, gap: 8, background: 'url(https://example.com/tab.png)' }], activeItemId: 'tab-1', alignment: 'left', titlePosition: 'top', stylePreset: 'default', titleSize: 38 },
  } as never)
  assert.equal(validateDashboardApplicationV3(unsafeTab).valid, false)

  const unsafeKpi = createDefaultDashboardApplicationV3()
  unsafeKpi.pages[0].components.push({ id: 'unsafe-kpi', type: 'kpi', kpiConfig: { progressColor: 'url(https://example.com/kpi.png)' } } as never)
  assert.equal(validateDashboardApplicationV3(unsafeKpi).valid, false)

  const oversized = createDefaultDashboardApplicationV3()
  oversized.pages[0].canvas.height = 1_000_000_000
  assert.equal(validateDashboardApplicationV3(oversized).valid, false)
})

test('DE-1 typed presets are available without rewriting legacy empty theme tokens', () => {
  const app = createDefaultDashboardApplicationV3()
  const migrated = migrateDashboardToV3(app)
  assert.ok(migrated.application)
  assert.deepEqual(migrated.application!.theme.tokens, {})
  assert.equal(darkThemeTokensV3.canvasBackground, '#071426')
})

test('DE-3 parser rejects executable or unsupported GeoJSON geometry', () => {
  assert.throws(() => parseSafeGeoJsonV3(JSON.stringify({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'GeometryCollection', geometries: [] } }] })), /Polygon/)
})
