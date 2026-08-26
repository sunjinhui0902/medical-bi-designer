import type { TableConditionalRuleConfig } from '../models/dashboard.ts'

export type TableConditionalRuleV3 = TableConditionalRuleConfig

export interface TableCellPresentationV3 {
  backgroundColor?: string
  textColor?: string
  badge?: 'normal' | 'warning' | 'danger'
  matchedRuleIds: string[]
}

const scalar = (value: unknown) => ['string', 'number', 'boolean'].includes(typeof value) ? value as string | number | boolean : null

export function evaluateTableRuleV3(rule: TableConditionalRuleV3, row: Readonly<Record<string, unknown>>): boolean {
  const actual = row[rule.field]
  if (rule.operator === 'isNull') return actual === null || actual === undefined || actual === ''
  if (rule.operator === 'notNull') return actual !== null && actual !== undefined && actual !== ''
  if (rule.operator === 'contains') return typeof actual === 'string' && typeof rule.value === 'string' && actual.includes(rule.value)
  if (rule.operator === 'in') return Array.isArray(rule.value) && rule.value.some((item) => Object.is(item, actual))
  if (rule.operator === 'between') return Array.isArray(rule.value) && rule.value.length === 2 && actual != null && actual >= rule.value[0] as never && actual <= rule.value[1] as never
  if (rule.operator === 'eq') return Object.is(actual, rule.value)
  if (rule.operator === 'ne') return !Object.is(actual, rule.value)
  const left = scalar(actual); const right = scalar(rule.value)
  if (left === null || right === null || typeof left !== typeof right) return false
  if (rule.operator === 'gt') return left > right
  if (rule.operator === 'gte') return left >= right
  if (rule.operator === 'lt') return left < right
  return left <= right
}

export function resolveTableCellPresentationV3(rules: readonly TableConditionalRuleV3[], row: Readonly<Record<string, unknown>>, field: string): TableCellPresentationV3 {
  const matched = rules.filter((rule) => rule.field === field && evaluateTableRuleV3(rule, row))
  return matched.reduce<TableCellPresentationV3>((result, rule) => ({
    ...result,
    ...(rule.backgroundColor ? { backgroundColor: rule.backgroundColor } : {}),
    ...(rule.textColor ? { textColor: rule.textColor } : {}),
    ...(rule.badge ? { badge: rule.badge } : {}),
    matchedRuleIds: [...result.matchedRuleIds, rule.id],
  }), { matchedRuleIds: [] })
}

export interface ClientPaginationStateV3 { page: number; pageSize: number }

export function paginateRowsV3<T>(rows: readonly T[], state: ClientPaginationStateV3) {
  const pageSize = Number.isInteger(state.pageSize) ? Math.min(Math.max(state.pageSize, 1), 200) : 20
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const page = Number.isInteger(state.page) ? Math.min(Math.max(state.page, 1), pageCount) : 1
  const offset = (page - 1) * pageSize
  return { rows: rows.slice(offset, offset + pageSize), page, pageSize, pageCount, total: rows.length, offset }
}
