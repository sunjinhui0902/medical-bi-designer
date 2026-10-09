<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import type { DashboardComponent } from '../models/dashboard'
import { compositionScopeV3, compositionMembersV3, compositionBoundsV3, createCompositionV3, dissolveCompositionV3, transformCompositionV3, reorderCompositionV3 } from '../services/componentCompositionV3'
import { tabOwnerForComponentV3, tabContentSizeV3 } from '../services/tabContainerV3'
const props = defineProps<{ components: DashboardComponent[]; selectedId: string; canvas: { width: number; height: number } }>()
const emit = defineEmits<{ close: []; select: [id: string]; dirty: []; highlight: [ids: string[]] }>()
const selected = computed(() => props.components.find(item => item.id === props.selectedId))
const scope = computed(() => compositionScopeV3(props.components, props.selectedId))
const layers = computed(() => props.components.filter(item => compositionScopeV3(props.components, item.id) === scope.value).sort((a, b) => b.position.zIndex - a.position.zIndex))
const members = computed(() => compositionMembersV3(props.components, props.selectedId))
const checked = ref<string[]>([]), error = ref(''), status = ref(''), dialog = ref<HTMLElement>()
watch(checked, ids => emit('highlight', [...ids]), { deep: true })
onUnmounted(() => emit('highlight', []))
const box = reactive({ x: 0, y: 0, width: 100, height: 100 })
const proportional = ref(true)
const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
function syncBox() { if (members.value.length) Object.assign(box, compositionBoundsV3(members.value)) }
watch(() => props.selectedId, () => { error.value = ''; syncBox() }, { immediate: true })
watch(scope, () => { checked.value = []; error.value = '' })
function run(action: () => void, message: string) {
  error.value = ''; status.value = ''
  try { action(); syncBox(); emit('dirty'); status.value = message } catch (reason) { error.value = reason instanceof Error ? reason.message : '操作失败' }
}
function combine() { run(() => {
  createCompositionV3(props.components, checked.value, `group_${crypto.randomUUID()}`)
  emit('select', checked.value[0]!); checked.value = []
}, '已组合；拖动任一成员可整体移动') }
function dissolve() { run(() => dissolveCompositionV3(props.components, props.selectedId), '已取消组合，位置保持') }
function layer(direction: 'top' | 'bottom' | 'up' | 'down') { run(() => reorderCompositionV3(props.components, props.selectedId, direction), '图层顺序已更新') }
function changeWidth() { if (proportional.value && members.value.length) { const original = compositionBoundsV3(members.value); box.height = Math.round(box.width * original.height / original.width) } }
function applyBox() { run(() => {
  const owner = tabOwnerForComponentV3(props.components, props.selectedId)
  const limits = owner ? tabContentSizeV3(owner.tab, owner.item) : { ...props.canvas, padding: 0 }
  transformCompositionV3(props.components, Object.fromEntries(members.value.map(item => [item.id, { ...item.position }])), { ...box, zIndex: 1 }, limits)
}, '组合位置与尺寸已应用') }
function changeTransparent(event: Event) {
  if (!selected.value) return
  const style = selected.value.styleConfig
  if ((event.target as HTMLInputElement).checked) {
    if (style.background !== 'transparent') style.backgroundBeforeTransparent = style.background
    style.background = 'transparent'
  } else style.background = style.backgroundBeforeTransparent ?? '#ffffff'
  emit('dirty')
}
function changeBackground(event: Event) { if (!selected.value) return; selected.value.styleConfig.background = (event.target as HTMLInputElement).value; emit('dirty') }
function changePointer(event: Event) { if (!selected.value) return; selected.value.styleConfig.pointerEvents = (event.target as HTMLInputElement).checked ? 'none' : 'auto'; emit('dirty') }
function key(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); emit('close') }
  if (event.key !== 'Tab') return
  const targets = [...dialog.value!.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)')]
  const first = targets[0], last = targets.at(-1)
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
  if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
}
onMounted(async () => { await nextTick(); dialog.value?.querySelector<HTMLButtonElement>('button')?.focus() })
onUnmounted(() => { if (opener?.isConnected) opener.focus() })
</script>

<template>
  <div class="composition-backdrop" @pointerdown.stop>
    <section ref="dialog" role="dialog" aria-modal="true" aria-label="图层与组合" class="composition-dialog" @keydown.stop="key">
      <header><div><h2>图层与组合</h2><p>勾选同一画布或同一 Tab 内容页的组件进行组合。</p></div><button type="button" aria-label="关闭图层与组合" @click="emit('close')">关闭</button></header>
      <div class="composition-columns">
        <section class="composition-layers"><h3>{{ scope === 'canvas' ? '当前画布' : '当前 Tab 内容页' }} · 上层在前</h3>
          <label v-for="item in layers" :key="item.id" :class="{ chosen: item.id === selectedId }">
            <input v-model="checked" :value="item.id" type="checkbox" :disabled="item.type === 'tabs'" :aria-label="`选择组合成员：${item.title}`" />
            <button type="button" :aria-label="`选择图层：${item.title}`" @click="emit('select', item.id)">{{ item.title }}<small>{{ item.type }}{{ item.groupId ? ' · 已组合' : '' }}{{ item.styleConfig.pointerEvents === 'none' ? ' · 点击穿透' : '' }}</small></button>
          </label>
          <button type="button" :disabled="checked.length < 2" @click="combine">组合选中组件</button>
          <p>Tab 容器不参与组合。跨页签移动请先取消组合。</p>
        </section>
        <section v-if="selected" class="composition-settings"><h3>{{ selected.title }}</h3>
          <div class="composition-layer-actions"><button @click="layer('top')">置顶</button><button @click="layer('up')">上移一层</button><button @click="layer('down')">下移一层</button><button @click="layer('bottom')">置底</button></div>
          <label><input type="checkbox" :checked="selected.styleConfig.background === 'transparent'" @change="changeTransparent" />透明背景（保留内容颜色）</label>
          <label>背景色<input type="color" :value="/^#[0-9a-f]{6}$/i.test(selected.styleConfig.background) ? selected.styleConfig.background : '#ffffff'" @input="changeBackground" /></label>
          <label><input type="checkbox" :checked="selected.styleConfig.pointerEvents === 'none'" @change="changePointer" />预览点击穿透</label>
          <p>开启后，点击交给下层组件，本组件的交互不会执行。设计态可通过此列表选中编辑。</p>
          <template v-if="selected.groupId"><h3>当前组合 · {{ members.length }} 个成员</h3>
            <div class="composition-box"><label>X<input v-model.number="box.x" aria-label="组合 X" type="number" /></label><label>Y<input v-model.number="box.y" aria-label="组合 Y" type="number" /></label><label>宽度<input v-model.number="box.width" aria-label="组合宽度" type="number" @change="changeWidth" /></label><label>高度<input v-model.number="box.height" aria-label="组合高度" type="number" /></label></div>
            <label><input v-model="proportional" type="checkbox" />调整宽度时保持比例</label>
            <div class="composition-layer-actions"><button @click="applyBox">应用组合位置与尺寸</button><button @click="dissolve">取消当前组合</button></div>
            <p>整体拖动与八方向缩放均保持成员相对位置；手机预览将组合整体重排。</p>
          </template>
          <p v-if="error" role="alert" class="composition-error">{{ error }}</p><p v-if="status" role="status">{{ status }}</p>
        </section>
      </div>
    </section>
  </div>
</template>

<style scoped>
.composition-backdrop{position:fixed;inset:0;z-index:3000;background:#0f172a66;display:grid;place-items:center;padding:24px}.composition-dialog{width:min(850px,96vw);max-height:90vh;overflow:auto;border-radius:12px;background:#fff;color:#243447;box-shadow:0 24px 80px #0004;padding:22px}.composition-dialog header{display:flex;justify-content:space-between;gap:20px}.composition-dialog h2{font-size:20px;margin:0}.composition-dialog h3{font-size:14px}.composition-dialog p{font-size:12px;line-height:1.7;color:#64748b}.composition-columns{display:grid;grid-template-columns:minmax(200px,1fr) minmax(240px,1.1fr);gap:24px}.composition-layers>label{display:flex;gap:8px;padding:8px;border:1px solid #e2e8f0;border-radius:6px;margin-bottom:6px}.composition-layers>label.chosen{border-color:#1477c9;background:#eff6ff}.composition-layers label button{flex:1;text-align:left;border:0;background:transparent;padding:0}.composition-layers small{display:block;color:#64748b;font-size:11px;margin-top:4px}.composition-dialog button{border:1px solid #cbd5e1;background:#f8fafc;border-radius:6px;padding:8px 10px;color:#243447;cursor:pointer}.composition-dialog button:disabled{opacity:.4;cursor:default}.composition-layer-actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}.composition-settings>label{display:flex;align-items:center;gap:8px;margin:14px 0;font-size:13px}.composition-box{display:grid;grid-template-columns:1fr 1fr;gap:10px}.composition-box label{font-size:12px}.composition-box input{width:100%;padding:8px;border:1px solid #cbd5e1;border-radius:5px}.composition-error{color:#b42318!important}
</style>
