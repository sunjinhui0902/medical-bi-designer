import type { DashboardApplicationV3, DialogPresentationV3, JsonValueV3 } from '../models/dashboard-v3.ts'
import type { ParameterRuntimeStoreV3 } from './parameterRuntimeV3.ts'
import { deepFreezeSafeJsonCloneV3, safeCloneJsonValueV3, safeUnknownMessageV3 } from './eventJsonValueV3.ts'
import { isTrustedLinkageRefreshPortV3, type LinkageRefreshPortV3, type LinkageRefreshResultV3 } from './linkageRefreshPortV3.ts'
import { strictJsonEqualV3, validateParameterCommitTransitionV3 } from './parameterCommitSemanticsV3.ts'
import { escapeJsonPointerSegmentV3 } from './eventAuthoringPolicyV3.ts'
import { resolveSafeJsonPointerV3 } from './eventValueResolverV3.ts'
import type { SetParameterRefreshCoordinatorV3, SetParameterRefreshResultV3 } from './setParameterActionPortV3.ts'
import type { EventActionResultV3, InteractionActionPortV3, InteractionActionRequestV3, InteractionCommitVerificationRequestV3, InteractionCommitVerifierV3, InteractionSessionLeaseV3, ParameterCommitHandoffV3, ResolvedInteractionActionRequestV3 } from './eventRuntimeTypesV3.ts'
import { moveDialogV3, placeDialogV3, resizeDialogByV3, type DialogRectV3, type DialogResizeDirectionV3, type DialogViewportV3 } from './dialogGeometryV3.ts'
import type { SafeBrowserPortV3 } from './safeBrowserPortV3.ts'

export type { LinkageRefreshPortV3, LinkageRefreshResultV3 } from './linkageRefreshPortV3.ts'

const trustedPageSessionVerifiers = new WeakMap<InteractionActionPortV3, InteractionCommitVerifierV3>()
const authenticPageSessionRuntimes = new WeakSet<PageSessionRuntimeV3>()
const dialogLifecycleAuthority = Symbol('dialog-lifecycle-authority')
const pageLifecycleAuthority = Symbol('page-lifecycle-authority')
const interactionLifecycleAuthority = Symbol('interaction-lifecycle-authority')

export interface PageSessionEntryV3 {
  instanceId: string
  pageId: string
  restoreAssignments: Array<{ parameterId: string; value: JsonValueV3 }>
}

export interface DialogSessionEntryV3 {
  instanceId: string
  pageId: string
  ownerPageInstanceId: string
  parentDialogInstanceId?: string
  restoreAssignments: Array<{ parameterId: string; value: JsonValueV3 }>
  presentation: DialogPresentationV3
  geometry: DialogRectV3
  dialogRevision: number
  geometryRevision: number
}

export interface DialogLifecycleLeaseV3 { sessionId: string; epoch: number; instanceId: string; dialogRevision: number }
export interface DialogLifecyclePortV3 {
  capture(): DialogLifecycleLeaseV3 | undefined
  dismiss(lease: DialogLifecycleLeaseV3, reason: 'button' | 'escape' | 'backdrop'): PageSessionSnapshotV3
  move(lease: DialogLifecycleLeaseV3, x: number, y: number): PageSessionSnapshotV3
  resize(lease: DialogLifecycleLeaseV3, direction: DialogResizeDirectionV3, deltaX: number, deltaY: number): PageSessionSnapshotV3
}
export interface PageLifecyclePortV3 { back(): { result: EventActionResultV3; snapshot: PageSessionSnapshotV3 } }
export interface InteractionLifecyclePortV3 {
  clearLinkage(): Promise<{ result: EventActionResultV3; snapshot: PageSessionSnapshotV3 }>
  drillBack(pathId: string): Promise<{ result: EventActionResultV3; snapshot: PageSessionSnapshotV3 }>
}

export interface DrillFrameV3 {
  levelId: string
  label: string
  parameterId: string
  value: JsonValueV3
  restoreValue: JsonValueV3
  ownerPageInstanceId: string
  sourceComponentId?: string
}

interface DrillFrameStateV3 extends DrillFrameV3 { order: number }

interface PageSessionEntryStateV3 extends PageSessionEntryV3 {
  drillCheckpoint: Map<string, ReadonlyArray<DrillFrameStateV3>>
  assignmentOverlays: Array<{ parameterId: string; value: JsonValueV3; order: number }>
}

export interface PageSessionSnapshotV3 {
  sessionId: string
  epoch: number
  revision: number
  closed: boolean
  activePageId: string
  stack: PageSessionEntryV3[]
  dialogs: DialogSessionEntryV3[]
  linkages: Array<{ actionId: string; pageId: string; pageInstanceId: string; targetComponentIds: string[] }>
  drills: Array<{ pathId: string; frames: DrillFrameV3[] }>
}

interface LinkageStateV3 {
  actionId: string
  pageId: string
  pageInstanceId: string
  assignments: Array<{ parameterId: string; value: JsonValueV3 }>
  targetComponentIds: string[]
  order: number
}

export interface PageSessionRuntimeOptionsV3 {
  application: DashboardApplicationV3
  parameters: ParameterRuntimeStoreV3
  initialPageId?: string
  sessionId?: string
  idFactory?: () => string
  linkageRefresh?: LinkageRefreshPortV3
  drillRefresh?: SetParameterRefreshCoordinatorV3
  dialogEnvironment?: {
    viewport(): DialogViewportV3
    protectedRegions(): ReadonlyArray<DialogRectV3>
  }
  browserPort?: SafeBrowserPortV3
}

function randomId(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.()
  if (!uuid) throw new Error('secure runtime id factory unavailable')
  return `${prefix}-${uuid}`
}

function jsonValues(store: ParameterRuntimeStoreV3): Record<string, JsonValueV3> {
  const cloned = safeCloneJsonValueV3(store.snapshot().values)
  if (!cloned.ok || !cloned.value || typeof cloned.value !== 'object' || Array.isArray(cloned.value)) throw new Error(cloned.ok ? 'parameter values must be a JSON object' : cloned.message)
  return cloned.value as Record<string, JsonValueV3>
}

function mergeRestoreAssignments(
  retained: ReadonlyArray<{ parameterId: string; value: JsonValueV3 }>,
  assignments: ReadonlyArray<{ parameterId: string; value: JsonValueV3 }>,
  before: Readonly<Record<string, JsonValueV3>>,
) {
  const restore = retained.map((item) => ({ parameterId: item.parameterId, value: item.value }))
  const retainedIds = new Set(restore.map((item) => item.parameterId))
  for (const assignment of assignments) {
    if (retainedIds.has(assignment.parameterId)) continue
    restore.push({ parameterId: assignment.parameterId, value: Object.hasOwn(before, assignment.parameterId) ? before[assignment.parameterId] : null })
    retainedIds.add(assignment.parameterId)
  }
  return restore
}

function ownKeysExactly(value: object, allowed: string[]) {
  const keys = Reflect.ownKeys(value)
  return keys.every((key) => typeof key === 'string' && allowed.includes(key)) && allowed.every((key) => keys.includes(key))
}

function safeLinkageRefreshResult(raw: unknown, targetComponentIds: string[]): { ok: true; value: LinkageRefreshResultV3 } | { ok: false; message: string } {
  const cloned = safeCloneJsonValueV3(raw)
  if (!cloned.ok) return { ok: false, message: cloned.message }
  const value = cloned.value as unknown
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: 'linkage refresh result is not a plain DTO' }
  const dto = value as Record<string, unknown>
  const allowed = ['attemptedComponentIds', 'succeededComponentIds', 'failed', ...(dto.refreshClaims === undefined ? [] : ['refreshClaims']), ...(dto.cancelled === undefined ? [] : ['cancelled'])]
  if (!ownKeysExactly(value, allowed) || (dto.cancelled !== undefined && typeof dto.cancelled !== 'boolean')) return { ok: false, message: 'linkage refresh result fields are invalid' }
  const arrays = [dto.attemptedComponentIds, dto.succeededComponentIds, ...(dto.refreshClaims === undefined ? [] : [dto.refreshClaims])]
  if (arrays.some((item) => !Array.isArray(item) || item.some((entry) => typeof entry !== 'string' || !entry) || new Set(item).size !== item.length) || !Array.isArray(dto.failed)) return { ok: false, message: 'linkage refresh arrays are invalid' }
  const attempted = dto.attemptedComponentIds as string[]
  const succeeded = dto.succeededComponentIds as string[]
  const failed: Array<{ componentId: string; code: string; message: string }> = []
  for (const item of dto.failed) {
    if (!item || typeof item !== 'object' || Array.isArray(item) || !ownKeysExactly(item, ['componentId', 'code', 'message'])) return { ok: false, message: 'linkage refresh failure is invalid' }
    const failure = item as { componentId: unknown; code: unknown; message: unknown }
    if (![failure.componentId, failure.code, failure.message].every((part) => typeof part === 'string' && part.length)) return { ok: false, message: 'linkage refresh failure fields are invalid' }
    failed.push(failure as { componentId: string; code: string; message: string })
  }
  const failedIds = failed.map((item) => item.componentId)
  const targetSet = new Set(targetComponentIds)
  const settled = new Set([...succeeded, ...failedIds])
  if (new Set(failedIds).size !== failedIds.length || attempted.some((id) => !targetSet.has(id)) || succeeded.some((id) => !attempted.includes(id) || failedIds.includes(id)) || failedIds.some((id) => !attempted.includes(id)) || attempted.some((id) => !settled.has(id)) || (!dto.cancelled && (attempted.length !== targetComponentIds.length || targetComponentIds.some((id) => !attempted.includes(id))))) return { ok: false, message: 'linkage refresh result sets are inconsistent' }
  const refreshClaims = dto.refreshClaims as string[] | undefined
  if (refreshClaims?.some((claim) => {
    try { const tuple = JSON.parse(claim) as unknown; return !Array.isArray(tuple) || tuple.length !== 2 || tuple.some((part) => typeof part !== 'string' || !part) || !succeeded.includes(tuple[0] as string) }
    catch { return true }
  })) return { ok: false, message: 'linkage refresh claims are invalid' }
  return { ok: true, value: deepFreezeSafeJsonCloneV3({ attemptedComponentIds: attempted, succeededComponentIds: succeeded, failed, ...(refreshClaims ? { refreshClaims } : {}), ...(dto.cancelled !== undefined ? { cancelled: dto.cancelled as boolean } : {}) }) }
}

export class PageSessionRuntimeV3 {
  private static readonly MAX_PAGE_STACK_DEPTH = 100
  private static readonly MAX_SESSION_INSTANCE_IDS = 10_000
  private readonly application: DashboardApplicationV3
  private readonly parameters: ParameterRuntimeStoreV3
  private readonly sessionId: string
  private readonly rootPageId: string
  private readonly idFactory: () => string
  private readonly initialValues: Record<string, JsonValueV3>
  private readonly linkageRefresh?: LinkageRefreshPortV3
  private readonly drillRefresh?: SetParameterRefreshCoordinatorV3
  private readonly dialogEnvironment?: PageSessionRuntimeOptionsV3['dialogEnvironment']
  private readonly browserPort?: SafeBrowserPortV3
  private stack: PageSessionEntryStateV3[]
  private dialogs: DialogSessionEntryV3[] = []
  private linkageStates = new Map<string, LinkageStateV3>()
  private linkageBaselines = new Map<string, Map<string, { value: JsonValueV3; order: number }>>()
  private drillStates = new Map<string, ReadonlyArray<DrillFrameStateV3>>()
  private interactionBaselines = new Map<string, JsonValueV3>()
  private epoch = 1
  private revision = 1
  private closed = false
  private interactionSequence = 0
  private readonly usedInstanceIds = new Set<string>()

  constructor(options: PageSessionRuntimeOptionsV3) {
    if (new.target !== PageSessionRuntimeV3) throw new Error('PageSessionRuntimeV3 does not support subclassing')
    const rootPageId = options.initialPageId ?? options.application.defaultPageId
    const root = options.application.pages.find((page) => page.id === rootPageId && page.type === 'standard')
    if (!root) throw new Error('default standard page not found')
    this.application = options.application
    this.parameters = options.parameters
    this.sessionId = options.sessionId?.trim() || randomId('page-session')
    if (!this.sessionId) throw new Error('session id must be nonempty')
    this.idFactory = options.idFactory ?? (() => randomId('page-instance'))
    this.rootPageId = root.id
    this.linkageRefresh = options.linkageRefresh
    this.drillRefresh = options.drillRefresh
    this.dialogEnvironment = options.dialogEnvironment
    this.browserPort = options.browserPort
    this.initialValues = jsonValues(this.parameters)
    this.stack = [{ instanceId: this.nextInstanceId(), pageId: root.id, restoreAssignments: [], drillCheckpoint: new Map(), assignmentOverlays: [] }]
    authenticPageSessionRuntimes.add(this)
    Object.seal(this)
  }

  snapshot(): PageSessionSnapshotV3 {
    return deepFreezeSafeJsonCloneV3({
      sessionId: this.sessionId,
      epoch: this.epoch,
      revision: this.revision,
      closed: this.closed,
      activePageId: this.stack.at(-1)?.pageId ?? this.rootPageId,
      stack: this.stack.map(({ instanceId, pageId, restoreAssignments }) => ({ instanceId, pageId, restoreAssignments })),
      dialogs: this.dialogs,
      linkages: [...this.linkageStates.values()].map(({ actionId, pageId, pageInstanceId, targetComponentIds }) => ({ actionId, pageId, pageInstanceId, targetComponentIds })),
      drills: [...this.drillStates].map(([pathId, frames]) => ({ pathId, frames: frames.map(({ order: _order, ...frame }) => frame) })),
    })
  }

  captureSessionLease(): InteractionSessionLeaseV3 {
    if (this.closed) throw new Error('page session is closed')
    return deepFreezeSafeJsonCloneV3({ sessionId: this.sessionId, epoch: this.epoch, revision: this.revision })
  }

  acceptsCompletedLease(lease: InteractionSessionLeaseV3) {
    return !this.closed && lease.sessionId === this.sessionId && lease.epoch === this.epoch && lease.revision + 1 === this.revision
  }

  execute(request: InteractionActionRequestV3): EventActionResultV3 {
    const action = request.action
    if (action.type !== 'navigatePage' && action.type !== 'pageBack') return this.failure(action.id, 'EXECUTOR_UNAVAILABLE', `${action.type} page runtime executor unavailable`)
    if (request.signal.aborted) return this.failure(action.id, 'CANCELLED', 'cancelled before page transition')
    if (this.closed) return this.failure(action.id, 'CANCELLED', 'page session is closed')
    if (request.context.applicationId !== this.application.id) return this.failure(action.id, 'INVALID_INPUT', 'application mismatch')
    if (!strictJsonEqualV3(request.sessionLease as unknown as JsonValueV3, captureAuthenticSessionLease.call(this) as unknown as JsonValueV3)) return this.failure(action.id, 'CANCELLED', 'interaction session lease expired')
    return action.type === 'navigatePage' ? this.navigate(action, request.context.transactionId, request.sessionLease) : this.back(action, request.context.transactionId, request.sessionLease)
  }

  executeDialog(request: InteractionActionRequestV3): EventActionResultV3 {
    const action = request.action
    if (action.type !== 'openDialog' && action.type !== 'closeDialog') return this.failure(action.id, 'EXECUTOR_UNAVAILABLE', `${action.type} dialog runtime executor unavailable`)
    if (request.signal.aborted) return this.failure(action.id, 'CANCELLED', 'cancelled before dialog transition')
    if (this.closed) return this.failure(action.id, 'CANCELLED', 'page session is closed')
    if (request.context.applicationId !== this.application.id) return this.failure(action.id, 'INVALID_INPUT', 'application mismatch')
    if (!strictJsonEqualV3(request.sessionLease as unknown as JsonValueV3, captureAuthenticSessionLease.call(this) as unknown as JsonValueV3)) return this.failure(action.id, 'CANCELLED', 'interaction session lease expired')
    const activePage = this.stack.at(-1)
    const parentDialog = this.dialogs.at(-1)
    const validSource = parentDialog
      ? request.context.source.pageId === parentDialog.pageId && request.context.source.pageType === 'dialog'
      : Boolean(activePage && request.context.source.pageId === activePage.pageId && request.context.source.pageType === 'standard')
    if (!activePage || !validSource) return this.failure(action.id, 'INVALID_INPUT', 'dialog owner scope is not active')
    if (action.type === 'closeDialog') return this.closeTopDialog(action.id, request.context.transactionId, request.sessionLease)
    if (this.dialogs.length >= 100) return this.failure(action.id, 'ACTION_FAILED', 'dialog stack depth exceeded')
    const target = this.application.pages.find((page) => page.id === action.pageId && page.type === 'dialog')
    if (!target) return this.failure(action.id, 'INVALID_INPUT', 'target dialog page not found')
    let geometry: DialogRectV3
    try {
      const environment = this.dialogBounds()
      geometry = placeDialogV3(action.presentation, environment.viewport, environment.protectedRegions)
    } catch (reason) { return this.failure(action.id, 'INVALID_INPUT', safeUnknownMessageV3(reason, 'dialog environment invalid')) }
    const before = jsonValues(this.parameters)
    const restoreAssignments = mergeRestoreAssignments([], action.assignments, before)
    let instanceId: string
    try { instanceId = this.nextInstanceId() } catch (reason) { return this.failure(action.id, 'ACTION_FAILED', safeUnknownMessageV3(reason, 'dialog instance planning failed')) }
    const parameterCommit = this.commit(action.id, request.context.transactionId, action.assignments, before, request.sessionLease)
    if (!parameterCommit.ok) return parameterCommit.result
    this.dialogs = [...this.dialogs, {
      instanceId,
      pageId: target.id,
      ownerPageInstanceId: activePage.instanceId,
      ...(parentDialog ? { parentDialogInstanceId: parentDialog.instanceId } : {}),
      restoreAssignments,
      presentation: action.presentation,
      geometry,
      dialogRevision: 1,
      geometryRevision: 1,
    }]
    this.revision++
    const pageEnterBindings = target.pageEvents.filter((binding) => binding.event === 'pageEnter')
    return deepFreezeSafeJsonCloneV3({
      status: 'succeeded', effectApplied: true,
      ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}),
      ...(pageEnterBindings.length === 1 ? { emittedEvents: [{ source: { kind: 'page', pageId: target.id, pageType: target.type }, eventName: 'pageEnter', payload: {} }] } : {}),
      evidence: { kind: 'openDialog', pageId: target.id, instanceId: this.dialogs.at(-1)!.instanceId, sessionId: this.sessionId, epoch: this.epoch, revision: this.revision, stackDepth: this.dialogs.length },
    })
  }

  executeBrowser(request: InteractionActionRequestV3): EventActionResultV3 {
    const action = request.action
    if (action.type !== 'openPageWindow' && action.type !== 'openExternalLink') return this.failure(action.id, 'EXECUTOR_UNAVAILABLE', `${action.type} browser executor unavailable`)
    if (request.signal.aborted) return this.failure(action.id, 'CANCELLED', 'cancelled before browser open')
    if (this.closed) return this.failure(action.id, 'CANCELLED', 'page session is closed')
    if (request.context.applicationId !== this.application.id) return this.failure(action.id, 'INVALID_INPUT', 'application mismatch')
    if (!strictJsonEqualV3(request.sessionLease as unknown as JsonValueV3, captureAuthenticSessionLease.call(this) as unknown as JsonValueV3)) return this.failure(action.id, 'CANCELLED', 'interaction session lease expired')
    if (!this.browserPort) return this.failure(action.id, 'EXECUTOR_UNAVAILABLE', 'safe browser port unavailable')
    const activePage = this.stack.at(-1); const activeDialog = this.dialogs.at(-1)
    const sourceActive = activeDialog ? request.context.source.pageId === activeDialog.pageId && request.context.source.pageType === 'dialog' : request.context.source.pageId === activePage?.pageId && request.context.source.pageType === 'standard'
    if (!sourceActive) return this.failure(action.id, 'INVALID_INPUT', 'browser action owner scope is not active')
    const values = request.parameterSnapshot
    const result = action.type === 'openPageWindow'
      ? this.browserPort.openPageWindow(action.pageId, action.carryParameterIds, values)
      : this.browserPort.openExternalLink(action.url, action.carryParameterIds, values)
    const destination = result.destination ? { protocol: result.destination.protocol, origin: result.destination.origin, pathname: result.destination.pathname } : undefined
    if (!result.ok) return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: result.effectApplied ?? false, issue: { code: result.code === 'INVALID_INPUT' || result.code === 'UNSAFE_URL' ? 'INVALID_INPUT' : 'ACTION_FAILED', message: `${result.code}: ${result.message}`, actionId: action.id }, evidence: { kind: action.type, ...(destination ? { destination } : {}), sessionId: this.sessionId, epoch: this.epoch, revision: this.revision } })
    return deepFreezeSafeJsonCloneV3({ status: 'succeeded', effectApplied: true, evidence: { kind: action.type, destination: destination!, sessionId: this.sessionId, epoch: this.epoch, revision: this.revision } })
  }

  captureDialogLifecycleLease(authority: symbol): DialogLifecycleLeaseV3 | undefined {
    if (authority !== dialogLifecycleAuthority || this.closed) return undefined
    const top = this.dialogs.at(-1)
    return top ? deepFreezeSafeJsonCloneV3({ sessionId: this.sessionId, epoch: this.epoch, instanceId: top.instanceId, dialogRevision: top.dialogRevision }) : undefined
  }

  dismissTopDialog(lease: DialogLifecycleLeaseV3, reason: 'button' | 'escape' | 'backdrop', authority: symbol): PageSessionSnapshotV3 {
    if (authority !== dialogLifecycleAuthority || this.closed) return this.snapshot()
    const top = this.dialogs.at(-1)
    if (!top || !this.acceptsDialogLease(lease, top) || (reason === 'escape' && !top.presentation.closeOnEscape) || (reason === 'backdrop' && !top.presentation.closeOnBackdrop)) return this.snapshot()
    if (top.restoreAssignments.length) this.parameters.commit(top.restoreAssignments, 'control')
    this.dialogs = this.dialogs.slice(0, -1)
    this.revision++
    return this.snapshot()
  }

  moveTopDialog(lease: DialogLifecycleLeaseV3, x: number, y: number, authority: symbol): PageSessionSnapshotV3 {
    const top = this.dialogs.at(-1)
    if (authority !== dialogLifecycleAuthority || this.closed || !top || !this.acceptsDialogLease(lease, top) || !top.presentation.draggable) return this.snapshot()
    const environment = this.dialogBounds()
    const geometry = moveDialogV3(top.geometry, x, y, top.presentation, environment.viewport, environment.protectedRegions)
    if (strictJsonEqualV3(geometry as unknown as JsonValueV3, top.geometry as unknown as JsonValueV3)) return this.snapshot()
    this.dialogs = [...this.dialogs.slice(0, -1), { ...top, geometry, geometryRevision: top.geometryRevision + 1 }]
    this.revision++
    return this.snapshot()
  }

  resizeTopDialog(lease: DialogLifecycleLeaseV3, direction: DialogResizeDirectionV3, deltaX: number, deltaY: number, authority: symbol): PageSessionSnapshotV3 {
    const top = this.dialogs.at(-1)
    if (authority !== dialogLifecycleAuthority || this.closed || !top || !this.acceptsDialogLease(lease, top) || !top.presentation.resizable) return this.snapshot()
    const environment = this.dialogBounds()
    const geometry = resizeDialogByV3(top.geometry, direction, deltaX, deltaY, top.presentation, environment.viewport, environment.protectedRegions)
    if (strictJsonEqualV3(geometry as unknown as JsonValueV3, top.geometry as unknown as JsonValueV3)) return this.snapshot()
    this.dialogs = [...this.dialogs.slice(0, -1), { ...top, geometry, geometryRevision: top.geometryRevision + 1 }]
    this.revision++
    return this.snapshot()
  }

  backFromHost(authority: symbol): { result: EventActionResultV3; snapshot: PageSessionSnapshotV3 } {
    if (authority !== pageLifecycleAuthority || this.closed) return { result: this.failure('platform-page-back', 'CANCELLED', 'page session is closed'), snapshot: this.snapshot() }
    const active = this.stack.at(-1)!
    const lease = captureAuthenticSessionLease.call(this)
    const result = executeAuthenticPageSession.call(this, {
      action: { id: 'platform-page-back', type: 'pageBack' },
      context: { transactionId: randomId('platform-page-back'), depth: 1, applicationId: this.application.id, eventBindingId: 'platform-page-back', eventName: 'pageEnter', source: { kind: 'page', pageId: active.pageId, pageType: 'standard' }, occurredAt: Date.now(), payload: {} },
      parameterSnapshot: jsonValues(this.parameters), refreshClaimSnapshot: [], signal: new AbortController().signal, sessionLease: lease,
    })
    return { result, snapshot: this.snapshot() }
  }

  async clearLinkageFromHost(authority: symbol): Promise<{ result: EventActionResultV3; snapshot: PageSessionSnapshotV3 }> {
    if (authority !== interactionLifecycleAuthority || this.closed) return { result: this.failure('platform-clear-linkage', 'CANCELLED', 'page session is closed'), snapshot: this.snapshot() }
    const active = this.stack.at(-1)!
    const lease = captureAuthenticSessionLease.call(this)
    const result = await executeAuthenticLinkage.call(this, {
      action: { id: 'platform-clear-linkage', type: 'clearLinkage' },
      context: { transactionId: randomId('platform-clear-linkage'), depth: 1, applicationId: this.application.id, eventBindingId: 'platform-clear-linkage', eventName: 'pageEnter', source: { kind: 'page', pageId: active.pageId, pageType: 'standard' }, occurredAt: Date.now(), payload: {} },
      parameterSnapshot: jsonValues(this.parameters), refreshClaimSnapshot: [], signal: new AbortController().signal, sessionLease: lease,
    })
    return { result, snapshot: this.snapshot() }
  }

  async drillBackFromHost(pathId: string, authority: symbol): Promise<{ result: EventActionResultV3; snapshot: PageSessionSnapshotV3 }> {
    if (authority !== interactionLifecycleAuthority || this.closed) return { result: this.failure('platform-drill-back', 'CANCELLED', 'page session is closed'), snapshot: this.snapshot() }
    const active = this.stack.at(-1)!
    const lease = captureAuthenticSessionLease.call(this)
    const result = await executeAuthenticDrill.call(this, {
      action: { id: 'platform-drill-back', type: 'drillBack', pathId },
      context: { transactionId: randomId('platform-drill-back'), depth: 1, applicationId: this.application.id, eventBindingId: 'platform-drill-back', eventName: 'pageEnter', source: { kind: 'page', pageId: active.pageId, pageType: 'standard' }, occurredAt: Date.now(), payload: {} },
      parameterSnapshot: jsonValues(this.parameters), refreshClaimSnapshot: [], signal: new AbortController().signal, sessionLease: lease,
    })
    return { result, snapshot: this.snapshot() }
  }

  async executeLinkage(request: InteractionActionRequestV3): Promise<EventActionResultV3> {
    const action = request.action
    if (action.type !== 'applyLinkage' && action.type !== 'clearLinkage') return this.failure(action.id, 'EXECUTOR_UNAVAILABLE', `${action.type} linkage runtime executor unavailable`)
    if (request.signal.aborted) return this.failure(action.id, 'CANCELLED', 'cancelled before linkage transaction')
    if (this.closed) return this.failure(action.id, 'CANCELLED', 'page session is closed')
    if (request.context.applicationId !== this.application.id) return this.failure(action.id, 'INVALID_INPUT', 'application mismatch')
    if (!strictJsonEqualV3(request.sessionLease as unknown as JsonValueV3, captureAuthenticSessionLease.call(this) as unknown as JsonValueV3)) return this.failure(action.id, 'CANCELLED', 'interaction session lease expired')
    if (!this.linkageRefresh) return this.failure(action.id, 'EXECUTOR_UNAVAILABLE', 'linkage refresh executor unavailable')
    const sourcePage = this.application.pages.find((page) => page.id === request.context.source.pageId && page.type === 'standard')
    const activePage = this.stack.at(-1)
    if (!sourcePage || sourcePage.id !== activePage?.pageId) return this.failure(action.id, 'INVALID_INPUT', 'linkage owner page is not active')
    const before = jsonValues(this.parameters)
    let assignments: Array<{ parameterId: string; value: JsonValueV3 }>
    let targetComponentIds: string[]
    let stateActionId: string
    let nextLinkageState: LinkageStateV3 | undefined
    let nextBaselines: Map<string, { value: JsonValueV3; order: number }>
    const nextOrder = this.interactionSequence + 1
    const stateKey = (actionId: string) => JSON.stringify([activePage.instanceId, actionId])
    const currentStates = [...this.linkageStates.values()].filter((state) => state.pageInstanceId === activePage.instanceId)
    if (action.type === 'applyLinkage') {
      assignments = action.assignments
      targetComponentIds = [...action.targetComponentIds]
      if (!targetComponentIds.length || targetComponentIds.some((id) => typeof id !== 'string' || !id) || new Set(targetComponentIds).size !== targetComponentIds.length) return this.failure(action.id, 'INVALID_INPUT', 'linkage target ids must be nonempty and unique')
      stateActionId = action.id
      nextBaselines = new Map(this.linkageBaselines.get(activePage.instanceId) ?? [])
      for (const assignment of assignments) if (!nextBaselines.has(assignment.parameterId)) nextBaselines.set(assignment.parameterId, { value: Object.hasOwn(before, assignment.parameterId) ? before[assignment.parameterId] : null, order: nextOrder })
      nextLinkageState = { actionId: action.id, pageId: sourcePage.id, pageInstanceId: activePage.instanceId, assignments: assignments.map((item) => ({ parameterId: item.parameterId, value: item.value })), targetComponentIds, order: nextOrder }
    } else {
      const targetState = action.linkageActionId ? this.linkageStates.get(stateKey(action.linkageActionId)) : currentStates.at(-1)
      if (!targetState) return deepFreezeSafeJsonCloneV3({ status: 'skipped', effectApplied: false, evidence: { kind: 'clearLinkage', reason: 'empty', sessionId: this.sessionId, epoch: this.epoch, revision: this.revision } })
      const remaining = currentStates.filter((state) => state !== targetState)
      const baselines = this.linkageBaselines.get(activePage.instanceId) ?? new Map<string, { value: JsonValueV3; order: number }>()
      const affectedParameterIds = [...new Set(targetState.assignments.map((item) => item.parameterId))]
      assignments = affectedParameterIds.map((parameterId) => {
        const drillOverlay = [...this.drillStates.values()].flat().filter((frame) => frame.parameterId === parameterId).sort((left, right) => right.order - left.order)[0]
        const linkageOverlay = [...remaining].filter((state) => state.assignments.some((item) => item.parameterId === parameterId)).sort((left, right) => right.order - left.order)[0]
        const pageOverlay = activePage.assignmentOverlays.filter((item) => item.parameterId === parameterId).sort((left, right) => right.order - left.order)[0]
        const survivingOverlay = [drillOverlay ? { value: drillOverlay.value, order: drillOverlay.order } : undefined, linkageOverlay ? { value: linkageOverlay.assignments.find((item) => item.parameterId === parameterId)!.value, order: linkageOverlay.order } : undefined, pageOverlay].filter(Boolean).sort((left, right) => right!.order - left!.order)[0]
        return { parameterId, value: survivingOverlay?.value ?? this.interactionBaselines.get(parameterId) ?? baselines.get(parameterId)?.value ?? (Object.hasOwn(before, parameterId) ? before[parameterId] : null) }
      })
      targetComponentIds = [...targetState.targetComponentIds]
      stateActionId = targetState.actionId
      nextBaselines = new Map(baselines)
      for (const parameterId of affectedParameterIds) if (!remaining.some((state) => state.assignments.some((item) => item.parameterId === parameterId))) nextBaselines.delete(parameterId)
    }
    let targetValidation: unknown
    try { targetValidation = this.linkageRefresh.validateTargets({ applicationId: this.application.id, pageId: sourcePage.id, targetComponentIds }) }
    catch (reason) { return this.failure(action.id, 'ACTION_FAILED', safeUnknownMessageV3(reason, 'linkage target validation failed')) }
    if (targetValidation !== undefined) return this.failure(action.id, 'INVALID_INPUT', typeof targetValidation === 'string' && targetValidation ? targetValidation : 'linkage target validation result is invalid')
    const parameterCommit = this.commit(action.id, request.context.transactionId, assignments, before, request.sessionLease)
    if (!parameterCommit.ok) return parameterCommit.result
    if (nextLinkageState) {
      for (const assignment of assignments) if (!this.interactionBaselines.has(assignment.parameterId)) this.interactionBaselines.set(assignment.parameterId, Object.hasOwn(before, assignment.parameterId) ? before[assignment.parameterId] : null)
      this.linkageStates.delete(stateKey(action.id))
      this.linkageStates.set(stateKey(action.id), nextLinkageState)
      this.interactionSequence = nextOrder
    } else this.linkageStates.delete(stateKey(stateActionId))
    if (nextBaselines.size) this.linkageBaselines.set(activePage.instanceId, nextBaselines)
    else this.linkageBaselines.delete(activePage.instanceId)
    if (!nextLinkageState) for (const assignment of assignments) this.cleanupInteractionBaseline(assignment.parameterId)
    this.revision++
    const evidenceBase = { kind: action.type, linkageActionId: stateActionId, targetComponentIds, sessionId: this.sessionId, epoch: this.epoch, revision: this.revision }
    if (request.signal.aborted) return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: 'CANCELLED', message: 'cancelled after linkage commit', actionId: action.id }, ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}), evidence: { ...evidenceBase, refresh: { attemptedComponentIds: [], succeededComponentIds: [], failed: [], cancelled: true } } })
    const completionLeaseCurrent = () => !this.closed && request.sessionLease.sessionId === this.sessionId && request.sessionLease.epoch === this.epoch && request.sessionLease.revision + 1 === this.revision
    try {
      const rawRefresh: unknown = await this.linkageRefresh.refresh({ applicationId: this.application.id, pageId: sourcePage.id, targetComponentIds, parameterValues: jsonValues(this.parameters), signal: request.signal })
      if (!completionLeaseCurrent()) return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: 'CANCELLED', message: 'linkage refresh completed for an expired session lease', actionId: action.id }, ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}), evidence: evidenceBase })
      const parsedRefresh = safeLinkageRefreshResult(rawRefresh, targetComponentIds)
      if (!parsedRefresh.ok) return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: 'ACTION_FAILED', message: parsedRefresh.message, actionId: action.id }, ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}), evidence: { ...evidenceBase, refreshOutcome: 'MALFORMED_REFRESH_RESULT' } })
      const refresh = parsedRefresh.value
      const evidence = deepFreezeSafeJsonCloneV3({ ...evidenceBase, refresh }) as unknown as JsonValueV3
      const refreshClaims = isTrustedLinkageRefreshPortV3(this.linkageRefresh) ? refresh.refreshClaims : undefined
      if (refresh.cancelled || request.signal.aborted) return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: 'CANCELLED', message: 'cancelled during linkage refresh', actionId: action.id }, ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}), evidence })
      if (refresh.failed.length) return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: 'ACTION_FAILED', message: 'one or more linkage refreshes failed', actionId: action.id }, ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}), evidence })
      return deepFreezeSafeJsonCloneV3({ status: 'succeeded', effectApplied: true, ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}), ...(refreshClaims?.length ? { refreshClaims } : {}), evidence })
    } catch (reason) {
      if (!completionLeaseCurrent()) return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: 'CANCELLED', message: 'linkage refresh failed for an expired session lease', actionId: action.id }, ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}), evidence: evidenceBase })
      return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: 'ACTION_FAILED', message: safeUnknownMessageV3(reason, 'linkage refresh failed'), actionId: action.id }, ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}), evidence: evidenceBase })
    }
  }

  async executeDrill(request: InteractionActionRequestV3): Promise<EventActionResultV3> {
    const action = request.action
    if (action.type !== 'drillDown' && action.type !== 'drillBack' && action.type !== 'clearDrill') return this.failure(action.id, 'EXECUTOR_UNAVAILABLE', `${action.type} drill runtime executor unavailable`)
    if (request.signal.aborted) return this.failure(action.id, 'CANCELLED', 'cancelled before drill transaction')
    if (this.closed) return this.failure(action.id, 'CANCELLED', 'page session is closed')
    if (request.context.applicationId !== this.application.id) return this.failure(action.id, 'INVALID_INPUT', 'application mismatch')
    if (!strictJsonEqualV3(request.sessionLease as unknown as JsonValueV3, captureAuthenticSessionLease.call(this) as unknown as JsonValueV3)) return this.failure(action.id, 'CANCELLED', 'interaction session lease expired')
    const path = this.application.drillPaths?.find((item) => item.id === action.pathId)
    if (!path) return this.failure(action.id, 'INVALID_INPUT', 'drill path not found')
    const activePage = this.stack.at(-1)!
    if (request.context.source.pageId !== activePage.pageId || request.context.source.pageType !== 'standard') return this.failure(action.id, 'INVALID_INPUT', 'drill owner page is not active')
    const before = jsonValues(this.parameters)
    const currentFrames = [...(this.drillStates.get(path.id) ?? [])]
    let nextFrames: DrillFrameStateV3[]
    let assignments: Array<{ parameterId: string; value: JsonValueV3 }>
    if (action.type === 'drillDown') {
      if (request.context.source.kind !== 'component' || (request.context.eventName !== 'click' && request.context.eventName !== 'doubleClick' && request.context.eventName !== 'rowClick')) return this.failure(action.id, 'INVALID_INPUT', 'drillDown requires a component datum or row event')
      const level = path.levels[currentFrames.length]
      if (!level) return deepFreezeSafeJsonCloneV3({ status: 'skipped', effectApplied: false, evidence: { kind: 'drillDown', reason: 'leaf', pathId: path.id, sessionId: this.sessionId, epoch: this.epoch, revision: this.revision } })
      const root = request.context.eventName === 'rowClick' ? 'row' : 'datum'
      const resolved = resolveSafeJsonPointerV3(request.context.payload, `/${root}/${escapeJsonPointerSegmentV3(level.field)}`)
      if (resolved.kind !== 'value') return this.failure(action.id, 'INVALID_INPUT', resolved.kind === 'error' ? resolved.message : `drill field missing: ${level.field}`)
      const order = this.interactionSequence + 1
      const frame: DrillFrameStateV3 = { levelId: level.id, label: level.label, parameterId: level.parameterId, value: resolved.value, restoreValue: Object.hasOwn(before, level.parameterId) ? before[level.parameterId] : null, ownerPageInstanceId: activePage.instanceId, sourceComponentId: request.context.source.componentId, order }
      nextFrames = [...currentFrames, frame]
      assignments = [{ parameterId: level.parameterId, value: resolved.value }]
    } else if (action.type === 'drillBack') {
      const frame = currentFrames.at(-1)
      if (!frame) return deepFreezeSafeJsonCloneV3({ status: 'skipped', effectApplied: false, evidence: { kind: 'drillBack', reason: 'root', pathId: path.id, sessionId: this.sessionId, epoch: this.epoch, revision: this.revision } })
      nextFrames = currentFrames.slice(0, -1)
      assignments = [{ parameterId: frame.parameterId, value: this.valueAfterRemovingDrillFrames(frame.parameterId, [frame], new Map([[path.id, nextFrames]])) }]
    } else {
      if (!currentFrames.length) return deepFreezeSafeJsonCloneV3({ status: 'skipped', effectApplied: false, evidence: { kind: 'clearDrill', reason: 'empty', pathId: path.id, sessionId: this.sessionId, epoch: this.epoch, revision: this.revision } })
      nextFrames = []
      const removedByParameter = new Map<string, DrillFrameStateV3[]>()
      for (const frame of currentFrames) removedByParameter.set(frame.parameterId, [...(removedByParameter.get(frame.parameterId) ?? []), frame])
      assignments = [...removedByParameter].map(([parameterId, removed]) => ({ parameterId, value: this.valueAfterRemovingDrillFrames(parameterId, removed, new Map([[path.id, nextFrames]])) }))
    }
    const parameterCommit = this.commit(action.id, request.context.transactionId, assignments, before, request.sessionLease)
    if (!parameterCommit.ok) return parameterCommit.result
    if (action.type === 'drillDown') for (const assignment of assignments) if (!this.interactionBaselines.has(assignment.parameterId)) this.interactionBaselines.set(assignment.parameterId, Object.hasOwn(before, assignment.parameterId) ? before[assignment.parameterId] : null)
    if (nextFrames.length) this.drillStates.set(path.id, Object.freeze(nextFrames))
    else this.drillStates.delete(path.id)
    if (action.type !== 'drillDown') for (const assignment of assignments) this.cleanupInteractionBaseline(assignment.parameterId)
    if (action.type === 'drillDown') this.interactionSequence = nextFrames.at(-1)!.order
    this.revision++
    const evidenceBase = { kind: action.type, pathId: path.id, depth: nextFrames.length, sessionId: this.sessionId, epoch: this.epoch, revision: this.revision }
    if (!parameterCommit.handoff || !this.drillRefresh) return deepFreezeSafeJsonCloneV3({ status: 'succeeded', effectApplied: true, ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}), evidence: evidenceBase })
    if (request.signal.aborted) return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: 'CANCELLED', message: 'cancelled after drill commit', actionId: action.id }, parameterCommit: parameterCommit.handoff, evidence: evidenceBase })
    try {
      const rawRefresh: unknown = await this.drillRefresh.refresh({ applicationId: this.application.id, eventTransactionId: request.context.transactionId, parameterTransactionId: parameterCommit.handoff.parameterTransactionId, sourcePageId: activePage.pageId, changedParameterIds: parameterCommit.handoff.changedParameterIds, parameterValues: jsonValues(this.parameters), signal: request.signal })
      const completionCurrent = !this.closed && request.sessionLease.sessionId === this.sessionId && request.sessionLease.epoch === this.epoch && request.sessionLease.revision + 1 === this.revision
      if (!completionCurrent || request.signal.aborted) return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: 'CANCELLED', message: 'drill refresh completed for an expired session lease', actionId: action.id }, parameterCommit: parameterCommit.handoff, evidence: evidenceBase })
      const refresh = this.safeDrillRefreshResult(rawRefresh)
      if (!refresh.ok) return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: 'ACTION_FAILED', message: refresh.message, actionId: action.id }, parameterCommit: parameterCommit.handoff, evidence: { ...evidenceBase, refreshOutcome: 'MALFORMED_REFRESH_RESULT' } })
      const evidence = deepFreezeSafeJsonCloneV3({ ...evidenceBase, refresh: refresh.value }) as unknown as JsonValueV3
      if (refresh.value.cancelled) return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: 'CANCELLED', message: 'cancelled during drill refresh', actionId: action.id }, parameterCommit: parameterCommit.handoff, evidence })
      if (refresh.value.failed.length) return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: 'ACTION_FAILED', message: 'one or more drill refreshes failed', actionId: action.id }, parameterCommit: parameterCommit.handoff, evidence })
      return deepFreezeSafeJsonCloneV3({ status: 'succeeded', effectApplied: true, parameterCommit: parameterCommit.handoff, evidence })
    } catch (reason) {
      const completionCurrent = !this.closed && request.sessionLease.sessionId === this.sessionId && request.sessionLease.epoch === this.epoch && request.sessionLease.revision + 1 === this.revision
      return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied: true, issue: { code: completionCurrent ? 'ACTION_FAILED' : 'CANCELLED', message: completionCurrent ? safeUnknownMessageV3(reason, 'drill refresh failed') : 'drill refresh failed for an expired session lease', actionId: action.id }, parameterCommit: parameterCommit.handoff, evidence: evidenceBase })
    }
  }

  clear(): PageSessionSnapshotV3 {
    if (this.closed) return this.snapshot()
    const rootInstanceId = this.nextInstanceId()
    const current = jsonValues(this.parameters)
    const assignments = this.application.parameters.map((parameter) => ({ parameterId: parameter.id, value: Object.hasOwn(this.initialValues, parameter.id) ? this.initialValues[parameter.id] : null }))
    if (!strictJsonEqualV3(current, this.initialValues)) this.parameters.commit(assignments, 'control')
    const root = this.application.pages.find((page) => page.id === this.rootPageId && page.type === 'standard')!
    this.stack = [{ instanceId: rootInstanceId, pageId: root.id, restoreAssignments: [], drillCheckpoint: new Map(), assignmentOverlays: [] }]
    this.dialogs = []
    this.linkageStates.clear()
    this.linkageBaselines.clear()
    this.drillStates.clear()
    this.interactionBaselines.clear()
    this.epoch++
    this.revision++
    return this.snapshot()
  }

  close(): PageSessionSnapshotV3 {
    if (!this.closed) {
      const dialogAssignments = this.dialogCleanupAssignments()
      if (dialogAssignments.length) this.parameters.commit(dialogAssignments, 'control')
      this.closed = true
      this.epoch++
      this.revision++
      this.stack = []
      this.dialogs = []
      this.linkageStates.clear()
      this.linkageBaselines.clear()
      this.drillStates.clear()
      this.interactionBaselines.clear()
    }
    return this.snapshot()
  }

  private dialogBounds() {
    if (!this.dialogEnvironment) throw new Error('dialog environment unavailable')
    const viewport = this.dialogEnvironment.viewport()
    const protectedRegions = this.dialogEnvironment.protectedRegions()
    if (!viewport || !Number.isFinite(viewport.width) || viewport.width <= 0 || !Number.isFinite(viewport.height) || viewport.height <= 0) throw new Error('dialog viewport must be finite and positive')
    if (!Array.isArray(protectedRegions) || protectedRegions.some((region) => !region || ![region.x, region.y, region.width, region.height].every(Number.isFinite) || region.width < 0 || region.height < 0)) throw new Error('dialog protected regions are invalid')
    return { viewport: { width: viewport.width, height: viewport.height }, protectedRegions: protectedRegions.map((region) => ({ ...region })) }
  }

  private dialogCleanupAssignments() {
    const merged = new Map<string, JsonValueV3>()
    for (const dialog of [...this.dialogs].reverse()) for (const assignment of dialog.restoreAssignments) merged.set(assignment.parameterId, assignment.value)
    return [...merged].map(([parameterId, value]) => ({ parameterId, value }))
  }

  private acceptsDialogLease(lease: DialogLifecycleLeaseV3, top: DialogSessionEntryV3) {
    return lease.sessionId === this.sessionId && lease.epoch === this.epoch && lease.instanceId === top.instanceId && lease.dialogRevision === top.dialogRevision
  }

  private closeTopDialog(actionId: string, eventTransactionId: string, sessionLease: InteractionSessionLeaseV3): EventActionResultV3 {
    const top = this.dialogs.at(-1)
    if (!top) return deepFreezeSafeJsonCloneV3({ status: 'skipped', effectApplied: false, evidence: { kind: 'closeDialog', reason: 'empty', sessionId: this.sessionId, epoch: this.epoch, revision: this.revision } })
    const before = jsonValues(this.parameters)
    const parameterCommit = this.commit(actionId, eventTransactionId, top.restoreAssignments, before, sessionLease)
    if (!parameterCommit.ok) return parameterCommit.result
    this.dialogs = this.dialogs.slice(0, -1)
    this.revision++
    return deepFreezeSafeJsonCloneV3({
      status: 'succeeded', effectApplied: true,
      ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}),
      evidence: { kind: 'closeDialog', pageId: top.pageId, instanceId: top.instanceId, sessionId: this.sessionId, epoch: this.epoch, revision: this.revision, stackDepth: this.dialogs.length },
    })
  }

  private captureDrillCheckpoint() { return new Map(this.drillStates) }

  private applyDrillCheckpoint(checkpoint: Map<string, ReadonlyArray<DrillFrameStateV3>>) {
    const affected = new Set([...this.drillStates.values()].flat().map((frame) => frame.parameterId))
    for (const frame of [...checkpoint.values()].flat()) affected.add(frame.parameterId)
    this.drillStates = new Map(checkpoint)
    for (const parameterId of affected) this.cleanupInteractionBaseline(parameterId)
  }

  private valueAfterRemovingDrillFrames(parameterId: string, removed: DrillFrameStateV3[], overrides = new Map<string, ReadonlyArray<DrillFrameStateV3>>(), excludedLinkagePageInstance?: string) {
    const candidates: Array<{ value: JsonValueV3; order: number }> = []
    for (const [pathId, current] of this.drillStates) {
      const frames = overrides.has(pathId) ? overrides.get(pathId)! : current
      for (const frame of frames) if (frame.parameterId === parameterId) candidates.push({ value: frame.value, order: frame.order })
    }
    for (const state of this.linkageStates.values()) {
      if (state.pageInstanceId === excludedLinkagePageInstance) continue
      for (const assignment of state.assignments) if (assignment.parameterId === parameterId) candidates.push({ value: assignment.value, order: state.order })
    }
    const pageOverlay = this.stack.at(-1)?.assignmentOverlays.filter((item) => item.parameterId === parameterId).sort((left, right) => right.order - left.order)[0]
    if (pageOverlay) candidates.push({ value: pageOverlay.value, order: pageOverlay.order })
    const latest = candidates.sort((left, right) => right.order - left.order)[0]
    if (latest) return latest.value
    return this.interactionBaselines.get(parameterId) ?? [...removed].sort((left, right) => left.order - right.order)[0]?.restoreValue ?? (Object.hasOwn(this.initialValues, parameterId) ? this.initialValues[parameterId] : null)
  }

  private cleanupInteractionBaseline(parameterId: string) {
    const drillAlive = [...this.drillStates.values()].some((frames) => frames.some((frame) => frame.parameterId === parameterId))
    const linkageAlive = [...this.linkageStates.values()].some((state) => state.assignments.some((item) => item.parameterId === parameterId))
    if (!drillAlive && !linkageAlive) this.interactionBaselines.delete(parameterId)
  }

  private drillCheckpointAssignments(checkpoint: Map<string, ReadonlyArray<DrillFrameStateV3>>, excludedLinkagePageInstance?: string) {
    const affected = new Map<string, DrillFrameStateV3[]>()
    const pathIds = new Set([...this.drillStates.keys(), ...checkpoint.keys()])
    for (const pathId of pathIds) {
      const current = this.drillStates.get(pathId) ?? []
      const target = checkpoint.get(pathId) ?? []
      if (strictJsonEqualV3(current as unknown as JsonValueV3, target as unknown as JsonValueV3)) continue
      for (const frame of current) affected.set(frame.parameterId, [...(affected.get(frame.parameterId) ?? []), frame])
      for (const frame of target) if (!affected.has(frame.parameterId)) affected.set(frame.parameterId, [])
    }
    return [...affected].map(([parameterId, removed]) => ({ parameterId, value: this.valueAfterRemovingDrillFrames(parameterId, removed, checkpoint, excludedLinkagePageInstance) }))
  }

  private safeDrillRefreshResult(raw: unknown): { ok: true; value: SetParameterRefreshResultV3 } | { ok: false; message: string } {
    const cloned = safeCloneJsonValueV3(raw)
    if (!cloned.ok) return { ok: false, message: cloned.message }
    const value = cloned.value as unknown
    if (!value || typeof value !== 'object' || Array.isArray(value)) return { ok: false, message: 'drill refresh result is not a plain DTO' }
    const dto = value as Record<string, unknown>
    const allowed = dto.cancelled === undefined ? ['attemptedComponentIds', 'succeededComponentIds', 'failed'] : ['attemptedComponentIds', 'succeededComponentIds', 'failed', 'cancelled']
    if (!ownKeysExactly(value, allowed) || (dto.cancelled !== undefined && typeof dto.cancelled !== 'boolean') || !Array.isArray(dto.attemptedComponentIds) || !Array.isArray(dto.succeededComponentIds) || !Array.isArray(dto.failed)) return { ok: false, message: 'drill refresh result fields are invalid' }
    const attempted = dto.attemptedComponentIds as unknown[]; const succeeded = dto.succeededComponentIds as unknown[]
    if ([attempted, succeeded].some((items) => items.some((id) => typeof id !== 'string' || !id) || new Set(items).size !== items.length)) return { ok: false, message: 'drill refresh id arrays are invalid' }
    const failed: Array<{ componentId: string; code: string; message: string }> = []
    for (const item of dto.failed) {
      if (!item || typeof item !== 'object' || Array.isArray(item) || !ownKeysExactly(item, ['componentId', 'code', 'message'])) return { ok: false, message: 'drill refresh failure is invalid' }
      const failure = item as Record<string, unknown>
      if (![failure.componentId, failure.code, failure.message].every((part) => typeof part === 'string' && part)) return { ok: false, message: 'drill refresh failure fields are invalid' }
      failed.push(failure as { componentId: string; code: string; message: string })
    }
    const attemptedIds = attempted as string[]; const succeededIds = succeeded as string[]; const failedIds = failed.map((item) => item.componentId)
    if (new Set(failedIds).size !== failedIds.length || succeededIds.some((id) => !attemptedIds.includes(id) || failedIds.includes(id)) || failedIds.some((id) => !attemptedIds.includes(id)) || attemptedIds.some((id) => !succeededIds.includes(id) && !failedIds.includes(id))) return { ok: false, message: 'drill refresh result sets are inconsistent' }
    return { ok: true, value: deepFreezeSafeJsonCloneV3({ attemptedComponentIds: attemptedIds, succeededComponentIds: succeededIds, failed, ...(dto.cancelled !== undefined ? { cancelled: dto.cancelled as boolean } : {}) }) }
  }

  private linkageCleanupAssignments(pageInstanceId: string) {
    return [...(this.linkageBaselines.get(pageInstanceId) ?? new Map<string, { value: JsonValueV3; order: number }>())].map(([parameterId, baseline]) => ({ parameterId, value: baseline.value }))
  }

  private mergeAssignments(base: Array<{ parameterId: string; value: JsonValueV3 }>, overrides: Array<{ parameterId: string; value: JsonValueV3 }>) {
    const merged = new Map(base.map((item) => [item.parameterId, item.value]))
    for (const item of overrides) merged.set(item.parameterId, item.value)
    return [...merged].map(([parameterId, value]) => ({ parameterId, value }))
  }

  private removeLinkageInstance(pageInstanceId: string) {
    const affected = new Set<string>()
    for (const [key, state] of this.linkageStates) if (state.pageInstanceId === pageInstanceId) { state.assignments.forEach((item) => affected.add(item.parameterId)); this.linkageStates.delete(key) }
    this.linkageBaselines.delete(pageInstanceId)
    for (const parameterId of affected) this.cleanupInteractionBaseline(parameterId)
  }

  private navigate(action: Extract<ResolvedInteractionActionRequestV3, { type: 'navigatePage' }>, eventTransactionId: string, sessionLease: InteractionSessionLeaseV3): EventActionResultV3 {
    const target = this.application.pages.find((page) => page.id === action.pageId && page.type === 'standard')
    if (!target) return this.failure(action.id, 'INVALID_INPUT', 'target standard page not found')
    if (action.history === 'push' && this.stack.length >= PageSessionRuntimeV3.MAX_PAGE_STACK_DEPTH) return this.failure(action.id, 'ACTION_FAILED', 'page stack depth exceeded')
    const before = jsonValues(this.parameters)
    const current = this.stack.at(-1)!
    const dialogCleanupAssignments = this.dialogCleanupAssignments()
    const cleanupAssignments = action.history === 'replace' ? this.linkageCleanupAssignments(current.instanceId) : []
    const targetDrillCheckpoint = action.history === 'replace' ? current.drillCheckpoint : this.captureDrillCheckpoint()
    const drillCleanupAssignments = action.history === 'replace' ? this.drillCheckpointAssignments(targetDrillCheckpoint, current.instanceId) : []
    const logicalBefore = { ...before }
    for (const assignment of this.mergeAssignments(this.mergeAssignments(dialogCleanupAssignments, cleanupAssignments), drillCleanupAssignments)) logicalBefore[assignment.parameterId] = assignment.value
    const restoreAssignments = mergeRestoreAssignments(action.history === 'replace' ? current.restoreAssignments : [], action.assignments, logicalBefore)
    const assignmentOrder = this.interactionSequence + 1
    const inheritedOverlays = action.history === 'replace' ? current.assignmentOverlays : []
    const overlayMap = new Map(inheritedOverlays.map((item) => [item.parameterId, item]))
    for (const assignment of action.assignments) overlayMap.set(assignment.parameterId, { ...assignment, order: assignmentOrder })
    const next: PageSessionEntryStateV3 = { instanceId: this.nextInstanceId(), pageId: target.id, restoreAssignments, drillCheckpoint: targetDrillCheckpoint, assignmentOverlays: [...overlayMap.values()] }
    const committedAssignments = this.mergeAssignments(this.mergeAssignments(this.mergeAssignments(dialogCleanupAssignments, cleanupAssignments), drillCleanupAssignments), action.assignments)
    const parameterCommit = this.commit(action.id, eventTransactionId, committedAssignments, before, sessionLease)
    if (!parameterCommit.ok) return parameterCommit.result
    if (action.history === 'replace') { this.removeLinkageInstance(current.instanceId); this.applyDrillCheckpoint(targetDrillCheckpoint) }
    this.dialogs = []
    this.stack = action.history === 'replace' ? [...this.stack.slice(0, -1), next] : [...this.stack, next]
    if (action.assignments.length) this.interactionSequence = assignmentOrder
    this.revision++
    const pageEnterBindings = target.pageEvents.filter((binding) => binding.event === 'pageEnter')
    return deepFreezeSafeJsonCloneV3({
      status: 'succeeded',
      effectApplied: true,
      ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}),
      ...(pageEnterBindings.length === 1 ? { emittedEvents: [{ source: { kind: 'page', pageId: target.id, pageType: target.type }, eventName: 'pageEnter', payload: {} }] } : {}),
      evidence: { kind: 'pageNavigation', history: action.history, pageId: target.id, sessionId: this.sessionId, epoch: this.epoch, revision: this.revision, stackDepth: this.stack.length },
    })
  }

  private back(action: Extract<ResolvedInteractionActionRequestV3, { type: 'pageBack' }>, eventTransactionId: string, sessionLease: InteractionSessionLeaseV3): EventActionResultV3 {
    if (this.stack.length <= 1) return deepFreezeSafeJsonCloneV3({ status: 'skipped', effectApplied: false, evidence: { kind: 'pageBack', reason: 'root', sessionId: this.sessionId, epoch: this.epoch, revision: this.revision } })
    const current = this.stack.at(-1)!
    const before = jsonValues(this.parameters)
    const drillAssignments = this.drillCheckpointAssignments(current.drillCheckpoint, current.instanceId)
    const committedAssignments = this.mergeAssignments(this.mergeAssignments(this.mergeAssignments(this.dialogCleanupAssignments(), this.linkageCleanupAssignments(current.instanceId)), drillAssignments), current.restoreAssignments)
    const parameterCommit = this.commit(action.id, eventTransactionId, committedAssignments, before, sessionLease)
    if (!parameterCommit.ok) return parameterCommit.result
    this.removeLinkageInstance(current.instanceId)
    this.applyDrillCheckpoint(current.drillCheckpoint)
    this.dialogs = []
    this.stack = this.stack.slice(0, -1)
    this.revision++
    return deepFreezeSafeJsonCloneV3({
      status: 'succeeded',
      effectApplied: true,
      ...(parameterCommit.handoff ? { parameterCommit: parameterCommit.handoff } : {}),
      evidence: { kind: 'pageBack', pageId: this.stack.at(-1)!.pageId, sessionId: this.sessionId, epoch: this.epoch, revision: this.revision, stackDepth: this.stack.length },
    })
  }

  private commit(actionId: string, eventTransactionId: string, assignments: Array<{ parameterId: string; value: JsonValueV3 }>, before: Record<string, JsonValueV3>, sessionLease: InteractionSessionLeaseV3): { ok: true; handoff?: ParameterCommitHandoffV3 } | { ok: false; result: EventActionResultV3 } {
    if (!assignments.length) return { ok: true }
    try {
      const commit = this.parameters.commit(assignments, 'control')
      const after = jsonValues(this.parameters)
      const transition = validateParameterCommitTransitionV3({ before, after, assignments, changedParameterIds: commit.changedParameterIds })
      if (!transition.ok || !strictJsonEqualV3(after, commit.state.values as Record<string, JsonValueV3>)) return { ok: false, result: this.failure(actionId, 'ACTION_FAILED', transition.ok ? 'parameter commit snapshot mismatch' : transition.message, true) }
      if (!commit.changed) return { ok: true }
      if (!commit.changedParameterIds.length || commit.state.transactionId === eventTransactionId) return { ok: false, result: this.failure(actionId, 'ACTION_FAILED', 'parameter transaction identity invalid', true) }
      return { ok: true, handoff: deepFreezeSafeJsonCloneV3({ kind: 'parameterCommit', applicationId: this.application.id, actionId, eventTransactionId, parameterTransactionId: commit.state.transactionId, changedParameterIds: commit.changedParameterIds, values: after, assignments, sessionLease }) }
    } catch (reason) {
      return { ok: false, result: this.failure(actionId, 'ACTION_FAILED', safeUnknownMessageV3(reason, 'page parameter transaction failed')) }
    }
  }

  private failure(actionId: string, code: 'EXECUTOR_UNAVAILABLE' | 'INVALID_INPUT' | 'CANCELLED' | 'ACTION_FAILED', message: string, effectApplied = false): EventActionResultV3 {
    return deepFreezeSafeJsonCloneV3({ status: 'failed', effectApplied, issue: { code, message, actionId } })
  }

  private nextInstanceId() {
    if (this.usedInstanceIds.size >= PageSessionRuntimeV3.MAX_SESSION_INSTANCE_IDS) throw new Error('page session instance budget exceeded')
    const instanceId = this.idFactory().trim()
    if (!instanceId || this.usedInstanceIds.has(instanceId)) throw new Error('page instance id must be nonempty and unique')
    this.usedInstanceIds.add(instanceId)
    return instanceId
  }
}

const captureAuthenticSessionLease = PageSessionRuntimeV3.prototype.captureSessionLease
const executeAuthenticPageSession = PageSessionRuntimeV3.prototype.execute
const executeAuthenticDialog = PageSessionRuntimeV3.prototype.executeDialog
const executeAuthenticBrowser = PageSessionRuntimeV3.prototype.executeBrowser
const executeAuthenticLinkage = PageSessionRuntimeV3.prototype.executeLinkage
const executeAuthenticDrill = PageSessionRuntimeV3.prototype.executeDrill
const acceptsAuthenticCompletedLease = PageSessionRuntimeV3.prototype.acceptsCompletedLease
const captureAuthenticDialogLease = PageSessionRuntimeV3.prototype.captureDialogLifecycleLease
const dismissAuthenticDialog = PageSessionRuntimeV3.prototype.dismissTopDialog
const moveAuthenticDialog = PageSessionRuntimeV3.prototype.moveTopDialog
const resizeAuthenticDialog = PageSessionRuntimeV3.prototype.resizeTopDialog
const backAuthenticPage = PageSessionRuntimeV3.prototype.backFromHost
const clearAuthenticLinkage = PageSessionRuntimeV3.prototype.clearLinkageFromHost
const backAuthenticDrill = PageSessionRuntimeV3.prototype.drillBackFromHost
Object.freeze(PageSessionRuntimeV3.prototype)

export function createDialogLifecyclePortV3(runtime: PageSessionRuntimeV3): DialogLifecyclePortV3 {
  if (!authenticPageSessionRuntimes.has(runtime) || Object.getPrototypeOf(runtime) !== PageSessionRuntimeV3.prototype) throw new Error('authentic PageSessionRuntimeV3 required')
  const port: DialogLifecyclePortV3 = {
    capture: () => captureAuthenticDialogLease.call(runtime, dialogLifecycleAuthority),
    dismiss: (lease, reason) => dismissAuthenticDialog.call(runtime, lease, reason, dialogLifecycleAuthority),
    move: (lease, x, y) => moveAuthenticDialog.call(runtime, lease, x, y, dialogLifecycleAuthority),
    resize: (lease, direction, deltaX, deltaY) => resizeAuthenticDialog.call(runtime, lease, direction, deltaX, deltaY, dialogLifecycleAuthority),
  }
  return Object.freeze(port)
}

export function createPageLifecyclePortV3(runtime: PageSessionRuntimeV3): PageLifecyclePortV3 {
  if (!authenticPageSessionRuntimes.has(runtime) || Object.getPrototypeOf(runtime) !== PageSessionRuntimeV3.prototype) throw new Error('authentic PageSessionRuntimeV3 required')
  return Object.freeze({ back: () => backAuthenticPage.call(runtime, pageLifecycleAuthority) })
}

export function createInteractionLifecyclePortV3(runtime: PageSessionRuntimeV3): InteractionLifecyclePortV3 {
  if (!authenticPageSessionRuntimes.has(runtime) || Object.getPrototypeOf(runtime) !== PageSessionRuntimeV3.prototype) throw new Error('authentic PageSessionRuntimeV3 required')
  return Object.freeze({
    clearLinkage: () => clearAuthenticLinkage.call(runtime, interactionLifecycleAuthority),
    drillBack: (pathId: string) => backAuthenticDrill.call(runtime, pathId, interactionLifecycleAuthority),
  })
}

export function createPageSessionEventIntegrationV3(runtime: PageSessionRuntimeV3): InteractionActionPortV3 {
  if (!authenticPageSessionRuntimes.has(runtime) || Object.getPrototypeOf(runtime) !== PageSessionRuntimeV3.prototype) throw new Error('authentic PageSessionRuntimeV3 required')
  const commits = new Map<string, ParameterCommitHandoffV3>()
  const key = (commit: ParameterCommitHandoffV3) => JSON.stringify([commit.eventTransactionId, commit.actionId, commit.parameterTransactionId, commit.sessionLease?.sessionId, commit.sessionLease?.epoch, commit.sessionLease?.revision])
  const verifier: InteractionCommitVerifierV3 = { verify({ commit, sessionLease }) {
    if (!acceptsAuthenticCompletedLease.call(runtime, sessionLease)) return false
    const trusted = commits.get(key(commit))
    return Boolean(trusted && strictJsonEqualV3(trusted as unknown as JsonValueV3, commit as unknown as JsonValueV3))
  } }
  const port: InteractionActionPortV3 = { captureSessionLease: () => captureAuthenticSessionLease.call(runtime), async execute(request) {
    const result = request.action.type === 'openDialog' || request.action.type === 'closeDialog'
      ? executeAuthenticDialog.call(runtime, request)
      : request.action.type === 'openPageWindow' || request.action.type === 'openExternalLink'
        ? executeAuthenticBrowser.call(runtime, request)
      : request.action.type === 'applyLinkage' || request.action.type === 'clearLinkage'
      ? await executeAuthenticLinkage.call(runtime, request)
      : request.action.type === 'drillDown' || request.action.type === 'drillBack' || request.action.type === 'clearDrill'
        ? await executeAuthenticDrill.call(runtime, request)
      : executeAuthenticPageSession.call(runtime, request)
    if (result.parameterCommit && (request.action.type === 'navigatePage' || request.action.type === 'pageBack' || request.action.type === 'openDialog' || request.action.type === 'closeDialog' || request.action.type === 'clearLinkage' || request.action.type === 'drillDown' || request.action.type === 'drillBack' || request.action.type === 'clearDrill')) {
      commits.set(key(result.parameterCommit), result.parameterCommit)
      if (commits.size > 1000) commits.delete(commits.keys().next().value!)
    }
    return result
  } }
  trustedPageSessionVerifiers.set(port, verifier)
  return Object.freeze(port)
}

export function verifyPageSessionInteractionCommitV3(port: InteractionActionPortV3, request: InteractionCommitVerificationRequestV3) {
  return trustedPageSessionVerifiers.get(port)?.verify(request) ?? false
}

export function isTrustedPageSessionInteractionPortV3(port: InteractionActionPortV3) {
  return trustedPageSessionVerifiers.has(port)
}
