<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import {
  IconArrowLeft, IconBolt, IconCheck, IconChevronRight, IconCode, IconDatabase,
  IconDeviceFloppy, IconEye, IconLock, IconPlus, IconRefresh, IconServer,
  IconShieldCheck, IconTable, IconX,
} from '@tabler/icons-vue'

interface DataSource {
  id: string
  name: string
  type: string
  host: string
  port: number
  database: string
  username: string
  ssl: boolean
  defaultSchema?: string
  credentialTarget?: string
  sslMode?: string
  connectTimeoutSeconds?: number
  mode: 'demo' | 'postgresql'
  status: string
  hasPassword?: boolean
}
interface FieldInfo { name: string; type: string }
interface Dataset {
  id: string
  name: string
  dataSourceId: string
  sql: string
  notes: string
  fields: FieldInfo[]
  updatedAt: string
}
interface PreviewResult {
  rows: Array<Record<string, unknown>>
  fields: FieldInfo[]
  rowCount: number
  durationMs: number
  limited: boolean
  source: string
}

const router = useRouter()
const sources = ref<DataSource[]>([])
const datasets = ref<Dataset[]>([])
const activeSourceId = ref('demo-postgres')
const activeDatasetId = ref('')
const VALIDATION_SOURCE_ID = import.meta.env.VITE_VALIDATION_SOURCE_ID || ''
const loading = ref(false)
const actionState = ref<'idle' | 'success' | 'error'>('idle')
const message = ref('正在连接本地数据服务…')
const preview = ref<PreviewResult | null>(null)

const sourceForm = reactive({
  id: '', name: '', host: '', port: 5432, database: '', username: '', password: '',
  defaultSchema: 'public', credentialTarget: '', sslMode: 'prefer', connectTimeoutSeconds: 20,
})
const datasetForm = reactive({
  id: '', name: '门诊收入趋势', dataSourceId: 'demo-postgres',
  sql: `select
  month_code,
  sum(amount) as amount
from demo_income
group by month_code
order by month_code`,
  notes: '按月汇总医疗收入，用于趋势图和指标卡。',
})

const activeSource = computed(() => sources.value.find((source) => source.id === activeSourceId.value))
const columnNames = computed(() => preview.value?.fields.map((field) => field.name) ?? [])

onMounted(loadAll)

async function loadAll() {
  loading.value = true
  try {
    const [sourceResponse, datasetResponse] = await Promise.all([api('/api/datasources'), api('/api/datasets')])
    sources.value = sourceResponse
    datasets.value = datasetResponse
    const validationSource = sources.value.find((source) => source.id === VALIDATION_SOURCE_ID)
    if (validationSource && (activeSourceId.value === 'demo-postgres' || !activeSourceId.value)) selectSource(validationSource)
    message.value = validationSource ? '固定验证库 odr 已就绪' : '数据服务已就绪'
    actionState.value = 'success'
  } catch (error) {
    showError(error)
  } finally { loading.value = false }
}

function selectSource(source: DataSource) {
  activeSourceId.value = source.id
  datasetForm.dataSourceId = source.id
  Object.assign(sourceForm, {
    id: source.mode === 'demo' ? '' : source.id,
    name: source.mode === 'demo' ? '' : source.name,
    host: source.mode === 'demo' ? '' : source.host,
    port: source.port,
    database: source.mode === 'demo' ? '' : source.database,
    username: source.mode === 'demo' ? '' : source.username,
    password: '',
    defaultSchema: source.defaultSchema || 'public',
    credentialTarget: source.credentialTarget || '',
    sslMode: source.sslMode || (source.ssl ? 'require' : 'prefer'),
    connectTimeoutSeconds: source.connectTimeoutSeconds || 20,
  })
}

function newSource() {
  activeSourceId.value = ''
  Object.assign(sourceForm, {
    id: '', name: '', host: '', port: 5432, database: '', username: '', password: '',
    defaultSchema: 'public', credentialTarget: '', sslMode: 'prefer', connectTimeoutSeconds: 20,
  })
  message.value = '填写新的 PostgreSQL 只读数据源'
  actionState.value = 'idle'
}

async function testConnection() {
  await runAction(async () => {
    const payload = activeSourceId.value ? { dataSourceId: activeSourceId.value } : sourceForm
    const result = await api('/api/datasources/test', payload)
    message.value = `连接成功 · ${result.latencyMs} ms · ${result.readOnly ? '只读会话' : '请确认账号只读权限'}`
  })
}

async function saveSource() {
  await runAction(async () => {
    const saved = await api('/api/datasources', sourceForm)
    await loadAll()
    selectSource(saved)
    message.value = '数据源已加密保存，密码不会返回浏览器'
  })
}

async function executePreview() {
  await runAction(async () => {
    preview.value = await api('/api/query/preview', { dataSourceId: datasetForm.dataSourceId, sql: datasetForm.sql, limit: 100 })
    message.value = `执行成功 · 返回 ${preview.value?.rowCount ?? 0} 条 · ${preview.value?.durationMs ?? 0} ms`
  })
}

async function saveDataset() {
  await runAction(async () => {
    const saved = await api('/api/datasets', datasetForm)
    activeDatasetId.value = saved.id
    datasetForm.id = saved.id
    await loadAll()
    message.value = `数据集“${saved.name}”已保存，识别 ${saved.fields.length} 个字段`
  })
}

function selectDataset(dataset: Dataset) {
  void router.push({ path: '/datasets', query: { id: dataset.id } })
  activeDatasetId.value = dataset.id
  Object.assign(datasetForm, {
    id: dataset.id, name: dataset.name, dataSourceId: dataset.dataSourceId, sql: dataset.sql, notes: dataset.notes,
  })
  activeSourceId.value = dataset.dataSourceId
  preview.value = null
}

async function verifySqlGuard() {
  const previous = datasetForm.sql
  datasetForm.sql = 'delete from demo_income'
  await executePreview()
  datasetForm.sql = previous
}

async function runAction(action: () => Promise<void>) {
  loading.value = true
  actionState.value = 'idle'
  try {
    await action()
    actionState.value = 'success'
  } catch (error) {
    showError(error)
  } finally { loading.value = false }
}

function showError(error: unknown) {
  actionState.value = 'error'
  message.value = error instanceof Error ? error.message : '操作失败'
}

async function api(path: string, body?: unknown) {
  let response: Response
  try {
    response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new Error('无法连接本地数据服务（5174）。请在项目目录运行 npm run dev 后重试。')
  }
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `请求失败（${response.status}）`)
  return result
}
</script>

<template>
  <div class="data-studio">
    <header class="data-toolbar">
      <div class="data-brand">
        <span><IconDatabase :size="21" /></span>
        <div><b>医疗 BI Data Studio</b><small>Step 5 · PostgreSQL 验证链路</small></div>
      </div>
      <nav>
        <RouterLink to="/"><IconArrowLeft :size="16" />返回设计器</RouterLink><RouterLink to="/datasets"><IconTable :size="16" />数据集 2.0</RouterLink>
        <button type="button" :disabled="loading" @click="loadAll"><IconRefresh :size="16" />刷新</button>
      </nav>
    </header>

    <main class="data-layout">
      <aside class="source-rail">
        <div class="rail-title"><div><small>CONNECTIONS</small><h1>数据源</h1></div><button type="button" aria-label="新增数据源" @click="newSource"><IconPlus :size="17" /></button></div>
        <button v-for="source in sources" :key="source.id" type="button" class="source-item" :class="{ active: source.id === activeSourceId }" @click="selectSource(source)">
          <span class="source-icon"><IconServer :size="18" /></span>
          <span><b>{{ source.name }}</b><small>{{ source.host }}:{{ source.port }}{{ source.id === VALIDATION_SOURCE_ID ? ' · 固定验证库' : '' }}</small></span>
          <i :class="source.status === 'connected' ? 'online' : ''"></i>
        </button>
        <div class="rail-divider"></div>
        <div class="rail-title compact"><div><small>DATASETS</small><h2>已保存数据集</h2></div><b>{{ datasets.length }}</b></div>
        <button v-for="dataset in datasets" :key="dataset.id" type="button" class="dataset-item" :class="{ active: dataset.id === activeDatasetId }" @click="selectDataset(dataset)">
          <IconTable :size="16" /><span><b>{{ dataset.name }}</b><small>{{ dataset.fields.length }} 个字段</small></span><IconChevronRight :size="14" />
        </button>
        <div v-if="!datasets.length" class="empty-datasets">执行并保存 SQL 后，数据集会显示在这里。</div>
      </aside>

      <section class="source-config">
        <div class="section-kicker"><span>01</span><div><small>POSTGRESQL CONNECTION</small><h2>{{ activeSource?.mode === 'demo' ? '演示数据库连接' : sourceForm.id ? '编辑数据源' : '新建数据源' }}</h2></div></div>
        <div v-if="activeSource?.mode === 'demo'" class="demo-connection">
          <IconShieldCheck :size="27" /><div><b>内置医疗 Demo 数据库</b><p>通过与真实 PostgreSQL 相同的只读 API 验证数据集流程，不需要填写密码。</p></div><span>READY</span>
        </div>
        <form v-else class="connection-form" @submit.prevent="saveSource">
          <label class="full">数据源名称<input v-model="sourceForm.name" placeholder="例如：医院测试数据库" /></label>
          <label>Host<input v-model="sourceForm.host" placeholder="127.0.0.1" /></label>
          <label>Port<input v-model.number="sourceForm.port" type="number" min="1" max="65535" /></label>
          <label>Database<input v-model="sourceForm.database" placeholder="medical_bi" /></label>
          <label>Username<input v-model="sourceForm.username" autocomplete="username" placeholder="bi_readonly" /></label>
          <label>Default Schema<input v-model="sourceForm.defaultSchema" placeholder="public" /></label>
          <label>SSL Mode<select v-model="sourceForm.sslMode"><option value="disable">disable</option><option value="prefer">prefer</option><option value="require">require</option><option value="verify-ca">verify-ca</option><option value="verify-full">verify-full</option></select></label>
          <label>连接超时（秒）<input v-model.number="sourceForm.connectTimeoutSeconds" type="number" min="1" max="120" /></label>
          <label class="full">Credential Target<input v-model="sourceForm.credentialTarget" placeholder="仅记录引用；不会自动读取密码" /></label>
          <label class="full">Password<input v-model="sourceForm.password" type="password" autocomplete="current-password" :placeholder="sourceForm.id ? '留空则保持原密码' : '必须输入实际数据库密码'" /></label>
        </form>
        <div class="connection-actions">
          <button type="button" :disabled="loading" @click="testConnection"><IconBolt :size="17" />测试连接</button>
          <button v-if="activeSource?.mode !== 'demo'" class="primary" type="button" :disabled="loading" @click="saveSource"><IconDeviceFloppy :size="17" />加密保存</button>
        </div>
        <div class="security-note"><IconLock :size="16" /><span>密码使用 AES-256-GCM 保存在本机服务端；浏览器和看板 JSON 不保存密码。</span></div>
      </section>

      <section class="dataset-workbench">
        <div class="section-kicker"><span>02</span><div><small>READ-ONLY DATASET</small><h2>数据集与 SQL 预览</h2></div></div>
        <div class="dataset-meta">
          <label>数据集名称<input v-model="datasetForm.name" /></label>
          <label>数据源<select v-model="datasetForm.dataSourceId"><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option></select></label>
        </div>
        <label class="sql-label"><span>SQL 查询</span><em>只允许 SELECT / WITH · 最多返回 200 行 · 8 秒超时</em></label>
        <div class="sql-editor">
          <div class="line-numbers">1<br />2<br />3<br />4<br />5<br />6</div>
          <textarea v-model="datasetForm.sql" spellcheck="false" aria-label="SQL 查询"></textarea>
        </div>
        <label class="notes-label">备注<input v-model="datasetForm.notes" /></label>
        <div class="dataset-actions">
          <button type="button" :disabled="loading" @click="executePreview"><IconEye :size="17" />执行预览</button>
          <button type="button" :disabled="loading" @click="saveDataset"><IconDeviceFloppy :size="17" />保存数据集</button>
          <button class="guard-test" type="button" :disabled="loading" @click="verifySqlGuard"><IconShieldCheck :size="17" />验证危险 SQL 拦截</button>
        </div>
      </section>

      <section class="result-panel">
        <div class="result-heading">
          <div><span>03</span><div><small>QUERY RESULT</small><h2>数据预览</h2></div></div>
          <p :class="actionState"><component :is="actionState === 'error' ? IconX : IconCheck" :size="15" />{{ message }}</p>
        </div>
        <div v-if="preview" class="result-summary">
          <span><b>{{ preview.rowCount }}</b> 返回行</span><span><b>{{ preview.fields.length }}</b> 字段</span><span><b>{{ preview.durationMs }} ms</b> 执行耗时</span>
          <span v-for="field in preview.fields" :key="field.name" class="field-chip"><IconCode :size="13" />{{ field.name }} · {{ field.type }}</span>
        </div>
        <div v-if="preview" class="result-table-wrap">
          <table><thead><tr><th>#</th><th v-for="column in columnNames" :key="column">{{ column }}</th></tr></thead>
            <tbody><tr v-for="(row, index) in preview.rows" :key="index"><td>{{ index + 1 }}</td><td v-for="column in columnNames" :key="column">{{ row[column] }}</td></tr></tbody>
          </table>
        </div>
        <div v-else class="result-empty"><IconDatabase :size="34" /><b>等待执行 SQL</b><span>结果字段和前 100 行数据将在这里展示。</span></div>
      </section>
    </main>
  </div>
</template>

<style src="../styles/data-source-manager.css"></style>
