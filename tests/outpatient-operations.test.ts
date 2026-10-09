import test from 'node:test'
import assert from 'node:assert/strict'
import { createOutpatientOperationsDraft } from '../src/services/outpatientOperationsDraft.ts'
import { tableCsvV3 } from '../src/services/tableCsvV3.ts'
import { readOverviewSnapshot, readOutpatientCompositionSnapshot, readOutpatientDepartmentSnapshot, outpatientCompositionRows, outpatientDepartmentRows, assembleOverview, overviewDatasetRows } from '../server/hospital-overview.mjs'

test('five-page outpatient draft uses native V3 events and keeps partial sample boundaries', () => {
  const app = createOutpatientOperationsDraft({ schemaVersion: 1, template: 'hospital-overview', title: '门诊', month: '2026-08', comparison: 'yoy', sections: ['operations', 'trend'], notes: '' }, ['2025-08', '2026-08'], 'request', { month: '2026-08', observedAt: '2026-09-29', departmentCount: 8, doctorCount: 80 }, 'test')
  assert.equal(app.pages.length, 5)
  assert.equal(app.drillPaths?.[0]?.levels.length, 2)
  const entry = app.pages[0]!.components.find(component => component.id.endsWith('-department-entry'))!
  assert.match(entry.title, /固定 2026-08 的 8 科室样本/)
  assert.equal(entry.events?.[0]?.actions[1]?.type, 'drillDown')
  assert.equal(entry.events?.[0]?.actions[2]?.type, 'navigatePage')
  assert.ok(app.pages[0]!.components.some(component => component.textConfig?.content.includes('医生汇总与院级有差异')))
  assert.ok(app.pages[0]!.components.every(component => !component.dataConfig.datasetId.includes('budget')))
  assert.equal(app.pages[0]!.components.filter(component => component.dataConfig.datasetId.startsWith('local-overview:outpatient_ytd_')).length, 3)
  assert.equal(app.pages[0]!.components.filter(component => component.type === 'pie' && component.dataConfig.datasetId.startsWith('local-overview:outpatient_')).length, 2)
  const rank = app.pages[0]!.components.find(component => component.id.endsWith('-full-department-rank'))!
  assert.equal(rank.dataConfig.datasetId, 'local-overview:outpatient_department_rank')
  assert.equal(rank.events?.[0]?.actions[0]?.type, 'setParameter')
  assert.equal(rank.events?.[0]?.actions[1]?.type, 'navigatePage')
  assert.equal(app.pages[4]!.components.find(c => c.id.endsWith('-directory'))?.tableConfig?.pagination?.mode, 'server')
})

test('full department aggregate reconciles without becoming a doctor drill entry', async () => {
  const data = assembleOverview(await readOverviewSnapshot(), '2026-08')
  const snapshot = await readOutpatientDepartmentSnapshot()
  const rows = outpatientDepartmentRows(data, snapshot).filter(row => row.month === '2026-08')
  assert.equal(rows.length, 458)
  assert.equal(rows.reduce((sum, row) => sum + row.visits, 0), 86103)
  assert.equal(rows.filter(row => !row.dept_code).reduce((sum, row) => sum + row.visits, 0), 0)
  assert.throws(() => outpatientDepartmentRows(data, { ...snapshot, rows: snapshot.rows.slice(1) }), /逐月对账/)
})

test('dedicated outpatient composition reconciles for every snapshot month', async () => {
  const data = assembleOverview(await readOverviewSnapshot(), '2026-08')
  const snapshot = await readOutpatientCompositionSnapshot()
  const visits = outpatientCompositionRows(data, snapshot, 'outpatient_visit_mix')
  const revenue = outpatientCompositionRows(data, snapshot, 'outpatient_revenue_mix')
  assert.equal(snapshot.rows.length, 20)
  assert.equal(visits.filter(row => row.month === '2026-08').reduce((sum, row) => sum + row.value, 0), 86103)
  assert.ok(Math.abs(revenue.filter(row => row.month === '2026-08').reduce((sum, row) => sum + row.value, 0) - 2988.584459) < 0.0001)
  assert.throws(() => outpatientCompositionRows(data, { ...snapshot, rows: snapshot.rows.slice(1) }, 'outpatient_visit_mix'), /逐月对账/)
})

test('hospital prior year is present only when the snapshot has the matching month', async () => {
  const data = assembleOverview(await readOverviewSnapshot(), '2026-08')
  const rows = overviewDatasetRows(data, 'outpatient_visits')
  assert.equal(rows.find(row => row.month === '2026-08')?.prior_value, rows.find(row => row.month === '2025-08')?.value)
  assert.equal(rows.find(row => row.month === '2025-08')?.prior_value, null)
  const insight = overviewDatasetRows(data, 'outpatient_insights')
  const visit = insight.find(row => row.month === '2026-08' && row.metric === '门急诊人次')!
  assert.equal(visit.current, rows.find(row => row.month === '2026-08')?.value)
  assert.equal(visit.prior, rows.find(row => row.month === '2025-08')?.value)
  assert.match(visit.source, /只读快照/)
  const ytd = overviewDatasetRows(data, 'outpatient_ytd_visits')
  const aug2026 = ytd.find(row => row.month === '2026-08')!
  assert.equal(aug2026.value, rows.filter(row => row.month >= '2026-01' && row.month <= '2026-08').reduce((sum, row) => sum + Number(row.value), 0))
  assert.equal(aug2026.prior_value, rows.filter(row => row.month >= '2025-01' && row.month <= '2025-08').reduce((sum, row) => sum + Number(row.value), 0))
  assert.equal(ytd.find(row => row.month === '2025-08')?.prior_value, null)
})

test('CSV exports displayed columns and escapes spreadsheet formulas', () => {
  const csv = tableCsvV3([{ field: 'doctor', label: '医生' }, { field: 'visits', label: '人次' }], [{ doctor: '=bad', visits: 12 }])
  assert.ok(csv.includes("\"'=bad\",\"12\""))
  const negative = tableCsvV3([{ field: 'value', label: '同比' }], [{ value: -12.5 }, { value: '-12.5' }, { value: NaN }])
  assert.equal(negative, '\uFEFF"同比"\r\n"-12.5"\r\n"\'-12.5"\r\n""')
})

test('YTD keeps missing measures distinct from zero and does not poison other metrics', async () => {
  const snapshot = await readOverviewSnapshot()
  const incomplete = { ...snapshot, hospital: snapshot.hospital.map(row => row.month === '2026-02' ? { ...row, outpatient_visits: null } : row) }
  const data = assembleOverview(incomplete, '2026-08')
  assert.equal(overviewDatasetRows(data, 'outpatient_ytd_visits').find(row => row.month === '2026-08')?.value, null)
  assert.equal(overviewDatasetRows(data, 'outpatient_ytd_avg').find(row => row.month === '2026-08')?.value, null)
  assert.ok(overviewDatasetRows(data, 'outpatient_ytd_revenue').find(row => row.month === '2026-08')?.value > 0)
  const zero = assembleOverview({ ...snapshot, hospital: snapshot.hospital.map(row => row.month === '2026-01' ? { ...row, outpatient_visits: 0 } : row) }, '2026-08')
  assert.equal(overviewDatasetRows(zero, 'outpatient_ytd_visits').find(row => row.month === '2026-01')?.value, 0)
  assert.equal(overviewDatasetRows(data, 'outpatient_insights').find(row => row.month === '2026-02' && row.metric === '门急诊人次')?.signal, '当前指标缺失')
  assert.equal(overviewDatasetRows(zero, 'outpatient_insights').find(row => row.month === '2026-01' && row.metric === '门急诊人次')?.current, 0)
  const zeroPrior = assembleOverview({ ...snapshot, hospital: snapshot.hospital.map(row => row.month === '2025-08' ? { ...row, outpatient_visits: 0 } : row) }, '2026-08')
  assert.equal(overviewDatasetRows(zeroPrior, 'outpatient_insights').find(row => row.month === '2026-08' && row.metric === '门急诊人次')?.signal, '去年同期为 0，无法计算同比')
})

test('composition rejects missing slices even when zero would reconcile', async () => {
  const data = assembleOverview(await readOverviewSnapshot(), '2026-08')
  const snapshot = await readOutpatientCompositionSnapshot()
  const incomplete = { ...snapshot, rows: snapshot.rows.map((row, index) => index === 0 ? { ...row, emergencyVisits: null, outpatientVisits: data.hospital[0].outpatient_visits } : row) }
  assert.throws(() => outpatientCompositionRows(data, incomplete, 'outpatient_visit_mix'), /逐月对账/)
})
