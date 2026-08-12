import type {
  ComponentDataConfig,
  ComponentDataConfigV3,
  ComponentRefreshPolicyV3,
  DatasetParameterBindingV3,
  DatasetParameterEmptyPolicyV3,
  DatasetParameterOperatorV3,
  DatasetQueryParameterTypeV3,
  DatasetQueryParameterV3,
} from '../models/bi.ts'
import type { ParameterDefinitionV3, ParameterTypeV3 } from '../models/parameters.ts'

export interface DatasetParameterBindingIssueV3 {
  path: string
  code: string
  message: string
}

export interface DatasetParameterBindingCandidateV3 {
  datasetParameterCode: string
  parameterId?: string
  match: 'code' | 'alias' | 'unmatched'
}

export interface DatasetParameterBindingValidationV3 {
  valid: boolean
  issues: DatasetParameterBindingIssueV3[]
}

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/
const SQL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const TYPES: DatasetQueryParameterTypeV3[] = ['string', 'number', 'date', 'dateRange', 'singleSelect', 'multiSelect']
const OPERATORS: DatasetParameterOperatorV3[] = ['eq', 'in', 'between']
const EMPTY_POLICIES: DatasetParameterEmptyPolicyV3[] = ['omit', 'null', 'emptyString', 'reject']

export function upgradeComponentDataConfigV3(
  config: ComponentDataConfig,
  parameterBindings: DatasetParameterBindingV3[] = config.version === 3 ? config.parameterBindings : [],
  refreshPolicy: ComponentRefreshPolicyV3 = config.version === 3 ? config.refreshPolicy : 'onParameterChange',
): ComponentDataConfigV3 {
  return {
    ...structuredClone(config),
    version: 3,
    parameterBindings: structuredClone(parameterBindings),
    refreshPolicy,
  }
}

function normalizeCode(value: unknown, index: number): string {
  const source = String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const withPrefix = /^[a-z]/.test(source) ? source : source ? `p_${source}` : `parameter_${index + 1}`
  return withPrefix
}

function normalizeType(value: unknown): DatasetQueryParameterTypeV3 {
  const type = value === 'text' ? 'string' : String(value || 'string')
  return TYPES.includes(type as DatasetQueryParameterTypeV3) ? type as DatasetQueryParameterTypeV3 : 'string'
}

function defaultOperator(type: DatasetQueryParameterTypeV3): DatasetParameterOperatorV3 {
  if (type === 'multiSelect') return 'in'
  if (type === 'dateRange') return 'between'
  return 'eq'
}

export function normalizeDatasetQueryParameterV3(
  value: Record<string, unknown>,
  index = 0,
): DatasetQueryParameterV3 {
  const code = normalizeCode(value.code || value.id || value.name, index)
  const type = normalizeType(value.type)
  const required = Boolean(value.required)
  const operator = OPERATORS.includes(value.operator as DatasetParameterOperatorV3)
    ? value.operator as DatasetParameterOperatorV3
    : defaultOperator(type)
  const emptyPolicy = EMPTY_POLICIES.includes(value.emptyPolicy as DatasetParameterEmptyPolicyV3)
    ? value.emptyPolicy as DatasetParameterEmptyPolicyV3
    : required ? 'reject' : 'omit'

  return {
    id: String(value.id || `dataset-parameter-${code}`).trim(),
    code,
    name: String(value.name || code).trim(),
    type,
    required,
    sqlName: String(value.sqlName || code).trim(),
    operator,
    ...(value.defaultValue === undefined ? {} : { defaultValue: structuredClone(value.defaultValue) }),
    emptyPolicy,
  }
}

export function validateDatasetQueryParametersV3(
  parameters: DatasetQueryParameterV3[],
  fieldNames: string[] = [],
): DatasetParameterBindingValidationV3 {
  const issues: DatasetParameterBindingIssueV3[] = []
  const codes = new Set<string>()
  const ids = new Set<string>()
  const fields = new Set(fieldNames)
  const add = (path: string, code: string, message: string) => issues.push({ path, code, message })

  parameters.forEach((parameter, index) => {
    const path = `/parameters/${index}`
    if (!parameter.id) add(`${path}/id`, 'idRequired', '参数 ID 不能为空')
    if (ids.has(parameter.id)) add(`${path}/id`, 'duplicateId', '参数 ID 不能重复')
    ids.add(parameter.id)
    if (!CODE_PATTERN.test(parameter.code)) add(`${path}/code`, 'codeFormat', '参数编码格式无效')
    if (codes.has(parameter.code)) add(`${path}/code`, 'duplicateCode', '参数编码不能重复')
    codes.add(parameter.code)
    if (!parameter.name) add(`${path}/name`, 'nameRequired', '参数名称不能为空')
    if (!SQL_NAME_PATTERN.test(parameter.sqlName)) add(`${path}/sqlName`, 'sqlNameFormat', 'SQL 字段名格式无效')
    if (fields.size && !fields.has(parameter.sqlName)) add(`${path}/sqlName`, 'fieldNotFound', 'SQL 字段必须存在于数据集字段中')
    if (parameter.type === 'multiSelect' && parameter.operator !== 'in') add(`${path}/operator`, 'operatorMismatch', '多选参数只能使用 in')
    if (parameter.type === 'dateRange' && parameter.operator !== 'between') add(`${path}/operator`, 'operatorMismatch', '日期范围只能使用 between')
    if (!['multiSelect', 'dateRange'].includes(parameter.type) && parameter.operator !== 'eq') {
      add(`${path}/operator`, 'operatorMismatch', '标量参数只能使用 eq')
    }
    if (parameter.required && parameter.emptyPolicy !== 'reject') add(`${path}/emptyPolicy`, 'requiredPolicy', '必填参数必须使用 reject')
  })
  return { valid: issues.length === 0, issues }
}

function compatible(datasetType: DatasetQueryParameterTypeV3, parameterType: ParameterTypeV3): boolean {
  if (datasetType === parameterType) return true
  return datasetType === 'string' && parameterType === 'singleSelect'
    || datasetType === 'singleSelect' && parameterType === 'string'
}

export function suggestDatasetParameterBindingsV3(
  datasetParameters: DatasetQueryParameterV3[],
  parameters: ParameterDefinitionV3[],
): DatasetParameterBindingCandidateV3[] {
  return datasetParameters.map((datasetParameter) => {
    const exact = parameters.find((parameter) =>
      parameter.code === datasetParameter.code && compatible(datasetParameter.type, parameter.type))
    if (exact) return { datasetParameterCode: datasetParameter.code, parameterId: exact.id, match: 'code' }
    const alias = parameters.find((parameter) =>
      parameter.aliases?.includes(datasetParameter.code) && compatible(datasetParameter.type, parameter.type))
    if (alias) return { datasetParameterCode: datasetParameter.code, parameterId: alias.id, match: 'alias' }
    return { datasetParameterCode: datasetParameter.code, match: 'unmatched' }
  })
}

export function validateDatasetParameterBindingsV3(
  bindings: DatasetParameterBindingV3[],
  datasetParameters: DatasetQueryParameterV3[],
  parameters: ParameterDefinitionV3[],
): DatasetParameterBindingValidationV3 {
  const issues: DatasetParameterBindingIssueV3[] = []
  const datasetByCode = new Map(datasetParameters.map((parameter) => [parameter.code, parameter]))
  const parameterById = new Map(parameters.map((parameter) => [parameter.id, parameter]))
  const boundCodes = new Set<string>()
  const add = (path: string, code: string, message: string) => issues.push({ path, code, message })

  bindings.forEach((binding, index) => {
    const path = `/parameterBindings/${index}`
    const datasetParameter = datasetByCode.get(binding.datasetParameterCode)
    const parameter = parameterById.get(binding.parameterId)
    if (!datasetParameter) add(`${path}/datasetParameterCode`, 'datasetParameterNotFound', '数据集参数不存在')
    if (!parameter) add(`${path}/parameterId`, 'parameterNotFound', '看板参数不存在')
    if (boundCodes.has(binding.datasetParameterCode)) add(`${path}/datasetParameterCode`, 'duplicateBinding', '同一数据集参数不能重复绑定')
    boundCodes.add(binding.datasetParameterCode)
    if (datasetParameter && parameter && !compatible(datasetParameter.type, parameter.type)) {
      add(path, 'typeMismatch', '数据集参数与看板参数类型不兼容')
    }
  })

  datasetParameters.forEach((parameter) => {
    if (parameter.required && parameter.defaultValue === undefined && !boundCodes.has(parameter.code)) {
      add('/parameterBindings', 'requiredBindingMissing', `必填数据集参数未绑定：${parameter.code}`)
    }
  })
  return { valid: issues.length === 0, issues }
}
