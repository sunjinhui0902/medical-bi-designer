import assert from 'node:assert/strict'
import test from 'node:test'
import type { ParameterDefinitionV3 } from '../src/models/parameters.ts'
import {
  validateParameterCollectionV3,
  validateParameterDefinitionV3,
} from '../src/services/parameterValidation.ts'

function parameter(
  changes: Partial<ParameterDefinitionV3> = {},
): ParameterDefinitionV3 {
  return {
    id: 'parameter-year',
    code: 'year_code',
    name: '年度',
    type: 'singleSelect',
    scope: 'application',
    required: false,
    defaultValue: '2026',
    source: {
      kind: 'static',
      options: [
        { label: '2025年', value: '2025' },
        { label: '2026年', value: '2026' },
      ],
    },
    validation: { allowEmpty: true },
    aliases: [],
    ...changes,
  }
}

test('支持六类参数的合法默认值', () => {
  const cases: ParameterDefinitionV3[] = [
    parameter({ id: 'p-string', code: 'p_string', type: 'string', defaultValue: 'ok', source: { kind: 'static', options: [] } }),
    parameter({ id: 'p-number', code: 'p_number', type: 'number', defaultValue: 12, source: { kind: 'static', options: [] } }),
    parameter({ id: 'p-date', code: 'p_date', type: 'date', defaultValue: '2026-07-29', source: { kind: 'system', systemCode: 'currentDate' } }),
    parameter({ id: 'p-range', code: 'p_range', type: 'dateRange', defaultValue: ['2026-07-01', '2026-07-29'], source: { kind: 'static', options: [] } }),
    parameter({ id: 'p-single', code: 'p_single', type: 'singleSelect' }),
    parameter({ id: 'p-multi', code: 'p_multi', type: 'multiSelect', defaultValue: ['2025', '2026'] }),
  ]

  assert.equal(validateParameterCollectionV3(cases).valid, true)
})

test('拒绝错误默认值类型和倒序日期范围', () => {
  const invalid = [
    parameter({ type: 'number', defaultValue: '12' }),
    parameter({ type: 'date', defaultValue: '2026-02-30' }),
    parameter({ type: 'dateRange', defaultValue: ['2026-08-01', '2026-07-01'] }),
    parameter({ type: 'multiSelect', defaultValue: '2026' }),
  ]

  for (const item of invalid) {
    assert.equal(validateParameterDefinitionV3(item).valid, false)
  }
})

test('拒绝重复静态选项、缺失默认选项和未注册字典', () => {
  const duplicateOptions = parameter({
    source: {
      kind: 'static',
      options: [
        { label: '年度一', value: '2026' },
        { label: '年度二', value: '2026' },
      ],
    },
  })
  const missingDefault = parameter({ defaultValue: '2030' })
  const unknownDictionary = parameter({
    source: { kind: 'dictionary', dictionaryCode: 'remote.year' },
  })

  assert.equal(validateParameterDefinitionV3(duplicateOptions).issues.some((item) => item.code === 'duplicateOptionValue'), true)
  assert.equal(validateParameterDefinitionV3(missingDefault).issues.some((item) => item.code === 'defaultOptionMissing'), true)
  assert.equal(validateParameterDefinitionV3(unknownDictionary).issues.some((item) => item.code === 'dictionaryNotFound'), true)
})

test('编码、范围、别名和集合唯一性校验可定位', () => {
  const first = parameter()
  const second = parameter({
    id: 'parameter-year-2',
    name: '另一年度',
  })
  const invalid = parameter({
    code: 'Year-Code',
    type: 'number',
    defaultValue: 20,
    source: { kind: 'static', options: [] },
    validation: { min: 30, max: 10 },
    aliases: ['year', 'year'],
  })

  const collection = validateParameterCollectionV3([first, second])
  const result = validateParameterDefinitionV3(invalid)

  assert.equal(collection.valid, false)
  assert.equal(collection.issues.some((item) => item.code === 'duplicateCode'), true)
  assert.equal(result.issues.some((item) => item.path === '/code'), true)
  assert.equal(result.issues.some((item) => item.code === 'invalidRange'), true)
  assert.equal(result.issues.some((item) => item.code === 'invalidAliases'), true)
})

test('Phase7 拒绝页面参数范围和未注册系统来源', () => {
  const pageParameter = parameter({ scope: 'page', pageId: 'page-home' })
  const unknownSystem = parameter({
    type: 'date',
    defaultValue: undefined,
    source: { kind: 'system', systemCode: 'currentUser' },
  })

  assert.equal(validateParameterDefinitionV3(pageParameter).issues.some((item) => item.code === 'scopeUnsupported'), true)
  assert.equal(validateParameterDefinitionV3(unknownSystem).issues.some((item) => item.code === 'systemCodeNotAllowed'), true)
})
