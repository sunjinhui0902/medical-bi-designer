import type { Directive } from 'vue'

const cleanups = new WeakMap<HTMLElement, () => void>()
export const vFloatingPanel: Directive<HTMLElement> = {
  mounted(root) {
    const panel = root.querySelector<HTMLElement>('[role="dialog"]')
    const header = panel?.querySelector<HTMLElement>('header')
    if (!panel || !header) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    root.dataset.floatingPanel = 'true'
    panel.setAttribute('aria-modal', 'false')
    header.title = '拖动标题栏移动窗口；画布中的选中组件会高亮'
    header.style.cursor = 'move'; header.style.touchAction = 'none'
    let drag: { x: number; y: number; left: number; top: number } | undefined
    const stop = () => { drag = undefined; window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); window.removeEventListener('pointercancel', stop) }
    const move = (event: PointerEvent) => {
      if (!drag) return
      panel.style.left = `${Math.max(8, Math.min(window.innerWidth - panel.offsetWidth - 8, drag.left + event.clientX - drag.x))}px`
      panel.style.top = `${Math.max(8, Math.min(window.innerHeight - 56, drag.top + event.clientY - drag.y))}px`
    }
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('button,input,select,a,textarea')) return
      event.preventDefault(); const rect = panel.getBoundingClientRect()
      Object.assign(panel.style, { position: 'fixed', margin: '0', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, maxHeight: 'calc(100vh - 16px)' })
      drag = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top }
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', stop); window.addEventListener('pointercancel', stop)
    }
    header.addEventListener('pointerdown', down)
    cleanups.set(root, () => { stop(); header.removeEventListener('pointerdown', down); if (opener?.isConnected) opener.focus() })
  },
  unmounted(root) { cleanups.get(root)?.(); cleanups.delete(root) },
}
