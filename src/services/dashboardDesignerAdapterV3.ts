import type {
  DashboardApplicationV3,
  DashboardPageV3,
} from '../models/dashboard-v3.ts'
import { getDefaultPageV3 } from '../models/dashboard-v3.ts'
import type { DashboardModelV2 } from '../models/dashboard.ts'

export interface DefaultPageDesignerAdapterV3 {
  applicationId: string
  pageId: string
  dashboard: DashboardModelV2
}

export type PageDesignerAdapterV3 = DefaultPageDesignerAdapterV3

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function toDesignerDashboard(
  application: DashboardApplicationV3,
  page: DashboardPageV3,
): DashboardModelV2 {
  return {
    version: 2,
    name: application.name,
    canvas: cloneJson(page.canvas),
    titleStyle: cloneJson(page.titleStyle),
    components: cloneJson(page.components),
  }
}

export function createDefaultPageDesignerAdapterV3(
  application: DashboardApplicationV3,
): DefaultPageDesignerAdapterV3 {
  const page = getDefaultPageV3(application)
  return {
    applicationId: application.id,
    pageId: page.id,
    dashboard: toDesignerDashboard(application, page),
  }
}

export function createPageDesignerAdapterV3(
  application: DashboardApplicationV3,
  pageId: string,
): PageDesignerAdapterV3 {
  const page = application.pages.find((candidate) => candidate.id === pageId)
  if (!page) throw new Error(`页面不存在：${pageId}`)
  return {
    applicationId: application.id,
    pageId: page.id,
    dashboard: toDesignerDashboard(application, page),
  }
}

export function applyDesignerDashboardToApplicationV3(
  application: DashboardApplicationV3,
  dashboard: DashboardModelV2,
): DashboardApplicationV3 {
  const defaultPage = getDefaultPageV3(application)
  const nextApplication = cloneJson(application)
  const pageIndex = nextApplication.pages.findIndex((page) => page.id === defaultPage.id)

  if (pageIndex < 0) {
    throw new Error(`默认页面不存在：${application.defaultPageId}`)
  }

  nextApplication.name = dashboard.name
  nextApplication.pages[pageIndex] = {
    ...nextApplication.pages[pageIndex],
    canvas: cloneJson(dashboard.canvas),
    titleStyle: cloneJson(dashboard.titleStyle),
    components: cloneJson(dashboard.components),
  }
  nextApplication.updatedAt = new Date().toISOString()

  return nextApplication
}

export function applyDesignerDashboardToPageV3(
  application: DashboardApplicationV3,
  pageId: string,
  dashboard: DashboardModelV2,
): DashboardApplicationV3 {
  const pageIndex = application.pages.findIndex((page) => page.id === pageId)
  if (pageIndex < 0) throw new Error(`页面不存在：${pageId}`)
  const nextApplication = cloneJson(application)
  nextApplication.name = dashboard.name
  nextApplication.pages[pageIndex] = {
    ...nextApplication.pages[pageIndex],
    canvas: cloneJson(dashboard.canvas),
    titleStyle: cloneJson(dashboard.titleStyle),
    components: cloneJson(dashboard.components),
  }
  nextApplication.updatedAt = new Date().toISOString()
  return nextApplication
}
