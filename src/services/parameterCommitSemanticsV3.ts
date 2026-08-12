import type { JsonValueV3 } from '../models/dashboard-v3.ts'

export interface ParameterCommitAssignmentV3 { parameterId: string; value: JsonValueV3 }
export interface ParameterCommitTransitionV3 {
  before: Readonly<Record<string, JsonValueV3>>
  after: Readonly<Record<string, JsonValueV3>>
  assignments: ReadonlyArray<ParameterCommitAssignmentV3>
  changedParameterIds: ReadonlyArray<string>
}
export type ParameterCommitTransitionResultV3 = { ok: true; expectedChangedParameterIds: string[] } | { ok: false; message: string; expectedChangedParameterIds: string[] }

export function isParameterRuntimeEmptyJsonV3(value: JsonValueV3): boolean {
  return value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

export function strictJsonEqualV3(left: JsonValueV3 | undefined, right: JsonValueV3 | undefined): boolean {
  if (left === undefined || right === undefined) return left === right
  const canonical = (value: JsonValueV3): string => Array.isArray(value)
    ? `[${value.map(canonical).join(',')}]`
    : value && typeof value === 'object'
      ? `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
      : JSON.stringify(value)
  return typeof left === typeof right && canonical(left) === canonical(right)
}

function phase8Comparable(value: JsonValueV3 | undefined): string | undefined { return JSON.stringify(value) }

export function validateParameterCommitTransitionV3(input: ParameterCommitTransitionV3): ParameterCommitTransitionResultV3 {
  const expectedChangedParameterIds = input.assignments
    .filter((item) => phase8Comparable(input.before[item.parameterId]) !== phase8Comparable(item.value))
    .map((item) => item.parameterId)
  const fail = (message: string): ParameterCommitTransitionResultV3 => ({ ok: false, message, expectedChangedParameterIds })
  if (new Set(input.changedParameterIds).size !== input.changedParameterIds.length) return fail('changedParameterIds must be unique')
  if (input.changedParameterIds.length !== expectedChangedParameterIds.length || expectedChangedParameterIds.some((id) => !input.changedParameterIds.includes(id))) return fail('changedParameterIds do not match Phase8 comparable semantics')
  const targets = new Map(input.assignments.map((item) => [item.parameterId, item.value]))
  for (const key of new Set([...Object.keys(input.before), ...Object.keys(input.after)])) {
    if (!targets.has(key) && (Object.hasOwn(input.before, key) !== Object.hasOwn(input.after, key) || !strictJsonEqualV3(input.before[key], input.after[key]))) return fail('a non-target parameter changed')
  }
  for (const { parameterId, value } of input.assignments) {
    const changed = expectedChangedParameterIds.includes(parameterId)
    if (!changed) {
      if (Object.hasOwn(input.before, parameterId) !== Object.hasOwn(input.after, parameterId) || !strictJsonEqualV3(input.before[parameterId], input.after[parameterId])) return fail('an unchanged target was mutated')
    } else if (isParameterRuntimeEmptyJsonV3(value)) {
      if (Object.hasOwn(input.after, parameterId)) return fail('an empty changed target must be absent after commit')
    } else if (!Object.hasOwn(input.after, parameterId) || !strictJsonEqualV3(input.after[parameterId], value)) return fail('a non-empty changed target does not match its assignment')
  }
  return { ok: true, expectedChangedParameterIds }
}
