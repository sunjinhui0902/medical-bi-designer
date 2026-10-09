import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import { previewLocalDashboardBatchStyle, assertLocalEditCurrent, type LocalBatchStyle } from '../src/services/localDashboardEdit.ts'
function fixture() {
 const app=createDefaultDashboardApplicationV3(),page=app.pages[0]!
 const chart={id:'a',type:'line' as const,title:'医疗收入趋势',position:{x:24,y:24,width:200,height:150,zIndex:1},styleConfig:{background:'#FFFFFF',titleSize:16,titleColor:'#243447'},dataConfig:{version:3 as const,sourceKind:'server' as const,datasetId:'local-series:income:2026-01:2026-08',dimensions:[],measures:[],filters:[],sort:[],limit:200,parameterBindings:[],refreshPolicy:'manual' as const}}
 page.components=[chart,{...structuredClone(chart),id:'b',title:'出院人数趋势'},{...structuredClone(chart),id:'unselected'},{...structuredClone(chart),id:'nested'}]
 page.components.push({...structuredClone(chart),id:'tabs',type:'tabs',tabsConfig:{items:[{id:'item',label:'页签',value:'item',componentIds:['nested'],visible:true,padding:8,gap:8,background:'#fff'}],activeItemId:'item',alignment:'left',titlePosition:'top',stylePreset:'default',titleSize:38}})
 const other=structuredClone(page);other.id='other';other.code='other';other.order=2;other.components=[];app.pages.push(other)
 app.extensionRefs.localGeneration={provider:'compatible',requestId:'fixture'}
 return app
}
test('batch styles preserve complete input, titles, bindings, unselected/nested components and other pages',()=>{
 for(const style of [{field:'titleSize',value:24},{field:'titleColor',value:'#2367A3'},{field:'background',value:'#EAF3FF'}] as LocalBatchStyle[]){
  const app=fixture(),original=structuredClone(app),edit=previewLocalDashboardBatchStyle(app,app.pages[0]!.id,'',['a','b'],style),expected=structuredClone(app)
  for(const c of expected.pages[0]!.components.slice(0,2))Object.assign(c.styleConfig,{[style.field]:style.value})
  assert.deepEqual(app,original);assert.deepEqual(edit.before,original);assert.deepEqual(edit.after,expected);assert.equal(edit.changes.length,2)
  assertLocalEditCurrent(app,edit.before);assertLocalEditCurrent(edit.after,edit.after)
  const stale=structuredClone(edit.after);stale.name='later change';assert.throws(()=>assertLocalEditCurrent(stale,edit.after),/发生变化/)
 }
})
test('batch styles allow a single explicit chart and reject stale/empty/duplicate/nested selections atomically',()=>{
 const app=fixture(),original=structuredClone(app),style:LocalBatchStyle={field:'titleSize',value:20}
 assert.equal(previewLocalDashboardBatchStyle(app,app.pages[0]!.id,'',['b'],style).changes.length,1)
 for(const ids of [[],['a','a'],['missing'],['nested'],['tabs']])assert.throws(()=>previewLocalDashboardBatchStyle(app,app.pages[0]!.id,'',ids,style),/勾选/)
 assert.throws(()=>previewLocalDashboardBatchStyle(app,'missing','',['a'],style),/页面不存在/)
 assert.deepEqual(app,original)
})
test('invalid styles and unchanged values are rejected without modifying the input',()=>{
 const app=fixture(),original=structuredClone(app)
 for(const style of [{field:'titleSize',value:7},{field:'titleSize',value:49},{field:'titleSize',value:20.5},{field:'titleSize',value:NaN},{field:'titleColor',value:'red'},{field:'background',value:'#fff'},{field:'title',value:'覆盖名称'}])assert.throws(()=>previewLocalDashboardBatchStyle(app,app.pages[0]!.id,'',['a'],style as LocalBatchStyle))
 assert.throws(()=>previewLocalDashboardBatchStyle(app,app.pages[0]!.id,'',['a'],{field:'titleSize',value:16}),/无需调整/)
 assert.deepEqual(app,original)
})
