import { chromium, expect } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const evidence='E:/codex/work/ty-bi-batch-style-20260929'
await fs.mkdir(evidence,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1800,height:1200}}),errors=[]
page.on('pageerror',e=>errors.push(e.message))
const comparable=a=>{const c=structuredClone(a);delete c.updatedAt;return c}
async function saved(){await page.getByRole('button',{name:'保存',exact:true}).click();return page.evaluate(()=>{const w=JSON.parse(localStorage.getItem('medical-bi-designer-workspace-v3'));return {...w,dashboards:w.dashboards.map(d=>JSON.parse(localStorage.getItem(`medical-bi-designer-dashboard-v3::${w.generation}::${d.id}`)))}})}
const active=w=>w.dashboards.find(d=>d.id===w.activeDashboardId)
async function open(){await page.getByRole('button',{name:'批量调整 / 文字调整',exact:true}).click();return page.getByRole('dialog')}
async function apply(){await page.getByRole('button',{name:'应用到当前看板',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'})}
try{
 await page.goto('http://127.0.0.1:5174/knowledge');await page.getByRole('button',{name:'本地看板助手',exact:true}).click()
 await page.getByRole('textbox',{name:'经营分析问题'}).fill('2026年1月至8月门诊收入、医疗成本、出院人次趋势同比')
 await page.getByRole('button',{name:'生成草稿预览',exact:true}).click();await page.getByRole('button',{name:'添加到设计器继续编辑',exact:true}).click()
 await page.waitForURL('http://127.0.0.1:5174/');await page.waitForFunction(()=>document.querySelectorAll('canvas').length>=3)
 const original=await saved(),expected=comparable(active(original))
 let dialog=await open();await dialog.getByRole('button',{name:'统一标题字号',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('选择不能为空')
 await dialog.getByRole('region', { name: '勾选图表批量布局' }).getByRole('checkbox').nth(0).check();await dialog.getByRole('region', { name: '勾选图表批量布局' }).getByRole('checkbox').nth(1).check()
 await dialog.getByLabel('批量标题字号').fill('49');await dialog.getByRole('button',{name:'统一标题字号',exact:true}).click();await expect(dialog.getByRole('alert')).toContainText('8至48')
 await dialog.getByLabel('批量标题字号').fill('24');await dialog.getByRole('button',{name:'统一标题字号',exact:true}).click()
 await expect(dialog.getByRole('button',{name:'应用到当前看板',exact:true})).toHaveCount(1)
 await dialog.getByLabel('批量标题字号').fill('25');await expect(dialog.getByRole('button',{name:'应用到当前看板',exact:true})).toHaveCount(0)
 await dialog.getByLabel('批量标题字号').fill('24');await dialog.getByRole('button',{name:'统一标题字号',exact:true}).click();await page.screenshot({path:`${evidence}/style-preview.png`,fullPage:true});await apply()
 const charts=expected.pages[0].components.filter(c=>c.type==='line');charts.slice(0,2).forEach(c=>c.styleConfig.titleSize=24)
 assert.deepEqual(comparable(active(await saved())),expected)
 await page.getByRole('button',{name:'撤销文字调整',exact:true}).click();assert.deepEqual(comparable(active(await saved())),comparable(active(original)))
 for(const [button,label,value,field] of [['统一标题字号','批量标题字号','24','titleSize'],['统一标题颜色','批量标题颜色','#123456','titleColor'],['统一背景色','批量背景色','#eaf3ff','background']]){
  dialog=await open();await dialog.getByRole('region', { name: '勾选图表批量布局' }).getByRole('checkbox').nth(0).check();await dialog.getByRole('region', { name: '勾选图表批量布局' }).getByRole('checkbox').nth(1).check();await dialog.getByLabel(label).fill(value);await dialog.getByRole('button',{name:button,exact:true}).click();await apply();charts.slice(0,2).forEach(c=>c.styleConfig[field]=field==='titleSize'?Number(value):value)
 }
 const final=await saved();assert.deepEqual(comparable(active(final)),expected)
 await page.reload();await page.waitForFunction(()=>document.querySelectorAll('canvas').length>=3)
 const reopened=await saved();assert.deepEqual(comparable(active(reopened)),expected)
 assert.deepEqual(original.dashboards.filter(d=>d.id!==original.activeDashboardId),reopened.dashboards.filter(d=>d.id!==reopened.activeDashboardId));assert.deepEqual(errors,[])
 await page.screenshot({path:`${evidence}/reopened.png`,fullPage:true});await fs.writeFile(`${evidence}/browser.json`,JSON.stringify({status:'PASS',checks:['empty selection','invalid font','input changes invalidate preview','selected two only','undo exact application','font/title color/background','titles/bindings/third chart retained','save/reopen','other dashboards retained'],errors},null,2));console.log('Batch style real browser PASS')
}catch(e){await fs.writeFile(`${evidence}/browser-failure.txt`,`${e.stack}\n${await page.locator('body').innerText()}`);throw e}finally{await browser.close()}
