import type { DashboardApplicationV3, ExtensionRefsV3 } from '../models/dashboard-v3.ts'
import type { DashboardModelV2 } from '../models/dashboard.ts'
import { migrateDashboard } from './dashboardMigration.ts'
import { validateDashboardApplicationV3 } from './dashboardValidationV3.ts'

type UnknownRecord = Record<string, unknown>
export type DashboardSourceVersion = 1 | 2 | 3

export interface MigrationReportV3 {
  sourceVersion: DashboardSourceVersion
  targetVersion: 3
  success: boolean
  warnings: string[]
  errors: string[]
  generatedIds: string[]
  migratedAt: string
}

export interface DashboardMigrationResultV3 {
  application: DashboardApplicationV3 | null
  report: MigrationReportV3
}

const V2_ROOT_FIELDS = new Set([
  'version',
  'id',
  'name',
  'description',
  'canvas',
  'titleStyle',
  'components',
  'createdAt',
  'updatedAt',
])

const V3_ROOT_FIELDS = new Set([
  'version', 'id', 'name', 'description', 'defaultPageId', 'parameters', 'drillPaths', 'pages',
  'theme', 'runtimePolicy', 'extensionRefs', 'publishConfig', 'createdAt', 'updatedAt',
  'activePageId', 'pageStack', 'dialogStack', 'drillStacks', 'linkageState', 'dialogGeometry',
  'interactionSessionId', 'interactionEpoch',
])

const SENSITIVE_KEY = /password|secret|token|credential|private.?key|connection.?string|host|username|database|sql/i

const SENSITIVE_VALUE = /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|postgres(?:ql)?:\/\/[^\s]+|gh[pousr]_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9]{20,}/i
function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function sanitizeExtensionValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeExtensionValue)
  }
  if (typeof value === 'string') {
    return SENSITIVE_VALUE.test(value) ? '[REDACTED]' : value
  }
  if (!isRecord(value)) {
    return value
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_KEY.test(key))
      .map(([key, child]) => [key, sanitizeExtensionValue(child)]),
  )
}

function safeLegacyRoot(value: UnknownRecord): UnknownRecord {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !V2_ROOT_FIELDS.has(key) && !SENSITIVE_KEY.test(key))
      .map(([key, child]) => [key, sanitizeExtensionValue(child)]),
  )
}

function migrateDashboardV3Identity(value: DashboardApplicationV3, warnings: string[]): DashboardApplicationV3 {
  const source = cloneJson(value) as DashboardApplicationV3 & UnknownRecord
  const legacyRoot = Object.fromEntries(
    Object.entries(source)
      .filter(([key]) => !V3_ROOT_FIELDS.has(key) && !SENSITIVE_KEY.test(key))
      .map(([key, child]) => [key, sanitizeExtensionValue(child)]),
  )
  for (const key of Object.keys(source)) if (!V3_ROOT_FIELDS.has(key)) delete source[key]
  if (!Object.keys(legacyRoot).length) return source
  const existingLegacy = isRecord(source.extensionRefs?.legacyRoot) ? source.extensionRefs.legacyRoot : {}
  source.extensionRefs = { ...(source.extensionRefs ?? {}), legacyRoot: { ...existingLegacy, ...legacyRoot } }
  warnings.push(`已将 ${Object.keys(legacyRoot).length} 个旧 V3 根级扩展字段迁入 extensionRefs.legacyRoot`)
  return source
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

function migrationSignature(dashboard: DashboardModelV2): string {
  return JSON.stringify({
    name: dashboard.name,
    canvas: dashboard.canvas,
    components: dashboard.components.map((component) => ({
      id: component.id,
      type: component.type,
      position: component.position,
    })),
  })
}

function safeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : '未知迁移错误'
  return message
    .replace(/(password|secret|token|credential)\s*[:=]\s*[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]')
}

export function detectDashboardVersion(value: unknown): DashboardSourceVersion {
  if (!isRecord(value)) {
    throw new Error('看板 JSON 根节点必须是对象')
  }
  if (value.version === 3) return 3
  if (value.version === 2) return 2
  if (value.version === 1 || value.version === undefined) {
    if (typeof value.name === 'string' && isRecord(value.canvas) && Array.isArray(value.components)) {
      return 1
    }
  }
  throw new Error(`不支持的看板版本：${String(value.version ?? 'unknown')}`)
}

export function migrateDashboardV2ToV3(
  value: unknown,
  generatedIds: string[] = [],
  warnings: string[] = [],
): DashboardApplicationV3 {
  if (!isRecord(value)) {
    throw new Error('V2 看板 JSON 根节点必须是对象')
  }

  const dashboardV2 = migrateDashboard(value)
  const signature = stableHash(migrationSignature(dashboardV2))
  const sourceId = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : ''
  const applicationId = sourceId || `dashboard-${signature}`
  const pageId = `page-${signature}`

  if (!sourceId) generatedIds.push(applicationId)
  generatedIds.push(pageId)

  const legacyRoot = safeLegacyRoot(value)
  const extensionRefs: ExtensionRefsV3 = {}
  if (Object.keys(legacyRoot).length) {
    extensionRefs.legacyRoot = legacyRoot
    warnings.push(`已保留 ${Object.keys(legacyRoot).length} 个安全的根级扩展字段`)
  }

  return {
    version: 3,
    id: applicationId,
    name: dashboardV2.name,
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    defaultPageId: pageId,
    parameters: [],
    pages: [
      {
        id: pageId,
        name: '首页',
        code: 'home',
        order: 1,
        type: 'standard',
        canvas: cloneJson(dashboardV2.canvas),
        titleStyle: cloneJson(dashboardV2.titleStyle),
        controls: [],
        components: cloneJson(dashboardV2.components),
        pageEvents: [],
      },
    ],
    theme: {
      id: 'medical-light',
      tokens: {},
    },
    runtimePolicy: {
      previewScaleMode: 'width',
      allowScroll: true,
      parameterPersistence: 'session',
      maxEventDepth: 10,
    },
    extensionRefs,
    ...(typeof value.createdAt === 'string' ? { createdAt: value.createdAt } : {}),
    ...(typeof value.updatedAt === 'string' ? { updatedAt: value.updatedAt } : {}),
  }
}

export function migrateDashboardToV3(value: unknown): DashboardMigrationResultV3 {
  const migratedAt = new Date().toISOString()
  const warnings: string[] = []
  const errors: string[] = []
  const generatedIds: string[] = []
  let sourceVersion: DashboardSourceVersion = 1

  try {
    sourceVersion = detectDashboardVersion(value)
    const application = sourceVersion === 3
      ? migrateDashboardV3Identity(value as DashboardApplicationV3, warnings)
      : migrateDashboardV2ToV3(value, generatedIds, warnings)

    const validation = validateDashboardApplicationV3(application)
    if (!validation.valid) {
      errors.push(...validation.issues.map((issue) => `${issue.path}：${issue.message}`))
      return {
        application: null,
        report: {
          sourceVersion,
          targetVersion: 3,
          success: false,
          warnings,
          errors,
          generatedIds,
          migratedAt,
        },
      }
    }

    return {
      application,
      report: {
        sourceVersion,
        targetVersion: 3,
        success: true,
        warnings,
        errors,
        generatedIds,
        migratedAt,
      },
    }
  } catch (error) {
    errors.push(safeErrorMessage(error))
    return {
      application: null,
      report: {
        sourceVersion,
        targetVersion: 3,
        success: false,
        warnings,
        errors,
        generatedIds,
        migratedAt,
      },
    }
  }
}

export function requireMigratedDashboardV3(result: DashboardMigrationResultV3): DashboardApplicationV3 {
  if (!result.application || !result.report.success) {
    throw new Error(`看板迁移失败：${result.report.errors.join('；') || '未知错误'}`)
  }
  return result.application
}
