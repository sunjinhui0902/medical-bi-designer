import type { DashboardApplicationV3, JsonValueV3 } from '../models/dashboard-v3.ts'
import type { DashboardComponent } from '../models/dashboard.ts'
import type { ParameterRuntimeStoreV3 } from './parameterRuntimeV3.ts'
import { componentsAffectedByParameterCommitV3, resolveDatasetParameterValuesV3 } from './parameterRefreshV3.ts'
import { deepFreezeSafeJsonCloneV3, safeCloneJsonValueV3, safeUnknownMessageV3 } from './eventJsonValueV3.ts'
import { strictJsonEqualV3, validateParameterCommitTransitionV3 } from './parameterCommitSemanticsV3.ts'
import { isQueryableServerComponentV3, type ComponentQueryRefreshRuntimeV3 } from './componentQueryRefreshV3.ts'
import type { EventActionResultV3, ParameterCommitHandoffV3, SetParameterActionPortV3 } from './eventRuntimeTypesV3.ts'

export interface SetParameterRefreshRequestV3 { applicationId: string; eventTransactionId: string; parameterTransactionId: string; sourcePageId: string; changedParameterIds: string[]; parameterValues: Readonly<Record<string, JsonValueV3>>; signal: AbortSignal }
export interface SetParameterRefreshFailureV3 { componentId: string; code: string; message: string }
export interface SetParameterRefreshResultV3 { attemptedComponentIds: string[]; succeededComponentIds: string[]; failed: SetParameterRefreshFailureV3[]; cancelled?: boolean }
export interface SetParameterRefreshCoordinatorV3 { refresh(request: SetParameterRefreshRequestV3): Promise<SetParameterRefreshResultV3> }
export interface ParameterComponentRefreshRequestV3 extends SetParameterRefreshRequestV3 { component: DashboardComponent; datasetParameters: Record<string, unknown> }

export function createSetParameterRefreshCoordinatorV3(options: { application: DashboardApplicationV3; queryRuntime?: ComponentQueryRefreshRuntimeV3; refreshComponent?(request: ParameterComponentRefreshRequestV3): Promise<void> }): SetParameterRefreshCoordinatorV3 {
  return { async refresh(request) {
    const result: SetParameterRefreshResultV3 = { attemptedComponentIds: [], succeededComponentIds: [], failed: [] }
    if (request.applicationId !== options.application.id) { result.failed.push({ componentId: request.sourcePageId, code: 'INVALID_INPUT', message: 'application mismatch' }); return result }
    const page = options.application.pages.find((item) => item.id === request.sourcePageId)
    if (!page) { result.failed.push({ componentId: request.sourcePageId, code: 'INVALID_INPUT', message: 'source page not found' }); return result }
    for (const component of componentsAffectedByParameterCommitV3(page.components, request.changedParameterIds).filter(isQueryableServerComponentV3)) {
      if (request.signal.aborted) { result.cancelled = true; break }
      result.attemptedComponentIds.push(component.id)
      try {
        if (options.queryRuntime) {
          const descriptor = options.queryRuntime.describe(component, request.parameterValues)
          if (!descriptor) throw new Error('query descriptor resolution failed')
          await options.queryRuntime.execute(descriptor, false, request.signal)
        } else if (options.refreshComponent) await options.refreshComponent({ ...request, component, datasetParameters: resolveDatasetParameterValuesV3(component, request.parameterValues) })
        else throw new Error('parameter refresh executor unavailable')
        result.succeededComponentIds.push(component.id)
      } catch (reason) {
        const cancelled = request.signal.aborted
        result.failed.push({ componentId: component.id, code: cancelled ? 'CANCELLED' : 'ACTION_FAILED', message: safeUnknownMessageV3(reason, 'parameter refresh failed') })
        if (cancelled) { result.cancelled = true; break }
      }
    }
    return deepFreezeSafeJsonCloneV3(result)
  } }
}

type SafeState = { transactionId: string; values: Record<string, JsonValueV3> }
type SafeCommit = { changed: boolean; changedParameterIds: string[]; state: SafeState }
function ownKeysExactly(value: object, allowed: string[]) { const keys = Reflect.ownKeys(value); return keys.every((key) => typeof key === 'string' && allowed.includes(key)) && allowed.every((key) => keys.includes(key)) }
function safeState(raw: unknown): { ok: true; value: SafeState } | { ok: false; message: string } {
  const cloned = safeCloneJsonValueV3(raw)
  if (!cloned.ok) return { ok: false, message: cloned.message }
  const value = cloned.value as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: 'snapshot is not an object' }
  const state = value as Record<string, unknown>
  if (typeof state.transactionId !== 'string' || !state.transactionId || !state.values || typeof state.values !== 'object' || Array.isArray(state.values)) return { ok: false, message: 'snapshot shape is invalid' }
  return { ok: true, value: deepFreezeSafeJsonCloneV3({ transactionId: state.transactionId, values: state.values as Record<string, JsonValueV3> }) }
}
function snapshot(store: ParameterRuntimeStoreV3) { try { return safeState(store.snapshot()) } catch (reason) { return { ok: false as const, message: safeUnknownMessageV3(reason, 'snapshot failed') } } }
function safeCommit(raw: unknown): { ok: true; value: SafeCommit } | { ok: false; message: string } {
  const cloned = safeCloneJsonValueV3(raw)
  if (!cloned.ok) return { ok: false, message: cloned.message }
  const value = cloned.value as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value) || !ownKeysExactly(value, ['changed', 'changedParameterIds', 'state'])) return { ok: false, message: 'commit DTO shape is invalid' }
  const dto = value as Record<string, unknown>; const state = safeState(dto.state)
  if (!state.ok || typeof dto.changed !== 'boolean' || !Array.isArray(dto.changedParameterIds) || dto.changedParameterIds.some((id) => typeof id !== 'string' || !id) || new Set(dto.changedParameterIds).size !== dto.changedParameterIds.length) return { ok: false, message: state.ok ? 'commit DTO fields are invalid' : state.message }
  return { ok: true, value: { changed: dto.changed, changedParameterIds: dto.changedParameterIds as string[], state: state.value } }
}
function safeRefresh(raw: unknown): { ok: true; value: SetParameterRefreshResultV3 } | { ok: false; message: string } {
  const cloned = safeCloneJsonValueV3(raw)
  if (!cloned.ok) return { ok: false, message: cloned.message }
  const value = cloned.value as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: 'refresh result is not a plain DTO' }
  const dto = value as Record<string, unknown>; const allowed = dto.cancelled === undefined ? ['attemptedComponentIds', 'succeededComponentIds', 'failed'] : ['attemptedComponentIds', 'succeededComponentIds', 'failed', 'cancelled']
  if (!ownKeysExactly(value, allowed) || (dto.cancelled !== undefined && typeof dto.cancelled !== 'boolean')) return { ok: false, message: 'refresh result fields are invalid' }
  const arrays = [dto.attemptedComponentIds, dto.succeededComponentIds]
  if (arrays.some((item) => !Array.isArray(item) || item.some((id) => typeof id !== 'string' || !id) || new Set(item).size !== item.length) || !Array.isArray(dto.failed)) return { ok: false, message: 'refresh id arrays are invalid' }
  const failed: SetParameterRefreshFailureV3[] = []
  for (const item of dto.failed) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !ownKeysExactly(item, ['componentId', 'code', 'message'])) return { ok: false, message: 'refresh failure is invalid' }
    const failure = item as unknown as SetParameterRefreshFailureV3
    if (![failure.componentId, failure.code, failure.message].every((part) => typeof part === 'string' && part.length)) return { ok: false, message: 'refresh failure fields are invalid' }
    failed.push(failure)
  }
  const attempted = dto.attemptedComponentIds as string[]; const succeeded = dto.succeededComponentIds as string[]; const failedIds = failed.map((item) => item.componentId)
  if (new Set(failedIds).size !== failedIds.length || succeeded.some((id) => failedIds.includes(id) || !attempted.includes(id)) || failedIds.some((id) => !attempted.includes(id)) || attempted.some((id) => !succeeded.includes(id) && !failedIds.includes(id))) return { ok: false, message: 'refresh result sets are inconsistent' }
  return { ok: true, value: deepFreezeSafeJsonCloneV3({ attemptedComponentIds: attempted, succeededComponentIds: succeeded, failed, ...(dto.cancelled !== undefined ? { cancelled: dto.cancelled as boolean } : {}) }) }
}

export function createSetParameterActionPortV3(options: { applicationId: string; store: ParameterRuntimeStoreV3; refreshCoordinator: SetParameterRefreshCoordinatorV3 }): SetParameterActionPortV3 {
  const failure = (actionId: string, code: 'INVALID_INPUT' | 'CANCELLED' | 'ACTION_FAILED', message: string, effectApplied = false, extra: Partial<EventActionResultV3> = {}): EventActionResultV3 => deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied, issue: { code, message, actionId }, ...extra })
  return { async execute(request) {
    const actionId = request.action.id
    try {
      if (request.signal.aborted) return failure(actionId, 'CANCELLED', 'cancelled before commit')
      if (!options.applicationId || request.context.applicationId !== options.applicationId) return failure(actionId, 'INVALID_INPUT', 'application mismatch')
      if (!request.action.assignments.length) return failure(actionId, 'INVALID_INPUT', 'assignments must not be empty')
      const seen = new Set<string>(); for (const item of request.action.assignments) { if (!item.parameterId.trim() || seen.has(item.parameterId)) return failure(actionId, 'INVALID_INPUT', 'parameter ids must be nonempty and unique'); seen.add(item.parameterId) }
      const before = snapshot(options.store); if (!before.ok) return failure(actionId, 'ACTION_FAILED', before.message)
      let rawCommit: unknown; let commitReturned = false; let commitError: unknown
      try { rawCommit = options.store.commit(request.action.assignments, 'control'); commitReturned = true } catch (reason) { commitError = reason }
      const parsed = commitReturned ? safeCommit(rawCommit) : { ok: false as const, message: safeUnknownMessageV3(commitError, 'commit failed') }
      const after = snapshot(options.store)
      const actualChanged = after.ok && (!strictJsonEqualV3(before.value.values as unknown as JsonValueV3, after.value.values as unknown as JsonValueV3) || before.value.transactionId !== after.value.transactionId)
      const makeHandoff = (state: SafeState, changedParameterIds: string[]): ParameterCommitHandoffV3 | undefined => {
        const transition = validateParameterCommitTransitionV3({ before: before.value.values, after: state.values, assignments: request.action.assignments, changedParameterIds })
        if (!transition.ok || !changedParameterIds.length || state.transactionId === request.context.transactionId) return undefined
        return deepFreezeSafeJsonCloneV3({ kind: 'parameterCommit', applicationId: options.applicationId, actionId, eventTransactionId: request.context.transactionId, parameterTransactionId: state.transactionId, changedParameterIds: [...changedParameterIds], values: state.values })
      }
      const unknownFailure = (message: string) => {
        const effectApplied = after.ok ? Boolean(actualChanged) : true
        const inferredChanged = after.ok ? request.action.assignments.filter((item) => JSON.stringify(before.value.values[item.parameterId]) !== JSON.stringify(item.value)).map((item) => item.parameterId) : []
        const handoff = effectApplied && after.ok ? makeHandoff(after.value, inferredChanged) : undefined
        return failure(actionId, 'ACTION_FAILED', message, effectApplied, { ...(handoff ? { parameterCommit: handoff } : {}), evidence: { kind: 'setParameter', actionId, eventTransactionId: request.context.transactionId, parameterTransactionId: after.ok ? after.value.transactionId : before.value.transactionId, changed: effectApplied, changedParameterIds: handoff?.changedParameterIds ?? [], commitOutcome: 'UNKNOWN_COMMIT_OUTCOME', refresh: { attemptedComponentIds: [], succeededComponentIds: [], failed: [] } } })
      }
      if (!parsed.ok) return unknownFailure(parsed.message)
      if (!after.ok) return unknownFailure(after.message)
      const commit = parsed.value
      if (commit.state.transactionId !== after.value.transactionId || !strictJsonEqualV3(commit.state.values as unknown as JsonValueV3, after.value.values as unknown as JsonValueV3)) return unknownFailure('commit DTO does not match store snapshot')
      const transition = validateParameterCommitTransitionV3({ before: before.value.values, after: commit.state.values, assignments: request.action.assignments, changedParameterIds: commit.changedParameterIds })
      const parameterCommit = transition.ok ? makeHandoff(commit.state, commit.changedParameterIds) : undefined
      if (!commit.changed) {
        if (!transition.ok || commit.changedParameterIds.length) return unknownFailure('unchanged commit DTO is inconsistent')
        return deepFreezeSafeJsonCloneV3({ status: 'skipped', effectApplied: false, evidence: { kind: 'setParameter', actionId, eventTransactionId: request.context.transactionId, parameterTransactionId: commit.state.transactionId, changed: false, changedParameterIds: [], refresh: { attemptedComponentIds: [], succeededComponentIds: [], failed: [] } } } as EventActionResultV3)
      }
      if (!transition.ok || !parameterCommit || !commit.changedParameterIds.length) return unknownFailure('changed commit DTO is inconsistent')
      const evidenceBase = { kind: 'setParameter', actionId, eventTransactionId: request.context.transactionId, parameterTransactionId: commit.state.transactionId, changed: true, changedParameterIds: [...commit.changedParameterIds] }
      if (request.signal.aborted) return failure(actionId, 'CANCELLED', 'cancelled after commit', true, { parameterCommit, evidence: { ...evidenceBase, refresh: { attemptedComponentIds: [], succeededComponentIds: [], failed: [] } } })
      let rawRefresh: unknown
      try { rawRefresh = await options.refreshCoordinator.refresh({ applicationId: options.applicationId, eventTransactionId: request.context.transactionId, parameterTransactionId: commit.state.transactionId, sourcePageId: request.context.source.pageId, changedParameterIds: [...commit.changedParameterIds], parameterValues: commit.state.values, signal: request.signal }) }
      catch (reason) { return failure(actionId, 'ACTION_FAILED', safeUnknownMessageV3(reason, 'refresh coordinator rejected'), true, { parameterCommit, evidence: { ...evidenceBase, refreshOutcome: 'MALFORMED_REFRESH_RESULT' } }) }
      const parsedRefresh = safeRefresh(rawRefresh)
      if (!parsedRefresh.ok) return failure(actionId, 'ACTION_FAILED', parsedRefresh.message, true, { parameterCommit, evidence: { ...evidenceBase, refreshOutcome: 'MALFORMED_REFRESH_RESULT' } })
      const refresh = parsedRefresh.value; const evidence = deepFreezeSafeJsonCloneV3({ ...evidenceBase, refresh: { ...refresh } }) as unknown as JsonValueV3
      if (refresh.cancelled) return failure(actionId, 'CANCELLED', 'cancelled during refresh', true, { parameterCommit, evidence })
      if (refresh.failed.length) return failure(actionId, 'ACTION_FAILED', 'one or more refreshes failed', true, { parameterCommit, evidence })
      return deepFreezeSafeJsonCloneV3({ status: 'succeeded', effectApplied: true, parameterCommit, evidence } as EventActionResultV3)
    } catch (reason) { return failure(actionId, 'ACTION_FAILED', safeUnknownMessageV3(reason, 'setParameter adapter failed'), true, { evidence: { kind: 'setParameter', actionId, commitOutcome: 'UNKNOWN_COMMIT_OUTCOME' } }) }
  } }
}
