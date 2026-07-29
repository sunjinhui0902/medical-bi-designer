import type { DashboardApplicationV3 } from '../models/dashboard-v3.ts'
import { createDefaultDashboardApplicationV3 } from '../models/dashboard-v3.ts'
import {
  migrateDashboardToV3,
  type DashboardMigrationResultV3,
  type DashboardSourceVersion,
  type MigrationReportV3,
} from './dashboardMigrationV3.ts'
import { validateDashboardApplicationV3 } from './dashboardValidationV3.ts'

export interface DashboardStorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem?(key: string): void
}

export const DASHBOARD_STORAGE_KEYS_V3 = Object.freeze({
  currentV3: 'medical-bi-designer-dashboard-v3',
  currentV2: 'medical-bi-designer-dashboard-v2',
  legacyV1: 'medical-bi-designer-dashboard-v1',
  backupV2: 'medical-bi-designer-dashboard-v2-backup',
  backupV1: 'medical-bi-designer-dashboard-v1-backup',
  invalidV3Backup: 'medical-bi-designer-dashboard-v3-invalid-backup',
})

export const MAX_DASHBOARD_IMPORT_BYTES = 5 * 1024 * 1024

export type DashboardLoadSourceV3 = 'v3' | 'v2' | 'v1' | 'default'

export interface DashboardLoadResultV3 {
  application: DashboardApplicationV3
  source: DashboardLoadSourceV3
  persisted: boolean
  report: MigrationReportV3 | null
  warnings: string[]
  errors: string[]
}

export interface DashboardSaveResultV3 {
  success: boolean
  errors: string[]
}

export interface DashboardImportResultV3 extends DashboardMigrationResultV3 {
  saved: boolean
}

function parseDashboardJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch {
    throw new Error('看板 JSON 语法无效')
  }
}

function storageError(error: unknown): string {
  return error instanceof Error ? error.message : '浏览器存储操作失败'
}

function reportErrors(prefix: string, result: DashboardMigrationResultV3): string[] {
  return result.report.errors.map((message) => `${prefix}：${message}`)
}

function saveBackupIfMissing(storage: DashboardStorageLike, key: string, raw: string): void {
  if (storage.getItem(key) === null) {
    storage.setItem(key, raw)
  }
}

function persistMigratedLegacy(
  storage: DashboardStorageLike,
  sourceVersion: 1 | 2,
  legacyRaw: string,
  application: DashboardApplicationV3,
): void {
  const backupKey = sourceVersion === 2
    ? DASHBOARD_STORAGE_KEYS_V3.backupV2
    : DASHBOARD_STORAGE_KEYS_V3.backupV1
  saveBackupIfMissing(storage, backupKey, legacyRaw)
  storage.setItem(DASHBOARD_STORAGE_KEYS_V3.currentV3, JSON.stringify(application))
}

export function saveDashboardApplicationV3(
  storage: DashboardStorageLike,
  application: DashboardApplicationV3,
): DashboardSaveResultV3 {
  const validation = validateDashboardApplicationV3(application)
  if (!validation.valid) {
    return {
      success: false,
      errors: validation.issues.map((issue) => `${issue.path}：${issue.message}`),
    }
  }

  try {
    storage.setItem(DASHBOARD_STORAGE_KEYS_V3.currentV3, JSON.stringify(application))
    return { success: true, errors: [] }
  } catch (error) {
    return { success: false, errors: [storageError(error)] }
  }
}

export function loadDashboardApplicationV3(storage: DashboardStorageLike): DashboardLoadResultV3 {
  const warnings: string[] = []
  const errors: string[] = []
  let invalidV3Raw: string | null = null

  const v3Raw = storage.getItem(DASHBOARD_STORAGE_KEYS_V3.currentV3)
  if (v3Raw !== null) {
    try {
      const result = migrateDashboardToV3(parseDashboardJson(v3Raw))
      if (result.application && result.report.success) {
        return {
          application: result.application,
          source: 'v3',
          persisted: true,
          report: result.report,
          warnings: result.report.warnings,
          errors: [],
        }
      }
      invalidV3Raw = v3Raw
      errors.push(...reportErrors('V3 草稿无效', result))
    } catch (error) {
      invalidV3Raw = v3Raw
      errors.push(`V3 草稿无效：${storageError(error)}`)
    }
  }

  const legacyCandidates: Array<{
    source: 'v2' | 'v1'
    version: 2 | 1
    key: string
  }> = [
    { source: 'v2', version: 2, key: DASHBOARD_STORAGE_KEYS_V3.currentV2 },
    { source: 'v1', version: 1, key: DASHBOARD_STORAGE_KEYS_V3.legacyV1 },
  ]

  for (const candidate of legacyCandidates) {
    const raw = storage.getItem(candidate.key)
    if (raw === null) continue

    try {
      const result = migrateDashboardToV3(parseDashboardJson(raw))
      if (!result.application || !result.report.success) {
        errors.push(...reportErrors(`${candidate.source.toUpperCase()} 草稿迁移失败`, result))
        continue
      }

      try {
        if (invalidV3Raw !== null) {
          saveBackupIfMissing(
            storage,
            DASHBOARD_STORAGE_KEYS_V3.invalidV3Backup,
            invalidV3Raw,
          )
          warnings.push('原无效 V3 草稿已备份后由旧版草稿恢复')
        }
        persistMigratedLegacy(storage, candidate.version, raw, result.application)
      } catch (error) {
        errors.push(`迁移结果写入失败：${storageError(error)}`)
        return {
          application: result.application,
          source: candidate.source,
          persisted: false,
          report: result.report,
          warnings: [...warnings, ...result.report.warnings],
          errors,
        }
      }

      return {
        application: result.application,
        source: candidate.source,
        persisted: true,
        report: result.report,
        warnings: [...warnings, ...result.report.warnings],
        errors,
      }
    } catch (error) {
      errors.push(`${candidate.source.toUpperCase()} 草稿迁移失败：${storageError(error)}`)
    }
  }

  const application = createDefaultDashboardApplicationV3()
  let persisted = false
  if (invalidV3Raw === null) {
    const saveResult = saveDashboardApplicationV3(storage, application)
    persisted = saveResult.success
    errors.push(...saveResult.errors)
  } else {
    warnings.push('无可恢复的旧版草稿，保留原无效 V3 草稿并返回内存空白看板')
  }

  return {
    application,
    source: 'default',
    persisted,
    report: null,
    warnings,
    errors,
  }
}

export function exportDashboardApplicationV3(application: DashboardApplicationV3): string {
  const validation = validateDashboardApplicationV3(application)
  if (!validation.valid) {
    const summary = validation.issues
      .map((issue) => `${issue.path}：${issue.message}`)
      .join('；')
    throw new Error(`V3 看板导出失败：${summary}`)
  }
  return JSON.stringify(application, null, 2)
}

export function importDashboardApplicationV3(
  raw: string,
  storage?: DashboardStorageLike,
): DashboardImportResultV3 {
  if (new TextEncoder().encode(raw).byteLength > MAX_DASHBOARD_IMPORT_BYTES) {
    return {
      application: null,
      saved: false,
      report: {
        sourceVersion: 1,
        targetVersion: 3,
        success: false,
        warnings: [],
        errors: [`导入文件不能超过 ${MAX_DASHBOARD_IMPORT_BYTES} 字节`],
        generatedIds: [],
        migratedAt: new Date().toISOString(),
      },
    }
  }

  let migration: DashboardMigrationResultV3
  try {
    migration = migrateDashboardToV3(parseDashboardJson(raw))
  } catch (error) {
    migration = {
      application: null,
      report: {
        sourceVersion: 1,
        targetVersion: 3,
        success: false,
        warnings: [],
        errors: [storageError(error)],
        generatedIds: [],
        migratedAt: new Date().toISOString(),
      },
    }
  }

  if (!migration.application || !migration.report.success || !storage) {
    return { ...migration, saved: false }
  }

  const saveResult = saveDashboardApplicationV3(storage, migration.application)
  if (!saveResult.success) {
    return {
      application: null,
      saved: false,
      report: {
        ...migration.report,
        success: false,
        errors: [...migration.report.errors, ...saveResult.errors],
      },
    }
  }

  return { ...migration, saved: true }
}

export function storageKeyForSourceVersion(sourceVersion: DashboardSourceVersion): string {
  if (sourceVersion === 3) return DASHBOARD_STORAGE_KEYS_V3.currentV3
  if (sourceVersion === 2) return DASHBOARD_STORAGE_KEYS_V3.currentV2
  return DASHBOARD_STORAGE_KEYS_V3.legacyV1
}
