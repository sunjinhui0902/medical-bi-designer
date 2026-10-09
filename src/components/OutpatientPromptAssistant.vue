<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { DashboardApplicationV3 } from '../models/dashboard-v3'
import type { BusinessSampleInfo } from '../services/businessInteractionDraft'
import { buildOutpatientPortablePrompt, compileOutpatientPromptPlan, outpatientPlanExample, parseOutpatientPromptPlan } from '../services/outpatientPromptPlan'
const emit = defineEmits<{ close: []; create: [app: DashboardApplicationV3] }>()
const goal = ref('设计门诊运营四页分析看板，蓝白配色，重点关注人次、收入、次均、趋势与构成，支持医院→科室→医生导航和手机自适应。')
const months = ref<string[]>([]), sample = ref<BusinessSampleInfo | null>(null), error = ref(''), status = ref(''), result = ref(''), busy = ref(true)
const prompt = computed(() => sample.value ? buildOutpatientPortablePrompt(goal.value, months.value, sample.value) : '')
onMounted(async () => {
  try {
    const responses = await Promise.all([fetch('/api/knowledge/hospital-overview'), fetch('/api/datasets/local-business:departments')])
    const [overview, metadata] = await Promise.all(responses.map(response => response.json()))
    if (responses.some(response => !response.ok)) throw new Error('本地院级快照或医生样本未就绪，不使用虚构数据代替')
    months.value = overview.months
    const response = await fetch('/api/datasets/local-business:departments/execute', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ parameters: { month: metadata.businessSample.month }, limit: 200 }) })
    const rows = await response.json()
    if (!response.ok) throw new Error(rows.error || '科室筛选样本不可用')
    sample.value = { ...metadata.businessSample, departments: rows.rows }
  } catch (reason) { error.value = reason instanceof Error ? reason.message : '加载失败' }
  finally { busy.value = false }
})
async function copyPrompt() { try { await navigator.clipboard.writeText(prompt.value); status.value = '提示词已复制，可交给千问、Gemini、DeepSeek 等模型' } catch { status.value = '自动复制不可用，请从提示词框全选复制' } }
function create() {
  error.value = ''
  try { if (!sample.value) throw new Error('本地数据尚未就绪'); emit('create', compileOutpatientPromptPlan(parseOutpatientPromptPlan(result.value, months.value), months.value, sample.value)); emit('close') }
  catch (reason) { error.value = reason instanceof Error ? reason.message : '计划校验失败' }
}
</script>
<template>
  <div class="prompt-mask"><section role="dialog" aria-modal="true" aria-label="跨模型门诊提示词" class="prompt-panel">
    <header><h2>跨模型门诊提示词</h2><button @click="emit('close')">关闭</button></header>
    <p>复制业务提示词给任意模型，将 JSON 计划粘贴回来。项目校验后编译为原生 V3；当前模板的指标、数据口径和交互关系受控，不能生成任意看板。不会自动发送本地数据或调用 API。</p>
    <label>业务目标<textarea v-model="goal" maxlength="500" rows="3" aria-label="提示词业务目标" /></label>
    <label>可复制提示词<textarea :value="prompt" readonly rows="9" aria-label="可复制门诊提示词" /></label>
    <button :disabled="busy || !prompt" @click="copyPrompt">复制提示词</button>
    <p>千问 32B：先使用小型计划，关闭思考或让服务把思考与最终 JSON 分开；不要在这里粘贴思考过程。Qwen2.5/Qwen3 的实际效果需用真实接口评测。</p>
    <label>模型返回 JSON<textarea v-model="result" rows="7" aria-label="模型返回 JSON" /></label>
    <button :disabled="busy || !sample" @click="result = JSON.stringify(outpatientPlanExample(months.filter(m => m <= '2026-08').sort().at(-1)), null, 2)">填入输出示例（非模型生成）</button>
    <button :disabled="busy || !result || !sample" @click="create">校验并添加到设计器</button>
    <p v-if="status" role="status">{{ status }}</p><p v-if="error" role="alert">{{ error }}</p>
  </section></div>
</template>
<style scoped>
.prompt-mask{position:fixed;inset:0;z-index:3000;background:#13283d66;display:grid;place-items:center;padding:20px}.prompt-panel{box-sizing:border-box;background:#fff;color:#243447;border-radius:14px;padding:24px;width:min(820px,100%);max-height:92vh;overflow:auto}.prompt-panel header{display:flex;justify-content:space-between;align-items:center}.prompt-panel h2{margin:0;font-size:21px}.prompt-panel p{font-size:13px;line-height:1.7}.prompt-panel label{display:block;margin:14px 0;font-size:13px}.prompt-panel textarea{box-sizing:border-box;display:block;width:100%;padding:10px;margin-top:6px;border:1px solid #c9d5e2;border-radius:6px;resize:vertical;font:13px/1.5 monospace}.prompt-panel button{padding:9px 12px;margin-right:8px;border:1px solid #c9d5e2;border-radius:6px;background:#f2f7fb;color:#203452}.prompt-panel [role=alert]{color:#b42318}
</style>
