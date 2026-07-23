import assert from 'node:assert/strict'
import test from 'node:test'
import { instantiateMedicalTemplate, normalizeMedicalTemplates, saveMedicalTemplate } from '../src/services/componentTemplates.ts'
import type { DashboardComponent } from '../src/models/dashboard.ts'

const component: DashboardComponent = {
  id: 'income-card-1',
  type: 'kpi',
  title: '门诊收入',
  position: { x: 10, y: 20, width: 200, height: 120, zIndex: 2 },
  dataConfig: {
    version: 2,
    sourceKind: 'server',
    datasetId: 'odr-income',
    dimensions: [],
    measures: [{ field: 'amount', aggregation: 'sum' }],
    filters: [],
    sort: [],
    limit: 200,
  },
  styleConfig: { background: '#fff', titleColor: '#222', titleSize: 12, titleWeight: 600, titleVisible: true },
  kpiConfig: {
    primaryMeasureField: 'amount',
    unit: '万元',
    decimals: 2,
    useGrouping: true,
    yoyField: 'last_year_amount',
    momField: 'last_month_amount',
    positiveColor: '#2f9e44',
    negativeColor: '#d9485f',
    targetMode: 'fixed',
    targetValue: 1000,
    targetField: '',
    showProgress: true,
    progressColor: '#1477c9',
  },
}

test('已配置组件可以保存为带分类的医疗组件模板', () => {
  const template = saveMedicalTemplate(component, '门诊运营')
  assert.equal(template.name, '门诊收入')
  assert.equal(template.category, '门诊运营')
  assert.equal(template.component.kpiConfig?.unit, '万元')
  assert.notEqual(template.component, component)
})

test('复用模板时生成新组件 ID 和位置且保留完整配置', () => {
  const template = saveMedicalTemplate(component, '门诊运营')
  const instance = instantiateMedicalTemplate(template, 'instance-2', 100, 160)
  assert.equal(instance.id, 'instance-2')
  assert.equal(instance.position.x, 100)
  assert.equal(instance.position.y, 160)
  assert.equal(instance.dataConfig.datasetId, 'odr-income')
  assert.equal(instance.kpiConfig?.showProgress, true)
})

test('模板存储解析会忽略无效记录', () => {
  const valid = saveMedicalTemplate(component, '门诊运营')
  assert.deepEqual(normalizeMedicalTemplates([null, {}, valid]), [valid])
})
