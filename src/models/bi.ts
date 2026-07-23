export type DataSourceKind = 'mock' | 'server'
export type FieldRole = 'dimension' | 'measure' | 'parameter' | 'helper'
export type FieldDataType = 'string' | 'number' | 'date' | 'datetime' | 'boolean' | 'unknown'
export type Aggregation = 'sum' | 'avg' | 'count' | 'countDistinct' | 'min' | 'max' | 'none'
export type DimensionPurpose = 'category' | 'series' | 'detail'
export type MeasureChartType = 'bar' | 'line' | 'area'
export type AxisSide = 'left' | 'right'

export interface DatasetFieldModel {
  name: string
  label: string
  dataType: FieldDataType
  role: FieldRole
  description?: string
  unit?: string
  defaultAggregation?: Aggregation
  numberFormat?: string
  metric?: MetricReference
}

export interface MetricReference {
  metricId: string
  metricCode?: string
  metricName?: string
  source: 'local' | 'external'
  version?: string
}

export interface ParameterDefinition {
  id: string
  name: string
  type: 'text' | 'number' | 'date' | 'dateRange' | 'singleSelect' | 'multiSelect'
  required?: boolean
  defaultValue?: unknown
}

export interface DatasetModelV2 {
  version: 2
  id: string
  name: string
  code: string
  category?: string
  purpose?: string
  description?: string
  dataSourceId: string
  fields: DatasetFieldModel[]
  parameters: ParameterDefinition[]
  status: 'draft' | 'validated' | 'disabled'
  createdBy?: string
  createdAt?: string
  updatedAt?: string
}

export interface DimensionBinding {
  field: string
  role: DimensionPurpose
  alias?: string
  sort?: 'asc' | 'desc' | 'none'
}

export interface SeriesLabelConfig {
  show: boolean
  showCategory: boolean
  showSeries: boolean
  mode: 'value' | 'percentage' | 'both'
  decimals: number
  position: 'top' | 'inside' | 'outside'
  unit: string
  percentageBase: 'category' | 'series'
}

export interface MeasureBinding {
  field: string
  alias?: string
  metricId?: string
  aggregation: Aggregation
  unit?: string
  format?: string
  chartType?: MeasureChartType
  axis?: AxisSide
  labelConfig?: SeriesLabelConfig
}

export interface FilterBinding {
  field: string
  operator: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'notIn' | 'contains' | 'between' | 'isNull' | 'notNull'
  value?: unknown
  parameterId?: string
}

export interface SortBinding {
  field: string
  direction: 'asc' | 'desc'
}

export interface ComponentDataConfigV2 {
  version: 2
  sourceKind: DataSourceKind
  datasetId: string
  dimensions: DimensionBinding[]
  measures: MeasureBinding[]
  filters: FilterBinding[]
  sort: SortBinding[]
  limit: number
}

export interface QueryResultField {
  name: string
  label?: string
  dataType: FieldDataType
}

export interface QueryResult {
  version: 1
  datasetId: string
  fields: QueryResultField[]
  rows: Array<Record<string, unknown>>
  rowCount: number
  durationMs?: number
}

export interface SeriesData {
  id: string
  name: string
  field: string
  chartType: MeasureChartType
  axis: AxisSide
  unit?: string
  labelConfig: SeriesLabelConfig
  values: number[]
}

export interface ComponentDataView {
  categories: string[]
  series: SeriesData[]
  columns: Array<{ field: string; label: string; role: 'dimension' | 'measure' }>
  rows: Array<Record<string, unknown>>
}
