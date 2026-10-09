import test from 'node:test'
import assert from 'node:assert/strict'
import { tableDisplayPolicyV3, tableQueryScopeV3 } from '../src/services/tableDisplayPolicyV3.ts'
import { createOutpatientOperationsDraft } from '../src/services/outpatientOperationsDraft.ts'
const app=createOutpatientOperationsDraft({schemaVersion:1,template:'hospital-overview',title:'test',month:'2026-08',comparison:'yoy',sections:['operations','trend'],notes:''},['2025-08','2026-08'],'fixture',{month:'2026-08',observedAt:'fixture',departmentCount:8,doctorCount:80},'test')
test('directory scope ignores doctor/department selection while resetting for month or explicit refresh',()=>{
 const table=app.pages[4]!.components.find(c=>c.type==='table')!,month=app.parameters[0]!.id
 const first=tableQueryScopeV3(table,{[month]:'2026-08',unrelated:'a'})
 assert.equal(first,tableQueryScopeV3(table,{[month]:'2026-08',unrelated:'b'}))
 assert.notEqual(first,tableQueryScopeV3(table,{[month]:'2025-08'}))
 assert.notEqual(first,tableQueryScopeV3(table,{[month]:'2026-08'},1))
})
test('disabled-pagination large tables use bounded display without changing saved configuration',()=>{
 const table=structuredClone(app.pages[4]!.components.find(c=>c.type==='table')!)
 table.tableConfig!.pagination={enabled:false,mode:'client',pageSize:9999,showTotal:true}
 const before=structuredClone(table)
 assert.deepEqual(tableDisplayPolicyV3(table,100000),{enabled:true,pageSize:200,protectedLargeTable:true})
 assert.equal(tableDisplayPolicyV3(table,3).enabled,false)
 assert.deepEqual(table,before)
})
