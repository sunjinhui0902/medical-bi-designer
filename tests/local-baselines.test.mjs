import assert from 'node:assert/strict'
import { test } from 'node:test'
import { getLocalBaselineCatalog, getLocalBaselineSeries } from '../server/local-baselines.mjs'

test('local baseline catalog exposes eight draft-only verified references', async () => {
  const catalog = await getLocalBaselineCatalog()
  assert.equal(catalog.ready, true)
  assert.equal(catalog.metrics.length, 8)
  assert.equal(catalog.businessApproval, 'PENDING_OWNER_REVIEW')
  assert.equal(catalog.publishAllowed, false)
  assert.equal(catalog.candidateSqlExecutionAllowed, false)
  assert.ok(catalog.metrics.every((metric) => metric.sqlReference.startsWith('sql/v1_1/')))
  assert.ok(catalog.metrics.every((metric) => !Object.hasOwn(metric, 'sqlText')))
})

test('local baseline catalog fails closed when its root is unavailable', async () => {
  await assert.rejects(getLocalBaselineCatalog('Z:/missing-medical-bi-mainline'))
})

test('verified monthly series exposes reconciliation without SQL or patient rows', async () => {
  const series = await getLocalBaselineSeries('dashboard_outpatient_revenue', {
    from: '2026-08', to: '2026-08', comparison: 'yoy',
  })
  assert.equal(series.rows.length, 1)
  assert.equal(series.rows[0].month, '2026-08')
  assert.equal(series.rows[0].value, '29885844.59')
  assert.equal(series.rows[0].dashboardVsYsDifferenceYuan, '2021142.76')
  assert.equal(series.businessApproval, 'PENDING_OWNER_REVIEW')
  assert.equal(series.publishAllowed, false)
  assert.equal(JSON.stringify(series).includes('sqlText'), false)
})

test('unavailable comparisons remain unavailable and missing months are rejected', async () => {
  const csk = await getLocalBaselineSeries('csk_examination_workload', {
    from: '2026-08', to: '2026-08', comparison: 'yoy',
  })
  assert.equal(csk.rows[0].comparisonAvailable, false)
  assert.equal(csk.rows[0].comparisonPercent, null)
  await assert.rejects(getLocalBaselineSeries('dashboard_drg_cases', { from: '2026-08' }),
    /完整月范围/)
  await assert.rejects(getLocalBaselineSeries('dashboard_surgery_count', { department: '骨科' }),
    /未支持的参数/)
})
