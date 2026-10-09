import type { DashboardApplicationV3 } from '../models/dashboard-v3.ts'
import { validateDashboardApplicationV3 } from './dashboardValidationV3.ts'

const nativeChartTypes = new Set(['line', 'bar', 'pie', 'area', 'combo', 'scatter', 'bubble'])
function topLevelComponents(application: DashboardApplicationV3, pageId: string) {
  const page = application.pages.find(p => p.id === pageId)
  if (!page) throw new Error('当前页面不存在')
  const nestedIds = new Set(page.components.filter(c => c.type === 'tabs').flatMap(c => c.tabsConfig?.items.flatMap(item => item.componentIds) || []))
  return page.components.filter(c => !nestedIds.has(c.id))
}
export function listLocalLayoutTargets(application: DashboardApplicationV3, pageId: string) {
  return topLevelComponents(application, pageId).filter(c => nativeChartTypes.has(c.type)).map(({ id, title, type }) => ({ id, title, type }))
}
export function listLocalMoveTargets(application: DashboardApplicationV3, pageId: string) {
  return topLevelComponents(application, pageId).map(({ id, title, type }) => ({ id, title, type }))
}

export function previewLocalDashboardMove(application: DashboardApplicationV3, pageId: string, componentId: string, targetIds: string[], dx: number, dy: number): LocalEditPreview {
  const available = listLocalMoveTargets(application, pageId)
  if (!targetIds.length || new Set(targetIds).size !== targetIds.length || targetIds.some(id => !available.some(c => c.id === id))) throw new Error('请选择当前页顶层组件')
  if (![dx, dy].every(Number.isSafeInteger) || (dx === 0 && dy === 0)) throw new Error('请填写整数位移，至少一个方向不为 0')
  const before = structuredClone(application), after = structuredClone(application), page = after.pages.find(p => p.id === pageId)!
  const targets = page.components.filter(c => targetIds.includes(c.id))
  if (targets.some(c => c.position.x + dx < 0 || c.position.y + dy < 0 || c.position.x + dx + c.position.width > page.canvas.width || c.position.y + dy + c.position.height > page.canvas.height)) throw new Error('整体移动后会越出画布，请调整位移或画布大小')
  for (const c of targets) { c.position.x += dx; c.position.y += dy }
  const overlaps = (a: typeof targets[number], b: typeof targets[number]) => a.position.x < b.position.x + b.position.width && a.position.x + a.position.width > b.position.x && a.position.y < b.position.y + b.position.height && a.position.y + a.position.height > b.position.y
  const previous = new Map(before.pages.find(p => p.id === pageId)!.components.map(c => [c.id, c]))
  const untouched = topLevelComponents(after, pageId).filter(c => !targetIds.includes(c.id))
  const newOverlaps = targets.reduce((total, c) => total + untouched.filter(other => overlaps(c, other) && !overlaps(previous.get(c.id)!, previous.get(other.id)!)).length, 0)
  return { before, after, pageId, componentId, summary: `${targets.length} 个组件整体移动：横向 ${dx}，纵向 ${dy}`, changes: targets.map(c => `${c.title} → (${c.position.x}, ${c.position.y})`), warnings: newOverlaps ? [`本次移动新增 ${newOverlaps} 处与未选组件重叠，请检查后应用或调整位移。`] : [] }
}

export interface LocalEditPreview {
  before: DashboardApplicationV3
  after: DashboardApplicationV3
  pageId: string
  componentId: string
  summary: string
  changes: string[]
  warnings: string[]
}

export type LocalBatchStyle = { field: 'titleSize'; value: number } | { field: 'titleColor' | 'background'; value: string }

/** Explicit selected charts only; reuse the existing preview/apply/undo contract. */
export function previewLocalDashboardBatchStyle(application: DashboardApplicationV3, pageId: string, componentId: string, targetIds: string[], style: LocalBatchStyle): LocalEditPreview {
  const available = listLocalLayoutTargets(application, pageId)
  if (!Array.isArray(targetIds) || !targetIds.length || new Set(targetIds).size !== targetIds.length || targetIds.some(id => !available.some(c => c.id === id))) throw new Error('请勾选当前页顶层原生图表；选择不能为空、重复或包含不可调整的组件')
  if (!style || !['titleSize', 'titleColor', 'background'].includes(style.field)) throw new Error('不支持此批量样式')
  if (style.field === 'titleSize') {
    if (!Number.isInteger(style.value) || style.value < 8 || style.value > 48) throw new Error('标题字号支持8至48的整数')
  } else if (typeof style.value !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(style.value)) throw new Error('颜色需为六位十六进制色值')
  const before = structuredClone(application), after = structuredClone(application), page = after.pages.find(p => p.id === pageId)!
  const labels = { titleSize: '标题字号', titleColor: '标题颜色', background: '背景色' }, changes: string[] = []
  for (const chart of page.components.filter(c => targetIds.includes(c.id))) {
    if (chart.styleConfig[style.field] === style.value) continue
    changes.push(`${chart.title}：${labels[style.field]} ${chart.styleConfig[style.field] ?? '默认'} → ${style.value}`)
    if (style.field === 'titleSize') chart.styleConfig.titleSize = style.value
    else chart.styleConfig[style.field] = style.value
  }
  if (!changes.length) throw new Error('勾选图表已符合此样式，无需调整')
  const validation = validateDashboardApplicationV3(after)
  if (!validation.valid) throw new Error(validation.issues.map(i => i.message).join('；'))
  return { before, after, pageId, componentId, summary: `勾选${targetIds.length}张图表统一${labels[style.field]}为${style.value}，${changes.length}张改变`, changes, warnings: [] }
}

/** Local presentation edits only; no data, identity or persistence changes. */
export function previewLocalDashboardEdit(application: DashboardApplicationV3, pageId: string, componentId: string, request: string, options?: { layoutTargetIds?: string[] }): LocalEditPreview {
  const before = JSON.parse(JSON.stringify(application)) as DashboardApplicationV3
  const after = JSON.parse(JSON.stringify(application)) as DashboardApplicationV3
  const page = after.pages.find(p => p.id === pageId)
  if (!page) throw new Error('当前页面不存在')
  const component = page.components.find(c => c.id === componentId)
  const command = request.trim()
  let summary = ''
  const changes: string[] = [], warnings: string[] = []
  const alignment = command.match(/^(?:当前页)?图表(左对齐|顶部对齐)$/)
  const distribution = command.match(/^(?:当前页)?图表(水平|垂直)等间距分布$/)
  const size = command.match(/^(?:当前页)?图表(?:(宽度|高度)统一为(\d+)|尺寸统一为(\d+)[×xX*](\d+))$/)
  if (alignment || distribution || size) {
    const topLevel = topLevelComponents(after, pageId)
    const available = topLevel.filter(c => nativeChartTypes.has(c.type))
    const ids = options?.layoutTargetIds
    if (ids !== undefined && (!Array.isArray(ids) || !ids.length || new Set(ids).size !== ids.length || ids.some(id => !available.some(c => c.id === id)))) throw new Error('请重新勾选当前页顶层原生图表；选择不能为空、重复或包含不可调整的组件')
    const charts = ids === undefined ? available : available.filter(c => ids.includes(c.id))
    const scope = ids === undefined ? '当前页' : '选中'
    if (charts.length < (distribution ? 3 : 2)) throw new Error(`${scope}至少需要${distribution ? '三个' : '两个'}顶层原生图表才能进行此布局操作`)
    const overlap = (a: typeof charts[number], b: typeof charts[number]) => a.position.x < b.position.x + b.position.width && a.position.x + a.position.width > b.position.x && a.position.y < b.position.y + b.position.height && a.position.y + a.position.height > b.position.y
    const previous = new Map(before.pages.find(p => p.id === pageId)!.components.map(c => [c.id, c]))
    const change = (chart: typeof charts[number], field: 'x' | 'y' | 'width' | 'height', value: number) => {
      if (Math.abs(chart.position[field] - value) < 0.000001) return
      changes.push(`${chart.title}：${field}=${chart.position[field]} → ${value}`)
      chart.position[field] = value
    }
    if (alignment) {
      const axis = alignment[1] === '左对齐' ? 'x' : 'y'
      const target = Math.min(...charts.map(c => c.position[axis]))
      charts.forEach(chart => change(chart, axis, target))
      summary = `${scope}${charts.length}个顶层原生图表${alignment[1]}，${changes.length}个位置改变`
    } else if (distribution) {
      const axis = distribution[1] === '水平' ? 'x' : 'y'
      const dimension = axis === 'x' ? 'width' : 'height'
      const ordered = [...charts].sort((a, b) => a.position[axis] - b.position[axis])
      const start = ordered[0]!.position[axis]
      const end = Math.max(...charts.map(chart => chart.position[axis] + chart.position[dimension]))
      const gap = (end - start - charts.reduce((total, chart) => total + chart.position[dimension], 0)) / (charts.length - 1)
      if (gap < 0) throw new Error('现有跨度不足以容纳全部图表，请先扩大跨度或缩小尺寸')
      let cursor = start
      for (const chart of ordered) {
        change(chart, axis, Math.round(cursor * 1000000) / 1000000)
        cursor += chart.position[dimension] + gap
      }
      summary = `${scope}${charts.length}个顶层原生图表${distribution[1]}等间距分布，边缘间距${Number(gap.toFixed(3))}像素`
    } else if (size) {
      const width = size[3] ? Number(size[3]) : size[1] === '宽度' ? Number(size[2]) : undefined
      const height = size[4] ? Number(size[4]) : size[1] === '高度' ? Number(size[2]) : undefined
      if ([width, height].some(value => value !== undefined && (!Number.isSafeInteger(value) || value < 100))) throw new Error('图表宽高需为至少100像素的整数')
      for (const chart of charts) {
        if (chart.position.x < 0 || chart.position.y < 0 || chart.position.x + (width ?? chart.position.width) > page.canvas.width || chart.position.y + (height ?? chart.position.height) > page.canvas.height) throw new Error('统一尺寸后有图表越出画布，请减小尺寸或先调整位置')
        if (width !== undefined) change(chart, 'width', width)
        if (height !== undefined) change(chart, 'height', height)
      }
      summary = `${scope}${charts.length}个顶层原生图表尺寸统一：${width === undefined ? '宽度保留' : `宽${width}`}，${height === undefined ? '高度保留' : `高${height}`}`
    }
    if (!changes.length) throw new Error(alignment ? '当前页图表已经对齐，无需调整' : '当前页图表已符合要求，无需调整')
    let newOverlaps = 0
    for (let i = 0; i < topLevel.length; i++) for (let j = i + 1; j < topLevel.length; j++) {
      if (overlap(topLevel[i]!, topLevel[j]!) && !overlap(previous.get(topLevel[i]!.id)!, previous.get(topLevel[j]!.id)!)) newOverlaps++
    }
    if (newOverlaps) warnings.push(`本次${alignment ? '对齐' : '布局'}新增${newOverlaps}处组件重叠；可应用后拖动调整或撤销。`)
  } else {
  if (!component) throw new Error('请先选中当前页面的组件')
  const title = command.match(/^(?:把)?(?:选中组件)?标题(?:改为|改成|设为)[：:\s]*(.+)$/)
  const color = command.match(/^(?:把)?(?:选中组件)?背景(?:色)?(?:改为|改成|设为)[：:\s]*(#[0-9a-fA-F]{6})$/)
  const font = command.match(/^(?:把)?(?:选中组件)?字号(?:改为|改成|设为)[：:\s]*(\d+)$/)
  const titleColor = command.match(/^(?:把)?(?:选中组件)?标题(?:颜色|色)(?:改为|改成|设为)[：:\s]*(#[0-9a-fA-F]{6})$/)
  const weight = command.match(/^(?:选中组件)?标题(?:(加粗|半粗|常规)|粗细(?:改为|改成|设为)[：:\s]*(400|600|700))$/)
  if (title) {
    if (title[1]!.length > 100) throw new Error('标题最多100个字符')
    summary = `标题：${component.title} → ${title[1]}`
    component.title = title[1]!
  } else if (color) {
    summary = `背景色：${component.styleConfig.background || '默认'} → ${color[1]}`
    component.styleConfig.background = color[1]!
  } else if (titleColor) {
    summary = `标题颜色：${component.styleConfig.titleColor || '默认'} → ${titleColor[1]}`
    component.styleConfig.titleColor = titleColor[1]!
  } else if (weight) {
    const value = weight[2] ? Number(weight[2]) : ({ 加粗: 700, 半粗: 600, 常规: 400 } as Record<string, number>)[weight[1]!]!
    summary = `标题粗细：${component.styleConfig.titleWeight || '默认'} → ${value}`
    component.styleConfig.titleWeight = value
  } else if (font) {
    const size = Number(font[1])
    if (size < 8 || size > 48) throw new Error('字号支持8至48')
    if (component.type === 'text' && component.textConfig) {
      summary = `文本字号：${component.textConfig.fontSize} → ${size}`
      component.textConfig.fontSize = size
    } else {
      summary = `标题字号：${component.styleConfig.titleSize || '默认'} → ${size}`
      component.styleConfig.titleSize = size
    }
  } else throw new Error('暂支持单条展示指令，或当前页图表对齐、水平/垂直等间距分布、宽高尺寸统一')
  changes.push(summary)
  }
  const validation = validateDashboardApplicationV3(after)
  if (!validation.valid) throw new Error(validation.issues.map(i => i.message).join('；'))
  return { before, after, pageId, componentId, summary, changes, warnings }
}

export function assertLocalEditCurrent(current: DashboardApplicationV3, expected: DashboardApplicationV3) {
  // Snapshot construction renews this timestamp even without an editor change.
  const comparable = (app: DashboardApplicationV3) => { const copy = { ...app }; delete copy.updatedAt; return JSON.stringify(copy) }
  if (comparable(current) !== comparable(expected)) throw new Error('看板已发生变化，请重新预览；撤销时请先恢复后续修改')
}
