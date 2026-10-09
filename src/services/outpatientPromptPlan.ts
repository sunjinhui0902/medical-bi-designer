import { createOutpatientOperationsDraft } from './outpatientOperationsDraft.ts'
import type { BusinessSampleInfo } from './businessInteractionDraft.ts'

export interface OutpatientPromptPlan {
  schemaVersion: 1
  template: 'outpatient-operations'
  title: string
  month: string
  pageTitles: [string, string, string, string]
  accentColor: string
  mobileResponsive: boolean
}
export function outpatientPlanExample(month = '2026-08'): OutpatientPromptPlan {
  return { schemaVersion: 1, template: 'outpatient-operations', title: '门诊运营分析', month, pageTitles: ['医院门诊总览', '科室分析 · 部分样本', '医生分析 · 部分样本', '医生明细 · 部分样本'], accentColor: '#1477c9', mobileResponsive: true }
}
export function parseOutpatientPromptPlan(raw: string, months: string[]): OutpatientPromptPlan {
  if (raw.length > 20000) throw new Error('计划超过 20KB，请使用小型 JSON 输出契约')
  let plan: OutpatientPromptPlan
  try { plan = JSON.parse(raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) } catch { throw new Error('请粘贴纯 JSON 计划；不要包含思考过程或解释') }
  const keys = ['schemaVersion', 'template', 'title', 'month', 'pageTitles', 'accentColor', 'mobileResponsive']
  const title = (value: unknown) => typeof value === 'string' && value.trim().length > 0 && value.length <= 60 && !/[<>\r\n]/.test(value)
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || Object.keys(plan).some(key => !keys.includes(key)) || plan.schemaVersion !== 1 || plan.template !== 'outpatient-operations' || !title(plan.title) || !months.includes(plan.month) || plan.month > '2026-08' || !Array.isArray(plan.pageTitles) || plan.pageTitles.length !== 4 || !plan.pageTitles.every(title) || !/^#[0-9a-fA-F]{6}$/.test(plan.accentColor) || typeof plan.mobileResponsive !== 'boolean') throw new Error('计划格式、月份、四页标题或配色无效；禁止附加 SQL、脚本、指标数值或结论')
  return plan
}
export function compileOutpatientPromptPlan(plan: OutpatientPromptPlan, months: string[], sample: BusinessSampleInfo) {
  parseOutpatientPromptPlan(JSON.stringify(plan), months)
  const app = createOutpatientOperationsDraft({ schemaVersion: 1, template: 'hospital-overview', title: plan.title, month: plan.month, comparison: 'yoy', sections: ['operations', 'trend'], notes: '' }, months.filter(month => month <= '2026-08'), `external-plan-${crypto.randomUUID()}`, sample, 'external-model-plan')
  app.name = plan.title
  app.pages.slice(0, 4).forEach((page, index) => { page.name = index === 0 ? plan.pageTitles[index]! : `${plan.pageTitles[index]!.replace(/ · 部分样本$/, '')} · 部分样本` })
  app.theme.tokens.chartPalette = [plan.accentColor, '#19a974', '#f59f00', '#8b5cf6']
  app.pages.forEach(page => page.components.forEach(component => { component.styleConfig.titleColor = plan.accentColor }))
  app.extensionRefs.responsiveLayout = { enabled: plan.mobileResponsive, breakpoint: 768, mode: 'stack' }
  app.extensionRefs.externalModelPlan = JSON.parse(JSON.stringify(plan))
  return app
}
export function buildOutpatientPortablePrompt(goal: string, months: string[], sample: Pick<BusinessSampleInfo, 'month' | 'departmentCount' | 'doctorCount'>) {
  const month = months.filter(month => month <= '2026-08').sort().at(-1) || '2026-08'
  return `你是医院运营看板规划助手。业务目标：${goal.slice(0, 500)}
输出一个小型 JSON 计划，由 TY_BI 编译为可编辑、可保存的原生 Dashboard V3 配置：四页医生样本链路，附加 ADS 科室分析页。
不输出 V3 内部 ID，不输出 SQL、JavaScript、HTML、数据值或分析结论，不编造预算、预约量、到诊率。
可用院级月份：${months.filter(month => month <= '2026-08').join('、')}。月人次、收入、次均及年累计、趋势、同比、构成、科室前20由实际只读数据计算；次均费用分子不等于门诊收入，不能用收入/人次替代。
科室→医生交互只有 ${sample.month}、${sample.departmentCount} 科室/${sample.doctorCount} 位编号医生局部样本，不能叫全院医生排名。去年同期缺失提示，不填0；去年为0时不计算同比。
四页固定顺序：医院→科室→医生→医生明细。筛选、联动、跳转、下钻、返回由编译器生成可见 V3 配置；下载是已加载明细 CSV，不是看板 JSON。
按蓝白医院运营布局：指标卡、趋势、构成、贡献入口、来源与变化提示。可调整标题与六位色值，建议 mobileResponsive=true。
严格仅输出以下7个字段，schemaVersion和template固定，pageTitles必须4项、每项1—60字，month只能来自可用月份且不晚于2026-08，accentColor为#RRGGBB，mobileResponsive为布尔值。不要 Markdown、解释或<think>。
参考输出：${JSON.stringify(outpatientPlanExample(month), null, 2)}`
}
