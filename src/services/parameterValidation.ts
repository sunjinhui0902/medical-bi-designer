import { findBuiltinDictionaryV3 } from '../data/builtinDictionaries.ts'
import { PARAMETER_TYPES, type ParameterDefinitionV3 } from '../models/parameters.ts'

export interface ParameterValidationIssueV3 {
  path: string
  code: string
  message: string
}

export interface ParameterValidationResultV3 {
  valid: boolean
  issues: ParameterValidationIssueV3[]
}

const PARAMETER_CODE_PATTERN = /^[a-z][a-z0-9_]*$/
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

function issue(
  issues: ParameterValidationIssueV3[],
  path: string,
  code: string,
  message: string,
): void {
  issues.push({ path, code, message })
}

function isValidDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day
}

function comparableValue(value: unknown): string {
  return JSON.stringify(value)
}

function validateDefaultValue(
  parameter: ParameterDefinitionV3,
  issues: ParameterValidationIssueV3[],
): void {
  const value = parameter.defaultValue
  if (value === undefined) return

  if (parameter.type === 'string' && typeof value !== 'string') {
    issue(issues, '/defaultValue', 'defaultType', '字符串参数默认值必须是字符串')
  }
  if (parameter.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) {
    issue(issues, '/defaultValue', 'defaultType', '数字参数默认值必须是有限数字')
  }
  if (parameter.type === 'date' && !isValidDate(value)) {
    issue(issues, '/defaultValue', 'defaultType', '日期参数默认值必须是 YYYY-MM-DD')
  }
  if (parameter.type === 'dateRange') {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(isValidDate)) {
      issue(issues, '/defaultValue', 'defaultType', '日期范围默认值必须包含合法起止日期')
    } else if (value[0] > value[1]) {
      issue(issues, '/defaultValue', 'dateRangeOrder', '日期范围开始日期不能晚于结束日期')
    }
  }
  if (parameter.type === 'singleSelect' && (Array.isArray(value) || (typeof value === 'object' && value !== null))) {
    issue(issues, '/defaultValue', 'defaultType', '单选参数默认值必须是标量')
  }
  if (parameter.type === 'multiSelect' && !Array.isArray(value)) {
    issue(issues, '/defaultValue', 'defaultType', '多选参数默认值必须是数组')
  }
}

function validateSource(
  parameter: ParameterDefinitionV3,
  issues: ParameterValidationIssueV3[],
  parameters: ParameterDefinitionV3[],
): void {
  if (parameter.source.kind === 'dictionary') {
    if (!findBuiltinDictionaryV3(parameter.source.dictionaryCode)) {
      issue(issues, '/source/dictionaryCode', 'dictionaryNotFound', '只能引用已注册的内置字典')
    }
    return
  }

  if (parameter.source.kind === 'system') {
    if (!['currentDate'].includes(parameter.source.systemCode)) {
      issue(issues, '/source/systemCode', 'systemCodeNotAllowed', '系统参数来源未注册')
    }
    return
  }

  if (parameter.source.kind === 'dataset') {
    if (!parameter.source.datasetId.trim()) {
      issue(issues, '/source/datasetId', 'datasetRequired', '选项数据集不能为空')
    }
    if (!parameter.source.valueField.trim() || !parameter.source.labelField.trim()) {
      issue(issues, '/source', 'datasetFieldsRequired', '选项值字段和名称字段不能为空')
    }
    const dependencyIds = new Set<string>()
    const datasetCodes = new Set<string>()
    for (const [index, dependency] of (parameter.source.dependencies ?? []).entries()) {
      if (dependency.parameterId === parameter.id) issue(issues, `/source/dependencies/${index}/parameterId`, 'selfDependency', '参数不能依赖自身')
      if (!parameters.some((item) => item.id === dependency.parameterId)) issue(issues, `/source/dependencies/${index}/parameterId`, 'dependencyNotFound', '依赖参数不存在')
      if (dependencyIds.has(dependency.parameterId)) issue(issues, `/source/dependencies/${index}/parameterId`, 'duplicateDependency', '同一依赖参数不能重复')
      if (!PARAMETER_CODE_PATTERN.test(dependency.datasetParameterCode) || datasetCodes.has(dependency.datasetParameterCode)) issue(issues, `/source/dependencies/${index}/datasetParameterCode`, 'invalidDatasetParameterCode', '数据集参数编码格式无效或重复')
      dependencyIds.add(dependency.parameterId)
      datasetCodes.add(dependency.datasetParameterCode)
    }
    return
  }

  const seen = new Set<string>()
  parameter.source.options.forEach((option, index) => {
    if (!option.label.trim()) {
      issue(issues, `/source/options/${index}/label`, 'optionLabelRequired', '选项名称不能为空')
    }
    if (option.value === undefined) {
      issue(issues, `/source/options/${index}/value`, 'optionValueRequired', '选项值不能是 undefined')
      return
    }
    const key = comparableValue(option.value)
    if (seen.has(key)) {
      issue(issues, `/source/options/${index}/value`, 'duplicateOptionValue', '静态选项值不能重复')
    }
    seen.add(key)
  })

  if (parameter.defaultValue !== undefined && parameter.source.options.length) {
    const allowed = new Set(parameter.source.options.map((option) => comparableValue(option.value)))
    const defaults = parameter.type === 'multiSelect'
      ? (Array.isArray(parameter.defaultValue) ? parameter.defaultValue : [])
      : [parameter.defaultValue]
    defaults.forEach((value) => {
      if (!allowed.has(comparableValue(value))) {
        issue(issues, '/defaultValue', 'defaultOptionMissing', '默认值必须存在于静态选项中')
      }
    })
  }
}

export function validateParameterDefinitionV3(
  parameter: ParameterDefinitionV3,
  parameters: ParameterDefinitionV3[] = [],
): ParameterValidationResultV3 {
  const issues: ParameterValidationIssueV3[] = []

  if (!parameter.id.trim()) issue(issues, '/id', 'idRequired', '参数 ID 不能为空')
  if (!PARAMETER_CODE_PATTERN.test(parameter.code)) {
    issue(issues, '/code', 'codeFormat', '参数编码必须以小写字母开头且只包含小写字母、数字和下划线')
  }
  if (!parameter.name.trim()) issue(issues, '/name', 'nameRequired', '参数名称不能为空')
  if (!PARAMETER_TYPES.includes(parameter.type)) {
    issue(issues, '/type', 'typeUnsupported', '参数类型不受支持')
  }
  if (parameter.scope !== 'application' || parameter.pageId !== undefined) {
    issue(issues, '/scope', 'scopeUnsupported', 'Phase7 参数范围固定为 application')
  }
  if (parameters.some((item) => item.id !== parameter.id && item.code === parameter.code)) {
    issue(issues, '/code', 'duplicateCode', '参数编码在同一应用内不能重复')
  }

  const aliases = parameter.aliases || []
  if (new Set(aliases).size !== aliases.length || aliases.some((alias) => !alias.trim())) {
    issue(issues, '/aliases', 'invalidAliases', '参数别名不能为空或重复')
  }

  if (parameter.validation?.min !== undefined && parameter.validation?.max !== undefined
    && parameter.validation.min > parameter.validation.max) {
    issue(issues, '/validation', 'invalidRange', '最小值不能大于最大值')
  }
  if (parameter.type === 'number' && typeof parameter.defaultValue === 'number') {
    if (parameter.validation?.min !== undefined && parameter.defaultValue < parameter.validation.min) {
      issue(issues, '/defaultValue', 'belowMinimum', '默认值不能小于最小值')
    }
    if (parameter.validation?.max !== undefined && parameter.defaultValue > parameter.validation.max) {
      issue(issues, '/defaultValue', 'aboveMaximum', '默认值不能大于最大值')
    }
  }
  if (parameter.validation?.pattern !== undefined) {
    try {
      const expression = new RegExp(parameter.validation.pattern)
      if (parameter.type === 'string' && typeof parameter.defaultValue === 'string'
        && !expression.test(parameter.defaultValue)) {
        issue(issues, '/defaultValue', 'patternMismatch', '默认值不符合校验表达式')
      }
    } catch {
      issue(issues, '/validation/pattern', 'invalidPattern', '校验表达式不是合法正则')
    }
  }

  validateDefaultValue(parameter, issues)
  validateSource(parameter, issues, parameters)

  return { valid: issues.length === 0, issues }
}

export function validateParameterCollectionV3(
  parameters: ParameterDefinitionV3[],
): ParameterValidationResultV3 {
  const issues = parameters.flatMap((parameter, index) =>
    validateParameterDefinitionV3(parameter, parameters).issues.map((item) => ({
      ...item,
      path: `/parameters/${index}${item.path}`,
    })),
  )
  const byId = new Map(parameters.map((parameter) => [parameter.id, parameter]))
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      issue(issues, '/parameters', 'dependencyCycle', `参数依赖存在循环：${id}`)
      return
    }
    if (visited.has(id)) return
    visiting.add(id)
    const parameter = byId.get(id)
    if (parameter?.source.kind === 'dataset') {
      for (const dependency of parameter.source.dependencies ?? []) visit(dependency.parameterId)
    }
    visiting.delete(id)
    visited.add(id)
  }
  parameters.forEach((parameter) => visit(parameter.id))
  return { valid: issues.length === 0, issues }
}
