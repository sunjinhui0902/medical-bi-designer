import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyDatasetParametersToRows,
  compileDatasetParameterizedQuery,
  normalizeDatasetQueryParameters,
  validateDatasetExecutionRequest,
} from '../server/query-parameters.mjs'
import {
  applyDatasetRuntimeView,
  compileDatasetRuntimeQuery,
} from '../server/query-plan.mjs'

const dataset = {
  sql: 'select year_code, dept_code, stat_date, amount from income',
  fields: [
    { name: 'year_code', dataType: 'string' },
    { name: 'dept_code', dataType: 'string' },
    { name: 'stat_date', dataType: 'date' },
    { name: 'amount', dataType: 'number' },
  ],
  parameters: [
    { id: 'year', code: 'year_code', name: '年度', type: 'singleSelect', required: true, sqlName: 'year_code', operator: 'eq', emptyPolicy: 'reject' },
    { id: 'dept', code: 'dept_code', name: '科室', type: 'multiSelect', required: false, sqlName: 'dept_code', operator: 'in', emptyPolicy: 'omit' },
    { id: 'range', code: 'date_range', name: '日期', type: 'dateRange', required: false, sqlName: 'stat_date', operator: 'between', emptyPolicy: 'omit' },
  ],
}

test('服务端规范化旧参数并生成稳定安全默认值', () => {
  const [parameter] = normalizeDatasetQueryParameters([{ id: 'year_code', name: '年度', type: 'text', required: true }])
  assert.deepEqual(parameter, {
    id: 'year_code', code: 'year_code', name: '年度', type: 'string', required: true,
    sqlName: 'year_code', operator: 'eq', emptyPolicy: 'reject',
  })
})

test('查询编译只使用保存字段和 PostgreSQL 占位符', () => {
  const plan = compileDatasetParameterizedQuery(dataset, {
    year_code: '2026', dept_code: ['A', 'B'], date_range: ['2026-01-01', '2026-06-30'],
  }, 100)

  assert.equal(plan.text, 'SELECT * FROM (select year_code, dept_code, stat_date, amount from income) AS bi_runtime WHERE "year_code" = $1 AND "dept_code" = ANY($2) AND "stat_date" BETWEEN $3 AND $4 LIMIT $5')
  assert.deepEqual(plan.values, ['2026', ['A', 'B'], '2026-01-01', '2026-06-30', 100])
})

test('空可选参数省略条件，必填、未知和非法复合值被拒绝', () => {
  const plan = compileDatasetParameterizedQuery(dataset, { year_code: '2026', dept_code: [] })
  assert.equal(plan.text.includes('"dept_code"'), false)
  assert.deepEqual(plan.omittedParameters, ['dept_code', 'date_range'])

  assert.throws(() => compileDatasetParameterizedQuery(dataset, {}), /year_code 不能为空/)
  assert.throws(() => compileDatasetParameterizedQuery(dataset, { year_code: '2026', unknown: 'x' }), /未声明/)
  assert.throws(() => compileDatasetParameterizedQuery(dataset, { year_code: '2026', date_range: ['2026-02-01', '2026-01-01'] }), /开始日期/)
})

test('客户端不能注入字段名、运算符或 SQL 片段', () => {
  assert.throws(() => validateDatasetExecutionRequest({ parameters: { year_code: '2026' }, sql: 'select secret' }), /不能提交.*sql/)
  assert.throws(() => validateDatasetExecutionRequest({ field: 'year_code', operator: 'eq' }), /field.*operator/)
  assert.deepEqual(validateDatasetExecutionRequest({ parameters: { year_code: '2026' }, limit: 100 }), {
    parameters: { year_code: '2026' }, limit: 100,
  })
  assert.throws(() => compileDatasetParameterizedQuery({
    ...dataset,
    parameters: [{ ...dataset.parameters[0], sqlName: 'year_code; drop table users' }],
  }, { year_code: '2026' }), /SQL 字段名/)
  assert.throws(() => compileDatasetParameterizedQuery(dataset, {
    year_code: { sql: 'drop table users' },
  }), /必须是标量/)
})

test('结构化运行视图只接受字段序号和受限聚合枚举', () => {
  const plan = compileDatasetRuntimeQuery(dataset, { year_code: '2026' }, {
    dimensions: [1],
    measures: [{ field: 3, aggregation: 'sum' }, { field: 0, aggregation: 'count' }],
    sort: [{ kind: 'measure', index: 0, direction: 'desc' }],
    limit: 10,
  })
  assert.equal(plan.text, 'SELECT "dept_code", SUM("amount") AS "amount", COUNT("year_code") AS "year_code" FROM (select year_code, dept_code, stat_date, amount from income) AS bi_runtime WHERE "year_code" = $1 GROUP BY "dept_code" ORDER BY "amount" DESC LIMIT $2')
  assert.deepEqual(plan.values, ['2026', 10])
  assert.throws(() => compileDatasetRuntimeQuery(dataset, {}, { dimensions: [99] }), /字段序号/)
  assert.throws(() => compileDatasetRuntimeQuery(dataset, {}, { measures: [{ field: 3, aggregation: 'eval' }] }), /聚合方式/)
  assert.throws(() => compileDatasetRuntimeQuery(dataset, {}, { dimensions: [1], fieldName: 'dept_code' }), /未声明字段/)
  assert.throws(() => compileDatasetRuntimeQuery(dataset, {}, { measures: [{ field: 3, aggregation: 'sum', sql: 'drop table x' }] }), /未声明字段/)
})

test('超过 200 行的完整数据在服务端完成 SUM、COUNT 和 TOP 对账', () => {
  const rows = Array.from({ length: 600 }, (_, index) => ({
    year_code: '2026', dept_code: `D${index % 3}`, stat_date: '2026-01-01', amount: index + 1,
  }))
  const plan = compileDatasetRuntimeQuery(dataset, { year_code: '2026' }, {
    dimensions: [1],
    measures: [{ field: 3, aggregation: 'sum' }, { field: 0, aggregation: 'count' }],
    sort: [{ kind: 'measure', index: 0, direction: 'desc' }],
    limit: 2,
  })
  const result = applyDatasetRuntimeView(rows, plan.view)
  const expected = ['D0', 'D1', 'D2'].map((department) => {
    const group = rows.filter((row) => row.dept_code === department)
    return { dept_code: department, amount: group.reduce((sum, row) => sum + row.amount, 0), year_code: group.length }
  }).sort((left, right) => right.amount - left.amount).slice(0, 2)
  assert.deepEqual(result, expected)
  assert.equal(result.reduce((sum, row) => sum + row.year_code, 0), 400)
})

test('Demo 行过滤与编译后的参数语义一致', () => {
  const plan = compileDatasetParameterizedQuery(dataset, { year_code: '2026', dept_code: ['A'] })
  const rows = [
    { year_code: '2026', dept_code: 'A', stat_date: '2026-01-01', amount: 10 },
    { year_code: '2026', dept_code: 'B', stat_date: '2026-01-01', amount: 20 },
    { year_code: '2025', dept_code: 'A', stat_date: '2025-01-01', amount: 30 },
  ]
  assert.deepEqual(applyDatasetParametersToRows(rows, plan), [rows[0]])
})
