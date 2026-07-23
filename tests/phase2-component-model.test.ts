import assert from 'node:assert/strict'
import test from 'node:test'
import { migrateDashboard } from '../src/services/dashboardMigration.ts'

function legacyComponent(type: string) {
  return {
    id: `${type}-1`,
    type,
    title: type,
    position: { x: 0, y: 0, width: 300, height: 180, zIndex: 1 },
    dataConfig: {
      datasetId: 'fixture',
      dimensions: [{ field: 'dept', role: 'category' }],
      measures: [{ field: 'amount', aggregation: 'sum' }],
    },
    styleConfig: { background: '#fff' },
    analysisConfig: { showLabels: true, labelDecimals: 2 },
    kpiConfig: { unit: '万元', decimals: 1 },
  }
}

function migrate(type: string) {
  return migrateDashboard({
    version: 1,
    name: 'Phase2',
    canvas: { width: 960, height: 540 },
    components: [legacyComponent(type)],
  }).components[0]
}

test('图表仅保留图表专属配置', () => {
  const component = migrate('line')
  assert.ok(component.analysisConfig)
  assert.equal(component.analysisConfig?.showLabels, true)
  assert.equal(component.kpiConfig, undefined)
  assert.equal(component.tableConfig, undefined)
})

test('指标卡仅保留指标卡专属配置', () => {
  const component = migrate('kpi')
  assert.ok(component.kpiConfig)
  assert.equal(component.kpiConfig?.unit, '万元')
  assert.equal(component.analysisConfig, undefined)
  assert.equal(component.tableConfig, undefined)
})

test('表格建立独立列、宽度、格式和汇总配置', () => {
  const component = migrate('table')
  assert.ok(component.tableConfig)
  assert.deepEqual(component.tableConfig?.columns.map((column) => column.field), ['dept', 'amount'])
  assert.equal(component.tableConfig?.columns[0].width, 120)
  assert.equal(component.tableConfig?.columns[1].format, 'auto')
  assert.equal(component.tableConfig?.columns[1].summary, 'none')
  assert.equal(component.analysisConfig, undefined)
  assert.equal(component.kpiConfig, undefined)
})

test('文本组件只保留公共配置', () => {
  const component = migrate('text')
  assert.equal(component.analysisConfig, undefined)
  assert.equal(component.kpiConfig, undefined)
  assert.equal(component.tableConfig, undefined)
  assert.equal(component.title, 'text')
  assert.equal(component.position.width, 300)
  assert.equal(component.styleConfig.background, '#fff')
})
