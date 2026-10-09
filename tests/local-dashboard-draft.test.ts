import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLocalDashboardDraft, createLocalTrendDashboardDraft, localValue, type LocalQuestionPlan } from '../src/services/localDashboardDraft.ts'
import { createDashboardWorkspaceV3, upsertDashboardApplicationInWorkspaceV3, saveDashboardWorkspaceV3, loadDashboardWorkspaceV3 } from '../src/services/dashboardWorkspaceV3.ts'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
const plan: LocalQuestionPlan = { request: '2026年8月门诊收入同比', month: '2026-08', comparison: 'yoy', scope: 'deidentified_local_validation', queryExecution: 'verified_read_only_evidence_snapshot', metric: { id: 'dashboard_outpatient_revenue', label: '门诊收入', unit: '元', source: 'ads.ads_hospital_indicator_all_col', limitation: '本地试用口径', sqlReference: 'sql/test.sql', evidenceReference: 'evidence/test.json' }, result: { value: '29885844.59', comparisonPercent: '14.7961', comparisonAvailable: true }, snapshotObservedAtUtc: '2026-09-17' }
test('generated draft preserves observed units, missing comparison and provenance', () => {
  const draft = createLocalDashboardDraft(plan, 'generated-test')
  assert.equal(draft.version, 3)
  assert.equal(draft.pages[0]!.components[0]!.textConfig!.content, '2,988.58 万元')
  assert.equal(draft.pages[0]!.components[1]!.textConfig!.content, '同比 14.80%')
  assert.equal((draft.extensionRefs.localGeneration as Record<string, unknown>).metricId, plan.metric.id)
  assert.match(createLocalDashboardDraft({ ...plan, result: { ...plan.result, comparisonAvailable: false, comparisonPercent: null } }, 'missing').pages[0]!.components[1]!.textConfig!.content, /暂无数据/)
  assert.equal(localValue({ ...plan, metric: { ...plan.metric, unit: '比值' }, result: { ...plan.result, value: '1.1916' } }), '119.16%')
  assert.equal(localValue({ ...plan, result: { ...plan.result, value: null } }), '暂无数据')
})
test('draft can be edited, saved and reopened without replacing an existing dashboard', () => {
  const original = createDefaultDashboardApplicationV3({ id: 'original', name: '已有看板' })
  const draft = createLocalDashboardDraft(plan, 'new-local')
  draft.pages[0]!.components[0]!.textConfig!.content = '调整后的标题与数值'
  const workspace = upsertDashboardApplicationInWorkspaceV3(createDashboardWorkspaceV3(original), draft, true)
  const values = new Map<string, string>()
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) }, removeItem: (key: string) => { values.delete(key) } }
  assert.equal(saveDashboardWorkspaceV3(storage, workspace).success, true)
  const loaded = loadDashboardWorkspaceV3(storage).workspace
  assert.equal(loaded.dashboards.length, 2)
  assert.equal(loaded.activeDashboardId, 'new-local')
  assert.equal(loaded.dashboards[1]!.pages[0]!.components[0]!.textConfig!.content, '调整后的标题与数值')
  assert.deepEqual(loaded.dashboards[0], original)
})
test('multi metric draft contains native trend components with replayable snapshot IDs', () => {
  const metric = { ...plan, datasetId: 'local-series:dashboard_outpatient_revenue:2026-01:2026-08', displayUnit: '万元', series: [{ month: '2026-08', value: '29885844.59' }] }
  const draft = createLocalTrendDashboardDraft({ request: plan.request, from: '2026-01', to: '2026-08', comparison: 'yoy', warnings: [], metrics: [metric, { ...metric, metric: { ...plan.metric, id: 'cost', label: '医疗成本' }, datasetId: 'local-series:dashboard_medical_cost:2026-01:2026-08' }] }, 'multi')
  const charts = draft.pages[0]!.components.filter(c => c.type === 'line')
  assert.equal(charts.length, 2)
  assert.ok(charts.every(c => c.dataConfig.sourceKind === 'server' && c.dataConfig.datasetId.startsWith('local-series:')))
  assert.equal(charts[0]!.dataConfig.measures[0]!.unit, '万元')
  const workspace = createDashboardWorkspaceV3(draft)
  const entries = new Map<string, string>()
  const storage = { getItem: (key: string) => entries.get(key) ?? null, setItem: (key: string, value: string) => { entries.set(key, value) }, removeItem: (key: string) => { entries.delete(key) } }
  assert.equal(saveDashboardWorkspaceV3(storage, workspace).success, true)
  const reopenedCharts = loadDashboardWorkspaceV3(storage).workspace.dashboards[0]!.pages[0]!.components.filter(c => c.type === 'line')
  assert.deepEqual(reopenedCharts.map(c => c.dataConfig.datasetId), charts.map(c => c.dataConfig.datasetId))
})
