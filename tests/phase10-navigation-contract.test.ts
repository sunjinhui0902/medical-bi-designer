import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import type { DashboardApplicationV3, DashboardPageV3 } from '../src/models/dashboard-v3.ts'
import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import { migrateDashboardToV3 } from '../src/services/dashboardMigrationV3.ts'
import { exportDashboardApplicationV3 } from '../src/services/dashboardStorageV3.ts'
import { inspectEventBindingAuthorabilityV3 } from '../src/services/eventBindingManagerV3.ts'
import { copyPageV3, deletePageV3, type PageIdFactoryV3 } from '../src/services/pageManagerV3.ts'
import { validateDashboardApplicationV3 } from '../src/services/dashboardValidationV3.ts'

const copiedId: PageIdFactoryV3 = (kind, sourceId) => `copy-${kind}-${sourceId}`

function page(source: DashboardPageV3, id: string, code: string, order: number, type: 'standard' | 'dialog'): DashboardPageV3 {
  return { ...structuredClone(source), id, name: code, code, order, type, controls: [], components: [], pageEvents: [] }
}

function contractApplication(): DashboardApplicationV3 {
  const application = createDefaultDashboardApplicationV3()
  application.parameters = ['hospital', 'department', 'doctor'].map((code) => ({
    id: `parameter-${code}`, code, name: code, type: 'string', scope: 'application' as const,
    required: false, source: { kind: 'static' as const, options: [] },
  }))
  application.pages[0].components = [{ id: 'component-source' }, { id: 'component-target' }] as never
  application.pages.push(page(application.pages[0], 'page-detail', 'detail', 2, 'standard'))
  application.pages.push(page(application.pages[0], 'page-dialog', 'dialog', 3, 'dialog'))
  application.drillPaths = [{
    id: 'path-clinical', name: 'Clinical path', levels: [
      { id: 'level-hospital', label: 'Hospital', field: 'hospital_code', parameterId: 'parameter-hospital' },
      { id: 'level-department', label: 'Department', field: 'department_code', parameterId: 'parameter-department' },
      { id: 'level-doctor', label: 'Doctor', field: 'doctor_code', parameterId: 'parameter-doctor' },
    ],
  }]
  application.pages[0].pageEvents = [{
    id: 'event-interactions', enabled: true, event: 'pageEnter', actions: [
      { id: 'action-navigate', type: 'navigatePage', pageId: 'page-detail', history: 'push', assignments: [{ parameterId: 'parameter-hospital', value: { kind: 'fixed', value: 'H1' } }] },
      { id: 'action-back', type: 'pageBack' },
      { id: 'action-dialog', type: 'openDialog', pageId: 'page-dialog', presentation: { width: 640, height: 420, minWidth: 320, minHeight: 240, maxWidth: 960, maxHeight: 720, draggable: true, resizable: true, closeOnEscape: true, closeOnBackdrop: false } },
      { id: 'action-close-dialog', type: 'closeDialog' },
      { id: 'action-linkage', type: 'applyLinkage', assignments: [{ parameterId: 'parameter-department', value: { kind: 'fixed', value: 'D1' } }], targetComponentIds: ['component-target'] },
      { id: 'action-clear-linkage', type: 'clearLinkage', linkageActionId: 'action-linkage' },
      { id: 'action-drill-down', type: 'drillDown', pathId: 'path-clinical' },
      { id: 'action-drill-back', type: 'drillBack', pathId: 'path-clinical' },
      { id: 'action-clear-drill', type: 'clearDrill', pathId: 'path-clinical' },
    ],
  }]
  application.pages[0].components[0].events = [
    { id: 'event-window', enabled: true, event: 'click', actions: [{ id: 'action-window', type: 'openPageWindow', pageId: 'page-detail', carryParameterIds: ['parameter-hospital'] }] },
    { id: 'event-external', enabled: true, event: 'doubleClick', actions: [{ id: 'action-external', type: 'openExternalLink', url: 'https://example.test/report', carryParameterIds: ['parameter-doctor'] }] },
  ]
  return application
}

test('P10.1 accepts synchronized interaction actions and declarative DrillPath', () => {
  const application = contractApplication()
  const result = validateDashboardApplicationV3(application)
  assert.equal(result.valid, true, JSON.stringify(result.issues))
  const inspection = inspectEventBindingAuthorabilityV3(application, { kind: 'page', pageId: 'page-home', pageType: 'standard' }, application.pages[0].pageEvents[0])
  assert.equal(inspection.authorable, true, inspection.reasons.join('; '))
  const browserInspection = inspectEventBindingAuthorabilityV3(application, { kind: 'component', pageId: 'page-home', pageType: 'standard', componentId: 'component-source', componentType: application.pages[0].components[0].type }, application.pages[0].components[0].events![0])
  assert.equal(browserInspection.authorable, true, browserInspection.reasons.join('; '))
  assert.deepEqual(migrateDashboardToV3(application).application, application)
})

test('P10.1 checked-in Phase10 example validates and migrates idempotently', () => {
  const example = JSON.parse(readFileSync(new URL('../docs/02_V3架构/示例/dashboard-v3-phase10.json', import.meta.url), 'utf8'))
  const validation = validateDashboardApplicationV3(example)
  assert.equal(validation.valid, true, JSON.stringify(validation.issues))
  const first = migrateDashboardToV3(example)
  const second = migrateDashboardToV3(first.application)
  assert.deepEqual(second.application, first.application)
})

test('P10.1 migrates legacy V3 root extensions without reopening session-state fields', () => {
  const legacy = contractApplication() as DashboardApplicationV3 & { legacyLayout?: unknown }
  legacy.legacyLayout = { density: 'compact' }
  const first = migrateDashboardToV3(legacy)
  assert.equal(first.report.success, true, first.report.errors.join('; '))
  assert.deepEqual(first.application?.extensionRefs.legacyRoot, { legacyLayout: { density: 'compact' } })
  assert.equal(Object.hasOwn(first.application ?? {}, 'legacyLayout'), false)
  assert.deepEqual(migrateDashboardToV3(first.application).application, first.application)

  const forbidden = contractApplication() as DashboardApplicationV3 & { pageStack?: unknown[] }
  forbidden.pageStack = []
  assert.equal(migrateDashboardToV3(forbidden).application, null)
})

test('P10.1 rejects unknown actions, extra fields and unsafe external URLs', () => {
  for (const mutate of [
    (application: DashboardApplicationV3) => { application.pages[0].pageEvents[0].actions.push({ id: 'unknown', type: 'script', code: 'alert(1)' } as never) },
    (application: DashboardApplicationV3) => { Object.assign(application.pages[0].pageEvents[0].actions[1], { extra: true }) },
    (application: DashboardApplicationV3) => { const action = application.pages[0].components[0].events![1].actions[0]; if (action.type === 'openExternalLink') action.url = 'javascript:alert(1)' },
  ]) {
    const application = contractApplication()
    mutate(application)
    assert.equal(validateDashboardApplicationV3(application).valid, false)
  }
})

test('P10.1 rejects invalid page, parameter, component, linkage and DrillPath references', () => {
  const cases: Array<(application: DashboardApplicationV3) => void> = [
    (application) => { const action = application.pages[0].pageEvents[0].actions[0]; if (action.type === 'navigatePage') action.pageId = 'page-dialog' },
    (application) => { const action = application.pages[0].pageEvents[0].actions[2]; if (action.type === 'openDialog') action.pageId = 'page-detail' },
    (application) => { const action = application.pages[0].pageEvents[0].actions[4]; if (action.type === 'applyLinkage') action.targetComponentIds = ['missing'] },
    (application) => { const action = application.pages[0].pageEvents[0].actions[5]; if (action.type === 'clearLinkage') action.linkageActionId = 'action-back' },
    (application) => { const action = application.pages[0].pageEvents[0].actions[6]; if (action.type === 'drillDown') action.pathId = 'missing' },
    (application) => { application.drillPaths![0].levels[0].parameterId = 'missing' },
  ]
  for (const mutate of cases) {
    const application = contractApplication()
    mutate(application)
    assert.equal(validateDashboardApplicationV3(application).valid, false)
  }
})

test('P10.1 rejects duplicate DrillPath ids, level ids and invalid dialog bounds', () => {
  const duplicatePath = contractApplication()
  duplicatePath.drillPaths!.push(structuredClone(duplicatePath.drillPaths![0]))
  assert.equal(validateDashboardApplicationV3(duplicatePath).issues.some((issue) => issue.keyword === 'uniqueDrillPathId'), true)

  const duplicateLevel = contractApplication()
  duplicateLevel.drillPaths![0].levels[1].id = duplicateLevel.drillPaths![0].levels[0].id
  assert.equal(validateDashboardApplicationV3(duplicateLevel).issues.some((issue) => issue.keyword === 'uniqueDrillLevelId'), true)

  const invalidBounds = contractApplication()
  const dialog = invalidBounds.pages[0].pageEvents[0].actions[2]
  if (dialog.type !== 'openDialog') throw new Error('fixture mismatch')
  dialog.presentation.minWidth = dialog.presentation.width + 1
  assert.equal(validateDashboardApplicationV3(invalidBounds).issues.some((issue) => issue.keyword === 'dialogWidthBounds'), true)
})

test('P10.1 keeps interaction session state outside V3 JSON', () => {
  const application = contractApplication() as DashboardApplicationV3 & { pageStack?: unknown[]; dialogStack?: unknown[]; drillStacks?: object; linkageState?: object }
  application.pageStack = []
  application.dialogStack = []
  application.drillStacks = {}
  application.linkageState = {}
  assert.equal(validateDashboardApplicationV3(application).valid, false)
  assert.throws(() => exportDashboardApplicationV3(application))

  const extensionState = contractApplication()
  extensionState.extensionRefs.custom = { nested: { interactionState: { pageStack: [] } } }
  const extensionValidation = validateDashboardApplicationV3(extensionState)
  assert.equal(extensionValidation.issues.some((issue) => issue.keyword === 'reservedInteractionState'), true)
  assert.throws(() => exportDashboardApplicationV3(extensionState))
  assert.equal(migrateDashboardToV3(extensionState).application, null)

  const safeExtension = contractApplication()
  safeExtension.extensionRefs.custom = { pageTheme: 'compact', pluginOptions: { enabled: true } }
  assert.equal(validateDashboardApplicationV3(safeExtension).valid, true)
})

test('P10.1 copies internal interaction references and blocks referenced page deletion', () => {
  const application = contractApplication()
  const copied = copyPageV3(application, application.defaultPageId, { name: 'Copy', code: 'copy' }, copiedId).application.pages.at(-1)!
  const actions = copied.pageEvents[0].actions
  const linkage = actions.find((action) => action.type === 'applyLinkage')
  const clear = actions.find((action) => action.type === 'clearLinkage')
  assert.deepEqual(linkage?.type === 'applyLinkage' ? linkage.targetComponentIds : [], ['copy-component-component-target'])
  assert.equal(clear?.type === 'clearLinkage' ? clear.linkageActionId : '', 'copy-action-action-linkage')
  assert.throws(() => deletePageV3(application, 'page-detail'), /动作引用/)
})
