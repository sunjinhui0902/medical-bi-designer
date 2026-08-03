import type { Aggregation, ComponentDataConfig, ComponentDataView, MeasureBinding, QueryResult } from '../models/bi'

function inferType(values: unknown[]): 'string' | 'number' | 'date' | 'boolean' | 'unknown' {
  const value = values.find((item) => item !== null && item !== undefined)
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  if (value instanceof Date) return 'date'
  if (typeof value === 'string') return 'string'
  return 'unknown'
}

export function normalizeQueryResult(datasetId: string, value: unknown): QueryResult {
  const source = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const rows = Array.isArray(source.rows) ? source.rows.filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === 'object' && !Array.isArray(row)) : []
  const suppliedFields = Array.isArray(source.fields) ? source.fields : []
  const fieldNames = suppliedFields.length
    ? suppliedFields.map((field) => typeof field === 'object' && field ? String((field as Record<string, unknown>).name ?? '') : '').filter(Boolean)
    : [...new Set(rows.flatMap((row) => Object.keys(row)))]
  return {
    version: 1, datasetId,
    fields: fieldNames.map((name) => ({ name, label: name, dataType: inferType(rows.map((row) => row[name])) })),
    rows, rowCount: typeof source.rowCount === 'number' ? source.rowCount : rows.length,
    ...(typeof source.durationMs === 'number' ? { durationMs: source.durationMs } : {}),
  }
}

function valueKey(value: unknown) {
  if (value === null || value === undefined || value === '') return '（空）'
  return String(value)
}

function aggregate(rows: Array<Record<string, unknown>>, field: string, aggregation: Aggregation) {
  const raw = rows.map((row) => row[field])
  const nonEmpty = raw.filter((value) => value !== null && value !== undefined && value !== '')
  if (aggregation === 'count') return nonEmpty.length
  if (aggregation === 'countDistinct') return new Set(nonEmpty.map(valueKey)).size
  if (aggregation === 'none') {
    const value = Number(nonEmpty[0])
    return Number.isFinite(value) ? value : 0
  }
  const numbers = nonEmpty.map(Number).filter(Number.isFinite)
  if (!numbers.length) return 0
  if (aggregation === 'avg') return numbers.reduce((sum, value) => sum + value, 0) / numbers.length
  if (aggregation === 'min') return Math.min(...numbers)
  if (aggregation === 'max') return Math.max(...numbers)
  return numbers.reduce((sum, value) => sum + value, 0)
}

function compareLabels(left: string, right: string) {
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber
  return left.localeCompare(right, 'zh-CN', { numeric: true })
}

function compareValues(left: unknown, right: unknown) {
  const leftEmpty = left === null || left === undefined || left === ''
  const rightEmpty = right === null || right === undefined || right === ''
  if (leftEmpty || rightEmpty) return leftEmpty === rightEmpty ? 0 : leftEmpty ? 1 : -1
  const leftNumber = Number(left)
  const rightNumber = Number(right)
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber
  return compareLabels(String(left), String(right))
}

function sortRecords(
  records: Array<Record<string, unknown>>,
  rules: Array<{ field: string; direction: 'asc' | 'desc' }>,
) {
  if (!rules.length) return records
  return records
    .map((record, index) => ({ record, index }))
    .sort((left, right) => {
      for (const rule of rules) {
        const compared = compareValues(left.record[rule.field], right.record[rule.field])
        if (compared) return compared * (rule.direction === 'desc' ? -1 : 1)
      }
      return left.index - right.index
    })
    .map(({ record }) => record)
}

function measureSeries(measure: MeasureBinding, seriesName?: string) {
  return {
    id: seriesName ? `${measure.metricId || measure.field}::${seriesName}` : measure.metricId || measure.field,
    name: seriesName ? `${measure.alias || measure.field} · ${seriesName}` : measure.alias || measure.field,
    field: measure.field,
    chartType: measure.chartType || 'line' as const,
    axis: measure.axis || 'left' as const,
    unit: measure.unit || '',
    labelConfig: measure.labelConfig ?? { show: false, showCategory: false, showSeries: false, mode: 'value', decimals: 0, position: 'top', unit: measure.unit || '', percentageBase: 'category' },
    values: [] as number[],
  }
}

export function buildComponentDataView(rows: Array<Record<string, unknown>>, config: ComponentDataConfig): ComponentDataView {
  const category = config.dimensions.find((item) => item.role === 'category') ?? config.dimensions[0]
  const seriesDimension = config.dimensions.find((item) => item.role === 'series')
  const categoryGroups = new Map<string, Array<Record<string, unknown>>>()
  for (const row of rows) {
    const key = category ? valueKey(row[category.field]) : '汇总'
    const group = categoryGroups.get(key) ?? []
    group.push(row)
    categoryGroups.set(key, group)
  }
  const categoryRecords = [...categoryGroups].map(([key, group]) => ({
    __category: key,
    ...(category ? { [category.field]: group[0]?.[category.field] } : {}),
    ...Object.fromEntries(config.measures.map((measure) => [
      measure.field,
      aggregate(group, measure.field, measure.aggregation),
    ])),
  }))
  const categorySortRules = config.sort.length
    ? config.sort
    : category?.sort === 'asc' || category?.sort === 'desc'
      ? [{ field: category.field, direction: category.sort }]
      : []
  const categories = sortRecords(categoryRecords, categorySortRules)
    .slice(0, config.limit)
    .map((record) => String(record.__category))

  const seriesValues = seriesDimension
    ? [...new Set(rows.map((row) => valueKey(row[seriesDimension.field])))]
    : [undefined]
  if (seriesDimension?.sort === 'asc' || seriesDimension?.sort === 'desc') {
    seriesValues.sort((left, right) => compareLabels(String(left), String(right))
      * (seriesDimension.sort === 'desc' ? -1 : 1))
  }
  const series = config.measures.flatMap((measure) => seriesValues.map((seriesValue) => {
    const result = measureSeries(measure, seriesValue)
    result.values = categories.map((categoryValue) => aggregate(rows.filter((row) => {
      const categoryMatches = !category || valueKey(row[category.field]) === categoryValue
      const seriesMatches = !seriesDimension || valueKey(row[seriesDimension.field]) === seriesValue
      return categoryMatches && seriesMatches
    }), measure.field, measure.aggregation))
    return result
  }))

  const tableDimensions = config.dimensions.length ? config.dimensions : []
  const tableGroups = new Map<string, Array<Record<string, unknown>>>()
  for (const row of rows) {
    const key = tableDimensions.length ? tableDimensions.map((item) => valueKey(row[item.field])).join('\u001f') : '汇总'
    const group = tableGroups.get(key) ?? []
    group.push(row)
    tableGroups.set(key, group)
  }
  const unsortedTableRows = [...tableGroups.values()].map((group) => ({
    ...Object.fromEntries(tableDimensions.map((item) => [item.field, group[0]?.[item.field]])),
    ...Object.fromEntries(config.measures.map((measure) => [measure.field, aggregate(group, measure.field, measure.aggregation)])),
  }))
  const tableSortRules = [
    ...config.sort,
    ...tableDimensions
      .filter((item) => (item.sort === 'asc' || item.sort === 'desc') && !config.sort.some((rule) => rule.field === item.field))
      .map((item) => ({ field: item.field, direction: item.sort as 'asc' | 'desc' })),
  ]
  const tableRows = sortRecords(unsortedTableRows, tableSortRules).slice(0, config.limit)

  return {
    categories,
    series,
    columns: [
      ...config.dimensions.map((item) => ({ field: item.field, label: item.alias || item.field, role: 'dimension' as const })),
      ...config.measures.map((item) => ({ field: item.field, label: item.alias || item.field, role: 'measure' as const })),
    ],
    rows: tableRows,
  }
}
