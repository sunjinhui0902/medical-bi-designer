import { createDefaultDashboardApplicationV3 } from '../models/dashboard-v3.ts'
import type { DashboardComponent } from '../models/dashboard.ts'
import { validateDashboardApplicationV3 } from './dashboardValidationV3.ts'

export interface LocalQuestionPlan {
  request: string
  month: string
  comparison: string
  scope: string
  queryExecution: string
  metric: { id: string; label: string; unit: string; source: string; limitation: string; sqlReference: string; evidenceReference: string }
  result: { value: string | number | null; comparisonPercent: string | number | null; comparisonAvailable: boolean }
  snapshotObservedAtUtc: string
}

export interface LocalDashboardPlan {
  request: string; from: string; to: string; comparison: string; warnings: string[]
  metrics: Array<LocalQuestionPlan & { datasetId: string; displayUnit: string; series: Array<{ month: string; value: string | number | null }> }>
}

export function createLocalTrendDashboardDraft(plan: LocalDashboardPlan, id = `local-draft-${crypto.randomUUID()}`) {
  if (!plan.metrics.length || plan.metrics.length > 4) throw new Error('请选择1至4个指标')
  const app = createDefaultDashboardApplicationV3({ id, name: `${plan.from}至${plan.to} 经营趋势`, pageName: '指标趋势' })
  app.description = plan.request
  app.extensionRefs.localGeneration = { request: plan.request, metricDefinition: 'PROVISIONAL_LOCAL_USE', dataMode: 'evidence_snapshot_series', from: plan.from, to: plan.to, metrics: plan.metrics.map(p => ({ id: p.metric.id, sqlReference: p.metric.sqlReference, evidenceReference: p.metric.evidenceReference, snapshotObservedAtUtc: p.snapshotObservedAtUtc })) }
  const count = plan.metrics.length
  const width = (1152 - (count - 1) * 16) / count
  const chartRows = Math.ceil(count / 2)
  const noteY = 228 + chartRows * 310
  const components: DashboardComponent[] = []
  plan.metrics.forEach((metric, index) => {
    const single = createLocalDashboardDraft(metric, `${id}-${index}`)
    const card = single.pages[0]!.components[0]!
    card.position = { x: 24 + index * (width + 16), y: 24, width, height: 180, zIndex: 1 }
    card.textConfig!.fontSize = count > 2 ? 24 : 34
    const change = single.pages[0]!.components[1]!.textConfig!.content
    card.textConfig!.content += `\n${change}`
    components.push(card)
    components.push({
      id: `${id}-trend-${index}`, type: 'line', title: `${metric.metric.label}月度趋势 · ${metric.displayUnit}`,
      position: { x: 24 + (index % 2) * 588, y: 228 + Math.floor(index / 2) * 310, width: count === 1 ? 1152 : 564, height: 286, zIndex: 1 },
      dataConfig: { version: 3, sourceKind: 'server', datasetId: metric.datasetId, dimensions: [{ field: 'month', role: 'category', sort: 'asc' }], measures: [{ field: 'value', alias: metric.metric.label, aggregation: 'sum', chartType: 'line', axis: 'left', unit: metric.displayUnit }], filters: [], sort: [{ field: 'month', direction: 'asc' }], limit: 200, parameterBindings: [], refreshPolicy: 'onPageEnter' },
      styleConfig: { background: '#ffffff', titleColor: '#243447', titleSize: 16, titleWeight: 600, titleVisible: true, borderRadius: 12 },
    })
  })
  const notes = createLocalDashboardDraft(plan.metrics[0]!, `${id}-notes`).pages[0]!.components[2]!
  notes.position = { x: 24, y: noteY, width: 1152, height: 120 + count * 100, zIndex: 1 }
  notes.textConfig!.fontSize = 16
  notes.textConfig!.content = `本地快照趋势 · 指标口径先试用，可继续调整；趋势从证据快照读取，不代表实时数据库。\n${plan.metrics.map(p => `${p.metric.label}：${p.metric.source}\n${p.metric.limitation || ''}`).join('\n')}\n${plan.warnings.join('；')}`
  components.push(notes)
  app.pages[0]!.canvas.height = noteY + notes.position.height + 24
  app.pages[0]!.components = components
  const validation = validateDashboardApplicationV3(app)
  if (!validation.valid) throw new Error(validation.issues.map(i => i.message).join('；'))
  return app
}

export function localValue(plan: LocalQuestionPlan): string {
  const value = plan.result.value
  if (value == null || value === '' || !Number.isFinite(Number(value))) return '暂无数据'
  const amount = Number(value)
  if (plan.metric.unit === '元') return `${(amount / 10000).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} 万元`
  if (plan.metric.unit === '比值') return `${(amount * 100).toFixed(2)}%`
  return `${amount.toLocaleString('zh-CN', { maximumFractionDigits: 2 })} ${plan.metric.unit}`
}

export function createLocalDashboardDraft(plan: LocalQuestionPlan, id = `local-draft-${crypto.randomUUID()}`) {
  if (plan.scope !== 'deidentified_local_validation' || plan.queryExecution !== 'verified_read_only_evidence_snapshot') throw new Error('本地查询计划格式无效')
  const app = createDefaultDashboardApplicationV3({ id, name: `${plan.month} ${plan.metric.label}`, pageName: '经营概览' })
  app.description = plan.request
  app.extensionRefs.localGeneration = { request: plan.request, metricId: plan.metric.id, sqlReference: plan.metric.sqlReference, evidenceReference: plan.metric.evidenceReference, snapshotObservedAtUtc: plan.snapshotObservedAtUtc, metricDefinition: 'PROVISIONAL_LOCAL_USE', dataMode: 'static_snapshot' }
  const text = (key: string, title: string, content: string, x: number, y: number, width: number, height: number, size: number): DashboardComponent => ({
    id: `${id}-${key}`, type: 'text', title,
    position: { x, y, width, height, zIndex: 1 },
    dataConfig: { version: 3, sourceKind: 'mock', datasetId: '', dimensions: [], measures: [], filters: [], sort: [], limit: 200, parameterBindings: [], refreshPolicy: 'manual' },
    styleConfig: { background: '#ffffff', titleColor: '#243447', titleSize: 16, titleWeight: 600, titleVisible: true, borderRadius: 12 },
    textConfig: { content, color: '#243447', fontSize: size, fontWeight: 500, align: 'left', verticalAlign: 'center', lineHeight: 1.6 },
  })
  const change = plan.comparison === 'none' ? '未选择比较方式' : plan.result.comparisonAvailable && plan.result.comparisonPercent != null ? `${plan.comparison === 'yoy' ? '同比' : '环比'} ${Number(plan.result.comparisonPercent).toFixed(2)}%` : '比较基期暂无数据'
  app.pages[0]!.components = [
    text('value', `${plan.metric.label} · ${plan.month}`, localValue(plan), 24, 24, 700, 180, 42),
    text('comparison', '变化观察', change, 748, 24, 428, 180, 28),
    text('source', '来源与口径（可编辑）', `本地快照草稿 · 指标定义暂定，使用时可调整\n来源：${plan.metric.source}\n快照时间：${plan.snapshotObservedAtUtc || '未标记'}\n${plan.metric.limitation || ''}\n当前数值为生成时的静态文本，不自动刷新。`, 24, 228, 1152, 260, 18),
  ]
  const validation = validateDashboardApplicationV3(app)
  if (!validation.valid) throw new Error(validation.issues.map(i => i.message).join('；'))
  return app
}
