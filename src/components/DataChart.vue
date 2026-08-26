<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { ChartEventPayloadV3, SeriesData } from '../models/bi'
import type { AnalysisConfig } from '../models/dashboard'
import { bubblePoints, calculateWarningValue, percentageDenominator } from '../services/chartAnalysis'

const props = defineProps<{
  kind: 'line' | 'bar' | 'pie' | 'area' | 'combo' | 'scatter' | 'bubble'
  categories: string[]
  series: SeriesData[]
  analysis: AnalysisConfig
}>()
const emit = defineEmits<{ action: [payload: ChartEventPayloadV3]; doubleAction: [payload: ChartEventPayloadV3] }>()

const chartElement = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | undefined
let observer: ResizeObserver | undefined
let clickTimer: number | undefined
const colors = ['#1477c9', '#26a69a', '#f59f00', '#8657bd', '#e76f51', '#4c6ef5', '#2f9e44']

function chartVisual() {
  const panel = chartElement.value?.closest<HTMLElement>('.interactive-canvas')
  const background = panel ? getComputedStyle(panel).getPropertyValue('--theme-panel').trim() : ''
  const channels = background.match(/[0-9a-f]{2}/gi)?.slice(0, 3).map((value) => Number.parseInt(value, 16)) ?? []
  const dark = channels.length === 3 && channels.reduce((sum, value) => sum + value, 0) / 3 < 110
  return {
    dark,
    text: dark ? '#9db2c2' : '#64748b',
    grid: dark ? 'rgba(157,178,194,.14)' : '#edf1f5',
    tooltipBackground: dark ? 'rgba(5,15,28,.96)' : '#ffffff',
    tooltipBorder: dark ? '#285775' : '#dbe5ec',
    palette: dark ? ['#2fb8f2','#28c3ae','#f2b94b','#8b9df5','#ef6a74','#64d8ff','#47c39c'] : colors,
  }
}

function markLine(axisSide: 'left' | 'right' = 'left', includeX = false) {
  const lines = props.analysis.warningLines.filter((line) => line.source !== 'target' && (
    line.axis === 'x' ? includeX : (line.axisSide || 'left') === axisSide
  ))
  if (!lines.length) return undefined
  return {
    symbol: 'none',
    data: lines.map((line) => {
      const fallbackSeries = line.axis === 'x' ? props.series[0] : props.series[1] ?? props.series[0]
      const selected = line.measureField ? props.series : fallbackSeries ? [fallbackSeries] : []
      const axisValue = calculateWarningValue(line, selected)
      return {
        ...(line.axis === 'x' ? { xAxis: axisValue } : { yAxis: axisValue }),
        name: line.label,
        lineStyle: { color: line.color, type: line.lineStyle || 'dashed' },
        label: { formatter: line.label },
      }
    }),
  }
}

function labelConfig(seriesIndex = 0, position = props.analysis.labelPosition, pieTotal?: number) {
  const perSeries = props.series[seriesIndex]?.labelConfig
  const separate = props.kind === 'combo' || props.series.length > 1
  const config = separate && perSeries ? perSeries : {
    show: props.analysis.showLabels,
    showCategory: props.analysis.labelShowCategory,
    showSeries: props.analysis.labelShowSeries,
    mode: props.analysis.labelMode,
    decimals: props.analysis.labelDecimals,
    position,
    unit: props.analysis.labelUnit,
    percentageBase: props.analysis.percentageBase,
  }
  return {
    show: config.show,
    position: config.position || position,
    formatter: (params: unknown) => {
      const context = params as { value?: unknown; dataIndex?: number; seriesIndex?: number }
      const dataIndex = context.dataIndex ?? 0
      const rawValue = context.value
      const value = Number(Array.isArray(rawValue) ? rawValue[1] : rawValue) || 0
      const valueText = value.toFixed(config.decimals)
      const denominator = pieTotal ?? percentageDenominator(props.series, seriesIndex, dataIndex, config.percentageBase || 'category', props.analysis.percentageDenominatorField)
      const percentageText = denominator ? `${(value / denominator * 100).toFixed(config.decimals)}%` : '0%'
      const unit = config.unit || props.series[seriesIndex]?.unit || ''
      const formattedValue = `${valueText}${unit}`
      const shownValue = config.mode === 'percentage' ? percentageText : config.mode === 'both' ? `${formattedValue} / ${percentageText}` : formattedValue
      return [
        config.showCategory ? props.categories[dataIndex] : '',
        config.showSeries ? props.series[seriesIndex]?.name : '',
        shownValue,
      ].filter(Boolean).join(' · ')
    },
  }
}

function legendOption() {
  const position = props.analysis.legendPosition || 'bottom'
  const visual = chartVisual()
  if (!props.analysis.legendVisible) return { show: false }
  const shared = { show: true, type: 'scroll' as const, textStyle: { color: visual.text, fontSize: 10 }, pageTextStyle: { color: visual.text } }
  if (position === 'top') return { ...shared, top: 0, left: 'center' }
  if (position === 'left') return { ...shared, orient: 'vertical' as const, left: 0, top: 'middle' }
  if (position === 'right') return { ...shared, orient: 'vertical' as const, right: 0, top: 'middle' }
  return { ...shared, bottom: 0, left: 'center' }
}

function bubbleMetricText(seriesIndex: number, dataIndex: number, value: number) {
  const series = props.series[seriesIndex]
  if (!series) return ''
  const config = series.labelConfig
  const decimals = config?.decimals ?? props.analysis.labelDecimals
  const unit = config?.unit || series.unit || ''
  const raw = `${value.toFixed(decimals)}${unit}`
  const denominator = percentageDenominator(props.series, seriesIndex, dataIndex, config?.percentageBase || 'series')
  const percentage = denominator ? `${(value / denominator * 100).toFixed(decimals)}%` : '0%'
  const shown = config?.mode === 'percentage' ? percentage : config?.mode === 'both' ? `${raw} / ${percentage}` : raw
  return `${series.name}：${shown}`
}

function bubbleLabelConfig() {
  return {
    show: props.analysis.showLabels,
    position: props.analysis.labelPosition,
    formatter: (params: unknown) => {
      const context = params as { value?: unknown; dataIndex?: number }
      const values = Array.isArray(context.value) ? context.value : []
      const dataIndex = context.dataIndex ?? 0
      return [
        props.analysis.labelShowCategory ? String(values[3] ?? props.categories[dataIndex] ?? '') : '',
        props.series[0]?.labelConfig?.show ? bubbleMetricText(0, dataIndex, Number(values[0]) || 0) : '',
        props.series[1]?.labelConfig?.show ? bubbleMetricText(1, dataIndex, Number(values[1]) || 0) : '',
        props.series[2]?.labelConfig?.show ? bubbleMetricText(2, dataIndex, Number(values[2]) || 0) : '',
      ].filter(Boolean).join(' · ')
    },
  }
}

function bubbleTooltip(params: unknown) {
  const context = params as { value?: unknown; dataIndex?: number }
  const values = Array.isArray(context.value) ? context.value : []
  const dataIndex = context.dataIndex ?? 0
  return [
    String(values[3] ?? props.categories[dataIndex] ?? ''),
    bubbleMetricText(0, dataIndex, Number(values[0]) || 0),
    bubbleMetricText(1, dataIndex, Number(values[1]) || 0),
    bubbleMetricText(2, dataIndex, Number(values[2]) || 0),
  ].filter(Boolean).join('<br/>')
}

function option(): echarts.EChartsOption {
  const first = props.series[0]
  const visual = chartVisual()
  const tooltip = { backgroundColor: visual.tooltipBackground, borderColor: visual.tooltipBorder, textStyle: { color: visual.dark ? '#f1f7fb' : '#243447' } }
  if (props.kind === 'pie') {
    return {
      tooltip: { trigger: 'item', ...tooltip }, legend: legendOption(),
      series: [{ type: 'pie', radius: ['42%', '68%'], center: ['50%', '46%'], label: labelConfig(0, 'outside', first?.values.reduce((sum, value) => sum + value, 0)),
        labelLine: { lineStyle: { color: visual.text } }, data: props.categories.map((name, index) => ({ name, value: first?.values[index] ?? 0 })), color: visual.palette }],
    }
  }

  if (props.kind === 'scatter' || props.kind === 'bubble') {
    const points = bubblePoints(props.categories, props.series)
    return {
      tooltip: { trigger: 'item', formatter: bubbleTooltip, ...tooltip },
      legend: legendOption(),
      grid: { left: 64, right: 24, top: props.analysis.legendPosition === 'top' && props.analysis.legendVisible ? 42 : 20, bottom: props.analysis.legendPosition === 'bottom' && props.analysis.legendVisible ? 48 : 38, containLabel: true },
      xAxis: { type: 'value', name: [props.analysis.leftAxisTitle, props.analysis.leftAxisUnit].filter(Boolean).join(' '), nameLocation: 'middle', nameGap: 26, min: props.analysis.xMin ?? undefined, max: props.analysis.xMax ?? undefined, axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [6, 9], lineStyle: { color: props.analysis.leftAxisColor || '#64748b' } }, axisLabel: { formatter: `{value}${props.analysis.leftAxisUnit || ''}` } },
      yAxis: { type: 'value', name: [props.analysis.rightAxisTitle, props.analysis.rightAxisUnit].filter(Boolean).join(' '), nameLocation: 'middle', nameRotate: 90, nameGap: 50, min: props.analysis.yLeftMin ?? undefined, max: props.analysis.yLeftMax ?? undefined, axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [6, 9], lineStyle: { color: props.analysis.leftAxisColor || '#64748b' } }, axisLabel: { color: props.analysis.leftAxisColor || '#64748b', formatter: `{value}${props.analysis.rightAxisUnit || ''}` } },
      series: [{ type: 'scatter', data: points,
        symbolSize: (value: number[]) => props.kind === 'bubble' ? Math.max(8, Math.min(48, Number(value[2]) || 8)) : 12,
        label: bubbleLabelConfig(), itemStyle: { color: visual.palette[0] }, markLine: markLine('left', true) }] as unknown as echarts.SeriesOption[],
    }
  }

  const targetLines = props.analysis.warningLines.filter((line) => line.axis === 'y' && line.source === 'target' && line.measureField)
  const targetFields = new Set(targetLines.map((line) => line.measureField))
  const visibleSeries = props.series.filter((item) => !targetFields.has(item.field))
  const firstLeftIndex = visibleSeries.findIndex((item) => item.axis !== 'right')
  const firstRightIndex = visibleSeries.findIndex((item) => item.axis === 'right')
  const axisSeries = visibleSeries.map((item, index) => {
    const requestedType = props.kind === 'combo' ? item.chartType : props.kind
    const type = requestedType === 'bar' ? 'bar' : 'line'
    return {
      id: item.id, name: item.name, type,
      yAxisIndex: item.axis === 'right' ? 1 : 0,
      data: item.values,
      smooth: type === 'line',
      areaStyle: requestedType === 'area' ? { opacity: .12 } : undefined,
      label: labelConfig(props.series.findIndex((series) => series.id === item.id), type === 'bar' ? 'top' : 'top'),
      itemStyle: { color: visual.palette[index % visual.palette.length] },
      lineStyle: { width: 2.2, color: visual.palette[index % visual.palette.length] },
      barMaxWidth: 28,
      markLine: index === (item.axis === 'right' ? firstRightIndex : firstLeftIndex) ? markLine(item.axis === 'right' ? 'right' : 'left') : undefined,
    }
  })
  const targetSeries = targetLines.flatMap((line) => props.series.filter((item) => item.field === line.measureField).map((item) => ({
    id: `target::${line.id}::${item.id}`, name: line.label || item.name, type: 'line' as const,
    yAxisIndex: line.axisSide === 'right' ? 1 : 0, data: item.values, symbol: 'none',
    lineStyle: { color: line.color, type: line.lineStyle || 'dashed', width: 2 },
    itemStyle: { color: line.color },
  })))
  return {
    color: visual.palette, tooltip: { trigger: 'axis', ...tooltip }, legend: legendOption(),
    grid: { left: props.analysis.legendPosition === 'left' && props.analysis.legendVisible ? 88 : 24, right: props.analysis.legendPosition === 'right' && props.analysis.legendVisible ? 88 : 24, top: props.analysis.legendPosition === 'top' && props.analysis.legendVisible ? 42 : 28, bottom: props.analysis.legendPosition === 'bottom' && props.analysis.legendVisible ? 46 : 30, containLabel: true },
    xAxis: { type: 'category', data: props.categories, min: props.analysis.xMin ?? undefined, max: props.analysis.xMax ?? undefined,
      axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [6, 9], lineStyle: { color: props.analysis.leftAxisColor || visual.text } }, axisTick: { show: false }, axisLabel: { color: visual.text, fontSize: 9 } },
    yAxis: [
      { type: 'value', name: [props.analysis.leftAxisTitle, props.analysis.leftAxisUnit].filter(Boolean).join(' '), min: props.analysis.yLeftMin ?? undefined, max: props.analysis.yLeftMax ?? undefined, axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [6, 9], lineStyle: { color: props.analysis.leftAxisColor || visual.text } }, axisLabel: { color: props.analysis.leftAxisColor || visual.text, formatter: `{value}${props.analysis.leftAxisUnit || ''}` }, splitLine: { lineStyle: { color: visual.grid } } },
      { type: 'value', name: [props.analysis.rightAxisTitle, props.analysis.rightAxisUnit].filter(Boolean).join(' '), min: props.analysis.yRightMin ?? undefined, max: props.analysis.yRightMax ?? undefined, axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [6, 9], lineStyle: { color: props.analysis.leftAxisColor || '#64748b' } }, axisLabel: { color: props.analysis.leftAxisColor || '#64748b', formatter: `{value}${props.analysis.rightAxisUnit || ''}` }, splitLine: { show: false } },
    ],
    series: [...axisSeries, ...targetSeries] as echarts.SeriesOption[],
  }
}

function render() {
  if (!chart) return
  chart.clear()
  chart.setOption(option(), true)
}

function chartPayload(raw: unknown): ChartEventPayloadV3 | null {
  const event = raw as { dataIndex?: number; seriesIndex?: number; value?: unknown; name?: unknown }
  const dataIndex = Number(event.dataIndex)
  const seriesIndex = Number(event.seriesIndex)
  if (!Number.isInteger(dataIndex) || !Number.isInteger(seriesIndex)) return null
  const series = props.series[seriesIndex] ?? props.series[0]
  if (!series) return null
  const rawValue = Array.isArray(event.value)
    ? (props.kind === 'scatter' || props.kind === 'bubble' ? event.value[1] : event.value[0])
    : event.value
  return {
    dataIndex,
    seriesIndex,
    category: String(event.name ?? props.categories[dataIndex] ?? ''),
    ...(series.seriesValue === undefined ? {} : { seriesValue: series.seriesValue }),
    measureField: series.field,
    measureName: series.name,
    value: Number(rawValue) || 0,
  }
}

function handleChartClick(raw: unknown) {
  const payload = chartPayload(raw)
  if (!payload) return
  if (clickTimer !== undefined) window.clearTimeout(clickTimer)
  clickTimer = window.setTimeout(() => { clickTimer = undefined; emit('action', payload) }, 220)
}

function handleChartDoubleClick(raw: unknown) {
  const payload = chartPayload(raw)
  if (!payload) return
  if (clickTimer !== undefined) window.clearTimeout(clickTimer)
  clickTimer = undefined
  emit('doubleAction', payload)
}

const renderKey = computed(() => JSON.stringify({
  kind: props.kind,
  categories: props.categories,
  series: props.series,
  analysis: props.analysis,
}))

onMounted(() => {
  if (!chartElement.value) return
  chart = echarts.init(chartElement.value)
  chart.on('click', handleChartClick)
  chart.on('dblclick', handleChartDoubleClick)
  render()
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(chartElement.value)
})

watch(renderKey, render)
onBeforeUnmount(() => { if (clickTimer !== undefined) window.clearTimeout(clickTimer); observer?.disconnect(); chart?.dispose() })
</script>

<template><div ref="chartElement" class="data-echart" :aria-label="`${kind} 多系列数据图表`" @click.stop @dblclick.stop></div></template>
<style scoped>.data-echart{width:100%;height:100%;min-height:0}</style>
