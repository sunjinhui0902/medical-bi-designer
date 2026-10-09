import type { DashboardApplicationV3, DashboardComponentV3 } from '../models/dashboard-v3.ts'

export function addOutpatientDepartmentPage(app: DashboardApplicationV3, rank: DashboardComponentV3) {
  const hospital = app.pages[0]!, monthId = app.parameters[0]!.id, keyId = `${app.id}-ads-department-key`
  app.parameters.push({ id: keyId, code: 'ads_department_key', name: '当前科室组合键', type: 'string', scope: 'application', required: false, defaultValue: '', source: { kind: 'static', options: [] } })
  const page = structuredClone(hospital)
  page.id = `${app.id}-ads-department-page`; page.code = 'outpatient_department_ads'; page.name = '科室分析 · ADS 数据'; page.order = 5
  page.canvas = { ...page.canvas, width: 1200, height: 1390 }; page.components = []; page.pageEvents = []
  page.controls = structuredClone(hospital.controls).map(c => ({ ...c, id: `${c.id}-department` }))
  const text = structuredClone(hospital.components.find(c => c.type === 'text')!)
  text.id = `${page.id}-guide`; text.title = '科室分析'; text.position = { x: 24, y: 16, width: 1152, height: 100, zIndex: 1 }
  text.styleConfig.titleVisible = false
  text.textConfig!.fontSize = 18
  text.textConfig!.content = '科室门诊运营 · ADS 数据\n点击目录科室查看该科室指标与趋势；切换月份浏览当月目录。医生入口仍使用已有编号样本。'
  page.components.push(text)
  const back = structuredClone(text); back.id = `${page.id}-back`; back.position = { x: 24, y: 124, width: 320, height: 60, zIndex: 1 }; back.textConfig!.content = '← 返回上级页面'
  back.events = [{ id: `${back.id}-event`, event: 'click', enabled: true, actions: [{ id: `${back.id}-action`, type: 'pageBack' }] }]
  page.components.push(back)
  const bindings = [{ datasetParameterCode: 'month', parameterId: monthId }, { datasetParameterCode: 'department_key', parameterId: keyId }]
  for (const [index, field, title, unit] of [[0, 'visits', '当前科室门急诊人次', '人次'], [1, 'revenue', '当前科室门诊收入', '万元']] as const) {
    const card = structuredClone(hospital.components.find(c => c.type === 'kpi')!)
    card.id = `${page.id}-${field}`; card.title = title; card.position = { x: 24 + index * 588, y: 200, width: 564, height: 140, zIndex: 1 }
    card.dataConfig = { ...structuredClone(rank.dataConfig), version: 3, dimensions: [], measures: [{ field, aggregation: 'sum', alias: title, unit }], parameterBindings: bindings, sort: [], limit: 1, refreshPolicy: 'onParameterChange' }
    card.kpiConfig = { ...card.kpiConfig!, primaryMeasureField: field, unit, decimals: field === 'visits' ? 0 : 2, yoyField: '' }
    page.components.push(card)
    const trend = structuredClone(hospital.components.find(c => c.type === 'line')!)
    trend.id = `${page.id}-${field}-trend`; trend.title = `当前科室${field === 'visits' ? '人次' : '收入'}趋势（${unit}）`; trend.position = { x: 24 + index * 588, y: 356, width: 564, height: 300, zIndex: 1 }
    trend.dataConfig = { ...card.dataConfig, dimensions: [{ field: 'month', role: 'category' }], parameterBindings: [bindings[1]!], limit: 200, sort: [{ field: 'month', direction: 'asc' }] }
    page.components.push(trend)
  }
  const selectAction = (id: string) => ({ id, type: 'setParameter' as const, assignments: [{ parameterId: keyId, value: { kind: 'eventField' as const, path: '/row/department_key' } }] })
  const directory = structuredClone(rank); directory.id = `${page.id}-directory`; directory.title = '科室目录 · 点击行查看指标与趋势'
  directory.position = { x: 24, y: 674, width: 1152, height: 620, zIndex: 1 }
  directory.dataConfig.limit = 2000
  directory.tableConfig!.pagination = { enabled: true, mode: 'server', pageSize: 20, showTotal: true }
  directory.events = [{ id: `${directory.id}-event`, event: 'rowClick', enabled: true, actions: [selectAction(`${directory.id}-select`)] }]
  page.components.push(directory)
  const clear = structuredClone(back); clear.id = `${page.id}-clear`; clear.position.x = 360; clear.textConfig!.content = '清除科室选择 · 查看全部'
  clear.events = [{ id: `${clear.id}-event`, event: 'click', enabled: true, actions: [{ id: `${clear.id}-action`, type: 'setParameter', assignments: [{ parameterId: keyId, value: { kind: 'fixed', value: '' } }] }] }]
  page.components.push(clear)
  rank.events = [{ id: `${rank.id}-open`, event: 'rowClick', enabled: true, actions: [selectAction(`${rank.id}-select`), { id: `${rank.id}-navigate`, type: 'navigatePage', pageId: page.id, history: 'push' }] }]
  rank.title = '科室门急诊人次前 20 · 点击进入科室分析'
  if (rank.dataConfig.version === 3) rank.dataConfig.dimensions.unshift({ field: 'department_key', role: 'category' })
  if (directory.dataConfig.version === 3) directory.dataConfig.dimensions.unshift({ field: 'department_key', role: 'category' })
  app.pages.push(page)
}
