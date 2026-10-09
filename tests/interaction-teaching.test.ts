import test from 'node:test'
import assert from 'node:assert/strict'
import { createInteractionTeachingDraft } from '../src/services/interactionTeachingDraft.ts'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import { createDashboardWorkspaceV3, upsertDashboardApplicationInWorkspaceV3 } from '../src/services/dashboardWorkspaceV3.ts'
import { createDesignerEventRuntimeV3 } from '../src/services/designerEventRuntimeV3.ts'
import { ParameterRuntimeStoreV3 } from '../src/services/parameterRuntimeV3.ts'
import type { LocalDashboardPlan } from '../src/services/localDashboardDraft.ts'
const plan: LocalDashboardPlan = { request:'测试',from:'2026-01',to:'2026-08',comparison:'none',warnings:[],metrics:[{request:'测试',month:'2026-08',comparison:'none',scope:'deidentified_local_validation',queryExecution:'verified_read_only_evidence_snapshot',metric:{id:'income',label:'收入',unit:'元',source:'local',limitation:'暂定',sqlReference:'local.sql',evidenceReference:'local.json'},result:{value:100,comparisonPercent:null,comparisonAvailable:false},snapshotObservedAtUtc:'2026-09-29',datasetId:'local-series:dashboard_outpatient_revenue:2026-01:2026-08',displayUnit:'万元',series:[{month:'2026-01',value:100},{month:'2026-08',value:200}]}] }
test('one-click teaching draft preserves existing workspace and declares all four native interactions',()=>{
 const app=createInteractionTeachingDraft(plan,'demo'), old=createDefaultDashboardApplicationV3()
 const w=upsertDashboardApplicationInWorkspaceV3(createDashboardWorkspaceV3(old),app,true)
 assert.deepEqual(w.dashboards[0],old); assert.equal(w.dashboards.length,2)
 assert.equal(app.pages[0]!.controls[0]!.interaction.submitMode,'immediate')
 const actions=app.pages.flatMap(p=>p.components.flatMap(c=>c.events?.flatMap(e=>e.actions)||[])).map(a=>a.type)
 assert.ok(actions.includes('applyLinkage')&&actions.includes('navigatePage')&&actions.includes('drillDown'))
 assert.equal(app.drillPaths![0]!.levels.length,2)
 assert.throws(()=>createInteractionTeachingDraft({...plan,metrics:[]}),/至少需要/)
})
test('native runtime actually links, clears, navigates, drills two levels and returns',async()=>{
 const app=createInteractionTeachingDraft(plan,'demo'), store=new ParameterRuntimeStoreV3(app.parameters)
 const runtime=createDesignerEventRuntimeV3({application:app,parameters:store,queryRuntime:{describe(component){return {component,componentId:component.id,datasetId:component.dataConfig.datasetId,parameters:{},limit:200,queryKey:component.id}},async execute(descriptor){return {queryKey:descriptor.queryKey,source:'network'}}}})
 const link=await runtime.triggerComponentRowClick!(app.pages[0]!.id,'demo-source',{month:'2026-01',value:100})
 assert.equal(link?.status,'completed',JSON.stringify(link)); assert.equal(store.get('demo-month'),'2026-01')
 await runtime.clearLinkage(); assert.equal(store.get('demo-month'),'2026-08')
 await runtime.triggerComponentClick(app.pages[0]!.id,'demo-jump'); assert.equal(runtime.interactionSnapshot().activePageId,'demo-detail')
 runtime.pageBack()
 await runtime.triggerComponentRowClick!(app.pages[0]!.id,'demo-drill',{month:'2026-01',value:100})
 const down=await runtime.triggerComponentRowClick!('demo-detail','demo-detail-table',{month:'2026-01',value:100})
 assert.equal(down?.status,'completed',JSON.stringify(down)); assert.equal(store.get('demo-value'),100)
 assert.equal(runtime.interactionSnapshot().drills[0]!.frames.length,2)
 await runtime.drillBack('demo-path'); await runtime.drillBack('demo-path')
 assert.equal(runtime.interactionSnapshot().drills.length,0); runtime.cancel()
})
