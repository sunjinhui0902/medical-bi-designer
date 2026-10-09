import test from 'node:test'
import assert from 'node:assert/strict'
import { createHospitalSamplePlan, hospitalSamplePlanId } from '../src/services/dashboardSamplePlans.ts'
import { createHospitalOverviewDraft } from '../src/services/hospitalOverviewDraft.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'

test('local sample blueprint is reproducible without historical model results and never extends past August', () => {
  const months = ['2026-09', '2026-01', '2026-08']
  const plan = createHospitalSamplePlan(months)
  assert.equal(plan.month, '2026-08')
  const app = createHospitalOverviewDraft(plan, months, hospitalSamplePlanId, 'local-template')
  assert.equal(validateDashboardApplicationV3(app).valid, true)
  assert.equal((app.extensionRefs.localGeneration as Record<string, unknown>).provider, 'local-template')
  assert.equal(createHospitalSamplePlan(['2025-08']).month, '2025-08')
  assert.throws(() => createHospitalSamplePlan(['2026-09', 'invalid']), /没有可用/)
})
