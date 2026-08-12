import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { exportDashboardApplicationV3, importDashboardApplicationV3 } from '../src/services/dashboardStorageV3.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'
import { ParameterRuntimeStoreV3 } from '../src/services/parameterRuntimeV3.ts'

const examplePath = fileURLToPath(new URL('../docs/02_V3架构/示例/dashboard-v3-phase8.json', import.meta.url))

test('Phase8 交付示例通过校验并可无损导入导出', () => {
  const source = JSON.parse(readFileSync(examplePath, 'utf8'))
  const validation = validateDashboardApplicationV3(source)
  assert.equal(validation.valid, true, JSON.stringify(validation.issues))
  const imported = importDashboardApplicationV3(exportDashboardApplicationV3(source))
  assert.equal(imported.report.success, true)
  assert.deepEqual(imported.application, source)
})

test('参数运行值、事务和缓存状态不进入 Phase8 持久化 JSON', () => {
  const source = JSON.parse(readFileSync(examplePath, 'utf8'))
  const runtime = new ParameterRuntimeStoreV3(source.parameters, { transactionId: () => 'runtime-secret-transaction' })
  runtime.commit([{ parameterId: 'parameter-year', value: '2025' }])
  const exported = exportDashboardApplicationV3(source)
  assert.equal(exported.includes('runtime-secret-transaction'), false)
  assert.equal(exported.includes('parameterRuntimeValues'), false)
  assert.equal(JSON.parse(exported).parameters[0].defaultValue, '2026')
})
