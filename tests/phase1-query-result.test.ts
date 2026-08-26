import assert from 'node:assert/strict'
import test from 'node:test'
import { buildComponentDataView } from '../src/services/queryResult.ts'
import type { Aggregation, ComponentDataConfigV2 } from '../src/models/bi.ts'

const rows = [
  { month: '2026-01', dept: '内科', amount: 10, patient: '张三', visitDate: '2026-01-01' },
  { month: '2026-01', dept: '外科', amount: 20, patient: '李四', visitDate: '2026-01-02' },
  { month: '2026-02', dept: '内科', amount: 5, patient: '张三', visitDate: '2026-02-01' },
  { month: '2026-02', dept: '外科', amount: 15, patient: '王五', visitDate: '2026-02-02' },
  { month: '2026-02', dept: '外科', amount: 5, patient: null, visitDate: '2026-02-03' },
]

function config(
  aggregation: Aggregation = 'sum',
  overrides: Partial<ComponentDataConfigV2> = {},
): ComponentDataConfigV2 {
  return {
    version: 2,
    sourceKind: 'mock',
    datasetId: 'phase1-fixture',
    dimensions: [{ field: 'month', role: 'category', sort: 'none' }],
    measures: [{ field: 'amount', aggregation }],
    filters: [],
    sort: [],
    limit: 100,
    ...overrides,
  }
}

test('维度支持升序、降序和无排序', () => {
  assert.deepEqual(buildComponentDataView(rows, config()).categories, ['2026-01', '2026-02'])
  assert.deepEqual(buildComponentDataView(rows, config('sum', {
    dimensions: [{ field: 'month', role: 'category', sort: 'desc' }],
  })).categories, ['2026-02', '2026-01'])
  assert.deepEqual(buildComponentDataView([...rows].reverse(), config()).categories, ['2026-02', '2026-01'])
})

test('指标排序作用于聚合后的图表分类和表格结果', () => {
  const view = buildComponentDataView(rows, config('sum', {
    sort: [{ field: 'amount', direction: 'asc' }],
  }))
  assert.deepEqual(view.categories, ['2026-02', '2026-01'])
  assert.deepEqual(view.series[0].values, [25, 30])
  assert.deepEqual(view.rows.map((row) => row.month), ['2026-02', '2026-01'])
})

test('第二维度拆分为独立系列，并保持分类对齐', () => {
  const view = buildComponentDataView(rows, config('sum', {
    dimensions: [
      { field: 'month', role: 'category', sort: 'asc' },
      { field: 'dept', role: 'series', sort: 'asc' },
    ],
  }))
  assert.deepEqual(view.categories, ['2026-01', '2026-02'])
  assert.deepEqual(view.series.map((item) => item.name), ['amount · 内科', 'amount · 外科'])
  assert.deepEqual(view.series.map((item) => item.values), [[10, 5], [20, 20]])
})

test('指标系列名称使用别名且不改变排序结果', () => {
  const view = buildComponentDataView(rows, config('sum', {
    measures: [{ field: 'amount', alias: '医疗收入', aggregation: 'sum' }],
    sort: [{ field: 'amount', direction: 'desc' }],
  }))
  assert.equal(view.series[0].name, '医疗收入')
  assert.deepEqual(view.categories, ['2026-01', '2026-02'])
})

test('数值聚合支持 SUM、AVG、MIN、MAX 和 NONE', () => {
  const expected: Array<[Aggregation, number]> = [
    ['sum', 55],
    ['avg', 11],
    ['min', 5],
    ['max', 20],
    ['none', 10],
  ]
  for (const [aggregation, value] of expected) {
    const view = buildComponentDataView(rows, config(aggregation, { dimensions: [] }))
    assert.equal(view.series[0].values[0], value, aggregation)
  }
})

test('COUNT 支持字符串和日期，COUNT DISTINCT 正确去重并忽略空值', () => {
  const stringCount = buildComponentDataView(rows, config('count', {
    dimensions: [],
    measures: [{ field: 'patient', aggregation: 'count' }],
  }))
  const dateCount = buildComponentDataView(rows, config('count', {
    dimensions: [],
    measures: [{ field: 'visitDate', aggregation: 'count' }],
  }))
  const distinct = buildComponentDataView(rows, config('countDistinct', {
    dimensions: [],
    measures: [{ field: 'patient', aggregation: 'countDistinct' }],
  }))
  assert.equal(stringCount.series[0].values[0], 4)
  assert.equal(dateCount.series[0].values[0], 5)
  assert.equal(distinct.series[0].values[0], 3)
})

test('limit 在排序后生效', () => {
  const view = buildComponentDataView(rows, config('sum', {
    sort: [{ field: 'amount', direction: 'desc' }],
    limit: 1,
  }))
  assert.deepEqual(view.categories, ['2026-01'])
  assert.deepEqual(view.series[0].values, [30])
  assert.equal(view.rows.length, 1)
})
