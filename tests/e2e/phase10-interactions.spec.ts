import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const examplePath = fileURLToPath(new URL('../../docs/02_V3架构/示例/dashboard-v3-phase10.json', import.meta.url))
const example = JSON.parse(readFileSync(examplePath, 'utf8'))

test.beforeEach(async ({ page }) => {
  const application = structuredClone(example)
  application.pages[0].components = application.pages[0].components.filter((component: { id: string }) => component.id === 'component-dialog')
  application.pages[0].controls = [{ id: 'control-hospital', type: 'singleSelect', parameterIds: ['parameter-hospital'], position: { x: 0, y: 0, width: 240, height: 56, zIndex: 1 }, styleConfig: {}, interaction: { submitMode: 'manual', clearable: true } }]
  await page.addInitScript((value) => { if (sessionStorage.getItem('phase10-fixture-override') !== '1') localStorage.setItem('medical-bi-designer-dashboard-v3', JSON.stringify(value)) }, application)
  await page.goto('/')
  await expect(page.getByRole('button', { name: '预览', exact: true })).toBeVisible()
})

test('P10.5 preview dialog traps focus, honors ESC, and avoids the filter protection region', async ({ page }) => {
  await page.getByRole('button', { name: '预览', exact: true }).click()
  const opener = page.locator('[data-component-id="component-dialog"]')
  await opener.click()
  const dialog = page.getByRole('dialog', { name: /交互详情/ })
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: '关闭弹窗' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.locator('[data-component-id="component-dialog-close"]')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '关闭弹窗' })).toBeFocused()

  const filter = page.getByLabel('运行时筛选条件')
  const titlebar = dialog.locator('.dialog-titlebar-v3')
  const titleBox = await titlebar.boundingBox(); if (!titleBox) throw new Error('dialog titlebar missing')
  await page.mouse.move(titleBox.x + 100, titleBox.y + 20); await page.mouse.down(); await page.mouse.move(titleBox.x + 100, 0, { steps: 4 }); await page.mouse.up()
  const [dialogBox, filterBox] = await Promise.all([dialog.boundingBox(), filter.boundingBox()]); if (!dialogBox || !filterBox) throw new Error('geometry missing')
  expect(dialogBox.y).toBeGreaterThanOrEqual(filterBox.y + filterBox.height - 1)

  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('P10.5 backdrop policy and eight-direction resize handles remain controlled', async ({ page }) => {
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.locator('[data-component-id="component-dialog"]').click()
  const dialog = page.getByRole('dialog', { name: /交互详情/ }); await expect(dialog).toBeVisible()
  await page.locator('.dialog-backdrop-v3.is-top').click({ position: { x: 5, y: 5 } }); await expect(dialog).toBeVisible()
  await expect(dialog.locator('.dialog-resize-v3')).toHaveCount(8)
  const before = await dialog.boundingBox(); const handle = dialog.locator('.dialog-resize-v3.is-se'); const handleBox = await handle.boundingBox(); if (!before || !handleBox) throw new Error('resize geometry missing')
  await page.mouse.move(handleBox.x + 3, handleBox.y + 3); await page.mouse.down(); await page.mouse.move(handleBox.x + 70, handleBox.y + 50); await page.mouse.up()
  const after = await dialog.boundingBox(); if (!after) throw new Error('resized geometry missing')
  expect(after.width).toBeGreaterThan(before.width); expect(after.height).toBeGreaterThan(before.height)
  await page.getByRole('button', { name: '关闭弹窗' }).click(); await expect(dialog).toHaveCount(0)
})

test('P10.5 dialog page components execute closeDialog through EventBus', async ({ page }) => {
  await page.getByRole('button', { name: '预览', exact: true }).click()
  const opener = page.locator('[data-component-id="component-dialog"]')
  await opener.click()
  const dialog = page.getByRole('dialog', { name: /交互详情/ })
  await expect(dialog).toBeVisible()
  await dialog.locator('[data-component-id="component-dialog-close"]').click()
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('P10.6 browser adapter requests noopener/noreferrer and never exposes opener', async ({ page, context }) => {
  const application = structuredClone(example)
  application.pages[0].components = [{ ...application.pages[0].components.find((component: { id: string }) => component.id === 'component-dialog'), id: 'component-window', title: '新窗口', events: [{ id: 'event-window', enabled: true, event: 'click', actions: [{ id: 'action-window', type: 'openPageWindow', pageId: 'page-department' }] }] }]
  await page.evaluate((value) => { sessionStorage.setItem('phase10-fixture-override', '1'); localStorage.setItem('medical-bi-designer-dashboard-v3', JSON.stringify(value)) }, application); await page.reload(); await page.getByRole('button', { name: '预览', exact: true }).click()
  const popupPromise = context.waitForEvent('page')
  await page.locator('[data-component-id="component-window"]').click()
  const popup = await popupPromise; await popup.waitForLoadState('domcontentloaded')
  expect(await popup.evaluate(() => window.opener === null)).toBe(true)
  expect(new URL(popup.url()).searchParams.get('previewPageId')).toBe('page-department')
  await expect(popup.getByRole('tab', { name: /科室与医生/ })).toHaveAttribute('aria-selected', 'true')
  await popup.close()
})

test('P10.7 designer exposes controlled Phase10 action authoring', async ({ page }) => {
  await page.locator('.design-component').first().click()
  await page.getByRole('tab', { name: '交互', exact: true }).click()
  await page.getByRole('button', { name: '配置组件事件' }).click()
  const panel = page.getByRole('complementary', { name: '事件配置', exact: true })
  await panel.getByLabel('新建事件').selectOption('doubleClick')
  await panel.getByLabel('新增交互动作').selectOption('navigatePage')
  await expect(panel.getByLabel('navigatePage 动作 JSON')).toHaveValue(/"history": "push"/)
})

test('P10.7 hospital to department to doctor preserves parameters, breadcrumbs, back and clear', async ({ page }) => {
  test.setTimeout(60_000)
  const application = structuredClone(example)
  const requests: Array<{ datasetId: string; parameters: Record<string, unknown> }> = []
  await page.route('**/api/datasets/*/execute', async (route) => {
    const request = route.request()
    const datasetId = decodeURIComponent(new URL(request.url()).pathname.split('/').at(-2) ?? '')
    const body = request.postDataJSON() as { parameters?: Record<string, unknown> }
    requests.push({ datasetId, parameters: body.parameters ?? {} })
    const row = datasetId === 'dataset-hospital'
      ? { hospital_code: 'H1', department_code: 'D1', doctor_code: 'DR1' }
      : datasetId === 'dataset-department'
        ? { department_code: 'D1', doctor_code: 'DR1' }
        : datasetId === 'dataset-doctor'
          ? { doctor_code: 'DR1' }
          : { label: 'linked' }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fields: Object.keys(row).map((name) => ({ name, dataType: 'string' })), rows: [row], rowCount: 1 }) })
  })
  await page.evaluate((value) => { sessionStorage.setItem('phase10-fixture-override', '1'); localStorage.setItem('medical-bi-designer-dashboard-v3', JSON.stringify(value)) }, application)
  await page.reload()
  await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.locator('[data-component-id="component-hospital"] tbody tr').click()
  await expect(page.getByRole('tab', { name: /科室与医生/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.runtime-event-status')).toContainText('事件执行成功')
  await expect(page.getByLabel('下钻面包屑')).toContainText('医院')
  await expect.poll(() => requests.some((item) => item.datasetId === 'dataset-department' && item.parameters.hospital_code === 'H1')).toBe(true)

  await page.locator('[data-component-id="component-department"] tbody tr').click()
  await expect(page.getByRole('tab', { name: /^3 医生/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.runtime-event-status')).toContainText('事件执行成功')
  await expect(page.getByLabel('下钻面包屑')).toContainText('科室')
  await expect.poll(() => requests.some((item) => item.datasetId === 'dataset-doctor' && item.parameters.department_code === 'D1')).toBe(true)

  await page.locator('[data-component-id="component-doctor"] tbody tr').click()
  await expect(page.getByLabel('下钻面包屑')).toContainText('医生')
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.getByRole('tab', { name: /科室与医生/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.getByRole('tab', { name: /^1 医院/ })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: '清除联动', exact: true }).click()
  await expect.poll(() => requests.some((item) => item.datasetId === 'dataset-summary' && item.parameters.hospital_code == null)).toBe(true)
  await page.getByTitle('返回上一下钻层级').last().click()
  await expect(page.getByLabel('下钻面包屑')).toHaveCount(0)
})
