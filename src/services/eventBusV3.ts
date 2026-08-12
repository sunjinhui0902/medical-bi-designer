import type { DashboardApplicationV3, EventBindingV3, EventNameV3, JsonObjectV3, JsonValueV3 } from '../models/dashboard-v3.ts'
import { inspectEventBindingAuthorabilityV3 } from './eventBindingManagerV3.ts'
import { resolveEventOwnerV3, type EventOwnerV3 } from './eventAuthoringPolicyV3.ts'
import { evaluateEventConditionsV3 } from './eventConditionEvaluatorV3.ts'
import { resolveEventValueV3 } from './eventValueResolverV3.ts'
import { createUnavailableEventActionPortsV3 } from './eventActionPortsV3.ts'
import { consumeJsonStructureBudgetV3, createJsonStructureBudgetV3, deepFreezeSafeJsonCloneV3, getInvalidJsonStructureLimitsMessageV3, safeCloneAndDeepFreezeJsonValueV3, safeCloneJsonValueV3, safeUnknownMessageV3, type JsonStructureBudgetV3, type JsonStructureLimitsV3 } from './eventJsonValueV3.ts'
import { ApplicationEventSchedulerV3, systemEventClockV3 } from './eventRuntimeSchedulerV3.ts'
import { validateParameterCommitTransitionV3 } from './parameterCommitSemanticsV3.ts'
import type { EmittedEventV3, EventActionPortsV3, EventActionResultV3, EventClockV3, EventRuntimeContextV3, EventRuntimeIssueV3, EventTransactionResultV3, EventTriggerV3, LateActionAuditV3, ParameterCommitHandoffV3, ResolvedEventActionRequestV3 } from './eventRuntimeTypesV3.ts'

interface Options { ports?: EventActionPortsV3; clock?: EventClockV3; idFactory?: () => string; structureLimits?: Readonly<JsonStructureLimitsV3> }
interface Envelope { source: EventOwnerV3; eventName: EventNameV3; payload: JsonObjectV3; depth: number; key: string }
interface State { attempted: string[]; completed: string[]; trace: EventTransactionResultV3['trace']; eventCount: number; actionCount: number; budget: JsonStructureBudgetV3; parameters: Readonly<Record<string, JsonValueV3>>; effectApplied: boolean; refreshClaims: Set<string> }
interface Pending { handle: unknown; transactionId: string; resolve: (value: EventTransactionResultV3) => void; cleanup(): void }
type ParsedActionOutcome = { status: EventActionResultV3['status']; effectApplied?: boolean; raw: object }
type ParsedActionIssue = { ok: true; issue?: EventRuntimeIssueV3 } | { ok: false; issue: EventRuntimeIssueV3 }
type ParsedActionDetails = { ok: true; emitted?: unknown; evidence?: JsonValueV3; evidenceStatus: 'absent' | 'accepted'; effectApplied?: boolean; parameterCommit?: ParameterCommitHandoffV3; refreshClaims?: string[] } | { ok: false; issue: EventRuntimeIssueV3; evidence?: JsonValueV3; evidenceStatus: 'absent' | 'accepted' | 'invalid'; evidenceError?: string }
const runtimeErrors = new WeakMap<object, { code: 'INVALID_INPUT' | 'STRUCTURE_BUDGET_EXCEEDED'; message: string }>()
class RuntimeInputError extends Error { constructor(code: 'INVALID_INPUT' | 'STRUCTURE_BUDGET_EXCEEDED', message: string) { super(message); runtimeErrors.set(this, { code, message }) } }
const EVENT_NAMES = new Set<EventNameV3>(['pageEnter', 'click', 'doubleClick', 'rowClick', 'valueChange'])
const ownerKey = (owner: EventOwnerV3) => owner.kind === 'page' ? `page:${owner.pageId}` : `component:${owner.pageId}:${owner.componentId}`
const bindingKey = (owner: EventOwnerV3, id: string) => `${ownerKey(owner)}:${id}`

export class EventBusV3 {
  private static readonly MAX_LATE_AUDITS = 1000
  private static readonly MAX_LATE_AUDIT_NODES = 500_000
  private readonly ports: EventActionPortsV3; private readonly clock: EventClockV3; private readonly idFactory: () => string; private readonly structureLimits?: Readonly<JsonStructureLimitsV3>
  private readonly scheduler = new ApplicationEventSchedulerV3(); private readonly pending = new Map<string, Pending>(); private readonly lateAudits: LateActionAuditV3[] = []; private readonly lateAuditNodeCosts: number[] = []; private lateAuditNodeCount = 0; private lateAuditDroppedCount = 0
  constructor(options: Options = {}) { this.ports = options.ports ?? createUnavailableEventActionPortsV3(); this.clock = options.clock ?? systemEventClockV3; this.idFactory = options.idFactory ?? (() => crypto.randomUUID()); this.structureLimits = options.structureLimits }
  getLateAudits(): LateActionAuditV3[] { return deepFreezeSafeJsonCloneV3(this.lateAudits.map((item) => { const cloned = safeCloneJsonValueV3(item); return cloned.ok ? deepFreezeSafeJsonCloneV3(cloned.value) : this.minimalLateAudit(item, cloned.message) })) }
  getLateAuditDroppedCount(): number { return this.lateAuditDroppedCount }

  trigger(input: EventTriggerV3): Promise<EventTransactionResultV3> {
    let transactionId = 'invalid-transaction'
    try { transactionId = this.idFactory(); if (typeof transactionId !== 'string' || !transactionId) throw new Error('transactionId 非法') } catch (reason) { return Promise.resolve(this.failure(transactionId, 'INVALID_INPUT', this.message(reason))) }
    try {
      if (!input || typeof input !== 'object' || Object.getPrototypeOf(input) !== Object.prototype) throw new Error('trigger input 必须是 plain object')
      const read = <T>(key: string, optional = false): T | undefined => { const descriptor = Object.getOwnPropertyDescriptor(input, key); if (!descriptor) { if (optional) return undefined; throw new Error(`缺少 ${key}`) } if (!('value' in descriptor)) throw new Error(`${key} 不允许 accessor`); return descriptor.value as T }
      const rawApplication = read<DashboardApplicationV3>('application')!; const rawSource = read<EventOwnerV3>('source')!; const rawPayload = read<JsonObjectV3>('payload')!; const eventName = read<EventNameV3>('eventName')!; const rawParameters = read<Record<string, JsonValueV3>>('parameterSnapshot', true) ?? {}; const signal = read<AbortSignal>('signal', true)
      const budget = createJsonStructureBudgetV3(this.structureLimits); const app = this.safe(rawApplication, 'application', budget); const source = this.safe(rawSource, 'source', budget); const payload = this.safe(rawPayload, 'payload', budget); const parameters = this.safe(rawParameters, 'parameterSnapshot', budget)
      if (!EVENT_NAMES.has(eventName)) return Promise.resolve(this.failure(transactionId, 'INVALID_INPUT', 'eventName 非法'))
      const snapshot: EventTriggerV3 = { application: deepFreezeSafeJsonCloneV3(app), source: deepFreezeSafeJsonCloneV3(source), eventName, payload: deepFreezeSafeJsonCloneV3(payload), parameterSnapshot: deepFreezeSafeJsonCloneV3(parameters), signal }
      const owner = resolveEventOwnerV3(app, source).owner; const bindings = this.bindings(app, owner, eventName)
      if (bindings.length !== 1) return Promise.resolve(this.failure(transactionId, 'INVALID_EVENT', bindings.length ? '同 owner/event 重复 binding' : '事件 binding 不存在'))
      const delay = bindings[0].debounceMs ?? 0
      if (delay <= 0) return this.schedule(snapshot, transactionId, budget)
      const key = `${app.id}:${bindingKey(owner, bindings[0].id)}`; const previous = this.pending.get(key)
      if (previous) { this.safeClearTimeout(previous.handle); previous.cleanup(); previous.resolve(this.terminal(previous.transactionId, 'superseded')) }
      return new Promise((resolve) => {
        let fired = false
        const abort = () => { const current = this.pending.get(key); if (current?.transactionId !== transactionId) return; this.safeClearTimeout(current.handle); this.pending.delete(key); current.cleanup(); resolve(this.terminal(transactionId, 'cancelled', [{ code: 'CANCELLED', message: 'pending 事件已取消' }])) }
        const cleanup = () => signal?.removeEventListener('abort', abort)
        const pending: Pending = { handle: undefined, transactionId, resolve, cleanup }
        this.pending.set(key, pending); signal?.addEventListener('abort', abort, { once: true })
        if (signal?.aborted) { abort(); return }
        try {
          const handle = this.clock.setTimeout(() => { fired = true; if (this.pending.get(key)?.transactionId !== transactionId) return; this.pending.delete(key); cleanup(); void this.schedule(snapshot, transactionId, budget).then(resolve).catch((reason) => resolve(this.failure(transactionId, 'ACTION_FAILED', this.message(reason)))) }, delay)
          pending.handle = handle
        } catch (reason) {
          if (fired) return
          if (this.pending.get(key)?.transactionId === transactionId) this.pending.delete(key)
          cleanup(); resolve(this.failure(transactionId, 'ACTION_FAILED', this.message(reason)))
        }
      })
    } catch (reason) { const limitsMessage = getInvalidJsonStructureLimitsMessageV3(reason); const runtime = reason && typeof reason === 'object' ? runtimeErrors.get(reason) : undefined; return Promise.resolve(this.failure(transactionId, limitsMessage ? 'INVALID_STRUCTURE_LIMITS' : runtime?.code ?? 'INVALID_INPUT', limitsMessage ?? runtime?.message ?? this.message(reason))) }
  }

  cancelAll(): void { for (const item of this.pending.values()) { this.safeClearTimeout(item.handle); item.cleanup(); item.resolve(this.terminal(item.transactionId, 'cancelled', [{ code: 'CANCELLED', message: '事件已取消' }])) } this.pending.clear(); this.scheduler.cancelAll() }

  private schedule(input: EventTriggerV3, transactionId: string, budget: JsonStructureBudgetV3): Promise<EventTransactionResultV3> {
    const state: State = { attempted: [], completed: [], trace: [], eventCount: 0, actionCount: 0, budget, parameters: input.parameterSnapshot ?? {}, effectApplied: false, refreshClaims: new Set() }
    return this.scheduler.schedule(input.application.id, (signal, effectsFinished) => this.run(input, transactionId, state, signal, effectsFinished), () => this.cancelled(transactionId, state), (reason) => this.failure(transactionId, 'ACTION_FAILED', this.message(reason), state), undefined, input.signal, (value) => this.cancellationTooLate(value))
  }

  private async run(input: EventTriggerV3, transactionId: string, state: State, signal: AbortSignal, effectsFinished: (value: EventTransactionResultV3) => void): Promise<EventTransactionResultV3> {
    const finish = (value: EventTransactionResultV3) => { effectsFinished(value); return value }
    const max = input.application.runtimePolicy.maxEventDepth
    if (!Number.isInteger(max) || max < 1 || max > 100) return finish(this.failure(transactionId, 'INVALID_EVENT', 'maxEventDepth 必须为1..100', state))
    const root = this.prepareEnvelope(input.application, input.source, input.eventName, input.payload, 1, new Set(), new Set())
    if ('code' in root) return finish(this.failure(transactionId, root.code, root.message, state))
    const queue: Envelope[] = [root]; const visited = new Set<string>(); const pendingKeys = new Set<string>([root.key])
    while (queue.length) {
      if (signal.aborted) return this.cancelled(transactionId, state)
      const envelope = queue.shift()!; pendingKeys.delete(envelope.key); state.eventCount++
      if (state.eventCount > 1000) return finish(this.failure(transactionId, 'EVENT_BUDGET_EXCEEDED', '事件预算超限', state))
      if (visited.has(envelope.key)) return finish(this.failure(transactionId, 'EVENT_LOOP_DETECTED', '同事务重复事件', state))
      visited.add(envelope.key)
      const issue = await this.process(input.application, transactionId, envelope, queue, visited, pendingKeys, state, signal)
      if (issue) return finish(this.failure(transactionId, issue.code, issue.message, state, issue))
    }
    return finish(this.terminal(transactionId, state.completed.length ? 'completed' : 'skipped', [], state))
  }

  private async process(app: DashboardApplicationV3, transactionId: string, envelope: Envelope, queue: Envelope[], visited: Set<string>, pendingKeys: Set<string>, state: State, signal: AbortSignal): Promise<EventRuntimeIssueV3 | undefined> {
    const owner = resolveEventOwnerV3(app, envelope.source).owner; const binding = this.bindings(app, owner, envelope.eventName)[0]
    if (!binding) return { code: 'INVALID_EVENT', message: 'binding 不存在' }
    const inspection = inspectEventBindingAuthorabilityV3(app, owner, binding); if (!inspection.authorable) return { code: 'INVALID_EVENT', message: inspection.reasons.join('；') }
    if (!binding.enabled) { state.trace.push({ kind: 'disabled', eventBindingId: binding.id, depth: envelope.depth }); return }
    const context: EventRuntimeContextV3 = deepFreezeSafeJsonCloneV3({ transactionId, depth: envelope.depth, applicationId: app.id, eventBindingId: binding.id, eventName: binding.event, source: envelope.source, occurredAt: this.clock.now(), payload: envelope.payload })
    const condition = evaluateEventConditionsV3(binding.conditions, context, state.parameters, state.budget); if (condition.error) return { code: condition.code === 'STRUCTURE_BUDGET_EXCEEDED' ? condition.code : 'INVALID_EVENT', message: condition.error }
    if (!condition.matched) { state.trace.push({ kind: 'conditionSkipped', eventBindingId: binding.id, depth: envelope.depth }); return }
    for (const raw of binding.actions) {
      if (signal.aborted) return { code: 'CANCELLED', message: '事务已取消' }
      if (++state.actionCount > 10000) return { code: 'ACTION_BUDGET_EXCEEDED', message: '动作预算超限' }
      const resolved = this.resolveAction(raw, context, state.parameters, state.budget); if ('code' in resolved) return resolved
      state.attempted.push(raw.id)
      let rawResult: unknown
      try {
        rawResult = raw.type === 'setParameter'
          ? await this.ports.setParameter.execute({ action: resolved as Extract<ResolvedEventActionRequestV3, { type: 'setParameter' }>, context, parameterSnapshot: state.parameters, signal })
          : await this.ports.refresh.execute({ action: resolved as Extract<ResolvedEventActionRequestV3, { type: 'refresh' }>, context, parameterSnapshot: state.parameters, signal, refreshClaimSnapshot: deepFreezeSafeJsonCloneV3([...state.refreshClaims]) })
      } catch (reason) {
        if (signal.aborted) this.recordLate(transactionId, raw.id, raw.type, 'rejected', undefined, 'ACTION_FAILED', this.message(reason), state.budget)
        return { code: 'ACTION_FAILED', message: this.message(reason), actionId: raw.id }
      }
      const outcome = this.parseActionOutcome(rawResult, raw.id)
      if ('code' in outcome) { if (signal.aborted) this.recordLate(transactionId, raw.id, raw.type, 'rejected', undefined, outcome.code, outcome.message, state.budget, false, 'absent'); return outcome }
      if (outcome.effectApplied === true) state.effectApplied = true
      if (outcome.status === 'succeeded') state.completed.push(raw.id)
      const outcomeIssue = this.parseActionIssue(outcome, raw.id, state.budget)
      const recordedIssue = outcomeIssue.issue
      state.trace.push(deepFreezeSafeJsonCloneV3({ kind: 'actionOutcome', actionId: raw.id, eventBindingId: binding.id, depth: envelope.depth, status: outcome.status, ...(recordedIssue?.code ? { code: recordedIssue.code } : {}), ...(recordedIssue?.message ? { message: recordedIssue.message } : {}) }))
      if (!outcomeIssue.ok) { if (signal.aborted) this.recordLate(transactionId, raw.id, raw.type, outcome.status, undefined, outcomeIssue.issue.code, outcomeIssue.issue.message, state.budget, true, 'absent'); return outcomeIssue.issue }
      const details = this.parseActionDetails(outcome, raw.id, state.budget)
      if (!details.ok) {
        state.trace.push(deepFreezeSafeJsonCloneV3({ kind: 'actionDetail', actionId: raw.id, eventBindingId: binding.id, depth: envelope.depth, detailStatus: 'invalid', code: details.issue.code, message: details.issue.message }))
        if (signal.aborted) this.recordLate(transactionId, raw.id, raw.type, outcome.status, details.evidence, details.issue.code, details.issue.message, state.budget, true, details.evidenceStatus, details.evidenceError)
        return details.issue
      }
      state.trace.push(deepFreezeSafeJsonCloneV3({ kind: 'actionDetail', actionId: raw.id, eventBindingId: binding.id, depth: envelope.depth, detailStatus: 'accepted', ...(details.evidence !== undefined ? { evidence: details.evidence } : {}) }))
      if (raw.type === 'setParameter') {
        if (details.refreshClaims !== undefined) return { code: 'PORT_CONTRACT_VIOLATION', message: 'setParameter must not return refreshClaims', actionId: raw.id }
        if ((details.effectApplied === true || details.parameterCommit !== undefined) && (!details.parameterCommit || details.effectApplied !== true)) return { code: 'PORT_CONTRACT_VIOLATION', message: 'setParameter effectApplied 与 parameterCommit 必须成对出现', actionId: raw.id }
        if (details.parameterCommit) {
          const handoffIssue = this.validateParameterCommit(details.parameterCommit, app.id, resolved as Extract<ResolvedEventActionRequestV3, { type: 'setParameter' }>, transactionId, state.parameters)
          if (handoffIssue) return handoffIssue
          state.parameters = details.parameterCommit.values
          state.effectApplied = true
        }
        if (details.emitted !== undefined && !details.parameterCommit) return { code: 'PORT_CONTRACT_VIOLATION', message: 'setParameter emittedEvents 必须携带合法 parameterCommit', actionId: raw.id }
      } else {
        if (details.parameterCommit !== undefined || details.emitted !== undefined) return { code: 'PORT_CONTRACT_VIOLATION', message: 'refresh must not return parameterCommit or emittedEvents', actionId: raw.id }
        if (outcome.status === 'skipped' && details.refreshClaims?.length) return { code: 'PORT_CONTRACT_VIOLATION', message: 'skipped refresh must not claim queries', actionId: raw.id }
        details.refreshClaims?.forEach((claim) => state.refreshClaims.add(claim))
      }
      if (signal.aborted) { this.recordLate(transactionId, raw.id, raw.type, outcome.status, details.evidence, outcomeIssue.issue?.code, outcomeIssue.issue?.message, state.budget, true, details.evidenceStatus); return { code: 'CANCELLED', message: '事务已取消', actionId: raw.id } }
      if (outcome.status !== 'succeeded' && details.emitted !== undefined) return { code: 'PORT_CONTRACT_VIOLATION', message: 'skipped/failed 不得 emittedEvents', actionId: raw.id }
      if (outcome.status === 'failed') return outcomeIssue.issue ?? { code: 'ACTION_FAILED', message: '动作失败', actionId: raw.id }
      if (details.emitted !== undefined) {
        const issue = this.enqueueBatch(app, details.emitted, envelope.depth + 1, queue, visited, pendingKeys, state.eventCount, state.budget)
        if (issue) return issue
      }
    }
  }

  private enqueueBatch(app: DashboardApplicationV3, raw: unknown, depth: number, queue: Envelope[], visited: Set<string>, pendingKeys: Set<string>, processed: number, budget: JsonStructureBudgetV3): EventRuntimeIssueV3 | undefined {
    if (!Array.isArray(raw)) return { code: 'PORT_CONTRACT_VIOLATION', message: 'emittedEvents 必须是数组' }
    let length: unknown
    try { const descriptor = Object.getOwnPropertyDescriptor(raw, 'length'); if (!descriptor || !('value' in descriptor)) return { code: 'PORT_CONTRACT_VIOLATION', message: 'emittedEvents length descriptor 非法' }; length = descriptor.value }
    catch (reason) { return { code: 'PORT_CONTRACT_VIOLATION', message: `emittedEvents length reflection failed: ${this.message(reason)}` } }
    if (!Number.isSafeInteger(length) || (length as number) < 0) return { code: 'PORT_CONTRACT_VIOLATION', message: 'emittedEvents length 非法' }
    const batchLength = length as number
    const remaining = 1000 - processed - queue.length
    if (batchLength > remaining) return { code: 'EVENT_BUDGET_EXCEEDED', message: `emitted 批次 ${batchLength} 超过剩余预算 ${remaining}` }
    let keys: PropertyKey[]
    try { keys = Reflect.ownKeys(raw) } catch (reason) { return { code: 'PORT_CONTRACT_VIOLATION', message: `emittedEvents ownKeys failed: ${this.message(reason)}` } }
    if (keys.some((key) => typeof key !== 'string' || (key !== 'length' && !/^(0|[1-9]\d*)$/.test(key)))) return { code: 'PORT_CONTRACT_VIOLATION', message: 'emittedEvents does not allow extra or Symbol properties' }
    const additions: Envelope[] = []; const batchKeys = new Set<string>()
    for (let index = 0; index < batchLength; index++) {
      const descriptor = Object.getOwnPropertyDescriptor(raw, String(index)); if (!descriptor || !('value' in descriptor)) return { code: 'PORT_CONTRACT_VIOLATION', message: 'emittedEvents 不允许稀疏/accessor' }
      const cloned = safeCloneAndDeepFreezeJsonValueV3(descriptor.value as EmittedEventV3, budget); if (!cloned.ok) return { code: cloned.code === 'STRUCTURE_BUDGET_EXCEEDED' ? cloned.code : 'INVALID_EVENT', message: cloned.message }
      const item = cloned.value
      if (!EVENT_NAMES.has(item.eventName)) return { code: 'INVALID_EVENT', message: 'nested eventName 非法' }
      const prepared = this.prepareEnvelope(app, item.source, item.eventName, item.payload, depth, visited, new Set([...pendingKeys, ...batchKeys]))
      if ('code' in prepared) return prepared
      batchKeys.add(prepared.key); additions.push(prepared)
    }
    additions.forEach((item) => { queue.push(item); pendingKeys.add(item.key) }); return undefined
  }

  private prepareEnvelope(app: DashboardApplicationV3, source: EventOwnerV3, name: EventNameV3, payload: JsonObjectV3, depth: number, visited: Set<string>, pending: Set<string>): Envelope | EventRuntimeIssueV3 {
    if (depth > app.runtimePolicy.maxEventDepth) return { code: 'MAX_EVENT_DEPTH_EXCEEDED', message: `深度${depth}超限` }
    if (!this.validPayload(name, payload)) return { code: 'INVALID_EVENT', message: 'payload 不符合冻结契约' }
    let owner: EventOwnerV3; try { owner = resolveEventOwnerV3(app, source).owner } catch (reason) { return { code: 'INVALID_EVENT', message: this.message(reason) } }
    const bindings = this.bindings(app, owner, name); if (bindings.length !== 1) return { code: 'INVALID_EVENT', message: 'nested binding 缺失或重复' }
    const key = bindingKey(owner, bindings[0].id); if (visited.has(key) || pending.has(key)) return { code: 'EVENT_LOOP_DETECTED', message: 'nested 事件重复' }
    return { source: owner, eventName: name, payload, depth, key }
  }

  private resolveAction(raw: EventBindingV3['actions'][number], context: EventRuntimeContextV3, parameters: Readonly<Record<string, JsonValueV3>>, budget: JsonStructureBudgetV3): ResolvedEventActionRequestV3 | EventRuntimeIssueV3 {
    if (raw.type === 'refresh') { const charged = consumeJsonStructureBudgetV3(budget, 1, 'resolved refresh action'); if (!charged.ok) return { code: charged.code, message: charged.message, actionId: raw.id }; return deepFreezeSafeJsonCloneV3({ id: raw.id, type: 'refresh', target: raw.target }) }
    const assignments: Array<{ parameterId: string; value: JsonValueV3 }> = []
    for (const item of raw.assignments) { const value = resolveEventValueV3(item.value, context, parameters, budget); if (value.kind !== 'value') return { code: value.kind === 'error' && value.code === 'STRUCTURE_BUDGET_EXCEEDED' ? value.code : 'INVALID_EVENT', message: value.kind === 'error' ? value.message : `赋值 ${item.parameterId} 缺失` }; assignments.push({ parameterId: item.parameterId, value: value.value }) }
    const charged = consumeJsonStructureBudgetV3(budget, 2 + assignments.length, 'resolved setParameter action'); if (!charged.ok) return { code: charged.code, message: charged.message, actionId: raw.id }
    return deepFreezeSafeJsonCloneV3({ id: raw.id, type: 'setParameter', assignments })
  }

  private bindings(app: DashboardApplicationV3, owner: EventOwnerV3, name: EventNameV3) { const page = app.pages.find((item) => item.id === owner.pageId); const events = owner.kind === 'page' ? page?.pageEvents : page?.components.find((item) => item.id === owner.componentId)?.events; return (events ?? []).filter((item) => item.event === name) }
  private validPayload(name: EventNameV3, payload: JsonObjectV3) { const keys = Object.keys(payload); if (name === 'pageEnter') return keys.length === 0; const key = name === 'rowClick' ? 'row' : name === 'valueChange' ? 'value' : 'datum'; if (keys.length !== 1 || keys[0] !== key) return false; const value = payload[key]; return name === 'valueChange' || Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype) }
  private parseActionOutcome(raw: unknown, actionId: string): ParsedActionOutcome | EventRuntimeIssueV3 {
    try {
      if (!raw || typeof raw !== 'object' || Object.getPrototypeOf(raw) !== Object.prototype) return { code: 'PORT_CONTRACT_VIOLATION', message: 'action result 必须是 plain object', actionId }
      const descriptor = Object.getOwnPropertyDescriptor(raw, 'status'); if (!descriptor || !('value' in descriptor)) return { code: 'PORT_CONTRACT_VIOLATION', message: 'action result status descriptor 非法', actionId }
      const status = descriptor.value
      if (status !== 'succeeded' && status !== 'failed' && status !== 'skipped') return { code: 'PORT_CONTRACT_VIOLATION', message: 'action result status 非法', actionId }
      const effectDescriptor = Object.getOwnPropertyDescriptor(raw, 'effectApplied')
      if (effectDescriptor && !('value' in effectDescriptor)) return { code: 'PORT_CONTRACT_VIOLATION', message: 'effectApplied descriptor invalid', actionId }
      const effectApplied = effectDescriptor?.value
      if (effectApplied !== undefined && typeof effectApplied !== 'boolean') return { code: 'PORT_CONTRACT_VIOLATION', message: 'effectApplied must be boolean', actionId }
      return { status, ...(effectApplied !== undefined ? { effectApplied } : {}), raw }
    } catch (reason) { return { code: 'PORT_CONTRACT_VIOLATION', message: this.message(reason), actionId } }
  }
  private parseActionIssue(outcome: ParsedActionOutcome, actionId: string, budget: JsonStructureBudgetV3): ParsedActionIssue {
    let rawIssue: unknown
    try { const descriptor = Object.getOwnPropertyDescriptor(outcome.raw, 'issue'); if (descriptor && !('value' in descriptor)) throw 'issue accessor'; rawIssue = descriptor?.value }
    catch (reason) { return { ok: false, issue: { code: 'PORT_CONTRACT_VIOLATION', message: this.message(reason), actionId } } }
    if (rawIssue === undefined) return { ok: true }
    const cloned = safeCloneJsonValueV3(rawIssue, budget)
    if (!cloned.ok) return { ok: false, issue: { code: cloned.code === 'STRUCTURE_BUDGET_EXCEEDED' ? cloned.code : 'PORT_CONTRACT_VIOLATION', message: cloned.message, actionId } }
    const value = cloned.value as Partial<EventRuntimeIssueV3>
    if (!value || typeof value !== 'object' || typeof value.code !== 'string' || typeof value.message !== 'string') return { ok: false, issue: { code: 'PORT_CONTRACT_VIOLATION', message: 'action issue 非法', actionId } }
    return { ok: true, issue: deepFreezeSafeJsonCloneV3(value as EventRuntimeIssueV3) }
  }
  private parseActionDetails(outcome: ParsedActionOutcome, actionId: string, budget: JsonStructureBudgetV3): ParsedActionDetails {
    const read = (key: string) => { const descriptor = Object.getOwnPropertyDescriptor(outcome.raw, key); if (descriptor && !('value' in descriptor)) throw `${key} accessor`; return descriptor?.value }
    let evidence: JsonValueV3 | undefined
    let rawEvidence: unknown
    try { rawEvidence = read('evidence') } catch (reason) { const message = this.message(reason); return { ok: false, issue: { code: 'PORT_CONTRACT_VIOLATION', message, actionId }, evidenceStatus: 'invalid', evidenceError: message } }
    if (rawEvidence !== undefined) {
      const cloned = safeCloneJsonValueV3(rawEvidence, budget)
      if (!cloned.ok) { const issue = { code: cloned.code === 'STRUCTURE_BUDGET_EXCEEDED' ? cloned.code : 'PORT_CONTRACT_VIOLATION', message: cloned.message, actionId } as EventRuntimeIssueV3; return { ok: false, issue, evidenceStatus: 'invalid', evidenceError: cloned.message } }
      evidence = deepFreezeSafeJsonCloneV3(cloned.value as JsonValueV3)
    }
    let effectApplied: boolean | undefined
    try { const rawEffect = read('effectApplied'); if (rawEffect !== undefined && typeof rawEffect !== 'boolean') throw 'effectApplied 必须是 boolean'; effectApplied = rawEffect as boolean | undefined }
    catch (reason) { return { ok: false, issue: { code: 'PORT_CONTRACT_VIOLATION', message: this.message(reason), actionId }, ...(evidence !== undefined ? { evidence } : {}), evidenceStatus: evidence === undefined ? 'absent' : 'accepted' } }
    let parameterCommit: ParameterCommitHandoffV3 | undefined
    try {
      const rawCommit = read('parameterCommit')
      if (rawCommit !== undefined) {
        const cloned = safeCloneJsonValueV3(rawCommit, budget)
        if (!cloned.ok) return { ok: false, issue: { code: cloned.code === 'STRUCTURE_BUDGET_EXCEEDED' ? cloned.code : 'PORT_CONTRACT_VIOLATION', message: cloned.message, actionId }, ...(evidence !== undefined ? { evidence } : {}), evidenceStatus: evidence === undefined ? 'absent' : 'accepted' }
        parameterCommit = deepFreezeSafeJsonCloneV3(cloned.value as ParameterCommitHandoffV3)
      }
    } catch (reason) { return { ok: false, issue: { code: 'PORT_CONTRACT_VIOLATION', message: this.message(reason), actionId }, ...(evidence !== undefined ? { evidence } : {}), evidenceStatus: evidence === undefined ? 'absent' : 'accepted' } }
    let refreshClaims: string[] | undefined
    try {
      const rawClaims = read('refreshClaims')
      if (rawClaims !== undefined) {
        const cloned = safeCloneJsonValueV3(rawClaims, budget)
        if (!cloned.ok || !Array.isArray(cloned.value) || cloned.value.some((claim) => typeof claim !== 'string') || new Set(cloned.value).size !== cloned.value.length) throw new Error(cloned.ok ? 'refreshClaims invalid' : cloned.message)
        refreshClaims = cloned.value as string[]
        for (const claim of refreshClaims) { const tuple = JSON.parse(claim) as unknown; if (!Array.isArray(tuple) || tuple.length !== 2 || tuple.some((part) => typeof part !== 'string' || !part)) throw new Error('refresh claim key invalid') }
        refreshClaims = deepFreezeSafeJsonCloneV3(refreshClaims)
      }
    } catch (reason) { return { ok: false, issue: { code: 'PORT_CONTRACT_VIOLATION', message: this.message(reason), actionId }, ...(evidence !== undefined ? { evidence } : {}), evidenceStatus: evidence === undefined ? 'absent' : 'accepted' } }
    let emitted: unknown
    try { emitted = read('emittedEvents') } catch (reason) { return { ok: false, issue: { code: 'PORT_CONTRACT_VIOLATION', message: this.message(reason), actionId }, ...(evidence !== undefined ? { evidence } : {}), evidenceStatus: evidence === undefined ? 'absent' : 'accepted' } }
    return { ok: true, ...(emitted !== undefined ? { emitted } : {}), ...(evidence !== undefined ? { evidence } : {}), ...(effectApplied !== undefined ? { effectApplied } : {}), ...(parameterCommit !== undefined ? { parameterCommit } : {}), ...(refreshClaims !== undefined ? { refreshClaims } : {}), evidenceStatus: evidence === undefined ? 'absent' : 'accepted' }
  }
  private validateParameterCommit(value: ParameterCommitHandoffV3, applicationId: string, action: Extract<ResolvedEventActionRequestV3, { type: 'setParameter' }>, eventTransactionId: string, before: Readonly<Record<string, JsonValueV3>>): EventRuntimeIssueV3 | undefined {
    const actionId = action.id
    const invalid = (message: string): EventRuntimeIssueV3 => ({ code: 'PORT_CONTRACT_VIOLATION', message, actionId })
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) return invalid('parameterCommit 必须是 plain object')
    const allowed = new Set(['kind', 'applicationId', 'actionId', 'eventTransactionId', 'parameterTransactionId', 'changedParameterIds', 'values'])
    if (Object.keys(value).some((key) => !allowed.has(key)) || Object.keys(value).length !== allowed.size) return invalid('parameterCommit 字段非法')
    if (value.kind !== 'parameterCommit' || value.applicationId !== applicationId || value.actionId !== actionId || value.eventTransactionId !== eventTransactionId) return invalid('parameterCommit 绑定信息非法')
    if (typeof value.parameterTransactionId !== 'string' || !value.parameterTransactionId) return invalid('parameterTransactionId 非法')
    if (!Array.isArray(value.changedParameterIds) || !value.changedParameterIds.length || value.changedParameterIds.some((id) => typeof id !== 'string' || !id) || new Set(value.changedParameterIds).size !== value.changedParameterIds.length) return invalid('changedParameterIds 非法')
    if (!value.values || typeof value.values !== 'object' || Array.isArray(value.values) || Object.getPrototypeOf(value.values) !== Object.prototype) return invalid('parameterCommit values 非法')
    if (value.parameterTransactionId === eventTransactionId) return invalid('parameter and event transaction ids must differ')
    const transition = validateParameterCommitTransitionV3({ before, after: value.values, assignments: action.assignments, changedParameterIds: value.changedParameterIds })
    if (!transition.ok) return invalid(transition.message)
    return undefined
  }
  private safe<T>(value: T, label: string, budget: JsonStructureBudgetV3): T { const result = safeCloneAndDeepFreezeJsonValueV3(value, budget); if (!result.ok) throw new RuntimeInputError(result.code, `${label}: ${result.message}`); return result.value }
  private recordLate(transactionId: string, actionId: string, portType: 'setParameter' | 'refresh', actualStatus: 'succeeded' | 'failed' | 'skipped' | 'rejected', evidence: JsonValueV3 | undefined, code: string | undefined, message: string | undefined, budget: JsonStructureBudgetV3, evidenceAlreadySafe = false, suppliedEvidenceStatus?: 'absent' | 'accepted' | 'invalid', suppliedEvidenceError?: string) {
    let safeEvidence: JsonValueV3 | undefined; let evidenceMessage = suppliedEvidenceError; let evidenceStatus = suppliedEvidenceStatus ?? (evidence === undefined ? 'absent' : 'accepted')
    if (evidence !== undefined) {
      if (evidenceAlreadySafe) safeEvidence = evidence
      else { const cloned = safeCloneJsonValueV3(evidence, budget); if (cloned.ok) safeEvidence = deepFreezeSafeJsonCloneV3(cloned.value); else { evidenceStatus = 'invalid'; evidenceMessage = cloned.message } }
    }
    const audit = deepFreezeSafeJsonCloneV3({ transactionId, actionId, portType, actualStatus, ...(code ? { code } : {}), ...(message ? { message } : {}), ...(safeEvidence !== undefined ? { evidence: safeEvidence } : {}), evidenceStatus, ...(evidenceMessage ? { evidenceError: evidenceMessage } : {}), cancellationRequested: true, unknownSideEffect: actualStatus !== 'skipped', completedAt: this.safeNow() }) as LateActionAuditV3
    this.appendLateAudit(audit)
  }
  private minimalLateAudit(item: LateActionAuditV3, readError: string): LateActionAuditV3 { return deepFreezeSafeJsonCloneV3({ transactionId: item.transactionId, actionId: item.actionId, portType: item.portType, actualStatus: item.actualStatus, ...(item.code ? { code: item.code } : {}), ...(item.message ? { message: item.message } : {}), evidenceStatus: item.evidenceStatus, ...(item.evidenceError ? { evidenceError: item.evidenceError } : {}), readError, cancellationRequested: item.cancellationRequested, unknownSideEffect: item.unknownSideEffect, completedAt: item.completedAt }) }
  private estimateAuditNodes(value: JsonValueV3): { ok: true; cost: number } | { ok: false; error: string } {
    try {
      let count = 0; const pending: JsonValueV3[] = [value]
      while (pending.length && count <= EventBusV3.MAX_LATE_AUDIT_NODES) {
        const current = pending.pop()!; count++
        if (!current || typeof current !== 'object') continue
        if (Array.isArray(current)) {
          const lengthDescriptor = Object.getOwnPropertyDescriptor(current, 'length')
          if (!lengthDescriptor || !('value' in lengthDescriptor) || !Number.isSafeInteger(lengthDescriptor.value) || lengthDescriptor.value < 0) return { ok: false, error: 'late audit array length 非法' }
          const length = lengthDescriptor.value as number
          if (count + pending.length + length > EventBusV3.MAX_LATE_AUDIT_NODES) return { ok: true, cost: EventBusV3.MAX_LATE_AUDIT_NODES + 1 }
          for (let index = length - 1; index >= 0; index--) { const descriptor = Object.getOwnPropertyDescriptor(current, String(index)); if (!descriptor || !('value' in descriptor)) return { ok: false, error: 'late audit array descriptor 非法' }; pending.push(descriptor.value as JsonValueV3) }
        } else {
          for (const key in current) if (Object.hasOwn(current, key)) { if (count + pending.length + 1 > EventBusV3.MAX_LATE_AUDIT_NODES) return { ok: true, cost: EventBusV3.MAX_LATE_AUDIT_NODES + 1 }; const descriptor = Object.getOwnPropertyDescriptor(current, key); if (!descriptor || !('value' in descriptor)) return { ok: false, error: 'late audit object descriptor 非法' }; pending.push(descriptor.value as JsonValueV3) }
        }
      }
      return { ok: true, cost: count }
    } catch (reason) { return { ok: false, error: this.message(reason) } }
  }
  private appendLateAudit(input: LateActionAuditV3) {
    let audit = input; let estimated = this.estimateAuditNodes(audit as unknown as JsonValueV3)
    if (!estimated.ok || estimated.cost > EventBusV3.MAX_LATE_AUDIT_NODES) { audit = this.minimalLateAudit(audit, estimated.ok ? 'late audit 超过存储节点上限' : `late audit 节点估算失败: ${estimated.error}`); this.lateAuditDroppedCount++; estimated = this.estimateAuditNodes(audit as unknown as JsonValueV3) }
    const cost = estimated.ok ? estimated.cost : 32
    while (this.lateAudits.length && (this.lateAudits.length >= EventBusV3.MAX_LATE_AUDITS || this.lateAuditNodeCount + cost > EventBusV3.MAX_LATE_AUDIT_NODES)) { this.lateAudits.shift(); this.lateAuditNodeCount -= this.lateAuditNodeCosts.shift() ?? 0; this.lateAuditDroppedCount++ }
    this.lateAudits.push(audit); this.lateAuditNodeCosts.push(cost); this.lateAuditNodeCount += cost
  }
  private safeNow() { try { const value = this.clock.now(); return Number.isFinite(value) ? value : 0 } catch { return 0 } }
  private safeClearTimeout(handle: unknown) { try { this.clock.clearTimeout(handle) } catch { /* cancellation settlement must continue */ } }
  private message(reason: unknown) { return safeUnknownMessageV3(reason, '运行时错误') }
  private cancelled(id: string, state: State) { return this.terminal(id, 'cancelled', [{ code: 'CANCELLED', message: '事务已取消' }], state, state.attempted.length > state.completed.length) }
  private failure(id: string, code: EventRuntimeIssueV3['code'], message: string, state?: State, issue?: EventRuntimeIssueV3) { return this.terminal(id, 'failed', [issue ?? { code, message }], state) }
  private cancellationTooLate(value: EventTransactionResultV3): EventTransactionResultV3 { return deepFreezeSafeJsonCloneV3({ ...value, trace: [...value.trace, { kind: 'cancellationTooLate' }] }) }
  private terminal(id: string, status: EventTransactionResultV3['status'], issues: EventRuntimeIssueV3[] = [], state?: State, unknown = false): EventTransactionResultV3 { return deepFreezeSafeJsonCloneV3({ transactionId: id, status, issues: [...issues], attemptedActionIds: [...(state?.attempted ?? [])], completedActionIds: [...(state?.completed ?? [])], partiallyApplied: unknown || Boolean(issues.length && (state?.completed.length || state?.effectApplied)), trace: [...(state?.trace ?? []), ...(unknown ? [{ kind: 'unknownSideEffect' }] : [])] }) }
}
