import type { TableColumnConfig } from '../models/dashboard.ts'
import type { ComponentDataView } from '../models/bi.ts'
import type { ParameterOptionV3 } from '../models/parameters.ts'

/** Display columns only. The caller retains complete rows for native events. */
export function resolveInteractionTableColumns(datasetId: string, configured: readonly TableColumnConfig[], available: ComponentDataView['columns']): TableColumnConfig[] {
  const existing = configured.filter(c => available.some(a => a.field === c.field))
  if (datasetId.startsWith('local-business:') && configured.length) return [...existing]
  const configuredFields = new Set(configured.map(c => c.field))
  return [...existing, ...available.filter(c => !configuredFields.has(c.field)).map(c => ({ field: c.field, label: c.label, width: 120, format: c.role === 'measure' ? 'number' as const : 'auto' as const, summary: 'none' as const }))]
}

export interface DrillDisplayInput {
  value: unknown
  field?: string
  options?: readonly ParameterOptionV3[]
  source?: { type: string; rows: readonly Record<string, unknown>[]; columns: readonly TableColumnConfig[]; measureFields: readonly string[] }
}
/** Derive a name from existing memory; never rewrite keys or infer ambiguous names. */
export function resolveDrillDisplayValue(input: DrillDisplayInput): string {
  const fallback = String(input.value)
  if (!input.field) return fallback
  const matches = (input.options ?? []).filter(option => Object.is(option.value, input.value))
  if (matches.length > 1) return fallback
  if (matches.length === 1 && matches[0]!.label.trim()) return matches[0]!.label
  if (input.source?.type !== 'table') return fallback
  const rows = input.source.rows.filter(row => Object.is(row[input.field!], input.value))
  if (!rows.length) return fallback
  const fields = input.source.columns.filter(column => column.field !== input.field && column.format === 'auto' && !input.source!.measureFields.includes(column.field)).map(column => column.field)
  const labels = new Set<string>()
  for (const row of rows) {
    const rowLabels = fields.map(field => row[field]).filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
    if (!rowLabels.length) return fallback
    rowLabels.forEach(label => labels.add(label))
  }
  return labels.size === 1 ? [...labels][0]! : fallback
}
