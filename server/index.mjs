

import { createServer } from 'node:http'
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import {
  applyDatasetParametersToRows,
  compileDatasetParameterizedQuery,
  normalizeDatasetQueryParameters,
  validateDatasetExecutionRequest,
  validateDatasetQueryParameters,
} from './query-parameters.mjs'
import { applyDatasetRuntimeView, compileDatasetRuntimeQuery } from './query-plan.mjs'

const { Pool } = pg
const execFileAsync = promisify(execFile)
const serverRoot = path.dirname(fileURLToPath(import.meta.url))
const dataRoot = path.join(serverRoot, '.data')
const sourceFile = path.join(dataRoot, 'datasources.json')
const datasetFile = path.join(dataRoot, 'datasets.json')
const keyFile = path.join(dataRoot, 'secret.key')
const apiPort = Number(process.env.BI_API_PORT || 5174)
const maxRows = 200
const timeoutMs = 8000
const defaultConnectTimeoutSeconds = 20

const demoSource = {
  id: 'demo-postgres', name: '医疗 Demo 数据库', type: 'postgresql', host: 'demo.local', port: 5432,
  database: 'medical_bi_demo', username: 'readonly_demo', ssl: false, mode: 'demo', status: 'connected',
  updatedAt: new Date().toISOString(),
}

const demoData = {
  income: [
    { month_code: '2026-01', amount: 4860 }, { month_code: '2026-02', amount: 5120 },
    { month_code: '2026-03', amount: 5380 }, { month_code: '2026-04', amount: 5660 },
    { month_code: '2026-05', amount: 5940 }, { month_code: '2026-06', amount: 6210 },
  ],
  outpatient: [
    { month_code: '2026-01', visit_count: 18260 }, { month_code: '2026-02', visit_count: 19480 },
    { month_code: '2026-03', visit_count: 20120 }, { month_code: '2026-04', visit_count: 21360 },
    { month_code: '2026-05', visit_count: 22540 }, { month_code: '2026-06', visit_count: 23820 },
  ],
  bed: [
    { dept_name: '心内科', total_bed: 86, used_bed: 79, usage_rate: 91.9 },
    { dept_name: '神经内科', total_bed: 72, used_bed: 66, usage_rate: 91.7 },
    { dept_name: '骨科', total_bed: 90, used_bed: 80, usage_rate: 88.9 },
    { dept_name: '普外科', total_bed: 78, used_bed: 68, usage_rate: 87.2 },
  ],
}

await initializeStorage()

createServer(async (request, response) => {
  if (request.method === 'OPTIONS') return send(response, 204)
  try {
    const url = new URL(request.url || '/', `http://${request.headers.host || '127.0.0.1'}`)

    if (request.method === 'GET' && url.pathname === '/api/health') {
      return json(response, 200, { ok: true, service: 'medical-bi-api', databaseDriver: 'pg' })
    }

    if (request.method === 'GET' && url.pathname === '/api/datasources') {
      const savedSources = await readJson(sourceFile, [])
      return json(response, 200, [demoSource, ...savedSources.map(toPublicSource)])
    }

    if (request.method === 'POST' && url.pathname === '/api/datasources/test') {
      const body = await readBody(request)
      return json(response, 200, await testConnection(await resolveSource(body.dataSourceId, body)))
    }

    if (request.method === 'POST' && url.pathname === '/api/datasources') {
      const body = normalizeSource(await readBody(request))
      const sources = await readJson(sourceFile, [])
      const id = body.id || `source-${randomUUID()}`
      const previous = sources.find((item) => item.id === id)
      let password = body.password || (previous?.passwordEncrypted ? await decrypt(previous.passwordEncrypted) : '')
      if (!password && body.credentialTarget) password = await readWindowsCredential(body.credentialTarget)
      if (!password) throw clientError(400, '请填写数据库密码或有效的 Windows Credential Target')
      const saved = {
        ...body, id, passwordEncrypted: await encrypt(password), updatedAt: new Date().toISOString(),
      }
      delete saved.password
      await writeJson(sourceFile, [...sources.filter((item) => item.id !== id), saved])
      return json(response, 201, toPublicSource(saved))
    }

    if (request.method === 'GET' && url.pathname === '/api/datasets') {
      const datasets = (await readJson(datasetFile, [])).map(normalizeDataset)
      const wantsCatalog = url.searchParams.has('paged') || url.searchParams.has('q') || url.searchParams.has('sourceId')
        || url.searchParams.has('status') || url.searchParams.has('category')
      if (!wantsCatalog) return json(response, 200, datasets)
      const sources = [demoSource, ...await readJson(sourceFile, [])]
      const sourceNames = new Map(sources.map((item) => [item.id, item.name]))
      const keyword = String(url.searchParams.get('q') || '').trim().toLowerCase()
      const sourceId = String(url.searchParams.get('sourceId') || '').trim()
      const status = String(url.searchParams.get('status') || '').trim()
      const category = String(url.searchParams.get('category') || '').trim()
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 20, 1), 100)
      const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0)
      const filtered = datasets
        .filter((item) => !sourceId || item.dataSourceId === sourceId)
        .filter((item) => !status || item.status === status)
        .filter((item) => !category || item.category === category)
        .filter((item) => !keyword || `${item.name} ${item.notes || ''} ${item.fields?.map((field) => field.name).join(' ') || ''}`.toLowerCase().includes(keyword))
        .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      const items = filtered.slice(offset, offset + limit).map((item) => ({
        ...item,
        sourceName: sourceNames.get(item.dataSourceId) || item.dataSourceId,
      }))
      return json(response, 200, { items, total: filtered.length, limit, offset })
    }

    const datasetDetailMatch = url.pathname.match(/^\/api\/datasets\/([^/]+)$/)
    if (request.method === 'GET' && datasetDetailMatch) {
      const datasets = (await readJson(datasetFile, [])).map(normalizeDataset)
      const dataset = datasets.find((item) => item.id === decodeURIComponent(datasetDetailMatch[1]))
      if (!dataset) throw clientError(404, '数据集不存在')
      return json(response, 200, dataset)
    }

    if (request.method === 'DELETE' && datasetDetailMatch) {
      const id = decodeURIComponent(datasetDetailMatch[1])
      const datasets = (await readJson(datasetFile, [])).map(normalizeDataset)
      const dataset = datasets.find((item) => item.id === id)
      if (!dataset) throw clientError(404, '数据集不存在')
      await writeJson(datasetFile, datasets.filter((item) => item.id !== id))
      return json(response, 200, { id, name: dataset.name, deleted: true })
    }

    if (request.method === 'POST' && url.pathname === '/api/query/preview') {
      const body = await readBody(request)
      return json(response, 200, await previewQuery(body.dataSourceId, body.sql, body.limit))
    }

    if (request.method === 'POST' && url.pathname === '/api/datasets') {
      const body = await readBody(request)
      if (!body.name?.trim()) throw clientError(400, '请填写数据集名称')
      const preview = await previewQuery(body.dataSourceId, body.sql, Math.min(Number(body.limit) || 50, maxRows))
      const datasets = (await readJson(datasetFile, [])).map(normalizeDataset)
      const id = body.id || `dataset-${randomUUID()}`
      const previous = datasets.find((item) => item.id === id)
      const now = new Date().toISOString()
      const fieldSettings = new Map((Array.isArray(body.fields) ? body.fields : []).map((field) => [field.name, field]))
      const saved = normalizeDataset({
        ...previous,
        ...body,
        version: 2,
        id,
        code: String(body.code || previous?.code || id).trim(),
        name: body.name.trim(),
        dataSourceId: body.dataSourceId,
        sql: body.sql.trim(),
        notes: String(body.notes || body.description || ''),
        description: String(body.description || body.notes || ''),
        fields: preview.fields.map((field) => ({ ...fieldSettings.get(field.name), ...field })),
        parameters: Array.isArray(body.parameters) ? body.parameters : previous?.parameters || [],
        createdAt: previous?.createdAt || now,
        updatedAt: now,
      })
      const parameterIssues = validateDatasetQueryParameters(saved.parameters, saved.fields.map((field) => field.name))
      if (parameterIssues.length) {
        throw clientError(400, parameterIssues.map((issue) => `${issue.path}：${issue.message}`).join('；'))
      }
      await writeJson(datasetFile, [...datasets.filter((item) => item.id !== id), saved])
      return json(response, 201, saved)
    }

    const statusMatch = url.pathname.match(/^\/api\/datasets\/([^/]+)\/status$/)
    if (request.method === 'POST' && statusMatch) {
      const body = await readBody(request)
      if (!['draft', 'validated', 'disabled'].includes(body.status)) throw clientError(400, '数据集状态无效')
      const datasets = (await readJson(datasetFile, [])).map(normalizeDataset)
      const id = decodeURIComponent(statusMatch[1])
      const target = datasets.find((item) => item.id === id)
      if (!target) throw clientError(404, '数据集不存在')
      target.status = body.status
      target.updatedAt = new Date().toISOString()
      await writeJson(datasetFile, datasets)
      return json(response, 200, target)
    }

    const copyMatch = url.pathname.match(/^\/api\/datasets\/([^/]+)\/copy$/)
    if (request.method === 'POST' && copyMatch) {
      const datasets = (await readJson(datasetFile, [])).map(normalizeDataset)
      const source = datasets.find((item) => item.id === decodeURIComponent(copyMatch[1]))
      if (!source) throw clientError(404, '数据集不存在')
      const now = new Date().toISOString()
      const copy = { ...source, id: `dataset-${randomUUID()}`, code: `${source.code}_copy`, name: `${source.name} - 副本`, status: 'draft', createdAt: now, updatedAt: now }
      await writeJson(datasetFile, [...datasets, copy])
      return json(response, 201, copy)
    }

    const executeMatch = url.pathname.match(/^\/api\/datasets\/([^/]+)\/execute$/)
    if (request.method === 'POST' && executeMatch) {
      const body = await readBody(request)
      let executionRequest
      try { executionRequest = validateDatasetExecutionRequest(body) }
      catch (error) { throw clientError(400, error.message) }
      const datasets = (await readJson(datasetFile, [])).map(normalizeDataset)
      const dataset = datasets.find((item) => item.id === decodeURIComponent(executeMatch[1]))
      if (!dataset) throw clientError(404, '数据集不存在')
      return json(response, 200, await executeDatasetQuery(dataset, executionRequest.parameters, executionRequest.limit, executionRequest.view))
    }

    return json(response, 404, { error: '接口不存在' })
  } catch (error) {
    const status = Number(error?.status) || 500
    const message = status >= 500 ? `服务执行失败：${error.message}` : error.message
    return json(response, status, { error: message })
  }
}).listen(apiPort, '127.0.0.1', () => console.log(`[medical-bi-api] http://127.0.0.1:${apiPort}`))

async function initializeStorage() {
  await mkdir(dataRoot, { recursive: true })
  for (const [file, initial] of [[sourceFile, []], [datasetFile, []]]) {
    try { await readFile(file) } catch { await writeJson(file, initial) }
  }
  try { await readFile(keyFile) } catch { await writeFile(keyFile, randomBytes(32), { mode: 0o600 }) }
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')) } catch { return fallback }
}

async function writeJson(file, value) {
  await writeFile(file, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

async function secretKey() {
  return process.env.BI_SECRET_KEY ? Buffer.from(process.env.BI_SECRET_KEY, 'base64') : readFile(keyFile)
}

async function encrypt(value) {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', await secretKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return `${iv.toString('base64')}.${cipher.getAuthTag().toString('base64')}.${encrypted.toString('base64')}`
}

async function decrypt(value) {
  const [iv, tag, payload] = value.split('.').map((part) => Buffer.from(part, 'base64'))
  const decipher = createDecipheriv('aes-256-gcm', await secretKey(), iv)
  decipher.setAuthTag(tag)
  return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8')
}

function toPublicSource(source) {
  const { password, passwordEncrypted, ...safe } = source
  return { ...safe, hasPassword: Boolean(password || passwordEncrypted) }
}

function normalizeSource(body) {
  const port = Number(body.port || 5432)
  const name = String(body.name || body.connection_name || '').trim()
  const host = String(body.host || '').trim()
  const database = String(body.database || '').trim()
  const username = String(body.username || body.user || '').trim()
  const defaultSchema = String(body.defaultSchema || body.default_schema || 'public').trim()
  const sslMode = String(body.sslMode || body.ssl_mode || (body.ssl ? 'require' : 'prefer')).toLowerCase()
  const connectTimeoutSeconds = Math.min(
    Math.max(Number(body.connectTimeoutSeconds || body.connect_timeout_seconds || defaultConnectTimeoutSeconds), 1),
    120,
  )
  const credentialTarget = String(body.credentialTarget || body.credential_target || '').trim()
  if (!name || !host || !database || !username) {
    throw clientError(400, '请完整填写数据源名称、Host、Database 和 Username')
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw clientError(400, '端口号无效')
  if (!/^[a-zA-Z_][a-zA-Z0-9_$]*$/.test(defaultSchema)) throw clientError(400, '默认 Schema 名称无效')
  if (!['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(sslMode)) {
    throw clientError(400, 'ssl_mode 无效')
  }
  return {
    id: body.id,
    name,
    type: 'postgresql',
    host,
    port,
    database,
    username,
    password: String(body.password || ''),
    defaultSchema,
    credentialTarget,
    sslMode,
    connectTimeoutSeconds,
    ssl: ['require', 'verify-ca', 'verify-full'].includes(sslMode),
    mode: 'postgresql',
    status: 'saved',
  }
}

function normalizeDataset(value) {
  const now = new Date().toISOString()
  return {
    version: 2,
    id: String(value.id || `dataset-${randomUUID()}`),
    code: String(value.code || value.id || '').trim(),
    name: String(value.name || '未命名数据集').trim(),
    category: String(value.category || '未分类').trim(),
    purpose: String(value.purpose || '').trim(),
    description: String(value.description || value.notes || '').trim(),
    notes: String(value.notes || value.description || '').trim(),
    dataSourceId: String(value.dataSourceId || ''),
    sql: String(value.sql || '').trim(),
    status: ['draft', 'validated', 'disabled'].includes(value.status) ? value.status : 'validated',
    fields: (Array.isArray(value.fields) ? value.fields : []).map((field) => {
      const dataType = String(field.dataType || field.type || 'unknown')
      const isNumber = dataType === 'number'
      return {
        name: String(field.name || ''),
        label: String(field.label || field.name || ''),
        type: dataType,
        dataType,
        role: ['dimension', 'measure', 'parameter', 'helper'].includes(field.role) ? field.role : isNumber ? 'measure' : 'dimension',
        description: String(field.description || ''),
        unit: String(field.unit || ''),
        defaultAggregation: String(field.defaultAggregation || (isNumber ? 'sum' : 'none')),
        numberFormat: String(field.numberFormat || ''),
        metric: field.metric && typeof field.metric === 'object' ? field.metric : undefined,
      }
    }).filter((field) => field.name),
    parameters: normalizeDatasetQueryParameters(value.parameters),
    createdBy: String(value.createdBy || 'local-developer'),
    createdAt: value.createdAt || value.updatedAt || now,
    updatedAt: value.updatedAt || now,
  }
}

async function resolveSource(id, inline) {
  if (id === demoSource.id || inline.mode === 'demo' || inline.host === demoSource.host) return demoSource
  if (!id) {
    const source = normalizeSource(inline)
    if (!source.password && source.credentialTarget) {
      source.password = await readWindowsCredential(source.credentialTarget)
    }
    return source
  }
  const source = (await readJson(sourceFile, [])).find((item) => item.id === id)
  if (!source) throw clientError(404, '数据源不存在')
  return { ...source, password: await decrypt(source.passwordEncrypted) }
}

async function readWindowsCredential(target) {
  if (process.platform !== 'win32') throw clientError(400, 'credential_target 自动读取仅支持 Windows')
  if (!/^Codex\/[a-zA-Z0-9_./-]+$/.test(target)) throw clientError(400, 'credential_target 格式无效')
  try {
    const { stdout } = await execFileAsync(
      'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
      [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-File', path.join(serverRoot, 'read-windows-credential.ps1'),
        '-Target', target,
      ],
      { windowsHide: true, maxBuffer: 64 * 1024 },
    )
    if (!stdout) throw new Error('empty credential')
    return stdout
  } catch {
    throw clientError(400, `无法读取 Windows 凭据目标：${target}`)
  }
}

async function testConnection(source) {
  if (source.mode === 'demo') {
    return { ok: true, latencyMs: 18, serverVersion: 'PostgreSQL 16 / Demo Adapter', readOnly: true }
  }
  if (!source.password) {
    const targetHint = source.credentialTarget ? `（凭据目标：${source.credentialTarget}）` : ''
    throw clientError(400, `当前本地服务无法自动读取 credential_target，请在页面密码框输入数据库密码${targetHint}`)
  }
  const started = Date.now()
  const pool = createPool(source)
  try {
    const result = await pool.query("SELECT version() AS version, current_setting('transaction_read_only') AS read_only")
    return {
      ok: true,
      latencyMs: Date.now() - started,
      serverVersion: result.rows[0].version,
      readOnly: result.rows[0].read_only === 'on',
    }
  } catch (error) {
    throw normalizeConnectionError(error)
  } finally { await pool.end() }
}

async function previewQuery(dataSourceId, sql, requestedLimit) {
  const safeSql = validateReadOnlySql(sql)
  const limit = Math.min(Math.max(Number(requestedLimit) || 100, 1), maxRows)
  const source = await resolveSource(dataSourceId, {})
  const started = Date.now()

  if (source.mode === 'demo') {
    const rows = demoRowsFor(safeSql).slice(0, limit)
    return {
      rows,
      fields: inferFields(rows),
      rowCount: rows.length,
      durationMs: Date.now() - started,
      limited: rows.length === limit,
      source: source.id,
    }
  }

  const pool = createPool(source)
  const client = await pool.connect()
  try {
    await client.query('BEGIN READ ONLY')
    await client.query(`SELECT set_config('statement_timeout', '${timeoutMs}', true)`)
    const result = await client.query(`SELECT * FROM (${safeSql}) AS bi_preview LIMIT $1`, [limit])
    await client.query('COMMIT')
    return {
      rows: result.rows,
      fields: result.fields.map((field) => ({ name: field.name, type: postgresType(field.dataTypeID) })),
      rowCount: result.rowCount,
      durationMs: Date.now() - started,
      limited: result.rowCount === limit,
      source: source.id,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw clientError(400, `SQL 执行失败：${error.message}`)
  } finally {
    client.release()
    await pool.end()
  }
}

async function executeDatasetQuery(dataset, parameterValues, requestedLimit, view) {
  const safeSql = validateReadOnlySql(dataset.sql)
  let plan
  try {
    const safeDataset = { ...dataset, sql: safeSql }
    const values = parameterValues && typeof parameterValues === 'object' ? parameterValues : {}
    plan = compileDatasetRuntimeQuery(safeDataset, values, view, requestedLimit)
      ?? compileDatasetParameterizedQuery(safeDataset, values, Math.min(Number(requestedLimit) || maxRows, maxRows))
  } catch (error) {
    throw clientError(400, `查询参数无效：${error.message}`)
  }
  const source = await resolveSource(dataset.dataSourceId, {})
  const started = Date.now()

  if (source.mode === 'demo') {
    const limit = plan.values.at(-1)
    const filtered = applyDatasetParametersToRows(demoRowsFor(safeSql), plan)
    const rows = plan.view ? applyDatasetRuntimeView(filtered, plan.view) : filtered.slice(0, limit)
    return {
      rows,
      fields: inferFields(rows),
      rowCount: rows.length,
      durationMs: Date.now() - started,
      limited: rows.length === limit,
      source: source.id,
      appliedParameters: plan.appliedParameters,
      omittedParameters: plan.omittedParameters,
    }
  }

  const pool = createPool(source)
  const client = await pool.connect()
  try {
    await client.query('BEGIN READ ONLY')
    await client.query(`SELECT set_config('statement_timeout', '${timeoutMs}', true)`)
    const result = await client.query(plan.text, plan.values)
    await client.query('COMMIT')
    return {
      rows: result.rows,
      fields: result.fields.map((field) => ({ name: field.name, type: postgresType(field.dataTypeID) })),
      rowCount: result.rowCount,
      durationMs: Date.now() - started,
      limited: result.rowCount === plan.values.at(-1),
      source: source.id,
      appliedParameters: plan.appliedParameters,
      omittedParameters: plan.omittedParameters,
    }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw clientError(400, `SQL 执行失败：${error.message}`)
  } finally {
    client.release()
    await pool.end()
  }
}

function createPool(source) {
  const schema = source.defaultSchema || 'public'
  return new Pool({
    host: source.host,
    port: source.port,
    database: source.database,
    user: source.username,
    password: source.password,
    ssl: source.ssl ? { rejectUnauthorized: false } : false,
    options: `-c search_path=${schema},public`,
    application_name: 'medical-bi-designer',
    max: 1,
    connectionTimeoutMillis: (source.connectTimeoutSeconds || defaultConnectTimeoutSeconds) * 1000,
    idleTimeoutMillis: 1000,
  })
}

function normalizeConnectionError(error) {
  const code = String(error?.code || '')
  const message = String(error?.message || '')
  if (code === '28P01' || /password authentication failed|SASL/i.test(message)) {
    return clientError(401, '数据库认证失败：请检查用户名和密码；credential_target 不会自动转换为密码')
  }
  if (code === '28000' || /no pg_hba.conf entry/i.test(message)) {
    return clientError(403, '数据库拒绝当前客户端：请检查 pg_hba.conf、来源 IP、用户和 SSL 模式')
  }
  if (code === '3D000') return clientError(400, '数据库不存在，请检查 Database')
  if (['ETIMEDOUT', 'ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) {
    return clientError(502, `数据库网络连接失败（${code}），请检查 Host、Port 和连接超时`)
  }
  if (/certificate|ssl/i.test(message)) return clientError(400, 'SSL 连接失败，请检查 ssl_mode 和数据库证书配置')
  return clientError(400, `PostgreSQL/Greenplum 连接失败：${message || code || '未知错误'}`)
}

function validateReadOnlySql(input) {
  if (typeof input !== 'string' || !input.trim()) throw clientError(400, '请输入 SQL')
  const sql = input.trim().replace(/;\s*$/, '')
  const normalized = sql
    .replace(/--.*$/gm, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:''|[^'])*'/g, "''")
  if (!/^\s*(select|with)\b/i.test(normalized)) throw clientError(400, '安全限制：仅允许 SELECT 或 WITH 查询')
  if (normalized.includes(';')) throw clientError(400, '安全限制：仅允许执行一条 SQL')
  const forbidden = /\b(insert|update|delete|drop|alter|create|truncate|copy|call|do|grant|revoke|vacuum|analyze|refresh|reindex|cluster|comment|lock|merge|execute|prepare|deallocate|select\s+into|pg_sleep|dblink)\b/i
  if (forbidden.test(normalized)) throw clientError(400, '安全限制：检测到写入或高风险 SQL 关键字')
  return sql
}

function demoRowsFor(sql) {
  if (/demo_bed/i.test(sql)) return demoData.bed
  if (/demo_op_visit/i.test(sql)) return demoData.outpatient
  return demoData.income
}

function inferFields(rows) {
  return Object.entries(rows[0] || {}).map(([name, value]) => ({
    name,
    type: typeof value === 'number' ? 'number' : 'string',
  }))
}

function postgresType(oid) {
  if ([20, 21, 23, 700, 701, 1700].includes(oid)) return 'number'
  if ([1082, 1114, 1184].includes(oid)) return 'date'
  if (oid === 16) return 'boolean'
  if ([114, 3802].includes(oid)) return 'json'
  return 'string'
}

async function readBody(request) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > 1024 * 1024) throw clientError(413, '请求内容过大')
    chunks.push(chunk)
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
  } catch {
    throw clientError(400, 'JSON 格式无效')
  }
}

function clientError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function send(response, status, body = '') {
  response.writeHead(status, {
    'Access-Control-Allow-Origin': 'http://127.0.0.1:5173',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  })
  response.end(body)
}

function json(response, status, value) {
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  return send(response, status, JSON.stringify(value))
}
