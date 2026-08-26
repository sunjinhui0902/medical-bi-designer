import type { CanvasConfig, DashboardComponent, TabItemConfig } from '../models/dashboard'

export interface TabOwnerV3 {
  tab: DashboardComponent
  item: TabItemConfig
}

export interface PlacementPointV3 {
  x: number
  y: number
}

export type ComponentPlacementTargetV3 =
  | { kind: 'canvas'; canvas: Pick<CanvasConfig, 'width' | 'height'> }
  | { kind: 'tab'; tabId: string; itemId: string }

export interface ComponentReparentResultV3 {
  success: boolean
  owner?: TabOwnerV3
  error?: string
}

export interface TabContentSizeV3 {
  width: number
  height: number
  padding: number
}

export interface TabHostChromeV3 {
  horizontal: number
  vertical: number
}

const COMPONENT_HORIZONTAL_CHROME = 30
const COMPONENT_VERTICAL_CHROME_WITH_TITLE = 54
const COMPONENT_VERTICAL_CHROME_WITHOUT_TITLE = 36
const TAB_HORIZONTAL_TITLE_MINIMUM = 38
const TAB_VERTICAL_TITLE_MINIMUM = 76

function effectiveTabTitleSizeV3(tab: DashboardComponent): number {
  const titlePosition = tab.tabsConfig?.titlePosition ?? 'top'
  const configured = Math.max(0, tab.tabsConfig?.titleSize ?? 0)
  return Math.max(configured, titlePosition === 'left' || titlePosition === 'right'
    ? TAB_VERTICAL_TITLE_MINIMUM
    : TAB_HORIZONTAL_TITLE_MINIMUM)
}

export function tabContentOffsetV3(tab: DashboardComponent): PlacementPointV3 {
  const titlePosition = tab.tabsConfig?.titlePosition ?? 'top'
  const titleSize = effectiveTabTitleSizeV3(tab)
  const chrome = tabHostChromeV3(tab)
  return {
    x: chrome.horizontal / 2 + (titlePosition === 'left' ? titleSize : 0),
    y: chrome.vertical - chrome.horizontal / 2 + (titlePosition === 'top' ? titleSize : 0),
  }
}

export function tabHostChromeV3(tab: DashboardComponent): TabHostChromeV3 {
  return {
    horizontal: COMPONENT_HORIZONTAL_CHROME,
    vertical: tab.styleConfig.titleVisible ? COMPONENT_VERTICAL_CHROME_WITH_TITLE : COMPONENT_VERTICAL_CHROME_WITHOUT_TITLE,
  }
}

export function minimumTabOuterSizeV3(tab: DashboardComponent): { width: number; height: number } {
  const titlePosition = tab.tabsConfig?.titlePosition ?? 'top'
  const titleSize = effectiveTabTitleSizeV3(tab)
  const padding = Math.max(0, ...(tab.tabsConfig?.items ?? []).map((item) => item.padding ?? 0))
  const chrome = tabHostChromeV3(tab)
  const horizontalTitle = titlePosition === 'left' || titlePosition === 'right'
  return {
    width: chrome.horizontal + (horizontalTitle ? titleSize : 0) + padding * 2 + 120,
    height: chrome.vertical + (horizontalTitle ? 0 : titleSize) + padding * 2 + 78,
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum))
}

export function tabOwnersForComponentV3(components: DashboardComponent[], componentId: string): TabOwnerV3[] {
  return components.flatMap((tab) => (tab.tabsConfig?.items ?? []).flatMap((item) =>
    item.componentIds.includes(componentId) ? [{ tab, item }] : []))
}

export function tabOwnerForComponentV3(components: DashboardComponent[], componentId: string): TabOwnerV3 | undefined {
  const owners = tabOwnersForComponentV3(components, componentId)
  return owners.length === 1 ? owners[0] : undefined
}

export function tabContentSizeV3(tab: DashboardComponent, item: TabItemConfig): TabContentSizeV3 {
  const titlePosition = tab.tabsConfig?.titlePosition ?? 'top'
  const titleSize = effectiveTabTitleSizeV3(tab)
  const horizontalTitle = titlePosition === 'left' || titlePosition === 'right'
  const chrome = tabHostChromeV3(tab)
  return {
    width: Math.max(0, tab.position.width - chrome.horizontal - (horizontalTitle ? titleSize : 0)),
    height: Math.max(0, tab.position.height - chrome.vertical - (horizontalTitle ? 0 : titleSize)),
    padding: Math.max(0, item.padding ?? 0),
  }
}

function placementPoint(
  component: DashboardComponent,
  target: ComponentPlacementTargetV3,
  requested: PlacementPointV3,
  tab?: DashboardComponent,
  item?: TabItemConfig,
): PlacementPointV3 {
  if (target.kind === 'canvas') {
    return {
      x: Math.round(clamp(requested.x, 0, target.canvas.width - component.position.width)),
      y: Math.round(clamp(requested.y, 0, target.canvas.height - component.position.height)),
    }
  }
  const size = tabContentSizeV3(tab!, item!)
  return {
    x: Math.round(clamp(requested.x, size.padding, size.width - size.padding - component.position.width)),
    y: Math.round(clamp(requested.y, size.padding, size.height - size.padding - component.position.height)),
  }
}

export function reparentComponentV3(
  components: DashboardComponent[],
  componentId: string,
  target: ComponentPlacementTargetV3,
  requested: PlacementPointV3,
): ComponentReparentResultV3 {
  const component = components.find((candidate) => candidate.id === componentId)
  if (!component) return { success: false, error: '待移动组件不存在' }

  const owners = tabOwnersForComponentV3(components, componentId)
  if (owners.length > 1) return { success: false, error: '组件存在重复页签归属，已拒绝移动' }

  let targetTab: DashboardComponent | undefined
  let targetItem: TabItemConfig | undefined
  if (target.kind === 'tab') {
    if (component.type === 'tabs') return { success: false, error: '暂不支持页签块嵌套' }
    targetTab = components.find((candidate) => candidate.id === target.tabId && candidate.type === 'tabs')
    targetItem = targetTab?.tabsConfig?.items.find((candidate) => candidate.id === target.itemId)
    if (!targetTab || !targetItem) return { success: false, error: '目标页签内容区不存在' }
    if (targetItem.visible === false) return { success: false, error: '不能移动到隐藏页签' }
    const size = tabContentSizeV3(targetTab, targetItem)
    if (size.width < component.position.width + size.padding * 2 || size.height < component.position.height + size.padding * 2) {
      return { success: false, error: '目标页签内容区不足以容纳该组件' }
    }
  }

  const nextPosition = placementPoint(component, target, requested, targetTab, targetItem)
  const previousPosition = { ...component.position }
  const previousMemberships = components.flatMap((tab) => (tab.tabsConfig?.items ?? []).map((item) => ({ item, componentIds: [...item.componentIds] })))
  try {
    for (const tab of components) {
      for (const item of tab.tabsConfig?.items ?? []) {
        if (item.componentIds.includes(componentId)) item.componentIds = item.componentIds.filter((id) => id !== componentId)
      }
    }
    if (targetItem) targetItem.componentIds.push(componentId)
    component.position.x = nextPosition.x
    component.position.y = nextPosition.y
  } catch {
    for (const membership of previousMemberships) membership.item.componentIds = membership.componentIds
    component.position = previousPosition
    return { success: false, error: '组件归属提交失败，已恢复原状态' }
  }

  return {
    success: true,
    ...(targetTab && targetItem ? { owner: { tab: targetTab, item: targetItem } } : {}),
  }
}
