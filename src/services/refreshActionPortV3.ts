import type { DashboardApplicationV3, JsonValueV3 } from '../models/dashboard-v3.ts'
import { deepFreezeSafeJsonCloneV3, safeUnknownMessageV3 } from './eventJsonValueV3.ts'
import { isQueryableServerComponentV3, type ComponentQueryDescriptorV3, type ComponentQueryRefreshRuntimeV3 } from './componentQueryRefreshV3.ts'
import type { EventActionResultV3, RefreshActionPortV3 } from './eventRuntimeTypesV3.ts'

export function createRefreshClaimKeyV3(componentId: string, queryKey: string): string { return JSON.stringify([componentId, queryKey]) }

export function createRefreshActionPortV3(options: { application: DashboardApplicationV3; queryRuntime: ComponentQueryRefreshRuntimeV3 }): RefreshActionPortV3 {
  const result = (value: EventActionResultV3) => deepFreezeSafeJsonCloneV3(value)
  return { async execute(request) {
    const actionId = request.action.id; const ownerPageId = request.context.source.pageId
    const baseEvidence = (overrides: Record<string, JsonValueV3> = {}): JsonValueV3 => deepFreezeSafeJsonCloneV3({ kind: 'refresh', actionId, eventTransactionId: request.context.transactionId, ownerPageId, target: request.action.target, targetKind: request.action.target.kind, force: true, resolvedComponentIds: [], attemptedComponentIds: [], succeededComponentIds: [], deduplicatedComponentIds: [], failed: [], cancelled: false, ...overrides })
    const fail = (code: 'INVALID_INPUT' | 'CANCELLED' | 'ACTION_FAILED', message: string, effectApplied: boolean, evidence: JsonValueV3 = baseEvidence({ cancelled: code === 'CANCELLED' }), refreshClaims: string[] = []) => result({ status: 'failed', effectApplied, issue: { code, message, actionId }, evidence, ...(refreshClaims.length ? { refreshClaims } : {}) })
    if (request.signal.aborted) return fail('CANCELLED', 'cancelled before refresh resolution', false)
    if (request.context.applicationId !== options.application.id) return fail('INVALID_INPUT', 'application mismatch', false)
    const page = options.application.pages.find((item) => item.id === ownerPageId)
    if (!page) return fail('INVALID_INPUT', 'owner page not found', false)
    let components
    if (request.action.target.kind === 'page') {
      if (request.action.target.pageId !== ownerPageId) return fail('INVALID_INPUT', 'page refresh must target owner page', false)
      components = page.components.filter(isQueryableServerComponentV3)
      if (!components.length) return result({ status: 'skipped', effectApplied: false, evidence: { kind: 'refresh', actionId, eventTransactionId: request.context.transactionId, ownerPageId, targetKind: 'page', force: true, resolvedComponentIds: [], attemptedComponentIds: [], succeededComponentIds: [], deduplicatedComponentIds: [], failed: [], cancelled: false } })
    } else {
      const ids = request.action.target.componentIds
      if (!ids.length || new Set(ids).size !== ids.length) return fail('INVALID_INPUT', 'component targets must be nonempty and unique', false)
      const byId = new Map(page.components.map((item) => [item.id, item]))
      components = ids.map((id) => byId.get(id))
      if (components.some((item) => !item || !isQueryableServerComponentV3(item))) return fail('INVALID_INPUT', 'every component target must be queryable on the owner page', false)
    }
    const descriptors = (components as NonNullable<(typeof components)[number]>[]).map((component) => options.queryRuntime.describe(component, request.parameterSnapshot))
    if (descriptors.some((item) => !item)) return fail('INVALID_INPUT', 'query descriptor resolution failed', false)
    const resolved = descriptors as ComponentQueryDescriptorV3[]; const claimed = new Set(request.refreshClaimSnapshot)
    const deduplicated = resolved.filter((item) => claimed.has(createRefreshClaimKeyV3(item.componentId, item.queryKey)))
    const pending = resolved.filter((item) => !claimed.has(createRefreshClaimKeyV3(item.componentId, item.queryKey)))
    if (!pending.length) return result({ status: 'skipped', effectApplied: false, evidence: { kind: 'refresh', actionId, eventTransactionId: request.context.transactionId, ownerPageId, targetKind: request.action.target.kind, force: true, resolvedComponentIds: resolved.map((item) => item.componentId), attemptedComponentIds: [], succeededComponentIds: [], deduplicatedComponentIds: deduplicated.map((item) => item.componentId), failed: [], cancelled: false } })
    if (request.signal.aborted) return fail('CANCELLED', 'cancelled before refresh I/O', false)
    const attempted: string[] = []; const succeeded: string[] = []; const failed: Array<{ componentId: string; code: string; message: string }> = []; const refreshClaims: string[] = []; let cancelled = false
    for (const descriptor of pending) {
      if (request.signal.aborted) { cancelled = true; break }
      attempted.push(descriptor.componentId)
      try {
        await options.queryRuntime.execute(descriptor, true, request.signal)
        succeeded.push(descriptor.componentId); refreshClaims.push(createRefreshClaimKeyV3(descriptor.componentId, descriptor.queryKey))
      } catch (reason) {
        const isCancelled = request.signal.aborted; failed.push({ componentId: descriptor.componentId, code: isCancelled ? 'CANCELLED' : 'ACTION_FAILED', message: safeUnknownMessageV3(reason, 'explicit refresh failed') })
        if (isCancelled) { cancelled = true; break }
      }
    }
    const evidence = deepFreezeSafeJsonCloneV3({ kind: 'refresh', actionId, eventTransactionId: request.context.transactionId, ownerPageId, targetKind: request.action.target.kind, force: true, resolvedComponentIds: resolved.map((item) => item.componentId), attemptedComponentIds: attempted, succeededComponentIds: succeeded, deduplicatedComponentIds: deduplicated.map((item) => item.componentId), failed, cancelled }) as unknown as JsonValueV3
    if (cancelled) return fail('CANCELLED', 'cancelled during refresh', attempted.length > 0, evidence, refreshClaims)
    if (failed.length) return fail('ACTION_FAILED', 'one or more explicit refreshes failed', true, evidence, refreshClaims)
    return result({ status: 'succeeded', effectApplied: true, refreshClaims, evidence })
  } }
}
