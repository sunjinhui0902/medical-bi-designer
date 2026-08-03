import type { ComponentDataConfig } from './bi'

export type ComponentType = 'kpi' | 'line' | 'bar' | 'pie' | 'table' | 'text' | 'income' | 'outpatient' | 'ranking' | 'bed' | 'area' | 'combo' | 'scatter' | 'bubble'

export interface Position {
  x: number
  y: number
  width: number
  height: number
  zIndex: number
}

export interface ComponentStyle {
  background: string
  titleColor: string
  titleSize: number
  titleWeight: number
  titleVisible: boolean
}

export interface AnalysisConfig {
  xMin: number | null
  xMax: number | null
  yLeftMin: number | null
  yLeftMax: number | null
  yRightMin: number | null
  yRightMax: number | null
  showLabels: boolean
  labelDecimals: number
  labelPosition: 'top' | 'inside' | 'outside'
  labelMode: 'value' | 'percentage' | 'both'
  labelShowCategory: boolean
  labelShowSeries: boolean
  labelUnit: string
  percentageBase: 'category' | 'series'
  percentageDenominatorField?: string
  leftAxisTitle: string
  leftAxisUnit: string
  leftAxisColor: string
  rightAxisTitle: string
  rightAxisUnit: string
  rightAxisColor: string
  legendVisible: boolean
  legendPosition: 'top' | 'left' | 'right' | 'bottom'
  warningLines: Array<{
    id: string
    value: number
    label: string
    color: string
    axis: 'x' | 'y'
    source: 'fixed' | 'average' | 'min' | 'max' | 'median' | 'percentile' | 'measure' | 'target'
    measureField?: string
    percentile?: number
    axisSide?: 'left' | 'right'
    lineStyle?: 'solid' | 'dashed' | 'dotted'
  }>
}

export interface KpiConfig {
  primaryMeasureField: string
  unit: string
  decimals: number
  useGrouping: boolean
  yoyField: string
  momField: string
  positiveColor: string
  negativeColor: string
  targetMode: 'fixed' | 'field'
  targetValue: number
  targetField: string
  showProgress: boolean
  progressColor: string
}

export type TableColumnFormat = 'auto' | 'number' | 'percentage' | 'date'
export type TableColumnSummary = 'none' | 'sum' | 'avg' | 'count'

export interface TableColumnConfig {
  field: string
  label: string
  width: number
  format: TableColumnFormat
  summary: TableColumnSummary
}

export interface TableConfig {
  columns: TableColumnConfig[]
  striped: boolean
  showHeader: boolean
}

export interface DashboardComponent {
  id: string
  type: ComponentType
  title: string
  position: Position
  dataConfig: ComponentDataConfig
  styleConfig: ComponentStyle
  analysisConfig?: AnalysisConfig
  kpiConfig?: KpiConfig
  tableConfig?: TableConfig
}

export interface CanvasConfig {
  width: number
  height: number
  background: string
  showGrid: boolean
  gridSize: number
}

export interface DashboardTitleStyle {
  show: boolean
  fontSize: number
  color: string
  fontWeight: number
  align: 'left' | 'center' | 'right'
}

export interface DashboardModelV2 {
  version: 2
  name: string
  canvas: CanvasConfig
  titleStyle: DashboardTitleStyle
  components: DashboardComponent[]
}
