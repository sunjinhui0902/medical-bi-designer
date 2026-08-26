import type {
  DashboardApplicationV3,
  DashboardPageV3,
  EventBindingV3,
} from '../models/dashboard-v3.ts'

export type PageEntityKindV3 = 'page' | 'component' | 'control' | 'event' | 'action'
export type PageIdFactoryV3 = (kind: PageEntityKindV3, sourceId: string) => string

export interface CreatePageOptionsV3 {
  name: string
  code: string
  type?: 'standard' | 'dialog'
}

export interface PageOperationResultV3 {
  application: DashboardApplicationV3
  pageId: string
}

function clone<T>(value: T): T {
  return structuredClone(value)
}

function defaultIdFactory(kind: PageEntityKindV3): string {
  return `${kind}-${globalThis.crypto.randomUUID()}`
}

function ensureUniqueCode(application: DashboardApplicationV3, code: string, ignoredPageId?: string): void {
  if (application.pages.some((page) => page.code === code && page.id !== ignoredPageId)) {
    throw new Error(`页面编码已存在：${code}`)
  }
}

function normalizeOrders(pages: DashboardPageV3[]): DashboardPageV3[] {
  return pages.map((page, index) => ({ ...page, order: index + 1 }))
}

function collectIds(application: DashboardApplicationV3): Record<PageEntityKindV3, Set<string>> {
  const ids: Record<PageEntityKindV3, Set<string>> = {
    page: new Set(),
    component: new Set(),
    control: new Set(),
    event: new Set(),
    action: new Set(),
  }
  const collectEvents = (events: EventBindingV3[]) => events.forEach((event) => {
    ids.event.add(event.id)
    event.actions.forEach((action) => ids.action.add(action.id))
  })
  application.pages.forEach((page) => {
    ids.page.add(page.id)
    page.controls.forEach((control) => ids.control.add(control.id))
    page.components.forEach((component) => {
      ids.component.add(component.id)
      collectEvents(component.events ?? [])
    })
    collectEvents(page.pageEvents)
  })
  return ids
}

function createCheckedIdFactory(application: DashboardApplicationV3, idFactory: PageIdFactoryV3): PageIdFactoryV3 {
  const ids = collectIds(application)
  return (kind, sourceId) => {
    const id = idFactory(kind, sourceId).trim()
    if (!id) throw new Error(`${kind} ID cannot be empty`)
    if (ids[kind].has(id)) throw new Error(`${kind} ID already exists: ${id}`)
    ids[kind].add(id)
    return id
  }
}

function rewriteEvents(
  events: EventBindingV3[],
  eventIds: Map<string, string>,
  actionIds: Map<string, string>,
  componentIds: Map<string, string>,
  sourcePageId: string,
  targetPageId: string,
): EventBindingV3[] {
  return events.map((event) => ({
    ...clone(event),
    id: eventIds.get(event.id)!,
    actions: event.actions.map((action) => {
      const copied = { ...clone(action), id: actionIds.get(action.id)! }
      if (copied.type === 'refresh') {
        if (copied.target.kind === 'components') copied.target.componentIds = copied.target.componentIds.map((id) => componentIds.get(id) ?? id)
        else if (copied.target.pageId === sourcePageId) copied.target.pageId = targetPageId
      } else if (copied.type === 'navigatePage' || copied.type === 'openPageWindow' || copied.type === 'openDialog') {
        if (copied.pageId === sourcePageId) copied.pageId = targetPageId
      } else if (copied.type === 'applyLinkage') {
        copied.targetComponentIds = copied.targetComponentIds.map((id) => componentIds.get(id) ?? id)
      } else if (copied.type === 'clearLinkage' && copied.linkageActionId) {
        copied.linkageActionId = actionIds.get(copied.linkageActionId) ?? copied.linkageActionId
      }
      return copied
    }),
  }))
}

export function createPageV3(
  application: DashboardApplicationV3,
  options: CreatePageOptionsV3,
  idFactory: PageIdFactoryV3 = defaultIdFactory,
): PageOperationResultV3 {
  const name = options.name.trim()
  const code = options.code.trim()
  if (!name) throw new Error('页面名称不能为空')
  if (!/^[a-z][a-z0-9_]*$/.test(code)) throw new Error('页面编码格式无效')
  ensureUniqueCode(application, code)
  const template = application.pages.find((page) => page.id === application.defaultPageId) ?? application.pages[0]
  const pageId = createCheckedIdFactory(application, idFactory)('page', code)
  const page: DashboardPageV3 = {
    id: pageId,
    name,
    code,
    order: application.pages.length + 1,
    type: options.type ?? 'standard',
    canvas: clone(template.canvas),
    titleStyle: clone(template.titleStyle),
    controls: [],
    components: [],
    pageEvents: [],
  }
  return { application: { ...clone(application), pages: [...clone(application.pages), page] }, pageId }
}

export function copyPageV3(
  application: DashboardApplicationV3,
  sourcePageId: string,
  options: Pick<CreatePageOptionsV3, 'name' | 'code'>,
  idFactory: PageIdFactoryV3 = defaultIdFactory,
): PageOperationResultV3 {
  const source = application.pages.find((page) => page.id === sourcePageId)
  if (!source) throw new Error(`页面不存在：${sourcePageId}`)
  const name = options.name.trim()
  const code = options.code.trim()
  if (!name) throw new Error('页面名称不能为空')
  if (!/^[a-z][a-z0-9_]*$/.test(code)) throw new Error('页面编码格式无效')
  ensureUniqueCode(application, code)

  const nextId = createCheckedIdFactory(application, idFactory)
  const pageId = nextId('page', source.id)
  const componentIds = new Map(source.components.map((component) => [component.id, nextId('component', component.id)]))
  const sourceEvents = [...source.pageEvents, ...source.controls.flatMap((control) => control.events ?? []), ...source.components.flatMap((component) => component.events ?? [])]
  const eventIds = new Map(sourceEvents.map((event) => [event.id, nextId('event', event.id)]))
  const actionIds = new Map(sourceEvents.flatMap((event) => event.actions).map((action) => [action.id, nextId('action', action.id)]))
  const page: DashboardPageV3 = {
    ...clone(source),
    id: pageId,
    name,
    code,
    order: application.pages.length + 1,
    type: source.type,
    controls: source.controls.map((control) => ({
      ...clone(control),
      id: nextId('control', control.id),
      ...(control.events ? { events: rewriteEvents(control.events, eventIds, actionIds, componentIds, source.id, pageId) } : {}),
    })),
    components: source.components.map((component) => {
      const copied = clone(component)
      if (copied.tabsConfig) {
        copied.tabsConfig.items = copied.tabsConfig.items.map((item) => ({
          ...item,
          componentIds: (item.componentIds ?? []).map((id) => componentIds.get(id) ?? id),
        }))
      }
      return {
        ...copied,
        id: componentIds.get(component.id)!,
        ...(component.events ? { events: rewriteEvents(component.events, eventIds, actionIds, componentIds, source.id, pageId) } : {}),
      }
    }),
    pageEvents: rewriteEvents(source.pageEvents, eventIds, actionIds, componentIds, source.id, pageId),
  }
  return { application: { ...clone(application), pages: [...clone(application.pages), page] }, pageId }
}

export function deletePageV3(application: DashboardApplicationV3, pageId: string): DashboardApplicationV3 {
  if (!application.pages.some((page) => page.id === pageId)) throw new Error(`页面不存在：${pageId}`)
  if (application.pages.length === 1) throw new Error('不能删除最后一个页面')
  if (application.defaultPageId === pageId) throw new Error('不能直接删除默认页面，请先设置新的默认页')
  const reference = application.pages
    .flatMap((page) => [...page.pageEvents, ...page.controls.flatMap((control) => control.events ?? []), ...page.components.flatMap((component) => component.events ?? [])])
    .flatMap((event) => event.actions)
    .find((action) => (action.type === 'navigatePage' || action.type === 'openPageWindow' || action.type === 'openDialog') && action.pageId === pageId)
  if (reference) throw new Error(`页面被动作引用，不能删除：${reference.id}`)
  return { ...clone(application), pages: normalizeOrders(application.pages.filter((page) => page.id !== pageId).map(clone)) }
}

export function reorderPagesV3(application: DashboardApplicationV3, orderedPageIds: string[]): DashboardApplicationV3 {
  if (orderedPageIds.length !== application.pages.length || new Set(orderedPageIds).size !== orderedPageIds.length) {
    throw new Error('页面排序必须且只能包含全部页面 ID')
  }
  const byId = new Map(application.pages.map((page) => [page.id, page]))
  const pages = orderedPageIds.map((id) => {
    const page = byId.get(id)
    if (!page) throw new Error(`页面不存在：${id}`)
    return clone(page)
  })
  return { ...clone(application), pages: normalizeOrders(pages) }
}

export function setDefaultPageV3(application: DashboardApplicationV3, pageId: string): DashboardApplicationV3 {
  if (!application.pages.some((page) => page.id === pageId)) throw new Error(`页面不存在：${pageId}`)
  return { ...clone(application), defaultPageId: pageId }
}
