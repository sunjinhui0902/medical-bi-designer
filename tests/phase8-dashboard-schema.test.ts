import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'

test('Phase8 Schema 接受引用现有参数的筛选控件', () => {
  const application = createDefaultDashboardApplicationV3()
  application.parameters.push({
    id: 'parameter-year',
    code: 'year_code',
    name: '年度',
    type: 'singleSelect',
    scope: 'application',
    required: true,
    source: { kind: 'dictionary', dictionaryCode: 'builtin.year' },
  })
  application.pages[0].controls.push({
    id: 'control-year',
    type: 'singleSelect',
    parameterIds: ['parameter-year'],
    position: { x: 20, y: 20, width: 160, height: 36, zIndex: 10 },
    styleConfig: {},
    interaction: { submitMode: 'immediate', clearable: false },
  })

  assert.equal(validateDashboardApplicationV3(application).valid, true)
})

test('Phase8 语义校验拒绝控件引用不存在参数和重复控件 ID', () => {
  const application = createDefaultDashboardApplicationV3()
  const control = {
    id: 'control-year',
    type: 'singleSelect' as const,
    parameterIds: ['parameter-missing'],
    position: { x: 20, y: 20, width: 160, height: 36, zIndex: 10 },
    styleConfig: {},
    interaction: { submitMode: 'immediate' as const, clearable: false },
  }
  application.pages[0].controls.push(control, structuredClone(control))

  const result = validateDashboardApplicationV3(application)
  assert.equal(result.valid, false)
  assert.equal(result.issues.some((issue) => issue.keyword === 'parameterReference'), true)
  assert.equal(result.issues.some((issue) => issue.keyword === 'uniqueControlId'), true)
})

test('Phase8 参数定义允许数据集选项来源', () => {
  const application = createDefaultDashboardApplicationV3()
  application.parameters.push({
    id: 'parameter-department',
    code: 'code_lv1',
    name: '一级机构',
    type: 'singleSelect',
    scope: 'application',
    required: false,
    source: {
      kind: 'dataset',
      datasetId: 'dataset-department',
      valueField: 'dept_code',
      labelField: 'dept_name',
    },
  })

  assert.equal(validateDashboardApplicationV3(application).valid, true)
})
