import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
const browser=await chromium.launch({headless:true})
try{
 const page=await browser.newPage({viewport:{width:1500,height:1000}}),errors=[],captures=[]
 page.on('pageerror',e=>errors.push(e.message))
 await page.goto('http://127.0.0.1:5174/')
 await page.getByRole('button',{name:'提示词样例',exact:true}).click()
 await page.getByRole('button',{name:'填入输出示例（非模型生成）'}).click()
 await page.getByRole('button',{name:'校验并添加到设计器'}).click()
 await page.getByRole('button',{name:'保存',exact:true}).click()
 await page.evaluate(()=>{const w=JSON.parse(localStorage.getItem('medical-bi-designer-workspace-v3')),key=`medical-bi-designer-dashboard-v3::${w.generation}::${w.activeDashboardId}`,app=JSON.parse(localStorage.getItem(key));const table=app.pages[4].components.find(c=>c.type==='table');table.tableConfig.pagination.enabled=false;app.defaultPageId=app.pages[4].id;localStorage.setItem(key,JSON.stringify(app))})
 await page.route(/\/api\/datasets\/(?:local-overview:|local-overview%3A)outpatient_department_rank\/execute/,async route=>{
  const body=route.request().postDataJSON()
  captures.push({url:route.request().url(),viewLimit:body.view?.limit,limit:body.limit,pagination:body.pagination})
  if((body.view?.limit ?? body.limit)!==2000){await route.continue();return}
  const response=await route.fetch(),base=await response.json()
  const rows=Array.from({length:10000},(_,i)=>({month:'2026-08',department_key:`synthetic-${i}`,dept_name:`合成性能夹具-${i}`,hospital_area:'合成测试',dept_code:String(i),visits:i,revenue:i/100}))
  await route.fulfill({response,json:{...base,rows,rowCount:rows.length}})
 })
 await page.reload()
 await page.getByRole('button',{name:'预览',exact:true}).click()
 const table=page.locator('article').filter({hasText:'科室目录 · 点击行查看指标与趋势'})
 await table.getByText(/数据超过 200 行/).waitFor()
 assert.equal(await table.locator('tbody tr').count(),20)
 console.log(JSON.stringify({captures}))
 await page.waitForFunction(()=>Array.from(document.querySelectorAll('article')).find(a=>a.textContent.includes('科室目录 ·'))?.textContent.includes('已加载 2000 行'))
 assert.match(await table.getByRole('button',{name:/下载明细 CSV/}).innerText(),/2000/)
 const firstRow=await table.locator('tbody tr').first().innerText()
 await table.getByRole('button',{name:'下一页',exact:true}).click()
 assert.notEqual(await table.locator('tbody tr').first().innerText(),firstRow)
 assert.equal(await table.locator('tbody tr').count(),20)
 assert.deepEqual(errors,[])
 console.log(JSON.stringify({status:'PASS',source:'synthetic browser fixture, not ODR',responseRows:10000,displayLimit:2000,renderedRows:20,nextPage:true,savedPaginationUnchanged:true}))
}finally{await browser.close()}
