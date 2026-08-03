import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import type { ParameterDefinitionV3 } from '../src/models/parameters.ts'
import { exportDashboardApplicationV3, importDashboardApplicationV3 } from '../src/services/dashboardStorageV3.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'
import { ParameterRegistryV3 } from '../src/services/parameterRegistry.ts'

const examplePath = fileURLToPath(new URL(
  '../docs/02_V3架构/示例/dashboard-v3-phase7.json',
  import.meta.url,
))

test('Phase7 交付示例通过 Schema 与语义校验并可导出再导入', () => {
  const source = JSON.parse(readFileSync(examplePath, 'utf8'))
  const validation = validateDashboardApplicationV3(source)

  assert.equal(validation.valid, true, JSON.stringify(validation.issues))

  const exported = exportDashboardApplicationV3(source)
  const imported = importDashboardApplicationV3(exported)

  assert.equal(imported.report.success, true)
  assert.equal(imported.report.sourceVersion, 3)
  assert.deepEqual(imported.application, source)
})

test('200 个参数的注册、搜索和编辑保持可用', () => {
  const parameters: ParameterDefinitionV3[] = Array.from({ length: 200 }, (_, index) => ({
    id: `parameter-${index}`,
    code: `parameter_${index}`,
    name: `参数 ${index}`,
    type: 'string',
    scope: 'application',
    required: false,
    source: { kind: 'static', options: [] },
    aliases: [`alias_${index}`],
  }))

  const startedAt = performance.now()
  const registry = new ParameterRegistryV3(parameters)
  const searchResult = registry.list('alias_199')
  const updated = registry.update('parameter-199', { name: '已编辑参数 199' })
  const elapsedMs = performance.now() - startedAt

  assert.equal(registry.list().length, 200)
  assert.equal(searchResult.length, 1)
  assert.equal(searchResult[0].code, 'parameter_199')
  assert.equal(updated.name, '已编辑参数 199')
  assert.equal(elapsedMs < 1000, true, `200 参数操作耗时 ${elapsedMs.toFixed(2)} ms`)
})
