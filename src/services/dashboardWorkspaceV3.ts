import type { DashboardApplicationV3 } from '../models/dashboard-v3.ts'
import {
  DASHBOARD_STORAGE_KEYS_V3,
  loadDashboardApplicationV3,
  type DashboardLoadSourceV3,
  type DashboardStorageLike,
} from './dashboardStorageV3.ts'
import { migrateDashboardToV3 } from './dashboardMigrationV3.ts'
import { validateDashboardApplicationV3 } from './dashboardValidationV3.ts'

export const DASHBOARD_WORKSPACE_STORAGE_KEY_V3 = 'medical-bi-designer-workspace-v3'
export const DASHBOARD_ENTITY_STORAGE_PREFIX_V3 = 'medical-bi-designer-dashboard-v3::'

export interface DashboardWorkspaceV3 {
  version: 1
  activeDashboardId: string
  dashboards: DashboardApplicationV3[]
}

interface DashboardWorkspaceIndexV3 {
  version: 1
  activeDashboardId: string
  generation?: string
  dashboards: Array<{ id: string; name: string; updatedAt?: string }>
}

export interface DashboardWorkspaceLoadResultV3 {
  workspace: DashboardWorkspaceV3
  source: 'workspace' | DashboardLoadSourceV3
  migrated: boolean
  persisted: boolean
  warnings: string[]
  errors: string[]
}

export interface DashboardWorkspaceSaveResultV3 {
  success: boolean
  warnings: string[]
  errors: string[]
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function storageError(error: unknown): string {
  return error instanceof Error ? error.message : '浏览器存储操作失败'
}

let generationSequence = 0

export function dashboardEntityStorageKeyV3(dashboardId: string, generation?: string): string {
  return generation
    ? `${DASHBOARD_ENTITY_STORAGE_PREFIX_V3}${generation}::${dashboardId}`
    : `${DASHBOARD_ENTITY_STORAGE_PREFIX_V3}${dashboardId}`
}

function nextGeneration(): string {
  generationSequence += 1
  try {
    const randomUUID = globalThis.crypto?.randomUUID?.()
    if (randomUUID) return randomUUID
  } catch {}
  return `${Date.now().toString(36)}-${generationSequence.toString(36)}`
}

function workspaceIssues(workspace: DashboardWorkspaceV3): string[] {
  if (workspace.version !== 1) return ['工作区版本无效']
  if (!workspace.dashboards.length) return ['工作区至少需要一个看板']
  const ids = new Set<string>()
  const errors: string[] = []
  for (const application of workspace.dashboards) {
    if (ids.has(application.id)) errors.push(`看板 ID 重复：${application.id}`)
    ids.add(application.id)
    const validation = validateDashboardApplicationV3(application)
    if (!validation.valid) errors.push(`${application.name}：${validation.issues[0]?.message ?? 'V3 校验失败'}`)
  }
  if (!ids.has(workspace.activeDashboardId)) errors.push('当前看板不存在')
  return errors
}

function parseWorkspaceIndex(raw: string): DashboardWorkspaceIndexV3 {
  const value = JSON.parse(raw) as Partial<DashboardWorkspaceIndexV3>
  if (value.version !== 1 || typeof value.activeDashboardId !== 'string' || !Array.isArray(value.dashboards) || !value.dashboards.length) {
    throw new Error('工作区索引格式无效')
  }
  const dashboards = value.dashboards.map((item) => {
    if (!item || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string') throw new Error('工作区索引项无效')
    return { id: item.id, name: item.name, ...(typeof item.updatedAt === 'string' ? { updatedAt: item.updatedAt } : {}) }
  })
  if (new Set(dashboards.map((item) => item.id)).size !== dashboards.length) throw new Error('工作区索引存在重复看板')
  if (!dashboards.some((item) => item.id === value.activeDashboardId)) throw new Error('工作区当前看板不存在')
  const generation = typeof value.generation === 'string' && value.generation ? value.generation : undefined
  return { version: 1, activeDashboardId: value.activeDashboardId, ...(generation ? { generation } : {}), dashboards }
}

function loadIndexedWorkspace(storage: DashboardStorageLike, raw: string): DashboardWorkspaceV3 {
  const index = parseWorkspaceIndex(raw)
  const dashboards = index.dashboards.map((entry) => {
    const entityRaw = storage.getItem(dashboardEntityStorageKeyV3(entry.id, index.generation))
    if (entityRaw === null) throw new Error(`看板实体缺失：${entry.name}`)
    const migration = migrateDashboardToV3(JSON.parse(entityRaw))
    if (!migration.application || !migration.report.success || migration.application.id !== entry.id) throw new Error(`看板实体无效：${entry.name}`)
    return migration.application
  })
  return { version: 1, activeDashboardId: index.activeDashboardId, dashboards }
}

export function createDashboardWorkspaceV3(application: DashboardApplicationV3): DashboardWorkspaceV3 {
  return { version: 1, activeDashboardId: application.id, dashboards: [cloneJson(application)] }
}

export function activeDashboardApplicationV3(workspace: DashboardWorkspaceV3): DashboardApplicationV3 {
  const application = workspace.dashboards.find((item) => item.id === workspace.activeDashboardId)
  if (!application) throw new Error('当前看板不存在')
  return cloneJson(application)
}

export function upsertDashboardApplicationInWorkspaceV3(workspace: DashboardWorkspaceV3, application: DashboardApplicationV3, activate = false): DashboardWorkspaceV3 {
  const next = cloneJson(workspace)
  const index = next.dashboards.findIndex((item) => item.id === application.id)
  if (index >= 0) next.dashboards[index] = cloneJson(application)
  else next.dashboards.push(cloneJson(application))
  if (activate) next.activeDashboardId = application.id
  return next
}

export function activateDashboardInWorkspaceV3(workspace: DashboardWorkspaceV3, dashboardId: string): DashboardWorkspaceV3 {
  if (!workspace.dashboards.some((item) => item.id === dashboardId)) throw new Error(`看板不存在：${dashboardId}`)
  return { ...cloneJson(workspace), activeDashboardId: dashboardId }
}

export function removeDashboardFromWorkspaceV3(workspace: DashboardWorkspaceV3, dashboardId: string): DashboardWorkspaceV3 {
  if (!workspace.dashboards.some((item) => item.id === dashboardId)) throw new Error(`看板不存在：${dashboardId}`)
  if (workspace.dashboards.length <= 1) throw new Error('不能删除最后一个看板')
  const dashboards = cloneJson(workspace.dashboards.filter((item) => item.id !== dashboardId))
  return {
    version: 1,
    activeDashboardId: workspace.activeDashboardId === dashboardId ? dashboards[0].id : workspace.activeDashboardId,
    dashboards,
  }
}

export function removeDashboardEntityV3(storage: DashboardStorageLike, dashboardId: string): void {
  storage.removeItem?.(dashboardEntityStorageKeyV3(dashboardId))
}

export function saveDashboardWorkspaceV3(storage: DashboardStorageLike, workspace: DashboardWorkspaceV3): DashboardWorkspaceSaveResultV3 {
  const issues = workspaceIssues(workspace)
  if (issues.length) return { success: false, warnings: [], errors: issues }
  const active = activeDashboardApplicationV3(workspace)
  const generation = nextGeneration()
  const previousRaw = storage.getItem(DASHBOARD_WORKSPACE_STORAGE_KEY_V3)
  let previousIndex: DashboardWorkspaceIndexV3 | undefined
  try {
    if (previousRaw !== null) previousIndex = parseWorkspaceIndex(previousRaw)
  } catch {
    previousIndex = undefined
  }
  try {
    for (const application of workspace.dashboards) storage.setItem(dashboardEntityStorageKeyV3(application.id, generation), JSON.stringify(application))
    const index: DashboardWorkspaceIndexV3 = {
      version: 1,
      activeDashboardId: workspace.activeDashboardId,
      generation,
      dashboards: workspace.dashboards.map(({ id, name, updatedAt }) => ({ id, name, ...(updatedAt ? { updatedAt } : {}) })),
    }
    storage.setItem(DASHBOARD_WORKSPACE_STORAGE_KEY_V3, JSON.stringify(index))
  } catch (error) {
    for (const application of workspace.dashboards) {
      try { storage.removeItem?.(dashboardEntityStorageKeyV3(application.id, generation)) } catch {}
    }
    return { success: false, warnings: [], errors: [storageError(error)] }
  }
  const warnings: string[] = []
  if (previousIndex) {
    for (const entry of previousIndex.dashboards) {
      try { storage.removeItem?.(dashboardEntityStorageKeyV3(entry.id, previousIndex.generation)) }
      catch (error) { warnings.push(`旧看板实体清理失败：${storageError(error)}`) }
    }
  }
  try {
    storage.setItem(DASHBOARD_STORAGE_KEYS_V3.currentV3, JSON.stringify(active))
    return { success: true, warnings, errors: [] }
  } catch (error) {
    return { success: true, warnings: [...warnings, `兼容草稿镜像写入失败：${storageError(error)}`], errors: [] }
  }
}

export function loadDashboardWorkspaceV3(storage: DashboardStorageLike): DashboardWorkspaceLoadResultV3 {
  const raw = storage.getItem(DASHBOARD_WORKSPACE_STORAGE_KEY_V3)
  if (raw !== null) {
    try {
      return { workspace: loadIndexedWorkspace(storage, raw), source: 'workspace', migrated: false, persisted: true, warnings: [], errors: [] }
    } catch (error) {
      const legacy = loadDashboardApplicationV3(storage)
      return {
        workspace: createDashboardWorkspaceV3(legacy.application),
        source: legacy.source,
        migrated: false,
        persisted: false,
        warnings: ['多看板索引或实体无效，原始数据未覆盖；当前仅使用兼容草稿的内存回退'],
        errors: [storageError(error), ...legacy.errors],
      }
    }
  }

  const legacy = loadDashboardApplicationV3(storage)
  const workspace = createDashboardWorkspaceV3(legacy.application)
  const saved = saveDashboardWorkspaceV3(storage, workspace)
  return {
    workspace,
    source: legacy.source,
    migrated: true,
    persisted: saved.success,
    warnings: [...legacy.warnings, ...saved.warnings],
    errors: [...legacy.errors, ...saved.errors],
  }
}
