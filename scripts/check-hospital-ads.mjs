import {chromium} from '@playwright/test'
import fs from 'node:fs/promises'
const root='E:/codex/work/ty-bi-hospital-ads-model-20260929'
await fs.mkdir(root,{recursive:true})
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1511,height:940}}),errors=[]
page.on('pageerror',e=>errors.push(e.message))
try{await page.goto('http://127.0.0.1:5174/hospital-overview-sample.html');await page.waitForFunction(()=>document.querySelectorAll('canvas').length>=9);await page.screenshot({path:`${root}/ads-sample.png`,fullPage:true});await fs.writeFile(`${root}/sample-render.json`,JSON.stringify({errors,canvases:await page.locator('canvas').count(),text:await page.locator('.cards').innerText()},null,2));if(errors.length)throw new Error(errors.join(';'));console.log('ADS样例渲染PASS')}finally{await browser.close()}
