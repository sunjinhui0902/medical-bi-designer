import type { HospitalModelPlan } from './hospitalOverviewDraft.ts'

export const hospitalSamplePlanId = 'local-template:hospital-overview-v1'

// A reproducible sample blueprint; this is not a model generation result.
export function createHospitalSamplePlan(months: string[]): HospitalModelPlan {
  const month = months.filter(value => /^20\d{2}-(0[1-9]|1[0-2])$/.test(value) && value <= '2026-08').sort().at(-1)
  if (!month) throw new Error('截至 2026-08 没有可用的院级快照月份')
  return { schemaVersion: 1, template: 'hospital-overview', title: '医院运营概览 · 本地模板', month, comparison: 'yoy', sections: ['summary', 'operations', 'trend', 'departments', 'composition', 'beds', 'costs'], notes: '本地模板装配；ADS 只读快照，预算缺失，知识口径暂定。非 AI 新生成。' }
}
