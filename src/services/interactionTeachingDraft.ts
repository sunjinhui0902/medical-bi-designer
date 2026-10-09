import { createDefaultDashboardApplicationV3, type ActionDefinitionV3, type DashboardComponentV3 } from '../models/dashboard-v3.ts'
import { validateDashboardApplicationV3 } from './dashboardValidationV3.ts'
import type { LocalDashboardPlan } from './localDashboardDraft.ts'

export function createInteractionTeachingDraft(plan: LocalDashboardPlan, id = `interaction-demo-${crypto.randomUUID()}`) {
  const metric = plan.metrics[0]
  if (!metric || metric.series.length < 2) throw new Error('教学演示至少需要两个月的本地数据')
  const app = createDefaultDashboardApplicationV3({ id, name: '参数联动跳转下钻 · 教学演示', pageName: '交互练习' })
  const home = app.pages[0]!, detail = structuredClone(home)
  home.canvas.height = 1100
  detail.id = `${id}-detail`; detail.code = 'detail'; detail.name = '月份详情'; detail.order = 2; detail.canvas.height = 720
  const monthId = `${id}-month`, valueId = `${id}-value`, pathId = `${id}-path`
  app.parameters = [
    { id: monthId, code: 'teaching_month', name: '演示月份', type: 'singleSelect', scope: 'application', required: false, defaultValue: plan.to, source: { kind: 'static', options: metric.series.map(row => ({ label: row.month, value: row.month })) } },
    { id: valueId, code: 'teaching_value', name: '下钻指标值', type: 'number', scope: 'application', required: false, source: { kind: 'static', options: [] } },
  ]
  app.drillPaths = [{ id: pathId, name: '月份→指标值（教学）', levels: [{ id: `${id}-level-month`, label: '月份', field: 'month', parameterId: monthId }, { id: `${id}-level-value`, label: '指标值', field: 'value', parameterId: valueId }] }]
  home.controls = [{ id: `${id}-control`, type: 'singleSelect', parameterIds: [monthId], position: { x: 0, y: 0, width: 250, height: 56, zIndex: 1 }, styleConfig: {}, interaction: { submitMode: 'immediate', clearable: true } }]
  const base = (key: string, title: string, x: number, y: number, width: number, height: number): DashboardComponentV3 => ({ id: `${id}-${key}`, type: 'text', title, position: { x, y, width, height, zIndex: 1 }, dataConfig: { version: 3, sourceKind: 'mock', datasetId: '', dimensions: [], measures: [], filters: [], sort: [], limit: 200, parameterBindings: [], refreshPolicy: 'manual' }, styleConfig: { background: '#fff', titleColor: '#243447', titleSize: 16, titleWeight: 600, titleVisible: true, borderRadius: 10 } })
  const text = (key: string, title: string, content: string, x: number, y: number, width: number, height: number, actions?: ActionDefinitionV3[]) => {
    const c = base(key,title,x,y,width,height)
    c.textConfig = { content, color: '#243447', fontSize: 18, fontWeight: 500, align: 'left', verticalAlign: 'center', lineHeight: 1.6 }
    if (actions) c.events = [{ id: `${c.id}-event`, enabled: true, event: 'click', actions }]
    return c
  }
  const table = (key: string, title: string, x: number, y: number, filtered: boolean, actions?: ActionDefinitionV3[]) => {
    const c = base(key,title,x,y,550,300); c.type = 'table'
    c.dataConfig = { version: 3, sourceKind: 'server', datasetId: metric.datasetId, dimensions: [{ field: 'month', role: 'category' }], measures: [{ field: 'value', aggregation: 'sum', alias: metric.metric.label, unit: metric.displayUnit }], filters: [], sort: [{ field: 'month', direction: 'asc' }], limit: 200, parameterBindings: filtered ? [{ datasetParameterCode: 'month', parameterId: monthId }] : [], refreshPolicy: 'onParameterChange' }
    c.tableConfig = { columns: [{ field: 'month', label: '月份（点击这一行）', width: 180, format: 'auto', summary: 'none' }, { field: 'value', label: `${metric.metric.label} · ${metric.displayUnit}`, width: 260, format: 'number', summary: 'none' }], striped: true, showHeader: true }
    if (actions) c.events = [{ id: `${c.id}-event`, enabled: true, event: 'rowClick', actions }]
    return c
  }
  const targetId = `${id}-filtered`
  home.components = [
    text('guide','四步演示 · 无需填字段',`① 顶部选月份：右侧结果立即变化。② 点击左表月份：右表联动；用“清除联动”恢复。③ 点击“跳转详情”，用“返回”回到本页。④ 点击下方下钻表，再点击详情行：查看面包屑，可逐层返回。\n${metric.metric.label} · 本地快照，不是实时数据库；指标口径暂定。`,24,24,1152,140),
    text('jump','③ 跳转详情','点击这里查看当前月份详情 →',24,184,550,64,[{ id: `${id}-navigate`, type: 'navigatePage', pageId: detail.id, history: 'push' }]),
    table('source','② 点击月份联动右表',24,276,false,[{ id: `${id}-link`, type: 'applyLinkage', assignments: [{ parameterId: monthId, value: { kind: 'eventField', path: '/row/month' } }], targetComponentIds: [targetId] }]),
    table('filtered','①② 当前月份结果',612,276,true),
    table('drill','④ 点击月份进入下钻',24,630,false,[{ id: `${id}-drill-month`, type: 'drillDown', pathId }, { id: `${id}-drill-navigate`, type: 'navigatePage', pageId: detail.id, history: 'push' }]),
    text('source-note','数据来源',`${metric.metric.source}\n${metric.metric.limitation || ''}\n${metric.snapshotObservedAtUtc}`,612,630,550,300),
  ]
  detail.controls = []
  detail.components = [text('detail-guide','月份详情 · 真实交互练习','直接跳转时，用顶部“返回”回到练习页。若已从下钻表进入，请点击下方月份行继续下钻，面包屑显示“指标值”；点击面包屑箭头可逐层返回。',24,24,1152,140), table('detail-table','④ 点击此行继续下钻到指标值',24,190,true,[{ id: `${id}-drill-value`, type: 'drillDown', pathId }])]
  app.pages.push(detail)
  app.extensionRefs.localGeneration = { metricDefinition: 'PROVISIONAL_LOCAL_USE', dataMode: 'evidence_snapshot_series', teachingDemo: true, sqlReference: metric.metric.sqlReference, evidenceReference: metric.metric.evidenceReference }
  const result = validateDashboardApplicationV3(app)
  if (!result.valid) throw new Error(result.issues.map(issue => issue.message).join('；'))
  return app
}
