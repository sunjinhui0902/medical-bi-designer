<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import {
  IconArrowDown,
  IconArrowUp,
  IconBolt,
  IconCopy,
  IconFilePlus,
  IconStar,
  IconTrash,
  IconX,
} from '@tabler/icons-vue'

interface PageListItemV3 {
  id: string
  name: string
  code: string
  order: number
  type: 'standard' | 'dialog'
}

const props = defineProps<{
  pages: PageListItemV3[]
  activePageId: string
  defaultPageId: string
  createPage: (options: { name: string; code: string }) => string | null
  copyPage: (options: { name: string; code: string }) => string | null
}>()

const emit = defineEmits<{
  select: [pageId: string]
  delete: [pageId: string]
  move: [payload: { pageId: string; direction: -1 | 1 }]
  setDefault: [pageId: string]
  configureEvents: [pageId: string]
}>()

const editorMode = ref<'create' | 'copy' | null>(null)
const draftName = ref('')
const draftCode = ref('')
const editorError = ref('')
const confirmedDeletePageId = ref<string | null>(null)
const activeIndex = computed(() => props.pages.findIndex((page) => page.id === props.activePageId))
const activePage = computed(() => props.pages[activeIndex.value])
const confirmingDelete = computed(() => confirmedDeletePageId.value === props.activePageId)
const deleteReason = computed(() => {
  if (props.pages.length === 1) return '不能删除最后一个页面'
  if (props.activePageId === props.defaultPageId) return '请先设置其他默认页，再删除当前页'
  return ''
})

watch(
  [
    () => props.activePageId,
    () => props.defaultPageId,
    () => props.pages.map((page) => page.id).join('\u0000'),
  ],
  () => { confirmedDeletePageId.value = null },
)

function suggestedCode(source: string): string {
  const normalized = source.trim().toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '')
  return /^[a-z]/.test(normalized) ? normalized : `page_${normalized || props.pages.length + 1}`
}

function openEditor(mode: 'create' | 'copy') {
  editorMode.value = mode
  editorError.value = ''
  confirmedDeletePageId.value = null
  if (mode === 'copy' && activePage.value) {
    draftName.value = `${activePage.value.name} 副本`
    draftCode.value = `${activePage.value.code}_copy`
  } else {
    draftName.value = `页面 ${props.pages.length + 1}`
    draftCode.value = `page_${props.pages.length + 1}`
  }
}

function createImmediately() {
  confirmedDeletePageId.value = null
  const sequence = props.pages.length + 1
  const result = props.createPage({ name: `页面 ${sequence}`, code: `page_${Date.now().toString(36)}` })
  if (!result) return
  openEditor('create')
  editorError.value = result
}

function closeEditor() {
  editorMode.value = null
  draftName.value = ''
  draftCode.value = ''
  editorError.value = ''
}

function submitEditor() {
  const options = { name: draftName.value.trim(), code: suggestedCode(draftCode.value) }
  if (!options.name || !options.code) return
  editorError.value = editorMode.value === 'copy' ? props.copyPage(options) ?? '' : props.createPage(options) ?? ''
  if (editorError.value) return
  closeEditor()
}

function requestDelete() {
  if (deleteReason.value) return
  confirmedDeletePageId.value = props.activePageId
}

function confirmDelete() {
  if (!confirmingDelete.value) return
  emit('delete', props.activePageId)
  confirmedDeletePageId.value = null
}
</script>

<template>
  <section class="page-manager" aria-label="页面管理">
    <div class="page-strip" role="tablist" aria-label="页面列表">
      <button
        v-for="page in pages"
        :key="page.id"
        type="button"
        role="tab"
        class="page-tab"
        :class="{ active: page.id === activePageId }"
        :aria-selected="page.id === activePageId"
        :data-page-id="page.id"
        @click="emit('select', page.id)"
      >
        <span>{{ page.order }}</span>
        <b>{{ page.name }}</b>
        <em v-if="page.id === defaultPageId">默认</em>
        <small v-if="page.type === 'dialog'">兼容页</small>
      </button>
    </div>

    <div class="page-actions" aria-label="页面操作">
      <button type="button" class="create-page" title="直接新建画布" aria-label="新建页面" @click="createImmediately"><IconFilePlus :size="15" /><span>新建画布</span></button>
      <button type="button" title="复制当前页面" aria-label="复制当前页面" :disabled="activePage?.type !== 'standard'" @click="openEditor('copy')"><IconCopy :size="15" /></button>
      <button type="button" title="上移当前页面" aria-label="上移当前页面" :disabled="activeIndex <= 0" @click="emit('move', { pageId: activePageId, direction: -1 })"><IconArrowUp :size="15" /></button>
      <button type="button" title="下移当前页面" aria-label="下移当前页面" :disabled="activeIndex < 0 || activeIndex >= pages.length - 1" @click="emit('move', { pageId: activePageId, direction: 1 })"><IconArrowDown :size="15" /></button>
      <button type="button" title="设为默认页" aria-label="设为默认页" :disabled="activePageId === defaultPageId" @click="emit('setDefault', activePageId)"><IconStar :size="15" /></button>
      <button type="button" title="配置页面事件" aria-label="配置页面事件" @click="emit('configureEvents', activePageId)"><IconBolt :size="15" /></button>
      <button
        type="button"
        class="delete-page"
        :title="deleteReason || '删除当前页面'"
        :aria-label="deleteReason || '删除当前页面'"
        :disabled="Boolean(deleteReason)"
        @click="requestDelete"
      ><IconTrash :size="15" /></button>
    </div>

    <div v-if="confirmingDelete" class="delete-dialog-mask" role="presentation" @click.self="confirmedDeletePageId = null">
      <section role="dialog" aria-modal="true" aria-label="确认删除画布" class="delete-dialog">
        <IconTrash :size="22" />
        <h3>删除“{{ activePage?.name }}”？</h3>
        <p>画布中的组件、筛选器和页面事件将一并删除，此操作无法撤销。</p>
        <div><button type="button" @click="confirmedDeletePageId = null">取消</button><button type="button" class="danger" aria-label="确认删除当前页面" @click="confirmDelete">确认删除</button></div>
      </section>
    </div>

    <div v-if="editorMode" class="page-editor-mask" role="presentation" @click.self="closeEditor">
    <form class="page-editor" :aria-label="editorMode === 'copy' ? '复制页面' : '新建页面'" @submit.prevent="submitEditor">
      <label>页面名称<input v-model="draftName" required maxlength="60" /></label>
      <label>页面编码<input v-model="draftCode" required pattern="[a-z][a-z0-9_]*" /></label>
      <button type="submit">{{ editorMode === 'copy' ? '创建副本' : '创建页面' }}</button>
      <button type="button" aria-label="取消页面编辑" @click="closeEditor"><IconX :size="14" /></button>
      <p v-if="editorError" role="alert">{{ editorError }}</p>
    </form>
    </div>
  </section>
</template>

<style scoped>
.page-manager{position:relative;display:flex;align-items:center;gap:10px;min-width:0;padding:5px 12px;background:rgba(255,255,255,.96);border-bottom:1px solid #d9e0e6}
.page-strip{display:flex;flex:1;gap:5px;min-width:0;overflow-x:auto;scrollbar-width:thin}
.page-tab{display:flex;align-items:center;gap:6px;min-width:110px;height:32px;padding:0 9px;color:#637282;background:#f7f9fb;border:1px solid #dfe5eb;border-radius:6px}
.page-tab>span{display:grid;place-items:center;width:18px;height:18px;color:#84919e;font-size:9px;background:#e9eef2;border-radius:50%}
.page-tab b{max-width:130px;overflow:hidden;font-size:10px;text-overflow:ellipsis;white-space:nowrap}
.page-tab em,.page-tab small{padding:2px 4px;font-size:8px;font-style:normal;border-radius:3px}
.page-tab em{color:#1477c9;background:#e7f3fc}.page-tab small{color:#8b6b32;background:#fbf2df}
.page-tab.active{color:#1477c9;background:#eef7fd;border-color:#91c4e8;box-shadow:0 0 0 2px rgba(20,119,201,.08)}
.page-tab.active>span{color:#fff;background:#1477c9}
.page-actions{display:flex;gap:4px;flex:0 0 auto}
.page-actions button{display:flex;align-items:center;justify-content:center;gap:3px;min-width:30px;height:30px;padding:0 6px;color:#526171;background:#fff;border:1px solid #dfe5eb;border-radius:5px}
.page-actions .create-page{padding:0 9px;color:#1477c9;border-color:#9bc9ec}.create-page span{font-size:9px;font-weight:650;white-space:nowrap}
.page-actions button:hover:not(:disabled){color:#1477c9;border-color:#9bc9ec}.page-actions button:disabled{cursor:not-allowed;opacity:.4}
.page-actions .delete-page.confirming{color:#fff;background:#c0392b;border-color:#c0392b}.delete-page span{font-size:9px}
.delete-dialog-mask{position:fixed;inset:0;z-index:120;display:grid;place-items:center;padding:20px;background:rgba(23,35,46,.42)}
.delete-dialog{width:min(390px,92vw);padding:24px;color:#334155;text-align:center;background:#fff;border:1px solid #d9e2e8;border-radius:10px;box-shadow:0 24px 70px rgba(15,23,42,.28)}
.delete-dialog>svg{color:#c0392b}.delete-dialog h3{margin:10px 0 6px;font-size:17px}.delete-dialog p{margin:0;color:#64748b;font-size:11px;line-height:1.7}.delete-dialog div{display:flex;justify-content:center;gap:8px;margin-top:18px}.delete-dialog button{height:34px;padding:0 14px;color:#475569;background:#fff;border:1px solid #cbd5e1;border-radius:6px}.delete-dialog .danger{color:#fff;background:#c0392b;border-color:#c0392b}
.page-editor-mask{position:fixed;inset:0;z-index:119;display:grid;place-items:center;padding:20px;background:rgba(23,35,46,.32)}
.page-editor{display:grid;grid-template-columns:170px 150px auto 30px;gap:7px;align-items:end;padding:16px;background:#fff;border:1px solid #ccd7df;border-radius:9px;box-shadow:0 20px 54px rgba(36,52,71,.24)}
.page-editor label{display:grid;gap:4px;color:#71808e;font-size:9px}.page-editor input{height:30px;padding:0 8px;color:#34495e;border:1px solid #d9e0e6;border-radius:4px}
.page-editor button{height:30px;padding:0 10px;color:#fff;font-size:10px;background:#1477c9;border:0;border-radius:4px}.page-editor button[aria-label="取消页面编辑"]{padding:0;color:#687887;background:#eef2f5}
.page-editor p{grid-column:1/-1;margin:0;color:#b42318;font-size:9px}
@media(max-width:900px){.page-tab{min-width:96px}.page-editor{right:6px;grid-template-columns:140px 120px auto 30px}}
</style>
