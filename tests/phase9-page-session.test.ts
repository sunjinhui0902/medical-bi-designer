import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import { createPageV3 } from '../src/services/pageManagerV3.ts'
import {
  createPageDesignerSessionV3,
  openPageDesignerSessionV3,
  saveActivePageDraftV3,
  switchPageDesignerSessionV3,
} from '../src/services/pageDesignerSessionV3.ts'

const fixedId = () => 'page-detail'

function twoPageApplication() {
  const application = createDefaultDashboardApplicationV3()
  return createPageV3(application, { name: 'Detail', code: 'detail' }, fixedId).application
}

test('P9.2 switches pages only after saving the active page draft', () => {
  const application = twoPageApplication()
  const opened = openPageDesignerSessionV3(application, 'page-home')
  opened.dashboard.canvas.width = 1440
  opened.dashboard.components = [{ id: 'home-draft-component' } as never]

  const switched = switchPageDesignerSessionV3(
    opened.application,
    opened.session,
    opened.dashboard,
    'page-detail',
  )

  assert.equal(switched.application.pages[0].canvas.width, 1440)
  assert.equal(switched.application.pages[0].components[0].id, 'home-draft-component')
  assert.equal(switched.session.activePageId, 'page-detail')
  assert.deepEqual(switched.dashboard.components, [])
})

test('P9.2 keeps activePageId outside the application and exported JSON shape', () => {
  const application = twoPageApplication()
  const session = createPageDesignerSessionV3(application, 'page-detail')
  const saved = saveActivePageDraftV3(application, session, openPageDesignerSessionV3(application, 'page-detail').dashboard)

  assert.equal(session.activePageId, 'page-detail')
  assert.equal('activePageId' in saved, false)
  assert.equal(JSON.stringify(saved).includes('activePageId'), false)
})

test('P9.2 rejects missing target pages without mutating the active draft', () => {
  const application = twoPageApplication()
  const opened = openPageDesignerSessionV3(application, 'page-home')
  opened.dashboard.canvas.width = 1500

  assert.throws(() => switchPageDesignerSessionV3(
    application,
    opened.session,
    opened.dashboard,
    'page-missing',
  ))
  assert.equal(application.pages[0].canvas.width, 1200)
})
