<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import * as echarts from 'echarts'

const props = defineProps<{ kind: 'line' | 'bar' | 'pie' }>()
const chartElement = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | undefined
let observer: ResizeObserver | undefined

function buildOption(): echarts.EChartsOption {
  if (props.kind === 'pie') {
    return {
      tooltip: { trigger: 'item' },
      series: [{
        type: 'pie',
        radius: ['48%', '72%'],
        center: ['50%', '53%'],
        label: { show: false },
        data: [
          { value: 38, name: '内科' },
          { value: 27, name: '外科' },
          { value: 19, name: '医技' },
          { value: 16, name: '其他' },
        ],
        color: ['#1477c9', '#26a69a', '#f59f00', '#9aa5b1'],
      }],
    }
  }

  const common = {
    grid: { left: 38, right: 12, top: 12, bottom: 28 },
    xAxis: {
      type: 'category' as const,
      data: ['1月', '2月', '3月', '4月', '5月', '6月'],
      axisLine: { lineStyle: { color: '#dce3ea' } },
      axisTick: { show: false },
      axisLabel: { color: '#7b8794', fontSize: 9 },
    },
    yAxis: {
      type: 'value' as const,
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9aa5b1', fontSize: 9 },
      splitLine: { lineStyle: { color: '#edf1f5' } },
    },
  }

  if (props.kind === 'bar') {
    return {
      ...common,
      tooltip: { trigger: 'axis' },
      series: [{ type: 'bar', data: [840, 960, 910, 1180, 1260, 1420], barMaxWidth: 22, itemStyle: { color: '#1477c9', borderRadius: [3, 3, 0, 0] } }],
    }
  }

  return {
    ...common,
    tooltip: { trigger: 'axis' },
    series: [{
      type: 'line',
      data: [840, 960, 910, 1180, 1260, 1420],
      smooth: true,
      symbolSize: 6,
      itemStyle: { color: '#1477c9' },
      lineStyle: { width: 2.5, color: '#1477c9' },
      areaStyle: { color: 'rgba(20,119,201,.10)' },
    }],
  }
}

function renderChart() {
  chart?.setOption(buildOption(), true)
}

onMounted(() => {
  if (!chartElement.value) return
  chart = echarts.init(chartElement.value)
  renderChart()
  observer = new ResizeObserver(() => chart?.resize())
  observer.observe(chartElement.value)
})

watch(() => props.kind, renderChart)

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
})
</script>

<template>
  <div ref="chartElement" class="canvas-echart" :aria-label="`${kind} 图表预览`"></div>
</template>

<style scoped>
.canvas-echart { width: 100%; height: 100%; min-height: 70px; }
</style>
