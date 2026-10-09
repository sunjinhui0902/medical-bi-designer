import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const evidence = process.env.TY_BI_QUERY_EVIDENCE || 'E:/codex/work/tybi-query-cancellation-20261008'
const switches = Number(process.env.TY_BI_QUERY_SWITCHES || 12)
assert.ok(Number.isInteger(switches) && switches >= 1 && switches <= 500)
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  // Start on desktop for generation; viewport checks below use the real mobile layout.
  await page.setViewportSize({ width: 1500, height: 1000 })
  await page.addInitScript(() => {
    const nativeFetch = window.fetch.bind(window)
    window.__queryProbe = { armed: false, held: false, aborted: false, requests: [] }
    window.fetch = async (input, init) => {
      const response = await nativeFetch(input, init)
      const probe = window.__queryProbe, url = String(input)
      if (!url.includes('/execute')) return response
      const body = JSON.parse(init?.body || '{}')
      const record = { dataset: decodeURIComponent(url.split('/').at(-2)), pageSize: body.pagination?.limit, response: response.status }
      probe.requests.push(record)
      if (!probe.armed || !record.dataset.includes('outpatient_department_rank') || record.pageSize !== 20) return response
      probe.armed = false
      const nativeJson = response.json.bind(response)
      response.json = async () => {
        probe.held = true
        await new Promise((resolve, reject) => {
          probe.release = resolve
          const abort = () => { probe.aborted = true; reject(new DOMException('body read cancelled', 'AbortError')) }
          if (init.signal.aborted) abort()
          else init.signal.addEventListener('abort', abort, { once: true })
        })
        return nativeJson()
      }
      return response
    }
  })
  await page.goto('http://127.0.0.1:5174/')
  await page.getByRole('button', { name: '提示词样例', exact: true }).click()
  await page.getByRole('button', { name: '填入输出示例（非模型生成）' }).click()
  await page.getByRole('button', { name: '校验并添加到设计器' }).click()
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  const tabs = page.getByRole('tablist', { name: '页面列表' }).getByRole('tab')
  const directory = page.locator('.interactive-canvas > article').filter({ hasText: '科室目录 · 点击行查看指标与趋势' })
  await page.evaluate(() => { window.__queryProbe.armed = true })
  await tabs.nth(4).click()
  await page.waitForFunction(() => window.__queryProbe.held)
  await tabs.first().click()
  await page.waitForFunction(() => window.__queryProbe.aborted)
  await tabs.nth(4).click()
  await directory.locator('tbody tr').first().waitFor({ timeout: 5000 })
  assert.equal(await directory.locator('tbody tr').count(), 20)
  for (let turn = 0; turn < switches; turn++) {
    await tabs.first().click()
    await tabs.nth(4).click()
    await directory.locator('tbody tr').first().waitFor({ timeout: 5000 })
    assert.equal(await directory.locator('tbody tr').count(), 20)
  }
  assert.deepEqual(errors, [])
  const probe = await page.evaluate(() => ({ ...window.__queryProbe, release: undefined }))
  const result = { status: 'PASS', actualLocalData: true, abortedBodyRead: probe.aborted, rapidSwitches: switches, rows: 20, requests: probe.requests }
  await writeFile(`${evidence}/result.json`, JSON.stringify(result, null, 2))
  await directory.scrollIntoViewIfNeeded()
  await page.screenshot({ path: `${evidence}/directory-phone.png` })
  console.log(JSON.stringify(result))
} catch (error) {
  const probe = await page.evaluate(() => ({ ...window.__queryProbe, release: undefined })).catch(() => ({}))
  await writeFile(`${evidence}/failure.json`, JSON.stringify({ error: error.message, probe, page: await page.locator('body').innerText() }, null, 2))
  await page.screenshot({ path: `${evidence}/failure.png` })
  throw error
} finally { await browser.close() }
