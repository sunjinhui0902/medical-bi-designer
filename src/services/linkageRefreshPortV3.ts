import type { DashboardApplicationV3, JsonValueV3 } from '../models/dashboard-v3.ts'
import { isQueryableServerComponentV3, type ComponentQueryRefreshRuntimeV3 } from './componentQueryRefreshV3.ts'
import { deepFreezeSafeJsonCloneV3, safeUnknownMessageV3 } from './eventJsonValueV3.ts'
import { createRefreshClaimKeyV3 } from './refreshActionPortV3.ts'

export interface LinkageRefreshResultV3 { attemptedComponentIds: string[]; succeededComponentIds: string[]; failed: Array<{ componentId: string; code: string; message: string }>; refreshClaims?: string[]; cancelled?: boolean }
export interface LinkageRefreshPortV3 {
  validateTargets(request: { applicationId: string; pageId: string; targetComponentIds: string[] }): string | undefined
  refresh(request: { applicationId: string; pageId: string; targetComponentIds: string[]; parameterValues: Readonly<Record<string, JsonValueV3>>; signal: AbortSignal }): Promise<LinkageRefreshResultV3>
}

const trustedLinkageRefreshPorts = new WeakSet<LinkageRefreshPortV3>()

export function isTrustedLinkageRefreshPortV3(port: LinkageRefreshPortV3) { return trustedLinkageRefreshPorts.has(port) }

export function createLinkageRefreshPortV3(options: { application: DashboardApplicationV3; queryRuntime: ComponentQueryRefreshRuntimeV3 }): LinkageRefreshPortV3 {
  const port: LinkageRefreshPortV3 = {
    validateTargets(request) {
      const page = options.application.pages.find((item) => item.id === request.pageId)
      if (!page || request.applicationId !== options.application.id) return 'linkage page mismatch'
      const byId = new Map(page.components.map((component) => [component.id, component]))
      if (request.targetComponentIds.some((componentId) => { const component = byId.get(componentId); return !component || !isQueryableServerComponentV3(component) })) return 'every linkage target must be queryable on the active page'
      return undefined
    },
    async refresh(request) {
      const page = options.application.pages.find((item) => item.id === request.pageId)
      if (!page || request.applicationId !== options.application.id) return { attemptedComponentIds: [], succeededComponentIds: [], failed: [{ componentId: request.pageId, code: 'INVALID_INPUT', message: 'linkage page mismatch' }] }
      const byId = new Map(page.components.map((component) => [component.id, component]))
      const attemptedComponentIds: string[] = []; const succeededComponentIds: string[] = []; const failed: Array<{ componentId: string; code: string; message: string }> = []; const refreshClaims: string[] = []
      for (const componentId of request.targetComponentIds) {
        if (request.signal.aborted) return deepFreezeSafeJsonCloneV3({ attemptedComponentIds, succeededComponentIds, failed, refreshClaims, cancelled: true })
        const component = byId.get(componentId)
        if (!component || !isQueryableServerComponentV3(component)) { failed.push({ componentId, code: 'INVALID_INPUT', message: 'linkage target must be queryable' }); continue }
        attemptedComponentIds.push(componentId)
        try {
          const descriptor = options.queryRuntime.describe(component, request.parameterValues)
          if (!descriptor) throw new Error('query descriptor resolution failed')
          await options.queryRuntime.execute(descriptor, false, request.signal)
          succeededComponentIds.push(componentId); refreshClaims.push(createRefreshClaimKeyV3(componentId, descriptor.queryKey))
        } catch (reason) {
          const cancelled = request.signal.aborted
          failed.push({ componentId, code: cancelled ? 'CANCELLED' : 'ACTION_FAILED', message: safeUnknownMessageV3(reason, 'linkage refresh failed') })
          if (cancelled) return deepFreezeSafeJsonCloneV3({ attemptedComponentIds, succeededComponentIds, failed, refreshClaims, cancelled: true })
        }
      }
      return deepFreezeSafeJsonCloneV3({ attemptedComponentIds, succeededComponentIds, failed, refreshClaims })
    },
  }
  trustedLinkageRefreshPorts.add(port)
  return Object.freeze(port)
}
