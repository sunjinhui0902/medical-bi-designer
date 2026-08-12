import type { JsonValueV3, ValueExpressionV3 } from '../models/dashboard-v3.ts'
import type { EventRuntimeContextV3 } from './eventRuntimeTypesV3.ts'
import { createJsonStructureBudgetV3, isTrustedFrozenJsonValueV3, safeCloneAndDeepFreezeJsonValueV3, safeUnknownMessageV3, type JsonStructureBudgetV3, type SafeJsonCloneFailureCodeV3 } from './eventJsonValueV3.ts'

export type ValueResolutionV3 = { kind: 'value'; value: JsonValueV3 } | { kind: 'missing' } | { kind: 'error'; message: string; code?: SafeJsonCloneFailureCodeV3 }
const DANGEROUS = new Set(['__proto__', 'prototype', 'constructor'])
function cloneValue(value: JsonValueV3, budget?: JsonStructureBudgetV3): ValueResolutionV3 {
  if (isTrustedFrozenJsonValueV3(value)) return { kind: 'value', value }
  const result = safeCloneAndDeepFreezeJsonValueV3(value, budget ?? createJsonStructureBudgetV3())
  return result.ok ? { kind: 'value', value: result.value } : { kind: 'error', message: result.message, code: result.code }
}

export function resolveSafeJsonPointerV3(root: unknown, pointer: string, budget?: JsonStructureBudgetV3): ValueResolutionV3 {
  try {
    if (!pointer.startsWith('/')) return { kind: 'error', message: 'eventField 必须是 RFC6901 JSON Pointer' }
    let current: unknown = root
    for (const encoded of pointer.slice(1).split('/')) {
      if (/~(?![01])/u.test(encoded)) return { kind: 'error', message: 'JSON Pointer 转义非法' }
      const segment = encoded.replace(/~1/g, '/').replace(/~0/g, '~')
      if (DANGEROUS.has(segment)) return { kind: 'error', message: 'JSON Pointer 含危险段' }
      if (Array.isArray(current)) {
        if (!/^(0|[1-9]\d*)$/u.test(segment)) return { kind: 'error', message: '数组索引不规范' }
      } else if (current === null || typeof current !== 'object' || Object.getPrototypeOf(current) !== Object.prototype) {
        return { kind: 'missing' }
      }
      const descriptor = Object.getOwnPropertyDescriptor(current, segment)
      if (!descriptor) return { kind: 'missing' }
      if (!('value' in descriptor)) return { kind: 'error', message: '禁止读取 getter' }
      current = descriptor.value
    }
    if (current === undefined) return { kind: 'error', message: 'own undefined 不是 JSON 值' }
    return cloneValue(current as JsonValueV3, budget)
  } catch (reason) {
    return { kind: 'error', message: safeUnknownMessageV3(reason, 'eventField 解析失败') }
  }
}

export function resolveEventValueV3(expression: ValueExpressionV3, context: EventRuntimeContextV3, parameters: Readonly<Record<string, JsonValueV3>>, budget?: JsonStructureBudgetV3): ValueResolutionV3 {
  try {
    if (expression.kind === 'fixed') return cloneValue(expression.value, budget)
    if (expression.kind === 'parameter') {
      if (!Object.hasOwn(parameters, expression.parameterId)) return { kind: 'missing' }
      const descriptor = Object.getOwnPropertyDescriptor(parameters, expression.parameterId)
      if (!descriptor || !('value' in descriptor)) return { kind: 'error', message: '参数 descriptor 非法' }
      return descriptor.value === undefined ? { kind: 'error', message: '参数 own undefined 非法' } : cloneValue(descriptor.value, budget)
    }
    return resolveSafeJsonPointerV3(context.payload, expression.path, budget)
  } catch (reason) {
    return { kind: 'error', message: safeUnknownMessageV3(reason, '事件值解析失败') }
  }
}
