import type { ComponentDataConfig } from './bi'

export type ComponentType = 'kpi' | 'line' | 'bar' | 'pie' | 'table' | 'text' | 'image' | 'icon' | 'decoration' | 'map' | 'tabs' | 'income' | 'outpatient' | 'ranking' | 'bed' | 'area' | 'combo' | 'scatter' | 'bubble'

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
  borderColor?: string
  borderWidth?: number
  borderRadius?: number
  shadow?: string
  opacity?: number
}

export interface TextConfig {
  content: string
  color: string
  fontSize: number
  fontWeight: number
  align: 'left' | 'center' | 'right'
  verticalAlign: 'top' | 'center' | 'bottom'
  lineHeight: number
}

export interface ImageConfig {
  /** Only locally imported data URLs are accepted by the editor/runtime. */
  source: string
  alt: string
  objectFit: 'contain' | 'cover' | 'fill'
  opacity: number
}

export type SafeIconName = 'hospital' | 'activity' | 'warning' | 'check' | 'location' | 'users'
export interface IconConfig { name: SafeIconName; color: string; size: number; strokeWidth: number }

export interface DecorationConfig {
  shape: 'rectangle' | 'line' | 'divider'
  fill: string
  borderColor: string
  borderWidth: number
  borderRadius: number
  direction: 'horizontal' | 'vertical'
}

export interface GeoJsonGeometry {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: number[][][] | number[][][][]
}

export interface GeoJsonFeature {
  type: 'Feature'
  properties: Record<string, string | number | boolean | null>
  geometry: GeoJsonGeometry
}

export interface GeoJsonFeatureCollection {
  type: 'FeatureCollection'
  features: GeoJsonFeature[]
}

export interface MapConfig {
  geoJson?: GeoJsonFeatureCollection
  regionCodeProperty: string
  regionNameProperty: string
  regionCodeField: string
  valueField: string
  longitudeField: string
  latitudeField: string
  pointLabelField: string
  emptyColor: string
  lowColor: string
  highColor: string
  borderColor: string
  pointColor: string
  showLegend: boolean
  showPoints: boolean
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

export type TableRuleOperator = 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'between' | 'isNull' | 'notNull'

export interface TableConditionalRuleConfig {
  id: string
  field: string
  operator: TableRuleOperator
  value?: unknown
  backgroundColor?: string
  textColor?: string
  badge?: 'normal' | 'warning' | 'danger'
}

export interface TablePaginationConfig {
  enabled: boolean
  mode: 'client' | 'server'
  pageSize: number
  showTotal: boolean
}

export interface TableConfig {
  columns: TableColumnConfig[]
  striped: boolean
  showHeader: boolean
  fixedHeader?: boolean
  pagination?: TablePaginationConfig
  conditionalRules?: TableConditionalRuleConfig[]
}

export interface TabItemConfig {
  id: string
  label: string
  value: string
  componentIds: string[]
  visible: boolean
  padding: number
  gap: number
  background: string
}

export interface TabsConfig {
  items: TabItemConfig[]
  activeItemId: string
  alignment: 'left' | 'center' | 'stretch'
  titlePosition: 'top' | 'bottom' | 'left' | 'right'
  stylePreset: 'default' | 'card' | 'bookmark' | 'menu'
  titleSize: number
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
  tabsConfig?: TabsConfig
  textConfig?: TextConfig
  imageConfig?: ImageConfig
  iconConfig?: IconConfig
  decorationConfig?: DecorationConfig
  mapConfig?: MapConfig
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
