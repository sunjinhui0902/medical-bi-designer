import type { ComponentType } from '../models/dashboard.ts'
import type { DashboardApplicationV3, DashboardComponentV3, EventNameV3 } from '../models/dashboard-v3.ts'

export type EventOwnerV3 =
  | { kind: 'page'; pageId: string; pageType: 'standard' | 'dialog' }
  | { kind: 'component'; pageId: string; pageType: 'standard' | 'dialog'; componentId: string; componentType: ComponentType }

export interface EventFieldCapabilityV3 {
  path: string
  label: string
}

export interface ResolvedEventOwnerV3 {
  owner: EventOwnerV3
  component?: DashboardComponentV3
}

const PAGE_EVENTS: EventNameV3[] = ['pageEnter']
const COMPONENT_EVENTS: EventNameV3[] = ['click', 'doubleClick']
const TABLE_EVENTS: EventNameV3[] = ['click', 'doubleClick', 'rowClick']
const DANGEROUS_POINTER_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor'])

export function escapeJsonPointerSegmentV3(segment: string): string {
  return segment.replace(/~/g, '~0').replace(/\//g, '~1')
}

function boundFields(component: DashboardComponentV3): string[] {
  const fields = [
    ...component.dataConfig.dimensions.map((item) => item.field),
    ...component.dataConfig.measures.map((item) => item.field),
    ...(component.tableConfig?.columns.map((item) => item.field) ?? []),
  ]
  return [...new Set(fields.filter((field) => field && !DANGEROUS_POINTER_SEGMENTS.has(field)))]
}

export function resolveEventOwnerV3(application: DashboardApplicationV3, snapshot: EventOwnerV3): ResolvedEventOwnerV3 {
  const page = application.pages.find((candidate) => candidate.id === snapshot.pageId)
  if (!page) throw new Error(`页面不存在：${snapshot.pageId}`)
  if (snapshot.kind === 'page') {
    return { owner: { kind: 'page', pageId: page.id, pageType: page.type } }
  }
  const component = page.components.find((candidate) => candidate.id === snapshot.componentId)
  if (!component) throw new Error(`组件不存在：${snapshot.componentId}`)
  return {
    owner: {
      kind: 'component', pageId: page.id, pageType: page.type,
      componentId: component.id, componentType: component.type,
    },
    component,
  }
}

export function authorableEventNamesV3(owner: EventOwnerV3): EventNameV3[] {
  if (owner.pageType === 'dialog') return []
  if (owner.kind === 'page') return [...PAGE_EVENTS]
  return [...(owner.componentType === 'table' ? TABLE_EVENTS : COMPONENT_EVENTS)]
}

export function eventFieldCapabilitiesV3(
  event: EventNameV3,
  component?: DashboardComponentV3,
): EventFieldCapabilityV3[] {
  if (event === 'pageEnter') return []
  if (event === 'valueChange') return [{ path: '/value', label: '控件值' }]
  if (!component) return []
  const prefix = event === 'rowClick' ? '/row/' : '/datum/'
  return boundFields(component).map((field) => ({ path: `${prefix}${escapeJsonPointerSegmentV3(field)}`, label: field }))
}

export function eventFieldCapabilitiesForOwnerV3(
  application: DashboardApplicationV3,
  owner: EventOwnerV3,
  event: EventNameV3,
): EventFieldCapabilityV3[] {
  const resolved = resolveEventOwnerV3(application, owner)
  return eventFieldCapabilitiesV3(event, resolved.component)
}

export function isEventAuthorableV3(owner: EventOwnerV3, event: EventNameV3): boolean {
  return authorableEventNamesV3(owner).includes(event)
}

export function isEventFieldAuthorableV3(event: EventNameV3, path: string, component?: DashboardComponentV3): boolean {
  return eventFieldCapabilitiesV3(event, component).some((field) => field.path === path)
}

export function isOwnerReadOnlyV3(owner: EventOwnerV3): boolean {
  return owner.pageType === 'dialog'
}
