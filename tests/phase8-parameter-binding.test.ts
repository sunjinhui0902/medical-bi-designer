import assert from 'node:assert/strict'
import test from 'node:test'

import type { ComponentDataConfigV2, DatasetQueryParameterV3 } from '../src/models/bi.ts'
import type { ParameterDefinitionV3 } from '../src/models/parameters.ts'
import {
  normalizeDatasetQueryParameterV3,
  suggestDatasetParameterBindingsV3,
  validateDatasetParameterBindingsV3,
  validateDatasetQueryParametersV3,
  upgradeComponentDataConfigV3,
} from '../src/services/datasetParameterBindingV3.ts'

const datasetParameters: DatasetQueryParameterV3[] = [
  { id: 'dp-year', code: 'year_code', name: '年度', type: 'singleSelect', required: true, sqlName: 'year_code', operator: 'eq', emptyPolicy: 'reject' },
  { id: 'dp-dept', code: 'dept_code', name: '科室', type: 'multiSelect', required: false, sqlName: 'dept_code', operator: 'in', emptyPolicy: 'omit' },
]

const applicationParameters: ParameterDefinitionV3[] = [
  { id: 'p-year', code: 'year_code', name: '年度', type: 'singleSelect', scope: 'application', required: true, source: { kind: 'static', options: [] } },
  { id: 'p-dept', code: 'code_lv1', name: '科室', type: 'multiSelect', scope: 'application', required: false, source: { kind: 'static', options: [] }, aliases: ['dept_code'] },
]

test('旧数据集参数补齐稳定编码、字段、运算符和空值策略', () => {
  assert.deepEqual(normalizeDatasetQueryParameterV3({ id: 'year_code', name: '年度', type: 'text', required: true }), {
    id: 'year_code', code: 'year_code', name: '年度', type: 'string', required: true,
    sqlName: 'year_code', operator: 'eq', emptyPolicy: 'reject',
  })
  assert.equal(normalizeDatasetQueryParameterV3({ id: 'range', type: 'dateRange' }).operator, 'between')
})

test('数据集参数拒绝未知字段、重复编码和不兼容运算符', () => {
  const invalid = [
    ...datasetParameters,
    { ...datasetParameters[1], id: 'dp-copy', sqlName: 'missing_field', operator: 'eq' as const },
  ]
  const result = validateDatasetQueryParametersV3(invalid, ['year_code', 'dept_code'])

  assert.equal(result.valid, false)
  assert.equal(result.issues.some((issue) => issue.code === 'duplicateCode'), true)
  assert.equal(result.issues.some((issue) => issue.code === 'fieldNotFound'), true)
  assert.equal(result.issues.some((issue) => issue.code === 'operatorMismatch'), true)
})

test('自动绑定先按编码再按别名，并保留未匹配项', () => {
  const candidates = suggestDatasetParameterBindingsV3([
    ...datasetParameters,
    { id: 'dp-doctor', code: 'doctor_code', name: '医生', type: 'singleSelect', required: false, sqlName: 'doctor_code', operator: 'eq', emptyPolicy: 'omit' },
  ], applicationParameters)

  assert.deepEqual(candidates.map((item) => item.match), ['code', 'alias', 'unmatched'])
  assert.deepEqual(candidates.map((item) => item.parameterId), ['p-year', 'p-dept', undefined])
})

test('人工绑定拒绝缺失引用、重复绑定和类型不兼容', () => {
  const result = validateDatasetParameterBindingsV3([
    { datasetParameterCode: 'year_code', parameterId: 'p-year' },
    { datasetParameterCode: 'year_code', parameterId: 'p-dept' },
    { datasetParameterCode: 'missing', parameterId: 'missing' },
  ], datasetParameters, applicationParameters)

  assert.equal(result.valid, false)
  assert.equal(result.issues.some((issue) => issue.code === 'duplicateBinding'), true)
  assert.equal(result.issues.some((issue) => issue.code === 'typeMismatch'), true)
  assert.equal(result.issues.some((issue) => issue.code === 'datasetParameterNotFound'), true)
  assert.equal(result.issues.some((issue) => issue.code === 'parameterNotFound'), true)
})

test('必填数据集参数没有默认值时必须绑定', () => {
  const result = validateDatasetParameterBindingsV3([], datasetParameters, applicationParameters)
  assert.equal(result.issues.some((issue) => issue.code === 'requiredBindingMissing'), true)
})

test('组件绑定配置从 V2 升级为 V3 并保留既有查询配置', () => {
  const legacy: ComponentDataConfigV2 = {
    version: 2,
    sourceKind: 'dataset',
    datasetId: 'income',
    dimensions: [{ field: 'year_code', role: 'category' }],
    measures: [{ field: 'amount', aggregation: 'sum' }],
    filters: [],
    sort: [],
    limit: 100,
  }
  const upgraded = upgradeComponentDataConfigV3(legacy, [
    { datasetParameterCode: 'year_code', parameterId: 'p-year' },
  ], 'manual')

  assert.equal(upgraded.version, 3)
  assert.equal(upgraded.datasetId, 'income')
  assert.deepEqual(upgraded.dimensions, legacy.dimensions)
  assert.deepEqual(upgraded.parameterBindings, [{ datasetParameterCode: 'year_code', parameterId: 'p-year' }])
  assert.equal(upgraded.refreshPolicy, 'manual')
})

test('组件绑定升级接受设计器响应式代理形态的 JSON 配置', () => {
  const legacy = new Proxy<ComponentDataConfigV2>({
    version: 2, sourceKind: 'server', datasetId: 'dataset-live', dimensions: [], measures: [], filters: [], sort: [], limit: 200,
  }, {})

  assert.doesNotThrow(() => upgradeComponentDataConfigV3(legacy))
  assert.equal(upgradeComponentDataConfigV3(legacy).datasetId, 'dataset-live')
})
