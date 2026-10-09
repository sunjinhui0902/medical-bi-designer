import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const evidence = process.argv[2] || 'E:/codex/work/ty-bi-edit-20260929'
await fs.mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1800, height: 1100 } })
const errors = []
page.on('pageerror', error => errors.push(error.message))
try {
  await page.goto('http://127.0.0.1:5174/knowledge')
  await page.getByRole('button', { name: '本地看板助手', exact: true }).click()
  await page.getByRole('textbox', { name: '经营分析问题' }).fill('2026年1月至8月门诊收入、医疗成本趋势同比')
  await page.getByRole('button', { name: '生成草稿预览', exact: true }).click()
  await page.getByRole('button', { name: '添加到设计器继续编辑', exact: true }).click()
  await page.waitForURL('http://127.0.0.1:5174/')
  await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 2)
  await page.getByText('门诊收入（看板口径）月度趋势 · 万元', { exact: true }).click()
  async function edit(command) {
    await page.getByRole('button', { name: '批量调整 / 文字调整', exact: true }).click()
    await page.getByText('文字指令与单组件样式', { exact: true }).click()
    await page.getByRole('textbox', { name: '调整要求' }).fill(command)
    await page.getByRole('button', { name: '预览调整', exact: true }).click()
    await page.getByRole('button', { name: '应用到当前看板', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  await edit('标题改为本地文字调整验收')
  await page.getByText('本地文字调整验收', { exact: true }).waitFor()
  await page.getByRole('button', { name: '撤销文字调整', exact: true }).click()
  await page.getByText('门诊收入（看板口径）月度趋势 · 万元', { exact: true }).waitFor()
  await edit('背景色改为#EAF3FF')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  async function readWorkspace() {
    return page.evaluate(() => {
      const index = JSON.parse(localStorage.getItem('medical-bi-designer-workspace-v3'))
      return { ...index, dashboards: index.dashboards.map(d => JSON.parse(localStorage.getItem(`medical-bi-designer-dashboard-v3::${index.generation}::${d.id}`))) }
    })
  }
  const savedBefore = await readWorkspace()
  await edit('标题改为本地文字调整验收')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.reload()
  await page.getByText('本地文字调整验收', { exact: true }).waitFor()
  await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 2)
  const savedAfter = await readWorkspace()
  const getActive = workspace => workspace.dashboards.find(d => d.id === workspace.activeDashboardId)
  const before = getActive(savedBefore), after = getActive(savedAfter)
  assert.equal(before.id, after.id)
  assert.deepEqual(before.pages[0].components.map(c => c.dataConfig), after.pages[0].components.map(c => c.dataConfig))
  assert.deepEqual(before.extensionRefs, after.extensionRefs)
  assert.deepEqual(savedBefore.dashboards.filter(d => d.id !== before.id), savedAfter.dashboards.filter(d => d.id !== after.id))
  assert.ok(after.pages[0].components.some(c => c.title === '本地文字调整验收' && c.styleConfig.background === '#EAF3FF'))
  assert.deepEqual(errors, [])
  await page.screenshot({ path: `${evidence}/reopened-edit.png`, fullPage: true })
  await fs.writeFile(`${evidence}/browser.json`, JSON.stringify({ status: 'PASS', checks: ['preview/apply title', 'single undo', 'background color', 'save/reopen title and background', 'data/provenance/other dashboards retained', 'native chart reload'], errors }, null, 2))
  console.log('Local edit E2E PASS')
} finally { await browser.close() }
