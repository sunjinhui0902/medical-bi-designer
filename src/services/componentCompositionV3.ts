import type { DashboardComponent, Position } from '../models/dashboard.ts'
import { componentMinimumSizeV3 } from './componentSizingV3.ts'

export function compositionScopeV3(items: DashboardComponent[], id: string): string {
  for (const tab of items) for (const item of tab.tabsConfig?.items ?? []) {
    if (item.componentIds.includes(id)) return `${tab.id}/${item.id}`
  }
  return 'canvas'
}

export function compositionMembersV3(items: DashboardComponent[], id: string): DashboardComponent[] {
  const selected = items.find(item => item.id === id)
  if (!selected) return []
  const scope = compositionScopeV3(items, id)
  return selected.groupId ? items.filter(item => item.groupId === selected.groupId && compositionScopeV3(items, item.id) === scope) : [selected]
}

export function compositionBoundsV3(items: Array<Pick<DashboardComponent, 'position'>>): Position {
  if (!items.length) throw new Error('请选择组件')
  const x = Math.min(...items.map(item => item.position.x)), y = Math.min(...items.map(item => item.position.y))
  return { x, y, width: Math.max(...items.map(item => item.position.x + item.position.width)) - x,
    height: Math.max(...items.map(item => item.position.y + item.position.height)) - y, zIndex: Math.max(...items.map(item => item.position.zIndex)) }
}

export function createCompositionV3(items: DashboardComponent[], ids: string[], groupId: string): void {
  const chosen = items.filter(item => ids.includes(item.id))
  if (new Set(ids).size !== ids.length || chosen.length !== ids.length || chosen.length < 2) throw new Error('请选择至少两个有效组件')
  if (!groupId.trim() || items.some(item => item.groupId === groupId)) throw new Error('组合编号无效或重复')
  if (chosen.some(item => item.type === 'tabs')) throw new Error('请组合 Tab 内容页内的组件，Tab 容器不参与组合')
  if (chosen.some(item => item.groupId)) throw new Error('请先取消原组合，再重新组合')
  if (new Set(chosen.map(item => compositionScopeV3(items, item.id))).size !== 1) throw new Error('组合成员须位于同一画布或同一 Tab 内容页')
  chosen.forEach(item => { item.groupId = groupId })
}

export function dissolveCompositionV3(items: DashboardComponent[], id: string): void {
  compositionMembersV3(items, id).forEach(item => { delete item.groupId })
}

export function cleanCompositionsV3(items: DashboardComponent[]): void {
  const counts = new Map<string, number>()
  items.forEach(item => { if (item.groupId) counts.set(item.groupId, (counts.get(item.groupId) ?? 0) + 1) })
  items.forEach(item => { if (item.groupId && counts.get(item.groupId)! < 2) delete item.groupId })
}

export function transformCompositionV3(items: DashboardComponent[], original: Record<string, Position>, target: Position,
  limits: { width: number; height: number; padding: number }): void {
  const members = items.filter(item => Object.hasOwn(original, item.id))
  if (members.length !== Object.keys(original).length) throw new Error('组合成员已变化')
  const start = compositionBoundsV3(members.map(item => ({ position: original[item.id]! })))
  if (![target.x, target.y, target.width, target.height].every(Number.isFinite) || target.width <= 0 || target.height <= 0) throw new Error('组合位置和尺寸无效')
  if (target.x < limits.padding || target.y < limits.padding || target.x + target.width > limits.width - limits.padding + .01 || target.y + target.height > limits.height - limits.padding + .01) throw new Error('组合超出当前内容区')
  const sx = target.width / start.width, sy = target.height / start.height
  const next = members.map(item => {
    const old = original[item.id]!, minimum = componentMinimumSizeV3(item)
    const position = { ...old, x: target.x + (old.x - start.x) * sx, y: target.y + (old.y - start.y) * sy, width: old.width * sx, height: old.height * sy }
    for (const key of ['x', 'y', 'width', 'height'] as const) position[key] = Math.round(position[key] * 10000) / 10000
    if (position.width < minimum.width - .01 || position.height < minimum.height - .01) throw new Error('缩放后成员小于允许的最小尺寸')
    return { item, position }
  })
  next.forEach(({ item, position }) => { item.position = position })
}

export function reorderCompositionV3(items: DashboardComponent[], id: string, direction: 'top' | 'bottom' | 'up' | 'down'): void {
  const members = compositionMembersV3(items, id)
  if (!members.length) return
  const scope = compositionScopeV3(items, id), units = new Map<string, DashboardComponent[]>()
  for (const item of items.filter(item => compositionScopeV3(items, item.id) === scope)) {
    const key = item.groupId ?? item.id
    units.set(key, [...(units.get(key) ?? []), item])
  }
  const blocks = [...units.values()].map(block => block.sort((a, b) => a.position.zIndex - b.position.zIndex)).sort((a, b) => a[0]!.position.zIndex - b[0]!.position.zIndex)
  const index = blocks.findIndex(block => block.some(item => item.id === id)), [block] = blocks.splice(index, 1)
  const next = direction === 'top' ? blocks.length : direction === 'bottom' ? 0 : direction === 'up' ? Math.min(index + 1, blocks.length) : Math.max(0, index - 1)
  blocks.splice(next, 0, block!)
  blocks.flat().forEach((item, index) => { item.position.zIndex = index + 1 })
}

export function compositionProblemsV3(items: DashboardComponent[]): string[] {
  const groups = new Map<string, DashboardComponent[]>()
  items.forEach(item => { if (item.groupId) groups.set(item.groupId, [...(groups.get(item.groupId) ?? []), item]) })
  return [...groups.values()].flatMap(group => group.length < 2 || group.some(item => item.type === 'tabs') || new Set(group.map(item => compositionScopeV3(items, item.id))).size !== 1 ? ['组合至少包含两个普通组件，且成员须属于同一画布或同一 Tab 内容页'] : [])
}
