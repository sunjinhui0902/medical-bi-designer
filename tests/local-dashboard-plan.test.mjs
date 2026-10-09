import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planLocalDashboard, getLocalSeriesDataset, executeLocalSeriesDataset } from '../server/local-dashboard-plan.mjs'
test('two metrics provide eight monthly points and independent native datasets', async () => {
  const plan = await planLocalDashboard('2026年1月至2026年8月门诊收入、医疗成本趋势同比')
  assert.equal(plan.metrics.length, 2)
  assert.ok(plan.metrics.every(m => m.series.length === 8))
  const dataset = await getLocalSeriesDataset(plan.metrics[0].datasetId)
  assert.equal(dataset.readOnly, true)
  assert.equal(dataset.fields[1].unit, '万元')
  const result = await executeLocalSeriesDataset(dataset.id, { view: { dimensions: [0], measures: [{ field: 1, aggregation: 'sum' }], sort: [{ kind: 'dimension', index: 0, direction: 'asc' }], limit: 200 } })
  assert.equal(result.rows[7].month, '2026-08')
  assert.ok(Math.abs(result.rows[7].value - 2988.584459) < 0.000001)
})
test('one ending month defaults to six trend points and ratio is percent scaled', async () => {
  const plan = await planLocalDashboard('2026年8月病床使用率趋势同比')
  assert.equal(plan.from, '2026-03')
  assert.equal(plan.metrics[0].series.length, 6)
  const result = await executeLocalSeriesDataset(plan.metrics[0].datasetId)
  assert.ok(result.rows.at(-1).value > 100)
})
test('three/four metrics and abbreviated same-year ranges keep the requested period', async () => {
  const plan = await planLocalDashboard('2026年1月至8月门诊收入、医疗成本、出院人次、手术台次趋势')
  assert.equal(plan.from, '2026-01')
  assert.equal(plan.to, '2026-08')
  assert.equal(plan.metrics.length, 4)
  assert.ok(plan.metrics.every(m => m.series.length === 8))
})
test('missing metric period is skipped with warning, not fake zero or approval wait', async () => {
  const plan = await planLocalDashboard('2026年1月至2026年8月门诊收入、DRG病例趋势')
  assert.equal(plan.metrics.length, 1)
  assert.ok(plan.warnings.some(w => w.includes('DRG')))
  const provisional = await planLocalDashboard('2026年8月CSK检查工作量趋势')
  assert.equal(provisional.metrics[0].metric.definitionStatus, 'PROVISIONAL_LOCAL_USE')
})
test('bad ranges, identifiers and unsupported parameters are clear errors', async () => {
  await assert.rejects(planLocalDashboard('2026年8月至2026年1月门诊收入趋势'), /开始月份/)
  await assert.rejects(getLocalSeriesDataset('local-series:../../private:2026-01:2026-08'), /标识无效/)
  await assert.rejects(executeLocalSeriesDataset('local-series:dashboard_outpatient_revenue:2026-01:2026-08', { parameters: { dept: 'x' } }), /不支持筛选/)
})
test('optional month parameter filters actual evidence and advertises its capability', async () => {
  const id = 'local-series:dashboard_outpatient_revenue:2026-01:2026-08'
  const dataset = await getLocalSeriesDataset(id)
  assert.equal(dataset.parameters[0].code, 'month')
  const filtered = await executeLocalSeriesDataset(id, { parameters: { month: '2026-02' } })
  assert.equal(filtered.rows.length, 1); assert.equal(filtered.rows[0].month, '2026-02')
  const cleared = await executeLocalSeriesDataset(id, { parameters: { month: null } })
  assert.equal(cleared.rows.length, 8)
  await assert.rejects(executeLocalSeriesDataset(id, { parameters: { month: '2026-99' } }), /YYYY-MM/)
})
