import type { DashboardComponent, Position } from '../models/dashboard.ts'
import { compositionBoundsV3 } from './componentCompositionV3.ts'
import { minimumTabOuterSizeV3, tabContentSizeV3 } from './tabContainerV3.ts'

export function responsiveLayoutV3(components: DashboardComponent[], width: number) {
  if (!Number.isFinite(width) || width < 240 || width > 1024) throw new Error('移动画布宽度需在 240—1024 之间')
  const positions: Record<string, Position> = {}, scales: Record<string, number> = {}, pad = 12, gap = 12
  const nested = new Set(components.flatMap(c => c.tabsConfig?.items.flatMap(item => item.componentIds) ?? []))
  function stack(items: DashboardComponent[], availableWidth: number, inset = pad) {
    let y = inset
    const w = availableWidth - inset * 2
    const columns = availableWidth >= 600 ? 3 : availableWidth >= 300 ? 2 : 1
    const cardWidth = (w - gap * (columns - 1)) / columns
    let column = 0, rowHeight = 0
    const flush = () => { if (column) { y += rowHeight + gap; column = 0; rowHeight = 0 } }
    const units = new Map<string, DashboardComponent[]>()
    for (const item of items) { const key = item.groupId ? `group:${item.groupId}` : `item:${item.id}`; units.set(key, [...(units.get(key) ?? []), item]) }
    for (const unit of [...units.values()].sort((a, b) => { const left = compositionBoundsV3(a), right = compositionBoundsV3(b); return left.y - right.y || left.x - right.x || left.zIndex - right.zIndex })) {
      if (unit.length === 1 && unit[0]!.type === 'kpi' && !unit[0]!.groupId) {
        const component = unit[0]!, height = Math.max(136, Math.min(180, component.position.height))
        positions[component.id] = { ...component.position, x: inset + column * (cardWidth + gap), y, width: cardWidth, height }
        rowHeight = Math.max(rowHeight, height); column++
        if (column === columns) flush()
        continue
      }
      flush()
      if (unit.length > 1 && unit[0]!.groupId) {
        const bounds = compositionBoundsV3(unit), scale = w / bounds.width
        for (const child of unit) {
          positions[child.id] = { ...child.position, x: inset + (child.position.x - bounds.x) * scale, y: y + (child.position.y - bounds.y) * scale, width: child.position.width * scale, height: child.position.height * scale }
          scales[child.id] = scale
        }
        y += Math.ceil(bounds.height * scale) + gap
        continue
      }
      const component = unit[0]!
      let height = component.type === 'kpi' ? Math.max(112, component.position.height) : component.type === 'table' ? Math.max(360, component.position.height) : Math.max(240, component.position.height)
      if (component.type === 'text') {
        const font = component.textConfig?.fontSize ?? 14
        const lines = (component.textConfig?.content ?? '').split('\n').reduce((total, line) => total + Math.max(1, Math.ceil(line.length / Math.max(1, Math.floor((w - 32) / font)))), 0)
        height = Math.max(80, 48 + lines * font * 1.6)
      }
      if (['icon', 'decoration', 'image'].includes(component.type)) height = component.position.height
      if (component.type === 'tabs') {
        const mobileTab = { ...component, position: { ...component.position, width: w, height: Math.max(height, minimumTabOuterSizeV3(component).height) } }
        height = Math.max(240, ...(component.tabsConfig?.items ?? []).map(item => {
          const content = tabContentSizeV3(mobileTab, item)
          const chromeHeight = mobileTab.position.height - content.height
          return stack(components.filter(c => item.componentIds.includes(c.id)), content.width, content.padding) + chromeHeight
        }))
      }
      positions[component.id] = { ...component.position, x: inset, y, width: w, height: Math.ceil(height) }
      y += Math.ceil(height) + gap
    }
    flush()
    return items.length ? y - gap + inset : inset * 2
  }
  const height = stack(components.filter(c => !nested.has(c.id)), width)
  return { width, height, positions, scales }
}
