import { ref, type Ref } from 'vue'
import type { DashboardApplicationV3, JsonObjectV3 } from '../models/dashboard-v3.ts'
import type { DesignerEventRuntimeStatusV3, DesignerEventRuntimeV3 } from '../services/designerEventRuntimeV3.ts'
import type { DialogResizeDirectionV3 } from '../services/dialogGeometryV3.ts'

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
  const componentClick = async (componentId: string, datum: JsonObjectV3 = {}, pageId = options.activePageId.value) => ready.value ? runtime?.triggerComponentClick(pageId, componentId, datum) ?? null : null
  const componentRowClick = async (componentId: string, row: JsonObjectV3, pageId = options.activePageId.value) => ready.value ? runtime?.triggerComponentRowClick?.(pageId, componentId, row) ?? null : null
  const dismissDialog = (reason: 'button' | 'escape' | 'backdrop') => runtime?.dismissDialog(reason)
  const pageBack = () => runtime?.pageBack()
  const clearInteractions = () => runtime?.clearInteractions()
  const clearLinkage = () => runtime?.clearLinkage()
  const drillBack = (pathId: string) => runtime?.drillBack(pathId)
  const moveDialog = (instanceId: string, x: number, y: number) => runtime?.moveDialog(instanceId, x, y)
  const resizeDialog = (instanceId: string, direction: DialogResizeDirectionV3, deltaX: number, deltaY: number) => runtime?.resizeDialog(instanceId, direction, deltaX, deltaY)
  return { status, ready, start, stop, pageChanged, componentClick, componentRowClick, pageBack, clearInteractions, clearLinkage, drillBack, dismissDialog, moveDialog, resizeDialog, invalidate: stop }
}
