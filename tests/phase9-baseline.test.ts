import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import { migrateDashboardToV3 } from '../src/services/dashboardMigrationV3.ts'
import { exportDashboardApplicationV3 } from '../src/services/dashboardStorageV3.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'

test('P9.0 keeps legacy single-page V3 documents valid', () => {
  const application = createDefaultDashboardApplicationV3()
  assert.equal(validateDashboardApplicationV3(application).valid, true)
})

test('P9.0 keeps V2 to V3 migration valid', () => {
  const result = migrateDashboardToV3({
    version: 2,
    name: 'Legacy dashboard',
    canvas: { width: 1200, height: 600, background: '#fff', showGrid: true, gridSize: 12 },
    titleStyle: { show: true, fontSize: 24, color: '#000', fontWeight: 700, align: 'left' },
    components: [],
  })
  assert.equal(result.report.success, true, result.report.errors.join('\n'))
  assert.equal(result.application?.pages.length, 1)
})

test('P9.0 does not persist activePageId runtime state', () => {
  const application = createDefaultDashboardApplicationV3() as ReturnType<typeof createDefaultDashboardApplicationV3> & { activePageId?: string }
  application.activePageId = application.defaultPageId
  assert.equal(validateDashboardApplicationV3(application).valid, false)
  assert.throws(() => exportDashboardApplicationV3(application))
})
