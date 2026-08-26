import assert from 'node:assert/strict'
import test from 'node:test'

import type { ComponentType, DashboardComponent, TabItemConfig } from '../src/models/dashboard.ts'
import {
  reparentComponentV3,
  tabContentOffsetV3,
  tabContentSizeV3,
  tabOwnerForComponentV3,
} from '../src/services/tabContainerV3.ts'
import { tabSelectionScopeKeyV3 } from '../src/services/tabSessionStateV3.ts'

function component(id: string, type: ComponentType, x = 20, y = 20, width = 100, height = 80): DashboardComponent {
  return {
    id,
    type,
    title: id,
    position: { x, y, width, height, zIndex: 1 },
    dataConfig: { version: 2, sourceKind: 'mock', datasetId: '', dimensions: [], measures: [], filters: [], sort: [], limit: 200 },
    styleConfig: { background: '#fff', titleColor: '#000', titleSize: 12, titleWeight: 600, titleVisible: true },
  }
}

function tabItem(id: string, componentIds: string[] = []): TabItemConfig {
  return { id, label: id, value: id, componentIds, visible: true, padding: 12, gap: 8, background: '#fff' }
}

function tab(id: string, items: TabItemConfig[], position: 'top' | 'bottom' | 'left' | 'right' = 'top'): DashboardComponent {
  return {
    ...component(id, 'tabs', 100, 80, 500, 300),
    tabsConfig: { items, activeItemId: items[0].id, alignment: 'left', titlePosition: position, stylePreset: 'default', titleSize: 40 },
  }
}

test('根组件拖入 Tab 后只保留一个归属并按内容区边界落位', () => {
  const first = tabItem('first')
  const layout = tab('layout', [first])
  const chart = component('chart', 'line')
  const components = [layout, chart]

  const result = reparentComponentV3(components, chart.id, { kind: 'tab', tabId: layout.id, itemId: first.id }, { x: 999, y: 999 })

  assert.equal(result.success, true)
  assert.deepEqual(first.componentIds, ['chart'])
  assert.equal(tabOwnerForComponentV3(components, chart.id)?.item.id, first.id)
  assert.deepEqual(chart.position, { x: 358, y: 114, width: 100, height: 80, zIndex: 1 })
})

test('组件可在内容页之间原子转移并拖回画布', () => {
  const first = tabItem('first', ['chart'])
  const second = tabItem('second')
  const layout = tab('layout', [first, second])
  const chart = component('chart', 'line', 24, 24)
  const components = [layout, chart]

  const moved = reparentComponentV3(components, chart.id, { kind: 'tab', tabId: layout.id, itemId: second.id }, { x: 50, y: 60 })
  assert.equal(moved.success, true)
  assert.deepEqual(first.componentIds, [])
  assert.deepEqual(second.componentIds, ['chart'])
  assert.deepEqual(chart.position, { x: 50, y: 60, width: 100, height: 80, zIndex: 1 })

  const detached = reparentComponentV3(components, chart.id, { kind: 'canvas', canvas: { width: 1000, height: 600 } }, { x: 950, y: 580 })
  assert.equal(detached.success, true)
  assert.deepEqual(second.componentIds, [])
  assert.equal(tabOwnerForComponentV3(components, chart.id), undefined)
  assert.deepEqual(chart.position, { x: 900, y: 520, width: 100, height: 80, zIndex: 1 })
})

test('四种标题位置均冻结内容区尺寸与画布偏移', () => {
  const item = tabItem('first')
  assert.deepEqual(tabContentSizeV3(tab('top', [item], 'top'), item), { width: 470, height: 206, padding: 12 })
  assert.deepEqual(tabContentOffsetV3(tab('top', [item], 'top')), { x: 15, y: 79 })
  assert.deepEqual(tabContentSizeV3(tab('bottom', [item], 'bottom'), item), { width: 470, height: 206, padding: 12 })
  assert.deepEqual(tabContentOffsetV3(tab('bottom', [item], 'bottom')), { x: 15, y: 39 })
  assert.deepEqual(tabContentSizeV3(tab('left', [item], 'left'), item), { width: 394, height: 246, padding: 12 })
  assert.deepEqual(tabContentOffsetV3(tab('left', [item], 'left')), { x: 91, y: 39 })
  assert.deepEqual(tabContentSizeV3(tab('right', [item], 'right'), item), { width: 394, height: 246, padding: 12 })
  assert.deepEqual(tabContentOffsetV3(tab('right', [item], 'right')), { x: 15, y: 39 })
})

test('退化 Tab 内容区拒绝接收组件且模型保持零变化', () => {
  const first = tabItem('first')
  const layout = tab('layout', [first])
  layout.position.width = 180
  layout.position.height = 120
  layout.tabsConfig!.titleSize = 70
  first.padding = 20
  const chart = component('chart', 'line')
  const components = [layout, chart]
  const snapshot = JSON.stringify(components)

  const result = reparentComponentV3(components, chart.id, { kind: 'tab', tabId: layout.id, itemId: first.id }, { x: 1, y: 1 })

  assert.equal(result.success, false)
  assert.match(result.error ?? '', /内容区不足/)
  assert.equal(JSON.stringify(components), snapshot)
})

test('重复归属和 Tab 嵌套均 fail closed 且模型零变化', () => {
  const first = tabItem('first', ['chart'])
  const second = tabItem('second', ['chart'])
  const layout = tab('layout', [first, second])
  const chart = component('chart', 'line')
  const nestedTab = tab('nested', [tabItem('nested-first')])
  const components = [layout, chart, nestedTab]
  const duplicateSnapshot = JSON.stringify(components)

  const duplicate = reparentComponentV3(components, chart.id, { kind: 'canvas', canvas: { width: 1000, height: 600 } }, { x: 1, y: 1 })
  assert.equal(duplicate.success, false)
  assert.match(duplicate.error ?? '', /重复页签归属/)
  assert.equal(JSON.stringify(components), duplicateSnapshot)

  second.componentIds = []
  const nestingSnapshot = JSON.stringify(components)
  const nesting = reparentComponentV3(components, nestedTab.id, { kind: 'tab', tabId: layout.id, itemId: first.id }, { x: 1, y: 1 })
  assert.equal(nesting.success, false)
  assert.match(nesting.error ?? '', /不支持页签块嵌套/)
  assert.equal(JSON.stringify(components), nestingSnapshot)
})

test('Tab 选择按设计页面与预览页面实例隔离并可在返回时恢复', () => {
  const designHome = tabSelectionScopeKeyV3({ componentId: 'tabs', designPageId: 'home' })
  const designDetail = tabSelectionScopeKeyV3({ componentId: 'tabs', designPageId: 'detail' })
  const firstInstance = tabSelectionScopeKeyV3({ componentId: 'tabs', designPageId: 'home', preview: { sessionId: 'session', activePageInstanceId: 'instance-1' } })
  const secondInstance = tabSelectionScopeKeyV3({ componentId: 'tabs', designPageId: 'home', preview: { sessionId: 'session', activePageInstanceId: 'instance-2' } })
  const returnedInstance = tabSelectionScopeKeyV3({ componentId: 'tabs', designPageId: 'home', preview: { sessionId: 'session', activePageInstanceId: 'instance-1' } })

  assert.notEqual(designHome, designDetail)
  assert.notEqual(firstInstance, secondInstance)
  assert.equal(returnedInstance, firstInstance)
})
