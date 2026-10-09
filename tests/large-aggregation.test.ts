import test from 'node:test'
import assert from 'node:assert/strict'
import { applyDatasetRuntimeView } from '../server/query-plan.mjs'
import { buildComponentDataView } from '../src/services/queryResult.ts'
test('large single-group min/max works without argument-stack overflow on server and display runtime', () => {
  const rows = Array.from({ length: 200000 }, (_, value) => ({ value, peak: value }))
  const result = applyDatasetRuntimeView(rows, { dimensions: [], measures: [{ name: 'value', aggregation: 'min' }, { name: 'peak', aggregation: 'max' }], sort: [], limit: 20 })
  assert.deepEqual(result, [{ value: 0, peak: 199999 }])
  const config = { version: 3 as const, sourceKind: 'mock' as const, datasetId: 'fixture', dimensions: [], measures: [{ field: 'value', aggregation: 'min' as const, axis: 'left' as const }, { field: 'peak', aggregation: 'max' as const, axis: 'left' as const }], filters: [], sort: [], limit: 200000, parameterBindings: [], refreshPolicy: 'manual' as const }
  const view = buildComponentDataView(rows, config)
  assert.equal(view.series[0]?.values[0], 0); assert.equal(view.series[1]?.values[0], 199999)
})
