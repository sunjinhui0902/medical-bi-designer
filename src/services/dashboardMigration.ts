import type {
  ComponentDataConfigV2,
  DimensionBinding,
  FilterBinding,
  MeasureBinding,
  SortBinding,
} from '../models/bi'
import type { DashboardComponent, DashboardModelV2 } from '../models/dashboard'

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function normalizeDimensions(value: unknown, legacyField: unknown): DimensionBinding[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord).map((item, index) => ({
      field: text(item.field),
      role: (item.role === 'series' || item.role === 'detail' ? item.role : index === 0 ? 'category' : 'series') as DimensionBinding['role'],
      ...(typeof item.alias === 'string' ? { alias: item.alias } : {}),
      ...(item.sort === 'asc' || item.sort === 'desc' || item.sort === 'none' ? { sort: item.sort as DimensionBinding['sort'] } : {}),
    })).filter((item) => item.field)
  }
  const field = text(legacyField)
  return field ? [{ field, role: 'category' }] : []
}

function normalizeMeasures(value: unknown, legacyField: unknown): MeasureBinding[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord).map((item) => ({
      field: text(item.field),
      aggregation: ['sum', 'avg', 'count', 'countDistinct', 'min', 'max', 'none'].includes(text(item.aggregation))
        ? text(item.aggregation) as MeasureBinding['aggregation']
        : 'sum',
      ...(typeof item.alias === 'string' ? { alias: item.alias } : {}),
      ...(typeof item.metricId === 'string' ? { metricId: item.metricId } : {}),
      ...(typeof item.unit === 'string' ? { unit: item.unit } : {}),
      ...(typeof item.format === 'string' ? { format: item.format } : {}),
      ...(item.chartType === 'bar' || item.chartType === 'line' || item.chartType === 'area' ? { chartType: item.chartType as MeasureBinding['chartType'] } : {}),
      ...(item.axis === 'right' ? { axis: 'right' as const } : { axis: 'left' as const }),
      labelConfig: (isRecord(item.labelConfig) ? {
        show: typeof item.labelConfig.show === 'boolean' ? item.labelConfig.show : false,
        showCategory: typeof item.labelConfig.showCategory === 'boolean' ? item.labelConfig.showCategory : false,
        showSeries: typeof item.labelConfig.showSeries === 'boolean' ? item.labelConfig.showSeries : false,
        mode: item.labelConfig.mode === 'percentage' || item.labelConfig.mode === 'both' ? item.labelConfig.mode : 'value',
        decimals: Math.max(0, Math.min(6, finiteNumber(item.labelConfig.decimals, 0))),
        position: item.labelConfig.position === 'inside' || item.labelConfig.position === 'outside' ? item.labelConfig.position : 'top',
        unit: text(item.labelConfig.unit, text(item.unit)),
        percentageBase: item.labelConfig.percentageBase === 'series' ? 'series' : 'category',
      } : { show: false, showCategory: false, showSeries: false, mode: 'value', decimals: 0, position: 'top', unit: text(item.unit), percentageBase: 'category' }) as MeasureBinding['labelConfig'],

    })).filter((item) => item.field)
  }
  const field = text(legacyField)
  return field ? [{ field, aggregation: 'sum', axis: 'left' }] : []
}

function normalizeFilters(value: unknown): FilterBinding[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).filter((item) => typeof item.field === 'string' && typeof item.operator === 'string') as unknown as FilterBinding[]
}

function normalizeSort(value: unknown): SortBinding[] {
  if (!Array.isArray(value)) return []
  return value.filter(isRecord).filter((item) => typeof item.field === 'string' && (item.direction === 'asc' || item.direction === 'desc')) as unknown as SortBinding[]
}

export function migrateDataConfig(value: unknown): ComponentDataConfigV2 {
  const source = isRecord(value) ? value : {}
  return {
    version: 2,
    sourceKind: source.sourceKind === 'server' ? 'server' : 'mock',
    datasetId: text(source.datasetId),
    dimensions: normalizeDimensions(source.dimensions, source.dimension),
    measures: normalizeMeasures(source.measures, source.field),
    filters: normalizeFilters(source.filters),
    sort: normalizeSort(source.sort),
    limit: Math.max(1, Math.min(10_000, Math.round(finiteNumber(source.limit, 200)))),
  }
}

function normalizeComponent(value: unknown, index: number): DashboardComponent {
  if (!isRecord(value)) throw new Error(`组件 ${index + 1} 格式无效`)
  const position = isRecord(value.position) ? value.position : {}
  const style = isRecord(value.styleConfig) ? value.styleConfig : {}
  const type = text(value.type, 'kpi') as DashboardComponent['type']
  const dataConfig = migrateDataConfig(value.dataConfig)
  const analysis = isRecord(value.analysisConfig) ? value.analysisConfig : {}
  const kpi = isRecord(value.kpiConfig) ? value.kpiConfig : {}
  const table = isRecord(value.tableConfig) ? value.tableConfig : {}
  const chartType = ['line', 'bar', 'pie', 'area', 'combo', 'scatter', 'bubble', 'outpatient', 'ranking'].includes(type)
  const kpiType = ['kpi', 'income', 'bed'].includes(type)
  const tableColumns = Array.isArray(table.columns)
    ? table.columns.filter(isRecord).map((column) => ({
        field: text(column.field),
        label: text(column.label, text(column.field)),
        width: Math.max(60, finiteNumber(column.width, 120)),
        format: ['number', 'percentage', 'date'].includes(text(column.format)) ? text(column.format) as 'number' | 'percentage' | 'date' : 'auto' as const,
        summary: ['sum', 'avg', 'count'].includes(text(column.summary)) ? text(column.summary) as 'sum' | 'avg' | 'count' : 'none' as const,
      })).filter((column) => column.field)
    : [...dataConfig.dimensions, ...dataConfig.measures].map((binding) => ({
        field: binding.field,
        label: binding.alias || binding.field,
        width: 120,
        format: 'auto' as const,
        summary: 'none' as const,
      }))
  return {
    id: text(value.id, `component_${index + 1}`),
    type,
    title: text(value.title, '未命名组件'),
    position: {
      x: finiteNumber(position.x, 0),
      y: finiteNumber(position.y, 0),
      width: finiteNumber(position.width, 240),
      height: finiteNumber(position.height, 160),
      zIndex: finiteNumber(position.zIndex, 1),
    },
    dataConfig,
    styleConfig: {
      background: text(style.background, '#ffffff'),
      titleColor: text(style.titleColor, '#243447'),
      titleSize: finiteNumber(style.titleSize, 10),
      titleWeight: finiteNumber(style.titleWeight, 650),
      titleVisible: typeof style.titleVisible === 'boolean' ? style.titleVisible : true,
    },
    ...(chartType ? {
      analysisConfig: {
        xMin: null,
        xMax: null,
        yLeftMin: null,
        yLeftMax: null,
        yRightMin: null,
        yRightMax: null,
        showLabels: false,
        labelDecimals: 0,
        labelPosition: 'top' as const,
        labelMode: 'value' as const,
        labelShowCategory: false,
        labelShowSeries: false,
        labelUnit: '',
        percentageBase: 'category' as const,
        leftAxisTitle: '',
        leftAxisUnit: '',
        leftAxisColor: '#64748b',
        rightAxisTitle: '',
        rightAxisUnit: '',
        rightAxisColor: '#64748b',
        legendVisible: true,
        legendPosition: 'bottom' as const,
        warningLines: [],
        ...analysis,
      },
    } : {}),
    ...(kpiType ? {
      kpiConfig: {
        primaryMeasureField: text(kpi.primaryMeasureField, dataConfig.measures[0]?.field || ''),
        unit: text(kpi.unit),
        decimals: Math.max(0, Math.min(6, finiteNumber(kpi.decimals, 0))),
        useGrouping: typeof kpi.useGrouping === 'boolean' ? kpi.useGrouping : true,
        yoyField: text(kpi.yoyField, kpi.comparisonType === 'yoy' ? text(kpi.comparisonField) : ''),
        momField: text(kpi.momField, kpi.comparisonType === 'mom' ? text(kpi.comparisonField) : ''),
        positiveColor: text(kpi.positiveColor, '#2f9e44'),
        negativeColor: text(kpi.negativeColor, '#d9485f'),
        targetMode: kpi.targetMode === 'field' ? 'field' as const : 'fixed' as const,
        targetValue: finiteNumber(kpi.targetValue, 0),
        targetField: text(kpi.targetField),
        showProgress: typeof kpi.showProgress === 'boolean' ? kpi.showProgress : false,
        progressColor: text(kpi.progressColor, '#1477c9'),
      },
    } : {}),
    ...(type === 'table' ? {
      tableConfig: {
        columns: tableColumns,
        striped: typeof table.striped === 'boolean' ? table.striped : true,
        showHeader: typeof table.showHeader === 'boolean' ? table.showHeader : true,
      },
    } : {}),
  }
}

export function migrateDashboard(value: unknown): DashboardModelV2 {
  if (!isRecord(value) || typeof value.name !== 'string' || !isRecord(value.canvas) || !Array.isArray(value.components)) {
    throw new Error('看板 JSON 缺少 name、canvas 或 components')
  }
  const canvas = value.canvas
  const title = isRecord(value.titleStyle) ? value.titleStyle : {}
  return {
    version: 2,
    name: value.name,
    canvas: {
      width: finiteNumber(canvas.width, 1200),
      height: finiteNumber(canvas.height, 600),
      background: text(canvas.background, '#f7f9fb'),
      showGrid: typeof canvas.showGrid === 'boolean' ? canvas.showGrid : true,
      gridSize: finiteNumber(canvas.gridSize, 12),
    },
    titleStyle: {
      show: typeof title.show === 'boolean' ? title.show : true,
      fontSize: finiteNumber(title.fontSize, 24),
      color: text(title.color, '#243447'),
      fontWeight: finiteNumber(title.fontWeight, 700),
      align: title.align === 'center' || title.align === 'right' ? title.align : 'left',
    },
    components: value.components.map(normalizeComponent),
  }
}
