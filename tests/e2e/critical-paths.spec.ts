import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const phase8Example = fileURLToPath(new URL('../../docs/02_V3架构/示例/dashboard-v3-phase8.json', import.meta.url))
const phase9Example = fileURLToPath(new URL('../../docs/02_V3架构/示例/dashboard-v3-phase9.json', import.meta.url))

test.beforeEach(async ({ page }) => {
  const pageErrors: Error[] = []
  page.on('pageerror', (error) => pageErrors.push(error))
  await page.goto('/')
  await expect(page.getByText('医疗 BI Designer', { exact: true })).toBeVisible()
  expect(pageErrors, '页面加载期间不应出现未捕获异常').toEqual([])
})

test('设计器可以新增组件并保留核心工作区', async ({ page }) => {
  const components = page.locator('.design-component')
  const originalCount = await components.count()

  await page.getByRole('button', { name: '折线图', exact: true }).click()

  await expect(components).toHaveCount(originalCount + 1)
  await expect(page.getByText('组件配置', { exact: true })).toBeVisible()
})

test('数据管理主页面均可从设计器进入', async ({ page }) => {
  await page.getByRole('link', { name: '参数中心', exact: true }).click()
  await expect(page).toHaveURL(/\/parameters$/)
  await expect(page.getByRole('heading', { name: '参数中心', exact: true })).toBeVisible()

  await page.getByRole('link', { name: '数据集', exact: true }).click()
  await expect(page).toHaveURL(/\/datasets(?:\?.*)?$/)
  await expect(page.getByRole('heading', { name: '数据集目录', exact: true })).toBeVisible()

  await page.getByRole('link', { name: '数据源', exact: true }).click()
  await expect(page).toHaveURL(/\/data-sources$/)
  await expect(page.getByRole('heading', { name: '数据源', exact: true })).toBeVisible()
})

test('参数中心可以保存合成参数定义', async ({ page }) => {
  await page.goto('/parameters')
  await page.getByLabel('参数名称').fill('自动化测试年度')
  await page.getByLabel('参数编码').fill('e2e_test_year')
  await page.getByRole('button', { name: '保存到 V3 草稿' }).click()

  await expect(page.getByText('参数已创建', { exact: true })).toBeVisible()
  await expect(page.getByText('e2e_test_year', { exact: true }).first()).toBeVisible()
})

test('本地 API 健康检查可用', async ({ request }) => {
  const response = await request.get('http://127.0.0.1:5175/api/health')
  expect(response.ok()).toBeTruthy()
  await expect(response.json()).resolves.toMatchObject({ ok: true, service: 'medical-bi-api' })
})

test('Phase8 控件导入、参数刷新、保存和重载保持运行时边界', async ({ page }) => {
  await page.locator('input[type="file"]').setInputFiles(phase8Example)
  await expect(page.getByText('V3 JSON 已导入', { exact: true })).toBeVisible()
  await expect(page.getByLabel('运行时筛选条件')).toBeVisible()

  const request = page.waitForRequest((candidate) =>
    candidate.method() === 'POST' && candidate.url().includes('/api/datasets/dataset-income-example/execute'))
  await page.locator('.runtime-button-group button').filter({ hasText: '2025' }).click()
  await request

  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.reload()
  await expect(page.getByLabel('运行时筛选条件')).toBeVisible()
  await expect(page.locator('.runtime-button-group button').filter({ hasText: '2026' })).toHaveClass(/active/)
})

test('P9.7 Phase9 示例仅在预览执行真实事件查询并保持刷新作用域', async ({ page }) => {
  test.setTimeout(60_000)
  const requests: Array<{ datasetId: string; body: Record<string, unknown> }> = []
  await page.route('**/api/datasets/*/execute', async (route) => {
    const request = route.request(); const match = new URL(request.url()).pathname.match(/\/api\/datasets\/([^/]+)\/execute$/); const datasetId = decodeURIComponent(match?.[1] ?? '')
    requests.push({ datasetId, body: request.postDataJSON() as Record<string, unknown> })
    if (datasetId === 'dataset-failure') { await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: '预期的部分失败' }) }); return }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fields: [{ name: 'label', dataType: 'string' }, { name: 'month', dataType: 'string' }, { name: 'amount', dataType: 'number' }], rows: [{ label: `ok-${datasetId}`, month: '01', amount: 10 }], rowCount: 1 }) })
  })
  const component = (id: string) => page.locator(`[data-component-id="${id}"]`)
  await test.step('import/design0', async () => { await page.locator('input[type="file"]').setInputFiles(phase9Example); await expect(page.getByText('V3 JSON 已导入', { exact: true })).toBeVisible(); await component('component-set-parameter').click(); expect(requests).toHaveLength(0) })

  const entryBeforePreview = requests.filter((item) => item.datasetId === 'dataset-entry').length
  await test.step('preview/pageEnter', async () => { await page.getByRole('button', { name: '预览', exact: true }).click(); await expect.poll(() => requests.filter((item) => item.datasetId === 'dataset-entry').length - entryBeforePreview).toBe(2) })
  const incomeBeforeSet = requests.filter((item) => item.datasetId === 'dataset-income').length
  await test.step('setParameter', async () => { await component('component-set-parameter').click(); await expect.poll(() => requests.filter((item) => item.datasetId === 'dataset-income').length - incomeBeforeSet).toBe(1); expect(requests.filter((item) => item.datasetId === 'dataset-income').at(-1)?.body).toMatchObject({ parameters: { year_code: '2025' } }) })

  const incomeBeforeComponentRefresh = requests.filter((item) => item.datasetId === 'dataset-income').length
  await test.step('componentRefresh', async () => { await component('component-one-refresh').click(); await expect.poll(() => requests.filter((item) => item.datasetId === 'dataset-income').length - incomeBeforeComponentRefresh).toBe(1); expect(requests.filter((item) => item.datasetId === 'dataset-other')).toHaveLength(0); expect(requests.filter((item) => item.datasetId === 'dataset-entry').length - entryBeforePreview).toBe(2) })

  const pageDatasetIds = ['dataset-trigger', 'dataset-page-trigger', 'dataset-component-trigger', 'dataset-income', 'dataset-entry', 'dataset-failure']
  const pageBaselines = Object.fromEntries(pageDatasetIds.map((datasetId) => [datasetId, requests.filter((item) => item.datasetId === datasetId).length]))
  const pageDeltas = (baselines: Record<string, number>) => Object.fromEntries(pageDatasetIds.map((datasetId) => [datasetId, requests.filter((item) => item.datasetId === datasetId).length - baselines[datasetId]]))
  const expectedPageDeltas = Object.fromEntries(pageDatasetIds.map((datasetId) => [datasetId, 1]))
  await test.step('pageRefresh/partial', async () => { await component('component-page-refresh').click(); await expect(page.getByRole('alert')).toContainText('部分完成'); await expect.poll(() => pageDeltas(pageBaselines)).toEqual(expectedPageDeltas); expect(requests.filter((item) => item.datasetId === 'dataset-other')).toHaveLength(0); await expect(component('component-income').getByRole('cell', { name: '01', exact: true })).toBeVisible(); await expect(component('component-income').getByRole('cell', { name: '10', exact: true })).toBeVisible() })

  const forceBaselines = Object.fromEntries(pageDatasetIds.map((datasetId) => [datasetId, requests.filter((item) => item.datasetId === datasetId).length]))
  await test.step('force', async () => { await component('component-page-refresh').click(); await expect.poll(() => pageDeltas(forceBaselines)).toEqual(expectedPageDeltas) })
})

test('P9.7 切页、退出和重导入均拒绝挂起旧响应覆盖当前 UI', async ({ page }) => {
  test.setTimeout(60_000)
  class GateTimeoutError extends Error {}
  const bounded = <T>(promise: Promise<T>, label: string, timeoutMs = 5_000) => new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new GateTimeoutError(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    promise.then(
      (value) => { clearTimeout(timer); resolve(value) },
      (error) => { clearTimeout(timer); reject(error) },
    )
  })
  let holdEntry = false; let announceHeld: (() => void) | undefined; let releaseHeld: (() => void) | undefined; let heldDone: Promise<void> | undefined; let finishHeld: ((error?: unknown) => void) | undefined
  await page.route('**/api/datasets/*/execute', async (route) => {
    const datasetId = decodeURIComponent(new URL(route.request().url()).pathname.match(/\/api\/datasets\/([^/]+)\/execute$/)?.[1] ?? '')
    if (datasetId === 'dataset-entry' && holdEntry) {
      holdEntry = false; announceHeld?.()
      let heldError: unknown
      try {
        await new Promise<void>((resolve) => { releaseHeld = resolve })
        await bounded(route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fields: [{ name: 'label', dataType: 'string' }], rows: [{ label: 'OLD-RESPONSE' }], rowCount: 1 }) }), 'held route settlement')
      } catch (error) {
        const detail = `${route.request().failure()?.errorText ?? ''} ${error instanceof Error ? error.message : String(error)}`
        if (error instanceof GateTimeoutError || !/abort|cancel|closed|disposed/i.test(detail)) heldError = error
      }
      finally { finishHeld?.(heldError) }
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ fields: [{ name: 'label', dataType: 'string' }], rows: [{ label: `NEW-${datasetId}` }], rowCount: 1 }) })
  })
  const importExample = async () => { await page.locator('input[type="file"]').setInputFiles(phase9Example); await expect(page.getByText('V3 JSON 已导入', { exact: true })).toBeVisible() }
  const beginHeldPreview = async () => {
    holdEntry = true
    heldDone = new Promise<void>((resolve, reject) => {
      finishHeld = (error) => error ? reject(error) : resolve()
    })
    const requested = new Promise<void>((resolve) => { announceHeld = resolve })
    const previewClick = page.getByRole('button', { name: '预览', exact: true }).click()
    await bounded(requested, 'dataset-entry request latch')
    return { previewClick }
  }
  const release = async () => {
    releaseHeld?.()
    if (heldDone) await bounded(heldDone, 'dataset-entry release latch')
    releaseHeld = undefined; heldDone = undefined; finishHeld = undefined; announceHeld = undefined
  }

  let primaryError: unknown
  try {
    await test.step('切页后拒绝旧响应', async () => {
      await importExample(); const switchingPreview = await beginHeldPreview(); const switchPage = page.getByRole('tab', { name: /其他页面/ }).click()
      await expect(page.getByRole('tab', { name: /其他页面/ })).toHaveAttribute('aria-selected', 'true'); await release(); await switchPage; await switchingPreview.previewClick
      await expect(page.locator('[data-component-id="component-other-page"]')).toContainText('NEW-dataset-other')
      await page.getByRole('tab', { name: /首页/ }).click(); await expect(page.locator('[data-component-id="component-entry"]')).toContainText('NEW-dataset-entry'); await expect(page.locator('body')).not.toContainText('OLD-RESPONSE')
    })

    await test.step('退出预览后拒绝旧响应', async () => {
      await importExample(); const exitingPreview = await beginHeldPreview(); const exitPreview = page.getByRole('button', { name: '退出预览', exact: true }).click()
      await expect(page.getByRole('button', { name: '预览', exact: true })).toBeVisible(); await release(); await exitPreview; await exitingPreview.previewClick
      await expect(page.locator('body')).not.toContainText('OLD-RESPONSE')
    })

    await test.step('重导入后拒绝旧响应且新结果可见', async () => {
      const importingPreview = await beginHeldPreview(); const reimport = importExample(); await expect(page.getByText('V3 JSON 已导入', { exact: true })).toBeVisible(); await release(); await reimport; await importingPreview.previewClick
      await expect(page.locator('body')).not.toContainText('OLD-RESPONSE')
      await page.getByRole('button', { name: '预览', exact: true }).click(); await expect(page.locator('[data-component-id="component-entry"]')).toContainText('NEW-dataset-entry')
    })
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    let cleanupError: unknown
    try {
      releaseHeld?.()
      if (heldDone) await bounded(heldDone, 'dataset-entry cleanup latch')
    } catch (error) {
      cleanupError = error
    } finally {
      try { await page.unrouteAll({ behavior: 'ignoreErrors' }) }
      catch (error) { cleanupError ??= error }
    }
    if (!primaryError && cleanupError) throw cleanupError
  }
})

test('P9.2 页面切换保存当前草稿且活动页不进入持久化 JSON', async ({ page }) => {
  const homeComponents = await page.locator('.design-component').count()
  await page.getByRole('button', { name: '新建页面' }).click()
  const editor = page.getByRole('form', { name: '新建页面' })
  await editor.getByLabel('页面名称').fill('质量分析')
  await editor.getByLabel('页面编码').fill('quality_analysis')
  await editor.getByRole('button', { name: '创建页面' }).click()

  await expect(page.getByRole('tab', { name: /质量分析/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('.design-component')).toHaveCount(0)
  await page.getByRole('button', { name: '折线图', exact: true }).click()
  await expect(page.locator('.design-component')).toHaveCount(1)

  await page.getByRole('tab', { name: /首页/ }).click()
  await expect(page.locator('.design-component')).toHaveCount(homeComponents)
  await expect(page.locator('.design-component.is-selected')).toHaveCount(0)
  await page.getByRole('tab', { name: /质量分析/ }).click()
  await expect(page.locator('.design-component')).toHaveCount(1)

  await page.getByRole('button', { name: '保存', exact: true }).click()
  const persisted = await page.evaluate(() => localStorage.getItem('medical-bi-designer-dashboard-v3') || '')
  expect(persisted).not.toContain('activePageId')
  await page.reload()
  await page.getByRole('tab', { name: /质量分析/ }).click()
  await expect(page.locator('.design-component')).toHaveCount(1)
})

test('P9.2 页面管理组合操作保持确认、排序和默认页边界', async ({ page }) => {
  const pageManager = page.getByLabel('页面管理')
  const tabs = pageManager.getByRole('tab')
  await expect(page.getByRole('button', { name: '不能删除最后一个页面' })).toBeDisabled()

  await page.getByRole('button', { name: '新建页面' }).click()
  let editor = page.getByRole('form', { name: '新建页面' })
  await editor.getByLabel('页面名称').fill('页面 Alpha')
  await editor.getByLabel('页面编码').fill('alpha')
  await editor.getByRole('button', { name: '创建页面' }).click()
  await expect(tabs).toHaveCount(2)

  await page.getByRole('button', { name: '新建页面' }).click()
  editor = page.getByRole('form', { name: '新建页面' })
  await editor.getByLabel('页面名称').fill('重复 Alpha')
  await editor.getByLabel('页面编码').fill('alpha')
  await editor.getByRole('button', { name: '创建页面' }).click()
  await expect(editor.getByRole('alert')).toContainText('页面编码已存在')
  await expect(editor.getByLabel('页面名称')).toHaveValue('重复 Alpha')
  await expect(editor.getByLabel('页面编码')).toHaveValue('alpha')
  await editor.getByRole('button', { name: '取消页面编辑' }).click()

  await page.getByRole('button', { name: '删除当前页面' }).click()
  await expect(page.getByRole('button', { name: '确认删除当前页面' })).toBeVisible()
  await page.getByRole('tab', { name: /首页/ }).click()
  await page.getByRole('tab', { name: /页面 Alpha/ }).click()
  await page.getByRole('button', { name: '删除当前页面' }).click()
  await expect(tabs).toHaveCount(2)
  await expect(page.getByRole('button', { name: '确认删除当前页面' })).toBeVisible()

  await page.getByRole('tab', { name: /首页/ }).click()
  await page.getByRole('tab', { name: /页面 Alpha/ }).click()
  await page.getByRole('button', { name: '复制当前页面' }).click()
  await page.getByRole('form', { name: '复制页面' }).getByRole('button', { name: '创建副本' }).click()
  await expect(tabs).toHaveCount(3)
  const copiedTab = page.getByRole('tab', { name: /页面 Alpha 副本/ })
  await expect(copiedTab).toHaveAttribute('aria-selected', 'true')

  await expect(page.getByRole('button', { name: '下移当前页面' })).toBeDisabled()
  await page.getByRole('button', { name: '上移当前页面' }).click()
  await expect(page.getByRole('button', { name: '下移当前页面' })).toBeEnabled()
  await page.getByRole('button', { name: '下移当前页面' }).click()
  await expect(page.getByRole('button', { name: '下移当前页面' })).toBeDisabled()

  await page.getByRole('button', { name: '设为默认页' }).click()
  await expect(copiedTab).toContainText('默认')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('tab', { name: /页面 Alpha 副本.*默认/ })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: '请先设置其他默认页，再删除当前页' })).toBeDisabled()

  const alphaTab = tabs.filter({ hasText: '页面 Alpha', hasNotText: '副本' })
  await alphaTab.click()
  await page.getByRole('button', { name: '删除当前页面' }).click()
  await page.getByRole('button', { name: '确认删除当前页面' }).click()
  await expect(page.getByRole('tab', { name: /页面 Alpha 副本.*默认/ })).toHaveAttribute('aria-selected', 'true')
  await expect(alphaTab).toHaveCount(0)

  await page.getByRole('tab', { name: /首页/ }).click()
  await page.getByRole('button', { name: '删除当前页面' }).click()
  await page.getByRole('button', { name: '确认删除当前页面' }).click()
  await expect(tabs).toHaveCount(1)
  await expect(page.getByRole('button', { name: '不能删除最后一个页面' })).toBeDisabled()

  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.evaluate(() => {
    const key = 'medical-bi-designer-dashboard-v3'
    const application = JSON.parse(localStorage.getItem(key) || '{}')
    application.pages[0].type = 'dialog'
    localStorage.setItem(key, JSON.stringify(application))
  })
  await page.reload()
  await expect(page.getByRole('tab', { name: /兼容页/ })).toBeVisible()
  await expect(page.getByRole('button', { name: '复制当前页面' })).toBeDisabled()
})

test('P9.3 受控页面与组件事件可保存且配置过程不执行动作', async ({ page }) => {
  test.setTimeout(60_000)
  let executeRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && request.url().includes('/execute')) executeRequests += 1
  })

  await page.getByRole('button', { name: '新建页面' }).click()
  const pageEditor = page.getByRole('form', { name: '新建页面' })
  await pageEditor.getByLabel('页面名称').fill('事件测试页')
  await pageEditor.getByLabel('页面编码').fill('event_test')
  await pageEditor.getByRole('button', { name: '创建页面' }).click()
  const detailTab = page.getByRole('tab', { name: /事件测试页/ })
  await page.getByRole('tab', { name: /首页/ }).click()

  await page.getByRole('button', { name: '配置页面事件' }).click()
  let panel = page.getByRole('complementary', { name: '事件配置', exact: true })
  await panel.getByLabel('新建事件').selectOption('pageEnter')
  await panel.getByRole('button', { name: '+ Refresh' }).click()
  await panel.getByRole('button', { name: '应用', exact: true }).click()
  await expect(panel.getByRole('button', { name: /pageEnter/ })).toBeVisible()
  await expect(panel.getByText(/navigate/i)).toHaveCount(0)
  await expect(panel.getByText(/script/i)).toHaveCount(0)
  await panel.getByRole('button', { name: '关闭事件配置' }).click()

  await page.locator('.design-component').first().click()
  await page.getByRole('tab', { name: '交互', exact: true }).click()
  await page.getByRole('button', { name: '配置组件事件' }).click()
  panel = page.getByRole('complementary', { name: '事件配置', exact: true })
  await panel.getByLabel('新建事件').selectOption('click')
  await panel.getByRole('button', { name: '+ Refresh' }).click()
  await panel.getByRole('button', { name: '应用', exact: true }).click()
  await panel.getByRole('button', { name: '关闭事件配置' }).click()

  await page.getByRole('button', { name: '保存', exact: true }).click()
  const persistedBeforeDraft = await page.evaluate(() => localStorage.getItem('medical-bi-designer-dashboard-v3') || '')
  expect(persistedBeforeDraft).not.toContain('dirty')
  expect(persistedBeforeDraft).not.toContain('selectedEventId')

  await page.locator('.design-component').first().click()
  await page.getByRole('tab', { name: '交互', exact: true }).click()
  await page.getByRole('button', { name: '配置组件事件' }).click()
  panel = page.getByRole('complementary', { name: '事件配置', exact: true })
  await panel.getByRole('button', { name: /click/ }).click()
  await panel.getByLabel('启用').uncheck()
  expect(await page.evaluate(() => localStorage.getItem('medical-bi-designer-dashboard-v3') || '')).toBe(persistedBeforeDraft)

  page.once('dialog', (dialog) => dialog.dismiss())
  await detailTab.evaluate((button: HTMLElement) => button.click())
  await expect(panel).toBeVisible()
  await expect(page.getByRole('tab', { name: /首页/ })).toHaveAttribute('aria-selected', 'true')

  page.once('dialog', (dialog) => dialog.accept('放弃'))
  await detailTab.evaluate((button: HTMLElement) => button.click())
  await expect(panel).toHaveCount(0)
  await expect(detailTab).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('tab', { name: /首页/ }).click()

  await page.getByRole('button', { name: '配置页面事件' }).click()
  panel = page.getByRole('complementary', { name: '事件配置', exact: true })
  await expect(panel.getByRole('button', { name: /pageEnter/ })).toBeVisible()
  await panel.getByRole('button', { name: '关闭事件配置' }).click()
  await page.locator('.design-component').first().click()
  await page.getByRole('tab', { name: '交互', exact: true }).click()
  await page.getByRole('button', { name: '配置组件事件' }).click()
  panel = page.getByRole('complementary', { name: '事件配置', exact: true })
  await expect(panel.getByRole('button', { name: /click/ })).toBeVisible()
  await panel.getByRole('button', { name: '关闭事件配置' }).click()

  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.evaluate(() => {
    const key = 'medical-bi-designer-dashboard-v3'
    const application = JSON.parse(localStorage.getItem(key) || '{}')
    const detail = application.pages.find((candidate: { code: string }) => candidate.code === 'event_test')
    detail.type = 'dialog'
    localStorage.setItem(key, JSON.stringify(application))
  })
  await page.reload()
  await page.getByRole('tab', { name: /事件测试页/ }).click()
  await page.getByRole('button', { name: '配置页面事件' }).click()
  panel = page.getByRole('complementary', { name: '事件配置', exact: true })
  await expect(panel.getByText('dialog 既有事件仅供只读查看')).toBeVisible()
  await expect(panel.getByLabel('新建事件')).toHaveCount(0)
  expect(executeRequests).toBe(0)
})

test('P9.3 dirty owner 键盘删除支持应用、放弃和取消三分支', async ({ page }) => {
  const components = page.locator('.design-component')
  const originalCount = await components.count()

  const openDirtyClickDraft = async () => {
    await components.first().click()
    await page.getByRole('tab', { name: '交互', exact: true }).click()
    await page.getByRole('button', { name: '配置组件事件' }).click()
    const panel = page.getByRole('complementary', { name: '事件配置', exact: true })
    await panel.getByLabel('新建事件').selectOption('click')
    await panel.getByRole('button', { name: '+ Refresh' }).click()
    return panel
  }

  let panel = await openDirtyClickDraft()
  page.once('dialog', (dialog) => dialog.accept('取消'))
  await page.keyboard.press('Delete')
  await expect(components).toHaveCount(originalCount)
  await expect(panel).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept('应用'))
  await page.keyboard.press('Delete')
  await expect(components).toHaveCount(originalCount - 1)
  await expect(panel).toHaveCount(0)

  panel = await openDirtyClickDraft()
  page.once('dialog', (dialog) => dialog.accept('放弃'))
  await page.keyboard.press('Backspace')
  await expect(components).toHaveCount(originalCount - 2)
  await expect(panel).toHaveCount(0)
})

test('P9.3 Refresh 可选择同页多组件且清空 debounce 后不持久化', async ({ page }) => {
  const components = page.locator('.design-component')
  await components.first().click()
  await page.getByRole('tab', { name: '交互', exact: true }).click()
  await page.getByRole('button', { name: '配置组件事件' }).click()
  const panel = page.getByRole('complementary', { name: '事件配置', exact: true })
  await panel.getByLabel('新建事件').selectOption('click')
  await panel.getByRole('button', { name: '+ Refresh' }).click()
  await panel.getByLabel('刷新目标类型').selectOption('components')
  const target = panel.getByLabel('刷新组件')
  const values = await target.locator('option').evaluateAll((options) => options.slice(0, 2).map((option) => (option as HTMLOptionElement).value))
  expect(values).toHaveLength(2)
  await target.selectOption(values)
  const debounce = panel.getByLabel('防抖 ms')
  await debounce.fill('250')
  await debounce.blur()
  await debounce.fill('')
  await debounce.blur()
  await panel.getByRole('button', { name: '应用', exact: true }).click()
  await panel.getByRole('button', { name: '关闭事件配置' }).click()
  await page.getByRole('button', { name: '保存', exact: true }).click()

  const event = await page.evaluate(() => {
    const application = JSON.parse(localStorage.getItem('medical-bi-designer-dashboard-v3') || '{}')
    return application.pages[0].components.find((component: { events?: unknown[] }) => component.events?.length)?.events[0]
  }) as { debounceMs?: number; actions: Array<{ type: string; target?: { componentIds?: string[] } }> }
  expect(event).not.toHaveProperty('debounceMs')
  expect(event.actions.find((action) => action.type === 'refresh')?.target?.componentIds).toEqual(values)
})

test('P9.3 超策略旧 binding 在事件面板全链路只读', async ({ page }) => {
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await page.evaluate(() => {
    const key = 'medical-bi-designer-dashboard-v3'
    const application = JSON.parse(localStorage.getItem(key) || '{}')
    const component = application.pages[0].components[0]
    component.events = [{
      id: 'legacy-click', enabled: true, event: 'click',
      conditions: [{ left: { kind: 'eventField', path: 'datum.value' }, operator: 'notEmpty' }],
      actions: [
        { id: 'legacy-refresh-1', type: 'refresh', target: { kind: 'page', pageId: application.pages[0].id } },
        { id: 'legacy-refresh-2', type: 'refresh', target: { kind: 'page', pageId: application.pages[0].id } },
      ],
    }]
    localStorage.setItem(key, JSON.stringify(application))
  })
  await page.reload()
  await page.locator('.design-component').first().click()
  await page.getByRole('tab', { name: '交互', exact: true }).click()
  await page.getByRole('button', { name: '配置组件事件' }).click()
  const panel = page.getByRole('complementary', { name: '事件配置', exact: true })
  await panel.getByRole('button', { name: /click/ }).click()
  await expect(panel.getByText(/真实绑定目录/)).toBeVisible()
  await expect(panel.getByLabel('启用')).toBeDisabled()
  await expect(panel.getByRole('button', { name: '删除事件' })).toBeDisabled()
  await expect(panel.getByRole('button', { name: '应用', exact: true })).toBeDisabled()
  await expect(panel.locator('.action-card button:not(:disabled)')).toHaveCount(0)
})
