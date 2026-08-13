import type { DashboardApplicationV3, DialogPresentationV3, EventNameV3, JsonObjectV3, JsonValueV3, RefreshActionV3 } from '../models/dashboard-v3.ts'
import type { EventOwnerV3 } from './eventAuthoringPolicyV3.ts'

export type EventRuntimeIssueCodeV3 = 'MAX_EVENT_DEPTH_EXCEEDED' | 'EVENT_LOOP_DETECTED' | 'EVENT_BUDGET_EXCEEDED' | 'ACTION_BUDGET_EXCEEDED' | 'STRUCTURE_BUDGET_EXCEEDED' | 'INVALID_STRUCTURE_LIMITS' | 'EXECUTOR_UNAVAILABLE' | 'INVALID_EVENT' | 'INVALID_INPUT' | 'CANCELLED' | 'ACTION_FAILED' | 'PORT_CONTRACT_VIOLATION'
export interface EventRuntimeIssueV3 { code: EventRuntimeIssueCodeV3; message: string; eventBindingId?: string; actionId?: string }
export interface EventRuntimeContextV3 { transactionId: string; depth: number; applicationId: string; eventBindingId: string; eventName: EventNameV3; source: EventOwnerV3; occurredAt: number; payload: JsonObjectV3 }
export interface EmittedEventV3 { source: EventOwnerV3; eventName: EventNameV3; payload: JsonObjectV3 }
export interface ResolvedSetParameterRequestV3 { id: string; type: 'setParameter'; assignments: Array<{ parameterId: string; value: JsonValueV3 }> }
export interface ResolvedRefreshRequestV3 { id: string; type: 'refresh'; target: RefreshActionV3['target'] }
export type ResolvedInteractionActionRequestV3 =
  | { id: string; type: 'navigatePage'; pageId: string; history: 'push' | 'replace'; assignments: Array<{ parameterId: string; value: JsonValueV3 }> }
  | { id: string; type: 'pageBack' }
  | { id: string; type: 'openPageWindow'; pageId: string; carryParameterIds: string[] }
  | { id: string; type: 'openDialog'; pageId: string; presentation: DialogPresentationV3; assignments: Array<{ parameterId: string; value: JsonValueV3 }> }
  | { id: string; type: 'closeDialog' }
  | { id: string; type: 'applyLinkage'; assignments: Array<{ parameterId: string; value: JsonValueV3 }>; targetComponentIds: string[] }
  | { id: string; type: 'clearLinkage'; linkageActionId?: string }
  | { id: string; type: 'drillDown' | 'drillBack' | 'clearDrill'; pathId: string }
  | { id: string; type: 'openExternalLink'; url: string; carryParameterIds: string[] }
export type ResolvedEventActionRequestV3 = ResolvedSetParameterRequestV3 | ResolvedRefreshRequestV3 | ResolvedInteractionActionRequestV3
interface EventActionRequestBaseV3 { context: EventRuntimeContextV3; parameterSnapshot: Readonly<Record<string, JsonValueV3>>; signal: AbortSignal }
export interface SetParameterActionRequestV3 extends EventActionRequestBaseV3 { action: ResolvedSetParameterRequestV3 }
export interface RefreshActionRequestV3 extends EventActionRequestBaseV3 { action: ResolvedRefreshRequestV3; refreshClaimSnapshot: string[] }
export interface InteractionSessionLeaseV3 { sessionId: string; epoch: number; revision: number }
export interface InteractionActionRequestV3 extends EventActionRequestBaseV3 { action: ResolvedInteractionActionRequestV3; refreshClaimSnapshot: string[]; sessionLease: InteractionSessionLeaseV3 }
export interface InteractionCommitVerificationRequestV3 { application: DashboardApplicationV3; action: ResolvedInteractionActionRequestV3; eventTransactionId: string; before: Readonly<Record<string, JsonValueV3>>; commit: ParameterCommitHandoffV3; sessionLease: InteractionSessionLeaseV3 }
export interface InteractionCommitVerifierV3 { verify(request: InteractionCommitVerificationRequestV3): boolean }
export type EventActionRequestV3 = SetParameterActionRequestV3 | RefreshActionRequestV3 | InteractionActionRequestV3
export interface ParameterCommitHandoffV3 { kind: 'parameterCommit'; applicationId: string; actionId: string; eventTransactionId: string; parameterTransactionId: string; changedParameterIds: string[]; values: Record<string, JsonValueV3>; assignments?: Array<{ parameterId: string; value: JsonValueV3 }>; sessionLease?: InteractionSessionLeaseV3 }
export interface EventActionResultV3 { status: 'succeeded' | 'skipped' | 'failed'; effectApplied?: boolean; parameterCommit?: ParameterCommitHandoffV3; refreshClaims?: string[]; issue?: EventRuntimeIssueV3; emittedEvents?: EmittedEventV3[]; evidence?: JsonValueV3 }
export interface SetParameterActionPortV3 { execute(request: SetParameterActionRequestV3): Promise<EventActionResultV3> }
export interface RefreshActionPortV3 { execute(request: RefreshActionRequestV3): Promise<EventActionResultV3> }
export interface InteractionActionPortV3 { captureSessionLease?(): InteractionSessionLeaseV3; execute(request: InteractionActionRequestV3): Promise<EventActionResultV3> }
export type EventActionPortV3 = SetParameterActionPortV3 | RefreshActionPortV3 | InteractionActionPortV3
export interface EventActionPortsV3 { setParameter: SetParameterActionPortV3; refresh: RefreshActionPortV3; interaction?: InteractionActionPortV3 }
export interface EventClockV3 { now(): number; setTimeout(callback: () => void, delayMs: number): unknown; clearTimeout(handle: unknown): void }
export interface EventTriggerV3 { application: DashboardApplicationV3; source: EventOwnerV3; eventName: EventNameV3; payload: JsonObjectV3; parameterSnapshot?: Record<string, JsonValueV3>; signal?: AbortSignal }
export interface EventTransactionResultV3 { transactionId: string; status: 'completed' | 'skipped' | 'failed' | 'cancelled' | 'superseded'; issues: EventRuntimeIssueV3[]; attemptedActionIds: string[]; completedActionIds: string[]; partiallyApplied: boolean; trace: Array<{ kind: string; eventBindingId?: string; actionId?: string; depth?: number; status?: 'succeeded' | 'failed' | 'skipped'; code?: string; message?: string; detailStatus?: 'accepted' | 'invalid'; evidence?: JsonValueV3 }> }
export interface LateActionAuditV3 { transactionId: string; actionId: string; portType: 'setParameter' | 'refresh' | 'interaction'; actualStatus: 'succeeded' | 'failed' | 'skipped' | 'rejected'; code?: string; message?: string; evidence?: JsonValueV3; evidenceStatus: 'absent' | 'accepted' | 'invalid'; evidenceError?: string; readError?: string; cancellationRequested: boolean; unknownSideEffect: boolean; completedAt: number }
