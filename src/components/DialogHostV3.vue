<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'
import type { DashboardPageV3, JsonObjectV3 } from '../models/dashboard-v3.ts'
import type { DialogSessionEntryV3 } from '../services/pageSessionRuntimeV3.ts'
import type { DialogResizeDirectionV3 } from '../services/dialogGeometryV3.ts'

const props = defineProps<{ dialogs: DialogSessionEntryV3[]; pages: DashboardPageV3[]; componentRows: (componentId: string) => JsonObjectV3[] }>()
const emit = defineEmits<{
  dismiss: [reason: 'button' | 'escape' | 'backdrop']
  move: [instanceId: string, x: number, y: number]
  resize: [instanceId: string, direction: DialogResizeDirectionV3, deltaX: number, deltaY: number]
  componentClick: [pageId: string, componentId: string, datum: JsonObjectV3]
  componentRowClick: [pageId: string, componentId: string, row: JsonObjectV3]
}>()
const dialogRoots = new Map<string, HTMLElement>()
const openers = new Map<string, HTMLElement>()
let pointer: { mode: 'move' | 'resize'; instanceId: string; direction?: DialogResizeDirectionV3; startX: number; startY: number; x: number; y: number } | undefined
let backdropPointer = false

function page(entry: DialogSessionEntryV3) { return props.pages.find((item) => item.id === entry.pageId) }
function setRoot(instanceId: string, element: Element | null) { if (element instanceof HTMLElement) dialogRoots.set(instanceId, element); else dialogRoots.delete(instanceId) }
function focusTop() {
  const top = props.dialogs.at(-1); if (!top) return
  const root = dialogRoots.get(top.instanceId); if (!root) return
  const focusable = root.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ;(focusable ?? root).focus()
}
function startPointer(event: PointerEvent, entry: DialogSessionEntryV3, mode: 'move' | 'resize', direction?: DialogResizeDirectionV3) {
  if ((mode === 'move' && !entry.presentation.draggable) || (mode === 'resize' && !entry.presentation.resizable)) return
  event.preventDefault(); event.stopPropagation()
  pointer = { mode, instanceId: entry.instanceId, direction, startX: event.clientX, startY: event.clientY, x: entry.geometry.x, y: entry.geometry.y }
  window.addEventListener('pointermove', handlePointer)
  window.addEventListener('pointerup', stopPointer, { once: true })
}
function handlePointer(event: PointerEvent) {
  if (!pointer) return
  const deltaX = event.clientX - pointer.startX; const deltaY = event.clientY - pointer.startY
  if (pointer.mode === 'move') emit('move', pointer.instanceId, pointer.x + deltaX, pointer.y + deltaY)
  else emit('resize', pointer.instanceId, pointer.direction!, deltaX, deltaY)
  pointer.startX = event.clientX; pointer.startY = event.clientY
  if (pointer.mode === 'move') { pointer.x += deltaX; pointer.y += deltaY }
}
function stopPointer() { pointer = undefined; window.removeEventListener('pointermove', handlePointer) }
function handleKeydown(event: KeyboardEvent) {
  const top = props.dialogs.at(-1); if (!top || event.isComposing) return
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); emit('dismiss', 'escape'); return }
  if (event.key !== 'Tab') return
  const root = dialogRoots.get(top.instanceId); if (!root) return
  const focusable = [...root.querySelectorAll<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')]
  if (!focusable.length) { event.preventDefault(); root.focus(); return }
  const first = focusable[0]; const last = focusable.at(-1)!
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
function backdropDown(event: PointerEvent) { backdropPointer = event.target === event.currentTarget }
function backdropUp(event: PointerEvent) { if (backdropPointer && event.target === event.currentTarget) emit('dismiss', 'backdrop'); backdropPointer = false }

watch(() => props.dialogs.map((item) => item.instanceId), async (next, previous = []) => {
  const opened = next.find((id) => !previous.includes(id))
  const closed = previous.find((id) => !next.includes(id))
  if (opened && document.activeElement instanceof HTMLElement) openers.set(opened, document.activeElement)
  await nextTick()
  if (opened) focusTop()
  if (closed) { const opener = openers.get(closed); openers.delete(closed); if (opener?.isConnected) opener.focus(); else focusTop() }
}, { immediate: true })
</script>

<template>
  <div v-if="dialogs.length" class="dialog-host-v3" @keydown="handleKeydown">
    <div
      v-for="(entry, index) in dialogs" :key="entry.instanceId"
      class="dialog-backdrop-v3" :class="{ 'is-top': index === dialogs.length - 1 }"
      :aria-hidden="index !== dialogs.length - 1" :inert="index !== dialogs.length - 1"
      @pointerdown="index === dialogs.length - 1 && backdropDown($event)" @pointerup="index === dialogs.length - 1 && backdropUp($event)"
    >
      <section
        :ref="(element) => setRoot(entry.instanceId, element as Element | null)" class="dialog-window-v3" role="dialog" aria-modal="true" tabindex="-1"
        :aria-label="page(entry)?.name ?? '运行时弹窗'"
        :style="{ left: `${entry.geometry.x}px`, top: `${entry.geometry.y}px`, width: `${entry.geometry.width}px`, height: `${entry.geometry.height}px` }"
        @pointerdown.stop
      >
        <header class="dialog-titlebar-v3" @pointerdown="startPointer($event, entry, 'move')"><div><small>DIALOG RUNTIME</small><h2>{{ page(entry)?.name ?? entry.pageId }}</h2></div><button type="button" aria-label="关闭弹窗" @pointerdown.stop @click="emit('dismiss', 'button')">×</button></header>
        <div class="dialog-content-v3">
          <article v-for="component in page(entry)?.components ?? []" :key="component.id" :data-component-id="component.id" role="button" tabindex="0" @click="emit('componentClick', entry.pageId, component.id, componentRows(component.id)[0] ?? {})" @keydown.enter.prevent="emit('componentClick', entry.pageId, component.id, componentRows(component.id)[0] ?? {})">
            <b>{{ component.title }}</b><span>{{ component.type }}</span>
            <button v-for="(row, rowIndex) in componentRows(component.id).slice(0, 20)" :key="rowIndex" type="button" class="dialog-row-v3" @click.stop="emit('componentRowClick', entry.pageId, component.id, row)">{{ Object.values(row).join(' · ') }}</button>
          </article>
          <p v-if="!(page(entry)?.components.length)">此弹窗页面暂无组件。</p>
        </div>
        <i v-for="direction in ['n','ne','e','se','s','sw','w','nw'] as DialogResizeDirectionV3[]" :key="direction" class="dialog-resize-v3" :class="`is-${direction}`" :aria-label="`${direction} 调整弹窗大小`" @pointerdown="startPointer($event, entry, 'resize', direction)"></i>
      </section>
    </div>
  </div>
</template>

<style scoped>
.dialog-host-v3,.dialog-backdrop-v3{position:fixed;inset:0;z-index:3000}.dialog-backdrop-v3{background:rgba(15,23,42,.28);pointer-events:none}.dialog-backdrop-v3.is-top{pointer-events:auto}.dialog-window-v3{position:absolute;display:grid;grid-template-rows:auto 1fr;overflow:hidden;border:1px solid #94a3b8;border-radius:12px;background:#fff;box-shadow:0 24px 80px rgba(15,23,42,.32)}
.dialog-titlebar-v3{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #e2e8f0;cursor:move;user-select:none}.dialog-titlebar-v3 small{color:#2563eb;font:700 9px ui-monospace,monospace;letter-spacing:.14em}.dialog-titlebar-v3 h2{margin:2px 0 0;font-size:17px}.dialog-titlebar-v3 button{width:32px;height:32px;border:1px solid #cbd5e1;border-radius:7px;background:#fff;font-size:22px;cursor:pointer}.dialog-content-v3{overflow:auto;padding:16px}.dialog-content-v3 article{display:flex;flex-wrap:wrap;justify-content:space-between;gap:8px;margin-bottom:8px;padding:12px;border:1px solid #e2e8f0;border-radius:8px}.dialog-content-v3 article span,.dialog-content-v3 p{color:#64748b;font-size:12px}.dialog-row-v3{flex-basis:100%;padding:7px;border:1px solid #dbe4ee;border-radius:5px;background:#f8fafc;text-align:left}
.dialog-resize-v3{position:absolute;z-index:2}.dialog-resize-v3.is-n,.dialog-resize-v3.is-s{left:10px;right:10px;height:8px;cursor:ns-resize}.dialog-resize-v3.is-n{top:-4px}.dialog-resize-v3.is-s{bottom:-4px}.dialog-resize-v3.is-e,.dialog-resize-v3.is-w{top:10px;bottom:10px;width:8px;cursor:ew-resize}.dialog-resize-v3.is-e{right:-4px}.dialog-resize-v3.is-w{left:-4px}.dialog-resize-v3.is-ne,.dialog-resize-v3.is-se,.dialog-resize-v3.is-sw,.dialog-resize-v3.is-nw{width:14px;height:14px}.dialog-resize-v3.is-ne{right:-5px;top:-5px;cursor:nesw-resize}.dialog-resize-v3.is-se{right:-5px;bottom:-5px;cursor:nwse-resize}.dialog-resize-v3.is-sw{left:-5px;bottom:-5px;cursor:nesw-resize}.dialog-resize-v3.is-nw{left:-5px;top:-5px;cursor:nwse-resize}
</style>
