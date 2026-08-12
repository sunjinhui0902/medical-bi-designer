import type { EventConditionV3, JsonValueV3 } from '../models/dashboard-v3.ts'
import { resolveEventValueV3, type ValueResolutionV3 } from './eventValueResolverV3.ts'
import type { EventRuntimeContextV3 } from './eventRuntimeTypesV3.ts'
import type { JsonStructureBudgetV3 } from './eventJsonValueV3.ts'

function canonical(value: JsonValueV3): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  return JSON.stringify(value)
}
function equal(a: JsonValueV3, b: JsonValueV3) { return typeof a === typeof b && canonical(a) === canonical(b) }
function empty(value: ValueResolutionV3): boolean {
  return value.kind === 'missing' || (value.kind === 'value' && (value.value === null || value.value === '' || (Array.isArray(value.value) && value.value.length === 0)))
}
export function evaluateEventConditionsV3(conditions: EventConditionV3[] | undefined, context: EventRuntimeContextV3, parameters: Readonly<Record<string, JsonValueV3>>, budget?: JsonStructureBudgetV3): { matched: boolean; error?: string; code?: 'INVALID_INPUT' | 'STRUCTURE_BUDGET_EXCEEDED' } {
  for (const condition of conditions ?? []) {
    const left = resolveEventValueV3(condition.left, context, parameters, budget)
    if (left.kind === 'error') return { matched: false, error: left.message, ...(left.code ? { code: left.code } : {}) }
    if (condition.operator === 'isEmpty' || condition.operator === 'notEmpty') {
      if ((condition.operator === 'isEmpty') !== empty(left)) return { matched: false }
      continue
    }
    if (left.kind === 'missing' || !condition.right) return { matched: false, error: '条件值缺失' }
    const right = resolveEventValueV3(condition.right, context, parameters, budget)
    if (right.kind !== 'value') return { matched: false, error: right.kind === 'error' ? right.message : '条件右值缺失', ...(right.kind === 'error' && right.code ? { code: right.code } : {}) }
    let matched = false
    if (condition.operator === 'eq' || condition.operator === 'ne') matched = equal(left.value, right.value) !== (condition.operator === 'ne')
    else if (!Array.isArray(right.value)) return { matched: false, error: 'in/notIn 右值必须为数组' }
    else matched = right.value.some((item) => equal(left.value, item)) !== (condition.operator === 'notIn')
    if (!matched) return { matched: false }
  }
  return { matched: true }
}
