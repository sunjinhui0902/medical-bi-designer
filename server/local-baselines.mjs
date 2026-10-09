import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const serverRoot = path.dirname(fileURLToPath(import.meta.url))
const mainlineRoot = path.resolve(serverRoot, '..', '..', 'medical-bi-mainline')
const expectedDomains = new Set(['收入', '成本', '门诊工作量', '住院工作量', '手术', '床位', '病种', '医技检查'])

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'))
}

function sha256(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex')
}

export async function getLocalBaselineCatalog(root = mainlineRoot) {
  const registry = await readJson(path.join(root, 'contracts', 'knowledge-v1-local-bindings.json'))
  if (registry.publishAllowed !== false || registry.automaticDecisionAllowed !== false
      || registry.candidateSqlExecutionAllowed !== false || registry.businessApproval !== 'PENDING_OWNER_REVIEW'
      || registry.scope !== 'deidentified_local_validation'
      || JSON.stringify(registry.allowedUse) !== '["editable_local_dashboard_draft"]') {
    throw new Error('LOCAL_BINDING_POLICY_INVALID')
  }
  const metrics = registry.metrics
  if (!Array.isArray(metrics) || metrics.length !== 8
      || new Set(metrics.map((metric) => metric.domain)).size !== expectedDomains.size
      || metrics.some((metric) => !expectedDomains.has(metric.domain))) {
    throw new Error('LOCAL_BINDING_DOMAIN_INVALID')
  }
  const ids = new Set()
  for (const metric of metrics) {
    if (!metric.id || ids.has(metric.id) || metric.candidateBindingUsable !== false
        || !['DASHBOARD_FIELD_MATCH', 'PENDING_COMPARE', 'BLOCKED_LOCAL_DATA'].includes(metric.dashboardAlignment)
        || !metric.sql?.startsWith('sql/v1_1/')
        || !metric.evidence?.startsWith('integration-evidence/')) {
      throw new Error('LOCAL_BINDING_ENTRY_INVALID')
    }
    ids.add(metric.id)
    const statement = await readFile(path.join(root, metric.sql), 'utf8')
    const evidence = await readJson(path.join(root, metric.evidence))
    const matching = Object.values(evidence.queries || {}).filter((query) =>
      query.sql_path === metric.sql && query.sql_sha256 === sha256(statement) && query.status === 'PASS')
  if (evidence.transaction_read_only !== 'on' || matching.length !== 1
        || !metric.valueField || !matching[0].rows?.length
        || matching[0].rows.some((row) => row[metric.valueField] == null)) {
      throw new Error('LOCAL_BINDING_EVIDENCE_INVALID')
    }
  }
  return {
    ready: true,
    scope: registry.scope,
    validationStatus: registry.validationStatus,
    businessApproval: registry.businessApproval,
    allowedUse: registry.allowedUse,
    publishAllowed: false,
    automaticDecisionAllowed: false,
    candidateSqlExecutionAllowed: false,
    metrics: metrics.map((metric) => ({
      id: metric.id,
      domain: metric.domain,
      label: metric.label,
      unit: metric.unit,
      validatedGrain: metric.validatedGrain,
      source: metric.source,
      dateField: metric.dateField,
      valueField: metric.valueField,
      dashboardAlignment: metric.dashboardAlignment,
      sqlReference: metric.sql,
      evidenceReference: metric.evidence,
      candidateAssetId: metric.candidateAssetId,
      availableCompleteMonths: metric.availableCompleteMonths,
      limitation: metric.limitation,
      businessApproval: registry.businessApproval,
    })),
  }
}

function badRequest(message, status = 400) {
  const error = new Error(message)
  error.status = status
  return error
}

export async function getLocalBaselineSeries(metricId, options = {}, root = mainlineRoot) {
  const catalog = await getLocalBaselineCatalog(root)
  const metric = catalog.metrics.find((entry) => entry.id === metricId)
  if (!metric) throw badRequest('本地指标不存在', 404)
  if (Object.keys(options).some((key) => !['from', 'to', 'comparison'].includes(key))) {
    throw badRequest('查询包含未支持的参数')
  }
  const comparison = options.comparison || 'none'
  if (!['none', 'mom', 'yoy'].includes(comparison)) throw badRequest('比较方式无效')
  const evidence = await readJson(path.join(root, metric.evidenceReference))
  const statement = await readFile(path.join(root, metric.sqlReference), 'utf8')
  const matches = Object.values(evidence.queries || {}).filter((entry) =>
    entry.sql_path === metric.sqlReference && entry.sql_sha256 === sha256(statement)
    && entry.status === 'PASS')
  if (matches.length !== 1 || evidence.transaction_read_only !== 'on') {
    throw new Error('LOCAL_BINDING_EVIDENCE_INVALID')
  }
  const query = matches[0]
  const rows = query.rows
  const first = rows[0].month_start.slice(0, 7)
  const last = rows.at(-1).month_start.slice(0, 7)
  const from = options.from || first
  const to = options.to || last
  if (![from, to].every((month) => /^\d{4}-(0[1-9]|1[0-2])$/.test(month))
      || from < first || to > last || from > to) {
    throw badRequest(`月份必须在 ${first} 至 ${last} 的完整月范围内`)
  }
  const selected = rows.filter((row) => row.month_start.slice(0, 7) >= from
    && row.month_start.slice(0, 7) <= to)
  const expectedMonths = (Number(to.slice(0, 4)) - Number(from.slice(0, 4))) * 12
    + Number(to.slice(5, 7)) - Number(from.slice(5, 7)) + 1
  if (selected.length !== expectedMonths || selected[0]?.month_start.slice(0, 7) !== from
      || selected.at(-1)?.month_start.slice(0, 7) !== to) {
    throw badRequest('所选月份存在未验证的数据缺口')
  }
  const output = selected.map((row) => {
    const comparisonPercent = comparison === 'mom' ? row.mom_pct
      : comparison === 'yoy' ? row.yoy_pct : null
    const delta = row.ads_delta_yuan ?? row.ads_delta_count ?? row.ads_delta_days ?? null
    return {
      month: row.month_start.slice(0, 7),
      value: row[metric.valueField],
      comparisonPercent,
      comparisonAvailable: comparison === 'none' || comparisonPercent != null,
      adsDifference: delta,
      adsDifferencePresent: delta != null && Number(delta) !== 0,
      dashboardVsYsDifferenceYuan: row.dashboard_minus_ys_yuan ?? null,
      duplicateKeyDelta: row.duplicate_key_delta ?? null,
    }
  })
  return {
    metricId,
    label: metric.label,
    unit: metric.unit,
    grain: metric.validatedGrain,
    source: metric.source,
    snapshotObservedAtUtc: evidence.observed_at_utc,
    dataOrigin: 'verified_read_only_evidence_snapshot',
    businessApproval: catalog.businessApproval,
    dashboardAlignment: metric.dashboardAlignment,
    publishAllowed: false,
    automaticDecisionAllowed: false,
    sqlReference: metric.sqlReference,
    evidenceReference: metric.evidenceReference,
    limitation: metric.limitation,
    from,
    to,
    comparison,
    rows: output,
  }
}
