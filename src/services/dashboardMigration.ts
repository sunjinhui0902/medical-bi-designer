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
  const tabs = isRecord(value.tabsConfig) ? value.tabsConfig : {}
  const textConfig = isRecord(value.textConfig) ? value.textConfig : {}
  const imageConfig = isRecord(value.imageConfig) ? value.imageConfig : {}
  const iconConfig = isRecord(value.iconConfig) ? value.iconConfig : {}
  const decorationConfig = isRecord(value.decorationConfig) ? value.decorationConfig : {}
  const mapConfig = isRecord(value.mapConfig) ? value.mapConfig : {}
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
  const tableRules = Array.isArray(table.conditionalRules)
    ? table.conditionalRules.filter(isRecord).map((rule, ruleIndex) => ({
        id: text(rule.id, `table_rule_${ruleIndex + 1}`),
        field: text(rule.field),
        operator: ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'contains', 'in', 'between', 'isNull', 'notNull'].includes(text(rule.operator))
          ? text(rule.operator) as 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'in' | 'between' | 'isNull' | 'notNull'
          : 'eq' as const,
        ...(rule.value === undefined ? {} : { value: rule.value }),
        ...(typeof rule.backgroundColor === 'string' ? { backgroundColor: rule.backgroundColor } : {}),
        ...(typeof rule.textColor === 'string' ? { textColor: rule.textColor } : {}),
        ...(['normal', 'warning', 'danger'].includes(text(rule.badge)) ? { badge: text(rule.badge) as 'normal' | 'warning' | 'danger' } : {}),
      })).filter((rule) => rule.field)
    : []
  const tabItems = Array.isArray(tabs.items)
      ? tabs.items.filter(isRecord).map((item, itemIndex) => ({
          id: text(item.id, `tab_${itemIndex + 1}`),
          label: text(item.label, `页签 ${itemIndex + 1}`),
          value: text(item.value, `tab_${itemIndex + 1}`),
          componentIds: Array.isArray(item.componentIds) ? item.componentIds.filter((id): id is string => typeof id === 'string' && Boolean(id.trim())) : [],
          visible: typeof item.visible === 'boolean' ? item.visible : true,
          padding: Math.max(0, Math.min(48, finiteNumber(item.padding, 12))),
          gap: Math.max(0, Math.min(48, finiteNumber(item.gap, 8))),
          background: text(item.background, '#ffffff'),
        }))
    : []
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
      borderColor: text(style.borderColor, '#e1e7ec'),
      borderWidth: Math.max(0, Math.min(12, finiteNumber(style.borderWidth, 1))),
      borderRadius: Math.max(0, Math.min(80, finiteNumber(style.borderRadius, 7))),
      shadow: text(style.shadow),
      opacity: Math.max(0, Math.min(1, finiteNumber(style.opacity, 1))),
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
        fixedHeader: typeof table.fixedHeader === 'boolean' ? table.fixedHeader : true,
        pagination: {
          enabled: isRecord(table.pagination) && typeof table.pagination.enabled === 'boolean' ? table.pagination.enabled : true,
          mode: isRecord(table.pagination) && table.pagination.mode === 'server' ? 'server' : 'client',
          pageSize: isRecord(table.pagination) ? Math.max(1, Math.min(200, Math.round(finiteNumber(table.pagination.pageSize, 20)))) : 20,
          showTotal: isRecord(table.pagination) && typeof table.pagination.showTotal === 'boolean' ? table.pagination.showTotal : true,
        },
        conditionalRules: tableRules,
      },
    } : {}),
    ...(type === 'tabs' ? {
      tabsConfig: {
        items: tabItems.length ? tabItems : [{ id: 'tab_1', label: '页签 1', value: 'tab_1', componentIds: [], visible: true, padding: 12, gap: 8, background: '#ffffff' }],
        activeItemId: text(tabs.activeItemId, tabItems[0]?.id || 'tab_1'),
        alignment: tabs.alignment === 'center' || tabs.alignment === 'stretch' ? tabs.alignment : 'left',
        titlePosition: ['bottom', 'left', 'right'].includes(text(tabs.titlePosition)) ? text(tabs.titlePosition) as 'bottom' | 'left' | 'right' : 'top',
        stylePreset: ['card', 'bookmark', 'menu'].includes(text(tabs.stylePreset)) ? text(tabs.stylePreset) as 'card' | 'bookmark' | 'menu' : 'default',
        titleSize: Math.max(24, Math.min(96, finiteNumber(tabs.titleSize, 38))),
      },
    } : {}),
    ...(type === 'text' ? { textConfig: {
      content: text(textConfig.content, '请输入文本内容'), color: text(textConfig.color, '#243447'),
      fontSize: Math.max(8, Math.min(120, finiteNumber(textConfig.fontSize, 16))),
      fontWeight: Math.max(100, Math.min(900, finiteNumber(textConfig.fontWeight, 400))),
      align: textConfig.align === 'center' || textConfig.align === 'right' ? textConfig.align : 'left',
      verticalAlign: textConfig.verticalAlign === 'center' || textConfig.verticalAlign === 'bottom' ? textConfig.verticalAlign : 'top',
      lineHeight: Math.max(1, Math.min(3, finiteNumber(textConfig.lineHeight, 1.5))),
    } } : {}),
    ...(type === 'image' ? { imageConfig: {
      source: text(imageConfig.source), alt: text(imageConfig.alt, '本地图片'),
      objectFit: imageConfig.objectFit === 'cover' || imageConfig.objectFit === 'fill' ? imageConfig.objectFit : 'contain',
      opacity: Math.max(0, Math.min(1, finiteNumber(imageConfig.opacity, 1))),
    } } : {}),
    ...(type === 'icon' ? { iconConfig: {
      name: ['hospital', 'warning', 'check', 'location', 'users'].includes(text(iconConfig.name)) ? text(iconConfig.name) as 'hospital' | 'warning' | 'check' | 'location' | 'users' : 'activity',
      color: text(iconConfig.color, '#1477c9'), size: Math.max(12, Math.min(256, finiteNumber(iconConfig.size, 56))),
      strokeWidth: Math.max(1, Math.min(4, finiteNumber(iconConfig.strokeWidth, 2))),
    } } : {}),
    ...(type === 'decoration' ? { decorationConfig: {
      shape: decorationConfig.shape === 'line' || decorationConfig.shape === 'divider' ? decorationConfig.shape : 'rectangle',
      fill: text(decorationConfig.fill, 'transparent'), borderColor: text(decorationConfig.borderColor, '#1477c9'),
      borderWidth: Math.max(0, Math.min(20, finiteNumber(decorationConfig.borderWidth, 1))),
      borderRadius: Math.max(0, Math.min(100, finiteNumber(decorationConfig.borderRadius, 0))),
      direction: decorationConfig.direction === 'vertical' ? 'vertical' : 'horizontal',
    } } : {}),
    ...(type === 'map' ? { mapConfig: {
      ...(isRecord(mapConfig.geoJson) ? { geoJson: mapConfig.geoJson as never } : {}),
      regionCodeProperty: text(mapConfig.regionCodeProperty, 'code'), regionNameProperty: text(mapConfig.regionNameProperty, 'name'),
      regionCodeField: text(mapConfig.regionCodeField, 'region_code'), valueField: text(mapConfig.valueField, 'value'),
      longitudeField: text(mapConfig.longitudeField, 'longitude'), latitudeField: text(mapConfig.latitudeField, 'latitude'), pointLabelField: text(mapConfig.pointLabelField, 'institution_name'),
      emptyColor: text(mapConfig.emptyColor, '#dbeafe'), lowColor: text(mapConfig.lowColor, '#60a5fa'), highColor: text(mapConfig.highColor, '#1d4ed8'),
      borderColor: text(mapConfig.borderColor, '#ffffff'), pointColor: text(mapConfig.pointColor, '#f43f5e'),
      showLegend: typeof mapConfig.showLegend === 'boolean' ? mapConfig.showLegend : true,
      showPoints: typeof mapConfig.showPoints === 'boolean' ? mapConfig.showPoints : true,
    } } : {}),
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
