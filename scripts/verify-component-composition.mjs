import { chromium } from '@playwright/test'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
const evidence = process.env.TY_BI_COMPOSITION_EVIDENCE || 'E:/codex/work/tybi-composition-20261008'
await mkdir(evidence, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } }), errors = []
page.on('pageerror', error => errors.push(error.message))
const save = () => page.getByRole('button', { name: '保存', exact: true }).click()
const snapshot = () => page.evaluate(() => {
  const w = JSON.parse(localStorage.getItem('medical-bi-designer-workspace-v3'))
  return JSON.parse(localStorage.getItem(`medical-bi-designer-dashboard-v3::${w.generation}::${w.activeDashboardId}`))
})
const panel = () => page.getByRole('dialog', { name: '图层与组合', exact: true })
const openPanel = () => page.getByRole('button', { name: '图层 / 组合', exact: true }).click()
const closePanel = async () => {
  await panel().getByRole('button', { name: '关闭图层与组合' }).click()
  assert.equal(await page.getByRole('button', { name: '图层 / 组合', exact: true }).evaluate(element => element === document.activeElement), true)
}
const node = id => page.locator(`[data-component-id="${id}"]`)
const settledMobile = () => page.waitForFunction(() => {
  const nodes = [document.querySelector('.mobile-preview'), document.querySelector('.interactive-artboard')]
  return nodes.every(element => element && Math.abs(element.getBoundingClientRect().width - parseFloat(element.style.width)) < .5)
})
async function drag(target, dx, dy, cancel = false) {
  const rect = await target.boundingBox()
  assert.ok(rect)
  const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2
  await target.dispatchEvent('pointerdown', { pointerId: 71, pointerType: 'mouse', button: 0, clientX: x, clientY: y })
  await page.mouse.move(x + dx, y + dy, { steps: 5 })
  if (cancel) await page.keyboard.press('Escape')
  else await page.evaluate(({ x, y }) => window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 71, pointerType: 'mouse', button: 0, clientX: x, clientY: y })), { x: x + dx, y: y + dy })
}
try {
  await page.goto('http://127.0.0.1:5174/')
  await page.getByRole('button', { name: '新建看板', exact: true }).click()
  const manager = page.getByRole('dialog', { name: '看板管理' })
  await manager.getByLabel('新看板名称').fill('图层与组合验收')
  await manager.getByRole('button', { name: '新建看板', exact: true }).click()
  await page.getByRole('button', { name: '本地图片', exact: true }).click()
  await page.getByRole('button', { name: '指标卡', exact: true }).click()
  await save()
  const ids = await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('medical-bi-designer-workspace-v3')), key = `medical-bi-designer-dashboard-v3::${w.generation}::${w.activeDashboardId}`
    const app = JSON.parse(localStorage.getItem(key)), [image, kpi] = app.pages[0].components
    for (const item of [image, kpi]) Object.assign(item.position, { x: 40, y: 80, width: 320, height: 180 })
    image.position.zIndex = 2; kpi.position.zIndex = 1
    image.imageConfig.source = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jh4kAAAAASUVORK5CYII='
    localStorage.setItem(key, JSON.stringify(app))
    return { image: image.id, kpi: kpi.id, imageTitle: image.title, kpiTitle: kpi.title }
  })
  await page.reload()
  await openPanel()
  await panel().getByRole('button', { name: `选择图层：${ids.imageTitle}`, exact: true }).click()
  await panel().getByLabel('背景色', { exact: true }).fill('#123456')
  await panel().getByLabel('透明背景（保留内容颜色）', { exact: true }).check()
  await closePanel(); await save(); await page.reload(); await openPanel()
  await panel().getByRole('button', { name: `选择图层：${ids.imageTitle}`, exact: true }).click()
  await panel().getByLabel('透明背景（保留内容颜色）', { exact: true }).uncheck()
  assert.equal(await panel().getByLabel('背景色', { exact: true }).inputValue(), '#123456')
  await page.keyboard.press('Escape')
  assert.equal(await page.getByRole('button', { name: '图层 / 组合', exact: true }).evaluate(element => element === document.activeElement), true)
  await openPanel()
  await panel().getByLabel('透明背景（保留内容颜色）', { exact: true }).check()
  await panel().getByLabel('预览点击穿透', { exact: true }).check()
  await panel().getByLabel(`选择组合成员：${ids.imageTitle}`, { exact: true }).check()
  await panel().getByLabel(`选择组合成员：${ids.kpiTitle}`, { exact: true }).check()
  await panel().getByRole('button', { name: '组合选中组件' }).click()
  await panel().getByLabel('组合宽度', { exact: true }).fill('400')
  await panel().getByLabel('组合高度', { exact: true }).focus()
  await panel().getByRole('button', { name: '应用组合位置与尺寸' }).click()
  assert.equal(await panel().getByRole('alert').count(), 0)
  await closePanel()
  await page.getByLabel('移动整个组合', { exact: true }).waitFor()
  await save()
  const beforeDrag = await snapshot()
  await drag(page.getByLabel('移动整个组合', { exact: true }), 30, 25)
  await save()
  const moved = await snapshot()
  for (let i = 0; i < 2; i++) {
    assert.equal(moved.pages[0].components[i].position.x - beforeDrag.pages[0].components[i].position.x, 30)
    assert.equal(moved.pages[0].components[i].position.y - beforeDrag.pages[0].components[i].position.y, 25)
  }
  await drag(page.getByLabel('移动整个组合', { exact: true }), 35, 15, true)
  await save()
  assert.deepEqual((await snapshot()).pages[0].components, moved.pages[0].components)
  await drag(page.locator('.composition-outline .handle-se'), 40, 20)
  await save()
  const resized = await snapshot()
  assert.ok(resized.pages[0].components.every(c => c.position.width > moved.pages[0].components[0].position.width))
  assert.ok(resized.pages[0].components.every(c => c.groupId === resized.pages[0].components[0].groupId))
  await page.reload()
  await page.getByRole('button', { name: '预览', exact: true }).click()
  const card = await node(ids.kpi).boundingBox()
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-component-id]')?.getAttribute('data-component-id'), { x: card.x + 40, y: card.y + 50 })
  assert.equal(hit, ids.kpi)
  await node(ids.kpi).evaluate(element => { window.__compositionClicks = 0; element.addEventListener('click', () => window.__compositionClicks++) })
  await page.mouse.click(card.x + 40, card.y + 50)
  assert.equal(await page.evaluate(() => window.__compositionClicks), 1)
  await page.getByLabel('移动端自适应', { exact: true }).check()
  await page.getByLabel('预览设备', { exact: true }).selectOption('phone')
  await page.waitForFunction(() => document.querySelector('.mobile-preview'))
  await settledMobile()
  const mobileImage = await node(ids.image).boundingBox(), mobileCard = await node(ids.kpi).boundingBox()
  assert.ok(Math.abs(mobileImage.x - mobileCard.x) < 1 && Math.abs(mobileImage.y - mobileCard.y) < 1)
  await save()
  assert.deepEqual((await snapshot()).pages[0].components, resized.pages[0].components)
  await page.screenshot({ path: `${evidence}/phone-group.png` })
  await page.getByRole('button', { name: '退出预览', exact: true }).click()
  await openPanel()
  await panel().getByRole('button', { name: `选择图层：${ids.imageTitle}`, exact: true }).click()
  await panel().getByRole('button', { name: '取消当前组合' }).click()
  await panel().getByRole('button', { name: '置底', exact: true }).click()
  await closePanel()
  await save()
  const dissolved = await snapshot()
  assert.ok(dissolved.pages[0].components.every(c => !c.groupId))
  assert.ok(dissolved.pages[0].components[0].position.zIndex < dissolved.pages[0].components[1].position.zIndex)
  await page.getByRole('button', { name: '页签', exact: true }).click()
  await save()
  await page.evaluate(() => {
    const w = JSON.parse(localStorage.getItem('medical-bi-designer-workspace-v3')), key = `medical-bi-designer-dashboard-v3::${w.generation}::${w.activeDashboardId}`
    const app = JSON.parse(localStorage.getItem(key)), items = app.pages[0].components, tab = items.find(c => c.type === 'tabs')
    Object.assign(tab.position, { x: 20, y: 20, width: 700, height: 400 })
    tab.tabsConfig.items[0].componentIds = items.filter(c => c.type !== 'tabs').map(c => c.id)
    for (const item of items.filter(c => c.type !== 'tabs')) Object.assign(item.position, { x: 20, y: 20, width: 300, height: 160 })
    localStorage.setItem(key, JSON.stringify(app))
  })
  await page.reload()
  await node(ids.kpi).click()
  await openPanel()
  await panel().getByLabel(`选择组合成员：${ids.imageTitle}`, { exact: true }).check()
  await panel().getByLabel(`选择组合成员：${ids.kpiTitle}`, { exact: true }).check()
  await panel().getByRole('button', { name: '组合选中组件' }).click()
  await closePanel(); await save()
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.getByLabel('预览设备', { exact: true }).selectOption('phone')
  await page.waitForFunction(() => document.querySelector('.mobile-preview'))
  await settledMobile()
  const ti = await node(ids.image).boundingBox(), tk = await node(ids.kpi).boundingBox()
  assert.ok(Math.abs(ti.x - tk.x) < 1 && Math.abs(ti.y - tk.y) < 1)
  const content = await page.locator('.dashboard-tab-content').boundingBox()
  for (const rect of [ti, tk]) {
    assert.ok(rect.x >= content.x - 1 && rect.y >= content.y - 1, 'Tab group starts inside its content area')
    assert.ok(rect.x + rect.width <= content.x + content.width + 1, 'Tab group right edge stays inside its content area')
    assert.ok(rect.y + rect.height <= content.y + content.height + 1, 'Tab group bottom edge stays inside its content area')
  }
  assert.deepEqual(errors, [])
  await page.screenshot({ path: `${evidence}/phone-tab-group.png` })
  const tabDirections = []
  for (const direction of ['top', 'bottom', 'left', 'right']) {
    await page.evaluate(direction => {
      const workspace = JSON.parse(localStorage.getItem('medical-bi-designer-workspace-v3'))
      const key = `medical-bi-designer-dashboard-v3::${workspace.generation}::${workspace.activeDashboardId}`
      const app = JSON.parse(localStorage.getItem(key)), tab = app.pages[0].components.find(c => c.type === 'tabs')
      tab.tabsConfig.titlePosition = direction
      tab.tabsConfig.titleSize = direction === 'left' || direction === 'right' ? 96 : 52
      tab.tabsConfig.items[0].padding = 24
      for (const component of app.pages[0].components.filter(c => tab.tabsConfig.items[0].componentIds.includes(c.id))) {
        component.position.x = Math.max(24, component.position.x)
        component.position.y = Math.max(24, component.position.y)
      }
      localStorage.setItem(key, JSON.stringify(app))
    }, direction)
    await page.reload()
    await page.getByRole('button', { name: '预览', exact: true }).click()
    await page.getByLabel('预览设备', { exact: true }).selectOption('phone')
    await settledMobile()
    const savedComponents = (await snapshot()).pages[0].components
    const geometry = await page.evaluate(ids => {
      const box = element => { const rect = element.getBoundingClientRect(); return { x: rect.x, y: rect.y, width: rect.width, height: rect.height } }
      return { content: box(document.querySelector('.dashboard-tab-content')), children: [ids.image, ids.kpi].map(id => box(document.querySelector(`[data-component-id="${id}"]`))) }
    }, ids)
    for (const rect of geometry.children) {
      const host = geometry.content
      assert.ok(rect.x >= host.x - 1 && rect.y >= host.y - 1, `${direction}: group begins inside Tab content`)
      assert.ok(rect.x + rect.width <= host.x + host.width + 1, `${direction}: group right edge is visible`)
      assert.ok(rect.y + rect.height <= host.y + host.height + 1, `${direction}: group bottom edge is visible`)
    }
    await save()
    assert.deepEqual((await snapshot()).pages[0].components, savedComponents)
    await page.screenshot({ path: `${evidence}/phone-tab-${direction}.png` })
    tabDirections.push(direction)
  }
  assert.deepEqual(errors, [])
  const result = { status: 'PASS', groupMove: true, resize: true, escapeRestoresAll: true, clickThrough: true, transparency: true, layers: true, dissolve: true, savedAndReopened: true, mobileOverlapPreserved: true, tabMobileGroup: true, tabContentBounds: true, tabDirections }
  await writeFile(`${evidence}/result.json`, JSON.stringify(result, null, 2)); console.log(JSON.stringify(result))
} catch (error) {
  await page.screenshot({ path: `${evidence}/failure.png` }); await writeFile(`${evidence}/failure.txt`, error.stack ?? String(error)); throw error
} finally { await browser.close() }
