<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from "vue";
import {
  IconActivityHeartbeat,
  IconBed,
  IconBraces,
  IconBuildingHospital,
  IconChartBar,
  IconChartLine,
  IconChartPie,
  IconChevronDown,
  IconCode,
  IconDatabase,
  IconDeviceDesktopAnalytics,
  IconDeviceFloppy,
  IconDots,
  IconEye,
  IconEyeOff,
  IconFileExport,
  IconFileImport,
  IconGripVertical,
  IconLayoutDashboard,
  IconPlus,
  IconSearch,
  IconSettings,
  IconTable,
  IconTrash,
  IconTrendingUp,
  IconTypography,
} from "@tabler/icons-vue";
import DataChart from "../components/DataChart.vue";
import ControlledContentRenderer from "../components/ControlledContentRenderer.vue";
import TableRendererV3 from "../components/TableRendererV3.vue";
import TableConfigPanelV3 from "../components/TableConfigPanelV3.vue";
import DashboardManagerPanel from "../components/DashboardManagerPanel.vue";
import DrillPathManagerV3 from "../components/DrillPathManagerV3.vue";
import DialogHostV3 from "../components/DialogHostV3.vue";
import DatasetCatalog, {
  type CatalogDataset,
  type CatalogField,
} from "../components/DatasetCatalog.vue";
import EventConfigPanel from "../components/EventConfigPanel.vue";
import PageManagerPanel from "../components/PageManagerPanel.vue";
import { findBuiltinDictionaryV3 } from "../data/builtinDictionaries";
import { getMockDataset, mockDatasets } from "../data/mockDatasets";
import type {
  ChartEventPayloadV3,
  ComponentDataConfigV3,
  DatasetQueryParameterV3,
  QueryResult,
} from "../models/bi";
import {
  createDefaultDashboardApplicationV3,
  darkThemeTokensV3,
  lightThemeTokensV3,
  type DashboardApplicationV3,
  type DashboardComponentV3,
  type EventBindingV3,
  type JsonObjectV3,
  type JsonValueV3,
  type ParameterControlV3,
} from "../models/dashboard-v3";
import type {
  ParameterDefinitionV3,
  ParameterOptionV3,
} from "../models/parameters";
import type {
  AnalysisConfig,
  ComponentType,
  DashboardComponent,
  DashboardModelV2,
  Position,
  TabItemConfig,
} from "../models/dashboard";
import { applyDesignerDashboardToApplicationV3 } from "../services/dashboardDesignerAdapterV3";
import {
  createPageDesignerSessionV3,
  openPageDesignerSessionV3,
  saveActivePageDraftV3,
  switchPageDesignerSessionV3,
  type PageDesignerSessionV3,
} from "../services/pageDesignerSessionV3";
import {
  copyPageV3,
  createPageV3,
  deletePageV3,
  reorderPagesV3,
  setDefaultPageV3,
} from "../services/pageManagerV3";
import {
  createEventBindingV3,
  deleteEventBindingV3,
  inspectEventBindingAuthorabilityV3,
  listOwnerEventsV3,
  updateEventBindingV3,
} from "../services/eventBindingManagerV3";
import {
  authorableEventNamesV3,
  eventFieldCapabilitiesForOwnerV3,
  resolveEventOwnerV3,
  type EventOwnerV3,
} from "../services/eventAuthoringPolicyV3";
import {
  suggestDatasetParameterBindingsV3,
  upgradeComponentDataConfigV3,
  validateDatasetParameterBindingsV3,
} from "../services/datasetParameterBindingV3";
import {
  exportDashboardApplicationV3,
  importDashboardApplicationV3,
} from "../services/dashboardStorageV3";
import {
  activateDashboardInWorkspaceV3,
  activeDashboardApplicationV3,
  createDashboardWorkspaceV3,
  loadDashboardWorkspaceV3,
  removeDashboardEntityV3,
  removeDashboardFromWorkspaceV3,
  saveDashboardWorkspaceV3,
  upsertDashboardApplicationInWorkspaceV3,
  type DashboardWorkspaceV3,
} from "../services/dashboardWorkspaceV3";
import {
  comparisonColor,
  comparisonRate,
  formatKpiValue,
  targetProgress,
} from "../services/kpi";
import { ParameterRuntimeStoreV3 } from "../services/parameterRuntimeV3";
import {
  buildParameterDependencyDagV3,
  createHttpParameterOptionsLoaderV3,
  dependentParameterIdsV3,
  ParameterOptionsRuntimeV3,
  reconcileParameterOptionValueV3,
} from "../services/parameterOptionsRuntimeV3";
import {
  componentsAffectedByParameterCommitV3,
  componentsForPageEnterV3,
} from "../services/parameterRefreshV3";
import { QueryRuntimeCacheV3 } from "../services/queryRuntimeCacheV3";
import {
  createComponentQueryRefreshV3,
  type ComponentQueryDescriptorV3,
  type ComponentQueryLoadRequestV3,
} from "../services/componentQueryRefreshV3";
import {
  createDesignerEventRuntimeV3,
  createDesignerQueryStateGuardV3,
  safeParameterRuntimeValuesV3,
} from "../services/designerEventRuntimeV3";
import type { PageSessionSnapshotV3 } from "../services/pageSessionRuntimeV3";
import { useDesignerPreviewRuntimeV3 } from "../composables/useDesignerPreviewRuntimeV3";
import {
  instantiateMedicalTemplate,
  normalizeMedicalTemplates,
  saveMedicalTemplate,
  type MedicalComponentTemplate,
} from "../services/componentTemplates";
import {
  buildComponentDataView,
  normalizeQueryResult,
} from "../services/queryResult";
import {
  reparentComponentV3,
  minimumTabOuterSizeV3,
  tabContentOffsetV3,
  tabContentSizeV3,
  tabOwnerForComponentV3 as resolveTabOwnerV3,
  type TabOwnerV3,
} from "../services/tabContainerV3";
import { tabSelectionScopeKeyV3 } from "../services/tabSessionStateV3";
import {
  MAX_EMBEDDED_IMAGE_BYTES_V3,
  parseSafeGeoJsonV3,
} from "../services/controlledAssetsV3";
import { safeStyleTokenV3 } from "../services/safeStyleV3";
import { componentMinimumSizeV3 } from "../services/componentSizingV3";

type PropertyTab = "data" | "style" | "interaction" | "layout" | "advanced";
type ResizeDirection = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

interface DesignerField extends CatalogField {
  label: string;
}
interface PointerAction {
  id: string;
  mode: "move" | "resize";
  direction?: ResizeDirection;
  startClientX: number;
  startClientY: number;
  start: Position;
  bounds: { width: number; height: number; padding: number };
  sourceOwner?: { tabId: string; itemId: string };
  grabOffsetX: number;
  grabOffsetY: number;
}

const TEMPLATE_STORAGE_KEY = "medical-bi-designer-component-templates-v1";
const queryRuntimeCache = new QueryRuntimeCacheV3<Record<string, unknown>>({
  ttlMs: 15_000,
  maxEntries: 50,
});
const resizeDirections: ResizeDirection[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];

const catalog = [
  {
    group: "基础组件",
    label: "指标卡",
    type: "kpi" as const,
    icon: IconActivityHeartbeat,
    tone: "blue",
  },
  {
    group: "基础组件",
    label: "折线图",
    type: "line" as const,
    icon: IconChartLine,
    tone: "cyan",
  },
  {
    group: "基础组件",
    label: "柱状图",
    type: "bar" as const,
    icon: IconChartBar,
    tone: "orange",
  },
  {
    group: "基础组件",
    label: "面积图",
    type: "area" as const,
    icon: IconChartLine,
    tone: "cyan",
  },
  {
    group: "基础组件",
    label: "组合图",
    type: "combo" as const,
    icon: IconDeviceDesktopAnalytics,
    tone: "blue",
  },
  {
    group: "基础组件",
    label: "散点图",
    type: "scatter" as const,
    icon: IconActivityHeartbeat,
    tone: "purple",
  },
  {
    group: "基础组件",
    label: "气泡图",
    type: "bubble" as const,
    icon: IconActivityHeartbeat,
    tone: "green",
  },
  {
    group: "基础组件",
    label: "饼图",
    type: "pie" as const,
    icon: IconChartPie,
    tone: "purple",
  },
  {
    group: "基础组件",
    label: "数据表格",
    type: "table" as const,
    icon: IconTable,
    tone: "green",
  },
  {
    group: "基础组件",
    label: "页签",
    type: "tabs" as const,
    icon: IconLayoutDashboard,
    tone: "blue",
  },
  {
    group: "基础组件",
    label: "文本",
    type: "text" as const,
    icon: IconTypography,
    tone: "slate",
  },
  {
    group: "基础组件",
    label: "本地图片",
    type: "image" as const,
    icon: IconFileImport,
    tone: "purple",
  },
  {
    group: "基础组件",
    label: "内置图标",
    type: "icon" as const,
    icon: IconActivityHeartbeat,
    tone: "cyan",
  },
  {
    group: "基础组件",
    label: "装饰元素",
    type: "decoration" as const,
    icon: IconBraces,
    tone: "slate",
  },
  {
    group: "基础组件",
    label: "行政区地图",
    type: "map" as const,
    icon: IconBuildingHospital,
    tone: "blue",
  },
  {
    group: "医疗业务组件",
    label: "收入分析卡",
    type: "income" as const,
    icon: IconTrendingUp,
    tone: "blue",
  },
  {
    group: "医疗业务组件",
    label: "门诊趋势",
    type: "outpatient" as const,
    icon: IconBuildingHospital,
    tone: "cyan",
  },
  {
    group: "医疗业务组件",
    label: "科室排名",
    type: "ranking" as const,
    icon: IconChartBar,
    tone: "orange",
  },
  {
    group: "医疗业务组件",
    label: "床位利用率",
    type: "bed" as const,
    icon: IconBed,
    tone: "green",
  },
];
const tabs: Array<{ id: PropertyTab; label: string }> = [
  { id: "data", label: "字段" },
  { id: "style", label: "样式" },
  { id: "interaction", label: "交互" },
  { id: "layout", label: "布局" },
  { id: "advanced", label: "高级" },
];

const dashboardApplication = ref<DashboardApplicationV3>(
  createDefaultDashboardApplicationV3({ name: "医院运营概览" }),
);
const dashboardWorkspace = ref<DashboardWorkspaceV3>(
  createDashboardWorkspaceV3(dashboardApplication.value),
);
const pageSession = ref<PageDesignerSessionV3>(
  createPageDesignerSessionV3(dashboardApplication.value),
);
const dashboard = ref<DashboardModelV2>(createDefaultDashboard());
const activeTab = ref<PropertyTab>("data");
const query = ref("");
const showBasicComponents = ref(true);
const showMedicalComponents = ref(false);
const medicalTemplates = ref<MedicalComponentTemplate[]>([]);
const leftPanelWidth = ref(210);
const rightPanelWidth = ref(330);
const selectedId = ref("kpi_income");
const previewMode = ref(false);
const saveState = ref("未保存");
const canvasElement = ref<HTMLDivElement | null>(null);
const artboardWrapElement = ref<HTMLDivElement | null>(null);
const previewViewport = ref({ width: 0, height: 0 });
const controlBarElement = ref<HTMLDivElement | null>(null);
const importInput = ref<HTMLInputElement | null>(null);
const datasetCatalogOpen = ref(false);
const dashboardManagerOpen = ref(false);
const serverDatasets = ref<Record<string, CatalogDataset>>({});
const runtimeDatasets = ref<Record<string, QueryResult>>({});
const datasetLoading = ref<Record<string, boolean>>({});
const datasetErrors = ref<Record<string, string>>({});
const parameterRuntime = shallowRef<ParameterRuntimeStoreV3 | null>(null);
const parameterRuntimeValues = ref<Record<string, JsonValueV3>>({});
const interactionState = ref<PageSessionSnapshotV3 | null>(null);
const pendingControlValues = ref<Record<string, unknown>>({});
const parameterDynamicOptions = ref<Record<string, ParameterOptionV3[]>>({});
const parameterOptionStates = ref<
  Record<
    string,
    {
      status: "idle" | "loading" | "ready" | "empty" | "error";
      message?: string;
    }
  >
>({});
let parameterOptionsRuntime: ParameterOptionsRuntimeV3 | null = null;
const tabSelections = ref<Record<string, string>>({});
const eventOwner = ref<EventOwnerV3 | null>(null);
const eventPanel = ref<{
  hasDirtyDraft: () => boolean;
  discardDraft: () => void;
  applyCurrent: () => boolean;
} | null>(null);
const datasetStateGuard = createDesignerQueryStateGuardV3(
  (componentId, state, message) => {
    datasetLoading.value = {
      ...datasetLoading.value,
      [componentId]: state === "loading",
    };
    datasetErrors.value = {
      ...datasetErrors.value,
      [componentId]: state === "failed" ? (message ?? "数据集执行失败") : "",
    };
  },
);
type DatasetLease = ReturnType<typeof datasetStateGuard.begin>;
const descriptorDatasetLeases = new WeakMap<
  ComponentQueryDescriptorV3,
  DatasetLease
>();
const activeDatasetLeases = new Map<
  string,
  { descriptor: ComponentQueryDescriptorV3; lease: DatasetLease }
>();
const internalDatasetControllers = new Set<AbortController>();
const componentDatasetControllers = new Map<string, AbortController>();

async function fetchServerDataset(
  request: ComponentQueryLoadRequestV3,
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `/api/datasets/${encodeURIComponent(request.datasetId)}/execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: request.signal,
      body: JSON.stringify({
        parameters: request.parameters,
        limit: request.limit,
        view: request.view,
      }),
    },
  );
  const result = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok)
    throw new Error(
      typeof result.error === "string"
        ? result.error
        : `请求失败（${response.status}）`,
    );
  return result;
}

const componentQueryRuntime = createComponentQueryRefreshV3({
  cache: queryRuntimeCache,
  load: fetchServerDataset,
  resolveView(component) {
    const dataset = serverDatasets.value[component.dataConfig.datasetId];
    return dataset ? serverRuntimeView(component, dataset) : undefined;
  },
  onResolved({ descriptor, value }) {
    descriptorDatasetLeases.get(descriptor)?.apply(descriptor.queryKey, () => {
      runtimeDatasets.value = {
        ...runtimeDatasets.value,
        [descriptor.componentId]: normalizeQueryResult(
          descriptor.datasetId,
          value,
        ),
      };
    });
  },
});
let pointerAction: PointerAction | null = null;
const tabDropTarget = ref<{ tabId: string; itemId: string } | null>(null);
let panelResize: {
  side: "left" | "right";
  startX: number;
  startWidth: number;
} | null = null;
let stateTimer: number | undefined;
let medicalTemplateClickTimer: number | undefined;
let tabHoverTimer: number | undefined;
let tabHoverKey = "";
let previewDialogOpenerId = "";
let previewResizeObserver: ResizeObserver | undefined;

const components = computed(() => dashboard.value.components);
const rootComponents = computed(() => {
  const nestedIds = new Set(
    components.value.flatMap(
      (component) =>
        component.tabsConfig?.items.flatMap(
          (item) => item.componentIds ?? [],
        ) ?? [],
    ),
  );
  return components.value.filter((component) => !nestedIds.has(component.id));
});
const dashboardListItems = computed(() =>
  dashboardWorkspace.value.dashboards.map((application) => ({
    id: application.id,
    name: application.name,
    pageCount: application.pages.length,
  })),
);
const selected = computed(() =>
  components.value.find((component) => component.id === selectedId.value),
);
const selectedEvents = computed(
  () => (selected.value as DashboardComponentV3 | undefined)?.events ?? [],
);
const visibleTabs = computed(() => {
  if (!selected.value)
    return tabs.filter((item) => ["style", "layout", "advanced"].includes(item.id));
  const noDataTypes: ComponentType[] = ["text", "image", "icon", "decoration", "tabs"];
  return noDataTypes.includes(selected.value.type)
    ? tabs.filter((item) => item.id !== "data")
    : tabs;
});
const selectedMedicalTemplate = computed(() =>
  selected.value
    ? medicalTemplates.value.find(
        (item) => item.sourceComponentId === selected.value?.id,
      )
    : undefined,
);
const activePageId = computed(() => pageSession.value.activePageId);
const pageListItems = computed(() =>
  dashboardApplication.value.pages.map(({ id, name, code, order, type }) => ({
    id,
    name,
    code,
    order,
    type,
  })),
);
const eventOwnerEvents = computed(() =>
  eventOwner.value
    ? listOwnerEventsV3(dashboardApplication.value, eventOwner.value)
    : [],
);
const drillPaths = computed(
  () => (dashboardApplication.value.drillPaths ??= []),
);
const eventOwnerAuthorableEvents = computed(() => {
  if (!eventOwner.value) return [];
  try {
    return authorableEventNamesV3(
      resolveEventOwnerV3(dashboardApplication.value, eventOwner.value).owner,
    );
  } catch {
    return [];
  }
});
const eventOwnerComponents = computed(() =>
  eventOwner.value
    ? (dashboardApplication.value.pages
        .find((page) => page.id === eventOwner.value!.pageId)
        ?.components.map(({ id, title }) => ({ id, title })) ?? [])
    : [],
);
const activePageControls = computed(
  () =>
    dashboardApplication.value.pages.find(
      (page) => page.id === activePageId.value,
    )?.controls ?? [],
);
const activePage = computed(() =>
  dashboardApplication.value.pages.find(
    (page) => page.id === activePageId.value,
  ),
);
const activeDrillBreadcrumbs = computed(
  () =>
    interactionState.value?.drills.flatMap((drill) =>
      drill.frames.map((frame) => ({
        pathId: drill.pathId,
        label: frame.label,
        value: frame.value,
      })),
    ) ?? [],
);
const previewRuntime = useDesignerPreviewRuntimeV3({
  activePageId,
  applicationSnapshot: currentApplicationSnapshot,
  async preparePage(signal) {
    await loadActivePageDatasets(signal);
  },
  createRuntime(application, onStatus) {
    if (!parameterRuntime.value) throw new Error("参数运行时未初始化");
    return createDesignerEventRuntimeV3({
      application,
      parameters: parameterRuntime.value,
      initialPageId: activePageId.value,
      queryRuntime: componentQueryRuntime,
      onStatus,
      dialogEnvironment: {
        viewport: () => ({
          width: window.innerWidth,
          height: window.innerHeight,
        }),
        protectedRegions: () => {
          const rect = controlBarElement.value?.getBoundingClientRect();
          return rect
            ? [{ x: rect.x, y: rect.y, width: rect.width, height: rect.height }]
            : [];
        },
      },
      onParameters(values) {
        const previous = parameterRuntimeValues.value;
        parameterRuntimeValues.value = { ...values };
        const changedParameterIds = dashboardApplication.value.parameters
          .map((parameter) => parameter.id)
          .filter(
            (parameterId) =>
              JSON.stringify(previous[parameterId]) !==
              JSON.stringify(values[parameterId]),
          );
        if (changedParameterIds.length && parameterOptionsRuntime) {
          const dag = buildParameterDependencyDagV3(
            dashboardApplication.value.parameters,
          );
          const dependentIds = dependentParameterIdsV3(
            dag,
            changedParameterIds,
          );
          if (dependentIds.length)
            void refreshDatasetParameterOptions(
              dashboardApplication.value,
              dependentIds,
            );
        }
      },
      onInteractionState(snapshot) {
        const dialogClosed =
          (interactionState.value?.dialogs.length ?? 0) >
          snapshot.dialogs.length;
        interactionState.value = snapshot;
        if (dialogClosed)
          void nextTick(() => {
            const opener = document.querySelector<HTMLElement>(
              `[data-component-id="${CSS.escape(previewDialogOpenerId)}"]`,
            );
            if (opener?.isConnected) opener.focus();
          });
        if (
          !previewMode.value ||
          snapshot.closed ||
          snapshot.activePageId === activePageId.value
        )
          return;
        const transition = openPageDesignerSessionV3(
          dashboardApplication.value,
          snapshot.activePageId,
        );
        pageSession.value = transition.session;
        dashboard.value = transition.dashboard;
        normalizeCanvas(false);
        selectedId.value = "";
        datasetCatalogOpen.value = false;
        void loadActivePageDatasets();
      },
      onQueryState(componentId, state, message, queryKey, descriptor) {
        if (!descriptor) return;
        if (state === "loading") {
          const lease = datasetStateGuard.begin(componentId, queryKey);
          descriptorDatasetLeases.set(descriptor, lease);
          activeDatasetLeases.set(componentId, { descriptor, lease });
        } else {
          const lease = descriptorDatasetLeases.get(descriptor);
          const active = activeDatasetLeases.get(componentId);
          if (!lease?.current(queryKey)) return;
          if (active?.descriptor === descriptor)
            activeDatasetLeases.delete(componentId);
          if (state === "failed") lease.fail(message ?? "数据集执行失败");
          else lease.succeed();
        }
      },
    });
  },
});
const previewStatus = previewRuntime.status;
const medicalTemplateGroups = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  const filtered = keyword
    ? medicalTemplates.value.filter((item) =>
        `${item.name} ${item.category}`.toLowerCase().includes(keyword),
      )
    : medicalTemplates.value;
  return [...new Set(filtered.map((item) => item.category))]
    .sort((a, b) => a.localeCompare(b, "zh-CN"))
    .map((category) => ({
      category,
      items: filtered.filter((item) => item.category === category),
    }));
});
const dashboardJson = computed(() =>
  JSON.stringify(
    saveActivePageDraftV3(
      dashboardApplication.value,
      pageSession.value,
      dashboard.value,
    ),
    null,
    2,
  ),
);
const selectedJson = computed(() =>
  selected.value ? JSON.stringify(selected.value, null, 2) : "{}",
);
const selectedDimensionField = computed({
  get: () => selected.value?.dataConfig.dimensions[0]?.field ?? "",
  set: (field: string) => {
    if (!selected.value) return;
    selected.value.dataConfig.dimensions = field
      ? [{ field, role: "category" }]
      : [];
    markDirty();
  },
});
const selectedMeasureField = computed({
  get: () => selected.value?.dataConfig.measures[0]?.field ?? "",
  set: (field: string) => {
    if (!selected.value) return;
    selected.value.dataConfig.measures = field
      ? [{ field, aggregation: "sum", axis: "left" }]
      : [];
    markDirty();
  },
});
const workspaceStyle = computed(() => ({
  gridTemplateColumns: previewMode.value
    ? "minmax(0, 1fr)"
    : `${leftPanelWidth.value}px minmax(0, 1fr) ${rightPanelWidth.value}px`,
}));
const previewScale = computed(() => {
  if (!previewMode.value) return 1;
  const mode = dashboardApplication.value.runtimePolicy.previewScaleMode;
  if (mode === "actual") return 1;
  const width = Math.max(1, previewViewport.value.width - 24);
  const height = Math.max(1, previewViewport.value.height - 24);
  const widthRatio = width / dashboard.value.canvas.width;
  const fitRatio = Math.min(widthRatio, height / dashboard.value.canvas.height);
  return Math.max(0.1, Math.min(1, mode === "fit" ? fitRatio : widthRatio));
});
const artboardWidth = computed(() =>
  previewMode.value
    ? Math.round(dashboard.value.canvas.width * previewScale.value)
    : Math.max(dashboard.value.canvas.width + 58, 658),
);
const artboardStyle = computed(() =>
  previewMode.value
    ? {
        width: `${artboardWidth.value}px`,
        minWidth: `${artboardWidth.value}px`,
        height: `${Math.round(dashboard.value.canvas.height * previewScale.value)}px`,
        minHeight: "0",
        padding: "0",
        border: "0",
        background: "transparent",
        boxShadow: "none",
        "--canvas-height": `${dashboard.value.canvas.height}px`,
      }
    : {
        width: `${artboardWidth.value}px`,
        "--canvas-height": `${dashboard.value.canvas.height}px`,
      },
);
const canvasBackground = computed(() => ({
  width: `${dashboard.value.canvas.width}px`,
  height: `${dashboard.value.canvas.height}px`,
  backgroundColor: dashboard.value.canvas.background,
  "--grid-size": `${dashboard.value.canvas.gridSize}px`,
  "--theme-panel": String(
    dashboardApplication.value.theme.tokens.panelBackground || "#ffffff",
  ),
  "--theme-border": String(
    dashboardApplication.value.theme.tokens.panelBorder || "#e1e7ec",
  ),
  "--theme-text": String(
    dashboardApplication.value.theme.tokens.textPrimary || "#243447",
  ),
  "--theme-text-secondary": String(
    dashboardApplication.value.theme.tokens.textSecondary || "#64748b",
  ),
  transform: previewMode.value ? `scale(${previewScale.value})` : undefined,
  transformOrigin: previewMode.value ? "top left" : undefined,
}));

const eventNameLabels: Record<string, string> = {
  click: "单击",
  doubleClick: "双击",
  rowClick: "行点击",
  valueChange: "值变化",
  pageEnter: "进入页面",
};
const actionTypeLabels: Record<string, string> = {
  setParameter: "设置参数",
  applyLinkage: "联动组件",
  drillDown: "下钻",
  drillUp: "上钻",
  navigatePage: "跳转页面",
  refresh: "刷新",
  openDialog: "打开弹窗",
};

function interactionActionSummary(action: EventBindingV3["actions"][number]) {
  if (action.type === "navigatePage")
    return `${actionTypeLabels[action.type]} → ${dashboardApplication.value.pages.find((page) => page.id === action.pageId)?.name ?? action.pageId}`;
  if (action.type === "applyLinkage")
    return `${actionTypeLabels[action.type]} → ${action.targetComponentIds.length} 个组件`;
  if (action.type === "drillDown")
    return `${actionTypeLabels[action.type]} → ${dashboardApplication.value.drillPaths?.find((path) => path.id === action.pathId)?.name ?? action.pathId}`;
  if (action.type === "setParameter")
    return `${actionTypeLabels[action.type]} → ${action.assignments.length} 个参数`;
  return actionTypeLabels[action.type] ?? action.type;
}

const groupedCatalog = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  const filtered = keyword
    ? catalog.filter((item) => item.label.toLowerCase().includes(keyword))
    : catalog;
  const order = showBasicComponents.value
    ? ["基础组件", "医疗业务组件"]
    : ["医疗业务组件"];
  return order
    .filter((label) => label !== "基础组件" || showBasicComponents.value)
    .filter((label) => label !== "医疗业务组件" || showMedicalComponents.value)
    .map((label) => ({
      label,
      items: filtered.filter((item) => item.group === label),
    }))
    .filter((group) => group.items.length);
});

function createDefaultDashboard(): DashboardModelV2 {
  return {
    version: 2,
    name: "医院运营概览",
    canvas: {
      width: 1200,
      height: 600,
      background: "#f7f9fb",
      showGrid: true,
      gridSize: 12,
    },
    titleStyle: {
      show: true,
      fontSize: 24,
      color: "#243447",
      fontWeight: 700,
      align: "left",
    },
    components: [
      createComponent(
        "kpi_income",
        "income",
        "总收入",
        0,
        0,
        185,
        112,
        "income_month",
        "month_code",
        "amount",
      ),
      createComponent(
        "kpi_visit",
        "kpi",
        "门诊量",
        200,
        0,
        185,
        112,
        "op_visit_month",
        "month_code",
        "visit_count",
      ),
      createComponent(
        "kpi_bed",
        "bed",
        "床位利用率",
        400,
        0,
        185,
        112,
        "bed_usage",
        "dept_name",
        "usage_rate",
      ),
      createComponent(
        "chart_income",
        "line",
        "收入趋势",
        0,
        128,
        385,
        272,
        "income_month",
        "month_code",
        "amount",
      ),
      createComponent(
        "chart_dept",
        "ranking",
        "科室收入排名",
        400,
        128,
        185,
        272,
        "dept_income_rank",
        "dept_name",
        "amount",
      ),
    ],
  };
}

function defaultAnalysisConfig(): AnalysisConfig {
  return {
    xMin: null,
    xMax: null,
    yLeftMin: null,
    yLeftMax: null,
    yRightMin: null,
    yRightMax: null,
    showLabels: false,
    labelDecimals: 0,
    labelPosition: "top",
    labelMode: "value",
    labelShowCategory: false,
    labelShowSeries: false,
    labelUnit: "",
    percentageBase: "category",
    leftAxisTitle: "",
    leftAxisUnit: "",
    leftAxisColor: "#64748b",
    rightAxisTitle: "",
    rightAxisUnit: "",
    rightAxisColor: "#64748b",
    legendVisible: true,
    legendPosition: "bottom",
    warningLines: [],
  };
}

function createComponent(
  id: string,
  type: ComponentType,
  title: string,
  x: number,
  y: number,
  width: number,
  height: number,
  datasetId = "income_month",
  dimension = "month_code",
  field = "amount",
): DashboardComponent {
  return {
    id,
    type,
    title,
    position: { x, y, width, height, zIndex: 1 },
    dataConfig: {
      version: 2,
      sourceKind: "mock",
      datasetId,
      dimensions: dimension ? [{ field: dimension, role: "category" }] : [],
      measures: field
        ? [
            {
              field,
              aggregation: type === "bed" ? "avg" : "sum",
              axis: "left",
              chartType:
                type === "bar" || type === "ranking"
                  ? "bar"
                  : type === "area"
                    ? "area"
                    : type === "combo"
                      ? "bar"
                      : "line",
              labelConfig: {
                show: false,
                showCategory: false,
                showSeries: false,
                mode: "value",
                decimals: 0,
                position: "top",
                unit: "",
                percentageBase: "category",
              },
            },
          ]
        : [],
      filters: [],
      sort: [],
      limit: 200,
    },
    styleConfig: {
      background: "#ffffff",
      titleColor: "#243447",
      titleSize: 10,
      titleWeight: 650,
      titleVisible: true,
      borderColor: "#e1e7ec",
      borderWidth: 1,
      borderRadius: 7,
      shadow: "",
      opacity: 1,
    },
    ...(isChart(type) ? { analysisConfig: defaultAnalysisConfig() } : {}),
    ...(isKpi(type)
      ? {
          kpiConfig: {
            primaryMeasureField: field,
            unit: "",
            decimals: type === "bed" ? 1 : 0,
            useGrouping: true,
            yoyField: "",
            momField: "",
            positiveColor: "#2f9e44",
            negativeColor: "#d9485f",
            targetMode: "fixed" as const,
            targetValue: 0,
            targetField: "",
            showProgress: false,
            progressColor: "#1477c9",
          },
        }
      : {}),
    ...(type === "table"
      ? {
          tableConfig: {
            columns: [
              ...(dimension
                ? [
                    {
                      field: dimension,
                      label: dimension,
                      width: 120,
                      format: "auto" as const,
                      summary: "none" as const,
                    },
                  ]
                : []),
              ...(field
                ? [
                    {
                      field,
                      label: field,
                      width: 120,
                      format: "number" as const,
                      summary: "none" as const,
                    },
                  ]
                : []),
            ],
            striped: true,
            showHeader: true,
            fixedHeader: true,
            pagination: {
              enabled: true,
              mode: "client" as const,
              pageSize: 20,
              showTotal: true,
            },
            conditionalRules: [],
          },
        }
      : {}),
    ...(type === "tabs"
      ? {
          tabsConfig: {
            items: [
              {
                id: `${id}-overview`,
                label: "概览",
                value: "overview",
                componentIds: [],
                visible: true,
                padding: 12,
                gap: 8,
                background: "#ffffff",
              },
              {
                id: `${id}-trend`,
                label: "趋势分析",
                value: "trend",
                componentIds: [],
                visible: true,
                padding: 12,
                gap: 8,
                background: "#ffffff",
              },
              {
                id: `${id}-detail`,
                label: "明细数据",
                value: "detail",
                componentIds: [],
                visible: true,
                padding: 12,
                gap: 8,
                background: "#ffffff",
              },
            ],
            activeItemId: `${id}-overview`,
            alignment: "left" as const,
            titlePosition: "top" as const,
            stylePreset: "default" as const,
            titleSize: 38,
          },
        }
      : {}),
    ...(type === "text"
      ? {
          textConfig: {
            content: "请输入文本内容",
            color: "#243447",
            fontSize: 16,
            fontWeight: 400,
            align: "left" as const,
            verticalAlign: "top" as const,
            lineHeight: 1.5,
          },
        }
      : {}),
    ...(type === "image"
      ? {
          imageConfig: {
            source: "",
            alt: "本地图片",
            objectFit: "contain" as const,
            opacity: 1,
          },
        }
      : {}),
    ...(type === "icon"
      ? {
          iconConfig: {
            name: "hospital" as const,
            color: "#1477c9",
            size: 56,
            strokeWidth: 2,
          },
        }
      : {}),
    ...(type === "decoration"
      ? {
          decorationConfig: {
            shape: "rectangle" as const,
            fill: "transparent",
            borderColor: "#1477c9",
            borderWidth: 1,
            borderRadius: 0,
            direction: "horizontal" as const,
          },
        }
      : {}),
    ...(type === "map"
      ? {
          mapConfig: {
            regionCodeProperty: "code",
            regionNameProperty: "name",
            regionCodeField: "region_code",
            valueField: "value",
            longitudeField: "longitude",
            latitudeField: "latitude",
            pointLabelField: "institution_name",
            emptyColor: "#dbeafe",
            lowColor: "#60a5fa",
            highColor: "#1d4ed8",
            borderColor: "#ffffff",
            pointColor: "#f43f5e",
            showLegend: true,
            showPoints: true,
          },
        }
      : {}),
  };
}

function defaultSize(type: ComponentType) {
  if (
    [
      "line",
      "bar",
      "pie",
      "area",
      "combo",
      "scatter",
      "bubble",
      "outpatient",
      "ranking",
    ].includes(type)
  )
    return { width: 280, height: 220 };
  if (type === "table") return { width: 360, height: 220 };
  if (type === "tabs") return { width: 520, height: 350 };
  if (type === "text") return { width: 260, height: 90 };
  if (type === "image") return { width: 280, height: 180 };
  if (type === "icon") return { width: 96, height: 96 };
  if (type === "decoration") return { width: 280, height: 48 };
  if (type === "map") return { width: 520, height: 360 };
  return { width: 185, height: 112 };
}

function defaultBinding(type: ComponentType) {
  if (["tabs", "text", "image", "icon", "decoration", "map"].includes(type))
    return { datasetId: "", dimension: "", field: "" };
  if (type === "outpatient")
    return {
      datasetId: "op_visit_month",
      dimension: "month_code",
      field: "visit_count",
    };
  if (type === "ranking")
    return {
      datasetId: "dept_income_rank",
      dimension: "dept_name",
      field: "amount",
    };
  if (type === "bed")
    return {
      datasetId: "bed_usage",
      dimension: "dept_name",
      field: "usage_rate",
    };
  return {
    datasetId: "income_month",
    dimension: "month_code",
    field: "amount",
  };
}

function addComponent(
  type: ComponentType,
  dropX?: number,
  dropY?: number,
  target?: TabOwnerV3,
): DashboardComponent | undefined {
  const item = catalog.find((entry) => entry.type === type);
  if (!item) return;
  if (target && type === "tabs") {
    setSaveState("暂不支持页签块嵌套");
    return;
  }
  const size = defaultSize(type);
  const binding = defaultBinding(type);
  const offset = (components.value.length * 18) % 150;
  const x = target
    ? (dropX ?? target.item.padding)
    : clamp(dropX ?? 24 + offset, 0, dashboard.value.canvas.width - size.width);
  const y = target
    ? (dropY ?? target.item.padding)
    : clamp(
        dropY ?? 24 + offset,
        0,
        dashboard.value.canvas.height - size.height,
      );
  const id = `${type}_${Date.now().toString(36)}`;
  const componentTitle = type === "text" ? "医院运营分析说明" : item.label;
  const component = createComponent(
    id,
    type,
    componentTitle,
    x,
    y,
    size.width,
    size.height,
    binding.datasetId,
    binding.dimension,
    binding.field,
  );
  component.position.zIndex =
    Math.max(0, ...components.value.map((entry) => entry.position.zIndex)) + 1;
  if (type === "bubble")
    component.dataConfig.measures.forEach((measure) => {
      if (measure.labelConfig) measure.labelConfig.show = true;
    });
  components.value.push(component);
  if (target) {
    const result = reparentComponentV3(
      components.value,
      component.id,
      { kind: "tab", tabId: target.tab.id, itemId: target.item.id },
      { x, y },
    );
    if (!result.success) {
      components.value.splice(components.value.indexOf(component), 1);
      setSaveState(result.error ?? "组件拖入失败");
      return;
    }
  }
  selectedId.value = id;
  activeTab.value = "layout";
  markDirty();
  return component;
}

function persistMedicalTemplates() {
  localStorage.setItem(
    TEMPLATE_STORAGE_KEY,
    JSON.stringify(medicalTemplates.value),
  );
}

function registerSelectedMedical(event: Event) {
  if (!selected.value) return;
  const checked = (event.target as HTMLInputElement).checked;
  const existing = selectedMedicalTemplate.value;
  if (!checked) {
    if (existing)
      medicalTemplates.value = medicalTemplates.value.filter(
        (item) => item.id !== existing.id,
      );
  } else {
    const saved = saveMedicalTemplate(
      selected.value,
      existing?.category || "自定义医疗组件",
      existing,
    );
    medicalTemplates.value = [
      ...medicalTemplates.value.filter((item) => item.id !== saved.id),
      saved,
    ];
  }
  persistMedicalTemplates();
}

function updateSelectedMedicalTemplate() {
  if (!selected.value || !selectedMedicalTemplate.value) return;
  const saved = saveMedicalTemplate(
    selected.value,
    selectedMedicalTemplate.value.category,
    selectedMedicalTemplate.value,
  );
  medicalTemplates.value = [
    ...medicalTemplates.value.filter((item) => item.id !== saved.id),
    saved,
  ];
  persistMedicalTemplates();
  setSaveState("医疗业务组件已更新");
}

function updateMedicalCategory(category: string) {
  if (!selectedMedicalTemplate.value) return;
  selectedMedicalTemplate.value.category = category.trim() || "自定义医疗组件";
  selectedMedicalTemplate.value.updatedAt = new Date().toISOString();
  persistMedicalTemplates();
}

function renameMedicalTemplate(template: MedicalComponentTemplate) {
  if (medicalTemplateClickTimer) window.clearTimeout(medicalTemplateClickTimer);
  medicalTemplateClickTimer = undefined;
  const name = window.prompt("重命名医疗业务组件", template.name);
  if (name === null || !name.trim()) return;
  template.name = name.trim();
  template.component.title = template.name;
  template.updatedAt = new Date().toISOString();
  persistMedicalTemplates();
}

function queueMedicalTemplate(template: MedicalComponentTemplate) {
  if (medicalTemplateClickTimer) window.clearTimeout(medicalTemplateClickTimer);
  medicalTemplateClickTimer = window.setTimeout(() => {
    addMedicalTemplate(template);
    medicalTemplateClickTimer = undefined;
  }, 220);
}

function renameMedicalCategory(category: string) {
  const next = window.prompt("重命名组件分类", category);
  if (next === null || !next.trim() || next.trim() === category) return;
  const normalized = next.trim();
  for (const template of medicalTemplates.value.filter(
    (item) => item.category === category,
  )) {
    template.category = normalized;
    template.updatedAt = new Date().toISOString();
  }
  persistMedicalTemplates();
}

function addMedicalTemplate(template: MedicalComponentTemplate) {
  const offset = (components.value.length * 18) % 150;
  const id = `${template.component.type}_${Date.now().toString(36)}`;
  const component = instantiateMedicalTemplate(
    template,
    id,
    24 + offset,
    24 + offset,
  );
  component.position.zIndex =
    Math.max(0, ...components.value.map((entry) => entry.position.zIndex)) + 1;
  components.value.push(component);
  normalizeComponent(component);
  template.sourceComponentId = id;
  template.updatedAt = new Date().toISOString();
  persistMedicalTemplates();
  selectedId.value = id;
  activeTab.value = "layout";
  markDirty();
}

function handleDragStart(event: DragEvent, type: ComponentType) {
  event.dataTransfer?.setData("application/x-medical-bi-component", type);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "copy";
}

function handleDrop(event: DragEvent) {
  const type = event.dataTransfer?.getData(
    "application/x-medical-bi-component",
  ) as ComponentType;
  if (!type || !canvasElement.value) return;
  const rect = canvasElement.value.getBoundingClientRect();
  const size = defaultSize(type);
  addComponent(
    type,
    event.clientX - rect.left - size.width / 2,
    event.clientY - rect.top - 24,
  );
}

function activeTabOwner(tab: DashboardComponent): TabOwnerV3 | undefined {
  const item = activeTabItem(tab);
  return item ? { tab, item } : undefined;
}

function handleTabDragOver(event: DragEvent, tab: DashboardComponent) {
  if (
    previewMode.value ||
    !event.dataTransfer?.types.includes("application/x-medical-bi-component")
  )
    return;
  const owner = activeTabOwner(tab);
  if (!owner) return;
  event.preventDefault();
  event.stopPropagation();
  event.dataTransfer.dropEffect = "copy";
  tabDropTarget.value = { tabId: tab.id, itemId: owner.item.id };
}

function handleTabDragLeave(event: DragEvent, tab: DashboardComponent) {
  const current = event.currentTarget as HTMLElement;
  if (
    event.relatedTarget instanceof Node &&
    current.contains(event.relatedTarget)
  )
    return;
  if (tabDropTarget.value?.tabId === tab.id) tabDropTarget.value = null;
}

function handleTabDrop(event: DragEvent, tab: DashboardComponent) {
  event.preventDefault();
  event.stopPropagation();
  const type = event.dataTransfer?.getData(
    "application/x-medical-bi-component",
  ) as ComponentType;
  const owner = activeTabOwner(tab);
  if (!owner || !catalog.some((entry) => entry.type === type)) {
    tabDropTarget.value = null;
    return;
  }
  if (type === "tabs") {
    tabDropTarget.value = null;
    setSaveState("暂不支持页签块嵌套");
    return;
  }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const size = defaultSize(type);
  const component = addComponent(
    type,
    event.clientX - rect.left - size.width / 2,
    event.clientY - rect.top - 24,
    owner,
  );
  tabDropTarget.value = null;
  const catalogLabel = catalog.find((entry) => entry.type === type)?.label;
  if (component)
    setSaveState(
      `已将${catalogLabel ?? component.title}拖入“${owner.item.label}”`,
    );
}

function startPointer(
  event: PointerEvent,
  component: DashboardComponent,
  mode: "move" | "resize",
  direction?: ResizeDirection,
) {
  const target = event.target as HTMLElement;
  if (
    mode === "move" &&
    target.closest("button, input, select") &&
    !target.closest(".widget-grip")
  )
    return;
  event.preventDefault();
  selectedId.value = component.id;
  const start = { ...component.position };
  component.position.zIndex =
    Math.max(...components.value.map((item) => item.position.zIndex), 1) + 1;
  const owner = tabOwnerForComponent(component.id);
  const contentSize = owner
    ? tabContentSizeV3(owner.tab, owner.item)
    : undefined;
  const bounds = contentSize
    ? {
        width: contentSize.width,
        height: contentSize.height,
        padding: contentSize.padding,
      }
    : {
        width: dashboard.value.canvas.width,
        height: dashboard.value.canvas.height,
        padding: 0,
      };
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  pointerAction = {
    id: component.id,
    mode,
    direction,
    startClientX: event.clientX,
    startClientY: event.clientY,
    start,
    bounds,
    ...(owner
      ? { sourceOwner: { tabId: owner.tab.id, itemId: owner.item.id } }
      : {}),
    grabOffsetX: event.clientX - rect.left,
    grabOffsetY: event.clientY - rect.top,
  };
  window.addEventListener("pointermove", handlePointerMove);
  window.addEventListener("pointerup", endPointer, { once: true });
  window.addEventListener("keydown", cancelPointerOnEscape);
}

function tabContentElement(tabId: string, itemId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `.dashboard-tab-content[data-tab-id="${CSS.escape(tabId)}"][data-tab-item-id="${CSS.escape(itemId)}"]`,
  );
}

function pointerTabTarget(
  clientX: number,
  clientY: number,
  componentId: string,
):
  | { tab: DashboardComponent; item: TabItemConfig; element: HTMLElement }
  | undefined {
  for (const element of document.elementsFromPoint(clientX, clientY)) {
    const content = element.closest<HTMLElement>(
      ".dashboard-tab-content[data-tab-id][data-tab-item-id]",
    );
    if (!content) continue;
    const tabId = content.dataset.tabId ?? "";
    const itemId = content.dataset.tabItemId ?? "";
    if (!tabId || !itemId || tabId === componentId) continue;
    const tab = components.value.find(
      (candidate) => candidate.id === tabId && candidate.type === "tabs",
    );
    const item = tab?.tabsConfig?.items.find(
      (candidate) => candidate.id === itemId && candidate.visible !== false,
    );
    if (tab && item) return { tab, item, element: content };
  }
  return undefined;
}

function clearTabHover() {
  if (tabHoverTimer) window.clearTimeout(tabHoverTimer);
  tabHoverTimer = undefined;
  tabHoverKey = "";
}

function updateTabHeaderHover(
  event: PointerEvent,
  component: DashboardComponent,
) {
  if (component.type === "tabs") return clearTabHover();
  const button = document
    .elementsFromPoint(event.clientX, event.clientY)
    .map((element) =>
      element.closest<HTMLElement>(
        "[data-tab-header-id][data-tab-header-item-id]",
      ),
    )
    .find(Boolean);
  const tabId = button?.dataset.tabHeaderId ?? "";
  const itemId = button?.dataset.tabHeaderItemId ?? "";
  const key = tabId && itemId ? `${tabId}::${itemId}` : "";
  if (!key || key === tabHoverKey) return key ? undefined : clearTabHover();
  clearTabHover();
  tabHoverKey = key;
  tabHoverTimer = window.setTimeout(() => {
    const tab = components.value.find((candidate) => candidate.id === tabId);
    const item = tab?.tabsConfig?.items.find(
      (candidate) => candidate.id === itemId && candidate.visible !== false,
    );
    if (!tab || !item || component.id === tab.id) return;
    setTabSelection(tab.id, item.id);
    tabDropTarget.value = { tabId: tab.id, itemId: item.id };
    setSaveState(`已切换到“${item.label}”，可继续拖入`);
  }, 450);
}

function handlePointerMove(event: PointerEvent) {
  if (!pointerAction) return;
  const component = components.value.find(
    (item) => item.id === pointerAction?.id,
  );
  if (!component) return;
  const dx = event.clientX - pointerAction.startClientX;
  const dy = event.clientY - pointerAction.startClientY;
  const start = pointerAction.start;
  const padding = pointerAction.bounds.padding;

  if (pointerAction.mode === "move") {
    updateTabHeaderHover(event, component);
    const target =
      component.type === "tabs"
        ? undefined
        : pointerTabTarget(event.clientX, event.clientY, component.id);
    tabDropTarget.value = target
      ? { tabId: target.tab.id, itemId: target.item.id }
      : null;
    component.position.x = Math.round(
      clamp(
        start.x + dx,
        padding,
        pointerAction.bounds.width - padding - component.position.width,
      ),
    );
    component.position.y = Math.round(
      clamp(
        start.y + dy,
        padding,
        pointerAction.bounds.height - padding - component.position.height,
      ),
    );
    return;
  }

  const direction = pointerAction.direction ?? "se";
  let left = start.x;
  let top = start.y;
  let right = start.x + start.width;
  let bottom = start.y + start.height;

  const minimum = componentMinimumSizeV3(component);
  if (direction.includes("w"))
    left = clamp(start.x + dx, padding, right - minimum.width);
  if (direction.includes("e"))
    right = clamp(
      start.x + start.width + dx,
      left + minimum.width,
      pointerAction.bounds.width - padding,
    );
  if (direction.includes("n"))
    top = clamp(start.y + dy, padding, bottom - minimum.height);
  if (direction.includes("s"))
    bottom = clamp(
      start.y + start.height + dy,
      top + minimum.height,
      pointerAction.bounds.height - padding,
    );

  component.position.x = Math.round(left);
  component.position.y = Math.round(top);
  component.position.width = Math.round(right - left);
  component.position.height = Math.round(bottom - top);
}

function restorePointerStart(action: PointerAction) {
  const component = components.value.find(
    (candidate) => candidate.id === action.id,
  );
  if (component) component.position = { ...action.start };
}

function clearPointerState() {
  pointerAction = null;
  tabDropTarget.value = null;
  clearTabHover();
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerup", endPointer);
  window.removeEventListener("keydown", cancelPointerOnEscape);
}

function cancelActivePointer() {
  if (pointerAction) restorePointerStart(pointerAction);
  clearPointerState();
}

function cancelPointerOnEscape(event: KeyboardEvent) {
  if (event.key !== "Escape" || !pointerAction) return;
  cancelActivePointer();
  setSaveState("已取消拖拽");
}

function endPointer(event: PointerEvent) {
  const action = pointerAction;
  if (!action) return clearPointerState();
  const component = components.value.find(
    (candidate) => candidate.id === action.id,
  );
  if (!component) return clearPointerState();

  if (action.mode === "resize") {
    normalizeCanvas();
    return clearPointerState();
  }

  if (action.mode === "move" && component.type !== "tabs") {
    const target = pointerTabTarget(event.clientX, event.clientY, component.id);
    if (target) {
      const rect = target.element.getBoundingClientRect();
      const result = reparentComponentV3(
        components.value,
        component.id,
        { kind: "tab", tabId: target.tab.id, itemId: target.item.id },
        {
          x: event.clientX - rect.left - action.grabOffsetX,
          y: event.clientY - rect.top - action.grabOffsetY,
        },
      );
      if (!result.success) {
        restorePointerStart(action);
        setSaveState(result.error ?? "组件移动失败");
        return clearPointerState();
      }
      markDirty();
      setSaveState(`已移入“${target.item.label}”`);
      return clearPointerState();
    }

    if (action.sourceOwner && canvasElement.value) {
      const rect = canvasElement.value.getBoundingClientRect();
      const insideCanvas =
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom;
      if (!insideCanvas) {
        restorePointerStart(action);
        setSaveState("释放位置无效，已恢复原位置");
        return clearPointerState();
      }
      const result = reparentComponentV3(
        components.value,
        component.id,
        { kind: "canvas", canvas: dashboard.value.canvas },
        {
          x: event.clientX - rect.left - action.grabOffsetX,
          y: event.clientY - rect.top - action.grabOffsetY,
        },
      );
      if (!result.success) {
        restorePointerStart(action);
        setSaveState(result.error ?? "组件移出失败");
        return clearPointerState();
      }
      markDirty();
      setSaveState("已移出页签块");
      return clearPointerState();
    }
  }

  if (action.mode === "move" && !action.sourceOwner && canvasElement.value) {
    const rect = canvasElement.value.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      restorePointerStart(action);
      setSaveState("释放位置无效，已恢复原位置");
      return clearPointerState();
    }
  }
  markDirty();
  clearPointerState();
}

function normalizeSelected() {
  if (!selected.value) return;
  normalizeComponent(selected.value);
  markDirty();
}

function normalizeComponent(component: DashboardComponent) {
  ensureTabsConfig(component);
  component.styleConfig.borderColor ??= "#e1e7ec";
  component.styleConfig.borderWidth = clamp(
    component.styleConfig.borderWidth ?? 1,
    0,
    12,
  );
  component.styleConfig.borderRadius = clamp(
    component.styleConfig.borderRadius ?? 7,
    0,
    80,
  );
  component.styleConfig.shadow ??= "";
  component.styleConfig.opacity = clamp(
    component.styleConfig.opacity ?? 1,
    0,
    1,
  );
  if (component.type === "text")
    component.textConfig ??= {
      content: "请输入文本内容",
      color: "#243447",
      fontSize: 16,
      fontWeight: 400,
      align: "left",
      verticalAlign: "top",
      lineHeight: 1.5,
    };
  if (component.type === "image")
    component.imageConfig ??= {
      source: "",
      alt: "本地图片",
      objectFit: "contain",
      opacity: 1,
    };
  if (component.type === "icon")
    component.iconConfig ??= {
      name: "hospital",
      color: "#1477c9",
      size: 56,
      strokeWidth: 2,
    };
  if (component.type === "decoration")
    component.decorationConfig ??= {
      shape: "rectangle",
      fill: "transparent",
      borderColor: "#1477c9",
      borderWidth: 1,
      borderRadius: 0,
      direction: "horizontal",
    };
  if (component.type === "map")
    component.mapConfig ??= {
      regionCodeProperty: "code",
      regionNameProperty: "name",
      regionCodeField: "region_code",
      valueField: "value",
      longitudeField: "longitude",
      latitudeField: "latitude",
      pointLabelField: "institution_name",
      emptyColor: "#dbeafe",
      lowColor: "#60a5fa",
      highColor: "#1d4ed8",
      borderColor: "#ffffff",
      pointColor: "#f43f5e",
      showLegend: true,
      showPoints: true,
    };
  if (isChart(component.type)) {
    component.analysisConfig ??= defaultAnalysisConfig();
    component.dataConfig.measures.forEach((measure, index) => {
      measure.axis ??= "left";
      measure.chartType ??=
        component.type === "bar" || component.type === "ranking"
          ? "bar"
          : component.type === "area"
            ? "area"
            : component.type === "combo" && index === 0
              ? "bar"
              : "line";
      measure.labelConfig ??= {
        show: component.type === "bubble",
        showCategory: false,
        showSeries: false,
        mode: "value",
        decimals: 0,
        position: "top",
        unit: measure.unit ?? "",
        percentageBase: "category",
      };
    });
  }
  const owner = tabOwnerForComponent(component.id);
  const contentSize = owner
    ? tabContentSizeV3(owner.tab, owner.item)
    : undefined;
  const bounds = contentSize ?? {
    width: dashboard.value.canvas.width,
    height: dashboard.value.canvas.height,
    padding: 0,
  };
  const minimum =
    component.type === "tabs"
      ? minimumTabOuterSizeV3(component)
      : componentMinimumSizeV3(component);
  component.position.width = Math.round(
    clamp(
      component.position.width,
      minimum.width,
      bounds.width - bounds.padding * 2,
    ),
  );
  component.position.height = Math.round(
    clamp(
      component.position.height,
      minimum.height,
      bounds.height - bounds.padding * 2,
    ),
  );
  component.position.x = Math.round(
    clamp(
      component.position.x,
      bounds.padding,
      bounds.width - bounds.padding - component.position.width,
    ),
  );
  component.position.y = Math.round(
    clamp(
      component.position.y,
      bounds.padding,
      bounds.height - bounds.padding - component.position.height,
    ),
  );
}

function normalizeCanvas(mark: boolean | Event = true) {
  const canvas = dashboard.value.canvas;
  canvas.width = Math.round(clamp(canvas.width, 320, 1920));
  canvas.height = Math.round(clamp(canvas.height, 240, 6000));
  canvas.gridSize = Math.round(clamp(canvas.gridSize, 4, 40));
  for (const tab of components.value.filter(
    (component) => component.type === "tabs",
  )) {
    ensureTabsConfig(tab);
    const minimum = minimumTabOuterSizeV3(tab);
    canvas.width = Math.round(
      clamp(Math.max(canvas.width, minimum.width), 320, 1920),
    );
    canvas.height = Math.round(
      clamp(Math.max(canvas.height, minimum.height), 240, 6000),
    );
  }
  components.value
    .filter((component) => component.type === "tabs")
    .forEach(normalizeComponent);
  components.value
    .filter((component) => component.type !== "tabs")
    .forEach(normalizeComponent);
  if (mark !== false) markDirty();
}

function deleteSelected() {
  if (!selected.value) return;
  const deleting = selected.value;
  const deletingEventOwner =
    eventOwner.value?.kind === "component" &&
    eventOwner.value.pageId === activePageId.value &&
    eventOwner.value.componentId === selected.value.id;
  if (deletingEventOwner && !guardEventDraft()) return;
  if (deleting.tabsConfig)
    deleting.tabsConfig.items.forEach((item) =>
      detachTabItemComponents(deleting, item),
    );
  for (const tab of components.value.filter(
    (component) => component.tabsConfig,
  )) {
    for (const item of tab.tabsConfig!.items)
      item.componentIds = item.componentIds.filter((id) => id !== deleting.id);
  }
  const index = components.value.findIndex(
    (component) => component.id === selectedId.value,
  );
  components.value.splice(index, 1);
  if (deletingEventOwner) {
    eventPanel.value?.discardDraft();
    eventOwner.value = null;
  }
  selectedId.value =
    components.value[Math.min(index, components.value.length - 1)]?.id ?? "";
  markDirty();
}

function selectCanvas() {
  selectedId.value = "";
  activeTab.value = "layout";
}

function sourceKindFor(component: DashboardComponent) {
  return component.dataConfig.sourceKind ?? "mock";
}

function syncDatasetFields() {
  if (!selected.value) return;
  selected.value.dataConfig.sourceKind = "mock";
  const dataset = getMockDataset(selected.value.dataConfig.datasetId);
  const stringField =
    dataset.fields.find((field) => field.type === "string") ??
    dataset.fields[0];
  const numberField =
    dataset.fields.find((field) => field.type === "number") ??
    dataset.fields[0];
  selected.value.dataConfig.dimensions = stringField
    ? [{ field: stringField.name, role: "category" }]
    : [];
  selected.value.dataConfig.measures = numberField
    ? [{ field: numberField.name, aggregation: "sum", axis: "left" }]
    : [];
  markDirty();
}

function switchToMock() {
  if (!selected.value) return;
  selected.value.dataConfig.sourceKind = "mock";
  selected.value.dataConfig.datasetId = mockDatasets[0].id;
  syncDatasetFields();
}

async function chooseServerDataset(dataset: CatalogDataset) {
  if (!selected.value) return;
  serverDatasets.value = { ...serverDatasets.value, [dataset.id]: dataset };
  selected.value.dataConfig.sourceKind = "server";
  selected.value.dataConfig.datasetId = dataset.id;
  const dimension =
    dataset.fields.find(
      (field) => field.type === "string" || field.type === "date",
    ) ?? dataset.fields[0];
  const metric =
    dataset.fields.find((field) => field.type === "number") ??
    dataset.fields[0];
  selected.value.dataConfig.dimensions = dimension
    ? [{ field: dimension.name, role: "category" }]
    : [];
  selected.value.dataConfig.measures = metric
    ? [{ field: metric.name, aggregation: "sum", axis: "left" }]
    : [];
  selected.value.dataConfig = upgradeComponentDataConfigV3(
    selected.value.dataConfig,
  );
  applySuggestedParameterBindings(selected.value, dataset.parameters ?? []);
  datasetCatalogOpen.value = false;
  markDirty();
  await loadServerDataset(selected.value);
}

function datasetParametersFor(
  component: DashboardComponent,
): DatasetQueryParameterV3[] {
  return serverDatasets.value[component.dataConfig.datasetId]?.parameters ?? [];
}

function componentDataConfigV3(
  component: DashboardComponent,
): ComponentDataConfigV3 {
  if (component.dataConfig.version !== 3)
    component.dataConfig = upgradeComponentDataConfigV3(component.dataConfig);
  return component.dataConfig;
}

function parameterBindingFor(
  component: DashboardComponent,
  datasetParameterCode: string,
): string {
  if (component.dataConfig.version !== 3) return "";
  return (
    component.dataConfig.parameterBindings.find(
      (item) => item.datasetParameterCode === datasetParameterCode,
    )?.parameterId ?? ""
  );
}

function applySuggestedParameterBindings(
  component: DashboardComponent,
  datasetParameters = datasetParametersFor(component),
) {
  const bindings = suggestDatasetParameterBindingsV3(
    datasetParameters,
    dashboardApplication.value.parameters,
  )
    .filter((candidate) => candidate.parameterId)
    .map((candidate) => ({
      datasetParameterCode: candidate.datasetParameterCode,
      parameterId: candidate.parameterId!,
    }));
  component.dataConfig = upgradeComponentDataConfigV3(
    component.dataConfig,
    bindings,
  );
}

function autoBindSelectedParameters() {
  if (!selected.value) return;
  applySuggestedParameterBindings(selected.value);
  const result = validateDatasetParameterBindingsV3(
    componentDataConfigV3(selected.value).parameterBindings,
    datasetParametersFor(selected.value),
    dashboardApplication.value.parameters,
  );
  setSaveState(
    result.valid
      ? "参数已自动绑定"
      : (result.issues[0]?.message ?? "参数绑定需检查"),
  );
  markDirty();
}

function setSelectedParameterBinding(
  datasetParameterCode: string,
  event: Event,
) {
  if (!selected.value) return;
  const parameterId = (event.target as HTMLSelectElement).value;
  const config = componentDataConfigV3(selected.value);
  const bindings = config.parameterBindings.filter(
    (item) => item.datasetParameterCode !== datasetParameterCode,
  );
  if (parameterId) bindings.push({ datasetParameterCode, parameterId });
  selected.value.dataConfig = upgradeComponentDataConfigV3(config, bindings);
  const result = validateDatasetParameterBindingsV3(
    bindings,
    datasetParametersFor(selected.value),
    dashboardApplication.value.parameters,
  );
  setSaveState(
    result.valid
      ? "参数绑定已更新"
      : (result.issues[0]?.message ?? "参数绑定需检查"),
  );
  markDirty();
}

function setSelectedRefreshPolicy(event: Event) {
  if (!selected.value) return;
  const policy = (event.target as HTMLSelectElement)
    .value as ComponentDataConfigV3["refreshPolicy"];
  const config = componentDataConfigV3(selected.value);
  selected.value.dataConfig = upgradeComponentDataConfigV3(
    config,
    config.parameterBindings,
    policy,
  );
  markDirty();
}

function fieldsFor(component: DashboardComponent): DesignerField[] {
  if (sourceKindFor(component) === "mock") {
    return getMockDataset(component.dataConfig.datasetId).fields.map(
      (field) => ({ ...field }),
    );
  }
  const serverFields =
    serverDatasets.value[component.dataConfig.datasetId]?.fields;
  if (serverFields)
    return serverFields.map((field) => ({ ...field, label: field.name }));
  const runtimeFields = runtimeDatasets.value[component.id]?.fields ?? [];
  return runtimeFields.map((field) => ({
    name: field.name,
    type: field.dataType,
    label: field.label ?? field.name,
  }));
}

function rowsFor(
  component: DashboardComponent,
): Array<Record<string, unknown>> {
  if (sourceKindFor(component) === "mock")
    return getMockDataset(component.dataConfig.datasetId).rows;
  return runtimeDatasets.value[component.id]?.rows ?? [];
}

function datasetNameFor(component: DashboardComponent) {
  if (sourceKindFor(component) === "mock")
    return getMockDataset(component.dataConfig.datasetId).name;
  return (
    serverDatasets.value[component.dataConfig.datasetId]?.name ?? "已保存数据集"
  );
}

function datasetDescriptionFor(component: DashboardComponent) {
  if (sourceKindFor(component) === "mock")
    return getMockDataset(component.dataConfig.datasetId).description;
  return (
    serverDatasets.value[component.dataConfig.datasetId]?.notes ||
    "PostgreSQL / Greenplum 只读数据集"
  );
}

function datasetRowCountFor(component: DashboardComponent) {
  if (sourceKindFor(component) === "mock") return rowsFor(component).length;
  return runtimeDatasets.value[component.id]?.rowCount ?? 0;
}

function isDatasetLoading(component: DashboardComponent) {
  return (
    sourceKindFor(component) === "server" &&
    Boolean(datasetLoading.value[component.id])
  );
}

function datasetErrorFor(component: DashboardComponent) {
  return sourceKindFor(component) === "server"
    ? datasetErrors.value[component.id] || ""
    : "";
}

function runtimeParameterValues(): Record<string, JsonValueV3> {
  return safeParameterRuntimeValuesV3(
    parameterRuntime.value?.snapshot().values ?? {},
  );
}

function initializeParameterRuntime(application: DashboardApplicationV3) {
  parameterOptionsRuntime?.dispose();
  parameterRuntime.value = new ParameterRuntimeStoreV3(application.parameters);
  parameterOptionsRuntime = new ParameterOptionsRuntimeV3(
    application.parameters,
    createHttpParameterOptionsLoaderV3(),
  );
  if (typeof window !== "undefined") {
    const url = new URL(window.location.href);
    const requestedDashboardId = url.searchParams.get("dashboardId");
    const matchesDashboard = requestedDashboardId
      ? requestedDashboardId === application.id
      : dashboardWorkspace.value.dashboards.length === 1;
    const assignments: Array<{ parameterId: string; value: JsonValueV3 }> = [];
    let invalid = false;
    if (matchesDashboard) {
      for (const parameter of application.parameters) {
        const key = `parameter.${parameter.id}`;
        const values = url.searchParams.getAll(key);
        if (values.length > 1) {
          invalid = true;
          break;
        }
        if (values.length === 1) {
          try {
            assignments.push({
              parameterId: parameter.id,
              value: JSON.parse(values[0]) as JsonValueV3,
            });
          } catch {
            invalid = true;
            break;
          }
        }
      }
    }
    if (!invalid && assignments.length) {
      try {
        parameterRuntime.value.commit(assignments, "control");
      } catch {
        /* fail closed without partial import */
      }
    }
  }
  parameterRuntimeValues.value = runtimeParameterValues();
  pendingControlValues.value = {};
  parameterDynamicOptions.value = {};
  parameterOptionStates.value = {};
  const optionOrder = buildParameterDependencyDagV3(
    application.parameters,
  ).order.filter(
    (parameterId) =>
      application.parameters.find((item) => item.id === parameterId)?.source
        .kind === "dataset",
  );
  void refreshDatasetParameterOptions(application, optionOrder);
}

function parameterFor(parameterId: string): ParameterDefinitionV3 | undefined {
  return dashboardApplication.value.parameters.find(
    (parameter) => parameter.id === parameterId,
  );
}

function suggestedControlType(
  parameter: ParameterDefinitionV3,
): ParameterControlV3["type"] {
  if (parameter.type === "singleSelect") return "singleSelect";
  if (parameter.type === "multiSelect") return "multiSelect";
  if (parameter.type === "date") return "date";
  if (parameter.type === "dateRange") return "dateRange";
  return "input";
}

function parameterHasControl(parameterId: string) {
  return activePageControls.value.some((control) =>
    control.parameterIds.includes(parameterId),
  );
}

function addParameterControl(parameterId: string) {
  const page = activePage.value;
  const parameter = parameterFor(parameterId);
  if (!page || !parameter || parameterHasControl(parameterId)) return;
  const index = page.controls.length;
  page.controls.push({
    id: `control-${crypto.randomUUID()}`,
    type: suggestedControlType(parameter),
    parameterIds: [parameterId],
    position: {
      x: 24 + index * 12,
      y: 16,
      width: 220,
      height: 44,
      zIndex: index + 1,
    },
    styleConfig: {},
    interaction: { submitMode: "immediate", clearable: true },
  });
  markDirty();
  setSaveState(`已将“${parameter.name}”添加到当前画布`);
}

function removeParameterControl(controlId: string) {
  const page = activePage.value;
  if (!page) return;
  const index = page.controls.findIndex((control) => control.id === controlId);
  if (index < 0) return;
  page.controls.splice(index, 1);
  markDirty();
}

function optionsForParameter(parameter: ParameterDefinitionV3) {
  if (parameter.source.kind === "static") return parameter.source.options;
  if (parameter.source.kind === "dictionary")
    return (
      findBuiltinDictionaryV3(parameter.source.dictionaryCode)?.options ?? []
    );
  if (parameter.source.kind === "dataset")
    return parameterDynamicOptions.value[parameter.id] ?? [];
  return [];
}

function parameterOptionState(parameterId: string) {
  return (
    parameterOptionStates.value[parameterId] ?? { status: "idle" as const }
  );
}

async function refreshDatasetParameterOptions(
  application: DashboardApplicationV3,
  parameterIds: readonly string[],
) {
  if (!parameterOptionsRuntime || !parameterRuntime.value)
    return [] as string[];
  const changed: string[] = [];
  for (const parameterId of parameterIds) {
    const definition = application.parameters.find(
      (item) => item.id === parameterId,
    );
    if (!definition || definition.source.kind !== "dataset") continue;
    parameterOptionStates.value = {
      ...parameterOptionStates.value,
      [parameterId]: { status: "loading" },
    };
    const result = await parameterOptionsRuntime.load(
      parameterId,
      runtimeParameterValues(),
    );
    if (result.status === "stale") continue;
    if (result.status === "error") {
      parameterDynamicOptions.value = {
        ...parameterDynamicOptions.value,
        [parameterId]: [],
      };
      parameterOptionStates.value = {
        ...parameterOptionStates.value,
        [parameterId]: { status: "error", message: result.message },
      };
      const current = parameterRuntime.value.get(parameterId);
      const cleared = reconcileParameterOptionValueV3(definition, current, []);
      if (JSON.stringify(current) !== JSON.stringify(cleared)) {
        const commit = parameterRuntime.value.commit(
          [{ parameterId, value: cleared }],
          "control",
        );
        if (commit.changed) changed.push(parameterId);
      }
      continue;
    }
    parameterDynamicOptions.value = {
      ...parameterDynamicOptions.value,
      [parameterId]: result.options,
    };
    parameterOptionStates.value = {
      ...parameterOptionStates.value,
      [parameterId]: { status: result.options.length ? "ready" : "empty" },
    };
    const current = parameterRuntime.value.get(parameterId);
    const reconciled = reconcileParameterOptionValueV3(
      definition,
      current,
      result.options,
    );
    if (JSON.stringify(current) !== JSON.stringify(reconciled)) {
      const commit = parameterRuntime.value.commit(
        [{ parameterId, value: reconciled }],
        "control",
      );
      if (commit.changed) changed.push(parameterId);
    }
  }
  parameterRuntimeValues.value = runtimeParameterValues();
  return changed;
}

function controlValue(parameterId: string): unknown {
  return Object.hasOwn(pendingControlValues.value, parameterId)
    ? pendingControlValues.value[parameterId]
    : parameterRuntimeValues.value[parameterId];
}

function scalarControlValue(parameterId: string): string | number {
  const value = controlValue(parameterId);
  return typeof value === "number" || typeof value === "string" ? value : "";
}

function dateRangeControlValue(parameterId: string, index: number): string {
  const value = controlValue(parameterId);
  return Array.isArray(value) && typeof value[index] === "string"
    ? value[index]
    : "";
}

async function commitControlAssignments(
  assignments: Array<{ parameterId: string; value: unknown }>,
  sourceControl?: ParameterControlV3,
) {
  if (!parameterRuntime.value || !assignments.length) return;
  try {
    const commit = parameterRuntime.value.commit(assignments);
    parameterRuntimeValues.value = runtimeParameterValues();
    if (!commit.changed) {
      setSaveState("参数值未变化，无需刷新");
      return;
    }
    const dag = buildParameterDependencyDagV3(
      dashboardApplication.value.parameters,
    );
    const dependentIds = dependentParameterIdsV3(
      dag,
      commit.changedParameterIds,
    );
    const cascadedIds = await refreshDatasetParameterOptions(
      dashboardApplication.value,
      dependentIds,
    );
    const allChangedIds = [
      ...new Set([...commit.changedParameterIds, ...cascadedIds]),
    ];
    const affected = componentsAffectedByParameterCommitV3(
      components.value,
      allChangedIds,
    ).filter((component) => sourceKindFor(component) === "server");
    await Promise.all(
      affected.map((component) => loadServerDataset(component)),
    );
    if (previewMode.value && sourceControl) {
      const value: JsonValueV3 =
        assignments.length === 1
          ? (parameterRuntimeValues.value[assignments[0].parameterId] ?? null)
          : Object.fromEntries(
              assignments.map((assignment) => [
                assignment.parameterId,
                parameterRuntimeValues.value[assignment.parameterId] ?? null,
              ]),
            );
      await previewRuntime.controlValueChange(sourceControl.id, value);
    }
    setSaveState(`参数已提交，刷新 ${affected.length} 个组件`);
  } catch (reason) {
    setSaveState(reason instanceof Error ? reason.message : "参数提交失败");
  }
}

function normalizedControlInput(
  parameter: ParameterDefinitionV3,
  event: Event,
): unknown {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (parameter.type === "number")
    return target.value === "" ? undefined : Number(target.value);
  if (parameter.type === "multiSelect" && target instanceof HTMLSelectElement) {
    const options = optionsForParameter(parameter);
    return [...target.selectedOptions].map(
      (option) =>
        options.find((candidate) => String(candidate.value) === option.value)
          ?.value ?? option.value,
    );
  }
  if (target.value === "") return undefined;
  return (
    optionsForParameter(parameter).find(
      (option) => String(option.value) === target.value,
    )?.value ?? target.value
  );
}

function updateControlValue(
  control: ParameterControlV3,
  parameterId: string,
  event: Event,
) {
  const parameter = parameterFor(parameterId);
  if (!parameter) return;
  setControlValue(
    control,
    parameterId,
    normalizedControlInput(parameter, event),
  );
}

function setControlValue(
  control: ParameterControlV3,
  parameterId: string,
  value: unknown,
) {
  if (control.interaction.submitMode === "immediate")
    void commitControlAssignments([{ parameterId, value }], control);
  else
    pendingControlValues.value = {
      ...pendingControlValues.value,
      [parameterId]: value,
    };
}

function updateDateRangeControl(
  control: ParameterControlV3,
  parameterId: string,
  index: number,
  event: Event,
) {
  const current = Array.isArray(controlValue(parameterId))
    ? [...(controlValue(parameterId) as unknown[])]
    : ["", ""];
  current[index] = (event.target as HTMLInputElement).value;
  if (
    control.interaction.submitMode === "immediate" &&
    current.every(Boolean)
  ) {
    void commitControlAssignments([{ parameterId, value: current }], control);
  } else
    pendingControlValues.value = {
      ...pendingControlValues.value,
      [parameterId]: current,
    };
}

function submitControl(control: ParameterControlV3) {
  const assignments = control.parameterIds
    .filter((parameterId) =>
      Object.hasOwn(pendingControlValues.value, parameterId),
    )
    .map((parameterId) => ({
      parameterId,
      value: pendingControlValues.value[parameterId],
    }));
  if (!assignments.length) return;
  const submittedIds = new Set(assignments.map((item) => item.parameterId));
  pendingControlValues.value = Object.fromEntries(
    Object.entries(pendingControlValues.value).filter(
      ([parameterId]) => !submittedIds.has(parameterId),
    ),
  );
  void commitControlAssignments(assignments, control);
}

function clearControl(control: ParameterControlV3) {
  pendingControlValues.value = Object.fromEntries(
    Object.entries(pendingControlValues.value).filter(
      ([parameterId]) => !control.parameterIds.includes(parameterId),
    ),
  );
  void commitControlAssignments(
    control.parameterIds.map((parameterId) => ({
      parameterId,
      value: undefined,
    })),
    control,
  );
}

async function loadServerMetadata() {
  try {
    const response = await fetch("/api/datasets");
    const datasets: CatalogDataset[] = await response.json();
    if (!response.ok) throw new Error("数据集目录加载失败");
    serverDatasets.value = Object.fromEntries(
      datasets.map((dataset) => [dataset.id, dataset]),
    );
    await Promise.all(
      componentsForPageEnterV3(components.value)
        .filter((component) => sourceKindFor(component) === "server")
        .map((component) => loadServerDataset(component)),
    );
  } catch {
    // Mock 数据仍可离线使用；真实数据组件会在刷新时显示具体错误。
  }
}

async function loadActivePageDatasets(signal = new AbortController().signal) {
  await Promise.allSettled(
    componentsForPageEnterV3(components.value)
      .filter((component) => sourceKindFor(component) === "server")
      .map((component) => loadServerDataset(component, false, signal, true)),
  );
  if (signal.aborted)
    throw new DOMException("预览页面加载已取消", "AbortError");
}

function serverRuntimeView(
  component: DashboardComponent,
  dataset: CatalogDataset,
) {
  const fieldIndex = (field: string) =>
    dataset.fields.findIndex((item) => item.name === field);
  const dimensions = component.dataConfig.dimensions
    .map((item) => fieldIndex(item.field))
    .filter((index) => index >= 0);
  const measures = component.dataConfig.measures
    .map((item) => ({
      field: fieldIndex(item.field),
      aggregation: item.aggregation,
    }))
    .filter((item) => item.field >= 0 && item.aggregation !== "none");
  if (!dimensions.length && !measures.length) return undefined;
  const sort = component.dataConfig.sort.flatMap((item) => {
    const dimensionIndex = component.dataConfig.dimensions.findIndex(
      (dimension) => dimension.field === item.field,
    );
    if (dimensionIndex >= 0)
      return [
        { kind: "dimension", index: dimensionIndex, direction: item.direction },
      ];
    const measureIndex = component.dataConfig.measures.findIndex(
      (measure) =>
        measure.field === item.field && measure.aggregation !== "none",
    );
    return measureIndex >= 0
      ? [{ kind: "measure", index: measureIndex, direction: item.direction }]
      : [];
  });
  return { dimensions, measures, sort, limit: component.dataConfig.limit };
}

async function loadServerDataset(
  component: DashboardComponent,
  force = false,
  signal?: AbortSignal,
  propagate = false,
) {
  const componentId = component.id;
  const controller = signal ? undefined : new AbortController();
  if (controller) {
    componentDatasetControllers.get(componentId)?.abort();
    componentDatasetControllers.set(componentId, controller);
    internalDatasetControllers.add(controller);
  }
  const requestSignal = signal ?? controller!.signal;
  let lease: DatasetLease | undefined;
  try {
    if (component.dataConfig.version !== 3)
      component.dataConfig = upgradeComponentDataConfigV3(component.dataConfig);
    const descriptor = componentQueryRuntime.describe(
      component,
      parameterRuntimeValues.value,
    );
    if (!descriptor) throw new Error("组件不支持服务端查询");
    lease = datasetStateGuard.begin(componentId, descriptor.queryKey);
    descriptorDatasetLeases.set(descriptor, lease);
    activeDatasetLeases.set(componentId, { descriptor, lease });
    await componentQueryRuntime.execute(descriptor, force, requestSignal);
    if (
      lease.succeed() &&
      activeDatasetLeases.get(componentId)?.descriptor === descriptor
    )
      activeDatasetLeases.delete(componentId);
  } catch (reason) {
    if (!lease) {
      lease = datasetStateGuard.begin(componentId, "descriptor-error");
    }
    const settled = requestSignal.aborted
      ? lease.cancel()
      : lease.fail(reason instanceof Error ? reason.message : "数据集执行失败");
    if (settled && activeDatasetLeases.get(componentId)?.lease === lease)
      activeDatasetLeases.delete(componentId);
    if (propagate) throw reason;
  } finally {
    if (controller) {
      internalDatasetControllers.delete(controller);
      if (componentDatasetControllers.get(componentId) === controller)
        componentDatasetControllers.delete(componentId);
    }
  }
}

async function loadServerTablePage(
  component: DashboardComponent,
  page: number,
  pageSize: number,
) {
  if (component.dataConfig.version !== 3)
    component.dataConfig = upgradeComponentDataConfigV3(component.dataConfig);
  const descriptor = componentQueryRuntime.describe(
    component,
    parameterRuntimeValues.value,
  );
  if (!descriptor) return;
  const controller = new AbortController();
  componentDatasetControllers.get(component.id)?.abort();
  componentDatasetControllers.set(component.id, controller);
  datasetLoading.value = { ...datasetLoading.value, [component.id]: true };
  datasetErrors.value = { ...datasetErrors.value, [component.id]: "" };
  try {
    const response = await fetch(
      `/api/datasets/${encodeURIComponent(descriptor.datasetId)}/execute`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          parameters: descriptor.parameters,
          view: descriptor.view,
          pagination: {
            offset: (page - 1) * pageSize,
            limit: pageSize,
            includeTotal: true,
          },
        }),
      },
    );
    const payload = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    if (!response.ok)
      throw new Error(
        typeof payload.error === "string"
          ? payload.error
          : `分页请求失败（${response.status}）`,
      );
    if (componentDatasetControllers.get(component.id) !== controller) return;
    runtimeDatasets.value = {
      ...runtimeDatasets.value,
      [component.id]: normalizeQueryResult(descriptor.datasetId, payload),
    };
  } catch (reason) {
    if (controller.signal.aborted) return;
    datasetErrors.value = {
      ...datasetErrors.value,
      [component.id]: reason instanceof Error ? reason.message : "分页请求失败",
    };
  } finally {
    if (componentDatasetControllers.get(component.id) === controller) {
      componentDatasetControllers.delete(component.id);
      datasetLoading.value = { ...datasetLoading.value, [component.id]: false };
    }
  }
}

function refreshSelectedDataset() {
  if (selected.value && sourceKindFor(selected.value) === "server") {
    void loadServerDataset(selected.value, true);
  }
}

function aggregationOptionsFor(
  component: DashboardComponent,
  fieldName: string,
) {
  const type = fieldsFor(component).find(
    (field) => field.name === fieldName,
  )?.type;
  if (type === "number")
    return [
      { value: "sum", label: "SUM" },
      { value: "avg", label: "AVG" },
      { value: "count", label: "COUNT" },
      { value: "countDistinct", label: "COUNT DISTINCT" },
      { value: "min", label: "MIN" },
      { value: "max", label: "MAX" },
      { value: "none", label: "无聚合" },
    ];
  if (type === "date" || type === "datetime")
    return [
      { value: "count", label: "COUNT" },
      { value: "countDistinct", label: "COUNT DISTINCT" },
      { value: "min", label: "MIN" },
      { value: "max", label: "MAX" },
      { value: "none", label: "无聚合" },
    ];
  return [
    { value: "count", label: "COUNT" },
    { value: "countDistinct", label: "COUNT DISTINCT" },
    { value: "none", label: "无聚合" },
  ];
}
function supportsSeriesStyle(type: ComponentType) {
  return ["line", "bar", "area", "combo", "outpatient", "ranking"].includes(
    type,
  );
}
function measureRole(type: ComponentType, index: number) {
  if (type === "scatter")
    return ["X 轴", "Y 轴"][index] || `辅助指标 ${index + 1}`;
  if (type === "bubble")
    return ["X 轴", "Y 轴", "气泡大小"][index] || `辅助指标 ${index + 1}`;
  return "";
}

function measureSortDirection(field: string) {
  return (
    selected.value?.dataConfig.sort.find((item) => item.field === field)
      ?.direction ?? "none"
  );
}

async function setMeasureSort(
  componentId: string,
  field: string,
  event: Event,
) {
  const component = components.value.find((item) => item.id === componentId);
  if (!component) return;
  const direction = (event.target as HTMLSelectElement).value;
  component.dataConfig.sort =
    direction === "asc" || direction === "desc" ? [{ field, direction }] : [];
  markDirty();
  if (sourceKindFor(component) === "server") {
    await loadServerDataset(component, true);
    if (!datasetErrorFor(component)) setSaveState("排序已应用，真实数据已刷新");
  }
}

function setMeasureAlias(index: number, event: Event) {
  if (!selected.value) return;
  const measure = selected.value.dataConfig.measures[index];
  if (!measure) return;
  selected.value.dataConfig.measures[index] = {
    ...measure,
    alias: (event.target as HTMLInputElement).value,
  };
  markDirty();
}

function addDimensionField() {
  if (!selected.value) return;
  const fields = fieldsFor(selected.value);
  const unused = fields.find(
    (field) =>
      !selected.value?.dataConfig.dimensions.some(
        (item) => item.field === field.name,
      ),
  );
  if (!unused) return;
  selected.value.dataConfig.dimensions.push({
    field: unused.name,
    role: selected.value.dataConfig.dimensions.length ? "series" : "category",
  });
  markDirty();
}

function addMeasureField() {
  if (!selected.value) return;
  const fields = fieldsFor(selected.value);
  const unused =
    fields.find(
      (field) =>
        field.type === "number" &&
        !selected.value?.dataConfig.measures.some(
          (item) => item.field === field.name,
        ),
    ) ??
    fields.find(
      (field) =>
        !selected.value?.dataConfig.measures.some(
          (item) => item.field === field.name,
        ),
    );
  if (!unused) return;
  selected.value.dataConfig.measures.push({
    field: unused.name,
    aggregation: "sum",
    axis: selected.value.dataConfig.measures.length ? "right" : "left",
    chartType:
      selected.value.type === "bar"
        ? "bar"
        : selected.value.type === "area"
          ? "area"
          : selected.value.type === "combo"
            ? selected.value.dataConfig.measures.length
              ? "line"
              : "bar"
            : "line",
    labelConfig: {
      show: selected.value.type === "bubble",
      showCategory: false,
      showSeries: false,
      mode: "value",
      decimals: 0,
      position: "top",
      unit: "",
      percentageBase: "category",
    },
  });
  markDirty();
}

function removeDimensionField(index: number) {
  selected.value?.dataConfig.dimensions.splice(index, 1);
  markDirty();
}
function removeMeasureField(index: number) {
  if (!selected.value) return;
  const [removed] = selected.value.dataConfig.measures.splice(index, 1);
  if (removed)
    selected.value.dataConfig.sort = selected.value.dataConfig.sort.filter(
      (item) => item.field !== removed.field,
    );
  markDirty();
}
function moveBinding(items: unknown[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return;
  const [item] = items.splice(index, 1);
  items.splice(target, 0, item);
  markDirty();
}
function addWarningLine() {
  selected.value?.analysisConfig?.warningLines.push({
    id: `warning_${Date.now().toString(36)}`,
    value: 0,
    label: "预警线",
    color: "#e03131",
    axis: "y",
    source: "fixed",
    percentile: 90,
    axisSide: "left",
    lineStyle: "dashed",
  });
  markDirty();
}
function removeWarningLine(index: number) {
  selected.value?.analysisConfig?.warningLines.splice(index, 1);
  markDirty();
}

function dataViewFor(component: DashboardComponent) {
  if (sourceKindFor(component) === "server") {
    return buildComponentDataView(rowsFor(component), {
      ...component.dataConfig,
      measures: component.dataConfig.measures.map((measure) => ({
        ...measure,
        aggregation: "none",
      })),
    });
  }
  return buildComponentDataView(rowsFor(component), component.dataConfig);
}

function categoriesFor(component: DashboardComponent) {
  return dataViewFor(component).categories;
}

function valuesFor(component: DashboardComponent) {
  return dataViewFor(component).series[0]?.values ?? [];
}

function metricValuesFor(component: DashboardComponent, field: string) {
  const seriesValues = dataViewFor(component)
    .series.filter((item) => item.field === field)
    .flatMap((item) => item.values);
  if (seriesValues.length) return seriesValues;
  return rowsFor(component)
    .map((row) => Number(row[field]))
    .filter(Number.isFinite);
}

function metricFor(component: DashboardComponent) {
  const field =
    component.kpiConfig?.primaryMeasureField ||
    component.dataConfig.measures[0]?.field ||
    "";
  const values = field
    ? metricValuesFor(component, field)
    : valuesFor(component);
  if (!values.length) return 0;
  if (component.type === "bed")
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  return values.reduce((sum, value) => sum + value, 0);
}

function kpiConfigFor(component: DashboardComponent) {
  if (!component.kpiConfig) throw new Error(`组件 ${component.id} 不是指标卡`);
  return component.kpiConfig;
}

function formattedMetric(component: DashboardComponent) {
  return formatKpiValue(metricFor(component), kpiConfigFor(component));
}

function metricUnit(component: DashboardComponent) {
  const config = kpiConfigFor(component);
  if (config.unit) return config.unit;
  if (component.dataConfig.measures[0]?.unit)
    return component.dataConfig.measures[0].unit;
  if (sourceKindFor(component) === "server") {
    const field = component.dataConfig.measures[0]?.field.toLowerCase() ?? "";
    if (
      field.includes("rate") ||
      field.includes("ratio") ||
      field.includes("percent")
    )
      return "%";
    if (
      field.startsWith("is_") ||
      field.includes("count") ||
      field.includes("num")
    )
      return "条";
    return "";
  }
  if (component.type === "bed") return "%";
  if (component.dataConfig.measures[0]?.field === "visit_count") return "人次";
  return "万元";
}

function isKpi(type: ComponentType) {
  return ["kpi", "income", "bed"].includes(type);
}
function metricValueByField(component: DashboardComponent, field: string) {
  return metricValuesFor(component, field).reduce(
    (sum, value) => sum + value,
    0,
  );
}
function kpiComparison(component: DashboardComponent, kind: "yoy" | "mom") {
  const config = kpiConfigFor(component);
  const field = kind === "yoy" ? config.yoyField : config.momField;
  return field
    ? comparisonRate(metricFor(component), metricValueByField(component, field))
    : null;
}
function kpiComparisonColor(component: DashboardComponent, rate: number) {
  return comparisonColor(rate, kpiConfigFor(component));
}
function kpiTarget(component: DashboardComponent) {
  const config = kpiConfigFor(component);
  return config.targetMode === "field" && config.targetField
    ? metricValueByField(component, config.targetField)
    : config.targetValue;
}
function kpiProgress(component: DashboardComponent) {
  return targetProgress(metricFor(component), kpiTarget(component));
}

function tableColumnsFor(component: DashboardComponent) {
  const available = dataViewFor(component).columns;
  const configured = component.tableConfig?.columns ?? [];
  const configuredFields = new Set(configured.map((item) => item.field));
  return [
    ...configured.filter((item) =>
      available.some((column) => column.field === item.field),
    ),
    ...available
      .filter((column) => !configuredFields.has(column.field))
      .map((column) => ({
        field: column.field,
        label: column.label,
        width: 120,
        format:
          column.role === "measure" ? ("number" as const) : ("auto" as const),
        summary: "none" as const,
      })),
  ];
}

function activeTabItemId(component: DashboardComponent) {
  const items =
    component.tabsConfig?.items.filter((item) => item.visible !== false) ?? [];
  const requested =
    tabSelections.value[tabSelectionKey(component.id)] ||
    component.tabsConfig?.activeItemId ||
    "";
  return items.some((item) => item.id === requested)
    ? requested
    : (items[0]?.id ?? "");
}

function tabSelectionKey(componentId: string) {
  const snapshot = interactionState.value;
  const activeInstance = snapshot?.stack[snapshot.stack.length - 1];
  return tabSelectionScopeKeyV3({
    componentId,
    designPageId: activePageId.value,
    ...(previewMode.value && snapshot && activeInstance
      ? {
          preview: {
            sessionId: snapshot.sessionId,
            activePageInstanceId: activeInstance.instanceId,
          },
        }
      : {}),
  });
}

function setTabSelection(componentId: string, itemId: string) {
  tabSelections.value = {
    ...tabSelections.value,
    [tabSelectionKey(componentId)]: itemId,
  };
}

function activeTabItem(
  component: DashboardComponent,
): TabItemConfig | undefined {
  return component.tabsConfig?.items.find(
    (item) => item.id === activeTabItemId(component),
  );
}

function handleTabItemClick(
  component: DashboardComponent,
  item: TabItemConfig,
  event: MouseEvent,
) {
  setTabSelection(component.id, item.id);
  if (!previewMode.value) {
    selectedId.value = component.id;
    return;
  }
  if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus();
  previewDialogOpenerId = component.id;
  void previewRuntime.componentClick(component.id, {
    tab_id: item.id,
    tab_label: item.label,
    tab_value: item.value,
  });
}

function addTabItem(component: DashboardComponent) {
  if (!component.tabsConfig) return;
  const sequence = component.tabsConfig.items.length + 1;
  const item = {
    id: `${component.id}-${crypto.randomUUID()}`,
    label: `页签 ${sequence}`,
    value: `tab_${sequence}`,
    componentIds: [],
    visible: true,
    padding: 12,
    gap: 8,
    background: "#ffffff",
  };
  component.tabsConfig.items.push(item);
  component.tabsConfig.activeItemId = item.id;
  setTabSelection(component.id, item.id);
  markDirty();
}

function removeTabItem(component: DashboardComponent, itemId: string) {
  if (!component.tabsConfig || component.tabsConfig.items.length <= 1) return;
  const item = component.tabsConfig.items.find(
    (candidate) => candidate.id === itemId,
  );
  if (
    item?.componentIds.length &&
    !window.confirm(
      `“${item.label}”包含 ${item.componentIds.length} 个组件。删除后这些组件将移回当前画布，是否继续？`,
    )
  )
    return;
  if (item) detachTabItemComponents(component, item);
  component.tabsConfig.items = component.tabsConfig.items.filter(
    (item) => item.id !== itemId,
  );
  if (component.tabsConfig.activeItemId === itemId)
    component.tabsConfig.activeItemId = component.tabsConfig.items[0].id;
  if (tabSelections.value[tabSelectionKey(component.id)] === itemId)
    setTabSelection(component.id, component.tabsConfig.activeItemId);
  markDirty();
}

function ensureTabsConfig(component: DashboardComponent) {
  if (!component.tabsConfig) return;
  component.tabsConfig.titlePosition ??= "top";
  component.tabsConfig.stylePreset ??= "default";
  component.tabsConfig.titleSize ??= 38;
  component.tabsConfig.items.forEach((item) => {
    item.componentIds ??= [];
    item.visible ??= true;
    item.padding ??= 12;
    item.gap ??= 8;
    item.background ||= "#ffffff";
  });
}

function tabOwnerForComponent(
  componentId: string,
): { tab: DashboardComponent; item: TabItemConfig } | undefined {
  return resolveTabOwnerV3(components.value, componentId);
}

function tabChildrenFor(tab: DashboardComponent): DashboardComponent[] {
  const ids = new Set(activeTabItem(tab)?.componentIds ?? []);
  return components.value.filter((component) => ids.has(component.id));
}

function tabMembers(item: TabItemConfig): DashboardComponent[] {
  const ids = new Set(item.componentIds);
  return components.value.filter((component) => ids.has(component.id));
}

function detachTabItemComponents(tab: DashboardComponent, item: TabItemConfig) {
  const componentIds = [...item.componentIds];
  item.componentIds = [];
  const contentOffset = tabContentOffsetV3(tab);
  for (const componentId of componentIds) {
    const child = components.value.find(
      (component) => component.id === componentId,
    );
    if (!child) continue;
    child.position.x += tab.position.x + contentOffset.x;
    child.position.y += tab.position.y + contentOffset.y;
    normalizeComponent(child);
  }
}

function tabContentStyle(component: DashboardComponent) {
  const item = activeTabItem(component);
  return item
    ? {
        padding: `${item.padding}px`,
        gap: `${item.gap}px`,
        background: safeStyleTokenV3(item.background, "#ffffff"),
      }
    : {};
}

function tableValue(value: unknown, format: string) {
  if (format === "percentage") return `${(Number(value) || 0).toFixed(1)}%`;
  if (format === "number")
    return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 2 }).format(
      Number(value) || 0,
    );
  if (format === "date" && value)
    return new Date(String(value)).toLocaleDateString("zh-CN");
  return value ?? "";
}

function tableSummary(
  component: DashboardComponent,
  field: string,
  summary: string,
) {
  if (summary === "none") return "";
  const values = dataViewFor(component)
    .rows.map((row) => row[field])
    .filter((value) => value !== null && value !== undefined && value !== "");
  if (summary === "count") return values.length;
  const numbers = values.map(Number).filter(Number.isFinite);
  if (!numbers.length) return "";
  if (summary === "avg")
    return numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  return numbers.reduce((sum, value) => sum + value, 0);
}

function chartKind(
  type: ComponentType,
): "line" | "bar" | "pie" | "area" | "combo" | "scatter" | "bubble" {
  if (["pie", "area", "combo", "scatter", "bubble"].includes(type))
    return type as "pie" | "area" | "combo" | "scatter" | "bubble";
  if (type === "bar" || type === "ranking") return "bar";
  return "line";
}

function isChart(type: ComponentType) {
  return [
    "line",
    "bar",
    "pie",
    "area",
    "combo",
    "scatter",
    "bubble",
    "outpatient",
    "ranking",
  ].includes(type);
}
function isAxisChart(type: ComponentType) {
  return isChart(type) && type !== "pie";
}
function supportsRightAxis(component: DashboardComponent) {
  return (
    component.type === "combo" ||
    component.type === "scatter" ||
    component.type === "bubble" ||
    component.dataConfig.measures.some((measure) => measure.axis === "right")
  );
}

function isControlledContent(type: ComponentType) {
  return ["text", "image", "icon", "decoration", "map"].includes(type);
}

function componentStyle(component: DashboardComponent) {
  const { x, y, width, height, zIndex } = component.position;
  const tokens = dashboardApplication.value.theme.tokens;
  return {
    left: `${x}px`,
    top: `${y}px`,
    width: `${width}px`,
    height: `${height}px`,
    zIndex,
    background: safeStyleTokenV3(
      component.styleConfig.background,
      safeStyleTokenV3(tokens.panelBackground, "#ffffff"),
    ),
    borderColor: safeStyleTokenV3(
      component.styleConfig.borderColor,
      safeStyleTokenV3(tokens.panelBorder, "#e1e7ec"),
    ),
    borderWidth: `${component.styleConfig.borderWidth ?? 1}px`,
    borderRadius: `${component.styleConfig.borderRadius ?? (Number(tokens.panelRadius) || 7)}px`,
    boxShadow: safeStyleTokenV3(
      component.styleConfig.shadow,
      safeStyleTokenV3(tokens.panelShadow, ""),
    ),
    opacity: component.styleConfig.opacity ?? 1,
    color: safeStyleTokenV3(tokens.textPrimary, "#243447"),
  };
}

function applyThemePreset(preset: "light" | "dark") {
  dashboardApplication.value.theme = {
    id: preset === "dark" ? "medical-dark" : "medical-light",
    tokens: { ...(preset === "dark" ? darkThemeTokensV3 : lightThemeTokensV3) },
  };
  dashboard.value.canvas.background = String(
    dashboardApplication.value.theme.tokens.canvasBackground,
  );
  dashboard.value.titleStyle.color = String(
    dashboardApplication.value.theme.tokens.textPrimary,
  );
  for (const component of components.value) {
    component.styleConfig.background = String(
      dashboardApplication.value.theme.tokens.panelBackground,
    );
    component.styleConfig.titleColor = String(
      dashboardApplication.value.theme.tokens.textPrimary,
    );
    component.styleConfig.borderColor = String(
      dashboardApplication.value.theme.tokens.panelBorder,
    );
    component.styleConfig.borderRadius =
      Number(dashboardApplication.value.theme.tokens.panelRadius) || 7;
    component.styleConfig.shadow = String(
      dashboardApplication.value.theme.tokens.panelShadow || "",
    );
  }
  markDirty();
}

async function importSelectedImage(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  try {
    if (!selected.value?.imageConfig || !file) return;
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        file.type,
      )
    )
      throw new Error("仅支持 PNG/JPEG/WebP/GIF");
    if (file.size > MAX_EMBEDDED_IMAGE_BYTES_V3)
      throw new Error("图片超过 2MB 上限");
    selected.value.imageConfig.source = await new Promise<string>(
      (resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("图片读取失败"));
        reader.readAsDataURL(file);
      },
    );
    selected.value.imageConfig.alt = file.name;
    markDirty();
  } catch (reason) {
    setSaveState(reason instanceof Error ? reason.message : "图片导入失败");
  } finally {
    input.value = "";
  }
}

async function importSelectedGeoJson(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  try {
    if (!selected.value?.mapConfig || !file) return;
    selected.value.mapConfig.geoJson = parseSafeGeoJsonV3(await file.text());
    markDirty();
    setSaveState(
      `已导入 ${selected.value.mapConfig.geoJson.features.length} 个地图区域`,
    );
  } catch (reason) {
    setSaveState(reason instanceof Error ? reason.message : "GeoJSON 导入失败");
  } finally {
    input.value = "";
  }
}

function handleControlledAction(
  component: DashboardComponent,
  payload: Record<string, string | number | boolean | null>,
) {
  if (!previewMode.value) {
    selectedId.value = component.id;
    return;
  }
  previewDialogOpenerId = component.id;
  void previewRuntime.componentClick(component.id, payload);
}

function currentApplicationSnapshot(): DashboardApplicationV3 {
  return saveActivePageDraftV3(
    dashboardApplication.value,
    pageSession.value,
    dashboard.value,
  );
}

function activatePage(application: DashboardApplicationV3, pageId: string) {
  const transition = openPageDesignerSessionV3(application, pageId);
  dashboardApplication.value = transition.application;
  pageSession.value = transition.session;
  dashboard.value = transition.dashboard;
  normalizeCanvas();
  selectedId.value = "";
  datasetCatalogOpen.value = false;
}

function cleanupDesignerRuntimeState() {
  cancelActivePointer();
  previewRuntime.stop();
  interactionState.value = null;
  for (const controller of internalDatasetControllers) controller.abort();
  internalDatasetControllers.clear();
  componentDatasetControllers.clear();
  datasetStateGuard.invalidateAll();
  activeDatasetLeases.clear();
  queryRuntimeCache.clear();
  runtimeDatasets.value = {};
  datasetErrors.value = {};
  datasetLoading.value = {};
  tabSelections.value = {};
  parameterOptionsRuntime?.dispose();
  parameterOptionsRuntime = null;
  parameterDynamicOptions.value = {};
  parameterOptionStates.value = {};
}

function applyDashboardApplication(application: DashboardApplicationV3) {
  cleanupDesignerRuntimeState();
  previewMode.value = false;
  initializeParameterRuntime(application);
  const requestedPageId =
    typeof window === "undefined"
      ? null
      : (() => {
          const url = new URL(window.location.href);
          const requestedDashboardId = url.searchParams.get("dashboardId");
          const matchesDashboard = requestedDashboardId
            ? requestedDashboardId === application.id
            : dashboardWorkspace.value.dashboards.length === 1;
          return matchesDashboard
            ? url.searchParams.get("previewPageId")
            : null;
        })();
  const entryPageId = application.pages.some(
    (page) => page.id === requestedPageId && page.type === "standard",
  )
    ? requestedPageId!
    : application.defaultPageId;
  activatePage(application, entryPageId);
}

function switchDesignerPage(pageId: string) {
  if (!guardEventDraft()) return;
  cancelActivePointer();
  const resumePreview = previewMode.value;
  if (resumePreview) previewRuntime.stop();
  try {
    const transition = switchPageDesignerSessionV3(
      dashboardApplication.value,
      pageSession.value,
      dashboard.value,
      pageId,
    );
    dashboardApplication.value = transition.application;
    pageSession.value = transition.session;
    dashboard.value = transition.dashboard;
    normalizeCanvas();
    selectedId.value = "";
    datasetCatalogOpen.value = false;
    setSaveState("已切换页面，当前草稿待保存");
    if (resumePreview) void previewRuntime.start();
    else void loadActivePageDatasets();
  } catch (reason) {
    setSaveState(reason instanceof Error ? reason.message : "页面切换失败");
  }
}

function exitPreviewForPageStructure() {
  if (!previewMode.value) return;
  previewRuntime.stop();
  previewMode.value = false;
}

function createDesignerPage(options: {
  name: string;
  code: string;
}): string | null {
  if (!guardEventDraft()) return "请先应用或放弃事件草稿";
  exitPreviewForPageStructure();
  try {
    const result = createPageV3(currentApplicationSnapshot(), options);
    activatePage(result.application, result.pageId);
    setSaveState("页面已创建，草稿待保存");
    return null;
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "页面创建失败";
    setSaveState(message);
    return message;
  }
}

function copyDesignerPage(options: {
  name: string;
  code: string;
}): string | null {
  if (!guardEventDraft()) return "请先应用或放弃事件草稿";
  exitPreviewForPageStructure();
  try {
    const result = copyPageV3(
      currentApplicationSnapshot(),
      activePageId.value,
      options,
    );
    activatePage(result.application, result.pageId);
    setSaveState("页面副本已创建，草稿待保存");
    void loadActivePageDatasets();
    return null;
  } catch (reason) {
    const message = reason instanceof Error ? reason.message : "页面复制失败";
    setSaveState(message);
    return message;
  }
}

function deleteDesignerPage(pageId: string) {
  if (!guardEventDraft()) return;
  exitPreviewForPageStructure();
  try {
    const snapshot = currentApplicationSnapshot();
    const deletedIndex = snapshot.pages.findIndex((page) => page.id === pageId);
    const application = deletePageV3(snapshot, pageId);
    const nextPage =
      application.pages[
        Math.min(Math.max(deletedIndex, 0), application.pages.length - 1)
      ];
    activatePage(application, nextPage.id);
    setSaveState("页面已删除，草稿待保存");
    void loadActivePageDatasets();
  } catch (reason) {
    setSaveState(reason instanceof Error ? reason.message : "页面删除失败");
  }
}

function guardEventDraft(): boolean {
  if (!eventPanel.value?.hasDirtyDraft()) return true;
  const choice = window
    .prompt("存在未应用事件草稿。请输入“应用”“放弃”或“取消”。", "取消")
    ?.trim();
  if (choice === "应用") {
    if (!eventPanel.value.applyCurrent()) return false;
  } else if (choice !== "放弃") return false;
  eventPanel.value.discardDraft();
  eventOwner.value = null;
  return true;
}

function openPageEventConfig(pageId: string) {
  if (!guardEventDraft()) return;
  exitPreviewForPageStructure();
  const snapshot = currentApplicationSnapshot();
  const page = snapshot.pages.find((candidate) => candidate.id === pageId);
  if (!page) return;
  dashboardApplication.value = snapshot;
  eventOwner.value = { kind: "page", pageId, pageType: page.type };
}

function openComponentEventConfig() {
  if (!selected.value || !guardEventDraft()) return;
  const snapshot = currentApplicationSnapshot();
  const page = snapshot.pages.find(
    (candidate) => candidate.id === activePageId.value,
  );
  const component = page?.components.find(
    (candidate) => candidate.id === selected.value!.id,
  );
  if (!page || !component) return;
  dashboardApplication.value = snapshot;
  eventOwner.value = {
    kind: "component",
    pageId: page.id,
    pageType: page.type,
    componentId: component.id,
    componentType: component.type,
  };
}

function openControlEventConfig(controlId: string) {
  if (!guardEventDraft()) return;
  const snapshot = currentApplicationSnapshot();
  const page = snapshot.pages.find(
    (candidate) => candidate.id === activePageId.value,
  );
  const control = page?.controls.find(
    (candidate) => candidate.id === controlId,
  );
  if (!page || !control) return;
  dashboardApplication.value = snapshot;
  eventOwner.value = {
    kind: "control",
    pageId: page.id,
    pageType: page.type,
    controlId: control.id,
    controlType: control.type,
  };
}

function commitEventApplication(nextApplication: DashboardApplicationV3) {
  const selectedComponentId = selectedId.value;
  const transition = openPageDesignerSessionV3(
    nextApplication,
    activePageId.value,
  );
  dashboardApplication.value = transition.application;
  pageSession.value = transition.session;
  dashboard.value = transition.dashboard;
  selectedId.value = dashboard.value.components.some(
    (component) => component.id === selectedComponentId,
  )
    ? selectedComponentId
    : "";
}

function inspectEventBinding(binding: EventBindingV3) {
  if (!eventOwner.value)
    return {
      authorable: false,
      readOnly: true,
      reasons: ["事件 owner 不存在"],
    };
  return inspectEventBindingAuthorabilityV3(
    currentApplicationSnapshot(),
    eventOwner.value,
    binding,
  );
}

function eventFieldCapabilities(event: EventBindingV3["event"]) {
  if (!eventOwner.value) return [];
  try {
    return eventFieldCapabilitiesForOwnerV3(
      currentApplicationSnapshot(),
      eventOwner.value,
      event,
    );
  } catch {
    return [];
  }
}

function applyEventBinding(
  binding: EventBindingV3,
  mode: "create" | "update",
): string | null {
  if (!eventOwner.value) return "事件 owner 不存在";
  try {
    const snapshot = currentApplicationSnapshot();
    const nextApplication =
      mode === "create"
        ? createEventBindingV3(snapshot, eventOwner.value, binding)
        : updateEventBindingV3(snapshot, eventOwner.value, binding);
    commitEventApplication(nextApplication);
    setSaveState("事件配置已应用，草稿待保存");
    return null;
  } catch (reason) {
    return reason instanceof Error ? reason.message : "事件配置应用失败";
  }
}

function deleteEventBinding(eventId: string): string | null {
  if (!eventOwner.value) return "事件 owner 不存在";
  try {
    const nextApplication = deleteEventBindingV3(
      currentApplicationSnapshot(),
      eventOwner.value,
      eventId,
    );
    commitEventApplication(nextApplication);
    setSaveState("事件已删除，草稿待保存");
    return null;
  } catch (reason) {
    return reason instanceof Error ? reason.message : "事件删除失败";
  }
}

function moveDesignerPage(payload: { pageId: string; direction: -1 | 1 }) {
  exitPreviewForPageStructure();
  try {
    const snapshot = currentApplicationSnapshot();
    const ids = snapshot.pages.map((page) => page.id);
    const from = ids.indexOf(payload.pageId);
    const to = from + payload.direction;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    const application = reorderPagesV3(snapshot, ids);
    activatePage(application, payload.pageId);
    setSaveState("页面顺序已调整，草稿待保存");
  } catch (reason) {
    setSaveState(reason instanceof Error ? reason.message : "页面排序失败");
  }
}

function setDesignerDefaultPage(pageId: string) {
  exitPreviewForPageStructure();
  try {
    dashboardApplication.value = setDefaultPageV3(
      currentApplicationSnapshot(),
      pageId,
    );
    setSaveState("默认页已更新，草稿待保存");
  } catch (reason) {
    setSaveState(reason instanceof Error ? reason.message : "默认页设置失败");
  }
}

function saveDashboard() {
  const application = currentApplicationSnapshot();
  const workspace = upsertDashboardApplicationInWorkspaceV3(
    dashboardWorkspace.value,
    application,
    true,
  );
  const result = saveDashboardWorkspaceV3(localStorage, workspace);
  if (!result.success) {
    setSaveState(`保存失败：${result.errors[0] ?? "V3 校验未通过"}`);
    return;
  }
  dashboardWorkspace.value = workspace;
  dashboardApplication.value = application;
  setSaveState("V3 草稿已保存到本机");
}

function loadSavedDashboard() {
  const result = loadDashboardWorkspaceV3(localStorage);
  let workspace = result.workspace;
  dashboardWorkspace.value = workspace;
  const activeApplication = activeDashboardApplicationV3(workspace);

  if (
    result.source === "default" &&
    result.persisted &&
    !result.errors.length
  ) {
    const application = applyDesignerDashboardToApplicationV3(
      activeApplication,
      createDefaultDashboard(),
    );
    workspace = upsertDashboardApplicationInWorkspaceV3(
      workspace,
      application,
      true,
    );
    const saveResult = saveDashboardWorkspaceV3(localStorage, workspace);
    dashboardWorkspace.value = workspace;
    applyDashboardApplication(application);
    setSaveState(saveResult.success ? "已建立 V3 草稿" : "V3 草稿初始化失败");
    return;
  }

  applyDashboardApplication(activeApplication);
  if (result.errors.length) {
    setSaveState("草稿恢复失败，已使用安全回退");
  } else if (result.source === "workspace") {
    setSaveState("已恢复多看板工作区");
  } else if (result.source === "v3") {
    setSaveState("已恢复 V3 草稿并升级为多看板工作区");
  } else {
    setSaveState(`${result.source.toUpperCase()} 草稿已迁移到 V3`);
  }
}

function createDesignerDashboard(name: string): string | null {
  if (!guardEventDraft()) return "请先应用或放弃事件草稿";
  try {
    const current = currentApplicationSnapshot();
    let workspace = upsertDashboardApplicationInWorkspaceV3(
      dashboardWorkspace.value,
      current,
      true,
    );
    const suffix = crypto.randomUUID();
    const application = createDefaultDashboardApplicationV3({
      id: `dashboard-${suffix}`,
      name,
      pageId: `page-${suffix}`,
      pageName: "首页",
    });
    workspace = upsertDashboardApplicationInWorkspaceV3(
      workspace,
      application,
      true,
    );
    const result = saveDashboardWorkspaceV3(localStorage, workspace);
    if (!result.success) return result.errors[0] ?? "新建看板失败";
    dashboardWorkspace.value = workspace;
    applyDashboardApplication(application);
    setSaveState(`已新建看板“${name}”`);
    return null;
  } catch (reason) {
    return reason instanceof Error ? reason.message : "新建看板失败";
  }
}

function switchDesignerDashboard(dashboardId: string) {
  if (dashboardId === dashboardWorkspace.value.activeDashboardId) {
    dashboardManagerOpen.value = false;
    return;
  }
  if (!guardEventDraft()) return;
  try {
    const current = currentApplicationSnapshot();
    let workspace = upsertDashboardApplicationInWorkspaceV3(
      dashboardWorkspace.value,
      current,
      true,
    );
    workspace = activateDashboardInWorkspaceV3(workspace, dashboardId);
    const result = saveDashboardWorkspaceV3(localStorage, workspace);
    if (!result.success) throw new Error(result.errors[0] ?? "看板切换失败");
    dashboardWorkspace.value = workspace;
    applyDashboardApplication(activeDashboardApplicationV3(workspace));
    dashboardManagerOpen.value = false;
    setSaveState("已切换看板");
  } catch (reason) {
    setSaveState(reason instanceof Error ? reason.message : "看板切换失败");
  }
}

function deleteDesignerDashboard(dashboardId: string): string | null {
  if (!guardEventDraft()) return "请先应用或放弃事件草稿";
  try {
    const current = currentApplicationSnapshot();
    let workspace = upsertDashboardApplicationInWorkspaceV3(
      dashboardWorkspace.value,
      current,
      true,
    );
    workspace = removeDashboardFromWorkspaceV3(workspace, dashboardId);
    const result = saveDashboardWorkspaceV3(localStorage, workspace);
    if (!result.success) return result.errors[0] ?? "删除看板失败";
    removeDashboardEntityV3(localStorage, dashboardId);
    dashboardWorkspace.value = workspace;
    applyDashboardApplication(activeDashboardApplicationV3(workspace));
    setSaveState("看板已删除");
    return null;
  } catch (reason) {
    return reason instanceof Error ? reason.message : "删除看板失败";
  }
}

function exportDashboard() {
  try {
    const json = exportDashboardApplicationV3(currentApplicationSnapshot());
    const blob = new Blob([json], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${dashboard.value.name || "medical-bi-dashboard"}.v3.json`;
    anchor.click();
    URL.revokeObjectURL(url);
    setSaveState("V3 JSON 已导出");
  } catch {
    setSaveState("V3 JSON 导出失败");
  }
}

function openImport() {
  importInput.value?.click();
}

async function importDashboard(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  if (!guardEventDraft()) {
    input.value = "";
    return;
  }
  try {
    const result = importDashboardApplicationV3(await file.text());
    if (!result.application || !result.report.success) {
      throw new Error(result.report.errors.join("；"));
    }
    const existing = dashboardWorkspace.value.dashboards.find(
      (application) => application.id === result.application!.id,
    );
    if (
      existing &&
      JSON.stringify(existing) !== JSON.stringify(result.application)
    ) {
      throw new Error(
        "导入看板 ID 已存在，请先在 JSON 中更换看板 ID，避免覆盖现有看板",
      );
    }
    applyDashboardApplication(result.application);
    dashboardWorkspace.value = upsertDashboardApplicationInWorkspaceV3(
      dashboardWorkspace.value,
      result.application,
      true,
    );
    setSaveState(
      result.report.sourceVersion === 3
        ? "V3 JSON 已导入"
        : "旧版 JSON 已迁移导入",
    );
  } catch (reason) {
    setSaveState(
      reason instanceof Error ? reason.message : "JSON 格式或模型无效",
    );
  } finally {
    input.value = "";
  }
}

function markDirty() {
  if (previewMode.value) previewRuntime.invalidate();
  setSaveState("有未保存修改");
}

async function togglePreview() {
  if (previewMode.value) {
    previewRuntime.stop();
    previewMode.value = false;
    tabSelections.value = {};
    return;
  }
  previewMode.value = true;
  await nextTick();
  measurePreviewViewport();
  await previewRuntime.start();
}

function measurePreviewViewport() {
  const rect = artboardWrapElement.value?.getBoundingClientRect();
  if (!rect) return;
  previewViewport.value = {
    width: rect.width,
    height: Math.max(1, window.innerHeight - rect.top),
  };
}

function handleComponentClick(componentId: string, event?: MouseEvent) {
  if (previewMode.value) {
    if (event?.currentTarget instanceof HTMLElement)
      event.currentTarget.focus();
    previewDialogOpenerId = componentId;
    const component = components.value.find((item) => item.id === componentId);
    // 地图点位会携带被点击行自行触发事件；阻止外层组件再用首行数据重复触发。
    if (component?.type === "map") return;
    let datum: Record<string, JsonValueV3> = {};
    try {
      datum = safeParameterRuntimeValuesV3(
        component ? (dataViewFor(component).rows[0] ?? {}) : {},
      );
    } catch {
      datum = {};
    }
    const hasDoubleClick =
      (component as DashboardComponentV3 | undefined)?.events?.some(
        (binding) => binding.enabled && binding.event === "doubleClick",
      ) ?? false;
    const run = () => {
      componentClickTimers.delete(componentId);
      void previewRuntime.componentClick(componentId, datum);
    };
    if (hasDoubleClick) {
      const existing = componentClickTimers.get(componentId);
      if (existing !== undefined) window.clearTimeout(existing);
      componentClickTimers.set(componentId, window.setTimeout(run, 230));
    } else run();
  } else selectedId.value = componentId;
}

function handlePreviewPageBack() {
  const snapshot = previewRuntime.pageBack();
  if (!snapshot || snapshot.activePageId === activePageId.value) return;
  const transition = openPageDesignerSessionV3(
    dashboardApplication.value,
    snapshot.activePageId,
  );
  pageSession.value = transition.session;
  dashboard.value = transition.dashboard;
  normalizeCanvas(false);
  selectedId.value = "";
  datasetCatalogOpen.value = false;
  void loadActivePageDatasets();
}

const componentClickTimers = new Map<string, number>();

function handleComponentDoubleClick(componentId: string, event?: MouseEvent) {
  if (!previewMode.value) {
    selectedId.value = componentId;
    return;
  }
  if (event?.currentTarget instanceof HTMLElement) event.currentTarget.focus();
  const existing = componentClickTimers.get(componentId);
  if (existing !== undefined) window.clearTimeout(existing);
  componentClickTimers.delete(componentId);
  const component = components.value.find((item) => item.id === componentId);
  let datum: Record<string, JsonValueV3> = {};
  try {
    datum = safeParameterRuntimeValuesV3(
      component ? (dataViewFor(component).rows[0] ?? {}) : {},
    );
  } catch {
    datum = {};
  }
  void previewRuntime.componentDoubleClick(componentId, datum);
}

function chartDatum(
  component: DashboardComponent,
  payload: ChartEventPayloadV3,
): JsonObjectV3 {
  const view = dataViewFor(component);
  const category =
    component.dataConfig.dimensions.find((item) => item.role === "category") ??
    component.dataConfig.dimensions[0];
  const series = component.dataConfig.dimensions.find(
    (item) => item.role === "series",
  );
  const matched =
    view.rows.find((row) => {
      const categoryMatches =
        !category || String(row[category.field] ?? "") === payload.category;
      const seriesMatches =
        !series ||
        payload.seriesValue === undefined ||
        String(row[series.field] ?? "") === payload.seriesValue;
      return categoryMatches && seriesMatches;
    }) ?? {};
  return safeParameterRuntimeValuesV3({
    ...matched,
    ...(category ? { [category.field]: payload.category } : {}),
    ...(series && payload.seriesValue !== undefined
      ? { [series.field]: payload.seriesValue }
      : {}),
    [payload.measureField]: payload.value,
  });
}

function handleChartAction(
  component: DashboardComponent,
  payload: ChartEventPayloadV3,
  eventName: "click" | "doubleClick",
) {
  if (!previewMode.value) {
    selectedId.value = component.id;
    return;
  }
  let datum: JsonObjectV3 = {};
  try {
    datum = chartDatum(component, payload);
  } catch {
    datum = {};
  }
  if (eventName === "doubleClick")
    void previewRuntime.componentDoubleClick(component.id, datum);
  else void previewRuntime.componentClick(component.id, datum);
}

async function dismissPreviewDialog(reason: "button" | "escape" | "backdrop") {
  const before = interactionState.value?.dialogs.length ?? 0;
  const snapshot = previewRuntime.dismissDialog(reason);
  if (!snapshot || snapshot.dialogs.length >= before) return;
  await nextTick();
  const opener = document.querySelector<HTMLElement>(
    `[data-component-id="${CSS.escape(previewDialogOpenerId)}"]`,
  );
  if (opener?.isConnected) opener.focus();
}

function clearPreviewInteractions() {
  void previewRuntime.clearLinkage();
}

function handleTableRowClick(
  componentId: string,
  row: Record<string, unknown>,
) {
  if (!previewMode.value) return;
  const component = components.value.find((item) => item.id === componentId) as
    | DashboardComponentV3
    | undefined;
  const hasRowClick =
    component?.events?.some(
      (binding) => binding.enabled && binding.event === "rowClick",
    ) ?? false;
  try {
    const payload = safeParameterRuntimeValuesV3(row);
    if (hasRowClick)
      void previewRuntime.componentRowClick(componentId, payload);
    else void previewRuntime.componentClick(componentId, payload);
  } catch {
    if (hasRowClick) void previewRuntime.componentRowClick(componentId, {});
    else void previewRuntime.componentClick(componentId, {});
  }
}

function dialogComponentRows(componentId: string): JsonObjectV3[] {
  const component = dashboardApplication.value.pages
    .flatMap((page) => page.components)
    .find((item) => item.id === componentId);
  if (!component) return [];
  return dataViewFor(component).rows.flatMap((row) => {
    try {
      return [safeParameterRuntimeValuesV3(row)];
    } catch {
      return [];
    }
  });
}

function handleDialogComponentClick(
  pageId: string,
  componentId: string,
  datum: JsonObjectV3,
) {
  void previewRuntime.componentClick(componentId, datum, pageId);
}
function handleDialogComponentRowClick(
  pageId: string,
  componentId: string,
  row: JsonObjectV3,
) {
  void previewRuntime.componentRowClick(componentId, row, pageId);
}

function setSaveState(message: string) {
  saveState.value = message;
  if (stateTimer) window.clearTimeout(stateTimer);
  stateTimer = window.setTimeout(() => {
    if (saveState.value !== "有未保存修改") saveState.value = "当前草稿";
  }, 2600);
}

function startPanelResize(side: "left" | "right", event: PointerEvent) {
  event.preventDefault();
  panelResize = {
    side,
    startX: event.clientX,
    startWidth: side === "left" ? leftPanelWidth.value : rightPanelWidth.value,
  };
  window.addEventListener("pointermove", handlePanelResize);
  window.addEventListener("pointerup", stopPanelResize, { once: true });
}

function handlePanelResize(event: PointerEvent) {
  if (!panelResize) return;
  const delta = event.clientX - panelResize.startX;
  if (panelResize.side === "left")
    leftPanelWidth.value = clamp(panelResize.startWidth + delta, 150, 420);
  else rightPanelWidth.value = clamp(panelResize.startWidth - delta, 260, 620);
}

function stopPanelResize() {
  panelResize = null;
  window.removeEventListener("pointermove", handlePanelResize);
}

function handleKeydown(event: KeyboardEvent) {
  if (
    previewMode.value &&
    event.key === "Escape" &&
    interactionState.value?.dialogs.length
  ) {
    event.preventDefault();
    void dismissPreviewDialog("escape");
    return;
  }
  const target = event.target as HTMLElement;
  if (
    (event.key === "Delete" || event.key === "Backspace") &&
    !target.closest("input, textarea, select")
  )
    deleteSelected();
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    saveDashboard();
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(Number(value) || min, min), Math.max(min, max));
}

onMounted(() => {
  try {
    medicalTemplates.value = normalizeMedicalTemplates(
      JSON.parse(localStorage.getItem(TEMPLATE_STORAGE_KEY) || "[]"),
    );
  } catch {
    medicalTemplates.value = [];
  }
  loadSavedDashboard();
  void loadServerMetadata();
  previewResizeObserver = new ResizeObserver(() => measurePreviewViewport());
  if (artboardWrapElement.value)
    previewResizeObserver.observe(artboardWrapElement.value);
  window.addEventListener("resize", measurePreviewViewport);
  window.addEventListener("keydown", handleKeydown);
});

onBeforeUnmount(() => {
  for (const timer of componentClickTimers.values()) window.clearTimeout(timer);
  componentClickTimers.clear();
  cleanupDesignerRuntimeState();
  previewResizeObserver?.disconnect();
  window.removeEventListener("resize", measurePreviewViewport);
  window.removeEventListener("keydown", handleKeydown);
  stopPanelResize();
  if (stateTimer) window.clearTimeout(stateTimer);
  if (medicalTemplateClickTimer) window.clearTimeout(medicalTemplateClickTimer);
});
</script>

<template>
  <div
    class="designer-shell step4-shell"
    :class="{ 'is-preview': previewMode }"
  >
    <header class="designer-toolbar">
      <div class="brand-block">
        <span class="brand-mark"
          ><IconDeviceDesktopAnalytics :size="20"
        /></span>
        <div>
          <b>医疗 BI Designer</b><small>Step 5.1 · 真实数据集绑定</small>
        </div>
      </div>
      <div class="dashboard-identity">
        <span>当前看板</span
        ><button
          type="button"
          aria-label="打开看板管理"
          @click="dashboardManagerOpen = true"
        >
          {{ dashboard.name }} <IconChevronDown :size="15" /></button
        ><em>{{ saveState }}</em>
      </div>
      <div class="toolbar-actions">
        <input
          ref="importInput"
          class="visually-hidden"
          type="file"
          accept="application/json,.json"
          @change="importDashboard"
        />
        <button type="button" @click="dashboardManagerOpen = true">
          <IconPlus :size="17" />新建看板
        </button>
        <button type="button" @click="openImport">
          <IconFileImport :size="17" />导入
        </button>
        <button type="button" @click="exportDashboard">
          <IconFileExport :size="17" />导出
        </button>
        <button type="button" @click="togglePreview">
          <component :is="previewMode ? IconEyeOff : IconEye" :size="17" />{{
            previewMode ? "退出预览" : "预览"
          }}
        </button>
        <button class="primary-action" type="button" @click="saveDashboard">
          <IconDeviceFloppy :size="17" />保存
        </button>
      </div>
    </header>
    <p
      class="visually-hidden"
      role="status"
      aria-live="polite"
      :data-runtime-state="previewStatus.state"
    >
      {{ previewStatus.message }}
    </p>
    <div
      v-if="previewMode && previewStatus.state !== 'idle'"
      class="runtime-event-status"
      :class="`is-${previewStatus.state}`"
      :role="
        previewStatus.state === 'failed' || previewStatus.state === 'partial'
          ? 'alert'
          : 'status'
      "
    >
      {{ previewStatus.message }}
    </div>

    <main class="designer-workspace" :style="workspaceStyle">
      <aside class="component-panel" aria-label="组件库">
        <i
          class="panel-width-handle panel-width-handle-right"
          aria-label="拖拽调整组件库宽度"
          @pointerdown="startPanelResize('left', $event)"
        ></i>
        <div class="panel-heading">
          <div>
            <small>COMPONENTS</small>
            <h1>组件库</h1>
          </div>
          <span>{{ catalog.length }}</span>
        </div>
        <label class="component-search"
          ><IconSearch :size="17" /><input
            v-model="query"
            type="search"
            placeholder="搜索组件或分类"
            aria-label="搜索组件"
        /></label>
        <div class="component-visibility-controls">
          <button
            type="button"
            :class="{ active: showBasicComponents }"
            @click="showBasicComponents = !showBasicComponents"
          >
            基础 {{ showBasicComponents ? "隐藏" : "展示" }}</button
          ><button
            type="button"
            :class="{ active: showMedicalComponents }"
            @click="showMedicalComponents = !showMedicalComponents"
          >
            医疗 {{ showMedicalComponents ? "隐藏" : "展示" }}
          </button>
        </div>
        <div class="component-groups">
          <section v-for="group in groupedCatalog" :key="group.label">
            <h2>
              <span>{{ group.label }}</span>
            </h2>
            <div class="component-grid">
              <button
                v-for="item in group.items"
                :key="item.type"
                draggable="true"
                type="button"
                :data-component-type="item.type"
                title="单击添加，或拖入画布"
                @dragstart="handleDragStart($event, item.type)"
                @click="addComponent(item.type)"
              >
                <span :class="`tone-${item.tone}`"
                  ><component :is="item.icon" :size="15" /></span
                ><b>{{ item.label }}</b
                ><IconPlus class="add-indicator" :size="11" />
              </button>
            </div>
          </section>
          <template v-if="showMedicalComponents"
            ><section
              v-for="group in medicalTemplateGroups"
              :key="group.category"
              class="medical-template-group"
            >
              <h2>
                <span
                  title="双击重命名分类"
                  @dblclick="renameMedicalCategory(group.category)"
                  >{{ group.category }}</span
                ><em>{{ group.items.length }}</em>
              </h2>
              <div class="medical-template-grid">
                <button
                  v-for="template in group.items"
                  :key="template.id"
                  type="button"
                  class="medical-template-card"
                  :title="`单击复用，双击重命名：${template.name}`"
                  @click="queueMedicalTemplate(template)"
                  @dblclick="renameMedicalTemplate(template)"
                >
                  <span class="tone-blue"
                    ><IconDeviceDesktopAnalytics :size="15" /></span
                  ><b>{{ template.name }}</b
                  ><IconPlus class="add-indicator" :size="11" />
                </button>
              </div></section
          ></template>
          <section class="library-data-section">
            <h2><span>数据管理</span></h2>
            <div class="library-navigation">
              <RouterLink to="/data-sources"
                ><IconDatabase :size="14" />数据源</RouterLink
              ><RouterLink to="/datasets"
                ><IconTable :size="14" />数据集</RouterLink
              ><RouterLink to="/parameters"
                ><IconBraces :size="14" />参数中心</RouterLink
              >
            </div>
            <template v-if="selected && selected.type !== 'tabs'"
              ><button
                class="bind-dataset-button"
                type="button"
                @click="datasetCatalogOpen = true"
              >
                <IconDatabase :size="14" />为当前组件选择数据集
              </button>
              <div class="library-bound-dataset">
                <small>当前绑定</small><b>{{ datasetNameFor(selected) }}</b
                ><span>{{ datasetRowCountFor(selected) }} 行</span>
              </div>
              <button
                v-if="sourceKindFor(selected) === 'server'"
                class="bind-dataset-button secondary"
                type="button"
                :disabled="isDatasetLoading(selected)"
                @click="refreshSelectedDataset"
              >
                {{ isDatasetLoading(selected) ? "读取中…" : "刷新真实数据" }}
              </button></template
            >
            <p v-else-if="selected" class="library-help">
              页签是交互组件，无需绑定数据集。
            </p>
          </section>
          <section class="library-parameter-section">
            <h2><span>参数筛选器</span></h2>
            <p class="library-help">将参数直接添加为当前画布顶部的筛选控件。</p>
            <div
              v-if="dashboardApplication.parameters.length"
              class="parameter-control-catalog"
            >
              <div
                v-for="parameter in dashboardApplication.parameters"
                :key="parameter.id"
              >
                <span
                  ><b>{{ parameter.name }}</b
                  ><small>{{ parameter.code }}</small></span
                ><button
                  type="button"
                  :disabled="parameterHasControl(parameter.id)"
                  @click="addParameterControl(parameter.id)"
                >
                  {{ parameterHasControl(parameter.id) ? "已添加" : "添加" }}
                </button>
              </div>
            </div>
            <RouterLink v-else class="parameter-empty-link" to="/parameters"
              >暂无参数，去参数中心创建</RouterLink
            >
            <div v-if="activePageControls.length" class="active-control-list">
              <b>当前画布控件</b>
              <div
                v-for="control in activePageControls"
                :key="control.id"
                class="active-control-row"
              >
                <span>{{
                  parameterFor(control.parameterIds[0])?.name ?? control.id
                }}</span
                ><button
                  type="button"
                  @click="openControlEventConfig(control.id)"
                >
                  事件</button
                ><button
                  type="button"
                  :title="`移除${parameterFor(control.parameterIds[0])?.name ?? '参数'}控件`"
                  @click="removeParameterControl(control.id)"
                >
                  移除
                </button>
              </div>
            </div>
          </section>
        </div>
        <div class="panel-footnote active-note">
          <i></i>组件库与数据管理可独立滚动
        </div>
      </aside>

      <section class="canvas-stage" aria-label="看板画布">
        <div class="canvas-session-bars">
          <nav
            v-if="previewMode && interactionState"
            class="phase10-runtime-nav"
            aria-label="预览交互导航"
          >
            <button
              type="button"
              :disabled="interactionState.stack.length <= 1"
              @click="handlePreviewPageBack"
            >
              返回
            </button>
            <ol v-if="activeDrillBreadcrumbs.length" aria-label="下钻面包屑">
              <li
                v-for="(item, index) in activeDrillBreadcrumbs"
                :key="`${item.pathId}-${index}`"
              >
                <button
                  type="button"
                  title="返回上一下钻层级"
                  @click="previewRuntime.drillBack(item.pathId)"
                >
                  <span>{{ item.label }}</span
                  ><b>{{ String(item.value) }}</b>
                </button>
              </li>
            </ol>
            <button type="button" @click="clearPreviewInteractions">
              清除联动
            </button>
          </nav>
          <PageManagerPanel
            :pages="pageListItems"
            :active-page-id="activePageId"
            :default-page-id="dashboardApplication.defaultPageId"
            :create-page="createDesignerPage"
            :copy-page="copyDesignerPage"
            @select="switchDesignerPage"
            @delete="deleteDesignerPage"
            @move="moveDesignerPage"
            @set-default="setDesignerDefaultPage"
            @configure-events="openPageEventConfig"
          />
          <div
            v-if="activePageControls.length"
            ref="controlBarElement"
            class="parameter-control-runtime"
            aria-label="运行时筛选条件"
          >
            <section
              v-for="control in activePageControls"
              :key="control.id"
              class="runtime-control-card"
            >
              <p
                v-for="parameterId in control.parameterIds"
                v-show="
                  parameterFor(parameterId)?.source.kind === 'dataset' &&
                  parameterOptionState(parameterId).status !== 'ready'
                "
                :key="`option-state-${parameterId}`"
                class="runtime-option-state"
                :class="`is-${parameterOptionState(parameterId).status}`"
              >
                {{
                  parameterOptionState(parameterId).status === "loading"
                    ? "正在加载动态选项…"
                    : parameterOptionState(parameterId).status === "empty"
                      ? "当前条件下无可用选项"
                      : parameterOptionState(parameterId).status === "error"
                        ? parameterOptionState(parameterId).message
                        : ""
                }}
              </p>
              <template
                v-for="parameterId in control.parameterIds"
                :key="parameterId"
              >
                <label
                  v-if="parameterFor(parameterId)"
                  class="runtime-control-field"
                >
                  <span>{{ parameterFor(parameterId)!.name }}</span>
                  <div
                    v-if="control.type === 'buttonGroup'"
                    class="runtime-button-group"
                  >
                    <button
                      v-for="option in optionsForParameter(
                        parameterFor(parameterId)!,
                      )"
                      :key="String(option.value)"
                      type="button"
                      :class="{
                        active: controlValue(parameterId) === option.value,
                      }"
                      @click="
                        setControlValue(control, parameterId, option.value)
                      "
                    >
                      {{ option.label }}
                    </button>
                  </div>
                  <select
                    v-else-if="control.type === 'singleSelect'"
                    :value="scalarControlValue(parameterId)"
                    @change="updateControlValue(control, parameterId, $event)"
                  >
                    <option value="">请选择</option>
                    <option
                      v-for="option in optionsForParameter(
                        parameterFor(parameterId)!,
                      )"
                      :key="String(option.value)"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                  <select
                    v-else-if="control.type === 'multiSelect'"
                    multiple
                    :value="controlValue(parameterId)"
                    @change="updateControlValue(control, parameterId, $event)"
                  >
                    <option
                      v-for="option in optionsForParameter(
                        parameterFor(parameterId)!,
                      )"
                      :key="String(option.value)"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                  <span
                    v-else-if="control.type === 'dateRange'"
                    class="runtime-date-range"
                    ><input
                      type="date"
                      :value="dateRangeControlValue(parameterId, 0)"
                      @change="
                        updateDateRangeControl(control, parameterId, 0, $event)
                      " /><i>至</i
                    ><input
                      type="date"
                      :value="dateRangeControlValue(parameterId, 1)"
                      @change="
                        updateDateRangeControl(control, parameterId, 1, $event)
                      "
                  /></span>
                  <input
                    v-else
                    :type="
                      control.type === 'date'
                        ? 'date'
                        : parameterFor(parameterId)!.type === 'number'
                          ? 'number'
                          : 'text'
                    "
                    :value="scalarControlValue(parameterId)"
                    @change="updateControlValue(control, parameterId, $event)"
                  />
                </label>
              </template>
              <div class="runtime-control-actions">
                <button
                  v-if="control.interaction.submitMode === 'manual'"
                  type="button"
                  @click="submitControl(control)"
                >
                  应用
                </button>
              </div>
            </section>
          </div>
        </div>
        <div class="canvas-meta">
          <div>
            <IconLayoutDashboard :size="16" />{{ dashboard.name }} <span>/</span
            ><b>{{ previewMode ? "预览模式" : "设计模式" }}</b>
          </div>
          <div class="canvas-meta-actions">
            <button type="button" @click="selectCanvas">
              <IconSettings :size="14" />画布设置</button
            ><button type="button" @click="activeTab = 'advanced'">
              <IconCode :size="14" />看板 JSON
            </button>
          </div>
        </div>
        <div
          ref="artboardWrapElement"
          class="artboard-wrap"
          :style="{
            overflowX:
              previewMode && dashboardApplication.runtimePolicy.previewScaleMode !== 'actual'
                ? 'hidden'
                : 'auto',
            overflowY:
              previewMode && !dashboardApplication.runtimePolicy.allowScroll
                ? 'hidden'
                : 'auto',
          }"
        >
          <div
            class="artboard interactive-artboard"
            :style="artboardStyle"
          >
            <div
              class="artboard-heading"
              :style="{ textAlign: dashboard.titleStyle.align }"
            >
              <div>
                <small>HOSPITAL OPERATIONS</small>
                <h2
                  v-if="dashboard.titleStyle.show"
                  :style="{
                    fontSize: `${dashboard.titleStyle.fontSize}px`,
                    color: dashboard.titleStyle.color,
                    fontWeight: dashboard.titleStyle.fontWeight,
                  }"
                >
                  {{ dashboard.name }}
                </h2>
              </div>
              <span>Mock + PostgreSQL / Greenplum · 保存后可恢复</span>
            </div>
            <div
              ref="canvasElement"
              class="interactive-canvas"
              :class="{ 'grid-hidden': !dashboard.canvas.showGrid }"
              :style="canvasBackground"
              @dragover.prevent
              @drop.prevent="handleDrop"
              @click.self="selectCanvas"
            >
              <article
                v-for="component in rootComponents"
                :key="component.id"
                class="design-component"
                :class="{
                  'is-selected': component.id === selectedId && !previewMode,
                  'is-text-component': component.type === 'text',
                }"
                :data-component-id="component.id"
                :tabindex="previewMode ? 0 : undefined"
                :style="componentStyle(component)"
                @pointerdown="
                  !previewMode && startPointer($event, component, 'move')
                "
                @click.stop="handleComponentClick(component.id, $event)"
                @dblclick.stop="
                  handleComponentDoubleClick(component.id, $event)
                "
              >
                <div
                  v-if="component.id === selectedId && !previewMode"
                  class="selection-label"
                >
                  当前选中
                </div>
                <button
                  v-if="!previewMode && component.styleConfig.titleVisible"
                  class="widget-grip"
                  type="button"
                  aria-label="移动组件"
                  @pointerdown.stop="startPointer($event, component, 'move')"
                >
                  <IconGripVertical :size="16" />
                </button>
                <div
                  v-if="component.styleConfig.titleVisible"
                  class="design-component-header"
                  :class="{ 'preview-title': previewMode }"
                >
                  <span
                    :style="{
                      color: component.styleConfig.titleColor,
                      fontSize: `${component.styleConfig.titleSize}px`,
                      fontWeight: component.styleConfig.titleWeight,
                    }"
                    >{{ component.title }}</span
                  ><IconDots v-if="!previewMode" :size="17" />
                </div>
                <div class="design-component-body">
                  <div v-if="isDatasetLoading(component)" class="runtime-state">
                    <i></i><span>正在读取数据集</span>
                  </div>
                  <div
                    v-else-if="datasetErrorFor(component)"
                    class="runtime-state error"
                  >
                    <IconDatabase :size="18" /><span>{{
                      datasetErrorFor(component)
                    }}</span>
                  </div>
                  <template v-else>
                    <DataChart
                      v-if="isChart(component.type) && component.analysisConfig"
                      :kind="chartKind(component.type)"
                      :categories="categoriesFor(component)"
                      :series="dataViewFor(component).series"
                      :analysis="component.analysisConfig"
                      @action="handleChartAction(component, $event, 'click')"
                      @double-action="
                        handleChartAction(component, $event, 'doubleClick')
                      "
                    />
                    <section
                      v-else-if="
                        component.type === 'tabs' && component.tabsConfig
                      "
                      class="dashboard-tab-layout"
                      :class="[
                        `position-${component.tabsConfig.titlePosition}`,
                        `preset-${component.tabsConfig.stylePreset}`,
                      ]"
                    >
                      <nav
                        class="dashboard-tabs"
                        :class="`align-${component.tabsConfig.alignment}`"
                        :style="{
                          flexBasis: `${component.tabsConfig.titleSize}px`,
                        }"
                        aria-label="页签标题面板"
                      >
                        <button
                          v-for="item in component.tabsConfig.items.filter(
                            (candidate) => candidate.visible !== false,
                          )"
                          :key="item.id"
                          type="button"
                          :class="{
                            active: activeTabItemId(component) === item.id,
                          }"
                          :data-tab-header-id="component.id"
                          :data-tab-header-item-id="item.id"
                          @click.stop="
                            handleTabItemClick(component, item, $event)
                          "
                        >
                          {{ item.label }}
                        </button>
                      </nav>
                      <div
                        class="dashboard-tab-content"
                        :class="{
                          'is-drop-target':
                            tabDropTarget?.tabId === component.id &&
                            tabDropTarget?.itemId ===
                              activeTabItemId(component),
                        }"
                        :data-tab-id="component.id"
                        :data-tab-item-id="activeTabItemId(component)"
                        :style="tabContentStyle(component)"
                        @dragover="handleTabDragOver($event, component)"
                        @dragleave="handleTabDragLeave($event, component)"
                        @drop="handleTabDrop($event, component)"
                      >
                        <article
                          v-for="child in tabChildrenFor(component)"
                          :key="child.id"
                          class="tab-child-component"
                          :class="{
                            'is-selected':
                              child.id === selectedId && !previewMode,
                            'is-text-component': child.type === 'text',
                          }"
                          :data-component-id="child.id"
                          :tabindex="previewMode ? 0 : undefined"
                          :style="componentStyle(child)"
                          @pointerdown.stop="
                            !previewMode && startPointer($event, child, 'move')
                          "
                          @click.stop="handleComponentClick(child.id, $event)"
                          @dblclick.stop="
                            handleComponentDoubleClick(child.id, $event)
                          "
                        >
                          <div
                            v-if="child.id === selectedId && !previewMode"
                            class="selection-label"
                          >
                            页签内容
                          </div>
                          <button
                            v-if="
                              !previewMode && child.styleConfig.titleVisible
                            "
                            class="widget-grip"
                            type="button"
                            aria-label="移动页签内组件"
                            @pointerdown.stop="
                              startPointer($event, child, 'move')
                            "
                          >
                            <IconGripVertical :size="16" />
                          </button>
                          <div
                            v-if="child.styleConfig.titleVisible"
                            class="design-component-header"
                            :class="{ 'preview-title': previewMode }"
                          >
                            <span
                              :style="{
                                color: child.styleConfig.titleColor,
                                fontSize: `${child.styleConfig.titleSize}px`,
                                fontWeight: child.styleConfig.titleWeight,
                              }"
                              >{{ child.title }}</span
                            ><IconDots v-if="!previewMode" :size="17" />
                          </div>
                          <div class="design-component-body">
                            <div
                              v-if="isDatasetLoading(child)"
                              class="runtime-state"
                            >
                              <i></i><span>正在读取数据集</span>
                            </div>
                            <div
                              v-else-if="datasetErrorFor(child)"
                              class="runtime-state error"
                            >
                              <IconDatabase :size="18" /><span>{{
                                datasetErrorFor(child)
                              }}</span>
                            </div>
                            <template v-else
                              ><DataChart
                                v-if="
                                  isChart(child.type) && child.analysisConfig
                                "
                                :kind="chartKind(child.type)"
                                :categories="categoriesFor(child)"
                                :series="dataViewFor(child).series"
                                :analysis="child.analysisConfig"
                                @action="handleChartAction(child, $event, 'click')"
                                @double-action="handleChartAction(child, $event, 'doubleClick')"
                              /><TableRendererV3
                                v-else-if="child.type === 'table'"
                                :component="child"
                                :rows="dataViewFor(child).rows"
                                :columns="tableColumnsFor(child)"
                                :server-total="
                                  runtimeDatasets[child.id]?.pagination?.total
                                "
                                @row-click="
                                  handleTableRowClick(child.id, $event)
                                "
                                @page-change="
                                  loadServerTablePage(
                                    child,
                                    $event,
                                    child.tableConfig?.pagination?.pageSize ??
                                      20,
                                  )
                                "
                              /><ControlledContentRenderer
                                v-else-if="isControlledContent(child.type)"
                                :component="child"
                                :rows="dataViewFor(child).rows"
                                :interactive="previewMode"
                                @action="handleControlledAction(child, $event)"
                              /><template v-else-if="child.kpiConfig"
                                ><strong class="kpi-value"
                                  >{{ formattedMetric(child)
                                  }}<small>{{
                                    metricUnit(child)
                                  }}</small></strong
                                >
                                <p class="kpi-trend">
                                  <IconTrendingUp :size="15" />{{
                                    sourceKindFor(child) === "server"
                                      ? "数据库数据集实时计算"
                                      : "Mock 数据实时计算"
                                  }}
                                </p></template
                              ></template
                            >
                          </div>
                          <button
                            v-if="child.id === selectedId && !previewMode"
                            class="inline-delete"
                            type="button"
                            aria-label="删除页签内组件"
                            @pointerdown.stop
                            @click.stop="deleteSelected"
                          >
                            <IconTrash :size="14" />
                          </button>
                          <i
                            v-for="direction in resizeDirections"
                            v-if="child.id === selectedId && !previewMode"
                            :key="direction"
                            class="resize-handle resize-handle-all"
                            :class="`handle-${direction}`"
                            @pointerdown.stop="
                              startPointer($event, child, 'resize', direction)
                            "
                          ></i>
                        </article>
                        <div
                          v-if="!tabChildrenFor(component).length"
                          class="tab-content-empty"
                        >
                          <b>将组件拖入当前标签页</b
                          ><span>支持从组件库或画布直接拖入</span>
                        </div>
                      </div>
                    </section>
                    <TableRendererV3
                      v-else-if="component.type === 'table'"
                      :component="component"
                      :rows="dataViewFor(component).rows"
                      :columns="tableColumnsFor(component)"
                      :server-total="
                        runtimeDatasets[component.id]?.pagination?.total
                      "
                      @row-click="handleTableRowClick(component.id, $event)"
                      @page-change="
                        loadServerTablePage(
                          component,
                          $event,
                          component.tableConfig?.pagination?.pageSize ?? 20,
                        )
                      "
                    />
                    <ControlledContentRenderer
                      v-else-if="isControlledContent(component.type)"
                      :component="component"
                      :rows="dataViewFor(component).rows"
                      :interactive="previewMode"
                      @action="handleControlledAction(component, $event)"
                    />
                    <template v-else-if="component.kpiConfig"
                      ><strong class="kpi-value"
                        >{{ formattedMetric(component)
                        }}<small>{{ metricUnit(component) }}</small></strong
                      >
                      <div
                        v-if="
                          kpiComparison(component, 'yoy') !== null ||
                          kpiComparison(component, 'mom') !== null
                        "
                        class="kpi-comparisons"
                      >
                        <p
                          v-if="kpiComparison(component, 'yoy') !== null"
                          class="kpi-trend"
                          :style="{
                            color: kpiComparisonColor(
                              component,
                              kpiComparison(component, 'yoy') ?? 0,
                            ),
                          }"
                        >
                          <IconTrendingUp :size="15" />同比
                          {{
                            (kpiComparison(component, "yoy") ?? 0).toFixed(1)
                          }}%
                        </p>
                        <p
                          v-if="kpiComparison(component, 'mom') !== null"
                          class="kpi-trend"
                          :style="{
                            color: kpiComparisonColor(
                              component,
                              kpiComparison(component, 'mom') ?? 0,
                            ),
                          }"
                        >
                          <IconTrendingUp :size="15" />环比
                          {{
                            (kpiComparison(component, "mom") ?? 0).toFixed(1)
                          }}%
                        </p>
                      </div>
                      <p v-else class="kpi-trend">
                        <IconTrendingUp :size="15" />{{
                          sourceKindFor(component) === "server"
                            ? "数据库数据集实时计算"
                            : "Mock 数据实时计算"
                        }}
                      </p>
                      <div
                        v-if="component.kpiConfig.showProgress"
                        class="kpi-progress"
                      >
                        <div>
                          <span>目标达成</span
                          ><b>{{ kpiProgress(component).toFixed(1) }}%</b>
                        </div>
                        <i
                          ><em
                            :style="{
                              width: `${Math.min(100, kpiProgress(component))}%`,
                              background: safeStyleTokenV3(
                                component.kpiConfig.progressColor,
                                '#1477c9',
                              ),
                            }"
                          ></em
                        ></i></div
                    ></template>
                  </template>
                </div>
                <button
                  v-if="component.id === selectedId && !previewMode"
                  class="inline-delete"
                  type="button"
                  aria-label="删除组件"
                  @pointerdown.stop
                  @click.stop="deleteSelected"
                >
                  <IconTrash :size="14" />
                </button>
                <i
                  v-for="direction in resizeDirections"
                  v-if="component.id === selectedId && !previewMode"
                  :key="direction"
                  class="resize-handle resize-handle-all"
                  :class="`handle-${direction}`"
                  :data-resize-direction="direction"
                  :aria-label="`${direction} 方向调整大小`"
                  @pointerdown.stop="
                    startPointer($event, component, 'resize', direction)
                  "
                ></i>
              </article>
              <div v-if="!rootComponents.length" class="canvas-empty">
                <IconPlus :size="28" /><b>画布为空</b
                ><span>从左侧添加组件</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <aside class="property-panel" aria-label="属性配置">
        <i
          class="panel-width-handle panel-width-handle-left"
          aria-label="拖拽调整配置区宽度"
          @pointerdown="startPanelResize('right', $event)"
        ></i>
        <div class="property-header">
          <div>
            <small>INSPECTOR</small>
            <h2>{{ selected ? "组件配置" : "画布配置" }}</h2>
          </div>
          <span
            ><component
              :is="selected ? IconActivityHeartbeat : IconLayoutDashboard"
              :size="15"
            />{{ selected ? selected.type : "canvas" }}</span
          >
        </div>
        <div class="property-tabs" role="tablist">
          <button
            v-for="item in visibleTabs"
            :key="item.id"
            :class="{ active: activeTab === item.id }"
            type="button"
            role="tab"
            :aria-selected="activeTab === item.id"
            @click="activeTab = item.id"
          >
            {{ item.label }}
          </button>
        </div>

        <div v-if="selected" class="property-body">
          <TableConfigPanelV3
            v-if="
              activeTab === 'style' &&
              selected.type === 'table' &&
              selected.tableConfig
            "
            :config="selected.tableConfig"
            :fields="fieldsFor(selected)"
            @dirty="markDirty"
          />
          <section
            v-if="activeTab === 'data'"
            class="property-section dataset-binding-section"
          >
            <h3><span>01</span>维度与指标</h3>
            <div class="field-slot-group">
              <div class="field-slot-heading">
                <b>维度</b
                ><button type="button" @click="addDimensionField">
                  <IconPlus :size="13" />添加
                </button>
              </div>
              <div
                v-for="(dimension, index) in selected.dataConfig.dimensions"
                :key="dimension.field"
                class="field-slot-row"
              >
                <span>{{ index + 1 }}</span
                ><select
                  v-model="dimension.field"
                  title="维度字段"
                  @change="markDirty"
                >
                  <option
                    v-for="field in fieldsFor(selected)"
                    :key="field.name"
                    :value="field.name"
                  >
                    {{ field.label }} · {{ field.type }}
                  </option></select
                ><select
                  v-model="dimension.role"
                  title="维度用途"
                  @change="markDirty"
                >
                  <option value="category">分类</option>
                  <option value="series">系列</option>
                  <option value="detail">明细</option></select
                ><select
                  v-model="dimension.sort"
                  title="排序"
                  @change="markDirty"
                >
                  <option value="none">不排序</option>
                  <option value="asc">升序</option>
                  <option value="desc">降序</option></select
                ><button
                  type="button"
                  title="删除维度"
                  @click="removeDimensionField(index)"
                >
                  ×
                </button>
              </div>
            </div>
            <div class="field-slot-group">
              <div class="field-slot-heading">
                <b>指标</b
                ><button type="button" @click="addMeasureField">
                  <IconPlus :size="13" />添加
                </button>
              </div>
              <div
                v-for="(measure, index) in selected.dataConfig.measures"
                :key="measure.field"
                class="measure-slot-card"
              >
                <b
                  v-if="measureRole(selected.type, index)"
                  class="measure-role"
                  >{{ measureRole(selected.type, index) }}</b
                >
                <div>
                  <span>{{ index + 1 }}</span
                  ><select
                    v-model="measure.field"
                    title="指标字段"
                    @change="markDirty"
                  >
                    <option
                      v-for="field in fieldsFor(selected)"
                      :key="field.name"
                      :value="field.name"
                    >
                      {{ field.label }} · {{ field.type }}
                    </option></select
                  ><button
                    type="button"
                    title="删除指标"
                    @click="removeMeasureField(index)"
                  >
                    ×
                  </button>
                </div>
                <div>
                  <select
                    v-model="measure.aggregation"
                    title="聚合方式"
                    @change="markDirty"
                  >
                    <option
                      v-for="option in aggregationOptionsFor(
                        selected,
                        measure.field,
                      )"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option></select
                  ><select
                    :value="measureSortDirection(measure.field)"
                    title="按聚合结果排序"
                    @input="setMeasureSort(selected.id, measure.field, $event)"
                  >
                    <option value="none">不排序</option>
                    <option value="asc">升序</option>
                    <option value="desc">降序</option></select
                  ><select
                    v-if="supportsSeriesStyle(selected.type)"
                    v-model="measure.chartType"
                    @change="markDirty"
                  >
                    <option value="bar">柱</option>
                    <option value="line">线</option>
                    <option value="area">面积</option></select
                  ><select
                    v-if="supportsSeriesStyle(selected.type)"
                    v-model="measure.axis"
                    @change="markDirty"
                  >
                    <option value="left">左轴</option>
                    <option value="right">右轴</option></select
                  ><input
                    :value="measure.alias ?? ''"
                    placeholder="系列名称"
                    @input="setMeasureAlias(index, $event)"
                  />
                </div>
              </div>
            </div>
            <template
              v-if="
                sourceKindFor(selected) === 'server' &&
                datasetParametersFor(selected).length
              "
            >
              <div class="parameter-binding-heading">
                <h3><span>02</span>参数绑定</h3>
                <button type="button" @click="autoBindSelectedParameters">
                  按编码/别名匹配
                </button>
              </div>
              <p class="parameter-binding-help">
                客户端只保存“数据集参数编码 → 看板参数
                ID”，字段名与运算符由服务端数据集定义决定。
              </p>
              <label class="parameter-refresh-policy"
                >刷新策略<select
                  :value="componentDataConfigV3(selected).refreshPolicy"
                  @change="setSelectedRefreshPolicy"
                >
                  <option value="onParameterChange">参数变化时刷新</option>
                  <option value="onPageEnter">首次进入刷新</option>
                  <option value="manual">仅手工刷新</option>
                </select></label
              >
              <div
                v-for="parameter in datasetParametersFor(selected)"
                :key="parameter.id"
                class="parameter-binding-row"
              >
                <label
                  ><b>{{ parameter.name }}</b
                  ><small
                    >{{ parameter.code }} · {{ parameter.sqlName }} ·
                    {{ parameter.operator }}</small
                  ></label
                >
                <select
                  :value="parameterBindingFor(selected, parameter.code)"
                  @change="setSelectedParameterBinding(parameter.code, $event)"
                >
                  <option value="">
                    {{ parameter.required ? "请选择（必填）" : "不绑定" }}
                  </option>
                  <option
                    v-for="candidate in dashboardApplication.parameters"
                    :key="candidate.id"
                    :value="candidate.id"
                  >
                    {{ candidate.name }} · {{ candidate.code }} ·
                    {{ candidate.type }}
                  </option>
                </select>
              </div>
            </template>
          </section>
          <section
            v-else-if="
              activeTab === 'style' && isControlledContent(selected.type)
            "
            class="property-section controlled-content-config"
          >
            <h3><span>01</span>容器样式</h3>
            <label
              >组件标题<input v-model="selected.title" @input="markDirty"
            /></label>
            <div class="switch-row">
              <span>显示组件标题</span
              ><input
                v-model="selected.styleConfig.titleVisible"
                type="checkbox"
                @change="markDirty"
              />
            </div>
            <div class="color-row">
              <label
                >背景色<input
                  v-model="selected.styleConfig.background"
                  type="color"
                  @input="markDirty" /></label
              ><label
                >边框色<input
                  v-model="selected.styleConfig.borderColor"
                  type="color"
                  @input="markDirty"
              /></label>
            </div>
            <div class="number-pair">
              <label
                >边框宽度<input
                  v-model.number="selected.styleConfig.borderWidth"
                  type="number"
                  min="0"
                  max="12"
                  @change="markDirty" /></label
              ><label
                >圆角<input
                  v-model.number="selected.styleConfig.borderRadius"
                  type="number"
                  min="0"
                  max="80"
                  @change="markDirty"
              /></label>
            </div>
            <div class="number-pair">
              <label
                >透明度<input
                  v-model.number="selected.styleConfig.opacity"
                  type="number"
                  min="0"
                  max="1"
                  step="0.05"
                  @change="normalizeSelected" /></label
              ><label
                >阴影<input
                  v-model="selected.styleConfig.shadow"
                  placeholder="0 8px 24px #00000033"
                  @input="markDirty"
              /></label>
            </div>
            <template v-if="selected.type === 'text' && selected.textConfig"
              ><h3><span>02</span>文本内容</h3>
              <label
                >正文<textarea
                  v-model="selected.textConfig.content"
                  rows="6"
                  @input="markDirty"
                ></textarea>
              </label>
              <div class="color-row">
                <label
                  >文字颜色<input
                    v-model="selected.textConfig.color"
                    type="color"
                    @input="markDirty" /></label
                ><label
                  >字号<input
                    v-model.number="selected.textConfig.fontSize"
                    type="number"
                    min="8"
                    max="120"
                    @change="markDirty"
                /></label>
              </div>
              <div class="number-pair">
                <label
                  >字重<input
                    v-model.number="selected.textConfig.fontWeight"
                    type="number"
                    min="100"
                    max="900"
                    step="100"
                    @change="markDirty" /></label
                ><label
                  >行高<input
                    v-model.number="selected.textConfig.lineHeight"
                    type="number"
                    min="1"
                    max="3"
                    step="0.1"
                    @change="markDirty"
                /></label>
              </div>
              <div class="number-pair">
                <label
                  >对齐<select
                    v-model="selected.textConfig.align"
                    @change="markDirty"
                  >
                    <option value="left">左</option>
                    <option value="center">中</option>
                    <option value="right">右</option>
                  </select></label
                ><label
                  >垂直<select
                    v-model="selected.textConfig.verticalAlign"
                    @change="markDirty"
                  >
                    <option value="top">顶部</option>
                    <option value="center">居中</option>
                    <option value="bottom">底部</option>
                  </select></label
                >
              </div></template
            >
            <template
              v-else-if="selected.type === 'image' && selected.imageConfig"
              ><h3><span>02</span>本地图片</h3>
              <label class="file-control"
                >导入图片<input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  @change="importSelectedImage" /></label
              ><label
                >替代文本<input
                  v-model="selected.imageConfig.alt"
                  @input="markDirty" /></label
              ><label
                >填充方式<select
                  v-model="selected.imageConfig.objectFit"
                  @change="markDirty"
                >
                  <option value="contain">完整显示</option>
                  <option value="cover">裁剪铺满</option>
                  <option value="fill">拉伸铺满</option>
                </select></label
              ></template
            >
            <template
              v-else-if="selected.type === 'icon' && selected.iconConfig"
              ><h3><span>02</span>内置图标</h3>
              <label
                >图标<select
                  v-model="selected.iconConfig.name"
                  @change="markDirty"
                >
                  <option value="hospital">医院</option>
                  <option value="activity">活动趋势</option>
                  <option value="warning">预警</option>
                  <option value="check">完成</option>
                  <option value="location">位置</option>
                  <option value="users">人员</option>
                </select></label
              >
              <div class="color-row">
                <label
                  >颜色<input
                    v-model="selected.iconConfig.color"
                    type="color"
                    @input="markDirty" /></label
                ><label
                  >尺寸<input
                    v-model.number="selected.iconConfig.size"
                    type="number"
                    min="12"
                    max="256"
                    @change="markDirty"
                /></label></div
            ></template>
            <template
              v-else-if="
                selected.type === 'decoration' && selected.decorationConfig
              "
              ><h3><span>02</span>装饰元素</h3>
              <label
                >形状<select
                  v-model="selected.decorationConfig.shape"
                  @change="markDirty"
                >
                  <option value="rectangle">矩形</option>
                  <option value="line">实线</option>
                  <option value="divider">虚线</option>
                </select></label
              >
              <div class="color-row">
                <label
                  >填充色<input
                    v-model="selected.decorationConfig.fill"
                    type="color"
                    @input="markDirty" /></label
                ><label
                  >线条色<input
                    v-model="selected.decorationConfig.borderColor"
                    type="color"
                    @input="markDirty"
                /></label>
              </div>
              <div class="number-pair">
                <label
                  >线宽<input
                    v-model.number="selected.decorationConfig.borderWidth"
                    type="number"
                    min="0"
                    max="20"
                    @change="markDirty" /></label
                ><label
                  >方向<select
                    v-model="selected.decorationConfig.direction"
                    @change="markDirty"
                  >
                    <option value="horizontal">水平</option>
                    <option value="vertical">垂直</option>
                  </select></label
                >
              </div></template
            >
            <template v-else-if="selected.type === 'map' && selected.mapConfig"
              ><h3><span>02</span>离线地图</h3>
              <label class="file-control"
                >导入 GeoJSON<input
                  type="file"
                  accept=".json,.geojson,application/geo+json,application/json"
                  @change="importSelectedGeoJson"
              /></label>
              <p>
                仅接受本地 FeatureCollection，几何类型限 Polygon /
                MultiPolygon，不请求远程瓦片。
              </p>
              <div class="number-pair">
                <label
                  >区域编码属性<input
                    v-model="selected.mapConfig.regionCodeProperty"
                    @input="markDirty" /></label
                ><label
                  >区域名称属性<input
                    v-model="selected.mapConfig.regionNameProperty"
                    @input="markDirty"
                /></label>
              </div>
              <div class="number-pair">
                <label
                  >数据集区域字段<input
                    v-model="selected.mapConfig.regionCodeField"
                    @input="markDirty" /></label
                ><label
                  >着色指标字段<input
                    v-model="selected.mapConfig.valueField"
                    @input="markDirty"
                /></label>
              </div>
              <div class="number-pair">
                <label
                  >经度字段<input
                    v-model="selected.mapConfig.longitudeField"
                    @input="markDirty" /></label
                ><label
                  >纬度字段<input
                    v-model="selected.mapConfig.latitudeField"
                    @input="markDirty"
                /></label>
              </div>
              <div class="color-row">
                <label
                  >低值色<input
                    v-model="selected.mapConfig.lowColor"
                    type="color"
                    @input="markDirty" /></label
                ><label
                  >高值色<input
                    v-model="selected.mapConfig.highColor"
                    type="color"
                    @input="markDirty"
                /></label>
              </div>
              <div class="switch-row">
                <span>显示图例</span
                ><input
                  v-model="selected.mapConfig.showLegend"
                  type="checkbox"
                  @change="markDirty"
                />
              </div>
              <div class="switch-row">
                <span>显示机构点位</span
                ><input
                  v-model="selected.mapConfig.showPoints"
                  type="checkbox"
                  @change="markDirty"
                /></div
            ></template>
          </section>
          <section
            v-else-if="
              activeTab === 'style' &&
              selected.type === 'tabs' &&
              selected.tabsConfig
            "
            class="property-section tab-layout-config"
          >
            <h3><span>01</span>页签块</h3>
            <label
              >组件标题<input v-model="selected.title" @input="markDirty"
            /></label>
            <div class="number-pair">
              <label
                >标题面板位置<select
                  v-model="selected.tabsConfig.titlePosition"
                  @change="normalizeCanvas"
                >
                  <option value="top">顶部</option>
                  <option value="bottom">底部</option>
                  <option value="left">左侧</option>
                  <option value="right">右侧</option>
                </select></label
              ><label
                >标题面板尺寸<input
                  v-model.number="selected.tabsConfig.titleSize"
                  type="number"
                  min="24"
                  max="96"
                  @change="normalizeCanvas"
              /></label>
            </div>
            <div class="number-pair">
              <label
                >标题样式<select
                  v-model="selected.tabsConfig.stylePreset"
                  @change="markDirty"
                >
                  <option value="default">默认</option>
                  <option value="card">卡片</option>
                  <option value="bookmark">书签</option>
                  <option value="menu">菜单</option>
                </select></label
              ><label
                >标题排列<select
                  v-model="selected.tabsConfig.alignment"
                  @change="markDirty"
                >
                  <option value="left">起始对齐</option>
                  <option value="center">居中</option>
                  <option value="stretch">等宽铺满</option>
                </select></label
              >
            </div>
            <label
              >默认页签<select
                v-model="selected.tabsConfig.activeItemId"
                @change="markDirty"
              >
                <option
                  v-for="item in selected.tabsConfig.items"
                  :key="item.id"
                  :value="item.id"
                >
                  {{ item.label }}
                </option>
              </select></label
            >
            <div class="tabs-config-heading">
              <b>内容页</b
              ><button type="button" @click="addTabItem(selected)">
                <IconPlus :size="13" />添加
              </button>
            </div>
            <article
              v-for="item in selected.tabsConfig.items"
              :key="item.id"
              class="tab-item-config"
            >
              <div>
                <input
                  v-model="item.label"
                  placeholder="显示名称"
                  @input="markDirty"
                /><input
                  v-model="item.value"
                  placeholder="传递值"
                  @input="markDirty"
                /><button
                  type="button"
                  :disabled="selected.tabsConfig.items.length <= 1"
                  aria-label="删除页签"
                  @click="removeTabItem(selected, item.id)"
                >
                  ×
                </button>
              </div>
              <div class="switch-row">
                <span>显示此页签</span
                ><input
                  v-model="item.visible"
                  type="checkbox"
                  @change="markDirty"
                />
              </div>
              <div class="number-pair">
                <label
                  >内容边距<input
                    v-model.number="item.padding"
                    type="number"
                    min="0"
                    max="48"
                    @change="normalizeCanvas" /></label
                ><label
                  >组件间距<input
                    v-model.number="item.gap"
                    type="number"
                    min="0"
                    max="48"
                    @change="markDirty"
                /></label>
              </div>
              <label
                >内容背景<input
                  v-model="item.background"
                  type="color"
                  @input="markDirty"
              /></label>
              <fieldset>
                <legend>内容成员（通过拖拽管理）</legend>
                <div
                  v-for="member in tabMembers(item)"
                  :key="member.id"
                  class="tab-component-member"
                >
                  <span>{{ member.title }}</span
                  ><small>{{ member.type }}</small>
                </div>
                <p v-if="!tabMembers(item).length">
                  将组件拖入画布中的此标签页。
                </p>
              </fieldset>
            </article>
          </section>
          <section
            v-else-if="
              activeTab === 'style' &&
              selected.type === 'combo' &&
              selected.analysisConfig
            "
            class="property-section combo-style-config"
          >
            <h3><span>01</span>组合图容器</h3>
            <label
              >组件标题<input v-model="selected.title" @input="markDirty"
            /></label>
            <div class="switch-row">
              <span>显示组件标题</span
              ><input
                v-model="selected.styleConfig.titleVisible"
                type="checkbox"
                @change="markDirty"
              />
            </div>
            <div class="color-row">
              <label
                >标题色<input
                  v-model="selected.styleConfig.titleColor"
                  type="color"
                  @input="markDirty" /></label
              ><label
                >背景色<input
                  v-model="selected.styleConfig.background"
                  type="color"
                  @input="markDirty"
              /></label>
            </div>
            <h3><span>02</span>系列样式</h3>
            <article
              v-for="(measure, index) in selected.dataConfig.measures"
              :key="`combo-${measure.field}`"
              class="combo-series-config"
            >
              <b>系列 {{ index + 1 }} · {{ measure.alias || measure.field }}</b>
              <label
                >系列名称<input
                  :value="measure.alias ?? ''"
                  placeholder="图例与标签名称"
                  @input="setMeasureAlias(index, $event)"
              /></label>
              <div class="number-pair">
                <label
                  >图形<select v-model="measure.chartType" @change="markDirty">
                    <option value="bar">柱形</option>
                    <option value="line">折线</option>
                    <option value="area">面积</option>
                  </select></label
                ><label
                  >坐标轴<select v-model="measure.axis" @change="markDirty">
                    <option value="left">左轴</option>
                    <option value="right">右轴</option>
                  </select></label
                >
              </div>
              <div class="switch-row">
                <span>显示数据标签</span
                ><input
                  v-model="measure.labelConfig!.show"
                  type="checkbox"
                  @change="markDirty"
                />
              </div>
              <div class="number-pair">
                <label
                  >单位<input
                    v-model="measure.labelConfig!.unit"
                    @input="markDirty" /></label
                ><label
                  >小数位<input
                    v-model.number="measure.labelConfig!.decimals"
                    type="number"
                    min="0"
                    max="6"
                    @change="markDirty"
                /></label>
              </div>
            </article>
            <h3><span>03</span>坐标轴与图例</h3>
            <div class="number-pair">
              <label
                >左轴标题<input
                  v-model="selected.analysisConfig.leftAxisTitle"
                  @input="markDirty" /></label
              ><label
                >左轴单位<input
                  v-model="selected.analysisConfig.leftAxisUnit"
                  @input="markDirty"
              /></label>
            </div>
            <div class="number-pair">
              <label
                >右轴标题<input
                  v-model="selected.analysisConfig.rightAxisTitle"
                  @input="markDirty" /></label
              ><label
                >右轴单位<input
                  v-model="selected.analysisConfig.rightAxisUnit"
                  @input="markDirty"
              /></label>
            </div>
            <div class="switch-row">
              <span>显示图例</span
              ><input
                v-model="selected.analysisConfig.legendVisible"
                type="checkbox"
                @change="markDirty"
              />
            </div>
            <label v-if="selected.analysisConfig.legendVisible"
              >图例位置<select
                v-model="selected.analysisConfig.legendPosition"
                @change="markDirty"
              >
                <option value="top">顶部</option>
                <option value="left">左侧</option>
                <option value="right">右侧</option>
                <option value="bottom">下方</option>
              </select></label
            >
          </section>
          <section v-else-if="activeTab === 'style'" class="property-section">
            <h3><span>01</span>标题与容器</h3>
            <label
              >组件标题<input v-model="selected.title" @input="markDirty"
            /></label>
            <div class="switch-row">
              <span>显示组件标题</span
              ><input
                v-model="selected.styleConfig.titleVisible"
                type="checkbox"
                @change="markDirty"
              />
            </div>
            <div class="number-pair">
              <label
                >标题字号<input
                  v-model.number="selected.styleConfig.titleSize"
                  type="number"
                  min="8"
                  max="48"
                  @change="markDirty" /></label
              ><label
                >标题粗细<select
                  v-model.number="selected.styleConfig.titleWeight"
                  @change="markDirty"
                >
                  <option :value="400">常规</option>
                  <option :value="600">半粗</option>
                  <option :value="700">粗体</option>
                </select></label
              >
            </div>
            <div class="color-row">
              <label
                >标题色<input
                  v-model="selected.styleConfig.titleColor"
                  type="color"
                  @input="markDirty" /></label
              ><label
                >背景色<input
                  v-model="selected.styleConfig.background"
                  type="color"
                  @input="markDirty"
              /></label>
            </div>
            <template v-if="isAxisChart(selected.type) && selected.analysisConfig"
              ><h3><span>02</span>坐标轴与标签</h3>
              <div v-if="supportsRightAxis(selected)" class="axis-config-block">
                <b>{{
                  selected.type === "scatter" || selected.type === "bubble"
                    ? "X 轴"
                    : "左 Y 轴"
                }}</b>
                <div class="analysis-grid">
                  <label
                    >轴标题<input
                      v-model="selected.analysisConfig.leftAxisTitle"
                      placeholder="可选"
                      @input="markDirty" /></label
                  ><label
                    >单位<input
                      v-model="selected.analysisConfig.leftAxisUnit"
                      placeholder="万元、人次"
                      @input="markDirty" /></label
                  ><label
                    >坐标轴颜色<input
                      v-model="selected.analysisConfig.leftAxisColor"
                      type="color"
                      @input="markDirty" /></label
                  ><span></span>
                </div>
              </div>
              <div class="axis-config-block">
                <b>{{
                  selected.type === "scatter" || selected.type === "bubble"
                    ? "Y 轴"
                    : "右 Y 轴"
                }}</b>
                <div class="analysis-grid">
                  <label
                    >轴标题<input
                      v-model="selected.analysisConfig.rightAxisTitle"
                      placeholder="可选"
                      @input="markDirty" /></label
                  ><label
                    >单位<input
                      v-model="selected.analysisConfig.rightAxisUnit"
                      placeholder="%、天"
                      @input="markDirty" /></label
                  ><span></span><span></span>
                </div>
              </div>
              <div
                v-if="selected.type === 'scatter' || selected.type === 'bubble'"
                class="analysis-grid"
              >
                <label
                  >X 轴最小<input
                    v-model.number="selected.analysisConfig.xMin"
                    type="number"
                    placeholder="自动"
                    @change="markDirty" /></label
                ><label
                  >X 轴最大<input
                    v-model.number="selected.analysisConfig.xMax"
                    type="number"
                    placeholder="自动"
                    @change="markDirty" /></label
                ><label
                  >Y 轴最小<input
                    v-model.number="selected.analysisConfig.yLeftMin"
                    type="number"
                    placeholder="自动"
                    @change="markDirty" /></label
                ><label
                  >Y 轴最大<input
                    v-model.number="selected.analysisConfig.yLeftMax"
                    type="number"
                    placeholder="自动"
                    @change="markDirty"
                /></label>
              </div>
              <div v-else class="analysis-grid">
                <label
                  >左轴最小<input
                    v-model.number="selected.analysisConfig.yLeftMin"
                    type="number"
                    placeholder="自动"
                    @change="markDirty" /></label
                ><label
                  >左轴最大<input
                    v-model.number="selected.analysisConfig.yLeftMax"
                    type="number"
                    placeholder="自动"
                    @change="markDirty" /></label
                ><label v-if="supportsRightAxis(selected)"
                  >右轴最小<input
                    v-model.number="selected.analysisConfig.yRightMin"
                    type="number"
                    placeholder="自动"
                    @change="markDirty" /></label
                ><label v-if="supportsRightAxis(selected)"
                  >右轴最大<input
                    v-model.number="selected.analysisConfig.yRightMax"
                    type="number"
                    placeholder="自动"
                    @change="markDirty"
                /></label>
              </div>
              <template
                v-if="
                  (selected.type === 'combo' ||
                    selected.dataConfig.measures.length > 1) &&
                  selected.type !== 'bubble' &&
                  selected.type !== 'scatter'
                "
                ><div class="series-style-labels">
                  <div
                    v-for="(measure, index) in selected.dataConfig.measures"
                    :key="`label-${measure.field}`"
                    class="series-style-card"
                  >
                    <b>{{
                      measure.alias || measure.field || `指标 ${index + 1}`
                    }}</b>
                    <div class="switch-row">
                      <span>显示标签</span
                      ><input
                        v-model="measure.labelConfig!.show"
                        type="checkbox"
                        @change="markDirty"
                      />
                    </div>
                    <div class="switch-row">
                      <span>显示分类名</span
                      ><input
                        v-model="measure.labelConfig!.showCategory"
                        type="checkbox"
                        @change="markDirty"
                      />
                    </div>
                    <div class="switch-row">
                      <span>显示系列名</span
                      ><input
                        v-model="measure.labelConfig!.showSeries"
                        type="checkbox"
                        @change="markDirty"
                      />
                    </div>
                    <label
                      >值显示形式<select
                        v-model="measure.labelConfig!.mode"
                        @change="markDirty"
                      >
                        <option value="value">数值</option>
                        <option value="percentage">百分比</option>
                        <option value="both">数值 + 百分比</option>
                      </select></label
                    >
                    <div class="number-pair">
                      <label
                        >单位<input
                          v-model="measure.labelConfig!.unit"
                          @input="markDirty" /></label
                      ><label
                        >小数位<input
                          v-model.number="measure.labelConfig!.decimals"
                          type="number"
                          min="0"
                          max="6"
                          @change="markDirty"
                      /></label>
                    </div>
                  </div></div></template
              ><template v-else
                ><div class="switch-row">
                  <span>显示数据标签</span
                  ><input
                    v-model="selected.analysisConfig.showLabels"
                    type="checkbox"
                    @change="markDirty"
                  />
                </div>
                <div class="switch-row">
                  <span>显示分类名</span
                  ><input
                    v-model="selected.analysisConfig.labelShowCategory"
                    type="checkbox"
                    @change="markDirty"
                  />
                </div>
                <template v-if="selected.type === 'bubble'"
                  ><div class="series-style-labels bubble-labels">
                    <div
                      v-for="(
                        measure, index
                      ) in selected.dataConfig.measures.slice(0, 3)"
                      :key="`bubble-label-${measure.field}`"
                      class="series-style-card"
                    >
                      <b
                        >{{ ["X 轴值", "Y 轴值", "气泡大小"][index] }} ·
                        {{ measure.alias || measure.field }}</b
                      >
                      <div class="switch-row">
                        <span>显示该值</span
                        ><input
                          v-model="measure.labelConfig!.show"
                          type="checkbox"
                          @change="markDirty"
                        />
                      </div>
                      <label
                        >显示形式<select
                          v-model="measure.labelConfig!.mode"
                          @change="markDirty"
                        >
                          <option value="value">数值</option>
                          <option value="percentage">百分比</option>
                          <option value="both">数值 + 百分比</option>
                        </select></label
                      >
                      <div class="number-pair">
                        <label
                          >单位<input
                            v-model="measure.labelConfig!.unit"
                            @input="markDirty" /></label
                        ><label
                          >小数位<input
                            v-model.number="measure.labelConfig!.decimals"
                            type="number"
                            min="0"
                            max="6"
                            @change="markDirty"
                        /></label>
                      </div>
                    </div></div></template
                ><template v-else
                  ><div class="switch-row">
                    <span>显示系列名</span
                    ><input
                      v-model="selected.analysisConfig.labelShowSeries"
                      type="checkbox"
                      @change="markDirty"
                    />
                  </div>
                  <div class="number-pair">
                    <label
                      >小数位<input
                        v-model.number="selected.analysisConfig.labelDecimals"
                        type="number"
                        min="0"
                        max="6"
                        @change="markDirty" /></label
                    ><label
                      >标签位置<select
                        v-model="selected.analysisConfig.labelPosition"
                        @change="markDirty"
                      >
                        <option value="top">顶部</option>
                        <option value="inside">内部</option>
                        <option value="outside">外部</option>
                      </select></label
                    >
                  </div>
                  <label
                    >标签单位<input
                      v-model="selected.analysisConfig.labelUnit"
                      placeholder="留空则使用指标单位"
                      @input="markDirty" /></label
                  ><label
                    >值显示形式<select
                      v-model="selected.analysisConfig.labelMode"
                      @change="markDirty"
                    >
                      <option value="value">数值</option>
                      <option value="percentage">百分比</option>
                      <option value="both">数值 + 百分比</option>
                    </select></label
                  ></template
                ></template
              >
              <div class="legend-config">
                <h3><span>03</span>图例</h3>
                <div class="switch-row">
                  <span>显示图例</span
                  ><input
                    v-model="selected.analysisConfig.legendVisible"
                    type="checkbox"
                    @change="markDirty"
                  />
                </div>
                <label v-if="selected.analysisConfig.legendVisible"
                  >图例位置<select
                    v-model="selected.analysisConfig.legendPosition"
                    @change="markDirty"
                  >
                    <option value="top">顶部</option>
                    <option value="left">左侧</option>
                    <option value="right">右侧</option>
                    <option value="bottom">下方</option>
                  </select></label
                >
              </div>
              <div class="warning-heading">
                <b>预警线</b
                ><button type="button" @click="addWarningLine">
                  <IconPlus :size="13" />添加
                </button>
              </div>
              <div
                v-for="(line, index) in selected.analysisConfig.warningLines"
                :key="line.id"
                class="warning-row dynamic"
              >
                <select
                  v-model="line.axis"
                  title="预警线方向"
                  @change="markDirty"
                >
                  <option value="x">X 轴</option>
                  <option value="y">Y 轴</option></select
                ><select v-model="line.source" @change="markDirty">
                  <option value="fixed">固定值</option>
                  <option value="average">平均值</option>
                  <option value="min">最小值</option>
                  <option value="max">最大值</option>
                  <option value="median">中位数</option>
                  <option value="percentile">百分位</option>
                  <option value="measure">指标平均值</option>
                  <option v-if="line.axis === 'y'" value="target">
                    目标值字段（动态曲线）
                  </option></select
                ><input
                  v-if="line.source === 'fixed'"
                  v-model.number="line.value"
                  type="number"
                  @change="markDirty"
                /><input
                  v-else-if="line.source === 'percentile'"
                  v-model.number="line.percentile"
                  type="number"
                  min="0"
                  max="100"
                  @change="markDirty"
                /><select
                  v-else-if="
                    line.source === 'measure' || line.source === 'target'
                  "
                  v-model="line.measureField"
                  @change="markDirty"
                >
                  <option
                    v-for="measure in selected.dataConfig.measures"
                    :key="measure.field"
                    :value="measure.field"
                  >
                    {{ measure.alias || measure.field }}
                  </option></select
                ><span v-else>自动计算</span
                ><select
                  v-if="line.axis === 'y'"
                  v-model="line.axisSide"
                  title="预警线轴"
                >
                  <option value="left">左轴</option>
                  <option value="right">右轴</option></select
                ><select v-model="line.lineStyle" title="线型">
                  <option value="solid">实线</option>
                  <option value="dashed">虚线</option>
                  <option value="dotted">点线</option></select
                ><input v-model="line.label" @input="markDirty" /><input
                  v-model="line.color"
                  type="color"
                  @input="markDirty"
                /><button type="button" @click="removeWarningLine(index)">
                  ×
                </button>
              </div></template
            ><template v-if="selected.type === 'pie' && selected.analysisConfig">
              <h3><span>02</span>饼图标签与图例</h3>
              <div class="switch-row"><span>显示数据标签</span><input v-model="selected.analysisConfig.showLabels" type="checkbox" @change="markDirty" /></div>
              <div class="switch-row"><span>显示分类名</span><input v-model="selected.analysisConfig.labelShowCategory" type="checkbox" @change="markDirty" /></div>
              <div class="switch-row"><span>显示图例</span><input v-model="selected.analysisConfig.legendVisible" type="checkbox" @change="markDirty" /></div>
              <label v-if="selected.analysisConfig.legendVisible">图例位置<select v-model="selected.analysisConfig.legendPosition" @change="markDirty"><option value="top">顶部</option><option value="left">左侧</option><option value="right">右侧</option><option value="bottom">下方</option></select></label>
            </template>
            <template v-if="isKpi(selected.type) && selected.kpiConfig"
              ><h3><span>02</span>指标卡配置</h3>
              <label
                >主指标字段<select
                  v-model="selected.kpiConfig.primaryMeasureField"
                  @change="markDirty"
                >
                  <option
                    v-for="field in fieldsFor(selected).filter(
                      (item) => item.type === 'number',
                    )"
                    :key="field.name"
                    :value="field.name"
                  >
                    {{ field.label }}
                  </option>
                </select></label
              >
              <div class="number-pair">
                <label
                  >单位<input
                    v-model="selected.kpiConfig.unit"
                    placeholder="万元、人次、%"
                    @input="markDirty" /></label
                ><label
                  >小数位<input
                    v-model.number="selected.kpiConfig.decimals"
                    type="number"
                    min="0"
                    max="6"
                    @change="markDirty"
                /></label>
              </div>
              <div class="switch-row">
                <span>使用千分位</span
                ><input
                  v-model="selected.kpiConfig.useGrouping"
                  type="checkbox"
                  @change="markDirty"
                />
              </div>
              <div class="number-pair">
                <label
                  >同比基准字段<select
                    v-model="selected.kpiConfig.yoyField"
                    @change="markDirty"
                  >
                    <option value="">不显示</option>
                    <option
                      v-for="field in fieldsFor(selected)"
                      :key="field.name"
                      :value="field.name"
                    >
                      {{ field.label }}
                    </option>
                  </select></label
                ><label
                  >环比基准字段<select
                    v-model="selected.kpiConfig.momField"
                    @change="markDirty"
                  >
                    <option value="">不显示</option>
                    <option
                      v-for="field in fieldsFor(selected)"
                      :key="field.name"
                      :value="field.name"
                    >
                      {{ field.label }}
                    </option>
                  </select></label
                >
              </div>
              <div class="color-row">
                <label
                  >上升颜色<input
                    v-model="selected.kpiConfig.positiveColor"
                    type="color"
                    @input="markDirty" /></label
                ><label
                  >下降颜色<input
                    v-model="selected.kpiConfig.negativeColor"
                    type="color"
                    @input="markDirty"
                /></label>
              </div>
              <div class="switch-row">
                <span>显示目标进度条</span
                ><input
                  v-model="selected.kpiConfig.showProgress"
                  type="checkbox"
                  @change="markDirty"
                />
              </div>
              <template v-if="selected.kpiConfig.showProgress"
                ><label
                  >目标来源<select
                    v-model="selected.kpiConfig.targetMode"
                    @change="markDirty"
                  >
                    <option value="fixed">固定目标</option>
                    <option value="field">目标字段</option>
                  </select></label
                ><label v-if="selected.kpiConfig.targetMode === 'fixed'"
                  >目标值<input
                    v-model.number="selected.kpiConfig.targetValue"
                    type="number"
                    @change="markDirty" /></label
                ><label v-else
                  >目标字段<select
                    v-model="selected.kpiConfig.targetField"
                    @change="markDirty"
                  >
                    <option
                      v-for="field in fieldsFor(selected)"
                      :key="field.name"
                      :value="field.name"
                    >
                      {{ field.label }}
                    </option>
                  </select></label
                ><label
                  >进度颜色<input
                    v-model="selected.kpiConfig.progressColor"
                    type="color"
                    @input="markDirty" /></label></template></template
            >
          </section>
          <section v-else-if="activeTab === 'interaction'" class="property-section interaction-summary-panel">
            <h3><span>01</span>组件交互</h3>
            <div class="interaction-summary-head">
              <div><b>{{ selectedEvents.length }}</b><span>条事件规则</span></div>
              <button type="button" aria-label="配置组件事件" @click="openComponentEventConfig">编辑交互规则</button>
            </div>
            <div v-if="selectedEvents.length" class="interaction-rule-list">
              <article v-for="binding in selectedEvents" :key="binding.id" :class="{ disabled: !binding.enabled }">
                <header><b>{{ eventNameLabels[binding.event] ?? binding.event }}</b><span>{{ binding.enabled ? '已启用' : '已停用' }}</span></header>
                <p v-for="action in binding.actions" :key="action.id">{{ interactionActionSummary(action) }}</p>
              </article>
            </div>
            <div v-else class="interaction-empty-state">当前组件尚未配置联动、下钻或页面跳转。</div>
            <p class="interaction-preview-tip">进入预览后可直接点击组件验证参数传递；交互规则不会在设计模式误触发。</p>
          </section>
          <section v-else-if="activeTab === 'layout'" class="property-section">
            <h3><span>01</span>位置与尺寸</h3>
            <div class="layout-fields editable">
              <label
                >X<input
                  v-model.number="selected.position.x"
                  type="number"
                  @change="normalizeSelected" /></label
              ><label
                >Y<input
                  v-model.number="selected.position.y"
                  type="number"
                  @change="normalizeSelected" /></label
              ><label
                >W<input
                  v-model.number="selected.position.width"
                  type="number"
                  :min="componentMinimumSizeV3(selected).width"
                  @change="normalizeSelected" /></label
              ><label
                >H<input
                  v-model.number="selected.position.height"
                  type="number"
                  :min="componentMinimumSizeV3(selected).height"
                  @change="normalizeSelected"
              /></label>
            </div>
            <p>
              当前组件最小尺寸 {{ componentMinimumSizeV3(selected).width }} ×
              {{
                componentMinimumSizeV3(selected).height
              }}；保存、重开与预览使用同一尺寸规则。
            </p>
          </section>
          <section v-else class="property-section json-section">
            <h3><span>01</span>组件复用</h3>
            <div class="medical-template-registration">
              <label class="template-checkbox"
                ><input
                  type="checkbox"
                  :checked="Boolean(selectedMedicalTemplate)"
                  @change="registerSelectedMedical($event)"
                /><span>转为医疗业务组件，可在其他看板复用</span></label
              ><template v-if="selectedMedicalTemplate"
                ><label
                  >组件分类<input
                    :value="selectedMedicalTemplate.category"
                    placeholder="例如：门诊运营、收入分析"
                    @change="
                      updateMedicalCategory(
                        ($event.target as HTMLInputElement).value,
                      )
                    " /></label
                ><button type="button" @click="updateSelectedMedicalTemplate">
                  更新当前配置到组件库
                </button></template
              >
            </div>
            <h3><span>02</span>组件 JSON</h3>
            <pre>{{ selectedJson }}</pre>
            <details>
              <summary>查看完整看板 JSON</summary>
              <pre>{{ dashboardJson }}</pre>
            </details>
          </section>
        </div>

        <div v-else class="property-body">
          <section v-if="activeTab === 'layout'" class="property-section">
            <h3><span>01</span>画布尺寸</h3>
            <div class="layout-fields editable">
              <label
                >W<input
                  v-model.number="dashboard.canvas.width"
                  type="number"
                  min="320"
                  max="1920"
                  @change="normalizeCanvas" /></label
              ><label
                >H<input
                  v-model.number="dashboard.canvas.height"
                  type="number"
                  min="240"
                  max="6000"
                  @change="normalizeCanvas"
              /></label>
            </div>
            <div class="canvas-presets">
              <button
                type="button"
                @click="
                  dashboard.canvas.width = 1200;
                  dashboard.canvas.height = 600;
                  normalizeCanvas();
                "
              >
                1200 × 600</button
              ><button
                type="button"
                @click="
                  dashboard.canvas.width = 1920;
                  dashboard.canvas.height = 3000;
                  normalizeCanvas();
                "
              >
                1920 × 3000
              </button>
            </div>
            <label class="mt-3"
              >网格间距<input
                v-model.number="dashboard.canvas.gridSize"
                type="number"
                min="4"
                max="40"
                @change="normalizeCanvas"
            /></label>
            <div class="switch-row">
              <span>显示网格</span
              ><input
                v-model="dashboard.canvas.showGrid"
                type="checkbox"
                @change="markDirty"
              />
            </div>
            <div class="switch-row">
              <span>预览允许纵向滚动</span
              ><input
                v-model="dashboardApplication.runtimePolicy.allowScroll"
                type="checkbox"
                @change="markDirty"
              />
            </div>
            <p>长画布上限 6000px，设计态与预览态共用纵向坐标。</p>
          </section>
          <section v-else-if="activeTab === 'style'" class="property-section">
            <h3><span>01</span>看板与标题</h3>
            <label
              >看板标题<input v-model="dashboard.name" @input="markDirty"
            /></label>
            <div class="switch-row">
              <span>显示看板标题</span
              ><input
                v-model="dashboard.titleStyle.show"
                type="checkbox"
                @change="markDirty"
              />
            </div>
            <div class="number-pair">
              <label
                >标题字号<input
                  v-model.number="dashboard.titleStyle.fontSize"
                  type="number"
                  min="12"
                  max="72"
                  @change="markDirty" /></label
              ><label
                >标题对齐<select
                  v-model="dashboard.titleStyle.align"
                  @change="markDirty"
                >
                  <option value="left">左对齐</option>
                  <option value="center">居中</option>
                  <option value="right">右对齐</option>
                </select></label
              >
            </div>
            <div class="color-row">
              <label
                >标题颜色<input
                  v-model="dashboard.titleStyle.color"
                  type="color"
                  @input="markDirty" /></label
              ><label
                >画布背景<input
                  v-model="dashboard.canvas.background"
                  type="color"
                  @input="markDirty"
              /></label>
            </div>
            <h3><span>02</span>项目主题</h3>
            <div class="theme-presets">
              <button type="button" @click="applyThemePreset('light')">
                医疗浅色</button
              ><button type="button" @click="applyThemePreset('dark')">
                驾驶舱深色
              </button>
            </div>
            <div class="color-row">
              <label
                >面板背景<input
                  v-model="dashboardApplication.theme.tokens.panelBackground"
                  type="color"
                  @input="markDirty" /></label
              ><label
                >面板边框<input
                  v-model="dashboardApplication.theme.tokens.panelBorder"
                  type="color"
                  @input="markDirty"
              /></label>
            </div>
            <div class="color-row">
              <label
                >主文字<input
                  v-model="dashboardApplication.theme.tokens.textPrimary"
                  type="color"
                  @input="markDirty" /></label
              ><label
                >次文字<input
                  v-model="dashboardApplication.theme.tokens.textSecondary"
                  type="color"
                  @input="markDirty"
              /></label>
            </div>
            <div class="color-row">
              <label
                >正常色<input
                  v-model="dashboardApplication.theme.tokens.statusNormal"
                  type="color"
                  @input="markDirty" /></label
              ><label
                >预警色<input
                  v-model="dashboardApplication.theme.tokens.statusWarning"
                  type="color"
                  @input="markDirty"
              /></label>
            </div>
            <label
              >危险色<input
                v-model="dashboardApplication.theme.tokens.statusDanger"
                type="color"
                @input="markDirty"
            /></label>
          </section>
          <section
            v-else-if="activeTab === 'advanced'"
            class="property-section json-section"
          >
            <DrillPathManagerV3
              :paths="drillPaths"
              :parameters="dashboardApplication.parameters"
              @dirty="markDirty"
            />
            <h3><span>02</span>完整看板 JSON</h3>
            <pre>{{ dashboardJson }}</pre>
          </section>
          <div v-else class="reserved-state">
            <IconLayoutDashboard :size="28" /><b>画布级配置</b
            ><span>请使用“样式”“布局”或“高级”Tab。</span>
          </div>
        </div>

        <footer>
          <span>{{
            selected
              ? selected.id
              : `${dashboard.canvas.width} × ${dashboard.canvas.height}`
          }}</span
          ><button v-if="selected" type="button" @click="deleteSelected">
            <IconTrash :size="14" />删除</button
          ><button
            v-else
            type="button"
            class="save-footer"
            @click="saveDashboard"
          >
            <IconDeviceFloppy :size="14" />保存画布
          </button>
        </footer>
      </aside>
    </main>
    <DatasetCatalog
      v-if="datasetCatalogOpen"
      :current-id="selected?.dataConfig.datasetId"
      @choose="chooseServerDataset"
      @close="datasetCatalogOpen = false"
    />
    <DashboardManagerPanel
      :open="dashboardManagerOpen"
      :active-dashboard-id="dashboardWorkspace.activeDashboardId"
      :dashboards="dashboardListItems"
      :create-dashboard="createDesignerDashboard"
      :delete-dashboard="deleteDesignerDashboard"
      @select="switchDesignerDashboard"
      @close="dashboardManagerOpen = false"
    />
    <EventConfigPanel
      v-if="eventOwner"
      ref="eventPanel"
      :owner="eventOwner"
      :events="eventOwnerEvents"
      :parameters="dashboardApplication.parameters"
      :components="eventOwnerComponents"
      :pages="dashboardApplication.pages"
      :drill-paths="dashboardApplication.drillPaths ?? []"
      :authorable-events="eventOwnerAuthorableEvents"
      :field-capabilities="eventFieldCapabilities"
      :inspect-binding="inspectEventBinding"
      :apply-binding="applyEventBinding"
      :delete-binding="deleteEventBinding"
      @close="eventOwner = null"
    />
    <DialogHostV3
      v-if="previewMode && interactionState?.dialogs.length"
      :dialogs="interactionState.dialogs"
      :pages="dashboardApplication.pages"
      :component-rows="dialogComponentRows"
      @dismiss="dismissPreviewDialog"
      @move="previewRuntime.moveDialog"
      @resize="previewRuntime.resizeDialog"
      @component-click="handleDialogComponentClick"
      @component-row-click="handleDialogComponentRowClick"
    />
  </div>
</template>

<style src="../styles/designer-workspace.css"></style>
<style src="../styles/designer-step3.css"></style>
<style src="../styles/designer-step4.css"></style>
<style src="../styles/designer-step51.css"></style>
<style src="../styles/designer-v2-fields.css"></style>
<style src="../styles/designer-phase8-binding.css"></style>
<style src="../styles/designer-phase8-controls.css"></style>
<style scoped>
.phase10-runtime-nav {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  border-bottom: 1px solid #dbe3ec;
  background: #fff;
}
.phase10-runtime-nav > button {
  padding: 6px 10px;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  background: #fff;
  cursor: pointer;
}
.phase10-runtime-nav > button:disabled {
  opacity: 0.4;
}
.phase10-runtime-nav ol {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}
.phase10-runtime-nav li {
  display: flex;
  gap: 5px;
  padding: 5px 8px;
  border-radius: 999px;
  background: #eff6ff;
  color: #1d4ed8;
  font-size: 11px;
}
.phase10-runtime-nav li + li::before {
  content: "›";
  color: #94a3b8;
}
</style>
