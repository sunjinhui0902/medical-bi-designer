import assert from 'node:assert/strict'
import test from 'node:test'
import { migrateDashboard } from '../src/services/dashboardMigration.ts'
import { comparisonColor, comparisonRate, formatKpiValue, targetProgress } from '../src/services/kpi.ts'

const config = {
  primaryMeasureField: 'amount',
  unit: '万元',
  decimals: 2,
  useGrouping: true,
  yoyField: 'last_year_amount',
  momField: 'last_month_amount',
  positiveColor: '#00aa00',
  negativeColor: '#dd0000',
  targetMode: 'fixed' as const,
  targetValue: 12000,
  targetField: '',
  showProgress: true,
  progressColor: '#1477c9',
}

test('指标值支持小数位和千分位', () => {
  assert.equal(formatKpiValue(12345.6, config), '12,345.60')
  assert.equal(formatKpiValue(12345.6, { ...config, useGrouping: false }), '12345.60')
})

test('同比环比按基准值计算并处理零基准', () => {
  assert.equal(comparisonRate(120, 100), 20)
  assert.equal(comparisonRate(80, 100), -20)
  assert.equal(comparisonRate(80, 0), null)
})

test('涨跌颜色和目标达成率正确', () => {
  assert.equal(comparisonColor(10, config), '#00aa00')
  assert.equal(comparisonColor(-10, config), '#dd0000')
  assert.equal(targetProgress(90, 120), 75)
  assert.equal(targetProgress(90, 0), 0)
})

test('旧版单一比较字段迁移为同比或环比字段', () => {
  const dashboard = migrateDashboard({
    version: 1,
    name: 'KPI Migration',
    canvas: { width: 960, height: 540 },
    components: [{
      id: 'kpi-1',
      type: 'kpi',
      title: '收入',
      position: { x: 0, y: 0, width: 200, height: 120, zIndex: 1 },
      dataConfig: {
        datasetId: 'fixture',
        measures: [{ field: 'amount', aggregation: 'sum' }],
      },
      kpiConfig: {
        comparisonField: 'last_year_amount',
        comparisonType: 'yoy',
      },
    }],
  })
  const migrated = dashboard.components[0].kpiConfig
  assert.equal(migrated?.primaryMeasureField, 'amount')
  assert.equal(migrated?.yoyField, 'last_year_amount')
  assert.equal(migrated?.momField, '')
  assert.equal(migrated?.useGrouping, true)
})
