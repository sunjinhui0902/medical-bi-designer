import assert from 'node:assert/strict'
import { test } from 'node:test'
import { planLocalQuestion } from '../server/local-question-plan.mjs'

test('one supported business question produces a sourced draft plan', async () => {
  const plan = await planLocalQuestion('2026年8月门诊收入同比')
  assert.equal(plan.status, 'LOCAL_PLAN_READY')
  assert.equal(plan.metric.id, 'dashboard_outpatient_revenue')
  assert.equal(plan.month, '2026-08')
  assert.equal(plan.result.value, '29885844.59')
  assert.equal(plan.result.comparisonPercent, '14.7961')
  assert.equal(plan.metric.businessApproval, 'PENDING_OWNER_REVIEW')
  assert.equal(plan.publishAllowed, false)
})

test('unreconciled dashboard metrics do not become query plans', async () => {
  await assert.rejects(planLocalQuestion('2026年8月CSK检查工作量同比'), /缺少可用的本地数据/)
})

test('dashboard discharge workload uses the reconciled ADS monthly field', async () => {
  const plan = await planLocalQuestion('2026年8月出院人次同比')
  assert.equal(plan.metric.id, 'dashboard_inpatient_discharge_workload')
  assert.equal(plan.result.value, '7443.0')
  assert.equal(plan.metric.dashboardAlignment, 'DASHBOARD_FIELD_MATCH')
})

test('bed utilization follows the exported dashboard ratio while remaining unapproved', async () => {
  const plan = await planLocalQuestion('2026年8月病床使用率同比')
  assert.equal(plan.metric.id, 'dashboard_bed_utilization')
  assert.ok(Number(plan.result.value) > 1)
  assert.equal(plan.metric.businessApproval, 'PENDING_OWNER_REVIEW')
  await assert.rejects(planLocalQuestion('2026年8月开放床位数'), /尚无可用/)
})

test('medical cost uses the repaired ADS fixed plus variable dashboard field', async () => {
  const plan = await planLocalQuestion('2026年8月医疗成本同比')
  assert.equal(plan.metric.id, 'dashboard_medical_cost')
  assert.equal(plan.result.value, '86532241.75')
  assert.equal(plan.metric.businessApproval, 'PENDING_OWNER_REVIEW')
  await assert.rejects(planLocalQuestion('2026年8月科室分摊成本'), /看板指标口径不同/)
})

test('unsupported grain, metric, and missing month fail closed', async () => {
  await assert.rejects(planLocalQuestion('2026年8月按科室看门诊收入'), /仅核验全院/)
  await assert.rejects(planLocalQuestion('2026年8月三四级手术占比'), /尚无可用/)
  await assert.rejects(planLocalQuestion('2026年8月门急诊净收入同比'), /看板指标口径不同/)
  await assert.rejects(planLocalQuestion('2026年8月DRG分组病例'), /完整月范围/)
  await assert.rejects(planLocalQuestion('门诊收入同比'), /一个明确的完整月份/)
})
