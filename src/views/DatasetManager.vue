<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { onBeforeRouteLeave, RouterLink, useRoute, useRouter } from 'vue-router'
import {
  IconArrowLeft, IconBolt, IconBraces, IconCopy, IconDatabase, IconDeviceFloppy, IconPlus,
  IconRefresh, IconSearch, IconTable, IconTrash, IconX,
} from '@tabler/icons-vue'

interface DataSource { id: string; name: string; mode: string }
interface DatasetField {
  name: string; label: string; dataType: string; role: 'dimension' | 'measure' | 'parameter' | 'helper'
  description: string; unit: string; defaultAggregation: string; numberFormat: string
  metric?: { metricId: string; metricName?: string; source: 'local' | 'external' }
}
interface ParameterDefinition { id: string; name: string; type: string; required?: boolean; defaultValue?: unknown }
interface DatasetModel {
  version: 2; id: string; code: string; name: string; category: string; purpose: string; description: string
  dataSourceId: string; sql: string; status: 'draft' | 'validated' | 'disabled'; fields: DatasetField[]
  parameters: ParameterDefinition[]; updatedAt: string
}

const route = useRoute()
const router = useRouter()
const VALIDATION_SOURCE_ID = import.meta.env.VITE_VALIDATION_SOURCE_ID || ''
const sources = ref<DataSource[]>([])
const items = ref<DatasetModel[]>([])
const total = ref(0)
const page = ref(1)
const pageSize = 10
const query = ref('')
const statusFilter = ref('')
const categoryFilter = ref('')
const loading = ref(false)
const message = ref('正在加载数据集目录…')
const messageType = ref<'info' | 'success' | 'error'>('info')
const previewRows = ref<Array<Record<string, unknown>>>([])
const previewDuration = ref(0)

const form = reactive<DatasetModel>(emptyDataset())
const savedSnapshot = ref(JSON.stringify(form))
const isDirty = computed(() => JSON.stringify(form) !== savedSnapshot.value)
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))
const categories = computed(() => [...new Set(items.value.map((item) => item.category).filter(Boolean))])
const selectedSource = computed(() => sources.value.find((source) => source.id === form.dataSourceId))

onMounted(async () => {
  window.addEventListener('beforeunload', handleBeforeUnload)
  await Promise.all([loadSources(), loadDatasets()])
  const requestedId = typeof route.query.id === 'string' ? route.query.id : ''
  const requested = requestedId ? await api(`/api/datasets/${encodeURIComponent(requestedId)}`) : null
  if (requested) selectDataset(requested)
  else if (items.value.length) selectDataset(items.value[0])
  else newDataset()
})

onBeforeUnmount(() => window.removeEventListener('beforeunload', handleBeforeUnload))
onBeforeRouteLeave(() => confirmDiscardChanges())

function handleBeforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return
  event.preventDefault()
  event.returnValue = ''
}

function confirmDiscardChanges() {
  return !isDirty.value || window.confirm('当前数据集有未保存修改。确定切换并放弃这些修改吗？')
}

function syncSavedSnapshot() {
  savedSnapshot.value = JSON.stringify(form)
}

function emptyDataset(): DatasetModel {
  return {
    version: 2, id: '', code: '', name: '', category: '运营分析', purpose: '', description: '',
    dataSourceId: VALIDATION_SOURCE_ID, sql: 'select * from test.', status: 'draft', fields: [], parameters: [], updatedAt: '',
  }
}

async function loadSources() {
  sources.value = await api('/api/datasources')
}

async function loadDatasets() {
  loading.value = true
  try {
    const params = new URLSearchParams({ paged: '1', limit: String(pageSize), offset: String((page.value - 1) * pageSize) })
    if (query.value.trim()) params.set('q', query.value.trim())
    if (statusFilter.value) params.set('status', statusFilter.value)
    if (categoryFilter.value) params.set('category', categoryFilter.value)
    const result = await api(`/api/datasets?${params}`)
    items.value = result.items
    total.value = result.total
    show(`已加载 ${result.total} 个数据集`, 'success')
  } catch (error) { showError(error) } finally { loading.value = false }
}

function newDataset() {
  if (!confirmDiscardChanges()) return
  Object.assign(form, emptyDataset())
  previewRows.value = []
  previewDuration.value = 0
  syncSavedSnapshot()
  void router.replace({ path: '/datasets' })
  show('新建数据集默认使用固定验证库 odr', 'info')
}

async function selectDataset(dataset: DatasetModel) {
  if (!dataset.id || dataset.id === form.id) return
  if (!confirmDiscardChanges()) return
  loading.value = true
  try {
    const detail = await api(`/api/datasets/${encodeURIComponent(dataset.id)}`)
    Object.assign(form, structuredClone(detail))
    syncSavedSnapshot()
    previewRows.value = []
    previewDuration.value = 0
    if (route.query.id !== detail.id) await router.replace({ path: '/datasets', query: { id: detail.id } })
    show(`正在编辑：${detail.name}`, 'info')
  } catch (error) { showError(error) } finally { loading.value = false }
}

async function previewSql() {
  await run(async () => {
    const result = await api('/api/query/preview', { dataSourceId: form.dataSourceId, sql: form.sql, limit: 100 })
    previewRows.value = result.rows
    previewDuration.value = result.durationMs
    const previous = new Map(form.fields.map((field) => [field.name, field]))
    form.fields = result.fields.map((field: { name: string; type: string }) => previous.get(field.name) ?? ({
      name: field.name, label: field.name, dataType: field.type,
      role: field.type === 'number' ? 'measure' : 'dimension', description: '', unit: '',
      defaultAggregation: field.type === 'number' ? 'sum' : 'none', numberFormat: '',
    }))
    show(`SQL 执行成功：${result.rowCount} 行、${form.fields.length} 个字段、${result.durationMs} ms`, 'success')
  })
}

async function saveDataset() {
  await run(async () => {
    if (!form.name.trim() || !form.code.trim()) throw new Error('请填写数据集名称和编码')
    const saved = await api('/api/datasets', form)
    Object.assign(form, saved)
    syncSavedSnapshot()
    await loadDatasets()
    show(`数据集“${saved.name}”已保存`, 'success')
  })
}

async function copyDataset() {
  if (!form.id || !confirmDiscardChanges()) return
  await run(async () => {
    const copy = await api(`/api/datasets/${encodeURIComponent(form.id)}/copy`, {})
    await loadDatasets()
    syncSavedSnapshot()
    await selectDataset(copy)
    show('副本已创建，请修改编码后保存', 'success')
  })
}

async function setStatus(status: DatasetModel['status']) {
  if (!form.id) return
  await run(async () => {
    const saved = await api(`/api/datasets/${encodeURIComponent(form.id)}/status`, { status })
    form.status = saved.status
    syncSavedSnapshot()
    await loadDatasets()
    show(`状态已更新为 ${statusLabel(status)}`, 'success')
  })
}

async function deleteDataset() {
  if (!form.id) return
  const deletedId = form.id
  const deletedName = form.name
  if (!window.confirm(`确定删除数据集“${deletedName}”吗？删除后无法恢复。`)) return
  await run(async () => {
    await api(`/api/datasets/${encodeURIComponent(deletedId)}`, undefined, 'DELETE')
    syncSavedSnapshot()
    await loadDatasets()
    if (items.value.length) await selectDataset(items.value[0])
    else {
      Object.assign(form, emptyDataset())
      syncSavedSnapshot()
      await router.replace({ path: '/datasets' })
    }
    show(`数据集“${deletedName}”已删除`, 'success')
  })
}

function addParameter() {
  form.parameters.push({ id: `param_${Date.now().toString(36)}`, name: '新参数', type: 'text', required: false })
}

function removeParameter(index: number) { form.parameters.splice(index, 1) }

function bindMetric(field: DatasetField) {
  if (field.metric) delete field.metric
  else field.metric = { metricId: `local_${field.name}`, metricName: field.label || field.name, source: 'local' }
}

function statusLabel(status: string) {
  return ({ draft: '草稿', validated: '已验证', disabled: '已停用' } as Record<string, string>)[status] || status
}

async function run(action: () => Promise<void>) {
  loading.value = true
  try { await action() } catch (error) { showError(error) } finally { loading.value = false }
}

function show(text: string, type: 'info' | 'success' | 'error') { message.value = text; messageType.value = type }
function showError(error: unknown) { show(error instanceof Error ? error.message : '操作失败', 'error') }

async function api(path: string, body?: unknown, requestedMethod?: 'GET' | 'POST' | 'DELETE') {
  let response: Response
  try {
    response = await fetch(path, {
      method: requestedMethod ?? (body === undefined ? 'GET' : 'POST'),
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch { throw new Error('本地数据服务未启动，请运行 npm run dev') }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `请求失败（${response.status}）`)
  return result
}
</script>

<template>
  <div class="dataset-studio-v2">
    <header class="dataset-v2-toolbar">
      <div><IconTable :size="22" /><span><b>数据集 2.0</b><small>元数据 · 字段语义 · 指标 · 参数</small></span></div>
      <nav><RouterLink to="/"><IconArrowLeft :size="16" />返回设计器</RouterLink><RouterLink to="/data-sources"><IconDatabase :size="16" />数据源</RouterLink><RouterLink to="/parameters"><IconBraces :size="16" />参数中心</RouterLink></nav>
    </header>

    <main class="dataset-v2-layout">
      <aside class="dataset-v2-catalog">
        <div class="catalog-title"><div><small>DATASET CATALOG</small><h1>数据集目录</h1></div><button type="button" @click="newDataset"><IconPlus :size="17" /></button></div>
        <label class="catalog-search"><IconSearch :size="16" /><input v-model="query" placeholder="搜索名称、编码或字段" @keyup.enter="page = 1; loadDatasets()" /></label>
        <div class="catalog-filters"><select v-model="statusFilter" @change="page = 1; loadDatasets()"><option value="">全部状态</option><option value="draft">草稿</option><option value="validated">已验证</option><option value="disabled">已停用</option></select><select v-model="categoryFilter" @change="page = 1; loadDatasets()"><option value="">全部分类</option><option v-for="category in categories" :key="category">{{ category }}</option></select></div>
        <div class="dataset-v2-items">
          <button v-for="item in items" :key="item.id" type="button" :class="{ active: item.id === form.id }" @click="selectDataset(item)"><span><b>{{ item.name }}</b><small>{{ item.code }} · {{ item.category }}</small></span><i :class="`status-${item.status}`">{{ statusLabel(item.status) }}</i><em>{{ item.fields.length }} 字段</em></button>
        </div>
        <div class="catalog-pages"><button :disabled="page <= 1" @click="page--; loadDatasets()">上一页</button><span>{{ page }} / {{ pageCount }} · {{ total }} 项</span><button :disabled="page >= pageCount" @click="page++; loadDatasets()">下一页</button></div>
      </aside>

      <section class="dataset-v2-editor">
        <div class="editor-head"><div><small>DATASET DEFINITION</small><h2>{{ form.id ? form.name : '新建数据集' }}</h2><em v-if="isDirty" class="unsaved-indicator">未保存修改</em></div><div><button v-if="form.id" type="button" class="danger" @click="deleteDataset"><IconTrash :size="15" />删除</button><button v-if="form.id" type="button" @click="copyDataset"><IconCopy :size="15" />复制</button><button class="primary" type="button" :disabled="loading" @click="saveDataset"><IconDeviceFloppy :size="15" />保存</button></div></div>
        <div class="editor-section metadata-grid">
          <label>名称<input v-model="form.name" placeholder="例如：门诊月度汇总" /></label><label>编码<input v-model="form.code" placeholder="例如：op_monthly" /></label>
          <label>分类<input v-model="form.category" /></label><label>用途<input v-model="form.purpose" placeholder="趋势分析、排名、指标卡…" /></label>
          <label>数据源<select v-model="form.dataSourceId"><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}{{ source.id === VALIDATION_SOURCE_ID ? '（固定验证库）' : '' }}</option></select></label>
          <label>状态<select v-model="form.status"><option value="draft">草稿</option><option value="validated">已验证</option><option value="disabled">已停用</option></select></label>
          <label class="full">说明<textarea v-model="form.description" rows="2"></textarea></label>
        </div>

        <div class="editor-section sql-section"><div class="section-title"><span><b>SQL 与字段解析</b><small>{{ selectedSource?.name || '未选择数据源' }} · 只允许 SELECT / WITH</small></span><button type="button" :disabled="loading" @click="previewSql"><IconBolt :size="15" />执行测试</button></div><textarea v-model="form.sql" rows="7" spellcheck="false"></textarea></div>

        <div class="editor-section"><div class="section-title"><span><b>字段语义</b><small>执行 SQL 后解析字段；可配置角色、中文名、聚合和指标关联</small></span><em>{{ form.fields.length }} 字段</em></div>
          <div class="field-table-wrap"><table class="field-table"><thead><tr><th>字段</th><th>中文名</th><th>类型</th><th>角色</th><th>聚合</th><th>单位</th><th>格式</th><th>指标</th></tr></thead><tbody><tr v-for="field in form.fields" :key="field.name"><td><code>{{ field.name }}</code></td><td><input v-model="field.label" /></td><td>{{ field.dataType }}</td><td><select v-model="field.role"><option value="dimension">维度</option><option value="measure">指标</option><option value="parameter">参数</option><option value="helper">辅助</option></select></td><td><select v-model="field.defaultAggregation"><option value="none">无</option><option value="sum">SUM</option><option value="avg">AVG</option><option value="count">COUNT</option><option value="min">MIN</option><option value="max">MAX</option></select></td><td><input v-model="field.unit" placeholder="万元" /></td><td><input v-model="field.numberFormat" placeholder="0,0.00" /></td><td><button type="button" :class="{ linked: field.metric }" @click="bindMetric(field)">{{ field.metric ? '已关联' : '关联' }}</button></td></tr></tbody></table><div v-if="!form.fields.length" class="field-empty">请先执行 SQL 测试以解析字段。</div></div>
        </div>

        <div class="editor-section"><div class="section-title"><span><b>查询参数</b><small>参数将在阶段 8 用于控件联动；当前完成定义和持久化</small></span><button type="button" @click="addParameter"><IconPlus :size="15" />添加参数</button></div><div class="parameter-list"><div v-for="(parameter, index) in form.parameters" :key="parameter.id"><input v-model="parameter.name" /><select v-model="parameter.type"><option value="text">文本</option><option value="number">数字</option><option value="date">日期</option><option value="dateRange">日期范围</option><option value="singleSelect">单选</option><option value="multiSelect">多选</option></select><label><input v-model="parameter.required" type="checkbox" />必填</label><button type="button" @click="removeParameter(index)"><IconTrash :size="15" /></button></div><p v-if="!form.parameters.length">暂无参数。</p></div></div>
      </section>

      <aside class="dataset-v2-inspector">
        <div :class="['dataset-message', messageType]"><IconRefresh v-if="loading" :size="16" /><span>{{ message }}</span></div>
        <div class="status-actions" v-if="form.id"><b>状态管理</b><button @click="setStatus('draft')">设为草稿</button><button @click="setStatus('validated')">设为已验证</button><button @click="setStatus('disabled')">停用</button></div>
        <div class="preview-summary"><b>预览结果</b><span>{{ previewRows.length }} 行</span><span>{{ previewDuration }} ms</span></div>
        <div class="preview-table"><table v-if="previewRows.length"><thead><tr><th v-for="key in Object.keys(previewRows[0])" :key="key">{{ key }}</th></tr></thead><tbody><tr v-for="(row, index) in previewRows.slice(0, 20)" :key="index"><td v-for="key in Object.keys(previewRows[0])" :key="key">{{ row[key] }}</td></tr></tbody></table><div v-else><IconTable :size="26" /><span>执行 SQL 后显示前 20 行</span></div></div>
      </aside>
    </main>
  </div>
</template>

<style src="../styles/dataset-manager-v2.css"></style>
