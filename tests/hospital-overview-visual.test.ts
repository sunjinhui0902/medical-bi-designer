import test from 'node:test'
import assert from 'node:assert/strict'
import { createHospitalOverviewDraft, type HospitalModelPlan } from '../src/services/hospitalOverviewDraft.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'
const plan: HospitalModelPlan={schemaVersion:1,template:'hospital-overview',title:'医院概览',month:'2026-08',comparison:'yoy',sections:['summary','operations','trend','departments','composition','beds','costs'],notes:'预算保持空值'}
test('hospital visual template keeps editable native data binding, provenance and parameter declarations',()=>{
 const original=structuredClone(plan),app=createHospitalOverviewDraft(plan,['2026-07','2026-08'],'fixture','qwen'),page=app.pages[0]!
 assert.equal(validateDashboardApplicationV3(app).valid,true);assert.deepEqual(plan,original);assert.equal(page.canvas.showGrid,false)
 assert.equal(page.components.filter(c=>c.type==='kpi').length,11);assert.equal(page.components.filter(c=>['line','bar','pie','scatter'].includes(c.type)).length,5)
 assert.ok(page.components.filter(c=>c.type==='kpi').every(c=>c.dataConfig.parameterBindings.length===1&&c.kpiConfig?.targetMode==='field'&&!c.kpiConfig.showProgress))
 assert.equal(page.components.find(c=>c.type==='line')!.dataConfig.datasetId,'local-overview:medical_revenue:2026-01:2026-08')
 assert.equal(page.components.find(c=>c.dataConfig.datasetId==='local-overview:outpatient_visits')!.kpiConfig?.decimals,0)
 assert.equal(page.components.find(c=>c.dataConfig.datasetId==='local-overview:inpatient_avg')!.kpiConfig?.unit,'元')
 assert.deepEqual(app.extensionRefs.localGeneration,{provider:'qwen',requestId:'fixture',plan:original,dataMode:'bd_odr_readonly_ads_snapshot',visualTemplate:'hospital-overview-blue-v2'})
 for(const c of page.components){assert.ok(c.position.x>=0&&c.position.y>=0&&c.position.x+c.position.width<=page.canvas.width&&c.position.y+c.position.height<=page.canvas.height);assert.ok(!c.dataConfig.measures.some(m=>m.alias==='value'))}
 for(let i=0;i<page.components.length;i++)for(let j=i+1;j<page.components.length;j++){const a=page.components[i]!.position,b=page.components[j]!.position;assert.ok(!(a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y),'components must not overlap')}
})
test('partial model plans keep only requested regions and explicit labels',()=>{
 const app=createHospitalOverviewDraft({...plan,sections:['summary','trend']},['2026-08'],'fixture'),page=app.pages[0]!
 assert.equal(page.components.filter(c=>c.type==='kpi').length,4);assert.equal(page.components.filter(c=>c.type==='pie'||c.type==='table'||c.type==='scatter').length,0)
 assert.ok(page.components.filter(c=>c.type==='text').some(c=>c.textConfig?.content.includes('预算暂无数据')))
 assert.equal(validateDashboardApplicationV3(app).valid,true)
})
