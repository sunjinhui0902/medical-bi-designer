import assert from 'node:assert/strict'
import test from 'node:test'
import { createBuiltinDictionariesV3 } from '../src/data/builtinDictionaries.ts'
import { SYSTEM_PARAMETER_TEMPLATES_V3 } from '../src/data/systemParameters.ts'
import {
  ParameterRegistryErrorV3,
  ParameterRegistryV3,
} from '../src/services/parameterRegistry.ts'

function sequentialIds(): () => string {
  let sequence = 0
  return () => `parameter-test-${++sequence}`
}

test('内置字典包含年度、月份和日期快捷项', () => {
  const dictionaries = createBuiltinDictionariesV3(new Date('2026-07-29T00:00:00Z'))
  assert.deepEqual(dictionaries.map((item) => item.code), [
    'builtin.year',
    'builtin.month',
    'builtin.dateShortcut',
  ])
  assert.equal(dictionaries[0].options[0].value, '2027')
  assert.equal(dictionaries[1].options.length, 12)
  assert.equal(dictionaries[2].options.some((item) => item.value === 'currentMonth'), true)
})

test('注册全部八个系统参数模板且不加载机构医生真实选项', () => {
  const registry = new ParameterRegistryV3([], sequentialIds())
  for (const template of SYSTEM_PARAMETER_TEMPLATES_V3) {
    registry.createFromTemplate(template.code)
  }

  const parameters = registry.toJSON()
  assert.equal(parameters.length, 8)
  assert.deepEqual(parameters.map((item) => item.code), [
    'year_code',
    'month_code',
    'b_date',
    'e_date',
    'code_lv1',
    'code_lv2',
    'doctor_code',
    'flag',
  ])
  for (const code of ['code_lv1', 'code_lv2', 'doctor_code']) {
    const source = parameters.find((item) => item.code === code)?.source
    assert.deepEqual(source, { kind: 'static', options: [] })
  }
})

test('参数支持创建、读取、搜索、编辑和删除', () => {
  const registry = new ParameterRegistryV3([], sequentialIds())
  const created = registry.createFromTemplate('year_code')

  assert.equal(registry.get(created.id)?.code, 'year_code')
  assert.equal(registry.list('年度').length, 1)
  assert.equal(registry.list('year').length, 1)

  const updated = registry.update(created.id, {
    name: '统计年度',
    aliases: ['report_year'],
  })
  assert.equal(updated.name, '统计年度')
  assert.equal(registry.list('report_year').length, 1)
  assert.equal(registry.remove(created.id), true)
  assert.equal(registry.remove(created.id), false)
  assert.equal(registry.list().length, 0)
})

test('复制参数产生独立 ID、独立对象和唯一编码', () => {
  const registry = new ParameterRegistryV3([], sequentialIds())
  const source = registry.createFromTemplate('year_code')
  const firstCopy = registry.copy(source.id)
  const secondCopy = registry.copy(source.id)

  assert.notEqual(firstCopy.id, source.id)
  assert.equal(firstCopy.code, 'year_code_copy')
  assert.equal(secondCopy.code, 'year_code_copy2')

  const updatedCopy = registry.update(firstCopy.id, {
    name: '年度副本（已修改）',
    source: {
      kind: 'static',
      options: [{ label: '2026年', value: '2026' }],
    },
  })
  assert.equal(updatedCopy.name, '年度副本（已修改）')
  assert.deepEqual(registry.get(source.id)?.source, {
    kind: 'dictionary',
    dictionaryCode: 'builtin.year',
  })
})

test('重复编码、非法默认值和重复 ID 不会写入注册表', () => {
  const registry = new ParameterRegistryV3([], () => 'parameter-fixed')
  registry.createFromTemplate('year_code')

  assert.throws(
    () => registry.createFromTemplate('year_code'),
    ParameterRegistryErrorV3,
  )
  assert.throws(
    () => registry.create({
      code: 'invalid-number',
      name: '错误数字',
      type: 'number',
      scope: 'application',
      required: false,
      defaultValue: 'not-number',
      source: { kind: 'static', options: [] },
    }),
    ParameterRegistryErrorV3,
  )
  assert.equal(registry.list().length, 1)
})

test('对外返回值和序列化结果不会反向修改注册表', () => {
  const registry = new ParameterRegistryV3([], sequentialIds())
  const created = registry.createFromTemplate('year_code')
  const listed = registry.list()
  const serialized = registry.toJSON()

  listed[0].name = '外部修改'
  serialized[0].name = '序列化修改'

  assert.equal(registry.get(created.id)?.name, '年度')
})
