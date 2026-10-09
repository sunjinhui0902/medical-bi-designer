import { getLocalBaselineSeries } from './local-baselines.mjs'

export const localMetricIntents = [
  ['dashboard_outpatient_revenue', /门(?:急)?诊.{0,8}收入/],
  ['dashboard_medical_cost', /医疗成本/],
  ['dashboard_outpatient_emergency_workload', /门(?:急)?诊.{0,8}人次/],
  ['dashboard_inpatient_discharge_workload', /(?:住院)?出院.{0,6}(?:工作量|人次)/],
  ['dashboard_surgery_count', /手术.{0,6}(?:台次|数量)/],
  ['dashboard_bed_utilization', /(?:病床|床位).{0,4}使用率/],
  ['dashboard_drg_cases', /DRG.{0,8}(?:分组|病例)/i],
  ['csk_examination_workload', /CSK.{0,8}(?:检查|工作量)/i],
]

function reject(message) {
  const error = new Error(message)
  error.status = 400
  throw error
}

export async function planLocalQuestion(question, root) {
  if (typeof question !== 'string' || !question.trim() || question.length > 500) {
    reject('请输入不超过 500 字的经营分析问题')
  }
  const input = question.trim()
  if (/净收入|唯一就诊|就诊号|手术去重|科室分摊成本/.test(input)) {
    reject('该表述与看板指标口径不同，请使用看板中的指标名称')
  }
  if (/三四级|[34]级手术|开放床(?:位)?数|次均费用|全院成本|全部医技|所有医技|自动决策/.test(input)) {
    reject('该指标尚无可用的本地业务合同')
  }
  if (/按科室|各科室|按机构|各机构|科室排名|医生排名|按医生/.test(input)) {
    reject('当前仅核验全院自然月粒度，不能进行维度下钻')
  }
  const matched = localMetricIntents.filter(([, pattern]) => pattern.test(input))
  if (matched.length !== 1) reject('请明确指定八类本地指标中的一个，避免混用口径')
  const monthMatches = [...input.matchAll(/(20\d{2})\s*(?:年|-|\/)\s*(0?[1-9]|1[0-2])\s*(?:月)?/g)]
  if (monthMatches.length !== 1) reject('当前查询计划只支持一个明确的完整月份')
  const month = `${monthMatches[0][1]}-${monthMatches[0][2].padStart(2, '0')}`
  const yoy = /同比|上年同月/.test(input)
  const mom = /环比|上月/.test(input)
  if (yoy && mom) reject('当前查询计划一次只支持一种比较方式')
  const comparison = yoy ? 'yoy' : mom ? 'mom' : 'none'
  const series = await getLocalBaselineSeries(matched[0][0], {
    from: month, to: month, comparison,
  }, root)
  if (series.dashboardAlignment !== 'DASHBOARD_FIELD_MATCH') {
    reject(series.dashboardAlignment === 'BLOCKED_LOCAL_DATA'
      ? '该看板指标缺少可用的本地数据或维表，暂不生成查询计划'
      : '该指标仍在与看板口径逐项核对，暂不生成查询计划')
  }
  return {
    planVersion: 1,
    request: input,
    status: series.rows[0].comparisonAvailable ? 'LOCAL_PLAN_READY' : 'COMPARISON_UNAVAILABLE',
    scope: 'deidentified_local_validation',
    queryExecution: 'verified_read_only_evidence_snapshot',
    localDraftUseAllowed: true,
    publishAllowed: false,
    automaticDecisionAllowed: false,
    metric: {
      id: series.metricId, label: series.label, unit: series.unit,
      grain: series.grain, source: series.source,
      businessApproval: series.businessApproval,
      dashboardAlignment: series.dashboardAlignment,
      sqlReference: series.sqlReference,
      evidenceReference: series.evidenceReference,
      limitation: series.limitation,
    },
    month,
    comparison,
    snapshotObservedAtUtc: series.snapshotObservedAtUtc,
    result: series.rows[0],
  }
}
