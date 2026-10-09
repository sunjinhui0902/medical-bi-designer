import test from 'node:test'
import assert from 'node:assert/strict'
import { performance } from 'node:perf_hooks'
import { executeOverviewDataset, getOverviewDataset } from '../server/hospital-overview.mjs'

test('department paging retains total beyond view cap, supports composite key and month changes', async () => {
 const dataset = await getOverviewDataset('local-overview:outpatient_department_rank')
 const field = name => dataset.fields.findIndex(f => f.name === name)
 const view = { dimensions: ['department_key','month','dept_name','hospital_area'].map(field), measures: [{field:field('visits'),aggregation:'sum'}], sort:[{kind:'measure',index:0,direction:'desc'}], limit:20 }
 const start=performance.now()
 const first=await executeOverviewDataset(dataset.id,{parameters:{month:'2026-08'},view,pagination:{offset:0,limit:20,includeTotal:true}})
 const second=await executeOverviewDataset(dataset.id,{parameters:{month:'2026-08'},view,pagination:{offset:20,limit:20,includeTotal:true}})
 assert.equal(first.rows.length,20);assert.ok(first.pagination.total>200)
 assert.equal(second.rows.length,20);assert.equal(second.pagination.total,first.pagination.total)
 assert.notEqual(first.rows[0].department_key,second.rows[0].department_key)
 const selected=await executeOverviewDataset(dataset.id,{parameters:{department_key:first.rows[0].department_key},view:{...view,dimensions:[field('month')],sort:[{kind:'dimension',index:0,direction:'asc'}],limit:200}})
 assert.ok(selected.rows.length>1);assert.ok(selected.rows.length<=20)
 const otherMonth=await executeOverviewDataset(dataset.id,{parameters:{month:'2025-08'},view,pagination:{offset:0,limit:20,includeTotal:true}})
 assert.ok(otherMonth.rows.every(row=>row.month==='2025-08'))
 console.log(JSON.stringify({rows:first.pagination.total,pageRows:first.rows.length,filteredMonths:selected.rows.length,elapsedMs:Math.round(performance.now()-start)}))
})
