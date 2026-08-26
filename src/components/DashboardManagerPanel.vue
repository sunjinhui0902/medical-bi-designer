<script setup lang="ts">
import { ref, watch } from 'vue'
import { IconLayoutDashboard, IconPlus, IconTrash, IconX } from '@tabler/icons-vue'

const props = defineProps<{
  open: boolean
  activeDashboardId: string
  dashboards: Array<{ id: string; name: string; pageCount: number }>
  createDashboard: (name: string) => string | null
  deleteDashboard: (dashboardId: string) => string | null
}>()

const emit = defineEmits<{
  close: []
  select: [dashboardId: string]
}>()

const name = ref('')
const error = ref('')
const pendingDeleteId = ref('')
const pendingDelete = () => props.dashboards.find((item) => item.id === pendingDeleteId.value)

watch(() => props.open, (open) => {
  if (!open) return
  name.value = `新看板 ${props.dashboards.length + 1}`
  error.value = ''
})

function submit() {
  const value = name.value.trim()
  if (!value) return
  error.value = props.createDashboard(value) ?? ''
  if (!error.value) emit('close')
}

function confirmDelete() {
  if (!pendingDeleteId.value) return
  error.value = props.deleteDashboard(pendingDeleteId.value) ?? ''
  if (!error.value) pendingDeleteId.value = ''
}
</script>

<template>
  <div v-if="open" class="dashboard-manager-mask" role="presentation" @click.self="emit('close')">
    <section class="dashboard-manager" role="dialog" aria-modal="true" aria-label="看板管理">
      <header><div><IconLayoutDashboard :size="21" /><span><b>看板管理</b><small>一个看板可包含多个画布</small></span></div><button type="button" aria-label="关闭看板管理" @click="emit('close')"><IconX :size="17" /></button></header>
      <div class="dashboard-manager-list" role="listbox" aria-label="本机看板列表">
        <div v-for="dashboard in dashboards" :key="dashboard.id" class="dashboard-manager-row" :class="{ active: dashboard.id === activeDashboardId }">
          <button type="button" role="option" :aria-selected="dashboard.id === activeDashboardId" @click="emit('select', dashboard.id)"><IconLayoutDashboard :size="18" /><span><b>{{ dashboard.name }}</b><small>{{ dashboard.pageCount }} 个画布</small></span><em>{{ dashboard.id === activeDashboardId ? '当前' : '切换' }}</em></button>
          <button type="button" class="delete-dashboard" :disabled="dashboards.length <= 1" :aria-label="`删除看板${dashboard.name}`" @click="pendingDeleteId = dashboard.id"><IconTrash :size="15" /></button>
        </div>
      </div>
      <form @submit.prevent="submit"><label>新看板名称<input v-model="name" maxlength="60" required /></label><button type="submit"><IconPlus :size="15" />新建看板</button><p v-if="error" role="alert">{{ error }}</p></form>
      <div v-if="pendingDeleteId" class="dashboard-delete-mask" role="presentation" @click.self="pendingDeleteId = ''"><section role="alertdialog" aria-modal="true" aria-label="确认删除看板"><IconTrash :size="23" /><h3>删除“{{ pendingDelete()?.name }}”？</h3><p>该看板的全部画布、组件和参数配置将从本机工作区移除，此操作无法撤销。</p><div><button type="button" @click="pendingDeleteId = ''">取消</button><button type="button" class="danger" @click="confirmDelete">确认删除</button></div></section></div>
    </section>
  </div>
</template>

<style scoped>
.dashboard-manager-mask{position:fixed;inset:0;z-index:130;display:grid;place-items:center;padding:20px;background:rgba(15,23,42,.46)}
.dashboard-manager{width:min(520px,94vw);overflow:hidden;color:#334155;background:#fff;border:1px solid #d7e1e8;border-radius:12px;box-shadow:0 28px 80px rgba(15,23,42,.3)}
.dashboard-manager header,.dashboard-manager header>div,.dashboard-manager-list button,.dashboard-manager form{display:flex;align-items:center}
.dashboard-manager header{justify-content:space-between;padding:17px 19px;border-bottom:1px solid #e2e8f0}.dashboard-manager header>div{gap:10px;color:#1477c9}.dashboard-manager header span{display:grid;gap:2px}.dashboard-manager header b{color:#243447;font-size:15px}.dashboard-manager header small{color:#7a8795;font-size:10px}.dashboard-manager header button{display:grid;place-items:center;width:30px;height:30px;color:#64748b;background:#f1f5f9;border:0;border-radius:6px}
.dashboard-manager-list{display:grid;gap:7px;max-height:330px;padding:14px 18px;overflow:auto}.dashboard-manager-row{display:grid;grid-template-columns:minmax(0,1fr) 34px;gap:5px}.dashboard-manager-list button{gap:10px;width:100%;padding:11px 12px;text-align:left;color:#64748b;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px}.dashboard-manager-row.active>button:first-child{color:#1477c9;background:#eff8ff;border-color:#8dc4ea}.dashboard-manager-list span{display:grid;flex:1;gap:2px}.dashboard-manager-list b{color:#334155;font-size:12px}.dashboard-manager-list small{font-size:9px}.dashboard-manager-list em{font-size:9px;font-style:normal}.dashboard-manager-list .delete-dashboard{display:grid;place-items:center;padding:0;color:#b42318;background:#fff}.dashboard-manager-list .delete-dashboard:disabled{color:#94a3b8;cursor:not-allowed;opacity:.45}
.dashboard-manager form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;padding:15px 18px;background:#f8fafc;border-top:1px solid #e2e8f0}.dashboard-manager label{display:grid;gap:4px;color:#64748b;font-size:9px}.dashboard-manager input{height:34px;padding:0 10px;color:#334155;background:#fff;border:1px solid #cbd5e1;border-radius:6px}.dashboard-manager form button{display:flex;align-items:center;gap:5px;height:34px;padding:0 13px;color:#fff;background:#1477c9;border:0;border-radius:6px}.dashboard-manager form p{grid-column:1/-1;margin:0;color:#b42318;font-size:10px}
.dashboard-delete-mask{position:fixed;inset:0;z-index:1;display:grid;place-items:center;padding:20px;background:rgba(15,23,42,.45)}.dashboard-delete-mask section{width:min(390px,92vw);padding:23px;text-align:center;background:#fff;border-radius:10px;box-shadow:0 20px 60px rgba(15,23,42,.28)}.dashboard-delete-mask svg{color:#b42318}.dashboard-delete-mask h3{margin:9px 0 5px;font-size:16px}.dashboard-delete-mask p{margin:0;color:#64748b;font-size:10px;line-height:1.7}.dashboard-delete-mask section div{display:flex;justify-content:center;gap:8px;margin-top:16px}.dashboard-delete-mask button{height:33px;padding:0 13px;color:#475569;background:#fff;border:1px solid #cbd5e1;border-radius:6px}.dashboard-delete-mask .danger{color:#fff;background:#b42318;border-color:#b42318}
</style>
