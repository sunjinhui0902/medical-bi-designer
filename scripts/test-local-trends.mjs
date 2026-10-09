import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const evidence = process.argv[2] || 'E:/codex/work/ty-bi-multi-20260928'
await fs.mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1100 } })
const errors = [], apiFailures = []
page.on('pageerror', error => errors.push(error.message))
page.on('response', response => { if (response.url().includes('/api/') && response.status() >= 400) apiFailures.push(`${response.status()} ${response.url()}`) })
try {
  await page.goto('http://127.0.0.1:5174/knowledge')
  await page.getByRole('button', { name: '本地看板助手', exact: true }).click()
  await page.getByRole('dialog').waitFor()
  await page.getByRole('textbox', { name: '经营分析问题' }).fill('2026年1月至2026年8月门诊收入、医疗成本、出院人次趋势同比')
  await page.getByRole('button', { name: '生成草稿预览', exact: true }).click()
  await page.getByRole('button', { name: '添加到设计器继续编辑', exact: true }).waitFor()
  assert.equal(await page.locator('.local-metric-preview').count(), 3)
  await page.screenshot({ path: `${evidence}/preview.png` })
  await page.getByRole('button', { name: '添加到设计器继续编辑', exact: true }).click()
  await page.waitForURL('http://127.0.0.1:5174/')
  await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 3)
  await page.getByText('门诊收入（看板口径）月度趋势 · 万元', { exact: true }).click()
  await page.getByRole('tab', { name: '样式', exact: true }).click()
  await page.getByRole('textbox', { name: '组件标题', exact: true }).fill('门诊收入趋势 · 试用版')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.reload()
  await page.getByText('门诊收入趋势 · 试用版', { exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 3)
  await page.screenshot({ path: `${evidence}/reopened-trends.png`, fullPage: true })
  assert.deepEqual(errors, [])
  assert.deepEqual(apiFailures, [])
  const localIds = await page.evaluate(() => JSON.parse(localStorage.getItem('medical-bi-designer-workspace-v3')).dashboards.map(d => d.name))
  assert.ok(localIds.length >= 2)
  await fs.writeFile(`${evidence}/browser.json`, JSON.stringify({ status: 'PASS', checks: ['knowledge entry', 'three metric preview', 'three native chart canvases', 'title edit', 'save/reopen with chart reload', 'existing dashboard retained'], errors, apiFailures, dashboards: localIds }, null, 2))
  console.log('Local trend E2E PASS')
} finally { await browser.close() }
