import { createDefaultDashboardApplicationV3, type DashboardComponentV3, type ActionDefinitionV3 } from '../models/dashboard-v3.ts'
import { validateDashboardApplicationV3 } from './dashboardValidationV3.ts'
export interface BusinessSampleInfo { month: string; observedAt: string; departmentCount: number; doctorCount: number; departments?: Array<{ dept_id: string; department: string }> }
export function createBusinessInteractionDraft(sample: BusinessSampleInfo, id = `business-demo-${crypto.randomUUID()}`) {
  if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(sample.month) || sample.departmentCount < 1 || sample.doctorCount < 1) throw new Error('本地科室医生样本尚不可用')
  const app = createDefaultDashboardApplicationV3({ id, name: '科室→医生 · 本地业务演示', pageName: '科室练习' })
  const home = app.pages[0]!, doctors = structuredClone(home), detail = structuredClone(home)
  doctors.id = `${id}-doctors-page`; doctors.code = 'doctors'; doctors.name = '科室医生'; doctors.order = 2
  detail.id = `${id}-detail-page`; detail.code = 'detail'; detail.name = '医生详情'; detail.order = 3
  const deptId = `${id}-department`, doctorId = `${id}-doctor`, monthId = `${id}-month`, pathId = `${id}-path`
  app.parameters = [
    { id: monthId, code: 'business_month', name: '样本月份', type: 'singleSelect', scope: 'application', required: false, defaultValue: sample.month, source: { kind: 'static', options: [{ label: sample.month, value: sample.month }] } },
    ...[{ id: deptId, code: 'business_department', name: '科室' }, { id: doctorId, code: 'business_doctor', name: '医生' }].map(p => ({ ...p, type: 'string' as const, scope: 'application' as const, required: false, source: { kind: 'static' as const, options: [] } })),
  ]
  if (sample.departments?.length) {
    const department = app.parameters.find(p => p.id === deptId)!
    department.type = 'singleSelect'
    department.source = { kind: 'static', options: sample.departments.map(d => ({ label: d.department, value: d.dept_id })) }
  }
  app.drillPaths = [{ id: pathId, name: '科室→医生（本地样本）', levels: [{ id: `${id}-dept-level`, label: '科室', field: 'dept_id', parameterId: deptId }, { id: `${id}-doctor-level`, label: '医生', field: 'doctor_id', parameterId: doctorId }] }]
  // Native replace/back restores its checkpoint. Clear on home entry afterwards.
  home.pageEvents = [{ id: `${id}-home-enter`, event: 'pageEnter', enabled: true, actions: [{ id: `${id}-home-enter-link`, type: 'clearLinkage' }, { id: `${id}-home-enter-drill`, type: 'clearDrill', pathId }] }]
  home.controls = [{ id: `${id}-month-control`, type: 'singleSelect', parameterIds: [monthId], position: { x: 0, y: 0, width: 240, height: 56, zIndex: 1 }, styleConfig: {}, interaction: { submitMode: 'immediate', clearable: true } }]
  if (sample.departments?.length) home.controls.push({ id: `${id}-department-control`, type: 'singleSelect', parameterIds: [deptId], position: { x: 250, y: 0, width: 380, height: 56, zIndex: 1 }, styleConfig: {}, interaction: { submitMode: 'immediate', clearable: true } })
  const base = (key: string, title: string, y: number, x = 24, width = 1152, height = 120): DashboardComponentV3 => ({ id: `${id}-${key}`, type: 'text', title, position: { x, y, width, height, zIndex: 1 }, dataConfig: { version: 3, sourceKind: 'mock', datasetId: '', dimensions: [], measures: [], filters: [], sort: [], limit: 200, parameterBindings: [], refreshPolicy: 'manual' }, styleConfig: { background: '#fff', titleColor: '#243447', titleSize: 16, titleWeight: 600, titleVisible: true, borderRadius: 10 } })
  const text = (key: string, title: string, content: string, y: number, actions?: ActionDefinitionV3[]) => {
    const c = base(key, title, y); c.textConfig = { content, color: '#243447', fontSize: 17, fontWeight: 500, align: 'left', verticalAlign: 'center', lineHeight: 1.6 }
    if (actions) c.events = [{ id: `${c.id}-event`, event: 'click', enabled: true, actions }]
    return c
  }
  const table = (key: string, title: string, isDoctor: boolean, y: number, x: number, actions?: ActionDefinitionV3[], detailOnly = false) => {
    const c = base(key, title, y, x, 550, 300); c.type = 'table'
    const fields = isDoctor ? ['month', 'dept_id', 'doctor_id', 'doctor'] : ['month', 'dept_id', 'department']
    c.dataConfig = { version: 3, sourceKind: 'server', datasetId: isDoctor ? 'local-business:doctors' : 'local-business:departments', dimensions: fields.map(field => ({ field, role: 'category' })), measures: [{ field: 'visits', aggregation: 'sum', alias: '门诊人次', unit: '人次' }], filters: [], sort: [{ field: 'visits', direction: 'desc' }], limit: 200, parameterBindings: [{ datasetParameterCode: 'month', parameterId: monthId }, ...(isDoctor ? [{ datasetParameterCode: 'dept_id', parameterId: deptId }] : []), ...(detailOnly ? [{ datasetParameterCode: 'doctor_id', parameterId: doctorId }] : [])], refreshPolicy: 'onParameterChange' }
    const label = isDoctor ? '医生编号' : '科室'
    c.tableConfig = { columns: [{ field: isDoctor ? 'doctor' : 'department', label: actions?.length ? `${label}（点击行）` : label, width: 330, format: 'auto', summary: 'none' }, { field: 'visits', label: '门诊人次 · 人次', width: 170, format: 'number', summary: 'none' }], striped: true, showHeader: true }
    if (actions) c.events = [{ id: `${c.id}-event`, event: 'rowClick', enabled: true, debounceMs: 200, conditions: [{ left: { kind: 'eventField', path: isDoctor ? '/row/doctor_id' : '/row/dept_id' }, operator: 'notEmpty' }], actions }]
    if (key === 'link-source' && c.events) c.events[0]!.debounceMs = 0
    return c
  }
  const reset = (key: string) => text(key, '一键重新开始', '点击这里：清除联动和下钻，回到科室练习。', 160, [{ id: `${id}-${key}-clear-link`, type: 'clearLinkage' }, { id: `${id}-${key}-clear-drill`, type: 'clearDrill', pathId }, { id: `${id}-${key}-home`, type: 'navigatePage', pageId: home.id, history: 'replace' }])
  const note = `${sample.month} · bd_odr只读快照 · ${sample.departmentCount}科室 / ${sample.doctorCount}医生样本，医生编号展示。不是实时数据或全院合计；科室与医生口径未对账。来源：ads科室/医生指标表 gzl_mzrs。采集：${sample.observedAt}`
  home.canvas.height = 1140
  doctors.canvas.height = 660
  detail.canvas.height = 660
  home.components = [text('guide', '科室→医生 · 三步练习', '① 点左侧科室，右侧医生联动。② 点下方科室，进入科室医生下钻页。③ 点医生，查看医生详情和两层面包屑。再次演示请点“一键重新开始”。普通返回只返回页面，逐层返回使用面包屑。', 24), reset('home-reset'), table('link-source', '① 点击科室联动右表', false, 310, 24, [{ id: `${id}-link`, type: 'applyLinkage', assignments: [{ parameterId: deptId, value: { kind: 'eventField', path: '/row/dept_id' } }], targetComponentIds: [`${id}-linked-doctors`] }]), table('linked-doctors', '① 科室医生样本', true, 310, 612), table('drill-source', '② 点击科室下钻', false, 660, 24, [{ id: `${id}-clear-before-drill`, type: 'clearLinkage' }, { id: `${id}-down-dept`, type: 'drillDown', pathId }, { id: `${id}-go-doctors`, type: 'navigatePage', pageId: doctors.id, history: 'push' }]), text('source-note', '本地样本范围与来源', note, 990)]
  doctors.components = [text('doctor-guide', '③ 点击医生查看详情', note + '\n使用面包屑逐层返回；要重新选科室，请点“一键重新开始”。', 24), reset('doctor-reset'), table('doctors', '科室医生 · 点击行继续下钻', true, 310, 24, [{ id: `${id}-down-doctor`, type: 'drillDown', pathId }, { id: `${id}-go-detail`, type: 'navigatePage', pageId: detail.id, history: 'push' }])]
  detail.components = [text('detail-guide', '医生详情 · 本地样本', note, 24), reset('detail-reset'), table('doctor-detail', '当前医生门诊人次', true, 310, 24, undefined, true)]
  app.pages.push(doctors, detail)
  app.extensionRefs.localGeneration = { teachingDemo: true, businessSample: true, partialSample: true, source: 'bd_odr_readonly_aggregate_snapshot', month: sample.month, observedAt: sample.observedAt, metricDefinition: 'PROVISIONAL_LOCAL_USE' }
  const result = validateDashboardApplicationV3(app)
  if (!result.valid) throw new Error(result.issues.map(issue => issue.message).join('；'))
  return app
}
