import Ajv, { type ErrorObject } from 'ajv'
import dashboardV3Schema from '../schemas/dashboard-v3.schema.json' with { type: 'json' }
import type {
  DashboardApplicationV3,
  EventBindingV3,
  ValueExpressionV3,
} from '../models/dashboard-v3'
import { buildParameterDependencyDagV3 } from './parameterOptionsRuntimeV3.ts'
import { isSafeStyleTokenV3 } from './safeStyleV3.ts'

export interface DashboardValidationIssueV3 {
  path: string
  keyword: string
  message: string
}

export interface DashboardValidationResultV3 {
  valid: boolean
  issues: DashboardValidationIssueV3[]
}

const ajv = new Ajv({ allErrors: true, strict: false })
const validateSchema = ajv.compile(dashboardV3Schema)

function schemaIssue(error: ErrorObject): DashboardValidationIssueV3 {
  const missingProperty = error.keyword === 'required'
    ? (error.params as { missingProperty?: string }).missingProperty
    : undefined
  const path = `${error.instancePath || ''}${missingProperty ? `/${missingProperty}` : ''}` || '/'
  return {
    path,
    keyword: error.keyword,
    message: error.message || '格式无效',
  }
}

function isLosslessJsonValue(value: unknown, ancestors = new Set<object>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value) && !Object.is(value, -0)
  if (typeof value !== 'object') return false
  if (ancestors.has(value)) return false

  const nextAncestors = new Set(ancestors).add(value)
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype || Object.getOwnPropertySymbols(value).length > 0) return false
    const names = Object.getOwnPropertyNames(value)
    if (names.some((name) => name !== 'length' && !/^(0|[1-9]\d*)$/.test(name))) return false
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = Object.getOwnPropertyDescriptor(value, String(index))
      if (!descriptor?.enumerable || !('value' in descriptor) || !isLosslessJsonValue(descriptor.value, nextAncestors)) return false
    }
    return true
  }

  if (Object.getPrototypeOf(value) !== Object.prototype || Object.getOwnPropertySymbols(value).length > 0) return false
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!descriptor.enumerable || !('value' in descriptor) || !isLosslessJsonValue(descriptor.value, nextAncestors)) return false
  }
  return true
}

function fixedValueIssues(value: unknown): DashboardValidationIssueV3[] {
  const issues: DashboardValidationIssueV3[] = []
  const visited = new Set<object>()
  const visit = (current: unknown, path: string): void => {
    if (!current || typeof current !== 'object' || visited.has(current)) return
    visited.add(current)
    if (!Array.isArray(current) && (current as { kind?: unknown }).kind === 'fixed') {
      const descriptor = Object.getOwnPropertyDescriptor(current, 'value')
      if (!descriptor || !('value' in descriptor) || !isLosslessJsonValue(descriptor.value)) {
        issues.push({
          path: `${path}/value`,
          keyword: 'jsonValue',
          message: '固定值必须是可无损 JSON 往返的纯值',
        })
      }
      return
    }
    if (Array.isArray(current)) {
      current.forEach((item, index) => visit(item, `${path}/${index}`))
      return
    }
    for (const key of Object.keys(current)) {
      try {
        visit((current as Record<string, unknown>)[key], `${path}/${key}`)
      } catch {
        issues.push({ path: `${path}/${key}`, keyword: 'jsonValue', message: '属性无法安全读取' })
      }
    }
  }
  visit(value, '')
  return issues
}

function reservedInteractionStateIssues(value: unknown): DashboardValidationIssueV3[] {
  const issues: DashboardValidationIssueV3[] = []
  const visited = new Set<object>()
  const domain = /(interaction|page|dialog|drill|linkage)/
  const runtimeState = /(state|stack|runtime|session|geometry|epoch|revision|current|active)/
  const visit = (current: unknown, path: string): void => {
    if (!current || typeof current !== 'object' || visited.has(current)) return
    visited.add(current)
    if (Array.isArray(current)) { current.forEach((item, index) => visit(item, `${path}/${index}`)); return }
    for (const [key, child] of Object.entries(current)) {
      const normalized = key.toLowerCase()
      if (domain.test(normalized) && runtimeState.test(normalized)) issues.push({ path: `${path}/${key}`, keyword: 'reservedInteractionState', message: 'extensionRefs 不得保存交互会话状态' })
      visit(child, `${path}/${key}`)
    }
  }
  visit(value, '/extensionRefs')
  return issues
}

function semanticIssues(application: DashboardApplicationV3): DashboardValidationIssueV3[] {
  const issues: DashboardValidationIssueV3[] = []
  const checkStyle = (value: unknown, path: string): void => {
    if (value !== undefined && !isSafeStyleTokenV3(value)) issues.push({ path, keyword: 'safeStyleToken', message: '样式只允许本地颜色、渐变或阴影，不得引用远程资源或任意 CSS' })
  }
  for (const [key, value] of Object.entries(application.theme.tokens)) {
    if (typeof value === 'string') checkStyle(value, `/theme/tokens/${key}`)
    else if (Array.isArray(value)) value.forEach((item, index) => checkStyle(item, `/theme/tokens/${key}/${index}`))
  }
  const pageIds = new Set(application.pages.map((page) => page.id))
  const pageById = new Map(application.pages.map((page) => [page.id, page]))
  const pageCodes = new Set(application.pages.map((page) => page.code))
  const pageOrders = new Set(application.pages.map((page) => page.order))

  if (!pageIds.has(application.defaultPageId)) {
    issues.push({
      path: '/defaultPageId',
      keyword: 'reference',
      message: '必须指向 pages 中存在的页面',
    })
  }
  if (application.publishConfig && pageById.get(application.publishConfig.entryPageId)?.type !== 'standard') {
    issues.push({ path: '/publishConfig/entryPageId', keyword: 'standardPageReference', message: '发布入口必须指向存在的 standard 页面' })
  }
  if (pageIds.size !== application.pages.length) {
    issues.push({
      path: '/pages',
      keyword: 'uniquePageId',
      message: '页面 ID 不能重复',
    })
  }
  if (pageCodes.size !== application.pages.length) {
    issues.push({ path: '/pages', keyword: 'uniquePageCode', message: '页面编码不能重复' })
  }
  if (pageOrders.size !== application.pages.length) {
    issues.push({ path: '/pages', keyword: 'uniquePageOrder', message: '页面顺序不能重复' })
  }
  application.pages.forEach((page, index) => {
    if (page.order !== index + 1) {
      issues.push({
        path: `/pages/${index}/order`,
        keyword: 'pageOrder',
        message: '页面 order 必须与数组顺序一致并从 1 开始',
      })
    }
  })

  const parameterCodes = application.parameters.map((parameter) => parameter.code)
  if (new Set(parameterCodes).size !== parameterCodes.length) {
    issues.push({
      path: '/parameters',
      keyword: 'uniqueParameterCode',
      message: '参数编码在同一应用内不能重复',
    })
  }

  const parameterIds = application.parameters.map((parameter) => parameter.id)
  if (new Set(parameterIds).size !== parameterIds.length) {
    issues.push({
      path: '/parameters',
      keyword: 'uniqueParameterId',
      message: '参数 ID 在同一应用内不能重复',
    })
  }
  try {
    buildParameterDependencyDagV3(application.parameters)
  } catch (reason) {
    issues.push({ path: '/parameters', keyword: 'parameterDependencyDag', message: reason instanceof Error ? reason.message : '参数依赖配置无效' })
  }

  const controlIds = new Set<string>()
  const componentIds = new Set<string>()
  const componentPageIds = new Map<string, string>()
  const eventIds = new Set<string>()
  const actionIds = new Set<string>()
  const declaredActionTypes = new Map<string, string>()
  const parameterIdSet = new Set(parameterIds)
  const drillPathIds = new Set<string>()

  for (const [pathIndex, drillPath] of (application.drillPaths ?? []).entries()) {
    const path = `/drillPaths/${pathIndex}`
    if (drillPathIds.has(drillPath.id)) issues.push({ path: `${path}/id`, keyword: 'uniqueDrillPathId', message: 'DrillPath ID 不能重复' })
    drillPathIds.add(drillPath.id)
    const levelIds = new Set<string>()
    const levelParameterIds = new Set<string>()
    drillPath.levels.forEach((level, levelIndex) => {
      const levelPath = `${path}/levels/${levelIndex}`
      if (levelIds.has(level.id)) issues.push({ path: `${levelPath}/id`, keyword: 'uniqueDrillLevelId', message: '同一 DrillPath 的层级 ID 不能重复' })
      levelIds.add(level.id)
      if (levelParameterIds.has(level.parameterId)) issues.push({ path: `${levelPath}/parameterId`, keyword: 'uniqueDrillParameterId', message: '同一 DrillPath 的层级参数不能重复' })
      levelParameterIds.add(level.parameterId)
      if (['__proto__', 'prototype', 'constructor'].includes(level.field)) issues.push({ path: `${levelPath}/field`, keyword: 'safeDrillField', message: 'DrillPath 层级字段包含危险名称' })
      if (!parameterIdSet.has(level.parameterId)) issues.push({ path: `${levelPath}/parameterId`, keyword: 'parameterReference', message: `参数不存在：${level.parameterId}` })
    })
  }

  const validateValueExpression = (expression: ValueExpressionV3, path: string): void => {
    if (expression.kind === 'parameter' && !parameterIdSet.has(expression.parameterId)) {
      issues.push({ path, keyword: 'parameterReference', message: `参数不存在：${expression.parameterId}` })
    }
  }

  const validateAssignments = (assignments: Array<{ parameterId: string; value: ValueExpressionV3 }>, path: string): void => {
    const seen = new Set<string>()
    assignments.forEach((assignment, assignmentIndex) => {
      const assignmentPath = `${path}/${assignmentIndex}`
      if (seen.has(assignment.parameterId)) issues.push({ path: `${assignmentPath}/parameterId`, keyword: 'uniqueAssignment', message: '同一动作不能重复赋值同一参数' })
      seen.add(assignment.parameterId)
      if (!parameterIdSet.has(assignment.parameterId)) issues.push({ path: `${assignmentPath}/parameterId`, keyword: 'parameterReference', message: `参数不存在：${assignment.parameterId}` })
      validateValueExpression(assignment.value, `${assignmentPath}/value`)
    })
  }

  const validateCarryParameters = (parameterIds: string[] | undefined, path: string): void => {
    parameterIds?.forEach((parameterId, parameterIndex) => {
      if (!parameterIdSet.has(parameterId)) issues.push({ path: `${path}/${parameterIndex}`, keyword: 'parameterReference', message: `参数不存在：${parameterId}` })
    })
  }

  const validateEvents = (events: EventBindingV3[], path: string, ownerPageId: string, ownerKind: 'page' | 'component' | 'control'): void => {
    events.forEach((event, eventIndex) => {
      const eventPath = `${path}/${eventIndex}`
      if (eventIds.has(event.id)) {
        issues.push({ path: `${eventPath}/id`, keyword: 'uniqueEventId', message: '事件 ID 在应用内不能重复' })
      }
      eventIds.add(event.id)
      event.conditions?.forEach((condition, conditionIndex) => {
        validateValueExpression(condition.left, `${eventPath}/conditions/${conditionIndex}/left`)
        if (condition.right) validateValueExpression(condition.right, `${eventPath}/conditions/${conditionIndex}/right`)
      })
      const browserActions = event.actions.filter((action) => action.type === 'openPageWindow' || action.type === 'openExternalLink')
      if (browserActions.length && (browserActions.length !== 1 || event.actions[0] !== browserActions[0] || ownerKind !== 'component' || (event.event !== 'click' && event.event !== 'doubleClick' && event.event !== 'rowClick'))) issues.push({ path: `${eventPath}/actions`, keyword: 'browserUserActivation', message: '浏览器动作必须是直接组件手势中的唯一且首个浏览器动作' })
      event.actions.forEach((action, actionIndex) => {
        const actionPath = `${eventPath}/actions/${actionIndex}`
        if (actionIds.has(action.id)) {
          issues.push({ path: `${actionPath}/id`, keyword: 'uniqueActionId', message: '动作 ID 在应用内不能重复' })
        }
        actionIds.add(action.id)
        if (action.type === 'setParameter') validateAssignments(action.assignments, `${actionPath}/assignments`)
        else if (action.type === 'refresh') {
          if (action.target.kind === 'page') {
            if (action.target.pageId !== ownerPageId) issues.push({ path: `${actionPath}/target/pageId`, keyword: 'refreshPageScope', message: 'Refresh 只能指向事件所属页面' })
          } else {
            action.target.componentIds.forEach((componentId, componentIndex) => {
              if (componentPageIds.get(componentId) !== ownerPageId) issues.push({ path: `${actionPath}/target/componentIds/${componentIndex}`, keyword: 'refreshComponentScope', message: 'Refresh 只能指向事件所属页面内的组件' })
            })
          }
        } else if (action.type === 'navigatePage' || action.type === 'openPageWindow') {
          if (pageById.get(action.pageId)?.type !== 'standard') issues.push({ path: `${actionPath}/pageId`, keyword: 'standardPageReference', message: '目标必须是存在的 standard 页面' })
          if (action.type === 'navigatePage') validateAssignments(action.assignments ?? [], `${actionPath}/assignments`)
          else validateCarryParameters(action.carryParameterIds, `${actionPath}/carryParameterIds`)
        } else if (action.type === 'openDialog') {
          if (pageById.get(action.pageId)?.type !== 'dialog') issues.push({ path: `${actionPath}/pageId`, keyword: 'dialogPageReference', message: '目标必须是存在的 dialog 页面' })
          validateAssignments(action.assignments ?? [], `${actionPath}/assignments`)
          const { width, height, minWidth, minHeight, maxWidth, maxHeight } = action.presentation
          if ((minWidth !== undefined && minWidth > width) || (maxWidth !== undefined && maxWidth < width) || (minWidth !== undefined && maxWidth !== undefined && minWidth > maxWidth)) issues.push({ path: `${actionPath}/presentation/width`, keyword: 'dialogWidthBounds', message: '弹窗宽度必须位于最小和最大宽度之间' })
          if ((minHeight !== undefined && minHeight > height) || (maxHeight !== undefined && maxHeight < height) || (minHeight !== undefined && maxHeight !== undefined && minHeight > maxHeight)) issues.push({ path: `${actionPath}/presentation/height`, keyword: 'dialogHeightBounds', message: '弹窗高度必须位于最小和最大高度之间' })
        } else if (action.type === 'applyLinkage') {
          validateAssignments(action.assignments, `${actionPath}/assignments`)
          action.targetComponentIds.forEach((componentId, componentIndex) => {
            if (componentPageIds.get(componentId) !== ownerPageId) issues.push({ path: `${actionPath}/targetComponentIds/${componentIndex}`, keyword: 'linkageComponentScope', message: '联动目标必须属于事件所属页面' })
          })
        } else if (action.type === 'clearLinkage') {
          if (action.linkageActionId && declaredActionTypes.get(action.linkageActionId) !== 'applyLinkage') issues.push({ path: `${actionPath}/linkageActionId`, keyword: 'linkageActionReference', message: '清除联动目标必须引用存在的 applyLinkage 动作' })
        } else if (action.type === 'drillDown' || action.type === 'drillBack' || action.type === 'clearDrill') {
          if (!drillPathIds.has(action.pathId)) issues.push({ path: `${actionPath}/pathId`, keyword: 'drillPathReference', message: `DrillPath 不存在：${action.pathId}` })
        } else if (action.type === 'openExternalLink') {
          validateCarryParameters(action.carryParameterIds, `${actionPath}/carryParameterIds`)
          try {
            const parsed = new URL(action.url)
            const protocol = parsed.protocol
            if ((protocol !== 'http:' && protocol !== 'https:') || parsed.username || parsed.password || action.url.trim() !== action.url || /[\u0000-\u001f\u007f]/.test(action.url)) throw new Error('unsupported URL')
          } catch {
            issues.push({ path: `${actionPath}/url`, keyword: 'safeExternalUrl', message: '外链必须是可解析的 http/https 绝对 URL' })
          }
        } else if (action.type === 'pageBack') {
          if (pageById.get(ownerPageId)?.type !== 'standard') issues.push({ path: actionPath, keyword: 'standardPageOwner', message: 'pageBack 只能由 standard 页面内事件触发' })
        }
      })
    })
  }

  for (const [pageIndex, page] of application.pages.entries()) {
    checkStyle(page.canvas.background, `/pages/${pageIndex}/canvas/background`)
    checkStyle(page.titleStyle.color, `/pages/${pageIndex}/titleStyle/color`)
    for (const [componentIndex, component] of page.components.entries()) {
      const path = `/pages/${pageIndex}/components/${componentIndex}`
      checkStyle(component.styleConfig?.background, `${path}/styleConfig/background`)
      checkStyle(component.styleConfig?.borderColor, `${path}/styleConfig/borderColor`)
      checkStyle(component.styleConfig?.shadow, `${path}/styleConfig/shadow`)
      checkStyle(component.styleConfig?.titleColor, `${path}/styleConfig/titleColor`)
      checkStyle(component.textConfig?.color, `${path}/textConfig/color`)
      checkStyle(component.iconConfig?.color, `${path}/iconConfig/color`)
      checkStyle(component.kpiConfig?.progressColor, `${path}/kpiConfig/progressColor`)
      checkStyle(component.decorationConfig?.fill, `${path}/decorationConfig/fill`)
      checkStyle(component.decorationConfig?.borderColor, `${path}/decorationConfig/borderColor`)
      if (component.mapConfig) {
        for (const key of ['emptyColor', 'lowColor', 'highColor', 'borderColor', 'pointColor'] as const) checkStyle(component.mapConfig[key], `${path}/mapConfig/${key}`)
      }
      component.tableConfig?.conditionalRules?.forEach((rule, ruleIndex) => {
        checkStyle(rule.backgroundColor, `${path}/tableConfig/conditionalRules/${ruleIndex}/backgroundColor`)
        checkStyle(rule.textColor, `${path}/tableConfig/conditionalRules/${ruleIndex}/textColor`)
      })
      component.tabsConfig?.items.forEach((item, itemIndex) => checkStyle(item.background, `${path}/tabsConfig/items/${itemIndex}/background`))
      if (componentIds.has(component.id)) {
        issues.push({ path: `${path}/id`, keyword: 'uniqueComponentId', message: '组件 ID 在应用内不能重复' })
      }
      componentIds.add(component.id)
      componentPageIds.set(component.id, page.id)
    }
    for (const binding of [...page.pageEvents, ...page.controls.flatMap((control) => control.events ?? []), ...page.components.flatMap((component) => component.events ?? [])]) {
      for (const action of binding.actions) declaredActionTypes.set(action.id, action.type)
    }
  }

  for (const [pageIndex, page] of application.pages.entries()) {
    const pageComponentIds = new Set(page.components.map((component) => component.id))
    const assignedComponentIds = new Set<string>()
    for (const [componentIndex, component] of page.components.entries()) {
      if (component.type !== 'tabs' || !component.tabsConfig) continue
      const tabPath = `/pages/${pageIndex}/components/${componentIndex}/tabsConfig`
      const itemIds = new Set<string>()
      const visibleItemIds = new Set<string>()
      for (const [itemIndex, item] of component.tabsConfig.items.entries()) {
        const itemPath = `${tabPath}/items/${itemIndex}`
        if (itemIds.has(item.id)) issues.push({ path: `${itemPath}/id`, keyword: 'uniqueTabItemId', message: '同一页签块内的内容页 ID 不能重复' })
        itemIds.add(item.id)
        if (item.visible !== false) visibleItemIds.add(item.id)
        const localIds = new Set<string>()
        for (const [referenceIndex, componentId] of (item.componentIds ?? []).entries()) {
          const referencePath = `${itemPath}/componentIds/${referenceIndex}`
          if (localIds.has(componentId)) issues.push({ path: referencePath, keyword: 'uniqueTabComponentReference', message: '同一内容页不能重复引用组件' })
          localIds.add(componentId)
          if (componentId === component.id) issues.push({ path: referencePath, keyword: 'tabSelfReference', message: '页签块不能引用自身' })
          else if (!pageComponentIds.has(componentId)) issues.push({ path: referencePath, keyword: 'tabComponentReference', message: `页签内容组件不存在或不在同页：${componentId}` })
          else if (page.components.find((candidate) => candidate.id === componentId)?.type === 'tabs') issues.push({ path: referencePath, keyword: 'tabNesting', message: '当前版本不支持页签块嵌套' })
          if (assignedComponentIds.has(componentId)) issues.push({ path: referencePath, keyword: 'uniqueTabOwnership', message: '同一组件最多归属一个页签内容页' })
          assignedComponentIds.add(componentId)
        }
      }
      if (!itemIds.has(component.tabsConfig.activeItemId)) issues.push({ path: `${tabPath}/activeItemId`, keyword: 'tabDefaultReference', message: '默认页签必须引用现有内容页' })
      if (!visibleItemIds.size) issues.push({ path: `${tabPath}/items`, keyword: 'tabVisibleItem', message: '页签块至少需要一个可见内容页' })
      if (itemIds.has(component.tabsConfig.activeItemId) && !visibleItemIds.has(component.tabsConfig.activeItemId)) issues.push({ path: `${tabPath}/activeItemId`, keyword: 'tabDefaultVisible', message: '默认页签必须指向可见内容页' })
    }
    for (const [controlIndex, control] of page.controls.entries()) {
      const path = `/pages/${pageIndex}/controls/${controlIndex}`
      if (controlIds.has(control.id)) {
        issues.push({ path: `${path}/id`, keyword: 'uniqueControlId', message: '控件 ID 不能重复' })
      }
      controlIds.add(control.id)
      for (const parameterId of control.parameterIds) {
        if (!parameterIdSet.has(parameterId)) {
          issues.push({ path: `${path}/parameterIds`, keyword: 'parameterReference', message: `参数不存在：${parameterId}` })
        }
      }
      validateEvents(control.events ?? [], `${path}/events`, page.id, 'control')
    }
    validateEvents(page.pageEvents, `/pages/${pageIndex}/pageEvents`, page.id, 'page')
    page.components.forEach((component, componentIndex) => {
      validateEvents(component.events ?? [], `/pages/${pageIndex}/components/${componentIndex}/events`, page.id, 'component')
    })
  }

  return issues
}

export function validateDashboardApplicationV3(value: unknown): DashboardValidationResultV3 {
  const jsonValueIssues = fixedValueIssues(value)
  if (jsonValueIssues.length) return { valid: false, issues: jsonValueIssues }
  if (!validateSchema(value)) {
    return {
      valid: false,
      issues: (validateSchema.errors || []).map(schemaIssue),
    }
  }

  const application = value as unknown as DashboardApplicationV3
  const issues = [...reservedInteractionStateIssues(application.extensionRefs), ...semanticIssues(application)]
  return {
    valid: issues.length === 0,
    issues,
  }
}

export function assertDashboardApplicationV3(value: unknown): asserts value is DashboardApplicationV3 {
  const result = validateDashboardApplicationV3(value)
  if (!result.valid) {
    const summary = result.issues
      .map((issue) => `${issue.path}：${issue.message}`)
      .join('；')
    throw new Error(`V3 看板 JSON 校验失败：${summary}`)
  }
}
