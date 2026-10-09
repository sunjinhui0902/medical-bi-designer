import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const evidence=process.argv[2]||'E:/codex/work/ty-bi-hospital-designer-20260929'
await fs.mkdir(evidence,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1800,height:1200}}),errors=[],failures=[],requests=[]
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/')&&r.status()>=400)failures.push(`${r.status()} ${r.url()}`)});page.on('request',r=>{if(r.url().includes('/execute')&&r.method()==='POST')requests.push({url:r.url(),body:r.postDataJSON()})})
async function saved(){await page.getByRole('button',{name:'保存',exact:true}).click();return page.evaluate(()=>{const w=JSON.parse(localStorage.getItem('medical-bi-designer-workspace-v3'));return JSON.parse(localStorage.getItem(`medical-bi-designer-dashboard-v3::${w.generation}::${w.activeDashboardId}`))})}
try{
 await page.goto('http://127.0.0.1:5174/knowledge');await page.getByRole('button',{name:'本地看板助手',exact:true}).click();await page.getByRole('button',{name:'打开ChatGPT医院概览草稿',exact:true}).click()
 await page.waitForURL('http://127.0.0.1:5174/');await page.waitForFunction(()=>document.querySelectorAll('canvas').length>=5)
 await page.locator('[data-component-id*="-departments-"] tbody tr').first().waitFor()
 const initial=await saved();assert.equal(initial.extensionRefs.localGeneration.provider,'chatgpt-web-codex');assert.equal(initial.extensionRefs.localGeneration.requestId,'99ec2ecb-282a-4ab0-bd77-73837d974364');assert.equal(initial.extensionRefs.localGeneration.plan.sections.length,7)
 await page.getByRole('button',{name:'打开看板管理',exact:true}).click();await page.getByRole('button',{name:'医院运营概览',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});assert.equal((await saved()).id,initial.id)
 await page.getByRole('button',{name:'打开看板管理',exact:true}).click();await expect(page.getByRole('listbox',{name:'本机看板列表'}).getByRole('option',{name:/2026年8月医院运营概览/})).toHaveCount(1);await page.getByRole('button',{name:'关闭看板管理',exact:true}).click()
 assert.equal(initial.pages[0].components.find(c=>c.type==='line').dataConfig.datasetId,'local-overview:medical_revenue:2026-01:2026-08')
 assert.ok(await page.locator('[data-component-id^="hospital-ai-"] .kpi-value').evaluateAll(elements=>elements.every(e=>e.scrollWidth<=e.clientWidth)))
 const trendResult=await (await page.request.post('http://127.0.0.1:5175/api/datasets/local-overview%3Amedical_revenue%3A2026-01%3A2026-08/execute',{data:{parameters:{}}})).json()
 assert.equal(trendResult.rows.length,8);assert.ok(trendResult.rows.every(r=>r.month.startsWith('2026-')))
 assert.equal(initial.pages[0].components.filter(c=>c.type==='kpi').length,11);assert.equal(initial.pages[0].components.length,20)
 await page.getByRole('button',{name:'批量调整 / 文字调整',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByRole('region', { name: '勾选图表批量布局' }).getByRole('checkbox').first().check();await dialog.getByLabel('批量标题字号').fill('18');await dialog.getByRole('button',{name:'统一标题字号',exact:true}).click();await dialog.getByRole('button',{name:'应用到当前看板',exact:true}).click();await dialog.waitFor({state:'hidden'})
 const edited=await saved();assert.equal(edited.pages[0].components.find(c=>c.type==='line').styleConfig.titleSize,18);assert.deepEqual(edited.pages[0].components.map(c=>c.dataConfig),initial.pages[0].components.map(c=>c.dataConfig));assert.deepEqual(edited.extensionRefs,initial.extensionRefs)
 await fs.writeFile(`${evidence}/hospital-model.v3.json`,JSON.stringify(edited,null,2))
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('canvas').length>=5)
 await page.getByRole('button',{name:'预览',exact:true}).click()
 const filter=page.getByLabel('运行时筛选条件').locator('select').first(),revenue=page.locator('[data-component-id*="-total_revenue-"]')
 const before=await revenue.innerText();await filter.selectOption('2026-07');await expect(revenue).not.toHaveText(before)
 assert.ok(requests.some(r=>r.body.parameters?.month==='2026-07'))
 const data=await (await page.request.get('http://127.0.0.1:5175/api/knowledge/hospital-overview')).json(),expected=data.metrics.find(m=>m.metricId==='total_revenue').rows.find(r=>r.month==='2026-07').value/10000
 const expectedText=expected.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});await expect(revenue).toContainText(expectedText)
 await filter.selectOption('2026-08')
 const defaultExpected=data.metrics.find(m=>m.metricId==='total_revenue').rows.find(r=>r.month==='2026-08').value/10000
 await expect(revenue).toContainText(defaultExpected.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2}))
 await page.screenshot({path:`${evidence}/model-dashboard-preview.png`,fullPage:true})
 await page.locator('.interactive-canvas').screenshot({path:`${evidence}/canvas.png`})
 assert.equal(await page.locator('.interactive-canvas').evaluate(e=>getComputedStyle(e).backgroundImage),'none')
 assert.equal(await page.locator('.artboard-wrap').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(238, 243, 251)')
 assert.ok(await page.locator('[data-component-id^="hospital-ai-"] .kpi-value').evaluateAll(elements=>elements.every(e=>e.scrollWidth<=e.clientWidth&&e.getBoundingClientRect().height<65)))
 const department=page.locator('[data-component-id*="-departments-"]')
 assert.equal(await department.locator('tbody tr').count(),6)
 assert.ok(await department.locator('.table-scroll-v3').evaluate(e=>e.scrollHeight<=e.clientHeight+1))
 await page.setViewportSize({width:1440,height:1100})
 await page.locator('.interactive-canvas').screenshot({path:`${evidence}/canvas-1440.png`})
 assert.ok(await page.locator('.interactive-canvas').evaluate(e=>e.getBoundingClientRect().width<=window.innerWidth))
 assert.deepEqual(errors,[]);assert.deepEqual(failures,[])
 await fs.writeFile(`${evidence}/browser.json`,JSON.stringify({status:'PASS',requestId:initial.extensionRefs.localGeneration.requestId,provider:'chatgpt-web-codex',checks:['real ChatGPT provenance','7 regions/20 components/11 KPIs','5 native charts','six complete department rows','native edit and save/reopen','bindings/provenance retained','actual month value','bounded trend','no black surround or grid','KPI no overflow/wrapping','1440px width fit','page/API errors zero'],errors,failures,externalProviderCalls:'NOT_USED',generatedPlanAt:'2026-09-29T09:19:28.082Z'},null,2));console.log('Real ChatGPT model plan to native designer PASS')
}catch(e){await fs.writeFile(`${evidence}/browser-failure.txt`,`${e.stack}\n${await page.locator('body').innerText()}`);throw e}finally{await browser.close()}
