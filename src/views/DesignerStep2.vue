<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  IconActivityHeartbeat,
  IconBed,
  IconBuildingHospital,
  IconChartBar,
  IconChartLine,
  IconChartPie,
  IconChevronDown,
  IconDatabase,
  IconDeviceDesktopAnalytics,
  IconDeviceFloppy,
  IconDots,
  IconEye,
  IconFileExport,
  IconFileImport,
  IconGripVertical,
  IconLayoutDashboard,
  IconSearch,
  IconSettings,
  IconTable,
  IconTrendingUp,
  IconTypography,
} from '@tabler/icons-vue'
import * as echarts from 'echarts'

type PropertyTab = 'data' | 'style' | 'interaction' | 'layout' | 'advanced'

const groups = [
  {
    label: '基础组件',
    items: [
      { label: '指标卡', icon: IconActivityHeartbeat, tone: 'blue' },
      { label: '折线图', icon: IconChartLine, tone: 'cyan' },
      { label: '柱状图', icon: IconChartBar, tone: 'orange' },
      { label: '饼图', icon: IconChartPie, tone: 'purple' },
      { label: '数据表格', icon: IconTable, tone: 'green' },
      { label: '文本', icon: IconTypography, tone: 'slate' },
    ],
  },
  {
    label: '医疗业务组件',
    items: [
      { label: '收入分析卡', icon: IconTrendingUp, tone: 'blue' },
      { label: '门诊趋势', icon: IconBuildingHospital, tone: 'cyan' },
      { label: '科室排名', icon: IconChartBar, tone: 'orange' },
      { label: '床位利用率', icon: IconBed, tone: 'green' },
    ],
  },
]

const tabs: Array<{ id: PropertyTab; label: string }> = [
  { id: 'data', label: '数据' },
  { id: 'style', label: '样式' },
  { id: 'interaction', label: '交互' },
  { id: 'layout', label: '布局' },
  { id: 'advanced', label: '高级' },
]

const activeTab = ref<PropertyTab>('data')
const query = ref('')
const selectedTitle = ref('总收入')
const chartElement = ref<HTMLDivElement | null>(null)
let chart: echarts.ECharts | undefined

const filteredGroups = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return groups
  return groups
    .map((group) => ({ ...group, items: group.items.filter((item) => item.label.toLowerCase().includes(keyword)) }))
    .filter((group) => group.items.length)
})

function resizeChart() {
  chart?.resize()
}

onMounted(async () => {
  await nextTick()
  if (!chartElement.value) return
  chart = echarts.init(chartElement.value)
  chart.setOption({
    grid: { left: 42, right: 20, top: 24, bottom: 34 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: ['1月', '2月', '3月', '4月', '5月', '6月'],
      axisLine: { lineStyle: { color: '#dce3ea' } },
      axisTick: { show: false },
      axisLabel: { color: '#7b8794' },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: '#9aa5b1' },
      splitLine: { lineStyle: { color: '#edf1f5' } },
    },
    series: [
      {
        name: '收入',
        data: [840, 960, 910, 1180, 1260, 1420],
        type: 'line',
        smooth: true,
        symbolSize: 7,
        itemStyle: { color: '#1477c9' },
        lineStyle: { width: 3, color: '#1477c9' },
        areaStyle: { color: 'rgba(20,119,201,.1)' },
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
  <div class="designer-shell">
    <header class="designer-toolbar">
      <div class="brand-block">
        <span class="brand-mark"><IconDeviceDesktopAnalytics :size="20" /></span>
        <div><b>医疗 BI Designer</b><small>MVP · PostgreSQL 验证版</small></div>
      </div>

      <div class="dashboard-identity">
        <span>当前看板</span>
        <button type="button">医院运营概览 <IconChevronDown :size="15" /></button>
        <em>草稿已保存</em>
      </div>

      <div class="toolbar-actions" aria-label="看板操作">
        <button type="button" disabled title="Step 4 开放"><IconFileImport :size="17" />导入</button>
        <button type="button" disabled title="Step 4 开放"><IconFileExport :size="17" />导出</button>
        <button type="button" disabled title="Step 4 开放"><IconEye :size="17" />预览</button>
        <button class="primary-action" type="button" disabled title="Step 4 开放"><IconDeviceFloppy :size="17" />保存</button>
      </div>
    </header>

    <main class="designer-workspace">
      <aside class="component-panel" aria-label="组件库">
        <div class="panel-heading">
          <div><small>COMPONENTS</small><h1>组件库</h1></div><span>10</span>
        </div>
        <label class="component-search">
          <IconSearch :size="17" /><input v-model="query" type="search" placeholder="搜索组件" aria-label="搜索组件" />
        </label>
        <div class="component-groups">
          <section v-for="group in filteredGroups" :key="group.label">
            <h2>{{ group.label }}</h2>
            <div class="component-grid">
              <button v-for="item in group.items" :key="item.label" type="button" :title="`${item.label}（Step 3 支持添加）`">
                <span :class="`tone-${item.tone}`"><component :is="item.icon" :size="20" /></span>{{ item.label }}
              </button>
            </div>
          </section>
          <div v-if="!filteredGroups.length" class="search-empty">未找到匹配组件</div>
        </div>
        <div class="panel-footnote"><i></i>拖入画布功能将在 Step 3 开放</div>
      </aside>

      <section class="canvas-stage" aria-label="看板画布">
        <div class="canvas-meta">
          <div><IconLayoutDashboard :size="16" /> 医院运营概览 <span>/</span> <b>设计模式</b></div>
          <code>100% · 1440 × 900</code>
        </div>
        <div class="artboard-wrap">
          <div class="artboard">
            <div class="artboard-heading">
              <div><small>HOSPITAL OPERATIONS</small><h2>医院运营概览</h2></div>
              <span>数据周期：2026年1—6月</span>
            </div>
            <div class="canvas-grid">
              <article class="canvas-widget kpi-widget selected-widget">
                <div class="selection-label">当前选中</div>
                <button class="widget-grip" type="button" title="Step 3 开放"><IconGripVertical :size="17" /></button>
                <span>{{ selectedTitle }}</span><strong>8,420.6<small>万元</small></strong>
                <p><IconTrendingUp :size="16" />同比增长 12.8%</p><i class="resize-handle"></i>
              </article>
              <article class="canvas-widget kpi-widget">
                <span>门诊量</span><strong>126,580<small>人次</small></strong><p><IconTrendingUp :size="16" />环比增长 4.2%</p>
              </article>
              <article class="canvas-widget kpi-widget">
                <span>床位利用率</span><strong>91.6<small>%</small></strong><p class="neutral">目标值 90%</p>
              </article>
              <article class="canvas-widget chart-widget">
                <div class="widget-header">
                  <div><span>收入趋势</span><b>月度收入变化</b></div>
                  <button type="button" title="更多"><IconDots :size="19" /></button>
                </div>
                <div ref="chartElement" class="designer-chart" aria-label="月度收入趋势折线图"></div>
              </article>
              <article class="canvas-widget placeholder-widget">
                <IconChartBar :size="26" /><b>科室收入排名</b><span>数据组件占位</span>
              </article>
            </div>
          </div>
        </div>
      </section>

      <aside class="property-panel" aria-label="属性配置">
        <div class="property-header">
          <div><small>INSPECTOR</small><h2>属性配置</h2></div>
          <span><IconActivityHeartbeat :size="15" />指标卡</span>
        </div>
        <div class="property-tabs" role="tablist" aria-label="属性类型">
          <button v-for="item in tabs" :key="item.id" :class="{ active: activeTab === item.id }" type="button" role="tab" :aria-selected="activeTab === item.id" @click="activeTab = item.id">{{ item.label }}</button>
        </div>
        <div class="property-body">
          <template v-if="activeTab === 'data'">
            <section class="property-section">
              <h3><span>01</span>数据来源</h3><label>数据集</label>
              <button class="select-control" type="button" disabled><span><IconDatabase :size="16" />收入月度汇总</span><IconChevronDown :size="15" /></button>
              <p>真实数据集绑定将在 Step 4 开放。</p>
            </section>
            <section class="property-section">
              <h3><span>02</span>指标映射</h3><label>指标字段</label><input value="amount" disabled />
              <div class="field-row"><label>聚合方式<input value="SUM" disabled /></label><label>单位<input value="万元" disabled /></label></div>
            </section>
          </template>
          <template v-else-if="activeTab === 'style'">
            <section class="property-section">
              <h3><span>01</span>标题与容器</h3><label for="widget-title">组件标题</label><input id="widget-title" v-model="selectedTitle" />
              <div class="switch-row"><span>显示背景</span><i class="fake-switch active"></i></div>
              <div class="switch-row"><span>显示边框</span><i class="fake-switch active"></i></div>
              <div class="switch-row"><span>显示阴影</span><i class="fake-switch"></i></div>
            </section>
          </template>
          <div v-else-if="activeTab === 'interaction'" class="reserved-state"><IconSettings :size="28" /><b>交互能力已预留</b><span>组件联动与页面跳转将在 V2 实现。</span></div>
          <template v-else-if="activeTab === 'layout'">
            <section class="property-section">
              <h3><span>01</span>位置与尺寸</h3>
              <div class="layout-fields"><label>X<input value="32" disabled /></label><label>Y<input value="118" disabled /></label><label>W<input value="280" disabled /></label><label>H<input value="128" disabled /></label></div>
              <p>画布坐标编辑将在 Step 3 开放。</p>
            </section>
          </template>
          <template v-else>
            <section class="property-section"><h3><span>01</span>JSON 配置</h3><pre>{
  "id": "kpi_income",
  "type": "kpi",
  "datasetId": "income_month"
}</pre><p>高级配置当前为只读预览。</p></section>
          </template>
        </div>
        <footer><span>组件 ID</span><code>kpi_income</code></footer>
      </aside>
    </main>
  </div>
</template>

<style src="../styles/designer-workspace.css"></style>
