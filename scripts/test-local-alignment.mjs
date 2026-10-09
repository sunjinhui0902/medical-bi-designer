import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const evidence = process.argv[2] || 'E:/codex/work/ty-bi-align-20260929'
await fs.mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1800, height: 1200 } })
const errors = [], failures = []
page.on('pageerror', e => errors.push(e.message))
page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) failures.push(`${r.status()} ${r.url()}`) })
try {
  await page.goto('http://127.0.0.1:5174/knowledge')
  await page.getByRole('button', { name: '本地看板助手', exact: true }).click()
  await page.getByRole('textbox', { name: '经营分析问题' }).fill('2026年1月至8月门诊收入、医疗成本、出院人次趋势同比')
  await page.getByRole('button', { name: '生成草稿预览', exact: true }).click()
  await page.getByRole('button', { name: '添加到设计器继续编辑', exact: true }).click()
  await page.waitForURL('http://127.0.0.1:5174/')
  await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 3)
  async function saved() {
    await page.getByRole('button', { name: '保存', exact: true }).click()
    return page.evaluate(() => {
      const w = JSON.parse(localStorage.getItem('medical-bi-designer-workspace-v3'))
      return { ...w, dashboards: w.dashboards.map(d => JSON.parse(localStorage.getItem(`medical-bi-designer-dashboard-v3::${w.generation}::${d.id}`))) }
    })
  }
  const active = w => w.dashboards.find(d => d.id === w.activeDashboardId)
  const comparable = a => { const copy = structuredClone(a); delete copy.updatedAt; return copy }
  const original = await saved()
  async function edit(command, warn = false) {
    await page.getByRole('button', { name: '批量调整 / 文字调整', exact: true }).click()
    await page.getByText('文字指令与单组件样式', { exact: true }).click()
    await page.getByRole('textbox', { name: '调整要求' }).fill(command)
    await page.getByRole('button', { name: '预览调整', exact: true }).click()
    if (warn) {
      await page.getByText(/本次对齐新增/).waitFor()
      await page.screenshot({ path: `${evidence}/alignment-preview.png` })
    }
    await page.getByRole('button', { name: '应用到当前看板', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  for (const [command, axis] of [['当前页图表左对齐','x'],['当前页图表顶部对齐','y']]) {
    await edit(command, true)
    const applied = active(await saved())
    const expected = comparable(active(original))
    const charts = expected.pages[0].components.filter(c => c.type === 'line')
    const target = Math.min(...charts.map(c => c.position[axis]))
    charts.forEach(c => { c.position[axis] = target })
    assert.deepEqual(comparable(applied), expected)
    await page.getByRole('button', { name: '撤销文字调整', exact: true }).click()
    assert.deepEqual(comparable(active(await saved())), comparable(active(original)))
  }
  await page.getByText('门诊收入（看板口径）月度趋势 · 万元', { exact: true }).click()
  await edit('标题颜色改为#2367A3')
  await edit('标题加粗')
  const styled = await saved()
  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 3)
  const reopened = await saved()
  const chart = active(reopened).pages[0].components.find(c => c.type === 'line')
  assert.equal(chart.styleConfig.titleColor, '#2367A3')
  assert.equal(chart.styleConfig.titleWeight, 700)
  assert.deepEqual(comparable(active(styled)), comparable(active(reopened)))
  assert.deepEqual(active(original).pages[0].components.map(c => c.dataConfig), active(reopened).pages[0].components.map(c => c.dataConfig))
  assert.deepEqual(active(original).extensionRefs, active(reopened).extensionRefs)
  assert.deepEqual(original.dashboards.filter(d => d.id !== original.activeDashboardId), reopened.dashboards.filter(d => d.id !== reopened.activeDashboardId))
  assert.deepEqual(errors, []); assert.deepEqual(failures, [])
  await page.screenshot({ path: `${evidence}/reopened-style.png`, fullPage: true })
  await fs.writeFile(`${evidence}/browser.json`, JSON.stringify({ status: 'PASS', checks: ['alignment without selection', 'left/top preview with overlap warning', 'exact position-only apply', 'atomic undo after both alignments', 'title color/weight', 'save/reopen native charts', 'data/provenance/other dashboards retained'], errors, failures }, null, 2))
  console.log('Local alignment E2E PASS')
} finally { await browser.close() }
