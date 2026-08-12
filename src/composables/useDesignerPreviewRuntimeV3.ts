import { ref, type Ref } from 'vue'
import type { DashboardApplicationV3 } from '../models/dashboard-v3.ts'
import type { DesignerEventRuntimeStatusV3, DesignerEventRuntimeV3 } from '../services/designerEventRuntimeV3.ts'

export function useDesignerPreviewRuntimeV3(options: {
  applicationSnapshot(): DashboardApplicationV3
  createRuntime(application: DashboardApplicationV3, onStatus: (status: DesignerEventRuntimeStatusV3) => void): DesignerEventRuntimeV3
  activePageId: Ref<string>
  preparePage?(signal: AbortSignal): Promise<void>
}) {
  const status = ref<DesignerEventRuntimeStatusV3>({ state: 'idle', message: '预览事件待命' })
  const ready = ref(false)
  let runtime: DesignerEventRuntimeV3 | undefined
  let preparation: AbortController | undefined
  let epoch = 0
  const stop = () => { ready.value = false; epoch++; preparation?.abort(); preparation = undefined; runtime?.cancel(); runtime = undefined }
  const start = async () => {
    stop()
    const currentEpoch = epoch
    const controller = new AbortController(); preparation = controller
    const application = options.applicationSnapshot()
    runtime = options.createRuntime(application, (next) => { if (currentEpoch === epoch) status.value = next })
    try { await options.preparePage?.(controller.signal) } catch (reason) { if (controller.signal.aborted || currentEpoch !== epoch) return; status.value = { state: 'failed', message: reason instanceof Error ? reason.message : '预览页面加载失败' }; return }
    if (controller.signal.aborted || currentEpoch !== epoch) return
    await runtime.triggerPageEnter(options.activePageId.value)
    if (!controller.signal.aborted && currentEpoch === epoch) ready.value = true
  }
  const pageChanged = async () => { await start() }
  const componentClick = async (componentId: string) => ready.value ? runtime?.triggerComponentClick(options.activePageId.value, componentId) ?? null : null
  return { status, ready, start, stop, pageChanged, componentClick, invalidate: stop }
}
