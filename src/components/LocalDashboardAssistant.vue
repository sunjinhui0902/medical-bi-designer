<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { createLocalTrendDashboardDraft, localValue, type LocalDashboardPlan } from '../services/localDashboardDraft'
import type { DashboardApplicationV3 } from '../models/dashboard-v3'
import { createHospitalOverviewDraft, type HospitalModelPlan } from '../services/hospitalOverviewDraft'
const hospitalRequestId = ref('')
const hospitalStatus = ref('')
const apiMonth=ref('2026-08')
const apiProviders = ref<{id:string;name:string;model:string;configured:boolean}[]>([]), apiProvider = ref('')
onMounted(async () => { try { const r=await fetch('/api/model-settings'); if(!r.ok)throw new Error('读取已保存模型失败'); const data=await r.json(); apiProviders.value=data.providers.filter((p:{configured:boolean})=>p.configured); apiProvider.value=apiProviders.value.some(p=>p.id===data.activeProvider)?data.activeProvider:apiProviders.value[0]?.id||'' } catch(e) { error.value=e instanceof Error?e.message:'读取模型失败' } })
async function generateApiHospital(){
 busy.value=true;error.value='';hospitalStatus.value='正在调用所选 API 模型…'
 try{const response=await fetch('/api/knowledge/hospital-model',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:question.value,month:apiMonth.value,mode:'api',provider:apiProvider.value})}),result=await response.json();if(!response.ok)throw new Error(result.error||'API生成失败');hospitalRequestId.value=result.requestId;hospitalStatus.value=`${result.provider} · ${result.model} 方案已校验`;await loadHospitalModel();}catch(e){hospitalStatus.value='';error.value=e instanceof Error?e.message:'API生成失败'}finally{busy.value=false}
}
async function loadHospitalModel(){
 try{error.value='';hospitalStatus.value='读取模型方案…';const response=await fetch(`/api/knowledge/hospital-model/${hospitalRequestId.value}`),result=await response.json();if(!response.ok)throw new Error(result.error||'模型方案不可用');if(result.status!=='ready'){hospitalStatus.value=result.message;return}const dataResponse=await fetch('/api/knowledge/hospital-overview'),data=await dataResponse.json();if(!dataResponse.ok)throw new Error('医院数据不可用');emit('create',createHospitalOverviewDraft(result.plan as HospitalModelPlan,data.months,hospitalRequestId.value,result.provider));}catch(e){error.value=e instanceof Error?e.message:'生成失败'}
}
async function requestHospitalModel(){try{error.value='';const response=await fetch('/api/knowledge/hospital-model',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:question.value,month:'2026-08'})}),result=await response.json();if(!response.ok)throw new Error(result.error||'请求失败');hospitalRequestId.value=result.requestId;hospitalStatus.value='请求已准备，请让当前Codex会话调用ChatGPT。完成后点击“打开ChatGPT医院概览草稿”。';}catch(e){error.value=e instanceof Error?e.message:'请求失败'}}
const emit = defineEmits<{ close: []; create: [application: DashboardApplicationV3] }>()
const question = ref('2026年1月至2026年8月门诊收入、医疗成本趋势同比')
const plan = ref<LocalDashboardPlan | null>(null)
const busy = ref(false)
const error = ref('')
const examples = ['2026年1月至2026年8月门诊收入、医疗成本趋势同比', '2026年8月出院人次、门诊人次趋势环比', '2026年8月病床使用率趋势同比']
async function generate() {
  busy.value = true; error.value = ''; plan.value = null
  try {
    const response = await fetch('/api/knowledge/local-dashboard-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: question.value }) })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error || body.message || '暂时无法生成，请重试')
    plan.value = body
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '生成失败' }
  finally { busy.value = false }
}
function create() {
  try { if (plan.value) emit('create', createLocalTrendDashboardDraft(plan.value)) }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '草稿生成失败' }
}
</script>
<template>
  <div class="local-assistant-backdrop">
    <section role="dialog" aria-modal="true" aria-labelledby="local-assistant-title" class="local-assistant">
      <header><div><small>本地看板助手</small><h2 id="local-assistant-title">描述问题，生成可编辑草稿</h2></div><button :disabled="busy" aria-label="关闭看板助手" @click="emit('close')">关闭</button></header>
      <p>本地知识口径先试用，发现异常可继续调整。支持1至4个指标、明确月份区间和同比／环比；只写结束月份的趋势默认展示最近6个月。</p>
      <p><a href="/hospital-overview-sample.html" target="_blank" rel="noopener">查看医院运营概览模板样例与提示词</a> · 独立样例，缺少数据的区域保留空值。</p>
      <p><button type="button" :disabled="busy || !hospitalRequestId" @click="loadHospitalModel">打开当前 ChatGPT 方案</button> <button type="button" :disabled="busy" @click="requestHospitalModel">准备新的ChatGPT生成请求</button></p>
      <p><a href="/model-settings">查看 / 配置已保存模型</a></p>
      <p><label for="api-provider-choice">本次调用模型</label><select id="api-provider-choice" v-model="apiProvider" :disabled="busy"><option v-for="p in apiProviders" :key="p.id" :value="p.id">{{p.name}} · {{p.model}}</option><option v-if="!apiProviders.length" value="">尚无已保存模型，请先配置</option></select><label for="api-hospital-month">API 看板月份</label><input id="api-hospital-month" v-model="apiMonth" type="month" min="2025-01" max="2026-08"><button type="button" :disabled="busy || !apiProvider" @click="generateApiHospital">使用所选模型生成医院概览</button></p>
      <p v-if="hospitalStatus" role="status">{{ hospitalStatus }}</p>
      <form @submit.prevent="generate">
        <label for="local-question">经营分析问题</label>
        <textarea id="local-question" v-model="question" :disabled="busy" maxlength="500" rows="3" @input="plan = null" />
        <div class="local-examples"><button v-for="example in examples" :key="example" type="button" :disabled="busy" @click="question = example; plan = null">{{ example }}</button></div>
        <button type="submit" class="local-primary" :disabled="busy || !question.trim()">{{ busy ? '生成中…' : '生成草稿预览' }}</button>
      </form>
      <p v-if="error" role="alert" class="local-error">{{ error }}</p>
      <div v-if="plan" class="local-plan" aria-live="polite">
        <h3>{{ plan.from }} 至 {{ plan.to }} · 经营趋势</h3>
        <div v-for="metric in plan.metrics" :key="metric.metric.id" class="local-metric-preview"><b>{{ metric.metric.label }}</b><strong>{{ localValue(metric) }}</strong><small>{{ metric.series.length }}个月 · {{ metric.metric.source }}</small></div>
        <p v-for="warning in plan.warnings" :key="warning" class="local-warning">{{ warning }}</p>
        <p>创建独立看板并保留当前看板。最新月份指标卡和月度折线图可编辑、保存及重开；数据来自本地证据快照。</p>
        <button class="local-primary" @click="create">添加到设计器继续编辑</button>
      </div>
    </section>
  </div>
</template>
<style scoped>
.local-assistant-backdrop{position:fixed;inset:0;background:#13283d66;z-index:3000;display:grid;place-items:center;padding:24px}.local-assistant{background:#fff;border-radius:16px;padding:28px;width:min(720px,100%);max-height:90vh;overflow:auto;box-shadow:0 24px 90px #152e4e44;color:#243447}.local-assistant header{display:flex;justify-content:space-between;align-items:start;gap:20px}.local-assistant h2{margin:8px 0;font-size:23px}.local-assistant p{line-height:1.7;color:#63758a}.local-assistant button{border:1px solid #dbe4ed;border-radius:7px;background:#fff;padding:9px 13px;cursor:pointer}.local-assistant button:disabled{opacity:.5;cursor:wait}.local-assistant label{display:block;font-weight:600;margin:16px 0 8px}.local-assistant textarea{box-sizing:border-box;width:100%;border:1px solid #c9d5e2;border-radius:8px;padding:12px;font:inherit;resize:vertical}.local-examples{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 20px}.local-assistant .local-primary{background:#2367a3;color:white;border-color:#2367a3}.local-plan{margin-top:24px;padding:20px;background:#f2f7fb;border-radius:12px}.local-plan strong{font-size:32px}.local-assistant .local-error{color:#b42318}
</style>
<style scoped>
.local-metric-preview{display:grid;grid-template-columns:1fr auto;gap:8px;padding:16px 0;border-bottom:1px solid #dce6ef}.local-metric-preview strong{font-size:24px}.local-metric-preview small{grid-column:1/-1;color:#63758a;overflow-wrap:anywhere}.local-warning{color:#956115!important}
</style>
