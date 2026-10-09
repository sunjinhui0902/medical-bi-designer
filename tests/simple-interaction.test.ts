import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import type { DashboardApplicationV3, EventBindingV3 } from '../src/models/dashboard-v3.ts'
import { eventFieldCapabilitiesForOwnerV3, authorableEventNamesV3, type EventOwnerV3 } from '../src/services/eventAuthoringPolicyV3.ts'
import { createEventBindingV3 } from '../src/services/eventBindingManagerV3.ts'
import { createSimpleInteractionAction, replaceSimpleInteractionAction, simpleEditableAction, simpleLinkageTargets, simpleNavigationTargets, uniqueCandidateId, type SimpleInteractionContext, type SimpleInteractionSelection } from '../src/services/simpleInteractionV3.ts'
const app = JSON.parse(readFileSync(new URL('../docs/02_V3架构/示例/dashboard-v3-phase10.json', import.meta.url), 'utf8')) as DashboardApplicationV3
function fixture(event: SimpleInteractionSelection['event'] = 'rowClick') {
  const application = structuredClone(app)
  const page = application.pages[0]!
  const component = page.components.find(c => c.type === 'table')!
  component.events = []
  const owner: EventOwnerV3 = { kind: 'component', pageId: page.id, pageType: page.type, componentId: component.id, componentType: component.type }
  const context: SimpleInteractionContext = { owner, events: authorableEventNamesV3(owner), fields: eventFieldCapabilitiesForOwnerV3(application, owner, event), parameters: application.parameters, components: page.components, pages: application.pages, drillPaths: application.drillPaths! }
  return { application, context, owner }
}
test('simple selection creates native parameter/linkage/navigation/drill bindings through existing manager', () => {
  const { application, context, owner } = fixture()
  const target = simpleLinkageTargets(context)[0]!
  const selection: SimpleInteractionSelection = { event: 'rowClick', kind: 'setParameter', parameterId: 'parameter-hospital', fieldPath: '/row/hospital_code', targetId: '' }
  for (const kind of ['setParameter', 'applyLinkage', 'navigatePage', 'drillDown'] as const) {
    selection.kind = kind
    selection.targetId = kind === 'applyLinkage' ? target.id : kind === 'navigatePage' ? simpleNavigationTargets(context)[0]!.id : context.drillPaths[0]!.id
    if (kind === 'applyLinkage' && target.dataConfig.version === 3) selection.parameterId = target.dataConfig.parameterBindings[0]!.parameterId
    const action = createSimpleInteractionAction(context, selection, 'new-action')
    const binding: EventBindingV3 = { id: 'new-rule', event: 'rowClick', enabled: true, actions: [action] }
    const next = createEventBindingV3(application, owner, binding)
    assert.deepEqual(next.pages[0]!.components.find(c => c.id === owner.componentId)!.events, [binding])
    assert.equal(application.pages[0]!.components.find(c => c.id === owner.componentId)!.events!.length, 0)
  }
})
test('only one candidate defaults; ambiguous or absent candidates remain unselected', () => {
  assert.equal(uniqueCandidateId([]), '')
  assert.equal(uniqueCandidateId([{ id: 'a' }]), 'a')
  assert.equal(uniqueCandidateId([{ id: 'a' }, { id: 'b' }]), '')
})
test('selection rejects missing fields, parameters, invalid targets and unsupported trigger', () => {
  const { context } = fixture()
  const selection: SimpleInteractionSelection = { event: 'rowClick', kind: 'setParameter', parameterId: 'parameter-hospital', fieldPath: '/row/hospital_code', targetId: '' }
  assert.throws(() => createSimpleInteractionAction(context, { ...selection, fieldPath: '/row/missing' }), /字段/)
  assert.throws(() => createSimpleInteractionAction(context, { ...selection, parameterId: 'missing' }), /参数/)
  assert.throws(() => createSimpleInteractionAction(context, { ...selection, event: 'pageEnter' }), /触发/)
  assert.throws(() => createSimpleInteractionAction(context, { ...selection, kind: 'applyLinkage', targetId: context.owner.kind === 'component' ? context.owner.componentId : '' }), /联动目标/)
  assert.throws(() => createSimpleInteractionAction(context, { ...selection, kind: 'navigatePage', targetId: context.owner.pageId }), /普通页面/)
  assert.throws(() => createSimpleInteractionAction({ ...context, fields: [] }, { ...selection, kind: 'drillDown', targetId: context.drillPaths[0]!.id }), /字段/)
})
test('explicit simple replacement preserves conditions, action identity, order and unrelated actions', () => {
  const { context } = fixture()
  const action = createSimpleInteractionAction(context, { event: 'rowClick', kind: 'setParameter', parameterId: 'parameter-hospital', fieldPath: '/row/hospital_code', targetId: '' }, 'original-action')
  const binding: EventBindingV3 = { id: 'rule', event: 'rowClick', enabled: false, debounceMs: 50, conditions: [{ left: { kind: 'eventField', path: '/row/hospital_code' }, operator: 'notEmpty' }], actions: [action, { id: 'back', type: 'pageBack' }] }
  const snapshot = structuredClone(binding)
  const next = replaceSimpleInteractionAction(binding, { id: 'new', type: 'navigatePage', pageId: simpleNavigationTargets(context)[0]!.id, history: 'push' })
  assert.deepEqual(binding, snapshot)
  assert.deepEqual(next.conditions, binding.conditions)
  assert.deepEqual(next.actions[1], binding.actions[1])
  assert.equal(next.actions[0]!.id, 'original-action'); assert.equal(next.enabled, false); assert.equal(next.debounceMs, 50)
  assert.equal(simpleEditableAction({ ...binding, actions: [action, { ...action, id: 'second' }] }), null)
  assert.throws(() => replaceSimpleInteractionAction({ ...binding, actions: [action, { ...action, id: 'second' }] }, action), /高级编辑/)
})
test('field pointers reflect row, datum and control capabilities', () => {
  assert.ok(fixture().context.fields.every(f => f.path.startsWith('/row/')))
  assert.ok(fixture('click').context.fields.every(f => f.path.startsWith('/datum/')))
  const context = fixture().context
  const controlContext: SimpleInteractionContext = { ...context, owner: { kind: 'control', pageId: context.owner.pageId, pageType: 'standard', controlId: 'control', controlType: 'singleSelect' }, events: ['valueChange'], fields: [{ path: '/value', label: '控件值' }] }
  const action = createSimpleInteractionAction(controlContext, { event: 'valueChange', kind: 'setParameter', parameterId: 'parameter-hospital', fieldPath: '/value', targetId: '' })
  assert.equal(action.type, 'setParameter')
  assert.throws(() => createSimpleInteractionAction(controlContext, { event: 'valueChange', kind: 'drillDown', parameterId: '', fieldPath: '', targetId: context.drillPaths[0]!.id }), /普通页面/)
})
