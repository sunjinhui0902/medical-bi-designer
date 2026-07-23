<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { IconChartBar, IconDatabase, IconDeviceDesktopAnalytics, IconLayoutDashboard } from '@tabler/icons-vue'
import * as echarts from 'echarts'

const chartElement = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | undefined

function resizeChart() {
  chart?.resize()
}

onMounted(async () => {
  await nextTick()
  if (!chartElement.value) return

  chart = echarts.init(chartElement.value)
  chart.setOption({
    animation: false,
    grid: { left: 12, right: 12, top: 12, bottom: 12, containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['1月', '2月', '3月', '4月', '5月', '6月'],
      axisLine: { lineStyle: { color: '#dce1e7' } },
      axisTick: { show: false },
    },
    yAxis: { type: 'value', axisLabel: { show: false }, splitLine: { lineStyle: { color: '#eef1f4' } } },
    series: [
      {
        data: [42, 55, 49, 68, 74, 86],
        type: 'line',
        smooth: true,
        symbol: 'none',
        lineStyle: { width: 3, color: '#206bc4' },
        areaStyle: { color: 'rgba(32, 107, 196, .12)' },
      },
    ],
  })
  window.addEventListener('resize', resizeChart)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resizeChart)
  chart?.dispose()
})
</script>

<template>
  <div class="page min-vh-100">
    <header class="navbar navbar-expand-md d-print-none app-header">
      <div class="container-xl">
        <div class="navbar-brand navbar-brand-autodark d-flex align-items-center gap-2">
          <span class="brand-mark"><IconDeviceDesktopAnalytics :size="22" /></span>
          <span>医疗 BI Designer</span>
          <span class="badge bg-blue-lt ms-1">MVP</span>
        </div>
        <div class="navbar-nav flex-row order-md-last">
          <span class="text-secondary small">PostgreSQL 验证版</span>
        </div>
      </div>
    </header>

    <main class="page-wrapper">
      <div class="page-header d-print-none">
        <div class="container-xl">
          <div class="row g-2 align-items-center">
            <div class="col">
              <div class="page-pretitle">基础项目 · Step 1</div>
              <h1 class="page-title">让医疗数据更容易被设计与理解</h1>
              <p class="text-secondary mt-2 mb-0 intro-copy">
                面向产品经理、实施人员与医院业务人员的低代码 BI 设计器。目前已完成基础技术框架，下一阶段将搭建设计器三栏工作区。
              </p>
            </div>
            <div class="col-auto ms-auto">
              <button class="btn btn-primary" type="button" disabled>
                <IconLayoutDashboard :size="18" class="me-2" />进入设计器
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="page-body">
        <div class="container-xl">
          <div class="row row-cards">
            <div class="col-md-4">
              <article class="card h-100">
                <div class="card-body">
                  <span class="status-icon bg-blue-lt"><IconLayoutDashboard :size="24" /></span>
                  <h2 class="h3 mt-3">低代码设计</h2>
                  <p class="text-secondary mb-0">通过可视化画布创建、布局和配置医疗分析组件。</p>
                </div>
              </article>
            </div>
            <div class="col-md-4">
              <article class="card h-100">
                <div class="card-body">
                  <span class="status-icon bg-green-lt"><IconDatabase :size="24" /></span>
                  <h2 class="h3 mt-3">真实数据链路</h2>
                  <p class="text-secondary mb-0">连接只读 PostgreSQL 数据源，以数据集驱动看板。</p>
                </div>
              </article>
            </div>
            <div class="col-md-4">
              <article class="card h-100">
                <div class="card-body">
                  <span class="status-icon bg-purple-lt"><IconChartBar :size="24" /></span>
                  <h2 class="h3 mt-3">医疗业务组件</h2>
                  <p class="text-secondary mb-0">逐步沉淀收入、门诊、科室和床位分析组件。</p>
                </div>
              </article>
            </div>

            <div class="col-12">
              <article class="card chart-card">
                <div class="card-header border-0 pb-0">
                  <div>
                    <div class="card-title">ECharts 集成验证</div>
                    <div class="text-secondary small">模拟月度收入趋势 · 非生产数据</div>
                  </div>
                  <span class="badge bg-green-lt ms-auto">运行正常</span>
                </div>
                <div class="card-body pt-2">
                  <div ref="chartElement" class="integration-chart" aria-label="模拟月度收入趋势折线图"></div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </div>
    </main>
  </div>
</template>
