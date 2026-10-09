import { performance } from 'node:perf_hooks'
import { applyDatasetRuntimeView } from '../server/query-plan.mjs'
import { mkdir, writeFile } from 'node:fs/promises'
const count=100000
const rows=Array.from({length:count},(_,index)=>({department_key:`synthetic-${index}`,visits:index%500}))
const before=process.memoryUsage().heapUsed,start=performance.now()
const grouped=applyDatasetRuntimeView(rows,{dimensions:[{name:'department_key'}],measures:[{name:'visits',aggregation:'sum'}],sort:[{name:'visits',direction:'desc'}],limit:20},Number.MAX_SAFE_INTEGER)
const response={rows:grouped.slice(20000,20020),pagination:{offset:20000,limit:20,total:grouped.length}}
const result={source:'synthetic performance fixture, not ODR data',inputRows:count,returnedRows:response.rows.length,total:response.pagination.total,responseBytes:Buffer.byteLength(JSON.stringify(response)),aggregationAndSortMs:Math.round(performance.now()-start),heapDeltaMB:Number(((process.memoryUsage().heapUsed-before)/1024/1024).toFixed(1)),limitation:'In-memory snapshot grouping is still O(n); this is not a database, concurrency or mobile-device load test.'}
await mkdir('E:/codex/work/tybi-functional-performance-20261008',{recursive:true})
await writeFile('E:/codex/work/tybi-functional-performance-20261008/synthetic-performance.json',JSON.stringify(result,null,2))
console.log(JSON.stringify(result))
