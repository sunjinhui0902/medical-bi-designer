<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { DashboardComponent, TableColumnConfig } from '../models/dashboard.ts'
import { paginateRowsV3, resolveTableCellPresentationV3 } from '../services/tableRuntimeV3.ts'

const props = defineProps<{ component: DashboardComponent; rows: Array<Record<string, unknown>>; columns: TableColumnConfig[]; serverTotal?: number }>()
const emit = defineEmits<{ rowClick: [row: Record<string, unknown>]; pageChange: [page: number, pageSize: number] }>()
const page = ref(1)
const pageSize = computed(() => props.component.tableConfig?.pagination?.pageSize ?? 20)
const paginationEnabled = computed(() => props.component.tableConfig?.pagination?.enabled !== false)
const serverMode = computed(() => paginationEnabled.value && props.component.tableConfig?.pagination?.mode === 'server')
const pageResult = computed(() => serverMode.value
  ? { rows: props.rows, page: page.value, pageSize: pageSize.value, pageCount: Math.max(1, Math.ceil((props.serverTotal ?? props.rows.length) / pageSize.value)), total: props.serverTotal ?? props.rows.length, offset: (page.value - 1) * pageSize.value }
  : paginationEnabled.value
  ? paginateRowsV3(props.rows, { page: page.value, pageSize: pageSize.value })
  : { rows: props.rows, page: 1, pageSize: props.rows.length || 1, pageCount: 1, total: props.rows.length, offset: 0 })

watch([() => props.rows, pageSize], () => { page.value = Math.min(page.value, pageResult.value.pageCount) })
onMounted(() => { if (serverMode.value) emit('pageChange', 1, pageSize.value) })
function changePage(next: number) { page.value = Math.min(Math.max(next, 1), pageResult.value.pageCount); if (serverMode.value) emit('pageChange', page.value, pageSize.value) }

function format(value: unknown, kind: TableColumnConfig['format']): string {
  if (value === null || value === undefined) return '-'
  if (kind === 'number' && typeof value === 'number') return new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 2 }).format(value)
  if (kind === 'percentage' && typeof value === 'number') return `${value.toFixed(1)}%`
  if (kind === 'date') { const parsed = new Date(String(value)); return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleDateString('zh-CN') }
  return String(value)
}

function cellPresentation(row: Record<string, unknown>, field: string) {
  return resolveTableCellPresentationV3(props.component.tableConfig?.conditionalRules ?? [], row, field)
}

function cellStyle(row: Record<string, unknown>, field: string) {
  const presentation = cellPresentation(row, field)
  return { backgroundColor: presentation.backgroundColor, color: presentation.textColor }
}

function summary(column: TableColumnConfig): unknown {
  const values = props.rows.map((row) => row[column.field]).filter((value): value is number => typeof value === 'number')
  if (column.summary === 'count') return props.rows.length
  if (!values.length || column.summary === 'none') return ''
  const total = values.reduce((sum, value) => sum + value, 0)
  return column.summary === 'avg' ? total / values.length : total
}
</script>

<template>
  <section class="table-runtime-v3">
    <div class="table-scroll-v3">
      <table :class="{ striped: component.tableConfig?.striped, 'fixed-header': component.tableConfig?.fixedHeader !== false }">
        <thead v-if="component.tableConfig?.showHeader !== false"><tr><th v-for="column in columns" :key="column.field" :style="{ width: `${column.width}px` }">{{ column.label }}</th></tr></thead>
        <tbody><tr v-for="(row, index) in pageResult.rows" :key="`${pageResult.offset + index}`" @click.stop="emit('rowClick', row)"><td v-for="column in columns" :key="column.field" :style="cellStyle(row, column.field)" :data-rule-ids="cellPresentation(row, column.field).matchedRuleIds.join(',')"><span :class="cellPresentation(row, column.field).badge ? `risk-badge risk-${cellPresentation(row, column.field).badge}` : ''">{{ format(row[column.field], column.format) }}</span></td></tr></tbody>
        <tfoot v-if="columns.some((column) => column.summary !== 'none')"><tr><td v-for="column in columns" :key="column.field">{{ format(summary(column), column.format) }}</td></tr></tfoot>
      </table>
    </div>
    <footer v-if="paginationEnabled && pageResult.pageCount > 1" class="table-pagination-v3">
      <span v-if="component.tableConfig?.pagination?.showTotal !== false">共 {{ pageResult.total }} 条</span>
      <button type="button" :disabled="pageResult.page <= 1" @click.stop="changePage(pageResult.page - 1)">上一页</button>
      <b>{{ pageResult.page }} / {{ pageResult.pageCount }}</b>
      <button type="button" :disabled="pageResult.page >= pageResult.pageCount" @click.stop="changePage(pageResult.page + 1)">下一页</button>
    </footer>
  </section>
</template>

<style scoped>
.table-runtime-v3{display:flex;flex-direction:column;width:100%;height:100%;min-height:0;color:var(--theme-text,#203246)}.table-scroll-v3{flex:1;min-height:0;overflow:auto;border:1px solid color-mix(in srgb,var(--theme-border,#dbe5ec) 72%,transparent);border-radius:4px}.table-runtime-v3 table{width:100%;border-collapse:separate;border-spacing:0;font-size:11px}.table-runtime-v3 th,.table-runtime-v3 td{height:38px;box-sizing:border-box;padding:8px 12px;border:0;border-bottom:1px solid color-mix(in srgb,var(--theme-border,#dbe5ec) 58%,transparent);text-align:left;white-space:nowrap}.table-runtime-v3 th{height:42px;color:var(--theme-text-secondary,#64748b);font-size:10px;font-weight:650;letter-spacing:.03em;background:color-mix(in srgb,var(--theme-panel,#fff) 86%,#2fb8f2 14%)}.fixed-header thead th{position:sticky;top:0;z-index:2}.table-runtime-v3 tbody tr{background:transparent;transition:background 120ms ease}.table-runtime-v3 table.striped tbody tr:nth-child(even){background:color-mix(in srgb,var(--theme-panel,#fff) 93%,var(--theme-text,#203246) 7%)}.table-runtime-v3 tbody tr:hover{background:color-mix(in srgb,var(--theme-panel,#fff) 84%,#2fb8f2 16%);cursor:pointer}.table-runtime-v3 tbody tr:last-child td{border-bottom:0}.risk-badge{display:inline-flex;min-width:54px;justify-content:center;padding:3px 8px;border:1px solid currentColor;border-radius:3px;font-size:9px;font-weight:650;letter-spacing:.02em}.risk-normal{background:#15302d;color:#62d3b2}.risk-warning{background:#32291a;color:#f5ca6a}.risk-danger{background:#321820;color:#ff929b}.table-runtime-v3 tfoot td{font-weight:650;background:color-mix(in srgb,var(--theme-panel,#fff) 86%,var(--theme-text,#203246) 14%)}.table-pagination-v3{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:9px 2px 0;color:var(--theme-text-secondary,#64748b);font-size:10px}.table-pagination-v3 span{margin-right:auto}.table-pagination-v3 button{border:1px solid var(--theme-border,#dbe5ec);border-radius:4px;background:transparent;color:inherit;padding:4px 9px}.table-pagination-v3 button:hover:not(:disabled){color:var(--theme-text,#203246);border-color:#2fb8f2}.table-pagination-v3 button:disabled{opacity:.35}
.table-runtime-v3 table td{color:var(--theme-text,#203246)}
</style>
