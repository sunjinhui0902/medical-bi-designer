import { findBuiltinDictionaryV3 } from '../data/builtinDictionaries.ts'
import type {
  ParameterRuntimeAssignmentV3,
  ParameterRuntimeCommitV3,
  ParameterRuntimeStateV3,
  ParameterRuntimeValueSourceV3,
} from '../models/parameter-runtime.ts'
import type { ParameterDefinitionV3 } from '../models/parameters.ts'
import { validateParameterCollectionV3 } from './parameterValidation.ts'

export interface ParameterRuntimeIssueV3 {
  parameterId: string
  code: string
  message: string
}

export interface ParameterRuntimeOptionsV3 {
  now?: () => Date
  transactionId?: () => string
}

export class ParameterRuntimeErrorV3 extends Error {
  readonly issues: ParameterRuntimeIssueV3[]

  constructor(issues: ParameterRuntimeIssueV3[]) {
    super(issues.map((item) => `${item.parameterId}：${item.message}`).join('；'))
    this.name = 'ParameterRuntimeErrorV3'
    this.issues = issues
  }
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function clone<T>(value: T): T {
  return structuredClone(value)
}

function comparable(value: unknown): string {
  return JSON.stringify(value)
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

function allowedOptionValues(parameter: ParameterDefinitionV3): Set<string> | undefined {
  if (parameter.source.kind === 'static' && parameter.source.options.length) {
    return new Set(parameter.source.options.map((option) => comparable(option.value)))
  }
  if (parameter.source.kind === 'dictionary') {
    const dictionary = findBuiltinDictionaryV3(parameter.source.dictionaryCode)
    return dictionary ? new Set(dictionary.options.map((option) => comparable(option.value))) : undefined
  }
  return undefined
}

export function validateParameterRuntimeValueV3(
  parameter: ParameterDefinitionV3,
  value: unknown,
): ParameterRuntimeIssueV3[] {
  const issues: ParameterRuntimeIssueV3[] = []
  const add = (code: string, message: string) => issues.push({ parameterId: parameter.id, code, message })

  if (isEmpty(value)) {
    if (parameter.required || parameter.validation?.allowEmpty === false) add('required', '参数值不能为空')
    return issues
  }

  if (parameter.type === 'string' && typeof value !== 'string') add('type', '参数值必须是字符串')
  if (parameter.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) add('type', '参数值必须是有限数字')
  if (parameter.type === 'date' && !validDate(value)) add('type', '参数值必须是 YYYY-MM-DD 日期')
  if (parameter.type === 'dateRange') {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(validDate)) add('type', '参数值必须是合法日期范围')
    else if (value[0] > value[1]) add('range', '日期范围开始日期不能晚于结束日期')
  }
  if (parameter.type === 'singleSelect' && (Array.isArray(value) || (typeof value === 'object' && value !== null))) {
    add('type', '单选参数值必须是标量')
  }
  if (parameter.type === 'multiSelect' && !Array.isArray(value)) add('type', '多选参数值必须是数组')

  if (parameter.type === 'number' && typeof value === 'number') {
    if (parameter.validation?.min !== undefined && value < parameter.validation.min) add('min', '参数值小于允许的最小值')
    if (parameter.validation?.max !== undefined && value > parameter.validation.max) add('max', '参数值大于允许的最大值')
  }
  if (parameter.type === 'string' && typeof value === 'string' && parameter.validation?.pattern) {
    if (!new RegExp(parameter.validation.pattern).test(value)) add('pattern', '参数值不符合校验表达式')
  }

  const allowed = allowedOptionValues(parameter)
  if (allowed && !issues.some((item) => item.code === 'type')) {
    const values = parameter.type === 'multiSelect' ? value as unknown[] : [value]
    if (values.some((item) => !allowed.has(comparable(item)))) add('option', '参数值不在允许的选项中')
  }
  return issues
}

function defaultSystemValue(parameter: ParameterDefinitionV3, now: Date): unknown {
  if (parameter.source.kind !== 'system') return undefined
  if (parameter.source.systemCode === 'currentDate') return now.toISOString().slice(0, 10)
  return undefined
}

export class ParameterRuntimeStoreV3 {
  private readonly definitions: Map<string, ParameterDefinitionV3>
  private readonly now: () => Date
  private readonly nextTransactionId: () => string
  private state: ParameterRuntimeStateV3

  constructor(parameters: ParameterDefinitionV3[], options: ParameterRuntimeOptionsV3 = {}) {
    const validation = validateParameterCollectionV3(parameters)
    if (!validation.valid) {
      throw new ParameterRuntimeErrorV3(validation.issues.map((item) => ({
        parameterId: item.path,
        code: item.code,
        message: item.message,
      })))
    }
    this.definitions = new Map(parameters.map((parameter) => [parameter.id, clone(parameter)]))
    this.now = options.now || (() => new Date())
    let sequence = 0
    this.nextTransactionId = options.transactionId || (() => `parameter-tx-${++sequence}`)
    this.state = { values: {}, source: {}, updatedAt: {}, transactionId: 'parameter-tx-initial' }
    this.initialize(parameters)
  }

  private initialize(parameters: ParameterDefinitionV3[]): void {
    const timestamp = this.now().getTime()
    for (const parameter of parameters) {
      const hasDefault = parameter.defaultValue !== undefined
      const value = hasDefault ? parameter.defaultValue : defaultSystemValue(parameter, this.now())
      if (value === undefined) continue
      const issues = validateParameterRuntimeValueV3(parameter, value)
      if (issues.length) throw new ParameterRuntimeErrorV3(issues)
      this.state.values[parameter.id] = clone(value)
      this.state.source[parameter.id] = hasDefault ? 'default' : 'system'
      this.state.updatedAt[parameter.id] = timestamp
    }
  }

  snapshot(): ParameterRuntimeStateV3 {
    return clone(this.state)
  }

  get(parameterId: string): unknown {
    return clone(this.state.values[parameterId])
  }

  commit(
    assignments: ParameterRuntimeAssignmentV3[],
    source: ParameterRuntimeValueSourceV3 = 'control',
  ): ParameterRuntimeCommitV3 {
    const seen = new Set<string>()
    const issues: ParameterRuntimeIssueV3[] = []
    for (const assignment of assignments) {
      const parameter = this.definitions.get(assignment.parameterId)
      if (!parameter) {
        issues.push({ parameterId: assignment.parameterId, code: 'notFound', message: '参数不存在' })
        continue
      }
      if (seen.has(assignment.parameterId)) {
        issues.push({ parameterId: assignment.parameterId, code: 'duplicateAssignment', message: '同一批次不能重复赋值' })
        continue
      }
      seen.add(assignment.parameterId)
      issues.push(...validateParameterRuntimeValueV3(parameter, assignment.value))
    }
    if (issues.length) throw new ParameterRuntimeErrorV3(issues)

    const changed = assignments.filter((assignment) =>
      comparable(this.state.values[assignment.parameterId]) !== comparable(assignment.value))
    if (!changed.length) return { changed: false, changedParameterIds: [], state: this.snapshot() }

    const next = this.snapshot()
    const timestamp = this.now().getTime()
    for (const assignment of changed) {
      if (isEmpty(assignment.value)) {
        delete next.values[assignment.parameterId]
        delete next.source[assignment.parameterId]
        delete next.updatedAt[assignment.parameterId]
      } else {
        next.values[assignment.parameterId] = clone(assignment.value)
        next.source[assignment.parameterId] = source
        next.updatedAt[assignment.parameterId] = timestamp
      }
    }
    next.transactionId = this.nextTransactionId()
    this.state = next
    return { changed: true, changedParameterIds: changed.map((item) => item.parameterId), state: this.snapshot() }
  }

  clear(parameterIds: string[]): ParameterRuntimeCommitV3 {
    return this.commit(parameterIds.map((parameterId) => ({ parameterId, value: undefined })), 'control')
  }
}
