import assert from 'node:assert/strict'
import test from 'node:test'

import { normalizeDatasetPagination, validateDatasetExecutionRequest } from '../server/query-parameters.mjs'
import { compileDatasetOptionsQuery, compileDatasetPagedQuery } from '../server/query-plan.mjs'
import type { ParameterDefinitionV3 } from '../src/models/parameters.ts'
import { buildParameterDependencyDagV3, createHttpParameterOptionsLoaderV3, dependentParameterIdsV3, ParameterOptionsRuntimeV3, reconcileParameterOptionValueV3 } from '../src/services/parameterOptionsRuntimeV3.ts'
import { evaluateTableRuleV3, paginateRowsV3, resolveTableCellPresentationV3 } from '../src/services/tableRuntimeV3.ts'

const dataset = {
  sql: 'select region_code, org_code, org_name, risk_score from org_quality',
  fields: [
    { name: 'region_code', dataType: 'string' },
    { name: 'org_code', dataType: 'string' },
    { name: 'org_name', dataType: 'string' },
    { name: 'risk_score', dataType: 'number' },
  ],
  parameters: [{ id: 'region', code: 'region_code', name: '区域', type: 'singleSelect', required: false, sqlName: 'region_code', operator: 'eq', emptyPolicy: 'omit' }],
}

test('受控服务端分页编译数据查询与同口径 total 查询', () => {
  const request = validateDatasetExecutionRequest({ parameters: { region_code: '3209' }, pagination: { offset: 40, limit: 20, includeTotal: true } })
  const plan = compileDatasetPagedQuery(dataset, request.parameters, undefined, request.pagination)
  assert.equal(plan.text, 'SELECT * FROM (select region_code, org_code, org_name, risk_score from org_quality) AS bi_runtime WHERE "region_code" = $1 LIMIT $2 OFFSET $3')
  assert.deepEqual(plan.values, ['3209', 20, 40])
  assert.equal(plan.countText, 'SELECT COUNT(*)::bigint AS total FROM (SELECT * FROM (select region_code, org_code, org_name, risk_score from org_quality) AS bi_runtime WHERE "region_code" = $1) AS bi_page_total')
  assert.deepEqual(plan.countValues, ['3209'])
  assert.throws(() => normalizeDatasetPagination({ offset: 0, limit: 500 }), /1 到 200/)
  assert.throws(() => validateDatasetExecutionRequest({ pagination: { offset: 0, limit: 20, sql: 'drop table x' } }), /未声明字段/)
  assert.throws(() => validateDatasetExecutionRequest({ limit: 20, pagination: { offset: 0, limit: 20 } }), /不能同时/)
})

test('运行视图分页在聚合排序后执行并按聚合结果计数', () => {
  const plan = compileDatasetPagedQuery(dataset, {}, {
    dimensions: [0], measures: [{ field: 3, aggregation: 'sum' }], sort: [{ kind: 'measure', index: 0, direction: 'desc' }], limit: 999,
  }, { offset: 10, limit: 10, includeTotal: true })
  assert.match(plan.text, /GROUP BY "region_code" ORDER BY "risk_score" DESC LIMIT \$1 OFFSET \$2$/)
  assert.match(plan.countText, /^SELECT COUNT\(\*\)::bigint AS total FROM \(SELECT .*GROUP BY "region_code" ORDER BY "risk_score" DESC\) AS bi_page_total$/)
})

test('动态选项字段只能来自数据集字段白名单且参数仍使用占位符', () => {
  const plan = compileDatasetOptionsQuery(dataset, { region_code: '3209' }, { valueField: 'org_code', labelField: 'org_name', limit: 100 })
  assert.equal(plan.text, 'SELECT DISTINCT "org_code" AS value, "org_name" AS label FROM (select region_code, org_code, org_name, risk_score from org_quality) AS bi_runtime WHERE "region_code" = $1 AND "org_code" IS NOT NULL ORDER BY "org_name", "org_code" LIMIT $2')
  assert.deepEqual(plan.values, ['3209', 100])
  assert.throws(() => compileDatasetOptionsQuery(dataset, {}, { valueField: 'org_code;drop table x', labelField: 'org_name' }), /已保存的数据集字段/)
  assert.throws(() => compileDatasetOptionsQuery(dataset, {}, { valueField: 'org_code', labelField: 'org_name', where: '1=1' }), /未声明字段/)
  assert.throws(() => compileDatasetOptionsQuery(dataset, {}, { valueField: 'org_code', labelField: 'org_name', limit: 501 }), /1 到 500/)
})

test('表格条件规则结构化求值并按声明顺序叠加样式', () => {
  const row = { name: '东台人民医院', risk: 91, state: 'danger' }
  assert.equal(evaluateTableRuleV3({ id: 'high', field: 'risk', operator: 'gte', value: 90 }, row), true)
  assert.equal(evaluateTableRuleV3({ id: 'contains', field: 'name', operator: 'contains', value: '人民' }, row), true)
  const style = resolveTableCellPresentationV3([
    { id: 'high', field: 'risk', operator: 'gte', value: 90, backgroundColor: '#fff1f0', badge: 'warning' },
    { id: 'danger', field: 'risk', operator: 'gte', value: 90, textColor: '#ff4d4f', badge: 'danger' },
  ], row, 'risk')
  assert.deepEqual(style, { backgroundColor: '#fff1f0', textColor: '#ff4d4f', badge: 'danger', matchedRuleIds: ['high', 'danger'] })
})

test('客户端分页纠正越界页且不修改源数组', () => {
  const rows = Array.from({ length: 45 }, (_, index) => index + 1)
  const result = paginateRowsV3(rows, { page: 99, pageSize: 20 })
  assert.deepEqual(result.rows, [41, 42, 43, 44, 45])
  assert.deepEqual({ page: result.page, pageSize: result.pageSize, pageCount: result.pageCount, total: result.total, offset: result.offset }, { page: 3, pageSize: 20, pageCount: 3, total: 45, offset: 40 })
  assert.equal(rows.length, 45)
})

function optionDefinitions(): ParameterDefinitionV3[] {
  return [
    { id: 'level', code: 'level', name: '机构层级', type: 'singleSelect', scope: 'application', required: false, source: { kind: 'static', options: [] } },
    { id: 'org', code: 'org', name: '机构', type: 'singleSelect', scope: 'application', required: false, source: { kind: 'dataset', datasetId: 'orgs', valueField: 'org_code', labelField: 'org_name', dependencies: [{ parameterId: 'level', datasetParameterCode: 'org_level' }] } },
  ]
}

test('参数依赖 DAG 拒绝缺失依赖、自依赖和循环', () => {
  const dag = buildParameterDependencyDagV3(optionDefinitions())
  assert.deepEqual(dag.order, ['level', 'org'])
  assert.deepEqual(dag.dependents.get('level'), ['org'])
  assert.deepEqual(dependentParameterIdsV3(dag, ['level']), ['org'])
  assert.throws(() => buildParameterDependencyDagV3([{ ...optionDefinitions()[1], source: { ...optionDefinitions()[1].source, dependencies: [{ parameterId: 'missing', datasetParameterCode: 'x' }] } } as ParameterDefinitionV3]), /依赖不存在/)
  const cyclic = optionDefinitions()
  cyclic[0] = { ...cyclic[0], source: { kind: 'dataset', datasetId: 'levels', valueField: 'v', labelField: 'l', dependencies: [{ parameterId: 'org', datasetParameterCode: 'org' }] } }
  assert.throws(() => buildParameterDependencyDagV3(cyclic), /存在循环/)
})

test('动态选项 latest-wins 丢弃旧响应且失败时不回用脏选项', async () => {
  const pending: Array<(value: Array<{ label: string; value: string }>) => void> = []
  const runtime = new ParameterOptionsRuntimeV3(optionDefinitions(), ({ parameters }) => new Promise((resolve) => pending.push((options) => resolve(options.map((item) => ({ ...item, label: `${parameters.org_level}-${item.label}` }))))))
  const first = runtime.load('org', { level: 'city' })
  const second = runtime.load('org', { level: 'county' })
  pending[1]([{ label: 'B', value: 'B' }]); pending[0]([{ label: 'A', value: 'A' }])
  assert.deepEqual(await second, { status: 'ready', options: [{ label: 'county-B', value: 'B' }] })
  assert.deepEqual(await first, { status: 'stale', options: [] })

  const failed = new ParameterOptionsRuntimeV3(optionDefinitions(), async () => { throw new Error('network down') })
  assert.deepEqual(await failed.load('org', { level: 'city' }), { status: 'error', options: [], message: 'network down' })
})

test('选项值核对清理失效旧值并优先保留有效默认值', () => {
  const definition = optionDefinitions()[1]
  definition.defaultValue = 'B'
  const options = [{ label: 'B', value: 'B' }, { label: 'C', value: 'C' }]
  assert.equal(reconcileParameterOptionValueV3(definition, 'A', options), 'B')
  assert.equal(reconcileParameterOptionValueV3(definition, 'C', options), 'C')
  assert.equal(reconcileParameterOptionValueV3({ ...definition, defaultValue: 'X' }, 'A', options), undefined)
})

test('HTTP 选项加载器只发送结构化字段与参数', async () => {
  let captured = {} as { url?: string; body?: Record<string, unknown> }
  const loader = createHttpParameterOptionsLoaderV3(async (input, init) => {
    captured = { url: String(input), body: JSON.parse(String(init?.body)) }
    return new Response(JSON.stringify({ options: [{ label: '人民医院', value: 'H1' }] }), { status: 200, headers: { 'content-type': 'application/json' } })
  })
  const options = await loader({ datasetId: 'org/list', valueField: 'org_code', labelField: 'org_name', parameters: { org_level: 'county' }, signal: new AbortController().signal })
  assert.equal(captured.url, '/api/datasets/org%2Flist/options')
  assert.deepEqual(captured.body, { valueField: 'org_code', labelField: 'org_name', parameters: { org_level: 'county' }, limit: 500 })
  assert.deepEqual(options, [{ label: '人民医院', value: 'H1' }])
})
