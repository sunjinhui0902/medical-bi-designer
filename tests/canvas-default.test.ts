import assert from 'node:assert/strict'
import test from 'node:test'
import { migrateDashboard } from '../src/services/dashboardMigration.ts'

test('缺失画布尺寸时默认使用 1200 × 600', () => {
  const dashboard = migrateDashboard({
    version: 2,
    name: '默认画布',
    canvas: {},
    components: [],
  })
  assert.equal(dashboard.canvas.width, 1200)
  assert.equal(dashboard.canvas.height, 600)
})

test('已保存看板继续保留原画布尺寸', () => {
  const dashboard = migrateDashboard({
    version: 2,
    name: '历史看板',
    canvas: { width: 960, height: 540 },
    components: [],
  })
  assert.equal(dashboard.canvas.width, 960)
  assert.equal(dashboard.canvas.height, 540)
})

test('迁移保留页签组件配置', () => {
  const dashboard = migrateDashboard({
    version: 2,
    name: '页签看板',
    canvas: { width: 1200, height: 600 },
    components: [{
      id: 'tabs-main', type: 'tabs', title: '分析视图',
      position: { x: 0, y: 0, width: 420, height: 72, zIndex: 1 },
      dataConfig: { version: 2, sourceKind: 'mock', datasetId: '', dimensions: [], measures: [], filters: [], sort: [], limit: 200 },
      styleConfig: {},
      tabsConfig: { items: [{ id: 'overview', label: '概览', value: 'overview' }], activeItemId: 'overview', alignment: 'stretch' },
    }],
  })

  assert.deepEqual(dashboard.components[0].tabsConfig, {
    items: [{ id: 'overview', label: '概览', value: 'overview', componentIds: [], visible: true, padding: 12, gap: 8, background: '#ffffff' }],
    activeItemId: 'overview', alignment: 'stretch', titlePosition: 'top', stylePreset: 'default', titleSize: 38,
  })
})
