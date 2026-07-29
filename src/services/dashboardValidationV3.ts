import Ajv, { type ErrorObject } from 'ajv'
import dashboardV3Schema from '../schemas/dashboard-v3.schema.json' with { type: 'json' }
import type { DashboardApplicationV3 } from '../models/dashboard-v3'

export interface DashboardValidationIssueV3 {
  path: string
  keyword: string
  message: string
}

export interface DashboardValidationResultV3 {
  valid: boolean
  issues: DashboardValidationIssueV3[]
}

const ajv = new Ajv({ allErrors: true, strict: false })
const validateSchema = ajv.compile(dashboardV3Schema)

function schemaIssue(error: ErrorObject): DashboardValidationIssueV3 {
  const missingProperty = error.keyword === 'required'
    ? (error.params as { missingProperty?: string }).missingProperty
    : undefined
  const path = `${error.instancePath || ''}${missingProperty ? `/${missingProperty}` : ''}` || '/'
  return {
    path,
    keyword: error.keyword,
    message: error.message || '格式无效',
  }
}

function semanticIssues(application: DashboardApplicationV3): DashboardValidationIssueV3[] {
  const issues: DashboardValidationIssueV3[] = []
  const pageIds = new Set(application.pages.map((page) => page.id))

  if (!pageIds.has(application.defaultPageId)) {
    issues.push({
      path: '/defaultPageId',
      keyword: 'reference',
      message: '必须指向 pages 中存在的页面',
    })
  }
  if (pageIds.size !== application.pages.length) {
    issues.push({
      path: '/pages',
      keyword: 'uniquePageId',
      message: '页面 ID 不能重复',
    })
  }

  const parameterCodes = application.parameters.map((parameter) => parameter.code)
  if (new Set(parameterCodes).size !== parameterCodes.length) {
    issues.push({
      path: '/parameters',
      keyword: 'uniqueParameterCode',
      message: '参数编码在同一应用内不能重复',
    })
  }

  const parameterIds = application.parameters.map((parameter) => parameter.id)
  if (new Set(parameterIds).size !== parameterIds.length) {
    issues.push({
      path: '/parameters',
      keyword: 'uniqueParameterId',
      message: '参数 ID 在同一应用内不能重复',
    })
  }

  return issues
}

export function validateDashboardApplicationV3(value: unknown): DashboardValidationResultV3 {
  if (!validateSchema(value)) {
    return {
      valid: false,
      issues: (validateSchema.errors || []).map(schemaIssue),
    }
  }

  const issues = semanticIssues(value as unknown as DashboardApplicationV3)
  return {
    valid: issues.length === 0,
    issues,
  }
}

export function assertDashboardApplicationV3(value: unknown): asserts value is DashboardApplicationV3 {
  const result = validateDashboardApplicationV3(value)
  if (!result.valid) {
    const summary = result.issues
      .map((issue) => `${issue.path}：${issue.message}`)
      .join('；')
    throw new Error(`V3 看板 JSON 校验失败：${summary}`)
  }
}
