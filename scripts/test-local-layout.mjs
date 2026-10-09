import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
const evidence = process.argv[2] || 'E:/codex/work/ty-bi-layout-20260929'
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
  async function preview(command) {
    await page.getByRole('button', { name: '批量调整 / 文字调整', exact: true }).click()
    await page.getByText('文字指令与单组件样式', { exact: true }).click()
    await page.getByRole('textbox', { name: '调整要求' }).fill(command)
    await page.getByRole('button', { name: '预览调整', exact: true }).click()
  }
  async function edit(command) {
    await preview(command)
    await page.getByRole('button', { name: '应用到当前看板', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  const original = await saved()
  for (const [command, message] of [['图表水平等间距分布','现有跨度不足'], ['图表宽度统一为9999','越出画布']]) {
    await preview(command)
    await page.getByRole('alert').filter({ hasText: message }).waitFor()
    assert.equal(await page.getByRole('button', { name: '应用到当前看板', exact: true }).count(), 0)
    await page.getByRole('button', { name: '关闭', exact: true }).click()
    assert.deepEqual(comparable(active(await saved())), comparable(active(original)))
  }
  // Give the three generated charts enough room via the real size command.
  await edit('图表尺寸统一为200×100')
  const baseline = await saved()
  for (const [command,axis,dimension] of [['图表水平等间距分布','x','width'], ['图表垂直等间距分布','y','height']]) {
    await edit(command)
    const applied = active(await saved())
    const expected = comparable(active(baseline))
    const charts = expected.pages[0].components.filter(c => c.type === 'line').sort((a,b) => a.position[axis] - b.position[axis])
    const start = charts[0].position[axis], end = Math.max(...charts.map(c => c.position[axis] + c.position[dimension]))
    const gap = (end - start - charts.reduce((sum,c) => sum + c.position[dimension],0))/(charts.length-1)
    let cursor = start
    charts.forEach(c => { c.position[axis] = Math.round(cursor*1000000)/1000000; cursor += c.position[dimension] + gap })
    assert.deepEqual(comparable(applied), expected)
    await page.getByRole('button', { name: '撤销文字调整', exact: true }).click()
    assert.deepEqual(comparable(active(await saved())), comparable(active(baseline)))
  }
  await preview('图表尺寸统一为400×260')
  await page.screenshot({ path: `${evidence}/resize-preview.png` })
  await page.getByRole('button', { name: '应用到当前看板', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  const resized = await saved()
  const expected = comparable(active(baseline))
  expected.pages[0].components.filter(c => c.type === 'line').forEach(c => { c.position.width = 400; c.position.height = 260 })
  assert.deepEqual(comparable(active(resized)), expected)
  await page.reload()
  await page.waitForFunction(() => document.querySelectorAll('canvas').length >= 3)
  const reopened = await saved()
  assert.deepEqual(comparable(active(reopened)), expected)
  assert.deepEqual(active(original).pages[0].components.map(c => c.dataConfig), active(reopened).pages[0].components.map(c => c.dataConfig))
  assert.deepEqual(active(original).extensionRefs, active(reopened).extensionRefs)
  assert.deepEqual(original.dashboards.filter(d => d.id !== original.activeDashboardId), reopened.dashboards.filter(d => d.id !== reopened.activeDashboardId))
  assert.deepEqual(errors, []); assert.deepEqual(failures, [])
  await page.screenshot({ path: `${evidence}/reopened-layout.png`, fullPage: true })
  await fs.writeFile(`${evidence}/browser.json`, JSON.stringify({ status: 'PASS', checks: ['insufficient span/overflow rejected without mutation', 'real resizing command prepares enough span', 'horizontal/vertical equal edge gaps', 'exact coordinate-only application', 'atomic undo of both distributions', 'combined resize and save/reopen', 'three native charts/data/provenance/other dashboards retained'], errors, failures }, null, 2))
  console.log('Local layout E2E PASS')
} finally { await browser.close() }
