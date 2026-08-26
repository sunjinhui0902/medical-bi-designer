import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { migrateDashboard } from '../src/services/dashboardMigration.ts'
import {
  detectDashboardVersion,
  migrateDashboardToV3,
  requireMigratedDashboardV3,
} from '../src/services/dashboardMigrationV3.ts'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'

function fixture(relativePath: string): unknown {
  return JSON.parse(readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8'))
}

const v1Fixture = fixture('../docs/01_V2版本/示例/dashboard-v1-legacy.json')
const v2Fixture = fixture('../docs/01_V2版本/示例/dashboard-v2-multi-field.json')

test('识别 V1、V2、V3 并拒绝未知版本', () => {
  assert.equal(detectDashboardVersion(v1Fixture), 1)
  assert.equal(detectDashboardVersion(v2Fixture), 2)
  assert.equal(detectDashboardVersion(createDefaultDashboardApplicationV3()), 3)
  assert.throws(() => detectDashboardVersion({ version: 99 }), /不支持的看板版本/)
})

test('V2 根画布、标题和组件无损进入稳定默认页', () => {
  const sourceSnapshot = JSON.stringify(v2Fixture)
  const first = migrateDashboardToV3(v2Fixture)
  const second = migrateDashboardToV3(v2Fixture)
  const expectedV2 = migrateDashboard(v2Fixture)
  const application = requireMigratedDashboardV3(first)

  assert.equal(first.report.sourceVersion, 2)
  assert.equal(application.pages.length, 1)
  assert.deepEqual(application.pages[0].canvas, expectedV2.canvas)
  assert.deepEqual(application.pages[0].titleStyle, expectedV2.titleStyle)
  assert.deepEqual(application.pages[0].components, expectedV2.components)
  assert.equal(application.id, requireMigratedDashboardV3(second).id)
  assert.equal(application.defaultPageId, requireMigratedDashboardV3(second).defaultPageId)
  assert.equal(JSON.stringify(v2Fixture), sourceSnapshot)
})

test('V1 通过现有迁移规则链式升级到 V3', () => {
  const result = migrateDashboardToV3(v1Fixture)
  const application = requireMigratedDashboardV3(result)
  const component = application.pages[0].components[0]

  assert.equal(result.report.sourceVersion, 1)
  assert.equal(component.dataConfig.version, 2)
  assert.deepEqual(component.dataConfig.dimensions, [{ field: 'month_code', role: 'category' }])
  assert.equal(component.dataConfig.measures[0]?.field, 'amount')
})

test('合法 V3 输入幂等读取且不重复生成页面或 ID', () => {
  const source = createDefaultDashboardApplicationV3({
    id: 'dashboard-existing',
    pageId: 'page-existing',
  })
  source.extensionRefs.futureProviderRef = 'future-provider'
  const snapshot = JSON.stringify(source)

  const result = migrateDashboardToV3(source)
  assert.deepEqual(requireMigratedDashboardV3(result), source)
  assert.deepEqual(result.report.generatedIds, [])
  assert.equal(JSON.stringify(source), snapshot)
})

test('旧 V3 组合图会在共享迁移层补齐部分分析与系列样式', () => {
  const source = createDefaultDashboardApplicationV3({ id: 'dashboard-combo-legacy', pageId: 'page-combo-legacy' })
  const component = migrateDashboard(v2Fixture).components[0]
  component.type = 'combo'
  component.analysisConfig = { legendVisible: false } as typeof component.analysisConfig
  component.dataConfig.measures[0].axis = undefined
  component.dataConfig.measures[0].chartType = undefined
  component.dataConfig.measures[0].labelConfig = { show: true } as typeof component.dataConfig.measures[0]['labelConfig']
  source.pages[0].components = [component]
  const snapshot = JSON.stringify(source)

  const result = migrateDashboardToV3(source)
  const migrated = requireMigratedDashboardV3(result).pages[0].components[0]

  assert.equal(migrated.analysisConfig?.legendVisible, false)
  assert.equal(migrated.analysisConfig?.leftAxisColor, '#64748b')
  assert.equal(migrated.dataConfig.measures[0].axis, 'left')
  assert.equal(migrated.dataConfig.measures[0].chartType, 'bar')
  assert.equal(migrated.dataConfig.measures[0].labelConfig?.show, true)
  assert.equal(migrated.dataConfig.measures[0].labelConfig?.percentageBase, 'category')
  assert.match(result.report.warnings.join('；'), /图表组件/)
  assert.equal(JSON.stringify(source), snapshot)
})

test('安全扩展字段被保留，凭据类字段不进入 V3 或迁移报告', () => {
  const source = {
    ...(v2Fixture as Record<string, unknown>),
    customMeta: {
      owner: 'demo',
      password: 'do-not-copy',
      notes: 'postgresql://demo:secret@db.example.invalid/demo',
    },
    databaseHost: '10.0.0.1',
    accessToken: 'sensitive-token',
  }
  const result = migrateDashboardToV3(source)
  const application = requireMigratedDashboardV3(result)
  const serialized = JSON.stringify({ application, report: result.report })

  assert.deepEqual(application.extensionRefs.legacyRoot, {
    customMeta: { owner: 'demo', notes: '[REDACTED]' },
  })
  assert.equal(serialized.includes('do-not-copy'), false)
  assert.equal(serialized.includes('10.0.0.1'), false)
  assert.equal(serialized.includes('sensitive-token'), false)
  assert.equal(serialized.includes('demo:secret'), false)
})

test('损坏 JSON 返回失败报告，不抛出且不产生 V3', () => {
  const result = migrateDashboardToV3({
    version: 2,
    name: '损坏看板',
    components: [],
  })

  assert.equal(result.report.success, false)
  assert.equal(result.application, null)
  assert.equal(result.report.errors.length > 0, true)
  assert.throws(() => requireMigratedDashboardV3(result), /看板迁移失败/)
})

test('500 个组件迁移保持数量和顺序', () => {
  const template = (v2Fixture as { components: Array<Record<string, unknown>> }).components[0]
  const source = {
    ...(v2Fixture as Record<string, unknown>),
    components: Array.from({ length: 500 }, (_, index) => ({
      ...template,
      id: `component-${index}`,
      position: {
        ...(template.position as Record<string, unknown>),
        zIndex: index + 1,
      },
    })),
  }
  const startedAt = performance.now()
  const result = migrateDashboardToV3(source)
  const elapsed = performance.now() - startedAt
  const components = requireMigratedDashboardV3(result).pages[0].components

  assert.equal(components.length, 500)
  assert.equal(components[0].id, 'component-0')
  assert.equal(components[499].id, 'component-499')
  assert.equal(elapsed < 1_000, true)
})
