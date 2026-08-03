import { expect, test } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const phase8Example = fileURLToPath(new URL('../../docs/02_V3架构/示例/dashboard-v3-phase8.json', import.meta.url))

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
