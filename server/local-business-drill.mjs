import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { normalizeDatasetRuntimeView, applyDatasetRuntimeView } from './query-plan.mjs'
const snapshotFile = fileURLToPath(new URL('./.data/interaction-business-snapshot.json', import.meta.url))
const ids = new Set(['local-business:departments', 'local-business:doctors'])
function reject(message, status = 400) { const error = new Error(message); error.status = status; throw error }
export const isLocalBusinessId = id => typeof id === 'string' && id.startsWith('local-business:')
export async function readBusinessSnapshot(file = snapshotFile) {
  let snapshot
  try { snapshot = JSON.parse(await readFile(file, 'utf8')) } catch { reject('本地科室医生快照暂不可用，请先准备只读样本', 503) }
  if (snapshot.database !== 'bd_odr' || snapshot.readOnly !== 'on' || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(snapshot.month) || !snapshot.observedAt || !Array.isArray(snapshot.departments) || !Array.isArray(snapshot.doctors)) reject('本地业务快照格式无效', 503)
  const keys = new Set(snapshot.departments.map(r => r.dept_id))
  if (!snapshot.departments.length || !snapshot.doctors.length || keys.size !== snapshot.departments.length || snapshot.departments.some(r => !/^[a-f0-9]{32}$/.test(r.dept_id) || typeof r.department !== 'string' || !Number.isFinite(r.visits) || r.visits < 0 || r.month !== snapshot.month) || snapshot.doctors.some(r => !keys.has(r.dept_id) || !/^[a-f0-9]{32}$/.test(r.doctor_id) || !/^医生\d+$/.test(r.doctor) || !Number.isFinite(r.visits) || r.visits < 0 || r.month !== snapshot.month)) reject('本地业务快照字段或关联无效', 503)
  return snapshot
}
export async function getLocalBusinessDataset(id, file) {
  if (!ids.has(id)) reject('本地业务数据集不存在', 404)
  const snapshot = await readBusinessSnapshot(file), doctors = id.endsWith(':doctors')
  const columns = doctors ? ['month', 'dept_id', 'doctor_id', 'doctor', 'visits'] : ['month', 'dept_id', 'department', 'visits']
  return { version: 2, id, code: id, name: doctors ? '科室医生 · 本地样本' : '科室门诊 · 本地样本', category: '本地交互教学', purpose: '科室医生下钻演示', dataSourceId: 'local-business-evidence', status: 'validated', readOnly: true, updatedAt: snapshot.observedAt,
    description: 'bd_odr只读聚合快照；部分科室及每科室前10医生，编号展示；不是全院合计或实时查询。科室与医生口径未对账。',
    notes: `2026-08样本 · ads.ads_dept_indicator_all_col / ads.ads_doctor_indicator_all_col · gzl_mzrs`,
    fields: columns.map(name => ({ name, label: name === 'visits' ? '门诊人次（本地测试口径）' : name, type: name === 'visits' ? 'number' : 'string', dataType: name === 'visits' ? 'number' : 'string', role: name === 'visits' ? 'measure' : 'dimension', ...(name === 'visits' ? { unit: '人次' } : {}) })),
    parameters: ['month', ...(doctors ? ['dept_id', 'doctor_id'] : [])].map(code => ({ id: code, code, name: code, type: 'string', required: false, sqlName: code, operator: 'eq', emptyPolicy: 'omit' })),
    businessSample: { month: snapshot.month, observedAt: snapshot.observedAt, departmentCount: snapshot.departments.length, doctorCount: snapshot.doctors.length },
  }
}
export async function executeLocalBusinessDataset(id, request = {}, file) {
  const dataset = await getLocalBusinessDataset(id, file), snapshot = await readBusinessSnapshot(file)
  const parameters = request.parameters || {}, allowed = new Set(dataset.parameters.map(p => p.code))
  for (const [key, value] of Object.entries(parameters)) {
    if (!allowed.has(key)) reject('本地业务筛选参数未声明')
    if (value == null || value === '') continue
    if (typeof value !== 'string' || !(key === 'month' ? /^20\d{2}-(0[1-9]|1[0-2])$/.test(value) : /^[a-f0-9]{32}$/.test(value))) reject('本地业务筛选参数格式无效')
  }
  let rows = (id.endsWith(':doctors') ? snapshot.doctors : snapshot.departments).filter(row => Object.entries(parameters).every(([key, value]) => value == null || value === '' || row[key] === value))
  let view
  try { view = normalizeDatasetRuntimeView(dataset, request.view, request.limit || 200) } catch (error) { reject(`业务样本视图无效：${error.message}`) }
  if (view) rows = applyDatasetRuntimeView(rows, view)
  const total = rows.length, offset = request.pagination?.offset || 0, limit = request.pagination?.limit || request.limit || 200
  rows = rows.slice(offset, offset + limit)
  return { rows, fields: dataset.fields, rowCount: rows.length, source: 'local-business-evidence', dataOrigin: 'bd_odr_readonly_aggregate_snapshot', ...(request.pagination ? { pagination: { ...request.pagination, ...(request.pagination.includeTotal ? { total } : {}) } } : {}) }
}
