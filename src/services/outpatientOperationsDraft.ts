import { createHospitalOverviewDraft, type HospitalModelPlan } from './hospitalOverviewDraft.ts'
import { createBusinessInteractionDraft, type BusinessSampleInfo } from './businessInteractionDraft.ts'
import { validateDashboardApplicationV3 } from './dashboardValidationV3.ts'
import { addOutpatientDepartmentPage } from './outpatientDepartmentPage.ts'

// Assemble only declared V3 pages, bindings and actions. The two local ADS
// snapshots have different coverage, so their month parameters stay separate.
export function createOutpatientOperationsDraft(plan: HospitalModelPlan, months: string[], requestId: string, sample: BusinessSampleInfo, provider: string) {
  const hospital = createHospitalOverviewDraft({ ...plan, title: '门诊运营分析 · 本地样例', sections: ['operations', 'trend'] }, months, requestId, provider)
  hospital.runtimePolicy.previewScaleMode = 'width'
  const business = createBusinessInteractionDraft(sample)
  const hospitalPage = hospital.pages[0]!
  const departmentPage = business.pages[0]!
  hospitalPage.id = `${hospital.id}-hospital-page`
  hospitalPage.code = 'outpatient_hospital'
  hospital.defaultPageId = hospitalPage.id
  departmentPage.pageEvents = [] // Preserve the department selected on the hospital page.
  departmentPage.name = '科室分析 · 部分样本'
  business.pages[1]!.name = '医生分析 · 部分样本'
  business.pages[2]!.name = '医生明细 · 部分样本'
  hospitalPage.name = '医院门诊总览'
  hospitalPage.order = 1
  departmentPage.order = 2
  business.pages[1]!.order = 3
  business.pages[2]!.order = 4
  for (const page of business.pages) {
    Object.assign(page.canvas, { width: 1200, background: '#eef3fb', showGrid: false })
    page.titleStyle.show = false
    for (const component of page.components) Object.assign(component.styleConfig, { background: '#ffffff', borderColor: '#e7edf6', titleColor: '#203452', borderRadius: 10, shadow: '0 3px 12px rgba(35,64,110,0.04)' })
    const guide = page.components.find(component => component.id.endsWith('-guide'))
    if (guide?.textConfig) guide.textConfig.content = page === departmentPage
      ? `科室门诊人次 · ${sample.month} 局部样本。医院页选中的科室会联动右侧医生表；点击下方科室可进入医生分析。按已有数据演示，当前页面为医生交互样本入口。`
      : page === business.pages[1]
        ? `医生分析 · ${sample.month} 编号医生局部样本。点击医生进入明细；无去年同期和收入证据。`
        : `医生明细 · ${sample.month} 编号医生局部样本。当前仅有人次，不能作为正式个人绩效或全院排名。`
    const back = structuredClone(page.components.find(component => component.type === 'text')!)
    back.id = `${page.id}-back`
    back.title = '返回上级'
    back.textConfig!.content = '← 返回上级页面'
    back.position = { x: 840, y: 174, width: 300, height: 86, zIndex: 2 }
    back.events = [{ id: `${back.id}-event`, event: 'click', enabled: true, actions: [{ id: `${back.id}-action`, type: 'pageBack' }] }]
    page.components.push(back)
  }
  const departmentDrill = departmentPage.components.find(component => component.id.endsWith('-drill-source'))
  if (departmentDrill?.events?.[0]) departmentDrill.events[0].actions.splice(1, 0, { id: `${departmentDrill.id}-clear-existing-drill`, type: 'clearDrill', pathId: business.drillPaths![0]!.id })
  hospitalPage.components = hospitalPage.components.filter(component =>
    !component.id.includes('-inpatient_') && !component.id.includes('-discharges-') && !component.id.includes('-bed_utilization-') && component.id !== `${hospital.id}-source`)
  const masthead = hospitalPage.components.find(component => component.id.endsWith('-masthead'))
  if (masthead?.textConfig) masthead.textConfig.content = '门诊运营分析'
  const edition = hospitalPage.components.find(component => component.id.endsWith('-edition'))
  if (edition?.textConfig) edition.textConfig.content = '本地只读 ADS  ·  院级完整 / 科医局部'
  let cardIndex = 0
  const monthlyCards = hospitalPage.components.filter(component => component.type === 'kpi')
  for (const component of monthlyCards) {
    component.position = { x: 24 + cardIndex * 490, y: 100, width: 472, height: 140, zIndex: 1 }
    component.styleConfig.titleSize = 16
    cardIndex++
  }
  for (const [index, key, title] of [[0, 'revenue', '年累计门诊收入'], [1, 'visits', '年累计门急诊人次'], [2, 'avg', '年累计次均费用']] as const) {
    const card = structuredClone(monthlyCards[index]!)
    card.id = `${hospital.id}-outpatient-ytd-${key}`
    card.title = title
    card.position = { x: 24 + index * 490, y: 252, width: 472, height: 140, zIndex: 1 }
    card.dataConfig.datasetId = `local-overview:outpatient_ytd_${key}`
    if (card.kpiConfig) card.kpiConfig.yoyField = 'prior_value'
    hospitalPage.components.push(card)
  }
  for (const component of hospitalPage.components) {
    if (component.type === 'kpi' && component.kpiConfig && ['outpatient_revenue', 'outpatient_visits', 'outpatient_avg'].some(key => component.dataConfig.datasetId === `local-overview:${key}`)) {
      component.kpiConfig.yoyField = 'prior_value'
    }
  }
  const trend = hospitalPage.components.find(component => component.type === 'line')
  if (trend) {
    const revenueTrend = structuredClone(trend)
    revenueTrend.id = `${hospital.id}-outpatient-revenue-trend`
    revenueTrend.title = '门诊收入趋势（万元）'
    revenueTrend.position = { x: 760, y: 410, width: 716, height: 310, zIndex: 1 }
    revenueTrend.dataConfig.datasetId = 'local-overview:outpatient_revenue'
    revenueTrend.dataConfig.measures[0]!.alias = '门诊收入'
    if (revenueTrend.dataConfig.version === 3) revenueTrend.dataConfig.parameterBindings = []
    trend.title = '门急诊人次趋势'
    trend.position = { x: 24, y: 410, width: 716, height: 310, zIndex: 1 }
    trend.dataConfig.datasetId = 'local-overview:outpatient_visits'
    trend.dataConfig.measures[0]!.alias = '门急诊人次'
    if (trend.dataConfig.version === 3) trend.dataConfig.parameterBindings = []
    hospitalPage.components.push(revenueTrend)
    for (const [key, title, x, width] of [
      ['outpatient_visit_mix', '门诊 / 急诊人次构成', 554, 442],
      ['outpatient_revenue_mix', '门诊收入构成（万元）', 1012, 464],
    ] as const) {
      const pie = structuredClone(trend)
      pie.id = `${hospital.id}-${key}`
      pie.type = 'pie'
      pie.title = title
      pie.position = { x, y: 738, width, height: 330, zIndex: 1 }
      pie.dataConfig.datasetId = `local-overview:${key}`
      pie.dataConfig.dimensions = [{ field: 'category', role: 'category' }]
      pie.dataConfig.measures = [{ field: 'value', aggregation: 'sum', alias: key === 'outpatient_visit_mix' ? '人次' : '收入', unit: key === 'outpatient_visit_mix' ? '人次' : '万元' }]
      if (pie.dataConfig.version === 3) pie.dataConfig.parameterBindings = [{ datasetParameterCode: 'month', parameterId: hospital.parameters[0]!.id }]
      if (pie.analysisConfig) Object.assign(pie.analysisConfig, { showLabels: true, labelMode: 'percentage', labelDecimals: 1, legendVisible: true, legendPosition: 'bottom' })
      hospitalPage.components.push(pie)
    }
  }
  const departmentTable = structuredClone(departmentPage.components.find(component => component.id.endsWith('-drill-source'))!)
  departmentTable.id = `${hospital.id}-department-entry`
  departmentTable.title = `科室门诊人次 · 固定 ${sample.month} 的 ${sample.departmentCount} 科室样本（点击进入）`
  departmentTable.position = { x: 24, y: 738, width: 514, height: 330, zIndex: 1 }
  departmentTable.events = [{ id: `${hospital.id}-department-enter`, event: 'rowClick', enabled: true, actions: [
    { id: `${hospital.id}-clear-link`, type: 'clearLinkage' },
    { id: `${hospital.id}-department-drill`, type: 'drillDown', pathId: business.drillPaths?.[0]?.id || '' },
    { id: `${hospital.id}-department-page`, type: 'navigatePage', pageId: departmentPage.id, history: 'push' },
  ] }]
  hospitalPage.components.push(departmentTable)
  const insightTable = structuredClone(departmentTable)
  insightTable.id = `${hospital.id}-outpatient-insights`
  insightTable.title = '同比变化提示 · 本地快照（阈值 ±10%）'
  insightTable.position = { x: 24, y: 1264, width: 1452, height: 225, zIndex: 1 }
  insightTable.events = []
  if (insightTable.dataConfig.version === 3) {
    insightTable.dataConfig.datasetId = 'local-overview:outpatient_insights'
    insightTable.dataConfig.dimensions = ['month', 'metric', 'unit', 'signal', 'source'].map(field => ({ field, role: 'category' }))
    insightTable.dataConfig.measures = ['current', 'prior', 'yoy_percent'].map(field => ({ field, aggregation: 'sum' }))
    insightTable.dataConfig.sort = []
    insightTable.dataConfig.parameterBindings = [{ datasetParameterCode: 'month', parameterId: hospital.parameters[0]!.id }]
  }
  insightTable.tableConfig = { columns: [
    { field: 'metric', label: '指标', width: 170, format: 'auto', summary: 'none' },
    { field: 'current', label: '本期', width: 130, format: 'number', summary: 'none' },
    { field: 'prior', label: '去年同期', width: 130, format: 'number', summary: 'none' },
    { field: 'unit', label: '单位', width: 85, format: 'auto', summary: 'none' },
    { field: 'yoy_percent', label: '同比 %', width: 120, format: 'number', summary: 'none' },
    { field: 'signal', label: '变化提示', width: 310, format: 'auto', summary: 'none' },
    { field: 'source', label: '数据来源', width: 220, format: 'auto', summary: 'none' },
  ], striped: true, showHeader: true, pagination: { enabled: false, mode: 'client', pageSize: 20, showTotal: false } }
  hospitalPage.components.push(insightTable)
  const fullDepartmentRank = structuredClone(insightTable)
  fullDepartmentRank.id = `${hospital.id}-full-department-rank`
  fullDepartmentRank.title = '科室门急诊人次前 20 · ADS 全量科室口径（不联动医生样本）'
  fullDepartmentRank.position = { x: 24, y: 1508, width: 1452, height: 570, zIndex: 1 }
  if (fullDepartmentRank.dataConfig.version === 3) {
    fullDepartmentRank.dataConfig.datasetId = 'local-overview:outpatient_department_rank'
    fullDepartmentRank.dataConfig.dimensions = ['month', 'dept_code', 'dept_name', 'hospital_area'].map(field => ({ field, role: 'category' }))
    fullDepartmentRank.dataConfig.measures = [{ field: 'visits', aggregation: 'sum' }, { field: 'revenue', aggregation: 'sum' }]
    fullDepartmentRank.dataConfig.sort = [{ field: 'visits', direction: 'desc' }]
    fullDepartmentRank.dataConfig.limit = 20
  }
  fullDepartmentRank.tableConfig = { columns: [
    { field: 'dept_name', label: '科室', width: 330, format: 'auto', summary: 'none' },
    { field: 'hospital_area', label: '院区', width: 210, format: 'auto', summary: 'none' },
    { field: 'dept_code', label: '科室编码', width: 180, format: 'auto', summary: 'none' },
    { field: 'visits', label: '门急诊人次', width: 170, format: 'number', summary: 'none' },
    { field: 'revenue', label: '门诊收入（万元）', width: 195, format: 'number', summary: 'none' },
    { field: 'month', label: '月份', width: 125, format: 'auto', summary: 'none' },
  ], striped: true, showHeader: true, pagination: { enabled: true, mode: 'client', pageSize: 10, showTotal: true } }
  hospitalPage.components.push(fullDepartmentRank)
  const note = structuredClone(departmentPage.components.find(component => component.id.endsWith('-source-note'))!)
  note.id = `${hospital.id}-scope-note`
  note.title = '口径与来源'
  note.position = { x: 24, y: 1084, width: 1452, height: 164, zIndex: 1 }
  if (note.textConfig) note.textConfig.fontSize = 14
  note.textConfig!.content = `院级：bd_odr ADS 只读快照，2025-01—2026-08；门急诊人次 SUM(gzl_mzrs)，门诊收入 SUM(zz_zsr_qy_mjzsr)，次均费用 SUM(ys_zsr_qy_mzsr)/SUM(gzl_mzrs)。两张构成图使用独立逐月对账快照：人次=门诊+急诊；门诊收入=药品+耗材+检查检验+医疗服务。年累计从所选年份 1 月求和，年累计次均为累计分子/累计人次；去年累计月份不齐时同比留空。\n科室/医生：当前交互仍仅采用 ${sample.month} 的 ${sample.departmentCount} 科室、${sample.doctorCount} 位编号医生局部样本。ADS 科室目录已按公司、科室与院区组合键展示，可切换月份；医生汇总与院级有差异，暂不用于全院排名。跨级不计算贡献率。预算缺失不展示；样本无去年同期，不展示同比。采集 ${sample.observedAt}`
  hospitalPage.components.push(note)
  hospitalPage.canvas.height = 2100
  hospital.pages.push(...business.pages)
  hospital.parameters.push(...business.parameters)
  hospital.drillPaths = [...(hospital.drillPaths || []), ...(business.drillPaths || [])]
  hospital.extensionRefs.localGeneration = { provider, requestId, outpatientSample: true, dataMode: 'bd_odr_readonly_ads_snapshot', partialSample: true, month: plan.month }
  addOutpatientDepartmentPage(hospital, fullDepartmentRank)
  if (edition?.textConfig) edition.textConfig.content = '本地只读 ADS · 医院 / 科室数据与医生样本'
  note.textConfig!.content += '\n点击科室前20可进入 ADS 科室分析与分页目录。医生对账本轮跳过，按已有样本展示。'
  const result = validateDashboardApplicationV3(hospital)
  if (!result.valid) throw new Error(result.issues.map(issue => issue.message).join('；'))
  return hospital
}
