import assert from 'node:assert/strict'
import test from 'node:test'

import { createDefaultDashboardApplicationV3 } from '../src/models/dashboard-v3.ts'
import { createSafeBrowserPortV3 } from '../src/services/safeBrowserPortV3.ts'
import { EventBusV3 } from '../src/services/eventBusV3.ts'
import { ParameterRuntimeStoreV3 } from '../src/services/parameterRuntimeV3.ts'
import { createPageSessionEventIntegrationV3, PageSessionRuntimeV3 } from '../src/services/pageSessionRuntimeV3.ts'

function harness(result: 'open' | 'blocked' | 'throw' = 'open') {
  const application = createDefaultDashboardApplicationV3()
  application.parameters = [{ id: 'hospital', code: 'hospital', name: 'hospital', type: 'string', scope: 'application', required: false, source: { kind: 'static', options: [] } }]
  const detail = structuredClone(application.pages[0]); detail.id = 'page-detail'; detail.code = 'detail'; detail.order = 2; detail.pageEvents = []
  application.pages.push(detail)
  const calls: Array<{ url: string; target: string; features: string }> = []
  const port = createSafeBrowserPortV3({ application, baseUrl: 'https://designer.example.test/app?old=1#hash', allowedCarryOrigins: ['https://example.test'], adapter: { open(url, target, features) { calls.push({ url, target, features }); if (result === 'throw') throw new Error('blocked'); return result === 'blocked' ? 'blocked' : 'requested' } } })
  return { port, calls }
}

test('P10.6 internal page windows use same base, explicit page id, JSON values and noopener/noreferrer', () => {
  const value = harness()
  const result = value.port.openPageWindow('page-detail', ['hospital'], { hospital: 'H 1' })
  assert.equal(result.ok, true); assert.equal(value.calls.length, 1); assert.equal(value.calls[0].target, '_blank'); assert.equal(value.calls[0].features, 'noopener,noreferrer')
  const url = new URL(value.calls[0].url); assert.equal(url.origin, 'https://designer.example.test'); assert.equal(url.pathname, '/app'); assert.equal(url.searchParams.get('previewPageId'), 'page-detail'); assert.equal(url.searchParams.get('parameter.hospital'), '"H 1"'); assert.equal(url.hash, '')
})

test('P10.6 external links fail closed for dangerous protocols, parse errors and credentials', () => {
  for (const url of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'file:///etc/passwd', 'blob:https://example.test/id', 'about:blank', 'not a url', '/relative', '//example.test/path', ' https://example.test', 'https://example.test\n', 'https://user:pass@example.test/']) {
    const value = harness(); const result = value.port.openExternalLink(url, [], {})
    assert.equal(result.ok, false, url); assert.equal(value.calls.length, 0, url)
  }
  const accepted = harness(); const result = accepted.port.openExternalLink('https://example.test/report?existing=1', ['hospital'], { hospital: 'H1' })
  assert.equal(result.ok, true); assert.equal(new URL(accepted.calls[0].url).searchParams.get('parameter.hospital'), '"H1"')
})

test('P10.6 rejects unknown/duplicate carry ids and reports popup/opener failures', () => {
  const invalid = harness(); assert.equal(invalid.port.openPageWindow('page-detail', ['hospital', 'hospital'], { hospital: 'H1' }).ok, false); assert.equal(invalid.calls.length, 0)
  assert.equal(harness().port.openExternalLink('https://example.test', ['missing'], {}).ok, false)
  const blocked = harness('blocked').port.openExternalLink('https://example.test', [], {}); assert.deepEqual(blocked, { ok: false, code: 'POPUP_BLOCKED', message: 'browser blocked the new window' })
  const thrown = harness('throw').port.openExternalLink('https://example.test', [], {}); assert.deepEqual(thrown, { ok: false, code: 'BROWSER_OPEN_FAILED', message: 'browser window open failed' })
})

test('P10.6 carry is all-or-nothing, rejects reserved collisions, and enforces origin and size policy', () => {
  const missing = harness(); assert.equal(missing.port.openExternalLink('https://example.test/report', ['hospital'], {}).ok, false); assert.equal(missing.calls.length, 0)
  const duplicateQuery = harness(); assert.equal(duplicateQuery.port.openExternalLink('https://example.test/report?parameter.hospital=old', ['hospital'], { hospital: 'H1' }).ok, false); assert.equal(duplicateQuery.calls.length, 0)
  const disallowedOrigin = harness(); assert.equal(disallowedOrigin.port.openExternalLink('https://untrusted.example/report', ['hospital'], { hospital: 'H1' }).ok, false); assert.equal(disallowedOrigin.calls.length, 0)
  const sameOrigin = harness(); assert.equal(sameOrigin.port.openExternalLink('https://designer.example.test/app', [], {}).ok, false); assert.equal(sameOrigin.calls.length, 0)
  const oversized = harness(); assert.equal(oversized.port.openExternalLink(`https://example.test/${'x'.repeat(9000)}`, [], {}).ok, false); assert.equal(oversized.calls.length, 0)
})

test('P10.6 complex JSON values encode once and decode exactly', () => {
  const value = harness(); const payload = { unicode: '医院/科室', flags: [true, null, 3.5], nested: { code: 'D 1' } }
  const result = value.port.openExternalLink('https://example.test/report?ordinary=1#section', ['hospital'], { hospital: payload })
  assert.equal(result.ok, true); const url = new URL(value.calls[0].url); assert.deepEqual(JSON.parse(url.searchParams.get('parameter.hospital')!), payload); assert.equal(url.searchParams.get('ordinary'), '1'); assert.equal(url.hash, '#section')
})

test('P10.6 trusted EventBus browser action uses transaction snapshot and redacts query evidence', async () => {
  const value = harness(); const app = createDefaultDashboardApplicationV3(); app.parameters = [{ id: 'hospital', code: 'hospital', name: 'hospital', type: 'string', scope: 'application', required: false, defaultValue: 'STORE', source: { kind: 'static', options: [] } }]
  app.pages[0].components = [{ id: 'source', type: 'text', events: [{ id: 'browser-event', enabled: true, event: 'click', actions: [{ id: 'browser-action', type: 'openExternalLink', url: 'https://example.test/report', carryParameterIds: ['hospital'] }] }] }] as never
  const store = new ParameterRuntimeStoreV3(app.parameters); const runtime = new PageSessionRuntimeV3({ application: app, parameters: store, sessionId: 'browser-session', browserPort: value.port })
  const bus = new EventBusV3({ ports: { setParameter: { async execute() { return { status: 'skipped' } } }, refresh: { async execute() { return { status: 'skipped' } } }, interaction: createPageSessionEventIntegrationV3(runtime) }, idFactory: () => 'browser-event-tx' })
  const result = await bus.trigger({ application: app, source: { kind: 'component', pageId: 'page-home', pageType: 'standard', componentId: 'source', componentType: 'text' }, eventName: 'click', payload: { datum: {} }, parameterSnapshot: { hospital: 'SNAPSHOT-SECRET' } })
  assert.equal(result.status, 'completed', JSON.stringify(result)); assert.equal(JSON.parse(new URL(value.calls[0].url).searchParams.get('parameter.hospital')!), 'SNAPSHOT-SECRET'); assert.equal(store.get('hospital'), 'STORE'); assert.equal(JSON.stringify(result).includes('SNAPSHOT-SECRET'), false); assert.equal(JSON.stringify(result).includes('parameter.hospital'), false)
})
