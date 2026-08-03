import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createDefaultDashboardApplicationV3,
  getDefaultPageV3,
} from '../src/models/dashboard-v3.ts'
import {
  assertDashboardApplicationV3,
  validateDashboardApplicationV3,
} from '../src/services/dashboardValidationV3.ts'

test('V3 默认工厂建立单页 1200 × 600 应用', () => {
  const application = createDefaultDashboardApplicationV3()
  const page = getDefaultPageV3(application)

  assert.equal(application.version, 3)
  assert.equal(application.pages.length, 1)
  assert.equal(application.defaultPageId, page.id)
  assert.deepEqual(page.canvas, {
    width: 1200,
    height: 600,
    background: '#f7f9fb',
    showGrid: true,
    gridSize: 12,
  })
  assert.deepEqual(page.controls, [])
  assert.deepEqual(page.pageEvents, [])
  assert.equal(validateDashboardApplicationV3(application).valid, true)
})

test('V3 工厂每次返回相互独立的应用对象', () => {
  const first = createDefaultDashboardApplicationV3()
  const second = createDefaultDashboardApplicationV3()

  first.theme.tokens.brand = '#1477c9'
  first.pages[0].canvas.width = 1600

  assert.deepEqual(second.theme.tokens, {})
  assert.equal(second.pages[0].canvas.width, 1200)
})

test('V3 Schema 拒绝错误版本、缺失页面与不完整控件', () => {
  const wrongVersion = { ...createDefaultDashboardApplicationV3(), version: 2 }
  const missingPages = { ...createDefaultDashboardApplicationV3(), pages: [] }
  const withControl = createDefaultDashboardApplicationV3()
  withControl.pages[0].controls.push({ id: 'control-1' } as never)

  assert.equal(validateDashboardApplicationV3(wrongVersion).valid, false)
  assert.equal(validateDashboardApplicationV3(missingPages).valid, false)
  assert.equal(validateDashboardApplicationV3(withControl).valid, false)
})

test('V3 语义校验拒绝不存在的默认页和重复参数编码', () => {
  const missingDefaultPage = {
    ...createDefaultDashboardApplicationV3(),
    defaultPageId: 'page-missing',
  }
  const duplicateParameterCode = createDefaultDashboardApplicationV3()
  duplicateParameterCode.parameters = [
    {
      id: 'parameter-year-1',
      code: 'year_code',
      name: '年度一',
      type: 'singleSelect',
      scope: 'application',
      required: false,
      source: { kind: 'dictionary', dictionaryCode: 'builtin.year' },
    },
    {
      id: 'parameter-year-2',
      code: 'year_code',
      name: '年度二',
      type: 'singleSelect',
      scope: 'application',
      required: false,
      source: { kind: 'dictionary', dictionaryCode: 'builtin.year' },
    },
  ]

  const referenceResult = validateDashboardApplicationV3(missingDefaultPage)
  const duplicateResult = validateDashboardApplicationV3(duplicateParameterCode)

  assert.equal(referenceResult.valid, false)
  assert.equal(referenceResult.issues[0]?.path, '/defaultPageId')
  assert.equal(duplicateResult.valid, false)
  assert.equal(duplicateResult.issues[0]?.keyword, 'uniqueParameterCode')
})

test('V3 校验错误包含可定位路径', () => {
  const application = createDefaultDashboardApplicationV3()
  application.pages[0].canvas.width = 0

  const result = validateDashboardApplicationV3(application)
  assert.equal(result.valid, false)
  assert.equal(result.issues.some((issue) => issue.path === '/pages/0/canvas/width'), true)
  assert.throws(
    () => assertDashboardApplicationV3(application),
    /\/pages\/0\/canvas\/width/,
  )
})

test('未知扩展引用可以安全通过并往返', () => {
  const application = createDefaultDashboardApplicationV3()
  application.extensionRefs.futureProviderRef = 'future-provider'

  assert.equal(validateDashboardApplicationV3(application).valid, true)
  const cloned = JSON.parse(JSON.stringify(application))
  assert.equal(cloned.extensionRefs.futureProviderRef, 'future-provider')
})
