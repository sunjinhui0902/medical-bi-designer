import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveInteractionTableColumns, resolveDrillDisplayValue } from '../src/services/interactionPresentationV3.ts'
import type { TableColumnConfig } from '../src/models/dashboard.ts'
const columns: TableColumnConfig[] = [{ field: 'doctor', label: '医生编号', width: 330, format: 'auto', summary: 'none' }, { field: 'visits', label: '门诊人次', width: 170, format: 'number', summary: 'none' }]
const available = [{ field: 'doctor', label: 'doctor', role: 'dimension' as const }, { field: 'visits', label: 'visits', role: 'measure' as const }, { field: 'doctor_id', label: 'doctor_id', role: 'dimension' as const }]
test('business display whitelist hides keys while ordinary and unconfigured tables retain automatic columns', () => {
  const original = structuredClone({ columns, available })
  assert.deepEqual(resolveInteractionTableColumns('local-business:doctors', columns, available), columns)
  assert.deepEqual(resolveInteractionTableColumns('regular-dataset', columns, available).map(c => c.field), ['doctor', 'visits', 'doctor_id'])
  assert.deepEqual(resolveInteractionTableColumns('local-business:doctors', [], available).map(c => c.field), ['doctor', 'visits', 'doctor_id'])
  assert.deepEqual(resolveInteractionTableColumns('local-business:doctors', columns, []), [])
  assert.deepEqual({ columns, available }, original)
})
test('existing unique parameter option wins, preserving scalar key identity and ambiguous fallback', () => {
  const source = { type: 'table', rows: [{ id: 0, doctor: '行数据名称', visits: 1 }], columns, measureFields: ['visits'] }
  assert.equal(resolveDrillDisplayValue({ value: 0, field: 'id', options: [{ value: 0, label: '参数名称' }], source }), '参数名称')
  assert.equal(resolveDrillDisplayValue({ value: '0', field: 'id', options: [{ value: 0, label: '参数名称' }], source }), '0')
  assert.equal(resolveDrillDisplayValue({ value: 0, field: 'id', options: [{ value: 0, label: '甲' }, { value: 0, label: '乙' }], source }), '0')
})
test('loaded source rows resolve a unique configured text label without changing hidden keys or rows', () => {
  const input = { value: 'hash', field: 'doctor_id', source: { type: 'table', rows: [{ doctor_id: 'hash', doctor: '医生01', visits: 12, internal: 'secret-key' }, { doctor_id: 'other', doctor: '医生02', visits: 9 }], columns, measureFields: ['visits'] } }
  const original = structuredClone(input)
  assert.equal(resolveDrillDisplayValue(input), '医生01'); assert.deepEqual(input, original)
  input.source.rows.push({ doctor_id: 'hash', doctor: '医生03', visits: 12 })
  assert.equal(resolveDrillDisplayValue(input), 'hash')
  assert.equal(resolveDrillDisplayValue({ ...input, field: undefined }), 'hash')
  assert.equal(resolveDrillDisplayValue({ ...input, source: undefined }), 'hash')
  assert.equal(resolveDrillDisplayValue({ ...input, source: { ...input.source, type: 'line' } }), 'hash')
  assert.equal(resolveDrillDisplayValue({ ...input, source: { ...input.source, rows: [] } }), 'hash')
  assert.equal(resolveDrillDisplayValue({ ...input, source: { ...input.source, columns: [{ ...columns[1]!, format: 'auto' }] } }), 'hash')
})
