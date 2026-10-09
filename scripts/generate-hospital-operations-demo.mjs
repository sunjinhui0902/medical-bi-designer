import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { assembleOverview, readOverviewSnapshot } from '../server/hospital-overview.mjs'

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, item, i, all) => {
  if (i % 2 === 0) pairs.push([item, all[i + 1]])
  return pairs
}, []))
if (Object.keys(args).some(key => !['--year', '--month', '--out'].includes(key))) throw new Error('仅支持 --year --month --out')
const year = args['--year'] || '2026', month = args['--month'] || '08'
if (!/^20\d{2}$/.test(year) || !/^(0[1-9]|1[0-2])$/.test(month)) throw new Error('年月格式无效')
const data = assembleOverview(await readOverviewSnapshot(),`${year}-${month}`)
const metrics=data.metrics,months=data.months
const prompt = await fs.readFile(path.join(project, 'docs/hospital-operations-template-prompt.md'), 'utf8')
let template = await fs.readFile(path.join(project, 'templates/hospital-operations-overview.html'), 'utf8')
const replacements={dashboard_medical_cost:'total_cost',dashboard_outpatient_revenue:'medical_revenue',dashboard_outpatient_emergency_workload:'outpatient_visits',dashboard_inpatient_discharge_workload:'discharges',dashboard_bed_utilization:'bed_utilization'}
for(const [oldId,id]of Object.entries(replacements))template=template.replaceAll(oldId,id)
template=template.replace("['门诊收入(万元)','medical_revenue']","['门诊收入(万元)','outpatient_revenue']").replace("['门诊次均费用(元)',null]","['门诊次均费用(元)','outpatient_avg']").replace("['住院收入(万元)',null]","['住院收入(万元)','inpatient_revenue']").replace("['住院次均费用(元)',null]","['住院次均费用(元)','inpatient_avg']").replaceAll('门诊收入趋势','医疗收入趋势').replaceAll("name:'门诊收入'","name:'医疗收入'").replaceAll("data:['门诊收入'","data:['医疗收入'")
const extras=await fs.readFile(path.join(project,'templates/hospital-operations-ads.js'),'utf8')
template=template.replace('</body>',`<script>${extras}</script></body>`)
const charts = await fs.readFile(path.join(project, 'node_modules/echarts/dist/echarts.min.js'), 'utf8')
const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c')
const html = template.replace('/*__ECHARTS__*/', () => charts.replace(/<\/script/gi, '<\\/script')).replace('/*__DATA__*/', () => safeJson(data)).replace('/*__PROMPT__*/', () => safeJson(prompt))
const out = path.resolve(args['--out'] || path.join(project, 'public/hospital-overview-sample.html'))
await fs.mkdir(path.dirname(out), { recursive: true })
await fs.writeFile(out, html)
console.log(JSON.stringify({ status: 'PASS', out, selectedMonth: data.selectedMonth, metrics: metrics.length, months: months.length, queryExecution: 'read_only_evidence_snapshot', missing: data.missing }))
