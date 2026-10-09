import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const evidence = 'E:/codex/work/tybi-product-mobile-20261008'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true })
const context = await browser.newContext({ viewport: { width: 1500, height: 1000 }, hasTouch: true, acceptDownloads: true })
const page = await context.newPage(), errors = [], checks = []
page.on('pageerror', error => errors.push(error.message))
const stored = () => page.evaluate(() => {
  const w = JSON.parse(localStorage.getItem('medical-bi-designer-workspace-v3'))
  return JSON.parse(localStorage.getItem(`medical-bi-designer-dashboard-v3::${w.generation}::${w.activeDashboardId}`))
})
const article = title => page.locator('.interactive-canvas > article').filter({ hasText: title })
try {
  await page.goto('http://127.0.0.1:5174/')
  await page.getByRole('button', { name: '提示词样例', exact: true }).click()
  await page.getByRole('button', { name: '填入输出示例（非模型生成）' }).click()
  await page.getByRole('button', { name: '校验并添加到设计器' }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  const original = await stored()
  await page.getByRole('button', { name: '预览', exact: true }).click()
  assert.equal(await page.getByRole('button', { name: '新建页面', exact: true }).count(), 0)
  assert.equal(await page.getByRole('button', { name: '配置页面事件', exact: true }).count(), 0)
  for (const width of [320, 390, 768, 1024]) {
    await page.setViewportSize({ width, height: 844 })
    const tabs = page.getByRole('tablist', { name: '页面列表' }).getByRole('tab')
    assert.equal(await tabs.count(), 5)
    for (let index = 0; index < 5; index++) {
      await tabs.nth(index).click()
      await page.waitForFunction(() => document.querySelector('.interactive-canvas > article'))
      await page.waitForFunction(() => {
        const strip = document.querySelector('[aria-label="页面列表"]'), active = strip?.querySelector('[aria-selected="true"]')
        if (!strip || !active) return false
        const s = strip.getBoundingClientRect(), a = active.getBoundingClientRect()
        return a.left >= s.left - 1 && a.right <= s.right + 1
      })
      const metrics = await page.evaluate(() => {
        const stage = document.querySelector('.canvas-stage').getBoundingClientRect()
        const canvas = document.querySelector('.interactive-canvas')
        const panels = [...canvas.querySelectorAll(':scope > article')]
        return { width: innerWidth, body: document.documentElement.scrollWidth, stageHeight: stage.height,
          mobile: canvas.classList.contains('mobile-preview'), touch: panels.map(p => getComputedStyle(p).touchAction),
          hiddenOverflow: getComputedStyle(document.querySelector('.artboard-wrap')).overflowY }
      })
      assert.ok(metrics.body <= width + 1, JSON.stringify({ index, ...metrics }))
      assert.ok(metrics.stageHeight > 200)
      assert.ok(metrics.touch.every(touch => touch === 'auto'))
      if (width <= 768) { assert.ok(metrics.mobile); assert.equal(metrics.hiddenOverflow, 'auto') }
      checks.push({ width, page: index + 1, ...metrics })
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tablist', { name: '页面列表' }).getByRole('tab').first().click()
  const wrap = page.locator('.artboard-wrap')
  // A native browser touch gesture, beginning inside a component, must scroll the canvas.
  await wrap.evaluate(el => { el.scrollTop = 0 })
  const box = await wrap.boundingBox(), cdp = await context.newCDPSession(page)
  const x = Math.round(box.x + box.width / 2), startY = Math.round(box.y + Math.min(280, box.height - 30))
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] })
  for (let step = 1; step <= 8; step++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY - step * 22 }] })
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  await page.waitForFunction(() => document.querySelector('.artboard-wrap').scrollTop > 30)
  const touchScroll = await wrap.evaluate(el => el.scrollTop)
  await wrap.evaluate(el => { el.scrollTop = 0 })
  await page.screenshot({ path: `${evidence}/hospital-phone.png` })

  const rank = article('科室门急诊人次前 20 · 点击进入科室分析')
  await rank.locator('tbody tr').first().waitFor()
  await rank.locator('tbody tr').first().click()
  const directory = article('科室目录 · 点击行查看指标与趋势')
  await directory.locator('tbody tr').first().waitFor()
  await directory.getByRole('button', { name: '下一页', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('article')].find(a => a.textContent.includes('科室目录 ·'))?.querySelector('footer b')?.textContent === '2 / 23')
  const csvEvent = page.waitForEvent('download')
  await directory.getByRole('button', { name: /下载明细 CSV/ }).click()
  const csv = await readFile(await (await csvEvent).path(), 'utf8')
  assert.equal(csv.trim().split('\r\n').length, 21)
  await page.getByLabel('运行时筛选条件').getByRole('combobox').first().selectOption('2025-08')
  await page.waitForFunction(() => [...document.querySelectorAll('article')].find(a => a.textContent.includes('科室目录 ·'))?.querySelector('tbody')?.textContent.includes('2025-08'))
  await page.getByText('清除科室选择 · 查看全部', { exact: true }).click()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await rank.locator('tbody tr').first().waitFor()

  const sampleRank = article('科室门诊人次 · 固定 2026-08 的 8 科室样本（点击进入）')
  await sampleRank.locator('tbody tr').first().click()
  const doctors = article('① 科室医生样本')
  await doctors.locator('tbody tr').first().waitFor()
  assert.equal(await doctors.locator('tbody tr').count(), 10)
  const selected = page.getByLabel('科室', { exact: true })
  assert.notEqual(await selected.inputValue(), '')
  await page.getByRole('button', { name: '清空科室筛选', exact: true }).click()
  await page.waitForFunction(() => [...document.querySelectorAll('select')].some(s => s.closest('label')?.textContent.trim().startsWith('科室') && s.value === ''))
  const option = await selected.locator('option').nth(1).getAttribute('value')
  await selected.selectOption(option)
  await page.waitForFunction(() => [...document.querySelectorAll('article')].find(a => a.textContent.includes('① 科室医生样本'))?.querySelectorAll('tbody tr').length === 10)
  await article('② 点击科室下钻').locator('tbody tr').first().click()
  await page.getByLabel('下钻面包屑').waitFor()
  await article('科室医生 · 点击行继续下钻').locator('tbody tr').first().click()
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="下钻面包屑"] button').length >= 2)
  await page.waitForFunction(() => document.querySelector('.artboard-wrap').scrollTop === 0)
  await page.screenshot({ path: `${evidence}/doctor-phone.png` })
  assert.ok(await page.getByLabel('下钻面包屑').getByRole('button').count() >= 2)
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await page.getByRole('button', { name: '退出预览', exact: true }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()
  assert.deepEqual((await stored()).pages, original.pages, '浏览交互不改变已保存的页面和事件')
  await page.reload()
  assert.ok(await page.getByLabel('移动端自适应').isChecked())
  assert.deepEqual(errors, [])
  const result = { status: 'PASS', checks, touchScroll, nativeTouch: true, csvRows: 20, linkageClear: true, drillBack: true, savedLayoutUnchanged: true, evidence }
  await writeFile(`${evidence}/result.json`, JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result))
} catch (error) {
  console.log((await page.locator('body').innerText()).slice(-10000))
  await page.screenshot({ path: `${evidence}/failure.png` }).catch(() => {})
  throw error
} finally { await browser.close() }
