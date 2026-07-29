import type {
  CanvasConfig,
  DashboardComponent,
  DashboardTitleStyle,
} from './dashboard'
import type { ParameterDefinitionV3 } from './parameters'

export type DashboardPageTypeV3 = 'standard' | 'dialog'
export type PreviewScaleModeV3 = 'fit' | 'width' | 'actual'
export type ParameterPersistenceV3 = 'none' | 'session' | 'url'

export interface DashboardPageV3 {
  id: string
  name: string
  code: string
  order: number
  type: DashboardPageTypeV3
  canvas: CanvasConfig
  titleStyle: DashboardTitleStyle
  controls: Record<string, unknown>[]
  components: DashboardComponent[]
  pageEvents: Record<string, unknown>[]
}

export interface ThemeConfigV3 {
  id: string
  tokens: Record<string, unknown>
}

export interface RuntimePolicyV3 {
  previewScaleMode: PreviewScaleModeV3
  allowScroll: boolean
  parameterPersistence: ParameterPersistenceV3
  maxEventDepth: number
}

export interface ExtensionRefsV3 {
  permissionPolicyRef?: string
  queryCachePolicyRef?: string
  semanticLayerRef?: string
  algorithmProviderRefs?: string[]
  [key: string]: unknown
}

export interface PublishConfigV3 {
  status: 'draft' | 'published' | 'archived'
  publishedVersion?: number
  entryPageId: string
  access: 'private' | 'authenticated' | 'public'
  publishedAt?: string
}

export interface DashboardApplicationV3 {
  version: 3
  id: string
  name: string
  description?: string
  defaultPageId: string
  parameters: ParameterDefinitionV3[]
  pages: DashboardPageV3[]
  theme: ThemeConfigV3
  runtimePolicy: RuntimePolicyV3
  extensionRefs: ExtensionRefsV3
  publishConfig?: PublishConfigV3
  createdAt?: string
  updatedAt?: string
}

export interface CreateDashboardApplicationV3Options {
  id?: string
  name?: string
  pageId?: string
  pageName?: string
}

export function createDefaultDashboardApplicationV3(
  options: CreateDashboardApplicationV3Options = {},
): DashboardApplicationV3 {
  const applicationId = options.id?.trim() || 'dashboard-default'
  const pageId = options.pageId?.trim() || 'page-home'

  return {
    version: 3,
    id: applicationId,
    name: options.name?.trim() || '未命名看板',
    defaultPageId: pageId,
    parameters: [],
    pages: [
      {
        id: pageId,
        name: options.pageName?.trim() || '首页',
        code: 'home',
        order: 1,
        type: 'standard',
        canvas: {
          width: 1200,
          height: 600,
          background: '#f7f9fb',
          showGrid: true,
          gridSize: 12,
        },
        titleStyle: {
          show: true,
          fontSize: 24,
          color: '#243447',
          fontWeight: 700,
          align: 'left',
        },
        controls: [],
        components: [],
        pageEvents: [],
      },
    ],
    theme: {
      id: 'medical-light',
      tokens: {},
    },
    runtimePolicy: {
      previewScaleMode: 'width',
      allowScroll: true,
      parameterPersistence: 'session',
      maxEventDepth: 10,
    },
    extensionRefs: {},
  }
}

export function getDefaultPageV3(application: DashboardApplicationV3): DashboardPageV3 {
  const page = application.pages.find((item) => item.id === application.defaultPageId)
  if (!page) {
    throw new Error(`默认页面不存在：${application.defaultPageId}`)
  }
  return page
}
