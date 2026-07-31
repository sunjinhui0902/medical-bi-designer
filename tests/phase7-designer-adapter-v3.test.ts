import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createDefaultDashboardApplicationV3,
  type DashboardApplicationV3,
} from '../src/models/dashboard-v3.ts'
import type { DashboardModelV2 } from '../src/models/dashboard.ts'
import {
  applyDesignerDashboardToApplicationV3,
  createDefaultPageDesignerAdapterV3,
} from '../src/services/dashboardDesignerAdapterV3.ts'

function sampleDashboard(): DashboardModelV2 {
  return {
    version: 2,
    name: '迁移后的医疗看板',
    canvas: {
      width: 960,
      height: 540,
      background: '#ffffff',
      showGrid: false,
      gridSize: 16,
    },
    titleStyle: {
      show: true,
      fontSize: 30,
      color: '#123456',
      fontWeight: 600,
      align: 'center',
    },
    components: [],
  }
}

test('默认活动页适配为现有设计器 V2 视图且不暴露应用内部引用', () => {
  const application = createDefaultDashboardApplicationV3({
    id: 'application-a',
    name: '应用 A',
    pageId: 'page-a',
  })
  application.pages[0].components.push({
    id: 'component-a',
    type: 'text',
    title: '文本',
    position: { x: 0, y: 0, width: 240, height: 120, zIndex: 1 },
    dataConfig: {
      version: 2,
      sourceKind: 'mock',
      datasetId: '',
      dimensions: [],
      measures: [],
      filters: [],
      sort: [],
      limit: 100,
    },
    styleConfig: {
      background: '#ffffff',
      titleColor: '#111111',
      titleSize: 16,
      titleWeight: 600,
      titleVisible: true,
    },
  })

  const adapter = createDefaultPageDesignerAdapterV3(application)

  assert.equal(adapter.applicationId, 'application-a')
  assert.equal(adapter.pageId, 'page-a')
  assert.equal(adapter.dashboard.version, 2)
  assert.equal(adapter.dashboard.name, '应用 A')
  assert.deepEqual(adapter.dashboard.components, application.pages[0].components)

  adapter.dashboard.canvas.width = 800
  adapter.dashboard.components[0].title = '已修改'
  assert.equal(application.pages[0].canvas.width, 1200)
  assert.equal(application.pages[0].components[0].title, '文本')
})

test('设计器提交只更新默认页内容并保留参数、其他页面和扩展字段', () => {
  const application = createDefaultDashboardApplicationV3({
    id: 'application-b',
    name: '旧名称',
    pageId: 'page-home',
  }) as DashboardApplicationV3
  application.parameters.push({
    id: 'parameter-year',
    code: 'year_code',
    name: '年度',
    type: 'singleSelect',
    scope: 'application',
    required: false,
    source: { kind: 'dictionary', dictionaryId: 'builtin.year' },
  })
  application.pages.push({
    ...structuredClone(application.pages[0]),
    id: 'page-other',
    name: '其他页',
    code: 'other',
    order: 2,
  })
  application.extensionRefs.customRef = 'keep-me'
  const before = structuredClone(application)

  const nextApplication = applyDesignerDashboardToApplicationV3(
    application,
    sampleDashboard(),
  )

  assert.deepEqual(application, before)
  assert.equal(nextApplication.name, '迁移后的医疗看板')
  assert.equal(nextApplication.pages[0].canvas.width, 960)
  assert.equal(nextApplication.pages[0].titleStyle.align, 'center')
  assert.deepEqual(nextApplication.pages[1], before.pages[1])
  assert.deepEqual(nextApplication.parameters, before.parameters)
  assert.equal(nextApplication.extensionRefs.customRef, 'keep-me')
  assert.match(nextApplication.updatedAt ?? '', /^\d{4}-\d{2}-\d{2}T/)
})

test('设计器提交结果与输入视图相互独立', () => {
  const application = createDefaultDashboardApplicationV3()
  const dashboard = sampleDashboard()
  const nextApplication = applyDesignerDashboardToApplicationV3(application, dashboard)

  dashboard.canvas.width = 320
  nextApplication.pages[0].canvas.height = 240

  assert.equal(nextApplication.pages[0].canvas.width, 960)
  assert.equal(dashboard.canvas.height, 540)
})
