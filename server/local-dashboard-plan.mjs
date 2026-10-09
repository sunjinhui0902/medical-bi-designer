import { getLocalBaselineCatalog, getLocalBaselineSeries } from './local-baselines.mjs'
import { localMetricIntents } from './local-question-plan.mjs'
import { normalizeDatasetRuntimeView, applyDatasetRuntimeView } from './query-plan.mjs'

function reject(message) { const error = new Error(message); error.status = 400; throw error }
export const isLocalSeriesId = id => typeof id === 'string' && id.startsWith('local-series:')
export function localSeriesId(metricId, from, to) { return `local-series:${metricId}:${from}:${to}` }
function decodeId(id) {
  const match = /^local-series:([a-z_]+):(20\d{2}-(?:0[1-9]|1[0-2])):(20\d{2}-(?:0[1-9]|1[0-2]))$/.exec(id)
  if (!match) reject('本地趋势数据集标识无效')
  return { metricId: match[1], from: match[2], to: match[3] }
}
const displayUnit = unit => unit === '元' ? '万元' : unit === '比值' ? '%' : unit
const displayValue = (value, unit) => value == null || value === '' || !Number.isFinite(Number(value)) ? null : Number(value) * (unit === '元' ? 0.0001 : unit === '比值' ? 100 : 1)

export async function planLocalDashboard(question, root) {
  if (typeof question !== 'string' || !question.trim() || question.length > 500) reject('请输入不超过500字的经营问题')
  if (/按科室|各科室|按机构|各机构|按医生|排名/.test(question)) reject('当前趋势支持全院月度指标，暂不支持科室、机构或医生下钻')
  if (/净收入|唯一就诊|手术去重|科室分摊成本|三四级|开放床位|自动决策/.test(question)) reject('请先选择已提供的本地月度指标')
  const selected = localMetricIntents.filter(([, pattern]) => pattern.test(question))
  if (!selected.length || selected.length > 4) reject('请指定1至4个本地指标，如门诊收入、医疗成本、出院人次')
  const matches = [...question.matchAll(/(20\d{2})\s*(?:年|-|\/)\s*(0?[1-9]|1[0-2])\s*(?:月)?/g)]
  if (matches.length === 1) {
    const shortEnd = /(?:至|到|~|～)\s*(0?[1-9]|1[0-2])\s*月/.exec(question.slice(matches[0].index + matches[0][0].length))
    if (shortEnd) matches.push([shortEnd[0], matches[0][1], shortEnd[1]])
    else if (/(?:至|到|~|～)\s*\d/.test(question.slice(matches[0].index + matches[0][0].length))) reject('结束月份格式不明确，请写完整年月')
  }
  if (!matches.length || matches.length > 2) reject('请指定一个月份，或两个明确月份的区间，如2026年1月至2026年8月')
  let from = `${matches[0][1]}-${matches[0][2].padStart(2, '0')}`
  const to = `${matches.at(-1)[1]}-${matches.at(-1)[2].padStart(2, '0')}`
  if (from > to) reject('开始月份不能晚于结束月份')
  const catalog = await getLocalBaselineCatalog(root)
  if (matches.length === 1 && /趋势|走势/.test(question)) {
    const end = new Date(`${to}-01T00:00:00Z`); end.setUTCMonth(end.getUTCMonth() - 5)
    from = end.toISOString().slice(0, 7)
    const starts = selected.map(([id]) => catalog.metrics.find(m => m.id === id)?.availableCompleteMonths?.[0]).filter(Boolean)
    if (starts.length) from = [from, ...starts].sort().at(-1)
  }
  const comparison = /同比|上年同月/.test(question) ? 'yoy' : /环比|上月/.test(question) ? 'mom' : 'none'
  if (/同比/.test(question) && /环比/.test(question)) reject('请一次选择同比或环比')
  const metrics = [], warnings = []
  for (const [id] of selected) {
    try {
      const series = await getLocalBaselineSeries(id, { from, to, comparison }, root)
      metrics.push({
        request: question.trim(), month: to, comparison, scope: 'deidentified_local_validation', queryExecution: series.dataOrigin,
        metric: { id, label: series.label, unit: series.unit, source: series.source, limitation: series.limitation, sqlReference: series.sqlReference, evidenceReference: series.evidenceReference, definitionStatus: 'PROVISIONAL_LOCAL_USE' },
        snapshotObservedAtUtc: series.snapshotObservedAtUtc, result: series.rows.at(-1),
        series: series.rows, datasetId: localSeriesId(id, from, to), displayUnit: displayUnit(series.unit),
      })
      if (series.dashboardAlignment !== 'DASHBOARD_FIELD_MATCH') warnings.push(`${series.label}：使用本地暂定口径，后续可调整`)
    } catch (error) { warnings.push(`${catalog.metrics.find(m => m.id === id)?.label || id}：${error.message}`) }
  }
  if (!metrics.length) reject(warnings.join('；') || '所选期间暂无数据')
  return { planVersion: 2, request: question.trim(), from, to, comparison, metrics, warnings, scope: 'deidentified_local_validation', publishAllowed: false, automaticDecisionAllowed: false }
}

export async function getLocalSeriesDataset(id, root) {
  const { metricId, from, to } = decodeId(id)
  const series = await getLocalBaselineSeries(metricId, { from, to }, root)
  return { version: 2, id, code: id, name: `${series.label} · ${from}至${to}`, category: '本地快照趋势', purpose: '本地看板草稿', description: `本地证据快照；非实时数据库。${series.limitation}`, notes: `本地快照 · ${series.source}`, dataSourceId: 'local-evidence', status: 'validated', parameters: [{ id: 'month', code: 'month', name: '月份', type: 'singleSelect', required: false, sqlName: 'month', operator: 'eq', emptyPolicy: 'omit' }], fields: [
    { name: 'month', label: '月份', type: 'string', dataType: 'string', role: 'dimension' },
    { name: 'value', label: series.label, type: 'number', dataType: 'number', role: 'measure', unit: displayUnit(series.unit) },
  ], updatedAt: series.snapshotObservedAtUtc, readOnly: true }
}

export async function executeLocalSeriesDataset(id, request = {}, root) {
  const parameters = request.parameters || {}
  if (Object.keys(parameters).some(key => key !== 'month')) reject('本地快照趋势不支持筛选参数：仅可使用month月份参数')
  if (parameters.month != null && parameters.month !== '' && (typeof parameters.month !== 'string' || !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(parameters.month))) reject('月份参数需为YYYY-MM')
  const dataset = await getLocalSeriesDataset(id, root)
  const { metricId, from, to } = decodeId(id)
  const series = await getLocalBaselineSeries(metricId, { from, to }, root)
  let rows = series.rows.map(row => ({ month: row.month, value: displayValue(row.value, series.unit) }))
  if (parameters.month != null && parameters.month !== '') rows = rows.filter(row => row.month === parameters.month)
  let view
  try { view = normalizeDatasetRuntimeView(dataset, request.view, request.limit || 200) }
  catch (error) { reject(`本地趋势视图无效：${error.message}`) }
  if (view) rows = applyDatasetRuntimeView(rows, view)
  const total = rows.length
  const offset = request.pagination?.offset || 0, limit = request.pagination?.limit || request.limit || 200
  rows = rows.slice(offset, offset + limit)
  return { rows, fields: dataset.fields, rowCount: rows.length, source: 'local-evidence', dataOrigin: series.dataOrigin,
    ...(request.pagination ? { pagination: { ...request.pagination, ...(request.pagination.includeTotal ? { total } : {}) } } : {}) }
}
