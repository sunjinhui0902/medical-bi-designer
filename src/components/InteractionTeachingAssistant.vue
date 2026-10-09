<script setup lang="ts">
import { ref } from 'vue'
import type { DashboardApplicationV3 } from '../models/dashboard-v3'
import { createInteractionTeachingDraft } from '../services/interactionTeachingDraft'
import { createBusinessInteractionDraft } from '../services/businessInteractionDraft'
const emit = defineEmits<{ close: []; create: [app: DashboardApplicationV3] }>()
const metric = ref('门诊收入'), busy = ref(false), error = ref('')
async function create() {
  busy.value = true; error.value = ''
  try {
    if (metric.value === '科室→医生业务样本') {
      const response = await fetch('/api/datasets/local-business:departments')
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || '本地业务样本暂不可用')
      const rowsResponse = await fetch('/api/datasets/local-business:departments/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parameters: { month: body.businessSample.month }, limit: 200 }) })
      const rowsBody = await rowsResponse.json()
      if (!rowsResponse.ok) throw new Error(rowsBody.error || '科室选项暂不可用')
      emit('create', createBusinessInteractionDraft({ ...body.businessSample, departments: rowsBody.rows })); return
    }
    const response = await fetch('/api/knowledge/local-dashboard-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: `2026年1月至2026年8月${metric.value}趋势` }) })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || '演示数据暂不可用')
    emit('create', createInteractionTeachingDraft(body))
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '创建失败' }
  finally { busy.value = false }
}
</script>
<template><div class="teaching-backdrop"><section class="teaching-panel" role="dialog" aria-modal="true" aria-labelledby="teaching-title">
  <header><h2 id="teaching-title">参数、联动、跳转、下钻教学</h2><button :disabled="busy" @click="emit('close')">关闭</button></header>
  <p>选一个指标，一键创建独立练习看板。参数、表格、联动对象和两层下钻已配好，原看板保留。创建后点顶部“预览”开始；点“保存”可留存，退出预览后可编辑配置。</p>
  <label>演示指标<select v-model="metric" :disabled="busy"><option>门诊收入</option><option>医疗成本</option><option>出院人次</option><option>科室→医生业务样本</option></select></label>
  <ol><li>选月份，观察结果自动变化。</li><li>点击表格行，观察另一张表联动。</li><li>点击跳转按钮，练习详情页与返回。</li><li>点击下钻表，再点击详情行，练习面包屑与逐层返回。</li></ol>
  <p v-if="metric === '科室→医生业务样本'">使用2026年8月本地库只读聚合样本，点击科室→医生→详情。医生编号展示，部分样本不代表全院合计；用“一键重新开始”重复演示。</p>
  <p v-else>使用2026年1月至8月本地证据快照，指标口径暂定；下钻示例为“月份→指标值”，不代表科室/医生层级。</p>
  <p v-if="error" role="alert">{{ error }}</p><button :disabled="busy" @click="create">{{ busy ? '创建中…' : '一键创建教学看板' }}</button>
</section></div></template>
<style scoped>.teaching-backdrop{position:fixed;inset:0;z-index:3000;background:#13283d66;display:grid;place-items:center;padding:24px}.teaching-panel{padding:28px;background:white;border-radius:16px;width:min(660px,100%);color:#243447;max-height:90vh;overflow:auto}.teaching-panel header{display:flex;justify-content:space-between;gap:20px}.teaching-panel h2{font-size:23px}.teaching-panel p,.teaching-panel li{line-height:1.8}.teaching-panel button,.teaching-panel select{padding:10px;border:1px solid #c9d5e2;border-radius:8px;background:#f2f7fb;cursor:pointer}.teaching-panel select{margin-left:12px}[role=alert]{color:#b42318}</style>
