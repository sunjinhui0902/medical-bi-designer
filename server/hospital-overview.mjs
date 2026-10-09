import { readFile, stat } from 'node:fs/promises'
const snapshotCache = new Map()
async function readSnapshot(name) {
 const file = new URL(`./.data/${name}`, import.meta.url), info = await stat(file), cached = snapshotCache.get(name)
 if(cached?.mtime === info.mtimeMs && cached?.size === info.size)return cached.value
 const value = JSON.parse(await readFile(file, 'utf8'))
 snapshotCache.set(name, { mtime: info.mtimeMs, size: info.size, value }); return value
}
import { normalizeDatasetRuntimeView, applyDatasetRuntimeView } from './query-plan.mjs'
export const overviewDefinitions = [
 ['total_revenue','总收入','元','SUM(zz_zsr)'],['medical_revenue','医疗收入','元','SUM(zz_zsr_qy_mjzsr)+SUM(zz_zsr_qy_zysr)'],['total_cost','总成本','元','SUM(zz_zcb)'],['surplus_rate','结余率','比值','(SUM(zz_zsr)-SUM(zz_zcb))/NULLIF(SUM(zz_zsr),0)'],
 ['outpatient_revenue','门诊收入','元','SUM(zz_zsr_qy_mjzsr)'],['outpatient_visits','门急诊人次','人次','SUM(gzl_mzrs)'],['outpatient_avg','门诊次均费用','人民币元','SUM(ys_zsr_qy_mzsr)/NULLIF(SUM(gzl_mzrs),0)'],['inpatient_revenue','住院收入','元','SUM(zz_zsr_qy_zysr)'],['discharges','出院人次','人次','SUM(dhhis_cyrs)'],['inpatient_avg','住院次均费用','人民币元','SUM(ys_zsr_qy_zysr)/NULLIF(SUM(dhhis_cyrs),0)'],['bed_utilization','病床使用率','比值','SUM(dhhis_zyrs)/NULLIF(SUM(cw_kf),0)']
]
const ratio=(a,b)=>a==null||b==null||Number(b)===0?null:Number(a)/Number(b)
export async function readOverviewSnapshot() {const s=await readSnapshot('hospital-overview-snapshot.json');if(!s.readOnly||s.database!=='bd_odr')throw new Error('医院证据无效');return s}
export function assembleOverview(s,month='2026-08') {
 const hospital=s.hospital.map(r=>({...r,surplus_rate:ratio(Number(r.total_revenue)-Number(r.total_cost),r.total_revenue),outpatient_avg:ratio(r.outpatient_avg_numerator,r.outpatient_visits),inpatient_avg:ratio(r.inpatient_avg_numerator,r.discharges)})),months=hospital.map(r=>r.month)
 if(!months.includes(month))throw new Error('月份没有完整本地证据')
 const metrics=overviewDefinitions.map(([metricId,label,unit,formula])=>({metricId,label,unit,source:'ads.ads_hospital_indicator_all_col',snapshotObservedAtUtc:s.observedAt,evidenceReference:'server/.data/hospital-overview-snapshot.json',sqlReference:'finereport_online_sql_manifest:fr_sql_0060/0061',limitation:`暂定本地口径：${formula}。预算暂无绑定。`,rows:hospital.map(r=>({month:r.month,value:r[metricId]==null?null:Number(r[metricId])}))}))
 return {selectedMonth:month,months,metrics,hospital,departments:s.departments,observedAt:s.observedAt,database:s.database,knowledgeRefs:s.knowledgeRefs,missing:{budget:null},limitations:s.limitations}
}
export const isOverviewId=id=>typeof id==='string'&&id.startsWith('local-overview:')
const outpatientCompositionKeys = new Set(['outpatient_visit_mix', 'outpatient_revenue_mix'])
export async function readOutpatientCompositionSnapshot() {
 const snapshot=await readSnapshot('outpatient-composition-snapshot.json')
 if(snapshot.database!=='bd_odr'||snapshot.readOnly!==true||snapshot.source!=='ads.ads_hospital_indicator_all_col'||!Array.isArray(snapshot.rows))throw new Error('门诊构成快照无效')
 return snapshot
}
export function outpatientCompositionRows(data,snapshot,key) {
 if(!outpatientCompositionKeys.has(key))throw new Error('未声明的门诊构成数据集')
 const months=data.hospital.map(row=>row.month)
 if(snapshot.rows.length!==months.length||snapshot.rows.some((row,index)=>{
  const hospital=data.hospital[index]
  if(['outpatientVisits','emergencyVisits','drugRevenue','consumableRevenue','examinationRevenue','serviceRevenue'].some(field=>row[field]==null||!Number.isFinite(Number(row[field]))))return true
  const visits=Number(row.outpatientVisits)+Number(row.emergencyVisits)
  const revenue=Number(row.drugRevenue)+Number(row.consumableRevenue)+Number(row.examinationRevenue)+Number(row.serviceRevenue)
  return row.month!==hospital.month||!Number.isFinite(visits)||!Number.isFinite(revenue)||visits!==Number(hospital.outpatient_visits)||Math.abs(revenue-Number(hospital.outpatient_revenue))>=0.01
 }))throw new Error('门诊构成未与院级快照逐月对账')
 const categories=key==='outpatient_visit_mix'?[['outpatientVisits','门诊'],['emergencyVisits','急诊']]:[['drugRevenue','药品'],['consumableRevenue','耗材'],['examinationRevenue','检查检验'],['serviceRevenue','医疗服务']]
 return snapshot.rows.flatMap(row=>categories.map(([field,category])=>({month:row.month,category,value:key==='outpatient_revenue_mix'?Number(row[field])/10000:Number(row[field])})))
}
export async function readOutpatientDepartmentSnapshot() {
 const snapshot=await readSnapshot('outpatient-department-snapshot.json')
 if(snapshot.database!=='bd_odr'||snapshot.readOnly!==true||snapshot.source!=='ads.ads_dept_indicator_all_col'||!Array.isArray(snapshot.rows))throw new Error('门诊科室快照无效')
 return snapshot
}
export function outpatientDepartmentRows(data,snapshot) {
 const months=new Set(data.hospital.map(row=>row.month)),totals=new Map()
 for(const row of snapshot.rows){
  if(!months.has(row.month)||!Number.isFinite(row.visits)||!Number.isFinite(row.revenue))throw new Error('门诊科室快照月份或数值无效')
  const total=totals.get(row.month)||{visits:0,revenue:0}
  total.visits+=row.visits;total.revenue+=row.revenue;totals.set(row.month,total)
 }
 if(data.hospital.some(row=>{const total=totals.get(row.month);return !total||total.visits!==Number(row.outpatient_visits)||Math.abs(total.revenue-Number(row.outpatient_revenue))>=0.01}))throw new Error('门诊科室未与院级快照逐月对账')
 return snapshot.rows.map(row=>({month:row.month,department_key:JSON.stringify([row.companyCode,row.deptCode,row.hospitalAreaCode,row.deptName]),company_code:row.companyCode,dept_code:row.deptCode,dept_name:row.deptName||'未命名科室',hospital_area:row.hospitalAreaName||'未归属院区',visits:row.visits,revenue:row.revenue/10000}))
}
export function overviewDatasetRows(data,key) {
 const ytd=key.match(/^outpatient_ytd_(visits|revenue|avg)$/)
 if(ytd){
  const field=ytd[1],byMonth=new Map(data.hospital.map(row=>[row.month,row]))
  const aggregate=(year,end)=>{
   const rows=Array.from({length:end},(_,i)=>byMonth.get(`${year}-${String(i+1).padStart(2,'0')}`))
   if(rows.some(row=>!row))return null
   const required=field==='visits'?['outpatient_visits']:field==='revenue'?['outpatient_revenue']:['outpatient_avg_numerator','outpatient_visits']
   if(rows.some(row=>required.some(name=>row[name]==null||!Number.isFinite(Number(row[name])))))return null
   const sum=name=>rows.reduce((total,row)=>total+Number(row[name]),0)
   return field==='visits'?sum('outpatient_visits'):field==='revenue'?sum('outpatient_revenue')/10000:ratio(sum('outpatient_avg_numerator'),sum('outpatient_visits'))
  }
  return data.hospital.map(row=>{const year=Number(row.month.slice(0,4)),end=Number(row.month.slice(5));return {month:row.month,value:aggregate(year,end),prior_value:aggregate(year-1,end)}})
 }
 if(key==='outpatient_insights')return data.hospital.flatMap(row=>[['outpatient_visits','门急诊人次','人次'],['outpatient_revenue','门诊收入','万元'],['outpatient_avg','门诊次均费用','元']].map(([field,metric,unit])=>{const previous=data.hospital.find(item=>item.month===`${Number(row.month.slice(0,4))-1}${row.month.slice(4)}`);const scale=value=>value==null?null:field==='outpatient_revenue'?Number(value)/10000:Number(value);const current=scale(row[field]),prior=scale(previous?.[field]),yoy_percent=current==null||prior==null||prior===0?null:(current/prior-1)*100;return {month:row.month,metric,unit,current,prior,yoy_percent,signal:current==null?'当前指标缺失':prior==null?'缺去年同期':prior===0?'去年同期为 0，无法计算同比':Math.abs(yoy_percent)>=10?`同比变化超过±10%（${yoy_percent>0?'上升':'下降'}）`:'未达±10%提示阈值',source:'bd_odr ADS只读快照'}}))
 const range=key.match(/^medical_revenue:(20\d{2}-(?:0[1-9]|1[0-2])):(20\d{2}-(?:0[1-9]|1[0-2]))$/)
 if(range){if(range[1]>range[2])throw Object.assign(new Error('趋势月份范围无效'),{status:400});return overviewDatasetRows(data,'medical_revenue').filter(r=>r.month>=range[1]&&r.month<=range[2])}
 const m=data.metrics.find(m=>m.metricId===key)
 if(m)return m.rows.map(r=>{const prior=m.rows.find(p=>p.month===`${Number(r.month.slice(0,4))-1}${r.month.slice(4)}`);const scale=v=>v==null?null:m.unit==='元'?v/10000:m.unit==='比值'?v*100:v;return {month:r.month,value:scale(r.value),...(['outpatient_revenue','outpatient_visits','outpatient_avg'].includes(key)?{prior_value:scale(prior?.value)}:{})}})
 const groups=key==='composition'?[['drug','药品收入'],['consumable','耗材收入'],['examination','检查检验'],['service','医疗服务']]:key==='service_composition'?[['bed_income','床位'],['nursing','护理'],['surgery','手术'],['treatment','治疗'],['other_service','其他服务']]:key==='cost_structure'?[['personnel','人员经费'],['drugs_cost','药品费'],['materials_cost','卫生材料'],['depreciation','折旧'],['amortization','摊销'],['risk_fund','医疗风险基金'],['other_cost','其他费用']]:null
 if(groups)return data.hospital.flatMap(r=>groups.map(([field,category])=>({month:r.month,category,value:r[field]==null?null:Number(r[field])/10000})))
 if(key==='departments')return data.departments.map(r=>({month:r.month,dept_name:r.dept_name||'未命名科室',value:r.revenue==null?null:Number(r.revenue)/10000}))
 if(key==='beds')return data.departments.filter(r=>Number(r.beds)>0&&r.turnover!=null&&r.utilization!=null).map(r=>({month:r.month,dept_name:r.dept_name||'未命名科室',x:Number(r.turnover),y:Number(r.utilization)}))
 throw Object.assign(new Error('未声明的医院概览数据集'),{status:404})
}
export async function getOverviewDataset(id) {
 const key=id.slice(15),data=assembleOverview(await readOverviewSnapshot()),composition=outpatientCompositionKeys.has(key)?await readOutpatientCompositionSnapshot():null,department=key==='outpatient_department_rank'?await readOutpatientDepartmentSnapshot():null,rows=composition?outpatientCompositionRows(data,composition,key):department?outpatientDepartmentRows(data,department):overviewDatasetRows(data,key),m=data.metrics.find(m=>m.metricId===key.split(':')[0]),names=rows[0]?Object.keys(rows[0]):['month','value']
 return {id,version:2,code:id,name:m?.label||key,status:'validated',category:'本地医院概览',dataSourceId:'local-evidence',readOnly:true,sql:'',notes:`bd_odr ADS只读快照 ${composition?.observedAt||department?.observedAt||data.observedAt}`,fields:names.map(name=>({name,label:name,type:['value','prior_value','x','y','current','prior','yoy_percent','visits','revenue'].includes(name)?'number':'string',dataType:['value','prior_value','x','y','current','prior','yoy_percent','visits','revenue'].includes(name)?'number':'string',role:['value','prior_value','x','y','current','prior','yoy_percent','visits','revenue'].includes(name)?'measure':'dimension',...(name==='value'?{unit:key==='outpatient_visit_mix'||key.includes('ytd_visits')?'人次':key.includes('ytd_avg')?'元':m?.unit==='元'?'万元':m?.unit==='比值'?'%':m?.unit||'万元'}:{})})),parameters:['month',...(department?['department_key']:[])].map(code=>({id:code,code,name:code==='month'?'月份':'科室组合键',type:'string',required:false,sqlName:code,operator:'eq',emptyPolicy:'omit'}))}
}
export async function executeOverviewDataset(id,request={}) {
 const dataset=await getOverviewDataset(id),data=assembleOverview(await readOverviewSnapshot()),parameters=request.parameters||{}
 if(Object.keys(parameters).some(k=>!['month','department_key'].includes(k))||(parameters.month&&!data.months.includes(parameters.month))||(parameters.department_key && (typeof parameters.department_key!=='string'||parameters.department_key.length>1000)))throw Object.assign(new Error('概览筛选参数无效'),{status:400})
 const key=id.slice(15),composition=outpatientCompositionKeys.has(key)?await readOutpatientCompositionSnapshot():null,department=key==='outpatient_department_rank'?await readOutpatientDepartmentSnapshot():null
 let rows=(composition?outpatientCompositionRows(data,composition,key):department?outpatientDepartmentRows(data,department):overviewDatasetRows(data,key)).filter(r=>(!parameters.month||r.month===parameters.month)&&(!parameters.department_key||r.department_key===parameters.department_key))
 if(department)rows.sort((a,b)=>b.visits-a.visits||String(a.dept_name).localeCompare(String(b.dept_name),'zh-CN'))
 const view=normalizeDatasetRuntimeView(dataset,request.view,request.limit||200);if(view)rows=applyDatasetRuntimeView(rows,view,request.pagination?Number.MAX_SAFE_INTEGER:view.limit)
 const total=rows.length,limit=Math.min(2000,Math.max(1,Number(request.pagination?.limit||request.limit||200))),offset=Math.max(0,Number(request.pagination?.offset||0));
 if(!Number.isSafeInteger(limit)||!Number.isSafeInteger(offset))throw Object.assign(new Error('分页参数无效'),{status:400})
 rows=rows.slice(offset,offset+limit)
 return {rows,fields:dataset.fields,rowCount:rows.length,source:'local-overview-evidence',dataOrigin:'bd_odr_readonly_ads_snapshot',...(request.pagination?{pagination:{...request.pagination,...(request.pagination.includeTotal?{total}:{})}}:{})}
}
