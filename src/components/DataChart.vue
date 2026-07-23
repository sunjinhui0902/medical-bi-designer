<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'
import type { SeriesData } from '../models/bi'
import type { AnalysisConfig } from '../models/dashboard'
import { bubblePoints, calculateWarningValue, percentageDenominator } from '../services/chartAnalysis'

const props = defineProps<{
  kind: 'line' | 'bar' | 'pie' | 'area' | 'combo' | 'scatter' | 'bubble'
  categories: string[]
  series: SeriesData[]
  analysis: AnalysisConfig
}>()

const chartElement = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | undefined
let observer: ResizeObserver | undefined
const colors = ['#1477c9', '#26a69a', '#f59f00', '#8657bd', '#e76f51', '#4c6ef5', '#2f9e44']

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
  if (!props.analysis.legendVisible) return { show: false }
  if (position === 'top') return { show: true, type: 'scroll' as const, top: 0, left: 'center' }
  if (position === 'left') return { show: true, type: 'scroll' as const, orient: 'vertical' as const, left: 0, top: 'middle' }
  if (position === 'right') return { show: true, type: 'scroll' as const, orient: 'vertical' as const, right: 0, top: 'middle' }
  return { show: true, type: 'scroll' as const, bottom: 0, left: 'center' }
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
  if (props.kind === 'pie') {
    return {
      tooltip: { trigger: 'item' }, legend: legendOption(),
      series: [{ type: 'pie', radius: ['42%', '68%'], center: ['50%', '46%'], label: labelConfig(0, 'outside', first?.values.reduce((sum, value) => sum + value, 0)),
        data: props.categories.map((name, index) => ({ name, value: first?.values[index] ?? 0 })), color: colors }],
    }
  }

  if (props.kind === 'scatter' || props.kind === 'bubble') {
    const points = bubblePoints(props.categories, props.series)
    return {
      tooltip: { trigger: 'item', formatter: bubbleTooltip },
      legend: legendOption(),
      grid: { left: 64, right: 24, top: props.analysis.legendPosition === 'top' && props.analysis.legendVisible ? 42 : 20, bottom: props.analysis.legendPosition === 'bottom' && props.analysis.legendVisible ? 48 : 38, containLabel: true },
      xAxis: { type: 'value', name: [props.analysis.leftAxisTitle, props.analysis.leftAxisUnit].filter(Boolean).join(' '), nameLocation: 'middle', nameGap: 26, min: props.analysis.xMin ?? undefined, max: props.analysis.xMax ?? undefined, axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [6, 9], lineStyle: { color: props.analysis.leftAxisColor || '#64748b' } }, axisLabel: { formatter: `{value}${props.analysis.leftAxisUnit || ''}` } },
      yAxis: { type: 'value', name: [props.analysis.rightAxisTitle, props.analysis.rightAxisUnit].filter(Boolean).join(' '), nameLocation: 'middle', nameRotate: 90, nameGap: 50, min: props.analysis.yLeftMin ?? undefined, max: props.analysis.yLeftMax ?? undefined, axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [6, 9], lineStyle: { color: props.analysis.leftAxisColor || '#64748b' } }, axisLabel: { color: props.analysis.leftAxisColor || '#64748b', formatter: `{value}${props.analysis.rightAxisUnit || ''}` } },
      series: [{ type: 'scatter', data: points,
        symbolSize: (value: number[]) => props.kind === 'bubble' ? Math.max(8, Math.min(48, Number(value[2]) || 8)) : 12,
        label: bubbleLabelConfig(), itemStyle: { color: colors[0] }, markLine: markLine('left', true) }] as unknown as echarts.SeriesOption[],
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
      itemStyle: { color: colors[index % colors.length] },
      lineStyle: { width: 2.2, color: colors[index % colors.length] },
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
    color: colors, tooltip: { trigger: 'axis' }, legend: legendOption(),
    grid: { left: props.analysis.legendPosition === 'left' && props.analysis.legendVisible ? 88 : 24, right: props.analysis.legendPosition === 'right' && props.analysis.legendVisible ? 88 : 24, top: props.analysis.legendPosition === 'top' && props.analysis.legendVisible ? 42 : 28, bottom: props.analysis.legendPosition === 'bottom' && props.analysis.legendVisible ? 46 : 30, containLabel: true },
    xAxis: { type: 'category', data: props.categories, min: props.analysis.xMin ?? undefined, max: props.analysis.xMax ?? undefined,
      axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [6, 9], lineStyle: { color: props.analysis.leftAxisColor || '#64748b' } }, axisTick: { show: false }, axisLabel: { color: '#7b8794', fontSize: 9 } },
    yAxis: [
      { type: 'value', name: [props.analysis.leftAxisTitle, props.analysis.leftAxisUnit].filter(Boolean).join(' '), min: props.analysis.yLeftMin ?? undefined, max: props.analysis.yLeftMax ?? undefined, axisLine: { show: true, symbol: ['none', 'arrow'], symbolSize: [6, 9], lineStyle: { color: props.analysis.leftAxisColor || '#64748b' } }, axisLabel: { color: props.analysis.leftAxisColor || '#64748b', formatter: `{value}${props.analysis.leftAxisUnit || ''}` }, splitLine: { lineStyle: { color: '#edf1f5' } } },
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

const renderKey = computed(() => JSON.stringify({
  kind: props.kind,
  categories: props.categories,
  series: props.series,
  analysis: props.analysis,
}))

onMounted(() => {
  if (!chartElement.value) return
  chart = echarts.init(chartElement.value)
  render()
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(chartElement.value)
})

watch(renderKey, render)
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose() })
</script>

<template><div ref="chartElement" class="data-echart" :aria-label="`${kind} 多系列数据图表`"></div></template>
<style scoped>.data-echart{width:100%;height:100%;min-height:70px}</style>
