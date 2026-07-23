import assert from 'node:assert/strict'
import test from 'node:test'
import type { SeriesData } from '../src/models/bi.ts'
import { bubblePoints, calculateWarningValue, percentageDenominator } from '../src/services/chartAnalysis.ts'

const series: SeriesData[] = [
  { id: 'income', name: '收入', field: 'income', chartType: 'bar', axis: 'left', unit: '万元', values: [10, 20, 30] },
  { id: 'target', name: '目标', field: 'target', chartType: 'line', axis: 'right', unit: '万元', values: [20, 20, 40] },
  { id: 'visits', name: '人次', field: 'visits', chartType: 'line', axis: 'right', unit: '人次', values: [5, 10, 15] },
]

test('动态预警线支持平均值、中位数和百分位', () => {
  const base = { id: 'w', value: 0, label: '预警', color: '#f00', axis: 'y' as const }
  assert.equal(calculateWarningValue({ ...base, source: 'average', measureField: 'income' }, series), 20)
  assert.equal(calculateWarningValue({ ...base, source: 'median', measureField: 'target' }, series), 20)
  assert.equal(calculateWarningValue({ ...base, source: 'percentile', measureField: 'income', percentile: 90 }, series), 30)
})

test('百分比分母支持分类合计、系列合计和指定指标', () => {
  assert.equal(percentageDenominator(series, 0, 1, 'category'), 50)
  assert.equal(percentageDenominator(series, 0, 1, 'series'), 60)
  assert.equal(percentageDenominator(series, 0, 1, 'category', 'target'), 20)
  assert.equal(percentageDenominator([series[0]], 0, 1, 'category'), 60)
})

test('气泡图前三个指标映射到 X、Y 和气泡大小', () => {
  assert.deepEqual(bubblePoints(['A', 'B'], series), [[10, 20, 5, 'A'], [20, 20, 10, 'B'], [30, 40, 15, '']])
})
