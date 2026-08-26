import assert from 'node:assert/strict'
import test from 'node:test'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import type { DashboardComponent } from '../src/models/dashboard.ts'
import { migrateDashboardToV3 } from '../src/services/dashboardMigrationV3.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'
import { normalizeQueryResult } from '../src/services/queryResult.ts'

function tableComponent(): DashboardComponent {
  return {
    id: 'risk-table', type: 'table', title: '风险明细', position: { x: 0, y: 0, width: 500, height: 300, zIndex: 1 },
    dataConfig: { version: 2, sourceKind: 'mock', datasetId: 'risk', dimensions: [{ field: 'org', role: 'category' }], measures: [{ field: 'risk_score', aggregation: 'sum' }], filters: [], sort: [], limit: 200 },
    styleConfig: { background: '#fff', titleColor: '#111', titleSize: 12, titleWeight: 600, titleVisible: true },
    tableConfig: { columns: [{ field: 'org', label: '机构', width: 160, format: 'auto', summary: 'none' }, { field: 'risk_score', label: '风险', width: 100, format: 'number', summary: 'avg' }], striped: true, showHeader: true },
  }
}

test('DE-4 old table JSON reopens with safe pagination and formatting defaults', () => {
  const app = createDefaultDashboardApplicationV3()
  app.pages[0].components = [tableComponent()]
  const result = migrateDashboardToV3(app)
  assert.equal(result.report.success, true)
  const config = result.application!.pages[0].components[0].tableConfig!
  assert.deepEqual(config.pagination, { enabled: true, mode: 'client', pageSize: 20, showTotal: true })
  assert.equal(config.fixedHeader, true)
  assert.deepEqual(config.conditionalRules, [])
})

test('DE-4 table rules and pagination survive V3 save/reopen', () => {
  const app = createDefaultDashboardApplicationV3()
  const component = tableComponent()
  component.tableConfig = { ...component.tableConfig!, fixedHeader: true, pagination: { enabled: true, mode: 'server', pageSize: 50, showTotal: true }, conditionalRules: [{ id: 'high-risk', field: 'risk_score', operator: 'gte', value: 80, backgroundColor: '#fee2e2', textColor: '#991b1b', badge: 'danger' }] }
  app.pages[0].components = [component]
  const result = migrateDashboardToV3(JSON.parse(JSON.stringify(app)))
  assert.equal(result.report.success, true)
  assert.deepEqual(result.application!.pages[0].components[0].tableConfig, component.tableConfig)
})

test('DE-5 dataset source dependencies persist and schema rejects cycles', () => {
  const app = createDefaultDashboardApplicationV3()
  app.parameters = [
    { id: 'level', code: 'org_level', name: '机构级别', type: 'singleSelect', scope: 'application', required: false, source: { kind: 'static', options: [{ label: '三级', value: '3' }] } },
    { id: 'org', code: 'org_code', name: '机构', type: 'singleSelect', scope: 'application', required: false, source: { kind: 'dataset', datasetId: 'organization_options', valueField: 'org_code', labelField: 'org_name', dependencies: [{ parameterId: 'level', datasetParameterCode: 'org_level' }] } },
  ]
  const reopened = migrateDashboardToV3(JSON.parse(JSON.stringify(app)))
  assert.equal(reopened.report.success, true)
  assert.deepEqual(reopened.application!.parameters[1].source, app.parameters[1].source)
  ;(app.parameters[0] as typeof app.parameters[number]).source = { kind: 'dataset', datasetId: 'level_options', valueField: 'code', labelField: 'name', dependencies: [{ parameterId: 'org', datasetParameterCode: 'org_code' }] }
  const validation = validateDashboardApplicationV3(app)
  assert.equal(validation.valid, false)
  assert.ok(validation.issues.some((issue) => issue.keyword === 'parameterDependencyDag'))
})

test('DE-4 paged query metadata survives result normalization for renderer total', () => {
  const result = normalizeQueryResult('risk', { rows: [{ id: 21 }], rowCount: 1, pagination: { offset: 20, limit: 20, includeTotal: true, total: 57 } })
  assert.deepEqual(result.pagination, { offset: 20, limit: 20, includeTotal: true, total: 57 })
})
