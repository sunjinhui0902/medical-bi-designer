import assert from 'node:assert/strict'
import test from 'node:test'

import type { ParameterDefinitionV3 } from '../src/models/parameters.ts'
import {
  ParameterRuntimeErrorV3,
  ParameterRuntimeStoreV3,
} from '../src/services/parameterRuntimeV3.ts'

function definitions(): ParameterDefinitionV3[] {
  return [
    {
      id: 'parameter-year', code: 'year_code', name: '年度', type: 'singleSelect', scope: 'application', required: true,
      defaultValue: '2026', source: { kind: 'static', options: [{ label: '2026年', value: '2026' }, { label: '2027年', value: '2027' }] },
    },
    {
      id: 'parameter-date', code: 'b_date', name: '开始日期', type: 'date', scope: 'application', required: false,
      source: { kind: 'system', systemCode: 'currentDate' }, validation: { allowEmpty: true },
    },
    {
      id: 'parameter-dept', code: 'code_lv1', name: '机构', type: 'multiSelect', scope: 'application', required: false,
      source: { kind: 'static', options: [{ label: '内科', value: 'A' }, { label: '外科', value: 'B' }] }, validation: { allowEmpty: true },
    },
  ]
}

function store() {
  let transaction = 0
  return new ParameterRuntimeStoreV3(definitions(), {
    now: () => new Date('2026-08-03T08:30:00.000Z'),
    transactionId: () => `tx-${++transaction}`,
  })
}

test('运行时从默认值和受控系统值初始化且不修改定义', () => {
  const source = definitions()
  const runtime = new ParameterRuntimeStoreV3(source, { now: () => new Date('2026-08-03T08:30:00.000Z') })

  assert.equal(runtime.get('parameter-year'), '2026')
  assert.equal(runtime.get('parameter-date'), '2026-08-03')
  assert.equal(runtime.snapshot().source['parameter-year'], 'default')
  assert.equal(runtime.snapshot().source['parameter-date'], 'system')
  assert.equal('runtimeValue' in source[0], false)
})

test('批量提交原子更新并记录一次事务', () => {
  const runtime = store()
  const result = runtime.commit([
    { parameterId: 'parameter-year', value: '2027' },
    { parameterId: 'parameter-dept', value: ['A', 'B'] },
  ])

  assert.equal(result.changed, true)
  assert.deepEqual(result.changedParameterIds, ['parameter-year', 'parameter-dept'])
  assert.equal(result.state.transactionId, 'tx-1')
  assert.equal(result.state.source['parameter-year'], 'control')
})

test('相同值不产生新事务，返回快照不能反向修改 Store', () => {
  const runtime = store()
  const unchanged = runtime.commit([{ parameterId: 'parameter-year', value: '2026' }])
  unchanged.state.values['parameter-year'] = 'tampered'

  assert.equal(unchanged.changed, false)
  assert.equal(unchanged.state.transactionId, 'parameter-tx-initial')
  assert.equal(runtime.get('parameter-year'), '2026')
})

test('非法批次整体拒绝且保留提交前状态', () => {
  const runtime = store()
  const before = runtime.snapshot()

  assert.throws(() => runtime.commit([
    { parameterId: 'parameter-year', value: '2027' },
    { parameterId: 'parameter-dept', value: ['UNKNOWN'] },
  ]), ParameterRuntimeErrorV3)
  assert.deepEqual(runtime.snapshot(), before)
})

test('可清空可选参数，但拒绝清空必填参数和重复赋值', () => {
  const runtime = store()
  runtime.commit([{ parameterId: 'parameter-dept', value: ['A'] }])
  assert.equal(runtime.clear(['parameter-dept']).changed, true)
  assert.equal(runtime.get('parameter-dept'), undefined)

  assert.throws(() => runtime.clear(['parameter-year']), /参数值不能为空/)
  assert.throws(() => runtime.commit([
    { parameterId: 'parameter-date', value: '2026-08-01' },
    { parameterId: 'parameter-date', value: '2026-08-02' },
  ]), /同一批次不能重复赋值/)
})

test('日期范围与多选值执行类型和顺序校验', () => {
  const runtime = new ParameterRuntimeStoreV3([{
    id: 'parameter-range', code: 'date_range', name: '日期范围', type: 'dateRange', scope: 'application', required: false,
    source: { kind: 'static', options: [] }, validation: { allowEmpty: true },
  }])

  assert.throws(() => runtime.commit([{ parameterId: 'parameter-range', value: ['2026-08-03', '2026-08-01'] }]), /开始日期不能晚于结束日期/)
  assert.equal(runtime.commit([{ parameterId: 'parameter-range', value: ['2026-08-01', '2026-08-03'] }]).changed, true)
})
