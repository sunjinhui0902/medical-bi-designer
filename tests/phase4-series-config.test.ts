import assert from 'node:assert/strict'
import test from 'node:test'
import { migrateDashboard } from '../src/services/dashboardMigration.ts'

test('组合图各指标独立保存图形、轴和标签配置', () => {
  const dashboard = migrateDashboard({
    version: 2,
    name: '组合图测试',
    canvas: { width: 1200, height: 600 },
    components: [{
      id: 'combo_1',
      type: 'combo',
      title: '业务组合图',
      position: { x: 0, y: 0, width: 400, height: 260 },
      dataConfig: {
        datasetId: 'demo',
        dimensions: [{ field: 'month', role: 'category' }],
        measures: [
          { field: 'income', aggregation: 'sum', chartType: 'bar', axis: 'left', labelConfig: { show: true, showCategory: true, showSeries: false, mode: 'value', decimals: 1, position: 'top', unit: '万元', percentageBase: 'series' } },
          { field: 'rate', aggregation: 'avg', chartType: 'area', axis: 'right', labelConfig: { show: true, showCategory: false, showSeries: true, mode: 'percentage', decimals: 2, position: 'inside', unit: '%', percentageBase: 'category' } },
        ],
      },
      styleConfig: {},
      analysisConfig: {},
    }],
  })

  const [left, right] = dashboard.components[0].dataConfig.measures
  assert.equal(left.chartType, 'bar')
  assert.equal(left.axis, 'left')
  assert.equal(left.labelConfig?.showCategory, true)
  assert.equal(left.labelConfig?.unit, '万元')
  assert.equal(right.chartType, 'area')
  assert.equal(right.axis, 'right')
  assert.equal(right.labelConfig?.showSeries, true)
  assert.equal(right.labelConfig?.mode, 'percentage')
})

test('气泡图轴标题和标签显示项具有兼容默认值', () => {
  const dashboard = migrateDashboard({
    name: '气泡图测试',
    canvas: {},
    components: [{
      id: 'bubble_1',
      type: 'bubble',
      title: '气泡图',
      position: {},
      dataConfig: { datasetId: 'demo', dimensions: [], measures: [] },
      styleConfig: {},
      analysisConfig: { leftAxisTitle: '收入', rightAxisTitle: '人次', labelShowCategory: true, labelShowSeries: true },
    }],
  })
  const analysis = dashboard.components[0].analysisConfig
  assert.equal(analysis?.leftAxisTitle, '收入')
  assert.equal(analysis?.rightAxisTitle, '人次')
  assert.equal(analysis?.labelShowCategory, true)
  assert.equal(analysis?.labelShowSeries, true)
})
