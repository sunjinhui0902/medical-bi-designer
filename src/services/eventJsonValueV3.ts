export interface JsonStructureLimitsV3 { maxTotalNodes: number; maxDepth: number; maxObjectKeys: number; maxArrayLength: number }
export const DEFAULT_JSON_STRUCTURE_LIMITS_V3: Readonly<JsonStructureLimitsV3> = Object.freeze({ maxTotalNodes: 200_000, maxDepth: 128, maxObjectKeys: 20_000, maxArrayLength: 20_000 })
export interface JsonStructureBudgetV3 { readonly limits: Readonly<JsonStructureLimitsV3>; readonly nodesUsed: number }
export type SafeJsonCloneFailureCodeV3 = 'STRUCTURE_BUDGET_EXCEEDED' | 'INVALID_INPUT'
export type SafeJsonCloneResultV3<T> = { ok: true; value: T } | { ok: false; code: SafeJsonCloneFailureCodeV3; message: string }

interface BudgetState { readonly limits: Readonly<JsonStructureLimitsV3>; nodesUsed: number }
const budgets = new WeakMap<object, BudgetState>()
const invalidLimitsErrors = new WeakMap<object, string>()
const trustedJsonObjects = new WeakSet<object>()
const STOP = Object.freeze({})

export function createJsonStructureBudgetV3(limits: Readonly<JsonStructureLimitsV3> = DEFAULT_JSON_STRUCTURE_LIMITS_V3): JsonStructureBudgetV3 {
  try {
    if (!limits || typeof limits !== 'object' || Object.getPrototypeOf(limits) !== Object.prototype) throw new Error('structureLimits 必须是 plain object')
    const normalized = {} as JsonStructureLimitsV3
    for (const key of ['maxTotalNodes', 'maxDepth', 'maxObjectKeys', 'maxArrayLength'] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(limits, key)
      if (!descriptor || !('value' in descriptor) || !Number.isSafeInteger(descriptor.value) || descriptor.value <= 0) throw new Error(`structureLimits.${key} 必须是正安全整数`)
      normalized[key] = descriptor.value
    }
    const frozenLimits = Object.freeze(normalized); const state: BudgetState = { limits: frozenLimits, nodesUsed: 0 }
    const budget = Object.freeze({ limits: frozenLimits, get nodesUsed() { return state.nodesUsed } })
    budgets.set(budget, state); return budget
  } catch (reason) {
    const error = new Error(safeUnknownMessageV3(reason, 'structureLimits 非法')); invalidLimitsErrors.set(error, error.message); throw error
  }
}

export function getInvalidJsonStructureLimitsMessageV3(reason: unknown): string | undefined { return reason && typeof reason === 'object' ? invalidLimitsErrors.get(reason) : undefined }

/**
 * Budgeted nodes: every node cloned from trigger DTOs, untrusted port issue/evidence/emitted items and non-provenance expressions,
 * plus newly allocated resolved-action containers (refresh root; setParameter root, assignments array and assignment objects).
 * Internal scheduler/envelope/context/trace/audit/result metadata is not charged. Provenance-tracked frozen children are reused without recharge.
 */
export function consumeJsonStructureBudgetV3(budget: JsonStructureBudgetV3, nodes: number, label: string): SafeJsonCloneResultV3<undefined> {
  const state = budget && typeof budget === 'object' ? budgets.get(budget as object) : undefined
  if (!state || !Object.isFrozen(budget) || !Object.isFrozen(state.limits) || budget.limits !== state.limits || !Number.isSafeInteger(state.nodesUsed) || state.nodesUsed < 0 || !Number.isSafeInteger(nodes) || nodes < 0) return { ok: false, code: 'INVALID_INPUT', message: `${label}: JSON budget 或 nodes 非法` }
  state.nodesUsed += nodes
  return state.nodesUsed > state.limits.maxTotalNodes
    ? { ok: false, code: 'STRUCTURE_BUDGET_EXCEEDED', message: `${label}: JSON 总节点超过 ${state.limits.maxTotalNodes}` }
    : { ok: true, value: undefined }
}

/** Formats thrown values without coercing, inspecting prototypes, or reading arbitrary object properties. */
export function safeUnknownMessageV3(reason: unknown, fallback = '未知错误'): string {
  if (typeof reason === 'string') return reason
  if (typeof reason === 'number' || typeof reason === 'boolean' || typeof reason === 'bigint') return `${reason}`
  if (typeof reason === 'symbol') return 'Symbol error'
  if (reason === null) return 'null'
  if (reason === undefined) return 'undefined'
  try {
    const descriptor = Object.getOwnPropertyDescriptor(reason, 'message')
    if (descriptor && 'value' in descriptor && typeof descriptor.value === 'string') return descriptor.value
  } catch { /* hostile reflection is intentionally ignored */ }
  return fallback
}

/**
 * Trust boundary for plain-data DTOs. A shared budget makes all clones in one transaction cumulative.
 * JavaScript requires Reflect.ownKeys to allocate the first key list; the key-count gate cannot avoid that initial allocation.
 * Proxy reflection traps may execute, but their failures are contained as INVALID_INPUT.
 */
export function safeCloneJsonValueV3<T>(input: T, limitsOrBudget: Readonly<JsonStructureLimitsV3> | JsonStructureBudgetV3 = DEFAULT_JSON_STRUCTURE_LIMITS_V3): SafeJsonCloneResultV3<T> {
  const existing = typeof limitsOrBudget === 'object' ? budgets.get(limitsOrBudget as object) : undefined
  const budget = existing ? limitsOrBudget as JsonStructureBudgetV3 : createJsonStructureBudgetV3(limitsOrBudget as Readonly<JsonStructureLimitsV3>)
  const state = budgets.get(budget as object)!; const limits = state.limits; const stack = new Set<object>()
  let captured: { code: SafeJsonCloneFailureCodeV3; message: string } | undefined
  const fail = (code: SafeJsonCloneFailureCodeV3, message: string): never => { captured = { code, message }; throw STOP }
  const gate = (condition: boolean, message: string) => { if (condition) fail('STRUCTURE_BUDGET_EXCEEDED', message) }
  const visit = (value: unknown, path: string, depth: number): unknown => {
    gate(++state.nodesUsed > limits.maxTotalNodes, `JSON 总节点超过 ${limits.maxTotalNodes}`)
    gate(depth > limits.maxDepth, `JSON 深度超过 ${limits.maxDepth}`)
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
    if (typeof value === 'number') { if (!Number.isFinite(value)) fail('INVALID_INPUT', `${path} 必须是有限数字`); return value }
    if (typeof value !== 'object') fail('INVALID_INPUT', `${path} 不是 JSON 值`)
    const objectValue = value as object
    if (stack.has(objectValue)) fail('INVALID_INPUT', `${path} 存在循环引用`)
    const prototype = Object.getPrototypeOf(objectValue)
    const isArray = Array.isArray(objectValue)
    if (isArray) {
      if (prototype !== Array.prototype) fail('INVALID_INPUT', `${path} 数组原型异常`)
      const descriptor = Object.getOwnPropertyDescriptor(objectValue, 'length')
      if (!descriptor || !('value' in descriptor) || !Number.isSafeInteger(descriptor.value)) fail('INVALID_INPUT', `${path} length 非法`)
      gate((descriptor as PropertyDescriptor & { value: number }).value > limits.maxArrayLength, `${path} 数组长度超过 ${limits.maxArrayLength}`)
    } else if (prototype !== Object.prototype) fail('INVALID_INPUT', `${path} 必须是 plain object`)
    const keys = Reflect.ownKeys(objectValue)
    const stringKeys = keys.filter((key): key is string => typeof key === 'string' && (!isArray || key !== 'length'))
    if (keys.some((key) => typeof key === 'symbol')) fail('INVALID_INPUT', `${path} 不允许 Symbol 属性`)
    gate(!isArray && stringKeys.length > limits.maxObjectKeys, `${path} 对象键数超过 ${limits.maxObjectKeys}`)
    if (isArray) {
      const length = (Object.getOwnPropertyDescriptor(objectValue, 'length') as PropertyDescriptor & { value: number }).value
      if (stringKeys.length !== length) fail('INVALID_INPUT', `${path} 不允许稀疏或额外数组属性`)
    }
    stack.add(objectValue)
    const output: unknown[] | Record<string, unknown> = isArray ? [] : {}
    for (const key of stringKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(objectValue, key)
      if (!descriptor || !descriptor.enumerable) fail('INVALID_INPUT', `${path}.${key} descriptor 非法`)
      if (!descriptor || !('value' in descriptor)) fail('INVALID_INPUT', `${path}.${key} 不允许 accessor`)
      if (isArray && !/^(0|[1-9]\d*)$/u.test(key)) fail('INVALID_INPUT', `${path}.${key} 数组索引非法`)
      Object.defineProperty(output, key, { value: visit((descriptor as PropertyDescriptor & { value: unknown }).value, `${path}.${key}`, depth + 1), enumerable: true, writable: true, configurable: true })
    }
    stack.delete(objectValue); return output
  }
  try { return { ok: true, value: visit(input, '$', 0) as T } }
  catch (reason) {
    if (reason === STOP && captured) return { ok: false, ...captured }
    return { ok: false, code: 'INVALID_INPUT', message: safeUnknownMessageV3(reason, 'JSON 克隆失败') }
  }
}

function freezeSafeClone<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(freezeSafeClone) } return value }
/** Internal-only: call exclusively with output already produced by safeCloneJsonValueV3 or newly built containers of such values. */
export function deepFreezeSafeJsonCloneV3<T>(value: T): T { return freezeSafeClone(value) }
export function isTrustedFrozenJsonValueV3(value: unknown): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  return typeof value === 'object' && trustedJsonObjects.has(value) && Object.isFrozen(value)
}

function grantTrustedFrozenGraph(value: unknown): boolean {
  const objects: object[] = []; const visit = (current: unknown): boolean => {
    if (current === null || typeof current !== 'object') return true
    if (!Object.isFrozen(current)) return false
    objects.push(current)
    for (const child of Object.values(current)) if (!visit(child)) return false
    return true
  }
  if (!visit(value)) return false
  objects.forEach((item) => trustedJsonObjects.add(item)); return true
}

/** Controlled provenance boundary: clone, fully deep-freeze, then atomically grant trust to the complete object graph. */
export function safeCloneAndDeepFreezeJsonValueV3<T>(input: T, budget: JsonStructureBudgetV3): SafeJsonCloneResultV3<T> {
  const cloned = safeCloneJsonValueV3(input, budget); if (!cloned.ok) return cloned
  try { deepFreezeSafeJsonCloneV3(cloned.value); if (!grantTrustedFrozenGraph(cloned.value)) return { ok: false, code: 'INVALID_INPUT', message: 'JSON 完整深冻结失败' }; return cloned }
  catch (reason) { return { ok: false, code: 'INVALID_INPUT', message: safeUnknownMessageV3(reason, 'JSON 深冻结失败') } }
}
