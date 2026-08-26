const CODE_PATTERN = /^[a-z][a-z0-9_]*$/
const SQL_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/
const TYPES = new Set(['string', 'number', 'date', 'dateRange', 'singleSelect', 'multiSelect'])
const OPERATORS = new Set(['eq', 'in', 'between'])
const EMPTY_POLICIES = new Set(['omit', 'null', 'emptyString', 'reject'])
const EXECUTION_REQUEST_KEYS = new Set(['parameters', 'limit', 'view', 'pagination'])
const PAGINATION_KEYS = new Set(['offset', 'limit', 'includeTotal'])

export function normalizeDatasetPagination(value) {
  if (value === undefined) return null
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('分页配置必须是对象')
  const unknown = Object.keys(value).filter((key) => !PAGINATION_KEYS.has(key))
  if (unknown.length) throw new Error(`分页配置包含未声明字段：${unknown.join('、')}`)
  if (!Number.isInteger(value.offset) || value.offset < 0 || value.offset > 1_000_000) throw new Error('分页 offset 必须是 0 到 1000000 的整数')
  if (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 200) throw new Error('分页 limit 必须是 1 到 200 的整数')
  if (value.includeTotal !== undefined && typeof value.includeTotal !== 'boolean') throw new Error('分页 includeTotal 必须是布尔值')
  return { offset: value.offset, limit: value.limit, includeTotal: value.includeTotal !== false }
}

export function validateDatasetExecutionRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('数据集执行请求必须是对象')
  const forbidden = Object.keys(body).filter((key) => !EXECUTION_REQUEST_KEYS.has(key))
  if (forbidden.length) throw new Error(`客户端不能提交执行结构字段：${forbidden.join('、')}`)
  if (body.parameters !== undefined && (!body.parameters || typeof body.parameters !== 'object' || Array.isArray(body.parameters))) {
    throw new Error('查询参数必须是对象')
  }
  if (body.pagination !== undefined && body.limit !== undefined) throw new Error('分页请求不能同时提交顶层 limit')
  return {
    parameters: body.parameters ?? {},
    limit: body.limit,
    ...(body.view === undefined ? {} : { view: body.view }),
    ...(body.pagination === undefined ? {} : { pagination: normalizeDatasetPagination(body.pagination) }),
  }
}

function normalizeCode(value, index) {
  const source = String(value || '').trim().toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return /^[a-z]/.test(source) ? source : source ? `p_${source}` : `parameter_${index + 1}`
}

function normalizeType(value) {
  const type = value === 'text' ? 'string' : String(value || 'string')
  return TYPES.has(type) ? type : 'string'
}

function defaultOperator(type) {
  if (type === 'multiSelect') return 'in'
  if (type === 'dateRange') return 'between'
  return 'eq'
}

export function normalizeDatasetQueryParameters(values) {
  return (Array.isArray(values) ? values : []).map((value, index) => {
    const code = normalizeCode(value?.code || value?.id || value?.name, index)
    const type = normalizeType(value?.type)
    const required = Boolean(value?.required)
    return {
      id: String(value?.id || `dataset-parameter-${code}`).trim(),
      code,
      name: String(value?.name || code).trim(),
      type,
      required,
      sqlName: String(value?.sqlName || code).trim(),
      operator: OPERATORS.has(value?.operator) ? value.operator : defaultOperator(type),
      ...(value?.defaultValue === undefined ? {} : { defaultValue: structuredClone(value.defaultValue) }),
      emptyPolicy: EMPTY_POLICIES.has(value?.emptyPolicy) ? value.emptyPolicy : required ? 'reject' : 'omit',
    }
  })
}

export function validateDatasetQueryParameters(parameters, fieldNames = []) {
  const issues = []
  const codes = new Set()
  const ids = new Set()
  const fields = new Set(fieldNames)
  const add = (path, code, message) => issues.push({ path, code, message })
  parameters.forEach((parameter, index) => {
    const path = `/parameters/${index}`
    if (!parameter.id) add(`${path}/id`, 'idRequired', '参数 ID 不能为空')
    if (ids.has(parameter.id)) add(`${path}/id`, 'duplicateId', '参数 ID 不能重复')
    ids.add(parameter.id)
    if (!CODE_PATTERN.test(parameter.code)) add(`${path}/code`, 'codeFormat', '参数编码格式无效')
    if (codes.has(parameter.code)) add(`${path}/code`, 'duplicateCode', '参数编码不能重复')
    codes.add(parameter.code)
    if (!SQL_NAME_PATTERN.test(parameter.sqlName)) add(`${path}/sqlName`, 'sqlNameFormat', 'SQL 字段名格式无效')
    if (fields.size && !fields.has(parameter.sqlName)) add(`${path}/sqlName`, 'fieldNotFound', 'SQL 字段必须存在于数据集字段中')
    if (parameter.type === 'multiSelect' && parameter.operator !== 'in') add(`${path}/operator`, 'operatorMismatch', '多选参数只能使用 in')
    if (parameter.type === 'dateRange' && parameter.operator !== 'between') add(`${path}/operator`, 'operatorMismatch', '日期范围只能使用 between')
    if (!['multiSelect', 'dateRange'].includes(parameter.type) && parameter.operator !== 'eq') add(`${path}/operator`, 'operatorMismatch', '标量参数只能使用 eq')
    if (parameter.required && parameter.emptyPolicy !== 'reject') add(`${path}/emptyPolicy`, 'requiredPolicy', '必填参数必须使用 reject')
  })
  return issues
}

function isEmpty(value) {
  return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)
}

function isDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function validateValue(parameter, value) {
  if (parameter.type === 'string' && typeof value !== 'string') return '必须是字符串'
  if (parameter.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) return '必须是有限数字'
  if (parameter.type === 'date' && !isDate(value)) return '必须是 YYYY-MM-DD 日期'
  if (parameter.type === 'dateRange') {
    if (!Array.isArray(value) || value.length !== 2 || !value.every(isDate)) return '必须是合法日期范围'
    if (value[0] > value[1]) return '日期范围开始日期不能晚于结束日期'
  }
  if (parameter.type === 'singleSelect' && (Array.isArray(value) || (typeof value === 'object' && value !== null))) return '必须是标量'
  if (parameter.type === 'multiSelect') {
    if (!Array.isArray(value)) return '必须是数组'
    if (value.some((item) => !['string', 'number', 'boolean'].includes(typeof item))) return '数组只能包含标量'
  }
  return ''
}

function quoteIdentifier(value) {
  if (!SQL_NAME_PATTERN.test(value)) throw new Error(`SQL 字段名格式无效：${value}`)
  return `"${value.replaceAll('"', '""')}"`
}

export function compileDatasetParameterPredicate(dataset, inputValues = {}) {
  if (!inputValues || typeof inputValues !== 'object' || Array.isArray(inputValues)) throw new Error('查询参数必须是对象')
  const parameters = normalizeDatasetQueryParameters(dataset.parameters)
  const fieldNames = (Array.isArray(dataset.fields) ? dataset.fields : []).map((field) => String(field.name || ''))
  const definitionIssues = validateDatasetQueryParameters(parameters, fieldNames)
  if (definitionIssues.length) throw new Error(definitionIssues.map((issue) => `${issue.path}：${issue.message}`).join('；'))
  const knownCodes = new Set(parameters.map((parameter) => parameter.code))
  const unknown = Object.keys(inputValues).filter((code) => !knownCodes.has(code))
  if (unknown.length) throw new Error(`包含未声明的查询参数：${unknown.join('、')}`)

  const conditions = []
  const values = []
  const appliedParameters = []
  const omittedParameters = []
  for (const parameter of parameters) {
    let value = Object.hasOwn(inputValues, parameter.code) ? inputValues[parameter.code] : parameter.defaultValue
    if (isEmpty(value)) {
      if (parameter.required || parameter.emptyPolicy === 'reject') throw new Error(`查询参数 ${parameter.code} 不能为空`)
      if (parameter.emptyPolicy === 'omit') {
        omittedParameters.push(parameter.code)
        continue
      }
      if (parameter.emptyPolicy === 'null') {
        conditions.push(`${quoteIdentifier(parameter.sqlName)} IS NULL`)
        appliedParameters.push(parameter.code)
        continue
      }
      value = ''
    }
    const valueError = validateValue(parameter, value)
    if (valueError) throw new Error(`查询参数 ${parameter.code} ${valueError}`)

    const field = quoteIdentifier(parameter.sqlName)
    if (parameter.operator === 'between') {
      values.push(value[0], value[1])
      conditions.push(`${field} BETWEEN $${values.length - 1} AND $${values.length}`)
    } else {
      values.push(value)
      conditions.push(parameter.operator === 'in' ? `${field} = ANY($${values.length})` : `${field} = $${values.length}`)
    }
    appliedParameters.push(parameter.code)
  }
  const where = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : ''
  return {
    where,
    values,
    parameters,
    appliedParameters,
    omittedParameters,
    inputValues: structuredClone(inputValues),
  }
}

export function compileDatasetParameterizedQuery(dataset, inputValues = {}, limit = 200) {
  const predicate = compileDatasetParameterPredicate(dataset, inputValues)
  const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 200)
  const values = [...predicate.values, safeLimit]
  return {
    ...predicate,
    text: `SELECT * FROM (${String(dataset.sql || '').trim()}) AS bi_runtime${predicate.where} LIMIT $${values.length}`,
    values,
  }
}

export function applyDatasetParametersToRows(rows, plan) {
  return rows.filter((row) => plan.parameters.every((parameter) => {
    if (plan.omittedParameters.includes(parameter.code)) return true
    const value = Object.hasOwn(plan.inputValues, parameter.code) ? plan.inputValues[parameter.code] : parameter.defaultValue
    if (isEmpty(value) && parameter.emptyPolicy === 'null') return row[parameter.sqlName] == null
    const resolved = isEmpty(value) && parameter.emptyPolicy === 'emptyString' ? '' : value
    if (parameter.operator === 'in') return resolved.includes(row[parameter.sqlName])
    if (parameter.operator === 'between') return row[parameter.sqlName] >= resolved[0] && row[parameter.sqlName] <= resolved[1]
    return row[parameter.sqlName] === resolved
  }))
}
