import type { DashboardApplicationV3 } from '../models/dashboard-v3.ts'
import type { DashboardModelV2 } from '../models/dashboard.ts'
import {
  applyDesignerDashboardToPageV3,
  createPageDesignerAdapterV3,
} from './dashboardDesignerAdapterV3.ts'

export interface PageDesignerSessionV3 {
  activePageId: string
}

export interface PageDesignerSessionTransitionV3 {
  application: DashboardApplicationV3
  session: PageDesignerSessionV3
  dashboard: DashboardModelV2
}

export function createPageDesignerSessionV3(
  application: DashboardApplicationV3,
  preferredPageId?: string,
): PageDesignerSessionV3 {
  const activePageId = preferredPageId ?? application.defaultPageId
  if (!application.pages.some((page) => page.id === activePageId)) {
    throw new Error(`活动页面不存在：${activePageId}`)
  }
  return { activePageId }
}

export function saveActivePageDraftV3(
  application: DashboardApplicationV3,
  session: PageDesignerSessionV3,
  dashboard: DashboardModelV2,
): DashboardApplicationV3 {
  return applyDesignerDashboardToPageV3(application, session.activePageId, dashboard)
}

export function openPageDesignerSessionV3(
  application: DashboardApplicationV3,
  pageId: string,
): PageDesignerSessionTransitionV3 {
  const session = createPageDesignerSessionV3(application, pageId)
  return {
    application,
    session,
    dashboard: createPageDesignerAdapterV3(application, session.activePageId).dashboard,
  }
}

export function switchPageDesignerSessionV3(
  application: DashboardApplicationV3,
  session: PageDesignerSessionV3,
  dashboard: DashboardModelV2,
  targetPageId: string,
): PageDesignerSessionTransitionV3 {
  if (targetPageId === session.activePageId) {
    return { application, session, dashboard }
  }
  const savedApplication = saveActivePageDraftV3(application, session, dashboard)
  return openPageDesignerSessionV3(savedApplication, targetPageId)
}
