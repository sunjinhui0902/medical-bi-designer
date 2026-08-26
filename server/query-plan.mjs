import { compileDatasetParameterPredicate } from './query-parameters.mjs'

const AGGREGATIONS = new Map([
  ['sum', 'SUM'], ['avg', 'AVG'], ['count', 'COUNT'], ['countDistinct', 'COUNT'],
  ['min', 'MIN'], ['max', 'MAX'],
])
const DIRECTIONS = new Set(['asc', 'desc'])

function quoteIdentifier(value) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) throw new Error(`数据集字段标识无效：${value}`)
  return `"${value.replaceAll('"', '""')}"`
}

function resolveField(dataset, index) {
  if (!Number.isInteger(index) || index < 0 || index >= dataset.fields.length) throw new Error(`字段序号不存在：${index}`)
  return dataset.fields[index]
}

export function normalizeDatasetRuntimeView(dataset, value, fallbackLimit = 200) {
  if (value === undefined) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('运行视图必须是对象')
  const unknownKeys = Object.keys(value).filter((key) => !['dimensions', 'measures', 'sort', 'limit'].includes(key))
  if (unknownKeys.length) throw new Error(`运行视图包含未声明字段：${unknownKeys.join('、')}`)
  const dimensions = (Array.isArray(value.dimensions) ? value.dimensions : []).map((index) => {
    const field = resolveField(dataset, index)
    return { index, name: field.name }
  })
  const measures = (Array.isArray(value.measures) ? value.measures : []).map((measure) => {
    if (!measure || typeof measure !== 'object' || Array.isArray(measure)) throw new Error('指标引用必须是对象')
    const unknownMeasureKeys = Object.keys(measure).filter((key) => !['field', 'aggregation'].includes(key))
    if (unknownMeasureKeys.length) throw new Error(`指标引用包含未声明字段：${unknownMeasureKeys.join('、')}`)
    const field = resolveField(dataset, measure.field)
    if (!AGGREGATIONS.has(measure.aggregation)) throw new Error(`聚合方式不受支持：${measure.aggregation}`)
    if (['sum', 'avg'].includes(measure.aggregation) && field.dataType !== 'number' && field.type !== 'number') {
      throw new Error(`字段 ${field.name} 不支持 ${measure.aggregation}`)
    }
    return { field: measure.field, name: field.name, aggregation: measure.aggregation }
  })
  if (!dimensions.length && !measures.length) throw new Error('运行视图至少需要一个维度或指标')
  const outputs = [...dimensions.map((item) => item.name), ...measures.map((item) => item.name)]
  if (new Set(outputs).size !== outputs.length) throw new Error('运行视图输出字段不能重复')
  const sort = (Array.isArray(value.sort) ? value.sort : []).map((rule) => {
    const unknownSortKeys = rule && typeof rule === 'object' && !Array.isArray(rule)
      ? Object.keys(rule).filter((key) => !['kind', 'index', 'direction'].includes(key))
      : []
    if (unknownSortKeys.length) throw new Error(`排序规则包含未声明字段：${unknownSortKeys.join('、')}`)
    if (!rule || typeof rule !== 'object' || !['dimension', 'measure'].includes(rule.kind) || !DIRECTIONS.has(rule.direction)) {
      throw new Error('排序规则无效')
    }
    const collection = rule.kind === 'dimension' ? dimensions : measures
    if (!Number.isInteger(rule.index) || !collection[rule.index]) throw new Error('排序引用不存在')
    return { kind: rule.kind, index: rule.index, name: collection[rule.index].name, direction: rule.direction }
  })
  return {
    dimensions,
    measures,
    sort,
    limit: Math.min(Math.max(Number(value.limit ?? fallbackLimit) || 200, 1), 2000),
  }
}

export function compileDatasetRuntimeQuery(dataset, parameterValues = {}, viewValue, fallbackLimit = 200) {
  const view = normalizeDatasetRuntimeView(dataset, viewValue, fallbackLimit)
  if (!view) return null
  const predicate = compileDatasetParameterPredicate(dataset, parameterValues)
  const dimensionSql = view.dimensions.map((item) => quoteIdentifier(item.name))
  const measureSql = view.measures.map((item) => {
    const field = quoteIdentifier(item.name)
    const distinct = item.aggregation === 'countDistinct' ? 'DISTINCT ' : ''
    return `${AGGREGATIONS.get(item.aggregation)}(${distinct}${field}) AS ${field}`
  })
  const select = [...dimensionSql, ...measureSql].join(', ')
  const groupBy = dimensionSql.length && measureSql.length ? ` GROUP BY ${dimensionSql.join(', ')}` : ''
  const orderBy = view.sort.length
    ? ` ORDER BY ${view.sort.map((item) => `${quoteIdentifier(item.name)} ${item.direction.toUpperCase()}`).join(', ')}`
    : ''
  const values = [...predicate.values, view.limit]
  return {
    ...predicate,
    view,
    values,
    text: `SELECT ${select} FROM (${String(dataset.sql || '').trim()}) AS bi_runtime${predicate.where}${groupBy}${orderBy} LIMIT $${values.length}`,
  }
}

function withoutTrailingLimit(text) {
  return text.replace(/ LIMIT \$\d+$/, '')
}

export function compileDatasetPagedQuery(dataset, parameterValues = {}, viewValue, pagination) {
  if (!pagination) throw new Error('分页配置不能为空')
  const runtime = compileDatasetRuntimeQuery(dataset, parameterValues, viewValue, pagination.limit)
  if (runtime) {
    const baseText = withoutTrailingLimit(runtime.text)
    const predicateValues = runtime.values.slice(0, -1)
    return {
      ...runtime,
      pagination,
      text: `${baseText} LIMIT $${predicateValues.length + 1} OFFSET $${predicateValues.length + 2}`,
      values: [...predicateValues, pagination.limit, pagination.offset],
      ...(pagination.includeTotal ? {
        countText: `SELECT COUNT(*)::bigint AS total FROM (${baseText}) AS bi_page_total`,
        countValues: predicateValues,
      } : {}),
    }
  }
  const predicate = compileDatasetParameterPredicate(dataset, parameterValues)
  const baseText = `SELECT * FROM (${String(dataset.sql || '').trim()}) AS bi_runtime${predicate.where}`
  return {
    ...predicate,
    pagination,
    text: `${baseText} LIMIT $${predicate.values.length + 1} OFFSET $${predicate.values.length + 2}`,
    values: [...predicate.values, pagination.limit, pagination.offset],
    ...(pagination.includeTotal ? {
      countText: `SELECT COUNT(*)::bigint AS total FROM (${baseText}) AS bi_page_total`,
      countValues: [...predicate.values],
    } : {}),
  }
}

export function compileDatasetOptionsQuery(dataset, parameterValues = {}, request = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) throw new Error('选项请求必须是对象')
  const unknown = Object.keys(request).filter((key) => !['parameters', 'valueField', 'labelField', 'limit'].includes(key))
  if (unknown.length) throw new Error(`选项请求包含未声明字段：${unknown.join('、')}`)
  const fields = new Set((Array.isArray(dataset.fields) ? dataset.fields : []).map((field) => field.name))
  const valueField = String(request.valueField || '')
  const labelField = String(request.labelField || '')
  if (!fields.has(valueField) || !fields.has(labelField)) throw new Error('选项字段必须存在于已保存的数据集字段中')
  if (request.limit !== undefined && (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > 500)) throw new Error('选项 limit 必须是 1 到 500 的整数')
  const limit = request.limit ?? 200
  const predicate = compileDatasetParameterPredicate(dataset, parameterValues)
  const valueSql = quoteIdentifier(valueField)
  const labelSql = quoteIdentifier(labelField)
  const values = [...predicate.values, limit]
  return {
    ...predicate,
    valueField,
    labelField,
    limit,
    text: `SELECT DISTINCT ${valueSql} AS value, ${labelSql} AS label FROM (${String(dataset.sql || '').trim()}) AS bi_runtime${predicate.where} AND ${valueSql} IS NOT NULL`.replace(' WHERE AND ', ' WHERE ').replace(' AS bi_runtime AND ', ' AS bi_runtime WHERE ') + ` ORDER BY ${labelSql}, ${valueSql} LIMIT $${values.length}`,
    values,
  }
}

function aggregate(rows, field, aggregation) {
  const values = rows.map((row) => row[field]).filter((value) => value !== null && value !== undefined && value !== '')
  if (aggregation === 'count') return values.length
  if (aggregation === 'countDistinct') return new Set(values.map(String)).size
  const numbers = values.map(Number).filter(Number.isFinite)
  if (!numbers.length) return 0
  if (aggregation === 'avg') return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
  if (aggregation === 'min') return Math.min(...numbers)
  if (aggregation === 'max') return Math.max(...numbers)
  return numbers.reduce((sum, value) => sum + value, 0)
}

export function applyDatasetRuntimeView(rows, view, resultLimit = view.limit) {
  const groups = new Map()
  for (const row of rows) {
    const key = view.dimensions.map((item) => JSON.stringify(row[item.name])).join('\u001f') || '__all__'
    const group = groups.get(key) ?? []
    group.push(row)
    groups.set(key, group)
  }
  const result = [...groups.values()].map((group) => ({
    ...Object.fromEntries(view.dimensions.map((item) => [item.name, group[0]?.[item.name]])),
    ...Object.fromEntries(view.measures.map((item) => [item.name, aggregate(group, item.name, item.aggregation)])),
  }))
  result.sort((left, right) => {
    for (const rule of view.sort) {
      const compared = typeof left[rule.name] === 'number' && typeof right[rule.name] === 'number'
        ? left[rule.name] - right[rule.name]
        : String(left[rule.name]).localeCompare(String(right[rule.name]), 'zh-CN', { numeric: true })
      if (compared) return compared * (rule.direction === 'desc' ? -1 : 1)
    }
    return 0
  })
  return result.slice(0, resultLimit)
}
