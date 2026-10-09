<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import LocalDashboardAssistant from '../components/LocalDashboardAssistant.vue'
import type { DashboardApplicationV3 } from '../models/dashboard-v3'
import { loadDashboardWorkspaceV3, upsertDashboardApplicationInWorkspaceV3, saveDashboardWorkspaceV3 } from '../services/dashboardWorkspaceV3'
import {
  IconActivityHeartbeat,
  IconAlertTriangle,
  IconArrowLeft,
  IconBookmark,
  IconBox,
  IconBraces,
  IconBuildingHospital,
  IconChartBar,
  IconCheck,
  IconClock,
  IconCode,
  IconDatabase,
  IconDeviceDesktopAnalytics,
  IconDeviceFloppy,
  IconEdit,
  IconEye,
  IconFileImport,
  IconHelpCircle,
  IconInfoCircle,
  IconLayoutDashboard,
  IconLock,
  IconPlus,
  IconRefresh,
  IconSearch,
  IconShieldCheck,
  IconSparkles,
  IconTable,
  IconTag,
  IconTarget,
  IconTrash,
  IconTrendingUp,
  IconUser,
  IconX,
} from '@tabler/icons-vue'

interface CategoryItem {
  key: string
  name: string
  icon: string
  order: number
  description: string
  count: number
  candidateCount: number
  verifiedCount: number
  approvedCount?: number
  unresolvedCount?: number
}

interface OverviewData {
  ready: boolean
  rootPath?: string
  totalAssets: number
  totalRelations: number
  totalSources: number
  totalQuestions: number
  statusSummary: { candidate: number; verified: number; approved: number; deprecated: number; unverified: number }
  scopeSummary?: { hospital_dehong: number; public: number; private_demo: number; product: number }
  unresolvedCount?: number
  categories: CategoryItem[]
  lastUpdated: string
}

interface AssetSummary {
  categoryKey: string
  categoryName: string
  fileName: string
  filePath?: string
  assetId: string
  version: string
  name: string
  status: string
  scope: string
  securityLevel: string
  confidence: string
  description: string
  productionEvidenceCount: number
  unresolvedQuestions: any[]
  hasUnresolved: boolean
  parameters: any[]
  evidenceRefs: any[]
  tags: string[]
  updatedAt: string
  payload: any
}

interface AssetDetail {
  categoryKey: string
  categoryName: string
  fileName: string
  filePath?: string
  asset: any
  scope: string
  security: any
  unresolvedQuestions: any[]
  parameters: any[]
  relatedOut: any[]
  relatedIn: any[]
  evidenceSources: any[]
  executableContent: any
  sqlContent: any
}

const loading = ref(false)
const router = useRouter()
const localAssistantOpen = ref(false)
async function openGeneratedDashboard(application: DashboardApplicationV3) {
  try {
    const loaded = loadDashboardWorkspaceV3(localStorage)
    if (loaded.errors.length) throw new Error(loaded.errors.join('；'))
    const workspace = upsertDashboardApplicationInWorkspaceV3(loaded.workspace, application, true)
    const result = saveDashboardWorkspaceV3(localStorage, workspace)
    if (!result.success) throw new Error(result.errors.join('；'))
    localAssistantOpen.value = false
    await router.push('/')
  } catch (reason) { notify(reason instanceof Error ? reason.message : '草稿保存失败', 'error') }
}
const overview = ref<OverviewData | null>(null)
const selectedCategory = ref<string>('all')
const searchKeyword = ref('')
const statusFilter = ref('')
const scopeFilter = ref<string>('all')
const unresolvedOnly = ref(false)
const assetsList = ref<AssetSummary[]>([])
const selectedAssetId = ref<string>('')
const selectedAssetDetail = ref<AssetDetail | null>(null)
const detailLoading = ref(false)
const actionMessage = ref<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)

// Edit state
const isEditing = ref(false)
const editLoading = ref(false)
const editForm = reactive({
  name: '',
  description: '',
  status: 'candidate',
  tags: [] as string[],
  formulaExpr: '',
  numerator: '',
  denominator: '',
  additivityType: 'fully_additive',
  additivityDesc: '',
  tableName: '',
  granularity: '',
  fields: [] as any[],
  dialect: 'PostgreSQL',
  sqlTemplate: '',
  coreQuestionsText: '',
  rawPayloadJson: '',
})

// Import Modal state
const importModalOpen = ref(false)
const importLoading = ref(false)
const importForm = reactive({
  title: '',
  category: 'metrics',
  type: 'document',
  content: '',
  author: '业务负责人',
})

// Special views
const currentSpecialView = ref<'none' | 'evaluations' | 'profile' | 'sources'>('none')
const evaluationsData = ref<{ questions: any[]; cases: any[] }>({ questions: [], cases: [] })
const profileData = ref<{ confirmed: any[]; inferred: any[] }>({ confirmed: [], inferred: [] })
const sourcesData = ref<any[]>([])

const categoryIconMap: Record<string, any> = {
  business_scenario: IconBuildingHospital,
  metric_definition: IconChartBar,
  data_model_definition: IconDatabase,
  sql_case: IconCode,
  dashboard_template_blueprint: IconLayoutDashboard,
  bi_design_rule: IconEye,
  policy_rule: IconShieldCheck,
  permission_knowledge: IconLock,
  industry_pattern: IconDeviceDesktopAnalytics,
  algorithm_definition: IconActivityHeartbeat,
  mining_task_template: IconTrendingUp,
  evaluation_case: IconTarget,
  terminology_mapping: IconBookmark,
  change_record: IconRefresh,
}

onMounted(async () => {
  await loadOverview()
  await loadAssets()
})

function notify(text: string, type: 'success' | 'error' | 'info' = 'info') {
  actionMessage.value = { text, type }
  setTimeout(() => {
    if (actionMessage.value?.text === text) actionMessage.value = null
  }, 4000)
}

async function loadOverview() {
  try {
    const res = await fetch('/api/knowledge/overview')
    overview.value = await res.json()
  } catch (err) {
    console.error('Failed to load overview:', err)
  }
}

async function loadAssets() {
  loading.value = true
  currentSpecialView.value = 'none'
  isEditing.value = false
  try {
    const params = new URLSearchParams()
    if (selectedCategory.value !== 'all') {
      params.set('category', selectedCategory.value)
    }
    if (searchKeyword.value.trim()) {
      params.set('q', searchKeyword.value.trim())
    }
    if (statusFilter.value) {
      params.set('status', statusFilter.value)
    }
    if (scopeFilter.value !== 'all') {
      params.set('scope', scopeFilter.value)
    }
    if (unresolvedOnly.value) {
      params.set('unresolved', 'true')
    }
    const res = await fetch(`/api/knowledge/assets?${params}`)
    assetsList.value = await res.json()

    if (assetsList.value.length && (!selectedAssetId.value || !assetsList.value.some((a) => a.assetId === selectedAssetId.value))) {
      selectAsset(assetsList.value[0].assetId)
    } else if (!assetsList.value.length) {
      selectedAssetId.value = ''
      selectedAssetDetail.value = null
    }
  } catch (err) {
    console.error('Failed to load assets:', err)
  } finally {
    loading.value = false
  }
}

function handleScopeSelect(scope: string) {
  scopeFilter.value = scope
  unresolvedOnly.value = false
  loadAssets()
}

function handleUnresolvedToggle() {
  unresolvedOnly.value = !unresolvedOnly.value
  loadAssets()
}

function scopeText(scope: string) {
  if (scope === 'hospital_dehong') return '德宏生产'
  if (scope === 'public') return '公共标准'
  if (scope === 'private_demo') return '演示隔离'
  if (scope === 'product') return '产品平台'
  return scope
}

function securityText(level: string) {
  if (level === 'confidential') return '机密'
  if (level === 'internal') return '内部'
  if (level === 'public') return '公开'
  return level
}

async function selectAsset(assetId: string) {
  selectedAssetId.value = assetId
  detailLoading.value = true
  isEditing.value = false
  try {
    const res = await fetch(`/api/knowledge/assets/${encodeURIComponent(assetId)}`)
    if (res.ok) {
      selectedAssetDetail.value = await res.json()
    }
  } catch (err) {
    console.error('Failed to fetch asset detail:', err)
  } finally {
    detailLoading.value = false
  }
}


function startEdit() {
  if (!selectedAssetDetail.value) return
  const asset = selectedAssetDetail.value.asset
  const payload = asset.payload || {}

  editForm.name = asset.name || asset.assetId
  editForm.description = asset.description || ''
  editForm.status = asset.status || 'candidate'
  editForm.tags = Array.isArray(asset.tags) ? [...asset.tags] : []

  editForm.formulaExpr = payload.formula?.expression || payload.calculationExpression || ''
  editForm.numerator = payload.formula?.numerator || ''
  editForm.denominator = payload.formula?.denominator || ''
  editForm.additivityType = payload.additivity?.type || 'fully_additive'
  editForm.additivityDesc = payload.additivity?.description || payload.additivity?.warning || ''

  editForm.tableName = payload.tableName || ''
  editForm.granularity = payload.granularity || ''
  editForm.fields = Array.isArray(payload.fields) ? JSON.parse(JSON.stringify(payload.fields)) : []

  editForm.dialect = payload.dialect || 'PostgreSQL'
  editForm.sqlTemplate = payload.sqlTemplate || selectedAssetDetail.value.sqlContent || ''

  editForm.coreQuestionsText = Array.isArray(payload.coreQuestions) ? payload.coreQuestions.join('\n') : ''
  editForm.rawPayloadJson = JSON.stringify(payload, null, 2)

  isEditing.value = true
}

function cancelEdit() {
  isEditing.value = false
}

function addFieldToModel() {
  editForm.fields.push({
    name: `new_col_${editForm.fields.length + 1}`,
    label: '新字段名称',
    type: 'string',
    role: 'dimension',
    description: '',
  })
}

function removeFieldFromModel(index: number) {
  editForm.fields.splice(index, 1)
}

async function saveEdit() {
  if (!selectedAssetId.value) return
  editLoading.value = true
  try {
    const categoryKey = selectedAssetDetail.value?.categoryKey
    let newPayload = { ...(selectedAssetDetail.value?.asset?.payload || {}) }

    if (categoryKey === 'metrics') {
      newPayload.formula = {
        expression: editForm.formulaExpr,
        numerator: editForm.numerator,
        denominator: editForm.denominator,
      }
      newPayload.additivity = {
        type: editForm.additivityType,
        description: editForm.additivityDesc,
      }
    } else if (categoryKey === 'data_model') {
      newPayload.tableName = editForm.tableName
      newPayload.granularity = editForm.granularity
      newPayload.fields = editForm.fields
    } else if (categoryKey === 'sql_case') {
      newPayload.dialect = editForm.dialect
      newPayload.sqlTemplate = editForm.sqlTemplate
    } else if (categoryKey === 'business') {
      newPayload.coreQuestions = editForm.coreQuestionsText.split('\n').map((s) => s.trim()).filter(Boolean)
    } else {
      try {
        newPayload = JSON.parse(editForm.rawPayloadJson)
      } catch {
        // keep
      }
    }

    const payloadBody = {
      name: editForm.name,
      description: editForm.description,
      status: editForm.status,
      tags: editForm.tags,
      payload: newPayload,
    }

    const res = await fetch(`/api/knowledge/assets/${encodeURIComponent(selectedAssetId.value)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadBody),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || '保存失败')
    }

    notify('知识资产修改已同步保存！', 'success')
    isEditing.value = false
    await Promise.all([loadOverview(), selectAsset(selectedAssetId.value)])
  } catch (err: any) {
    notify(`保存失败：${err.message}`, 'error')
  } finally {
    editLoading.value = false
  }
}

async function changeStatus(newStatus: 'verified' | 'candidate' | 'approved' | 'reviewed' | 'deprecated') {
  if (!selectedAssetId.value) return
  try {
    const res = await fetch(`/api/knowledge/assets/${encodeURIComponent(selectedAssetId.value)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus }),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || '状态更新失败')
    }

    notify(`资产状态已变更为【${newStatus}】`, 'success')
    await Promise.all([loadOverview(), loadAssets(), selectAsset(selectedAssetId.value)])
  } catch (err: any) {
    notify(`状态更新失败：${err.message}`, 'error')
  }
}

function handleCategorySelect(catKey: string) {
  selectedCategory.value = catKey
  currentSpecialView.value = 'none'
  loadAssets()
}

async function showSpecialView(view: 'evaluations' | 'profile' | 'sources') {
  currentSpecialView.value = view
  selectedCategory.value = ''
  selectedAssetDetail.value = null

  if (view === 'evaluations') {
    const res = await fetch('/api/knowledge/evaluations')
    evaluationsData.value = await res.json()
  } else if (view === 'profile') {
    const res = await fetch('/api/knowledge/profile')
    profileData.value = await res.json()
  } else if (view === 'sources') {
    const res = await fetch('/api/knowledge/sources')
    sourcesData.value = await res.json()
  }
}

function jumpToAsset(targetAssetId: string) {
  searchKeyword.value = ''
  selectedCategory.value = 'all'
  currentSpecialView.value = 'none'
  loadAssets().then(() => {
    selectAsset(targetAssetId)
  })
}

function openImportModal() {
  importForm.title = ''
  importForm.content = ''
  importForm.category = selectedCategory.value !== 'all' && selectedCategory.value ? selectedCategory.value : 'metrics'
  importModalOpen.value = true
}

function closeImportModal() {
  importModalOpen.value = false
}

function handleFileUpload(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files || !input.files[0]) return
  const file = input.files[0]
  importForm.title = file.name.replace(/\.[^/.]+$/, '')
  const reader = new FileReader()
  reader.onload = (event) => {
    importForm.content = (event.target?.result as string) || ''
  }
  reader.readAsText(file)
}

async function submitImport() {
  if (!importForm.title.trim() || !importForm.content.trim()) {
    notify('请填写资料标题与内容', 'error')
    return
  }
  importLoading.value = true
  try {
    const res = await fetch('/api/knowledge/sources/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(importForm),
    })

    if (!res.ok) {
      const err = await res.json()
      throw new Error(err.error || '导入失败')
    }

    const data = await res.json()
    notify(`资料【${importForm.title}】已导入并生成候选资产！`, 'success')
    closeImportModal()
    await Promise.all([loadOverview(), loadAssets()])
    if (data.asset?.assetId) {
      selectAsset(data.asset.assetId)
    }
  } catch (err: any) {
    notify(`导入失败：${err.message}`, 'error')
  } finally {
    importLoading.value = false
  }
}

function statusBadgeClass(status: string) {
  if (status === 'verified' || status === 'formal' || status === 'approved') return 'badge-status-verified'
  return 'badge-status-candidate'
}

function statusText(status: string) {
  if (status === 'verified' || status === 'formal' || status === 'approved') return '已核验 (Verified)'
  if (status === 'candidate') return '待现场确认 (Candidate)'
  return status
}
</script>

<template>
  <div class="knowledge-studio">
    <!-- Top Toolbar -->
    <header class="knowledge-toolbar">
      <div class="brand">
        <div class="brand-icon"><IconBookmark :size="22" /></div>
        <div class="brand-text">
          <b>医疗 BI 知识资产中心</b>
          <small>业务场景 · 核心指标 · 数仓模型 · SQL 模板 · 看板蓝图 · 安全规则</small>
        </div>
      </div>
      <nav>
        <button type="button" class="btn-primary" @click="localAssistantOpen = true"><IconSparkles :size="16" />本地看板助手</button>
        <RouterLink to="/"><IconArrowLeft :size="16" />返回设计器</RouterLink>
        <RouterLink to="/data-sources"><IconDatabase :size="16" />数据源</RouterLink>
        <RouterLink to="/datasets"><IconTable :size="16" />数据集</RouterLink>
        <RouterLink to="/parameters"><IconBraces :size="16" />参数中心</RouterLink>
        <RouterLink to="/knowledge" class="active"><IconBookmark :size="16" />知识库</RouterLink>
        <RouterLink to="/model-settings"><IconSparkles :size="16" />模型配置</RouterLink>
      </nav>
    </header>

    <!-- Top Ribbon / Stats Bar -->
    <div class="knowledge-ribbon" v-if="overview">
      <div class="stats">
        <div class="stat-item">
          <span>资产总数：</span>
          <b>{{ overview.totalAssets }} 个</b>
        </div>
        <div class="stat-item">
          <span>🏥 德宏生产底座：</span>
          <b style="color: #166534;">{{ overview.scopeSummary?.hospital_dehong || 0 }} 项</b>
        </div>
        <div class="stat-item">
          <span>🌐 公共通用标准：</span>
          <b style="color: #1d4ed8;">{{ overview.scopeSummary?.public || 0 }} 项</b>
        </div>
        <div class="stat-item">
          <span>血缘关系：</span>
          <b>{{ overview.totalRelations }} 组关联</b>
        </div>
        <div class="stat-item" v-if="(overview.unresolvedCount || 0) > 0">
          <span
            class="badge-warning-uq"
            style="cursor: pointer;"
            @click="handleUnresolvedToggle"
            title="点击查看未决问题工作台"
          >
            ⚠️ {{ overview.unresolvedCount }} 项未决口径待核
          </span>
        </div>
      </div>
      <div class="stat-item" style="color: #64748b; font-size: 0.78rem;">
        <span>规范：Canonical 0.2.0 · 生产证据强绑定 · 严禁臆造</span>
      </div>
    </div>

    <!-- Main Workspace -->
    <main class="knowledge-layout">
      <!-- Left Sidebar Categories -->
      <aside class="knowledge-sidebar">
        <!-- Import Button -->
        <button type="button" class="sidebar-import-btn" @click="openImportModal">
          <IconFileImport :size="17" />
          <span>+ 导入 / 新增资料</span>
        </button>

        <div class="sidebar-section-title">生产核心视图</div>
        <button
          type="button"
          class="category-btn"
          :class="{ active: scopeFilter === 'hospital_dehong' && !unresolvedOnly && currentSpecialView === 'none' }"
          @click="handleScopeSelect('hospital_dehong')"
        >
          <span class="cat-label"><IconBuildingHospital :size="16" />🏥 德宏真实底座</span>
          <span class="cat-count">{{ overview?.scopeSummary?.hospital_dehong || 0 }}</span>
        </button>

        <button
          type="button"
          class="category-btn"
          :class="{ active: unresolvedOnly && currentSpecialView === 'none' }"
          @click="handleUnresolvedToggle"
        >
          <span class="cat-label" style="color: #b45309;"><IconShieldCheck :size="16" />⚠️ 未决问题工作台</span>
          <span class="cat-count" style="background: #fef3c7; color: #92400e; font-weight: bold;">
            {{ overview?.unresolvedCount || 0 }}
          </span>
        </button>

        <div class="sidebar-section-title" style="margin-top: 14px;">知识资产分类</div>
        <button
          type="button"
          class="category-btn"
          :class="{ active: selectedCategory === 'all' && scopeFilter === 'all' && !unresolvedOnly && currentSpecialView === 'none' }"
          @click="handleScopeSelect('all'); handleCategorySelect('all')"
        >
          <span class="cat-label"><IconBox :size="16" />全部资产</span>
          <span class="cat-count">{{ overview?.totalAssets || 0 }}</span>
        </button>

        <button
          v-for="cat in overview?.categories || []"
          :key="cat.key"
          type="button"
          class="category-btn"
          :class="{ active: selectedCategory === cat.key && currentSpecialView === 'none' }"
          @click="handleCategorySelect(cat.key)"
        >
          <span class="cat-label">
            <component :is="categoryIconMap[cat.key] || IconTag" :size="16" />
            {{ cat.name }}
          </span>
          <span class="cat-count">{{ cat.count }}</span>
        </button>

        <div class="sidebar-section-title" style="margin-top: 14px;">审计、评测与偏好</div>
        <button
          type="button"
          class="category-btn"
          :class="{ active: currentSpecialView === 'evaluations' }"
          @click="showSpecialView('evaluations')"
        >
          <span class="cat-label"><IconTarget :size="16" />评测题库 (AI 考试)</span>
          <span class="cat-count">{{ overview?.totalQuestions || 0 }}</span>
        </button>

        <button
          type="button"
          class="category-btn"
          :class="{ active: currentSpecialView === 'profile' }"
          @click="showSpecialView('profile')"
        >
          <span class="cat-label"><IconUser :size="16" />用户画像与偏好</span>
          <span class="cat-count">6+</span>
        </button>

        <button
          type="button"
          class="category-btn"
          :class="{ active: currentSpecialView === 'sources' }"
          @click="showSpecialView('sources')"
        >
          <span class="cat-label"><IconShieldCheck :size="16" />真实来源清单</span>
          <span class="cat-count">{{ overview?.totalSources || 0 }}</span>
        </button>
      </aside>

      <!-- Middle Assets List (When viewing standard assets) -->
      <section class="knowledge-list-panel" v-if="currentSpecialView === 'none'">
        <div class="knowledge-list-header">
          <!-- Scope Filter Segmented Bar -->
          <div class="scope-filter-bar">
            <button
              type="button"
              class="scope-tab-btn"
              :class="{ active: scopeFilter === 'all' && !unresolvedOnly }"
              @click="handleScopeSelect('all')"
            >
              全部 ({{ overview?.totalAssets || 0 }})
            </button>
            <button
              type="button"
              class="scope-tab-btn"
              :class="{ active: scopeFilter === 'hospital_dehong' && !unresolvedOnly }"
              @click="handleScopeSelect('hospital_dehong')"
            >
              🏥 德宏生产 ({{ overview?.scopeSummary?.hospital_dehong || 0 }})
            </button>
            <button
              type="button"
              class="scope-tab-btn"
              :class="{ active: scopeFilter === 'public' && !unresolvedOnly }"
              @click="handleScopeSelect('public')"
            >
              🌐 公共标准 ({{ overview?.scopeSummary?.public || 0 }})
            </button>
            <button
              type="button"
              class="scope-tab-btn"
              :class="{ active: scopeFilter === 'private_demo' && !unresolvedOnly }"
              @click="handleScopeSelect('private_demo')"
            >
              🧪 演示隔离 ({{ overview?.scopeSummary?.private_demo || 0 }})
            </button>
          </div>

          <div class="knowledge-search-box">
            <IconSearch :size="16" style="color: #94a3b8;" />
            <input
              v-model="searchKeyword"
              placeholder="搜索场景、指标名、SQL、模型、未决问题…"
              @input="loadAssets"
            />
            <button
              v-if="searchKeyword"
              type="button"
              style="background:none; border:none; cursor:pointer; color:#94a3b8;"
              @click="searchKeyword = ''; loadAssets()"
            >
              <IconX :size="14" />
            </button>
          </div>
          <div style="display: flex; gap: 8px;">
            <select
              v-model="statusFilter"
              @change="loadAssets"
              style="width: 100%; padding: 4px 8px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.8rem; background: #fff;"
            >
              <option value="">全部状态 (Approved / Reviewed / Candidate)</option>
              <option value="candidate">待现场确认 (Candidate)</option>
              <option value="reviewed">已复核证据 (Reviewed)</option>
              <option value="approved">正式批准 (Approved)</option>
            </select>
          </div>
        </div>

        <div class="knowledge-list-items">
          <button
            v-for="item in assetsList"
            :key="item.assetId"
            type="button"
            class="asset-card-btn"
            :class="{ active: selectedAssetId === item.assetId }"
            @click="selectAsset(item.assetId)"
          >
            <div class="asset-card-top">
              <span class="asset-card-title">{{ item.name }}</span>
              <span class="asset-badge" :class="statusBadgeClass(item.status)">
                {{ item.status }}
              </span>
            </div>
            <div class="asset-card-desc">{{ item.description || '无补充描述' }}</div>

            <!-- Badges Row -->
            <div style="display: flex; flex-wrap: wrap; gap: 4px; margin: 6px 0;">
              <span class="badge-scope" :class="'scope-' + item.scope">{{ scopeText(item.scope) }}</span>
              <span class="badge-security" :class="'sec-' + item.securityLevel">{{ securityText(item.securityLevel) }}</span>
              <span class="badge-evidence" v-if="item.productionEvidenceCount > 0">🔗 {{ item.productionEvidenceCount }}条生产证据</span>
              <span class="badge-warning-uq" v-if="item.hasUnresolved">⚠️ {{ item.unresolvedQuestions.length }}项待核</span>
            </div>

            <div class="asset-card-meta">
              <span class="asset-badge badge-tag">{{ item.categoryName }}</span>
              <span>v{{ item.version }}</span>
            </div>
          </button>

          <div v-if="!assetsList.length && !loading" class="empty-state" style="padding: 40px 0;">
            <IconSearch :size="32" />
            <span>未找到匹配的知识资产</span>
          </div>
        </div>
      </section>


      <!-- Right Detail Inspector (Asset Detail or Special View) -->
      <section class="knowledge-detail-panel" :style="currentSpecialView !== 'none' ? 'grid-column: 2 / 4;' : ''">
        <!-- 1. Special View: Evaluations -->
        <div v-if="currentSpecialView === 'evaluations'" class="detail-card">
          <div class="detail-header">
            <div class="detail-title-group">
              <h2>🎯 黄金评测题库 (Golden Questions & Evaluations)</h2>
              <div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">
                用于测试与校验 AI 能否正确理解医疗运营业务意图，并准确调取指标、数仓模型与看板蓝图。
              </div>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title"><IconHelpCircle :size="18" />业务问答评测集 (Golden Questions)</div>
            <div style="display: flex; flex-direction: column; gap: 12px;">
              <div
                v-for="(q, idx) in evaluationsData.questions"
                :key="q.questionId || idx"
                style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px;"
              >
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                  <b style="font-size: 0.95rem; color: #1e293b;">Q{{ idx + 1 }}. {{ q.query || q.text }}</b>
                  <span class="asset-badge badge-tag">{{ q.category || '医疗业务' }}</span>
                </div>
                <div style="font-size: 0.84rem; color: #475569; line-height: 1.5; margin-top: 4px;">
                  <b>预期目标场景：</b><code>{{ q.expectedScenario || q.targetScenario || '科室运营' }}</code>
                </div>
                <div v-if="q.expectedMetrics" style="font-size: 0.84rem; color: #475569; margin-top: 4px;">
                  <b>预期匹配指标：</b>
                  <span v-for="m in q.expectedMetrics" :key="m" style="margin-right: 6px; color: #2563eb;">{{ m }}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 2. Special View: User Profile -->
        <div v-if="currentSpecialView === 'profile'" class="detail-card">
          <div class="detail-header">
            <div class="detail-title-group">
              <h2>👤 项目负责人偏好与习惯画像 (User Profile)</h2>
              <div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">
                严格记录您本人在沟通过程中确立的硬性规则与协作偏好，AI 执行时必须 100% 遵守。
              </div>
            </div>
          </div>

          <div class="detail-section">
            <div class="detail-section-title" style="color: #15803d;"><IconCheck :size="18" />负责人显式确证偏好 (Owner Confirmed)</div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <div
                v-for="(p, idx) in profileData.confirmed"
                :key="idx"
                style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 12px;"
              >
                <div style="font-weight: 600; font-size: 0.9rem; color: #166534; margin-bottom: 4px;">
                  {{ p.topic || p.preferenceKey || '偏好项' }}
                </div>
                <div style="font-size: 0.84rem; color: #14532d; line-height: 1.5;">
                  {{ p.value || p.instruction || p.statement }}
                </div>
                <div v-if="p.exactQuote" style="font-size: 0.76rem; color: #15803d; margin-top: 6px; font-style: italic;">
                  原文引述：“{{ p.exactQuote }}”
                </div>
              </div>
            </div>
          </div>

          <div class="detail-section" v-if="profileData.inferred.length" style="margin-top: 24px;">
            <div class="detail-section-title" style="color: #b45309;"><IconClock :size="18" />推断候选偏好 (Inferred Pending Confirmation)</div>
            <div style="display: flex; flex-direction: column; gap: 10px;">
              <div
                v-for="(p, idx) in profileData.inferred"
                :key="idx"
                style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px;"
              >
                <div style="font-weight: 600; font-size: 0.88rem; color: #92400e;">
                  {{ p.topic || p.preferenceKey }}
                </div>
                <div style="font-size: 0.82rem; color: #78350f; margin-top: 2px;">
                  {{ p.value || p.hypothesis }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- 3. Special View: Sources -->
        <div v-if="currentSpecialView === 'sources'" class="detail-card">
          <div class="detail-header">
            <div class="detail-title-group">
              <h2>🛡️ 真实来源与证据清单 (Source Manifest)</h2>
              <div style="font-size: 0.85rem; color: #64748b; margin-top: 4px;">
                知识库中每一条指标和模型均有本地真实凭证与上游 Git Commit 哈希追溯，拒绝任何虚构。
              </div>
            </div>
          </div>

          <div class="detail-section">
            <table class="k-table">
              <thead>
                <tr>
                  <th>来源标识 (Source ID)</th>
                  <th>类型</th>
                  <th>来源路径 / 引用位置</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="s in sourcesData" :key="s.sourceId">
                  <td><b>{{ s.sourceId }}</b></td>
                  <td><span class="asset-badge badge-tag">{{ s.type }}</span></td>
                  <td><code>{{ s.location || s.path || s.uri }}</code></td>
                  <td><span class="asset-badge badge-status-verified">{{ s.status || '真实追溯' }}</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 4. Standard Asset Detail View -->
        <template v-if="currentSpecialView === 'none' && selectedAssetDetail">
          <!-- A. EDIT MODE -->
          <div v-if="isEditing" class="detail-card">
            <div class="detail-header">
              <div class="detail-title-group">
                <h2>✏️ 编辑知识资产：{{ editForm.name }}</h2>
                <div style="font-size: 0.82rem; color: #64748b; margin-top: 4px;">
                  <code>{{ selectedAssetDetail.asset.assetId }}</code> · 修改后将直接同步写回磁盘资产文件
                </div>
              </div>
            </div>

            <div class="edit-form-grid">
              <div class="form-group">
                <label>业务名称 (Name)</label>
                <input v-model="editForm.name" placeholder="请输入业务中文名" />
              </div>

              <div class="form-group">
                <label>业务说明与描述 (Description)</label>
                <textarea v-model="editForm.description" rows="3" placeholder="描述此知识资产的业务用途和场景"></textarea>
              </div>

              <!-- Metric Specific Inputs -->
              <template v-if="selectedAssetDetail.categoryKey === 'metrics'">
                <div class="form-group">
                  <label>📐 业务计算公式表达式 (Formula Expression)</label>
                  <input v-model="editForm.formulaExpr" placeholder="例如：SUM(item_amount - refund_amount)" />
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div class="form-group">
                    <label>分子口径 (Numerator)</label>
                    <input v-model="editForm.numerator" placeholder="例如：实际占用总床日数" />
                  </div>
                  <div class="form-group">
                    <label>分母口径 (Denominator)</label>
                    <input v-model="editForm.denominator" placeholder="例如：实际开放总床日数" />
                  </div>
                </div>
                <div style="display: grid; grid-template-columns: 1fr 2fr; gap: 12px;">
                  <div class="form-group">
                    <label>可加性类型 (Additivity)</label>
                    <select v-model="editForm.additivityType">
                      <option value="fully_additive">完全可自由累加 (fully_additive)</option>
                      <option value="non_additive">不可直接累加比率指标 (non_additive)</option>
                      <option value="semi_additive">半可加 (semi_additive)</option>
                    </select>
                  </div>
                  <div class="form-group">
                    <label>⚠️ 统计陷阱与注意事项 (Warning/Notes)</label>
                    <input v-model="editForm.additivityDesc" placeholder="例如：禁止直接对百分比求平均" />
                  </div>
                </div>
              </template>

              <!-- Data Model Specific Inputs -->
              <template v-if="selectedAssetDetail.categoryKey === 'data_model'">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div class="form-group">
                    <label>物理/逻辑表名 (Table Name)</label>
                    <input v-model="editForm.tableName" placeholder="例如：dw_department_month_fact" />
                  </div>
                  <div class="form-group">
                    <label>数据粒度 (Granularity)</label>
                    <input v-model="editForm.granularity" placeholder="例如：月度/科室粒度" />
                  </div>
                </div>

                <div class="form-group">
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <label>字段列表定义 (Fields)</label>
                    <button type="button" class="btn-secondary" style="padding: 4px 10px; font-size: 0.78rem;" @click="addFieldToModel">
                      <IconPlus :size="13" />添加字段
                    </button>
                  </div>
                  <table class="k-table">
                    <thead>
                      <tr>
                        <th>字段名</th>
                        <th>中文标签</th>
                        <th>类型</th>
                        <th>角色</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="(f, idx) in editForm.fields" :key="idx">
                        <td><input v-model="f.name" style="width: 100%; padding: 4px;" /></td>
                        <td><input v-model="f.label" style="width: 100%; padding: 4px;" /></td>
                        <td>
                          <select v-model="f.type" style="width: 100%; padding: 4px;">
                            <option value="string">string</option>
                            <option value="number">number</option>
                            <option value="date">date</option>
                          </select>
                        </td>
                        <td>
                          <select v-model="f.role" style="width: 100%; padding: 4px;">
                            <option value="dimension">维度 (dimension)</option>
                            <option value="measure">度量 (measure)</option>
                          </select>
                        </td>
                        <td>
                          <button type="button" style="background:none; border:none; color:#dc2626; cursor:pointer;" @click="removeFieldFromModel(idx)">
                            <IconTrash :size="15" />
                          </button>
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </template>

              <!-- SQL Case Specific Inputs -->
              <template v-if="selectedAssetDetail.categoryKey === 'sql_case'">
                <div class="form-group">
                  <label>数据库方言 (Dialect)</label>
                  <select v-model="editForm.dialect">
                    <option value="PostgreSQL">PostgreSQL / Greenplum</option>
                    <option value="Oracle">Oracle</option>
                    <option value="MySQL">MySQL</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>参数化取数 SQL 模板 (SELECT Only)</label>
                  <textarea v-model="editForm.sqlTemplate" rows="8" style="font-family: Consolas, monospace; font-size: 0.85rem;" spellcheck="false"></textarea>
                </div>
              </template>

              <!-- Business Specific Inputs -->
              <template v-if="selectedAssetDetail.categoryKey === 'business'">
                <div class="form-group">
                  <label>🎯 核心业务问题列表 (每行一个)</label>
                  <textarea v-model="editForm.coreQuestionsText" rows="5" placeholder="每行输入一个业务问题"></textarea>
                </div>
              </template>

              <!-- Generic fallback JSON -->
              <template v-if="!['metrics', 'data_model', 'sql_case', 'business'].includes(selectedAssetDetail.categoryKey)">
                <div class="form-group">
                  <label>规则与详情 Payload (JSON)</label>
                  <textarea v-model="editForm.rawPayloadJson" rows="8" style="font-family: Consolas, monospace; font-size: 0.84rem;"></textarea>
                </div>
              </template>

              <!-- Form Actions -->
              <div class="form-actions">
                <button type="button" class="btn-secondary" @click="cancelEdit">取消</button>
                <button type="button" class="btn-primary" :disabled="editLoading" @click="saveEdit">
                  <IconDeviceFloppy :size="16" />
                  <span>{{ editLoading ? '保存中…' : '保存并同步到知识库' }}</span>
                </button>
              </div>
            </div>
          </div>

          <!-- B. VIEW MODE -->
          <div v-else class="detail-card">
            <div class="detail-header">
              <div class="detail-title-group">
                <h2>{{ selectedAssetDetail.asset.name || selectedAssetDetail.asset.assetId }}</h2>
                <div style="display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 6px;">
                  <span class="code-badge">{{ selectedAssetDetail.asset.assetId }}</span>
                  <span class="badge-scope" :class="'scope-' + (selectedAssetDetail.scope || selectedAssetDetail.asset.scope)">
                    {{ scopeText(selectedAssetDetail.scope || selectedAssetDetail.asset.scope) }}
                  </span>
                  <span class="badge-security" :class="'sec-' + (selectedAssetDetail.security?.level || selectedAssetDetail.asset.security?.level || 'internal')">
                    🛡️ {{ securityText(selectedAssetDetail.security?.level || selectedAssetDetail.asset.security?.level || 'internal') }}
                  </span>
                  <span class="asset-badge badge-tag">{{ selectedAssetDetail.categoryName }}</span>
                  <span class="asset-badge" :class="statusBadgeClass(selectedAssetDetail.asset.status)">
                    {{ selectedAssetDetail.asset.status }}
                  </span>
                  <span style="font-size: 0.8rem; color: #94a3b8;">版本: v{{ selectedAssetDetail.asset.version }}</span>
                </div>
              </div>

              <!-- Top Action Buttons: Edit & Quick Status -->
              <div class="detail-action-buttons">
                <button type="button" class="btn-edit" @click="startEdit">
                  <IconEdit :size="15" />
                  <span>编辑内容</span>
                </button>
                <button
                  v-if="selectedAssetDetail.asset.status !== 'verified' && selectedAssetDetail.asset.status !== 'approved'"
                  type="button"
                  class="btn-status-verify"
                  @click="changeStatus('approved')"
                >
                  <IconCheck :size="15" />
                  <span>正式核准 (Approve)</span>
                </button>
                <button
                  v-else
                  type="button"
                  class="btn-status-candidate"
                  @click="changeStatus('candidate')"
                >
                  <IconClock :size="15" />
                  <span>设为待现场确认</span>
                </button>
              </div>
            </div>

            <!-- Unresolved Questions Alert Panel -->
            <div
              v-if="selectedAssetDetail.unresolvedQuestions && selectedAssetDetail.unresolvedQuestions.length"
              class="unresolved-alert-card"
            >
              <div class="unresolved-alert-header">
                <div class="unresolved-alert-title">
                  <IconAlertTriangle :size="18" />
                  <span>待现场确认业务口径 ({{ selectedAssetDetail.unresolvedQuestions.length }} 项未决事项)</span>
                </div>
                <span class="asset-badge badge-warning-uq">严禁自动核准</span>
              </div>
              <div
                v-for="uq in selectedAssetDetail.unresolvedQuestions"
                :key="uq.questionId"
                class="unresolved-item"
              >
                <div class="unresolved-item-q">
                  <b>[{{ uq.kind || '口径确认' }}]</b> {{ uq.question }}
                </div>
                <div v-if="uq.candidateOptions && uq.candidateOptions.length" class="unresolved-item-opts">
                  <span style="font-size: 0.76rem; color: #78350f;">待核验选项/影响：</span>
                  <span v-for="(opt, oIdx) in uq.candidateOptions" :key="oIdx" class="unresolved-opt-chip">
                    {{ opt }}
                  </span>
                </div>
              </div>
            </div>

            <!-- Parameters Contract Table -->
            <div
              v-if="selectedAssetDetail.parameters && selectedAssetDetail.parameters.length"
              class="detail-section"
            >
              <div class="detail-section-title">
                <IconBraces :size="18" />参数签名与控件契约 (Parameters Contract)
              </div>
              <table class="params-table">
                <thead>
                  <tr>
                    <th>参数名 (paramName)</th>
                    <th>业务语义 (semanticType)</th>
                    <th>数据类型</th>
                    <th>默认值 (default)</th>
                    <th>必填</th>
                    <th>渲染控件 (uiWidget)</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="p in selectedAssetDetail.parameters" :key="p.paramName">
                    <td><code>{{ p.paramName }}</code></td>
                    <td><b>{{ p.semanticType || p.paramName }}</b></td>
                    <td>{{ p.type || 'string' }}</td>
                    <td><code>{{ p.default ?? '-' }}</code></td>
                    <td>
                      <span :style="{ color: p.required ? '#dc2626' : '#64748b', fontWeight: p.required ? '600' : 'normal' }">
                        {{ p.required ? '是 (Required)' : '否' }}
                      </span>
                    </td>
                    <td><span class="asset-badge badge-tag">{{ p.uiWidget || 'input' }}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- Production Evidence Breakdown -->
            <div
              v-if="selectedAssetDetail.evidenceSources && selectedAssetDetail.evidenceSources.length"
              class="detail-section"
            >
              <div class="detail-section-title">
                <IconShieldCheck :size="18" />真实生产证据与凭证追溯 (Production Evidence)
              </div>
              <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                <div
                  v-for="(ev, evIdx) in selectedAssetDetail.evidenceSources"
                  :key="evIdx"
                  style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px;"
                >
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <b>{{ ev.sourceId }}</b>
                    <span class="asset-badge badge-status-verified">{{ ev.sourceDetail?.type || '生产证据' }}</span>
                  </div>
                  <div style="font-size: 0.82rem; color: #475569; margin-top: 4px;">
                    定位值：<code>{{ ev.locator?.value || ev.locator || '-' }}</code>
                  </div>
                  <div v-if="ev.excerptSummary" style="font-size: 0.8rem; color: #64748b; margin-top: 4px;">
                    {{ ev.excerptSummary }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Business Description -->
            <div style="font-size: 0.95rem; color: #334155; line-height: 1.6; margin-bottom: 16px;">
              {{ selectedAssetDetail.asset.description }}
            </div>


            <!-- Metric Specific: Formula & Additivity -->
            <div v-if="selectedAssetDetail.categoryKey === 'metrics'" class="detail-section">
              <div class="formula-box">
                <div class="formula-label">📐 业务计算公式与口径</div>
                <div class="formula-text">
                  {{ selectedAssetDetail.asset.payload?.formula?.expression || selectedAssetDetail.asset.payload?.calculationExpression || '无公式表达式' }}
                </div>
                <div class="formula-breakdown" v-if="selectedAssetDetail.asset.payload?.formula">
                  <span v-if="selectedAssetDetail.asset.payload?.formula?.numerator">
                    <b>分子：</b>{{ selectedAssetDetail.asset.payload?.formula?.numerator }}
                  </span>
                  <span v-if="selectedAssetDetail.asset.payload?.formula?.denominator">
                    <b>分母：</b>{{ selectedAssetDetail.asset.payload?.formula?.denominator }}
                  </span>
                </div>
              </div>

              <!-- Additivity Warning -->
              <div class="warning-callout" v-if="selectedAssetDetail.asset.payload?.additivity">
                <b>⚠️ 可加性属性：{{ selectedAssetDetail.asset.payload.additivity.type === 'fully_additive' ? '可完全自由累加' : selectedAssetDetail.asset.payload.additivity.type === 'non_additive' ? '不可直接累加 (比率指标)' : '半可加' }}</b>
                <div style="margin-top: 4px;">
                  {{ selectedAssetDetail.asset.payload.additivity.description || selectedAssetDetail.asset.payload.additivity.warning || '注意聚合维度与跨期统计口径，避免重复核算。' }}
                </div>
              </div>
            </div>

            <!-- Data Model Specific: Table & Fields -->
            <div v-if="selectedAssetDetail.categoryKey === 'data_model'" class="detail-section">
              <div class="detail-section-title"><IconTable :size="18" />物理与逻辑表结构定义</div>
              <div style="margin-bottom: 8px; font-size: 0.85rem; color: #475569;">
                <b>物理表名：</b><code>{{ selectedAssetDetail.asset.payload?.tableName || 'dw_fact_table' }}</code>
                <span style="margin-left: 16px;"><b>粒度：</b>{{ selectedAssetDetail.asset.payload?.granularity || '月度/科室' }}</span>
              </div>
              <table class="k-table" v-if="selectedAssetDetail.asset.payload?.fields">
                <thead>
                  <tr>
                    <th>字段名</th>
                    <th>中文名称</th>
                    <th>数据类型</th>
                    <th>角色</th>
                    <th>业务说明</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="f in selectedAssetDetail.asset.payload.fields" :key="f.name">
                    <td><code>{{ f.name }}</code></td>
                    <td><b>{{ f.label || f.name }}</b></td>
                    <td>{{ f.type }}</td>
                    <td>
                      <span class="asset-badge badge-tag">{{ f.role || (f.isDimension ? '维度' : '度量') }}</span>
                    </td>
                    <td>{{ f.description || '-' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <!-- SQL Template Specific: SQL Preview & Dialect -->
            <div v-if="selectedAssetDetail.categoryKey === 'sql_case'" class="detail-section">
              <div class="detail-section-title">
                <IconCode :size="18" />参数化取数 SQL (PostgreSQL / Greenplum 方言)
              </div>
              <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                <span class="asset-badge badge-status-verified">🛡️ 100% 只读 SELECT 保护</span>
                <span class="asset-badge badge-tag">方言：{{ selectedAssetDetail.asset.payload?.dialect || 'PostgreSQL' }}</span>
              </div>
              <div class="sql-preview-box">
                {{ selectedAssetDetail.asset.payload?.sqlTemplate || selectedAssetDetail.sqlContent || '-- SQL template --' }}
              </div>
            </div>

            <!-- Dashboard Template Specific: Blueprint Layout -->
            <div v-if="selectedAssetDetail.categoryKey === 'dashboard_template'" class="detail-section">
              <div class="detail-section-title"><IconLayoutDashboard :size="18" />看板组件与排版蓝图</div>
              <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 12px; margin-top: 10px;">
                <div
                  v-for="(slot, idx) in selectedAssetDetail.asset.payload?.slots || []"
                  :key="idx"
                  style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px;"
                >
                  <div style="font-weight: 600; font-size: 0.88rem; color: #1e293b;">
                    {{ slot.name || slot.slotId }}
                  </div>
                  <div style="font-size: 0.78rem; color: #64748b; margin-top: 4px;">
                    推荐组件：<code>{{ slot.componentType || 'chart' }}</code>
                  </div>
                  <div style="font-size: 0.78rem; color: #2563eb; margin-top: 4px;">
                    绑定指标：{{ slot.metricRef || slot.metricName || '-' }}
                  </div>
                </div>
              </div>
            </div>

            <!-- Business Scenario Specific: Questions & Roles -->
            <div v-if="selectedAssetDetail.categoryKey === 'business'" class="detail-section">
              <div class="detail-section-title"><IconBuildingHospital :size="18" />业务场景核心目标与受众</div>
              <div style="background: #f1f5f9; border-radius: 8px; padding: 14px; margin-top: 8px;">
                <div style="font-weight: 600; font-size: 0.88rem; color: #0f172a; margin-bottom: 6px;">🎯 核心要解决的业务问题：</div>
                <ul style="margin: 0; padding-left: 20px; font-size: 0.86rem; color: #334155;">
                  <li v-for="(q, idx) in selectedAssetDetail.asset.payload?.coreQuestions || []" :key="idx">
                    {{ q }}
                  </li>
                </ul>
              </div>
            </div>

            <!-- Policy & BI Rules -->
            <div v-if="['bi_rule', 'policy', 'permission'].includes(selectedAssetDetail.categoryKey)" class="detail-section">
              <div class="detail-section-title"><IconShieldCheck :size="18" />规则约束与红线条款</div>
              <div style="background: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 6px; padding: 12px 16px; font-size: 0.88rem; color: #1e293b;">
                <pre style="margin: 0; font-family: inherit; white-space: pre-wrap;">{{ JSON.stringify(selectedAssetDetail.asset.payload, null, 2) }}</pre>
              </div>
            </div>

            <!-- Relations & Lineage Chips -->
            <div class="detail-section" style="border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 20px;">
              <div class="detail-section-title"><IconSparkles :size="18" />关联血缘与穿透链路</div>
              <div class="lineage-chips" v-if="selectedAssetDetail.relatedOut.length || selectedAssetDetail.relatedIn.length">
                <div
                  v-for="rel in selectedAssetDetail.relatedOut"
                  :key="rel.relationId"
                  class="lineage-chip"
                  @click="jumpToAsset(rel.target.assetId)"
                >
                  <span style="color: #64748b;">{{ rel.relationType }} →</span>
                  <b>{{ rel.target.name || rel.target.assetId }}</b>
                </div>
                <div
                  v-for="rel in selectedAssetDetail.relatedIn"
                  :key="rel.relationId"
                  class="lineage-chip"
                  @click="jumpToAsset(rel.source.assetId)"
                >
                  <span style="color: #64748b;">← 被 {{ rel.source.name || rel.source.assetId }} 关联</span>
                </div>
              </div>
              <div v-else style="font-size: 0.82rem; color: #94a3b8;">
                暂无显式关联定义。
              </div>
            </div>
          </div>
        </template>

        <div v-if="currentSpecialView === 'none' && !selectedAssetDetail && !detailLoading" class="empty-state">
          <IconInfoCircle :size="36" />
          <span>请从左侧选择一项知识资产以查看详细业务内容</span>
        </div>
      </section>
    </main>

    <!-- Import Material Modal -->
    <div class="modal-overlay" v-if="importModalOpen" @click.self="closeImportModal">
      <div class="modal-card">
        <div class="modal-header">
          <h3>📥 导入业务资料 / 录入新知识</h3>
          <button type="button" style="background:none; border:none; cursor:pointer;" @click="closeImportModal">
            <IconX :size="18" />
          </button>
        </div>
        <div class="modal-body">
          <div class="form-group">
            <label>资料标题 (Title)</label>
            <input v-model="importForm.title" placeholder="例如：门诊次均费用核算规范 / 医生门诊工作量 SQL" />
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
            <div class="form-group">
              <label>目标知识分类</label>
              <select v-model="importForm.category">
                <option value="metrics">指标字典 (metrics)</option>
                <option value="data_model">数仓模型 (data_model)</option>
                <option value="sql_case">SQL 模板 (sql_case)</option>
                <option value="business">业务场景 (business)</option>
                <option value="bi_rule">BI 规则 (bi_rule)</option>
              </select>
            </div>
            <div class="form-group">
              <label>资料类型</label>
              <select v-model="importForm.type">
                <option value="document">口径文档 / 业务说明</option>
                <option value="sql">SQL 查询脚本</option>
                <option value="ddl">DDL 建表语句</option>
              </select>
            </div>
          </div>

          <div class="form-group">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <label>资料内容 (粘贴或选择文件)</label>
              <label style="font-size: 0.78rem; color: #2563eb; cursor: pointer;">
                📂 从本地文件读取
                <input type="file" style="display: none;" accept=".md,.sql,.txt,.json" @change="handleFileUpload" />
              </label>
            </div>
            <textarea
              v-model="importForm.content"
              rows="9"
              placeholder="在此粘贴医院口径文本、指标公式说明或 SQL 代码…"
              style="font-family: Consolas, monospace; font-size: 0.85rem;"
            ></textarea>
          </div>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn-secondary" @click="closeImportModal">取消</button>
          <button type="button" class="btn-primary" :disabled="importLoading" @click="submitImport">
            <IconFileImport :size="16" />
            <span>{{ importLoading ? '导入中…' : '立即导入并生成知识卡片' }}</span>
          </button>
        </div>
      </div>
    </div>
    <LocalDashboardAssistant v-if="localAssistantOpen" @close="localAssistantOpen = false" @create="openGeneratedDashboard" />
  </div>
</template>

<style src="../styles/knowledge-manager.css"></style>
