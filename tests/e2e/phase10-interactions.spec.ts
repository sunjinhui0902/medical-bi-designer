import { expect, test } from '@playwright/test'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { validateDashboardApplicationV3 } from '../../src/services/dashboardValidationV3'

const examplePath = fileURLToPath(new URL('../../docs/02_V3架构/示例/dashboard-v3-phase10.json', import.meta.url))
const example = JSON.parse(readFileSync(examplePath, 'utf8'))

async function replaceDashboardFixture(page: import('@playwright/test').Page, application: unknown) {
  await page.evaluate((value) => {
    sessionStorage.setItem('phase10-fixture-override', '1')
    const staleKeys: string[] = []
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index)
      if (key === 'medical-bi-designer-workspace-v3' || key?.startsWith('medical-bi-designer-dashboard-v3::')) staleKeys.push(key)
    }
    staleKeys.forEach((key) => localStorage.removeItem(key))
    localStorage.setItem('medical-bi-designer-dashboard-v3', JSON.stringify(value))
  }, application)
}

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
  const filterBefore = await page.locator('.parameter-control-runtime').boundingBox()
  if (!filterBefore) throw new Error('filter geometry missing')
  await page.locator('[data-component-id="component-dialog"]').click()
  const dialog = page.getByRole('dialog', { name: /交互详情/ }); await expect(dialog).toBeVisible()
  const filterAfter = await page.locator('.parameter-control-runtime').boundingBox()
  expect(filterAfter).toEqual(filterBefore)
  await page.locator('.dialog-backdrop-v3.is-top').click({ position: { x: 5, y: 5 } }); await expect(dialog).toBeVisible()
  await expect(dialog.locator('.dialog-resize-v3')).toHaveCount(8)
  const before = await dialog.boundingBox(); const handle = dialog.locator('.dialog-resize-v3.is-se'); const handleBox = await handle.boundingBox(); if (!before || !handleBox) throw new Error('resize geometry missing')
  expect(before.y).toBeGreaterThanOrEqual(filterBefore.y + filterBefore.height)
  await page.mouse.move(handleBox.x + 3, handleBox.y + 3); await page.mouse.down(); await page.mouse.move(handleBox.x + 70, handleBox.y + 50); await page.mouse.up()
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)))
  const after = await dialog.boundingBox(); if (!after) throw new Error('resized geometry missing')
  expect(after.width).toBeGreaterThan(before.width); expect(after.height).toBeGreaterThan(before.height)
  expect(after.y).toBeGreaterThanOrEqual(filterBefore.y + filterBefore.height)
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

test('native dialog renders chart/KPI/table, filters its own data, downloads and closes on row action', async ({ page }) => {
  const application = structuredClone(example), target = application.pages.find((item: { id: string }) => item.id === 'page-dialog')
  const base = structuredClone(application.pages[0].components[0])
  const data = { version: 3, sourceKind: 'server', datasetId: 'dataset-dialog-native', dimensions: [{ field: 'department_code', role: 'category' }], measures: [{ field: 'visits', aggregation: 'sum', axis: 'left' }], filters: [], sort: [], limit: 100, parameterBindings: [{ datasetParameterCode: 'hospital_code', parameterId: 'parameter-hospital' }], refreshPolicy: 'onParameterChange' }
  const analysis = { xMin: null, xMax: null, yLeftMin: null, yLeftMax: null, yRightMin: null, yRightMax: null, showLabels: false, labelDecimals: 0, labelPosition: 'top', labelMode: 'value', labelShowCategory: false, labelShowSeries: false, labelUnit: '', percentageBase: 'category', leftAxisTitle: '', leftAxisUnit: '', leftAxisColor: '#64748b', rightAxisTitle: '', rightAxisUnit: '', rightAxisColor: '#64748b', legendVisible: true, legendPosition: 'bottom', warningLines: [] }
  const chart = { ...structuredClone(base), id: 'dialog-native-chart', title: '弹窗原生图表', type: 'bar', dataConfig: data, analysisConfig: analysis, position: { x: 20, y: 20, width: 400, height: 240, zIndex: 1 }, events: [] }
  const kpi = { ...structuredClone(base), id: 'dialog-native-kpi', title: '弹窗原生指标', type: 'kpi', dataConfig: data, kpiConfig: { primaryMeasureField: 'visits', unit: '人次', decimals: 0, useGrouping: true, yoyField: '', momField: '', positiveColor: '#008800', negativeColor: '#cc0000', targetMode: 'fixed', targetValue: 0, targetField: '', showProgress: false, progressColor: '#008800' }, position: { x: 20, y: 280, width: 400, height: 130, zIndex: 1 }, events: [] }
  const table = { ...structuredClone(base), id: 'dialog-native-table', title: '弹窗原生明细', dataConfig: data, position: { x: 20, y: 440, width: 400, height: 300, zIndex: 1 }, tableConfig: { columns: [{ field: 'department_code', label: '科室', width: 140, format: 'auto', summary: 'none' }, { field: 'visits', label: '人次', width: 100, format: 'number', summary: 'none' }], striped: true, showHeader: true }, events: [{ id: 'native-row-event', enabled: true, event: 'rowClick', actions: [{ id: 'native-close', type: 'closeDialog' }] }] }
  const tabs = { ...structuredClone(base), id: 'dialog-native-tabs', title: '弹窗页签', type: 'tabs', dataConfig: { ...data, sourceKind: 'mock', datasetId: 'mock-empty', dimensions: [], measures: [], parameterBindings: [] }, position: { x: 20, y: 20, width: 480, height: 520, zIndex: 1 }, tabsConfig: { activeItemId: 'native-first', titlePosition: 'top', titleSize: 38, alignment: 'left', stylePreset: 'default', items: [{ id: 'native-first', label: '指标趋势', value: 'first', visible: true, padding: 12, gap: 12, background: '#ffffff', componentIds: [chart.id, kpi.id] }, { id: 'native-second', label: '其他', value: 'second', visible: true, padding: 12, gap: 12, background: '#ffffff', componentIds: [] }] }, events: [] }
  table.position.y = 560
  target.components = [tabs, chart, kpi, table]
  target.canvas.height = 900
  target.controls = [{ id: 'dialog-native-filter', type: 'input', parameterIds: ['parameter-hospital'], position: { x: 20, y: 20, width: 240, height: 44, zIndex: 1 }, styleConfig: { labelColor: '#243447', labelSize: 12 }, interaction: { submitMode: 'immediate', clearable: true } }]
  expect(validateDashboardApplicationV3(application).issues).toEqual([])
  const requests: Array<Record<string, unknown>> = []
  await page.route('**/api/datasets/dataset-dialog-native/execute', async route => {
    const body = route.request().postDataJSON(), value = body.parameters?.hospital_code === 'H2' ? 11 : 7
    requests.push(body.parameters ?? {})
    await route.fulfill({ json: { fields: [{ name: 'department_code', dataType: 'string' }, { name: 'visits', dataType: 'number' }], rows: [{ department_code: 'SYNTHETIC', visits: value }], rowCount: 1 } })
  })
  await replaceDashboardFixture(page, application); await page.reload(); await page.getByRole('button', { name: '预览', exact: true }).click()
  await page.locator('[data-component-id="component-dialog"]').click()
  const dialog = page.getByRole('dialog', { name: /交互详情/ })
  await expect(dialog.locator('[data-component-id="dialog-native-chart"] canvas')).toBeVisible()
  await expect(dialog.locator('[data-component-id="dialog-native-kpi"] .kpi-value')).toContainText('7')
  await dialog.getByRole('button', { name: '其他', exact: true }).click()
  await expect(dialog.locator('[data-component-id="dialog-native-chart"]')).toHaveCount(0)
  await dialog.getByRole('button', { name: '指标趋势', exact: true }).click()
  await expect(dialog.locator('[data-component-id="dialog-native-chart"] canvas')).toBeVisible()
  await dialog.getByLabel('医院', { exact: true }).fill('H2'); await dialog.getByLabel('医院', { exact: true }).press('Tab')
  await expect(dialog.locator('[data-component-id="dialog-native-kpi"] .kpi-value')).toContainText('11')
  await expect.poll(() => requests.some(request => request.hospital_code === 'H2')).toBe(true)
  const download = page.waitForEvent('download')
  await dialog.getByRole('button', { name: /下载/ }).click(); expect((await download).suggestedFilename()).toMatch(/\.csv$/)
  mkdirSync('E:/codex/work/tybi-interaction-perf-20261009', { recursive: true })
  await page.screenshot({ path: 'E:/codex/work/tybi-interaction-perf-20261009/native-dialog-desktop.png' })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(dialog).toBeVisible()
  const rect = await dialog.boundingBox(); expect(rect!.x + rect!.width).toBeLessThanOrEqual(390)
  await page.screenshot({ path: 'E:/codex/work/tybi-interaction-perf-20261009/native-dialog-phone.png' })
  await dialog.locator('[data-component-id="dialog-native-table"] tbody tr').click()
  await expect(dialog).toHaveCount(0)
})

test('P10.6 browser adapter requests noopener/noreferrer and never exposes opener', async ({ page, context }) => {
  const application = structuredClone(example)
  application.pages[0].components = [{ ...application.pages[0].components.find((component: { id: string }) => component.id === 'component-dialog'), id: 'component-window', title: '新窗口', events: [{ id: 'event-window', enabled: true, event: 'click', actions: [{ id: 'action-window', type: 'openPageWindow', pageId: 'page-department' }] }] }]
  await replaceDashboardFixture(page, application); await page.reload(); await page.getByRole('button', { name: '预览', exact: true }).click()
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
  const panel = page.getByRole('dialog', { name: '事件配置', exact: true })
  await panel.getByRole('button', { name: '高级编辑', exact: true }).click()
  await panel.getByLabel('新建事件').selectOption('doubleClick')
  await panel.getByLabel('新增交互动作').selectOption('navigatePage')
  await expect(panel.getByLabel('目标页面')).toBeVisible()
  await expect(panel.getByLabel('历史记录')).toHaveValue('push')
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
  await replaceDashboardFixture(page, application)
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
