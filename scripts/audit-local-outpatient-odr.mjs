import { readFile, writeFile } from 'node:fs/promises'
import { createDecipheriv } from 'node:crypto'
import pg from 'pg'

const dataRoot = new URL('../server/.data/', import.meta.url)
const sources = JSON.parse(await readFile(new URL('datasources.json', dataRoot), 'utf8'))
const source = sources.find(item => item.host === 'localhost' && item.port === 5433 && item.database === 'bd_odr')
if (!source?.passwordEncrypted) throw new Error('本地 bd_odr 加密连接未就绪')
const key = await readFile(new URL('secret.key', dataRoot))
const [iv, tag, payload] = source.passwordEncrypted.split('.').map(part => Buffer.from(part, 'base64'))
const decipher = createDecipheriv('aes-256-gcm', key, iv)
decipher.setAuthTag(tag)
const password = Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8')
const client = new pg.Client({ host: 'localhost', port: 5433, database: 'bd_odr', user: source.username, password, connectionTimeoutMillis: 5000, application_name: 'tybi_local_readonly_audit' })
try {
  await client.connect()
  await client.query('BEGIN READ ONLY')
  await client.query("SET LOCAL statement_timeout = '8000ms'")
  const identity = await client.query("SELECT current_database() AS database, current_setting('transaction_read_only') AS read_only")
  const columns = await client.query(`SELECT table_schema, table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema IN ('ads', 'dws')
      AND (table_name ILIKE '%hospital%indicator%' OR table_name ILIKE '%dept%indicator%' OR table_name ILIKE '%doctor%indicator%' OR table_name ILIKE '%outpatient%' OR table_name ILIKE '%mz%')
    ORDER BY table_schema, table_name, ordinal_position`)
  const coverage = {}
  for (const [name, relation, dimensions, measures] of [
    ['hospital', 'ads.ads_hospital_indicator_all_col', '', 'SUM(gzl_mzrs) AS visits, SUM(zz_zsr_qy_mjzsr) AS revenue'],
    ['department', 'ads.ads_dept_indicator_all_col', 'COUNT(DISTINCT dept_code) AS departments,', 'SUM(gzl_mzrs) AS visits, SUM(zz_zsr_qy_mjzsr) AS revenue'],
    ['doctor', 'ads.ads_doctor_indicator_all_col', 'COUNT(DISTINCT dept_code) AS departments, COUNT(DISTINCT staff_number) AS doctors,', 'SUM(gzl_mzrs) AS visits, SUM(ys_zsr_qy_mzsr) AS revenue'],
  ]) {
    const result = await client.query(`SELECT year_code, month_code, COUNT(*) AS rows, ${dimensions} ${measures}
      FROM ${relation} GROUP BY year_code, month_code ORDER BY year_code DESC, month_code DESC LIMIT 24`)
    coverage[name] = result.rows
  }
  const diagnostics = {}
  for (const [name, relation, extra] of [
    ['hospital', 'ads.ads_hospital_indicator_all_col', 'COUNT(DISTINCT company_code) AS companies'],
    ['department', 'ads.ads_dept_indicator_all_col', `COUNT(DISTINCT (company_code, dept_code, hospital_area_code)) AS composite_departments,
      COUNT(*) FILTER (WHERE dept_code IS NULL OR dept_code = '') AS missing_dept_codes,
      SUM(gzl_mzrs) FILTER (WHERE dept_code IS NULL OR dept_code = '') AS visits_without_dept_code,
      SUM(zz_zsr_qy_mjzsr) FILTER (WHERE dept_code IS NULL OR dept_code = '') AS revenue_without_dept_code`],
    ['doctor', 'ads.ads_doctor_indicator_all_col', `COUNT(DISTINCT (company_code, dept_code, staff_number)) AS composite_doctors,
      COUNT(*) FILTER (WHERE staff_number IS NULL OR staff_number = '') AS missing_staff_numbers,
      SUM(gzl_mzrs) FILTER (WHERE staff_number IS NULL OR staff_number = '') AS visits_without_staff_number,
      COUNT(DISTINCT date) AS observed_dates`],
  ]) {
    const result = await client.query(`SELECT year_code, month_code, COUNT(*) AS rows, ${extra}
      FROM ${relation} WHERE (year_code = '2026' AND month_code = '08') OR (year_code = '2025' AND month_code = '08')
      GROUP BY year_code, month_code ORDER BY year_code DESC`)
    diagnostics[name] = result.rows
  }
  const doctorDifference = await client.query(`WITH department AS (
      SELECT dept_code, SUM(gzl_mzrs) AS visits FROM ads.ads_dept_indicator_all_col
      WHERE year_code='2026' AND month_code='08' GROUP BY dept_code
    ), doctor AS (
      SELECT dept_code, SUM(gzl_mzrs) AS visits FROM ads.ads_doctor_indicator_all_col
      WHERE year_code='2026' AND month_code='08' GROUP BY dept_code
    )
    SELECT COUNT(*) AS department_codes,
      COUNT(*) FILTER (WHERE COALESCE(doctor.visits,0)<>COALESCE(department.visits,0)) AS mismatched_codes,
      SUM(COALESCE(doctor.visits,0)-COALESCE(department.visits,0)) AS net_difference,
      SUM(GREATEST(COALESCE(doctor.visits,0)-COALESCE(department.visits,0),0)) AS positive_difference,
      SUM(LEAST(COALESCE(doctor.visits,0)-COALESCE(department.visits,0),0)) AS negative_difference
    FROM department FULL JOIN doctor ON department.dept_code=doctor.dept_code`)
  const composition = await client.query(`SELECT
      SUM(gzl_mzrs) AS total_visits,
      SUM(gzl_mzrs_mz) AS outpatient_visits,
      SUM(gzl_mzrs_jz) AS emergency_visits,
      SUM(gzl_mzrs_cz) AS other_visits,
      SUM(zz_zsr_qy_mjzsr) AS total_outpatient_revenue,
      SUM(zz_zsr_mz_ypsr) AS drug_revenue,
      SUM(zz_zsr_mz_hcsr) AS consumable_revenue,
      SUM(zz_zsr_mz_jcjysr) AS examination_revenue,
      SUM(zz_zsr_mz_ylfwsr) AS service_revenue,
      SUM(COALESCE(zz_zsr_mz_ypsr,0)+COALESCE(zz_zsr_mz_hcsr,0)+COALESCE(zz_zsr_mz_jcjysr,0)+COALESCE(zz_zsr_mz_ylfwsr,0)+COALESCE(zz_zsr_mz_zlsr,0)+COALESCE(zz_zsr_mz_sssr,0)+COALESCE(zz_zsr_mz_qtsr,0)) AS component_sum
    FROM ads.ads_hospital_indicator_all_col WHERE year_code='2026' AND month_code='08'`)
  const monthlyComposition = await client.query(`SELECT year_code, month_code,
      SUM(gzl_mzrs) AS visits, SUM(gzl_mzrs_mz) AS outpatient_visits, SUM(gzl_mzrs_jz) AS emergency_visits,
      SUM(gzl_mzrs_mz)+SUM(gzl_mzrs_jz) AS split_visits,
      SUM(zz_zsr_qy_mjzsr) AS revenue,
      SUM(zz_zsr_mz_ypsr) AS drug_revenue, SUM(zz_zsr_mz_hcsr) AS consumable_revenue,
      SUM(zz_zsr_mz_jcjysr) AS examination_revenue, SUM(zz_zsr_mz_ylfwsr) AS service_revenue,
      SUM(zz_zsr_mz_ypsr)+SUM(zz_zsr_mz_hcsr)+SUM(zz_zsr_mz_jcjysr)+SUM(zz_zsr_mz_ylfwsr) AS four_part_revenue
    FROM ads.ads_hospital_indicator_all_col
    WHERE year_code IN ('2025','2026') AND (year_code < '2026' OR month_code <= '08')
    GROUP BY year_code, month_code ORDER BY year_code, month_code`)
  const compositionChecks = monthlyComposition.rows.map(row => ({ month: `${row.year_code}-${row.month_code}`,
    visitsMatch: row.visits != null && row.split_visits != null && Number(row.visits) === Number(row.split_visits),
    revenueMatch: row.revenue != null && row.four_part_revenue != null && Math.abs(Number(row.revenue) - Number(row.four_part_revenue)) < 0.01 }))
  if (process.argv.includes('--export-composition')) {
    const baseline = JSON.parse(await readFile(new URL('hospital-overview-snapshot.json', dataRoot), 'utf8'))
    const expectedMonths = baseline.hospital.map(row => row.month)
    if (compositionChecks.length !== expectedMonths.length || compositionChecks.some((check, index) =>
      check.month !== expectedMonths[index] || !check.visitsMatch || !check.revenueMatch ||
      Number(monthlyComposition.rows[index].visits) !== Number(baseline.hospital[index].outpatient_visits) ||
      Math.abs(Number(monthlyComposition.rows[index].revenue) - Number(baseline.hospital[index].outpatient_revenue)) >= 0.01)) {
      throw new Error('门诊构成与院级快照或逐月合计不一致，拒绝导出')
    }
    const rows = monthlyComposition.rows.map(row => ({ month: `${row.year_code}-${row.month_code}`,
      outpatientVisits: Number(row.outpatient_visits), emergencyVisits: Number(row.emergency_visits),
      drugRevenue: Number(row.drug_revenue), consumableRevenue: Number(row.consumable_revenue),
      examinationRevenue: Number(row.examination_revenue), serviceRevenue: Number(row.service_revenue) }))
    await writeFile(new URL('outpatient-composition-snapshot.json', dataRoot), `${JSON.stringify({ version: 1, database: 'bd_odr', readOnly: true, observedAt: new Date().toISOString(), source: 'ads.ads_hospital_indicator_all_col', coverage: '2025-01—2026-08', rows }, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ exported: rows.length, months: [rows[0].month, rows.at(-1).month], readOnly: true }))
  }
  if (process.argv.includes('--export-departments')) {
    const baseline = JSON.parse(await readFile(new URL('hospital-overview-snapshot.json', dataRoot), 'utf8'))
    const result = await client.query(`SELECT year_code, month_code, company_code, dept_code, hospital_area_code,
        MAX(dept_name) AS dept_name, MAX(hospital_area_name) AS hospital_area_name,
        SUM(gzl_mzrs) AS visits, SUM(zz_zsr_qy_mjzsr) AS revenue
      FROM ads.ads_dept_indicator_all_col
      WHERE year_code IN ('2025','2026') AND (year_code < '2026' OR month_code <= '08')
      GROUP BY year_code, month_code, company_code, dept_code, hospital_area_code
      ORDER BY year_code, month_code, company_code, dept_code, hospital_area_code`)
    const rows = result.rows.map(row => ({ month: `${row.year_code}-${row.month_code}`,
      companyCode: row.company_code || '', deptCode: row.dept_code || '', deptName: row.dept_code ? row.dept_name || '未命名科室' : '未归属科室',
      hospitalAreaCode: row.hospital_area_code || '', hospitalAreaName: row.hospital_area_name || '未标注院区',
      visits: Number(row.visits), revenue: Number(row.revenue) }))
    if (baseline.hospital.some(month => {
      const group = rows.filter(row => row.month === month.month)
      return !group.length || group.some(row => !Number.isFinite(row.visits) || !Number.isFinite(row.revenue)) ||
        group.reduce((sum,row)=>sum+row.visits,0)!==Number(month.outpatient_visits) ||
        Math.abs(group.reduce((sum,row)=>sum+row.revenue,0)-Number(month.outpatient_revenue))>=0.01
    })) throw new Error('科室汇总与院级快照不一致，拒绝导出')
    await writeFile(new URL('outpatient-department-snapshot.json', dataRoot), `${JSON.stringify({ version: 1, database: 'bd_odr', readOnly: true, observedAt: new Date().toISOString(), source: 'ads.ads_dept_indicator_all_col', coverage: '2025-01—2026-08', rows }, null, 2)}\n`, 'utf8')
    console.log(JSON.stringify({ exported: rows.length, months: baseline.hospital.length, readOnly: true, missingCodeRows: rows.filter(row => !row.deptCode).length }))
  }
  await client.query('COMMIT')
  const tables = new Map()
  for (const column of columns.rows) {
    const name = `${column.table_schema}.${column.table_name}`
    if (!tables.has(name)) tables.set(name, [])
    tables.get(name).push(column.column_name)
  }
  if (!process.argv.includes('--export-composition')&&!process.argv.includes('--export-departments')) console.log(JSON.stringify(process.argv.includes('--diagnostics')
    ? { connection: identity.rows[0], diagnostics, doctorDifference: doctorDifference.rows[0] }
    : process.argv.includes('--checks')
    ? { connection: identity.rows[0], compositionChecks }
    : process.argv.includes('--coverage')
    ? { connection: identity.rows[0], coverage, diagnostics, composition: composition.rows[0], compositionChecks }
    : { connection: identity.rows[0], tables: Object.fromEntries(tables), coverage, diagnostics, composition: composition.rows[0], compositionChecks }))
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  throw new Error(`只读核对失败：${error.code || error.message}`)
} finally {
  await client.end().catch(() => {})
}
