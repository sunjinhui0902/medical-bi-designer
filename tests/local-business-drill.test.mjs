import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { getLocalBusinessDataset, executeLocalBusinessDataset, readBusinessSnapshot } from '../server/local-business-drill.mjs'
const dept = 'a'.repeat(32), doctor = 'b'.repeat(32)
const sample = { database: 'bd_odr', readOnly: 'on', month: '2026-08', observedAt: '2026-09-29T03:00:00Z', departments: [{ dept_id: dept, department: '科室样本', visits: 10, month: '2026-08' }], doctors: [{ dept_id: dept, doctor_id: doctor, doctor: '医生01', visits: 9, month: '2026-08' }] }
async function fixture(run) { const dir = await mkdtemp(path.join(tmpdir(), 'business-test-')); const file = path.join(dir, 'snapshot.json'); try { await writeFile(file, JSON.stringify(sample)); await run(file) } finally { await rm(dir, { recursive: true, force: true }) } }
test('business snapshot executes declared filters, missing data, cleared filters and pagination', () => fixture(async file => {
  const meta = await getLocalBusinessDataset('local-business:doctors', file)
  assert.deepEqual(meta.parameters.map(p => p.code), ['month', 'dept_id', 'doctor_id'])
  const all = await executeLocalBusinessDataset(meta.id, { parameters: { dept_id: null, doctor_id: '' } }, file)
  assert.equal(all.rowCount, 1)
  assert.equal((await executeLocalBusinessDataset(meta.id, { parameters: { dept_id: dept, doctor_id: doctor } }, file)).rows[0].visits, 9)
  assert.equal((await executeLocalBusinessDataset(meta.id, { parameters: { dept_id: 'c'.repeat(32) } }, file)).rowCount, 0)
  const paged = await executeLocalBusinessDataset(meta.id, { pagination: { offset: 1, limit: 10, includeTotal: true } }, file)
  assert.equal(paged.rowCount, 0); assert.equal(paged.pagination.total, 1)
  await assert.rejects(executeLocalBusinessDataset(meta.id, { parameters: { sql: 'select' } }, file), /未声明/)
  await assert.rejects(executeLocalBusinessDataset(meta.id, { parameters: { month: '2026-99' } }, file), /格式/)
}))
test('business snapshot refuses missing file, wrong database/read-only and invalid relationships', () => fixture(async file => {
  await assert.rejects(readBusinessSnapshot(file + '.missing'), /暂不可用/)
  await writeFile(file, JSON.stringify({ ...sample, readOnly: 'off' }))
  await assert.rejects(readBusinessSnapshot(file), /格式无效/)
  await writeFile(file, JSON.stringify({ ...sample, doctors: [{ ...sample.doctors[0], dept_id: 'c'.repeat(32) }] }))
  await assert.rejects(readBusinessSnapshot(file), /关联无效/)
}))
