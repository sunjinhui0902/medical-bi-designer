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
