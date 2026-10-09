import test from 'node:test'
import assert from 'node:assert/strict'
import {overviewDatasetRows,getOverviewDataset,executeOverviewDataset} from '../server/hospital-overview.mjs'
test('hospital revenue trend range excludes other years without changing monetary conversion',()=>{
 const data={metrics:[{metricId:'medical_revenue',unit:'元',rows:[{month:'2025-12',value:10000},{month:'2026-01',value:20000},{month:'2026-08',value:null},{month:'2026-09',value:30000}]}]}
 assert.deepEqual(overviewDatasetRows(data,'medical_revenue:2026-01:2026-08'),[{month:'2026-01',value:2},{month:'2026-08',value:null}])
 assert.throws(()=>overviewDatasetRows(data,'medical_revenue:2026-08:2026-01'),/范围无效/)
 assert.throws(()=>overviewDatasetRows(data,'medical_revenue:2026-13:2026-08'),/未声明/)
 assert.equal(overviewDatasetRows(data,'medical_revenue').length,4)
})
test('bounded hospital dataset metadata and actual readonly execution retain units and eight months',async()=>{
 const id='local-overview:medical_revenue:2026-01:2026-08',dataset=await getOverviewDataset(id),result=await executeOverviewDataset(id)
 assert.equal(dataset.fields.find(f=>f.name==='value').unit,'万元');assert.equal(dataset.name,'医疗收入');assert.equal(dataset.readOnly,true)
 assert.equal(result.rows.length,8);assert.equal(result.rows[0].month,'2026-01');assert.equal(result.rows.at(-1).month,'2026-08')
 assert.ok(result.rows.every(r=>r.month.startsWith('2026-')))
})
