<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import {
  IconChevronLeft, IconChevronRight, IconDatabase, IconSearch, IconTable,
  IconX,
} from '@tabler/icons-vue'

export interface CatalogField { name: string; type: string }
export interface CatalogDataset {
  id: string
  name: string
  dataSourceId: string
  sourceName: string
  notes: string
  fields: CatalogField[]
  updatedAt: string
}

defineProps<{ currentId?: string }>()
const emit = defineEmits<{ choose: [dataset: CatalogDataset]; close: [] }>()

const items = ref<CatalogDataset[]>([])
const sources = ref<Array<{ id: string; name: string }>>([])
const query = ref('')
const sourceId = ref('')
const page = ref(1)
const total = ref(0)
const loading = ref(false)
const error = ref('')
const pageSize = 12
let searchTimer: number | undefined

const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)))

onMounted(async () => {
  await Promise.all([loadSources(), loadDatasets()])
})

watch([query, sourceId], () => {
  page.value = 1
  window.clearTimeout(searchTimer)
  searchTimer = window.setTimeout(loadDatasets, 240)
})

async function loadSources() {
  try {
    sources.value = await request('/api/datasources')
  } catch { sources.value = [] }
}

async function loadDatasets() {
  loading.value = true
  error.value = ''
  try {
    const params = new URLSearchParams({
      paged: '1', q: query.value, sourceId: sourceId.value,
      limit: String(pageSize), offset: String((page.value - 1) * pageSize),
    })
    const result = await request(`/api/datasets?${params}`)
    items.value = result.items
    total.value = result.total
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : '数据集目录加载失败'
  } finally { loading.value = false }
}

async function changePage(next: number) {
  page.value = Math.min(Math.max(next, 1), pageCount.value)
  await loadDatasets()
}

async function request(path: string) {
  const response = await fetch(path)
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || `请求失败（${response.status}）`)
  return result
}

function fieldSummary(dataset: CatalogDataset) {
  return dataset.fields.slice(0, 4).map((field) => field.name).join(' · ')
}
</script>

<template>
  <div class="dataset-catalog-mask" role="presentation" @mousedown.self="emit('close')">
    <section class="dataset-catalog-dialog" role="dialog" aria-modal="true" aria-labelledby="catalog-title">
      <header>
        <div><small>DATASET CATALOG</small><h2 id="catalog-title">选择已保存数据集</h2><p>按名称、备注或字段搜索；数据集较多时按数据源筛选和分页浏览。</p></div>
        <button type="button" aria-label="关闭数据集目录" @click="emit('close')"><IconX :size="19" /></button>
      </header>
      <div class="catalog-filters">
        <label><IconSearch :size="16" /><input v-model="query" type="search" placeholder="搜索名称、备注或字段" aria-label="搜索数据集" /></label>
        <select v-model="sourceId" aria-label="按数据源筛选"><option value="">全部数据源</option><option v-for="source in sources" :key="source.id" :value="source.id">{{ source.name }}</option></select>
        <span>{{ total }} 个数据集</span>
      </div>
      <div class="catalog-content" :class="{ loading }">
        <div v-if="error" class="catalog-state error">{{ error }}</div>
        <div v-else-if="!items.length && !loading" class="catalog-state"><IconDatabase :size="30" /><b>没有匹配的数据集</b><span>请调整搜索条件，或先前往数据源页面保存数据集。</span></div>
        <button v-for="dataset in items" v-else :key="dataset.id" type="button" class="catalog-item" :class="{ selected: dataset.id === currentId }" @click="emit('choose', dataset)">
          <span class="catalog-item-icon"><IconTable :size="19" /></span>
          <span class="catalog-item-main"><b>{{ dataset.name }}</b><small>{{ dataset.notes || '暂无备注' }}</small><em>{{ fieldSummary(dataset) || '尚未识别字段' }}</em></span>
          <span class="catalog-item-meta"><i>{{ dataset.sourceName }}</i><small>{{ dataset.fields.length }} 字段</small></span>
        </button>
      </div>
      <footer>
        <span>第 {{ page }} / {{ pageCount }} 页，每页 {{ pageSize }} 个</span>
        <div><button type="button" :disabled="page <= 1 || loading" @click="changePage(page - 1)"><IconChevronLeft :size="16" />上一页</button><button type="button" :disabled="page >= pageCount || loading" @click="changePage(page + 1)">下一页<IconChevronRight :size="16" /></button></div>
      </footer>
    </section>
  </div>
</template>

<style src="../styles/dataset-catalog.css"></style>
