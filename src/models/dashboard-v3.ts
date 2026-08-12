import type {
  CanvasConfig,
  DashboardComponent,
  DashboardTitleStyle,
  Position,
} from './dashboard'
import type { ParameterDefinitionV3 } from './parameters'

export type DashboardPageTypeV3 = 'standard' | 'dialog'
export type PreviewScaleModeV3 = 'fit' | 'width' | 'actual'
export type ParameterPersistenceV3 = 'none' | 'session' | 'url'

export type ParameterControlTypeV3 = 'buttonGroup' | 'singleSelect' | 'multiSelect' | 'date' | 'dateRange'

export interface ParameterControlV3 {
  id: string
  type: ParameterControlTypeV3
  parameterIds: string[]
  position: Position
  styleConfig: Record<string, unknown>
  interaction: {
    submitMode: 'immediate' | 'manual'
    clearable: boolean
    cascadeFrom?: string[]
  }
}

export type EventNameV3 = 'click' | 'doubleClick' | 'valueChange' | 'rowClick' | 'pageEnter'

export type JsonPrimitiveV3 = null | boolean | number | string
export interface JsonArrayV3 extends Array<JsonValueV3> {}
export interface JsonObjectV3 { [key: string]: JsonValueV3 }
export type JsonValueV3 = JsonPrimitiveV3 | JsonArrayV3 | JsonObjectV3

export type ValueExpressionV3 =
  | { kind: 'parameter'; parameterId: string }
  | { kind: 'eventField'; path: string }
  | { kind: 'fixed'; value: JsonValueV3 }

export interface EventConditionV3 {
  left: ValueExpressionV3
  operator: 'eq' | 'ne' | 'in' | 'notIn' | 'isEmpty' | 'notEmpty'
  right?: ValueExpressionV3
}

export interface SetParameterActionV3 {
  id: string
  type: 'setParameter'
  assignments: Array<{ parameterId: string; value: ValueExpressionV3 }>
}

export interface RefreshActionV3 {
  id: string
  type: 'refresh'
  target:
    | { kind: 'components'; componentIds: string[] }
    | { kind: 'page'; pageId: string }
}

export type ActionDefinitionV3 = SetParameterActionV3 | RefreshActionV3

export interface EventBindingV3 {
  id: string
  enabled: boolean
  event: EventNameV3
  conditions?: EventConditionV3[]
  actions: ActionDefinitionV3[]
  debounceMs?: number
}

export interface DashboardComponentV3 extends DashboardComponent {
  events?: EventBindingV3[]
}

export interface DashboardPageV3 {
  id: string
  name: string
  code: string
  order: number
  type: DashboardPageTypeV3
  canvas: CanvasConfig
  titleStyle: DashboardTitleStyle
  controls: ParameterControlV3[]
  components: DashboardComponentV3[]
  pageEvents: EventBindingV3[]
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
