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

export type ParameterControlTypeV3 = 'input' | 'buttonGroup' | 'singleSelect' | 'multiSelect' | 'date' | 'dateRange'

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
  events?: EventBindingV3[]
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

export interface InteractionParameterAssignmentV3 {
  parameterId: string
  value: ValueExpressionV3
}

export interface NavigatePageActionV3 {
  id: string
  type: 'navigatePage'
  pageId: string
  history: 'push' | 'replace'
  assignments?: InteractionParameterAssignmentV3[]
}

export interface PageBackActionV3 { id: string; type: 'pageBack' }
export interface OpenPageWindowActionV3 { id: string; type: 'openPageWindow'; pageId: string; carryParameterIds?: string[] }

export interface DialogPresentationV3 {
  width: number
  height: number
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  draggable: boolean
  resizable: boolean
  closeOnEscape: boolean
  closeOnBackdrop: boolean
}

export interface OpenDialogActionV3 {
  id: string
  type: 'openDialog'
  pageId: string
  presentation: DialogPresentationV3
  assignments?: InteractionParameterAssignmentV3[]
}

export interface CloseDialogActionV3 { id: string; type: 'closeDialog' }

export interface ApplyLinkageActionV3 {
  id: string
  type: 'applyLinkage'
  assignments: InteractionParameterAssignmentV3[]
  targetComponentIds: string[]
}

export interface ClearLinkageActionV3 { id: string; type: 'clearLinkage'; linkageActionId?: string }
export interface DrillDownActionV3 { id: string; type: 'drillDown'; pathId: string }
export interface DrillBackActionV3 { id: string; type: 'drillBack'; pathId: string }
export interface ClearDrillActionV3 { id: string; type: 'clearDrill'; pathId: string }
export interface OpenExternalLinkActionV3 { id: string; type: 'openExternalLink'; url: string; carryParameterIds?: string[] }

export type ActionDefinitionV3 =
  | SetParameterActionV3
  | RefreshActionV3
  | NavigatePageActionV3
  | PageBackActionV3
  | OpenPageWindowActionV3
  | OpenDialogActionV3
  | CloseDialogActionV3
  | ApplyLinkageActionV3
  | ClearLinkageActionV3
  | DrillDownActionV3
  | DrillBackActionV3
  | ClearDrillActionV3
  | OpenExternalLinkActionV3

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

export interface DashboardThemeTokensV3 {
  canvasBackground: string
  panelBackground: string
  panelBorder: string
  panelRadius: number
  panelShadow: string
  textPrimary: string
  textSecondary: string
  chartPalette: string[]
  statusNormal: string
  statusWarning: string
  statusDanger: string
}

export interface ThemeConfigV3 {
  id: string
  tokens: Partial<DashboardThemeTokensV3> & Record<string, unknown>
}

export const lightThemeTokensV3: DashboardThemeTokensV3 = {
  canvasBackground: '#f0f4f9', panelBackground: '#ffffff', panelBorder: '#dce5ef',
  panelRadius: 10, panelShadow: '0 4px 18px rgba(22,43,69,.045)',
  textPrimary: '#182b42', textSecondary: '#5e728c',
  chartPalette: ['#2375c9', '#159b8a', '#e99a29', '#657ba7', '#d45e68'],
  statusNormal: '#19a974', statusWarning: '#f59f00', statusDanger: '#d9485f',
}

export const darkThemeTokensV3: DashboardThemeTokensV3 = {
  canvasBackground: '#08111f', panelBackground: '#102238', panelBorder: '#294762',
  panelRadius: 6, panelShadow: '0 8px 28px rgba(0,8,20,.35)',
  textPrimary: '#eaf3ff', textSecondary: '#a4b9ce',
  chartPalette: ['#50c7ff', '#45d7bc', '#f0b64c', '#739cf0', '#ee7c88'],
  statusNormal: '#2dd4bf', statusWarning: '#fbbf24', statusDanger: '#fb7185',
}

export interface DrillPathLevelV3 {
  id: string
  label: string
  field: string
  parameterId: string
}

export interface DrillPathV3 {
  id: string
  name: string
  levels: DrillPathLevelV3[]
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
  drillPaths?: DrillPathV3[]
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
