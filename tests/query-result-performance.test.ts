import test from 'node:test'
import assert from 'node:assert/strict'
import { buildComponentDataView } from '../src/services/queryResult.ts'
import type { ComponentDataConfig } from '../src/models/dashboard.ts'
test('series uses existing category groups rather than rescanning the full result for each category',()=>{
 let reads=0
 const rows=Array.from({length:1000},(_,i)=>({get department(){reads++;return `d${i}`},visits:i}))
 const config: ComponentDataConfig={version:3,sourceKind:'server',datasetId:'fixture',dimensions:[{field:'department',role:'category'}],measures:[{field:'visits',aggregation:'sum'}],filters:[],sort:[],limit:1000,parameterBindings:[],refreshPolicy:'manual'}
 const view=buildComponentDataView(rows,config)
 assert.equal(view.series[0]!.values.length,1000);assert.equal(view.series[0]!.values[999],999)
 assert.ok(reads<10000,`类别字段读取次数 ${reads}`)
 const table=buildComponentDataView(rows,config,false)
 assert.deepEqual(table.rows,view.rows);assert.deepEqual(table.series,[])
})
