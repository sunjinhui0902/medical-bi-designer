import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import {
  DASHBOARD_STORAGE_KEYS_V3,
  MAX_DASHBOARD_IMPORT_BYTES,
  exportDashboardApplicationV3,
  importDashboardApplicationV3,
  loadDashboardApplicationV3,
  saveDashboardApplicationV3,
  type DashboardStorageLike,
} from '../src/services/dashboardStorageV3.ts'

class MemoryStorage implements DashboardStorageLike {
  readonly values = new Map<string, string>()
  readonly writes: string[] = []
  failOnKey = ''

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    if (key === this.failOnKey) {
      throw new Error(`写入失败：${key}`)
    }
    this.values.set(key, value)
    this.writes.push(key)
  }
}

function fixture(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const v1Raw = fixture('../docs/01_V2版本/示例/dashboard-v1-legacy.json')
const v2Raw = fixture('../docs/01_V2版本/示例/dashboard-v2-multi-field.json')

test('V3 草稿存在时优先读取且不改写旧草稿', () => {
  const storage = new MemoryStorage()
  const application = createDefaultDashboardApplicationV3({ id: 'dashboard-v3' })
  storage.values.set(DASHBOARD_STORAGE_KEYS_V3.currentV3, JSON.stringify(application))
  storage.values.set(DASHBOARD_STORAGE_KEYS_V3.currentV2, v2Raw)

  const result = loadDashboardApplicationV3(storage)

  assert.equal(result.source, 'v3')
  assert.equal(result.application.id, 'dashboard-v3')
  assert.equal(result.persisted, true)
  assert.deepEqual(storage.writes, [])
  assert.equal(storage.getItem(DASHBOARD_STORAGE_KEYS_V3.backupV2), null)
})

test('只有 V2 时先备份原文再写入 V3，刷新后不重复迁移', () => {
  const storage = new MemoryStorage()
  storage.values.set(DASHBOARD_STORAGE_KEYS_V3.currentV2, v2Raw)

  const first = loadDashboardApplicationV3(storage)
  const second = loadDashboardApplicationV3(storage)

  assert.equal(first.source, 'v2')
  assert.equal(first.persisted, true)
  assert.equal(storage.getItem(DASHBOARD_STORAGE_KEYS_V3.backupV2), v2Raw)
  assert.equal(JSON.parse(storage.getItem(DASHBOARD_STORAGE_KEYS_V3.currentV3) || '{}').version, 3)
  assert.equal(second.source, 'v3')
  assert.equal(second.application.id, first.application.id)
  assert.equal(second.application.pages.length, 1)
})

test('只有 V1 时保留 V1 备份并链式写入 V3', () => {
  const storage = new MemoryStorage()
  storage.values.set(DASHBOARD_STORAGE_KEYS_V3.legacyV1, v1Raw)

  const result = loadDashboardApplicationV3(storage)

  assert.equal(result.source, 'v1')
  assert.equal(result.report?.sourceVersion, 1)
  assert.equal(storage.getItem(DASHBOARD_STORAGE_KEYS_V3.backupV1), v1Raw)
  assert.equal(result.application.pages[0].components.length, 1)
})

test('无效 V3 可由有效 V2 恢复且原 V3 被单独备份', () => {
  const storage = new MemoryStorage()
  const invalidV3Raw = '{"version":3,"name":"损坏草稿"}'
  storage.values.set(DASHBOARD_STORAGE_KEYS_V3.currentV3, invalidV3Raw)
  storage.values.set(DASHBOARD_STORAGE_KEYS_V3.currentV2, v2Raw)

  const result = loadDashboardApplicationV3(storage)

  assert.equal(result.source, 'v2')
  assert.equal(result.persisted, true)
  assert.equal(storage.getItem(DASHBOARD_STORAGE_KEYS_V3.invalidV3Backup), invalidV3Raw)
  assert.equal(result.warnings.some((warning) => warning.includes('无效 V3 草稿已备份')), true)
  assert.equal(JSON.parse(storage.getItem(DASHBOARD_STORAGE_KEYS_V3.currentV3) || '{}').version, 3)
})

test('无效 V3 且没有旧草稿时保留原文，只返回内存空白看板', () => {
  const storage = new MemoryStorage()
  const invalidV3Raw = '{broken-json'
  storage.values.set(DASHBOARD_STORAGE_KEYS_V3.currentV3, invalidV3Raw)

  const result = loadDashboardApplicationV3(storage)

  assert.equal(result.source, 'default')
  assert.equal(result.persisted, false)
  assert.equal(result.application.version, 3)
  assert.equal(storage.getItem(DASHBOARD_STORAGE_KEYS_V3.currentV3), invalidV3Raw)
})

test('Schema 校验失败时保存不会覆盖当前有效草稿', () => {
  const storage = new MemoryStorage()
  const current = createDefaultDashboardApplicationV3({ id: 'dashboard-current' })
  storage.values.set(DASHBOARD_STORAGE_KEYS_V3.currentV3, JSON.stringify(current))
  const invalid = createDefaultDashboardApplicationV3({ id: 'dashboard-invalid' })
  invalid.defaultPageId = 'page-missing'

  const result = saveDashboardApplicationV3(storage, invalid)

  assert.equal(result.success, false)
  assert.equal(
    JSON.parse(storage.getItem(DASHBOARD_STORAGE_KEYS_V3.currentV3) || '{}').id,
    'dashboard-current',
  )
})

test('V1/V2/V3 均可导入，保存和导出统一为 V3', () => {
  for (const raw of [
    v1Raw,
    v2Raw,
    JSON.stringify(createDefaultDashboardApplicationV3({ id: 'dashboard-import-v3' })),
  ]) {
    const storage = new MemoryStorage()
    const imported = importDashboardApplicationV3(raw, storage)

    assert.equal(imported.report.success, true)
    assert.equal(imported.saved, true)
    assert.equal(imported.application?.version, 3)
    const exported = exportDashboardApplicationV3(imported.application!)
    assert.deepEqual(JSON.parse(exported), imported.application)
  }
})

test('导入损坏或超大 JSON 不覆盖现有 V3 草稿', () => {
  const storage = new MemoryStorage()
  const current = createDefaultDashboardApplicationV3({ id: 'dashboard-current' })
  const currentRaw = JSON.stringify(current)
  storage.values.set(DASHBOARD_STORAGE_KEYS_V3.currentV3, currentRaw)

  const invalid = importDashboardApplicationV3('{broken-json', storage)
  const oversized = importDashboardApplicationV3(
    ' '.repeat(MAX_DASHBOARD_IMPORT_BYTES + 1),
    storage,
  )

  assert.equal(invalid.saved, false)
  assert.equal(oversized.saved, false)
  assert.equal(storage.getItem(DASHBOARD_STORAGE_KEYS_V3.currentV3), currentRaw)
})

test('备份写入失败时不写 V3，但仍返回可用的内存迁移结果', () => {
  const storage = new MemoryStorage()
  storage.values.set(DASHBOARD_STORAGE_KEYS_V3.currentV2, v2Raw)
  storage.failOnKey = DASHBOARD_STORAGE_KEYS_V3.backupV2

  const result = loadDashboardApplicationV3(storage)

  assert.equal(result.source, 'v2')
  assert.equal(result.persisted, false)
  assert.equal(result.application.version, 3)
  assert.equal(storage.getItem(DASHBOARD_STORAGE_KEYS_V3.currentV3), null)
  assert.equal(result.errors.some((error) => error.includes('写入失败')), true)
})
