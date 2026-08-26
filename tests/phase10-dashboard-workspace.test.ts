import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import { DASHBOARD_STORAGE_KEYS_V3, type DashboardStorageLike } from '../src/services/dashboardStorageV3.ts'
import {
  DASHBOARD_WORKSPACE_STORAGE_KEY_V3,
  activateDashboardInWorkspaceV3,
  activeDashboardApplicationV3,
  createDashboardWorkspaceV3,
  dashboardEntityStorageKeyV3,
  loadDashboardWorkspaceV3,
  removeDashboardFromWorkspaceV3,
  saveDashboardWorkspaceV3,
  upsertDashboardApplicationInWorkspaceV3,
} from '../src/services/dashboardWorkspaceV3.ts'

class MemoryStorage implements DashboardStorageLike {
  readonly values = new Map<string, string>()
  failOnSetKey = ''
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) {
    if (key === this.failOnSetKey) throw new Error(`set failed: ${key}`)
    this.values.set(key, value)
  }
  removeItem(key: string) { this.values.delete(key) }
}

test('旧单看板草稿首次加载时迁移为多看板工作区', () => {
  const storage = new MemoryStorage()
  const legacy = createDefaultDashboardApplicationV3({ id: 'legacy', name: '原看板' })
  storage.setItem(DASHBOARD_STORAGE_KEYS_V3.currentV3, JSON.stringify(legacy))

  const result = loadDashboardWorkspaceV3(storage)

  assert.equal(result.migrated, true)
  assert.equal(result.workspace.activeDashboardId, 'legacy')
  assert.equal(result.workspace.dashboards[0].name, '原看板')
  const index = JSON.parse(storage.getItem(DASHBOARD_WORKSPACE_STORAGE_KEY_V3) || '{}') as { generation?: string }
  assert.ok(index.generation)
  assert.ok(storage.getItem(dashboardEntityStorageKeyV3('legacy', index.generation)))
})

test('新增和切换看板时保持各自页面与参数隔离', () => {
  const first = createDefaultDashboardApplicationV3({ id: 'first', name: '看板一' })
  first.parameters.push({ id: 'hospital', code: 'hospital', name: '医院', type: 'string', scope: 'application', required: false, source: { kind: 'static', options: [] } })
  const second = createDefaultDashboardApplicationV3({ id: 'second', name: '看板二', pageId: 'second-home' })
  const workspace = upsertDashboardApplicationInWorkspaceV3(createDashboardWorkspaceV3(first), second, true)

  assert.equal(activeDashboardApplicationV3(workspace).id, 'second')
  const switched = activateDashboardInWorkspaceV3(workspace, 'first')
  assert.equal(activeDashboardApplicationV3(switched).parameters[0].id, 'hospital')
  assert.equal(workspace.dashboards.find((item) => item.id === 'second')?.parameters.length, 0)
})

test('保存工作区同步兼容 currentV3 为当前看板', () => {
  const storage = new MemoryStorage()
  const first = createDefaultDashboardApplicationV3({ id: 'first' })
  const second = createDefaultDashboardApplicationV3({ id: 'second', pageId: 'second-home' })
  const workspace = upsertDashboardApplicationInWorkspaceV3(createDashboardWorkspaceV3(first), second, true)

  const result = saveDashboardWorkspaceV3(storage, workspace)

  assert.equal(result.success, true)
  assert.equal(JSON.parse(storage.getItem(DASHBOARD_STORAGE_KEYS_V3.currentV3) || '{}').id, 'second')
  assert.deepEqual(JSON.parse(storage.getItem(DASHBOARD_WORKSPACE_STORAGE_KEY_V3) || '{}').dashboards.map((item: { id: string }) => item.id), ['first', 'second'])
})

test('删除看板拒绝最后一个，并在删除当前看板时切换到剩余项', () => {
  const first = createDefaultDashboardApplicationV3({ id: 'first' })
  const second = createDefaultDashboardApplicationV3({ id: 'second', pageId: 'second-home' })
  const workspace = upsertDashboardApplicationInWorkspaceV3(createDashboardWorkspaceV3(first), second, true)
  const removed = removeDashboardFromWorkspaceV3(workspace, 'second')
  assert.equal(removed.activeDashboardId, 'first')
  assert.deepEqual(removed.dashboards.map((item) => item.id), ['first'])
  assert.throws(() => removeDashboardFromWorkspaceV3(removed, 'first'), /最后一个看板/)
})

test('损坏索引只做内存回退且不覆盖原文', () => {
  const storage = new MemoryStorage()
  storage.setItem(DASHBOARD_WORKSPACE_STORAGE_KEY_V3, '{broken')
  const fallback = createDefaultDashboardApplicationV3({ id: 'fallback' })
  storage.setItem(DASHBOARD_STORAGE_KEYS_V3.currentV3, JSON.stringify(fallback))

  const result = loadDashboardWorkspaceV3(storage)

  assert.equal(result.persisted, false)
  assert.equal(result.workspace.activeDashboardId, 'fallback')
  assert.equal(storage.getItem(DASHBOARD_WORKSPACE_STORAGE_KEY_V3), '{broken')
})

test('实体写入后索引提交失败时旧代仍可完整读取', () => {
  const storage = new MemoryStorage()
  const original = createDefaultDashboardApplicationV3({ id: 'atomic', name: '旧版本' })
  const originalWorkspace = createDashboardWorkspaceV3(original)
  assert.equal(saveDashboardWorkspaceV3(storage, originalWorkspace).success, true)
  const originalIndex = storage.getItem(DASHBOARD_WORKSPACE_STORAGE_KEY_V3)

  const changed = { ...original, name: '新版本' }
  storage.failOnSetKey = DASHBOARD_WORKSPACE_STORAGE_KEY_V3
  const failed = saveDashboardWorkspaceV3(storage, createDashboardWorkspaceV3(changed))

  assert.equal(failed.success, false)
  assert.equal(storage.getItem(DASHBOARD_WORKSPACE_STORAGE_KEY_V3), originalIndex)
  storage.failOnSetKey = ''
  assert.equal(loadDashboardWorkspaceV3(storage).workspace.dashboards[0].name, '旧版本')
})
