<script setup lang="ts">
import { computed } from "vue";
import type {
  ActionDefinitionV3,
  DashboardComponentV3,
  DashboardPageV3,
  DrillPathV3,
  EventBindingV3,
  EventConditionV3,
  EventNameV3,
  ValueExpressionV3,
} from "../models/dashboard-v3.ts";
import type { ParameterDefinitionV3 } from "../models/parameters.ts";
import {
  createEventDraftV3,
  createRefreshActionDraftV3,
  createSetParameterActionDraftV3,
} from "../services/eventBindingManagerV3.ts";
import type { EventBindingAuthorabilityV3 } from "../services/eventBindingManagerV3.ts";
import type {
  EventFieldCapabilityV3,
  EventOwnerV3,
} from "../services/eventAuthoringPolicyV3.ts";
import { useEventConfigEditorV3 } from "../composables/useEventConfigEditorV3.ts";

const props = defineProps<{
  owner: EventOwnerV3;
  events: EventBindingV3[];
  parameters: ParameterDefinitionV3[];
  components: Array<Pick<DashboardComponentV3, "id" | "title">>;
  pages: Array<Pick<DashboardPageV3, "id" | "name" | "type">>;
  drillPaths: Array<Pick<DrillPathV3, "id" | "name">>;
  authorableEvents: EventNameV3[];
  fieldCapabilities: (event: EventNameV3) => EventFieldCapabilityV3[];
  inspectBinding: (binding: EventBindingV3) => EventBindingAuthorabilityV3;
  applyBinding: (
    binding: EventBindingV3,
    mode: "create" | "update",
  ) => string | null;
  deleteBinding: (eventId: string) => string | null;
}>();
const emit = defineEmits<{ close: [] }>();
const editor = useEventConfigEditorV3();
const { draft, dirty, error, isNew, source } = editor;
const inspection = computed(() =>
  source.value ? props.inspectBinding(source.value) : null,
);
const readOnly = computed(() => Boolean(inspection.value?.readOnly));
const availableEvents = computed(() =>
  props.authorableEvents.filter(
    (name) => !props.events.some((event) => event.event === name),
  ),
);
const fields = computed(() =>
  draft.value ? props.fieldCapabilities(draft.value.event) : [],
);
const phase10ActionTypes: Phase10ActionTypeV3[] = [
  "navigatePage",
  "pageBack",
  "openPageWindow",
  "openDialog",
  "closeDialog",
  "applyLinkage",
  "clearLinkage",
  "drillDown",
  "drillBack",
  "clearDrill",
  "openExternalLink",
];
const conditionOperators: EventConditionV3["operator"][] = [
  "eq",
  "ne",
  "in",
  "notIn",
  "isEmpty",
  "notEmpty",
];
const eventLabels: Record<EventNameV3, string> = {
  click: "单击",
  doubleClick: "双击",
  valueChange: "值变化",
  rowClick: "行单击",
  pageEnter: "页面进入",
};
const actionLabels: Record<ActionDefinitionV3["type"], string> = {
  setParameter: "设置参数",
  refresh: "刷新",
  navigatePage: "页面跳转",
  pageBack: "返回上一页",
  openPageWindow: "新窗口打开页面",
  openDialog: "打开弹窗",
  closeDialog: "关闭弹窗",
  applyLinkage: "应用联动",
  clearLinkage: "清除联动",
  drillDown: "下钻",
  drillBack: "返回上级",
  clearDrill: "清除下钻",
  openExternalLink: "打开外部链接",
};
const operatorLabels: Record<EventConditionV3["operator"], string> = {
  eq: "等于",
  ne: "不等于",
  in: "包含任一",
  notIn: "不包含",
  isEmpty: "为空",
  notEmpty: "不为空",
};

function chooseEvent(eventId: string) {
  editor.load(props.events.find((event) => event.id === eventId) ?? null);
}
function createEvent(event: Event) {
  const name = (event.target as HTMLSelectElement).value as EventNameV3;
  if (name) editor.begin(createEventDraftV3(name));
  (event.target as HTMLSelectElement).value = "";
}
function addCondition() {
  if (!draft.value) return;
  const left: ValueExpressionV3 = fields.value[0]
    ? { kind: "eventField", path: fields.value[0].path }
    : { kind: "fixed", value: null };
  (draft.value.conditions ??= []).push({
    left,
    operator: "eq",
    right: { kind: "fixed", value: null },
  });
  editor.markDirty();
}
function changeOperator(
  condition: EventConditionV3,
  operator: EventConditionV3["operator"],
) {
  condition.operator = operator;
  if (operator === "isEmpty" || operator === "notEmpty") delete condition.right;
  else if (!condition.right)
    condition.right = {
      kind: "fixed",
      value: operator === "in" || operator === "notIn" ? [] : null,
    };
  if (
    (operator === "in" || operator === "notIn") &&
    (condition.right?.kind !== "fixed" || !Array.isArray(condition.right.value))
  )
    condition.right = { kind: "fixed", value: [] };
  editor.markDirty();
}
function replaceExpression(
  condition: EventConditionV3,
  side: "left" | "right",
  kind: ValueExpressionV3["kind"],
) {
  const next: ValueExpressionV3 =
    kind === "parameter"
      ? { kind, parameterId: props.parameters[0]?.id ?? "" }
      : kind === "eventField"
        ? { kind, path: fields.value[0]?.path ?? "" }
        : { kind, value: null };
  condition[side] = next;
  editor.markDirty();
}
function setFixed(expression: ValueExpressionV3, event: Event) {
  if (expression.kind !== "fixed") return;
  try {
    expression.value = JSON.parse((event.target as HTMLTextAreaElement).value);
    error.value = "";
    editor.markDirty();
  } catch {
    error.value = "固定值必须是合法 JSON";
  }
}
function addAction(type: "setParameter" | "refresh") {
  if (!draft.value) return;
  if (type === "setParameter") {
    if (!props.parameters[0]) {
      error.value = "应用中没有可赋值参数";
      return;
    }
    draft.value.actions.push(
      createSetParameterActionDraftV3(props.parameters[0].id),
    );
  } else draft.value.actions.push(createRefreshActionDraftV3(props.owner));
  editor.markDirty();
}
type Phase10ActionTypeV3 = Exclude<
  ActionDefinitionV3["type"],
  "setParameter" | "refresh"
>;
function createPhase10Action(event: Event) {
  if (!draft.value) return;
  const target = event.target as HTMLSelectElement;
  const type = target.value as Phase10ActionTypeV3;
  target.value = "";
  if (!type) return;
  const id = `action-${crypto.randomUUID()}`;
  const standardPage = props.pages.find((page) => page.type === "standard");
  const dialogPage = props.pages.find((page) => page.type === "dialog");
  const parameter = props.parameters[0];
  const component = props.components[0];
  const path = props.drillPaths[0];
  let action: ActionDefinitionV3;
  if (type === "navigatePage")
    action = { id, type, pageId: standardPage?.id ?? "", history: "push" };
  else if (type === "pageBack") action = { id, type };
  else if (type === "openPageWindow")
    action = { id, type, pageId: standardPage?.id ?? "" };
  else if (type === "openDialog")
    action = {
      id,
      type,
      pageId: dialogPage?.id ?? "",
      presentation: {
        width: 720,
        height: 480,
        minWidth: 320,
        minHeight: 240,
        draggable: true,
        resizable: true,
        closeOnEscape: true,
        closeOnBackdrop: true,
      },
    };
  else if (type === "closeDialog") action = { id, type };
  else if (type === "applyLinkage")
    action = {
      id,
      type,
      assignments: parameter
        ? [{ parameterId: parameter.id, value: { kind: "fixed", value: null } }]
        : [],
      targetComponentIds: component ? [component.id] : [],
    };
  else if (type === "clearLinkage") action = { id, type };
  else if (type === "drillDown") action = { id, type, pathId: path?.id ?? "" };
  else if (type === "drillBack") action = { id, type, pathId: path?.id ?? "" };
  else if (type === "clearDrill") action = { id, type, pathId: path?.id ?? "" };
  else action = { id, type, url: "https://example.com/" };
  draft.value.actions.push(action);
  editor.markDirty();
}
function addInteractionAssignment(action: ActionDefinitionV3) {
  if (!("assignments" in action) || !props.parameters[0]) return;
  const assignments = action.assignments ?? (action.assignments = []);
  assignments.push({
    parameterId: props.parameters[0].id,
    value: fields.value[0]
      ? { kind: "eventField", path: fields.value[0].path }
      : { kind: "fixed", value: null },
  });
  editor.markDirty();
}
function replaceAssignmentValue(
  assignment: { value: ValueExpressionV3 },
  kind: ValueExpressionV3["kind"],
) {
  assignment.value =
    kind === "parameter"
      ? { kind, parameterId: props.parameters[0]?.id ?? "" }
      : kind === "eventField"
        ? { kind, path: fields.value[0]?.path ?? "" }
        : { kind, value: null };
  editor.markDirty();
}
function moveAction(index: number, delta: -1 | 1) {
  if (!draft.value) return;
  const target = index + delta;
  if (target < 0 || target >= draft.value.actions.length) return;
  [draft.value.actions[index], draft.value.actions[target]] = [
    draft.value.actions[target],
    draft.value.actions[index],
  ];
  editor.markDirty();
}
function apply() {
  if (draft.value && draft.value.debounceMs === 0)
    delete draft.value.debounceMs;
  return editor.apply((binding) =>
    props.applyBinding(binding, isNew.value ? "create" : "update"),
  );
}
function changeDebounce(event: Event) {
  if (!draft.value) return;
  const raw = (event.target as HTMLInputElement).value.trim();
  if (!raw || Number(raw) === 0) delete draft.value.debounceMs;
  else draft.value.debounceMs = Number(raw);
  editor.markDirty();
}
function removeCurrent() {
  if (!draft.value) return;
  const message = props.deleteBinding(draft.value.id);
  if (message) error.value = message;
  else editor.discard();
}
function requestClose() {
  if (dirty.value && !window.confirm("存在未应用事件草稿，确定放弃并关闭吗？"))
    return;
  editor.discard();
  emit("close");
}
defineExpose({
  hasDirtyDraft: () => dirty.value,
  discardDraft: () => editor.discard(),
  applyCurrent: apply,
});
</script>

<template>
  <div
    class="event-panel-backdrop"
    role="presentation"
    @click.self="requestClose"
  >
    <aside class="event-config-panel" aria-label="事件配置">
      <header>
        <div>
          <small>EVENT AUTHORING</small>
          <h2>受控事件配置</h2>
        </div>
        <button type="button" aria-label="关闭事件配置" @click="requestClose">
          ×
        </button>
      </header>
      <p v-if="!authorableEvents.length" class="readonly-note">
        当前对象的可配置事件类型均已创建
      </p>
      <div class="event-selector">
        <button
          v-for="event in events"
          :key="event.id"
          type="button"
          :class="{ active: draft?.id === event.id }"
          @click="chooseEvent(event.id)"
        >
          {{ eventLabels[event.event]
          }}<i>{{ event.enabled ? "启用" : "停用" }}</i>
        </button>
        <select
          v-if="authorableEvents.length"
          aria-label="新建事件"
          :disabled="!availableEvents.length"
          @change="createEvent"
        >
          <option value="">+ 新建事件</option>
          <option v-for="name in availableEvents" :key="name" :value="name">
            {{ eventLabels[name] }}
          </option>
        </select>
      </div>
      <div v-if="draft" class="event-editor" :class="{ readonly: readOnly }">
        <p v-if="inspection?.reasons.length" class="readonly-note">
          {{ inspection.reasons.join("；") }}
        </p>
        <div class="event-meta">
          <b>{{ eventLabels[draft.event] }}</b
          ><label
            ><input
              v-model="draft.enabled"
              type="checkbox"
              :disabled="readOnly"
              @change="editor.markDirty"
            />启用</label
          ><label
            >防抖 ms<input
              :value="draft.debounceMs ?? ''"
              type="number"
              min="0"
              step="1"
              :disabled="readOnly"
              placeholder="留空或 0 表示省略"
              @change="changeDebounce"
          /></label>
        </div>

        <section>
          <div class="section-title">
            <b>条件（全部 AND）</b
            ><button type="button" :disabled="readOnly" @click="addCondition">
              添加条件
            </button>
          </div>
          <div
            v-for="(condition, index) in draft.conditions ?? []"
            :key="index"
            class="condition-row"
          >
            <select
              :value="condition.left.kind"
              :disabled="readOnly"
              aria-label="左值类型"
              @change="
                replaceExpression(
                  condition,
                  'left',
                  ($event.target as HTMLSelectElement)
                    .value as ValueExpressionV3['kind'],
                )
              "
            >
              <option v-if="fields.length" value="eventField">事件字段</option>
              <option value="parameter">参数</option>
              <option value="fixed">固定值</option>
            </select>
            <select
              v-if="condition.left.kind === 'eventField'"
              v-model="condition.left.path"
              :disabled="readOnly"
              aria-label="左侧事件字段"
              @change="editor.markDirty"
            >
              <option
                v-for="field in fields"
                :key="field.path"
                :value="field.path"
              >
                {{ field.label }}
              </option>
            </select>
            <select
              v-else-if="condition.left.kind === 'parameter'"
              v-model="condition.left.parameterId"
              :disabled="readOnly"
              aria-label="左侧参数"
              @change="editor.markDirty"
            >
              <option
                v-for="parameter in parameters"
                :key="parameter.id"
                :value="parameter.id"
              >
                {{ parameter.name }}
              </option>
            </select>
            <textarea
              v-else
              :value="JSON.stringify(condition.left.value)"
              :disabled="readOnly"
              aria-label="左侧固定值"
              @change="setFixed(condition.left, $event)"
            ></textarea>
            <select
              :value="condition.operator"
              :disabled="readOnly"
              aria-label="条件运算符"
              @change="
                changeOperator(
                  condition,
                  ($event.target as HTMLSelectElement)
                    .value as EventConditionV3['operator'],
                )
              "
            >
              <option
                v-for="operator in conditionOperators"
                :key="operator"
                :value="operator"
              >
                {{ operatorLabels[operator] }}
              </option>
            </select>
            <template v-if="condition.right">
              <select
                :value="condition.right.kind"
                :disabled="
                  readOnly ||
                  condition.operator === 'in' ||
                  condition.operator === 'notIn'
                "
                aria-label="右值类型"
                @change="
                  replaceExpression(
                    condition,
                    'right',
                    ($event.target as HTMLSelectElement)
                      .value as ValueExpressionV3['kind'],
                  )
                "
              >
                <option value="fixed">固定值</option>
                <option value="parameter">参数</option>
                <option v-if="fields.length" value="eventField">
                  事件字段
                </option>
              </select>
              <textarea
                v-if="condition.right.kind === 'fixed'"
                :value="JSON.stringify(condition.right.value)"
                :disabled="readOnly"
                aria-label="右侧固定值"
                @change="setFixed(condition.right, $event)"
              ></textarea>
              <select
                v-else-if="condition.right.kind === 'parameter'"
                v-model="condition.right.parameterId"
                :disabled="readOnly"
                aria-label="右侧参数"
                @change="editor.markDirty"
              >
                <option
                  v-for="parameter in parameters"
                  :key="parameter.id"
                  :value="parameter.id"
                >
                  {{ parameter.name }}
                </option>
              </select>
              <select
                v-else
                v-model="condition.right.path"
                :disabled="readOnly"
                aria-label="右侧事件字段"
                @change="editor.markDirty"
              >
                <option
                  v-for="field in fields"
                  :key="field.path"
                  :value="field.path"
                >
                  {{ field.label }}
                </option>
              </select>
            </template>
            <button
              type="button"
              :disabled="readOnly"
              aria-label="删除条件"
              @click="
                draft.conditions!.splice(index, 1);
                editor.markDirty();
              "
            >
              ×
            </button>
          </div>
        </section>

        <section>
          <div class="section-title">
            <b>动作（按顺序）</b
            ><span
              ><button
                type="button"
                :disabled="readOnly"
                @click="addAction('setParameter')"
              >
                + 设置参数</button
              ><button
                type="button"
                :disabled="readOnly"
                @click="addAction('refresh')"
              >
                + 刷新</button
              ><select
                aria-label="新增交互动作"
                :disabled="readOnly"
                @change="createPhase10Action"
              >
                <option value="">+ 交互动作</option>
                <option
                  v-for="type in phase10ActionTypes"
                  :key="type"
                  :value="type"
                >
                  {{ actionLabels[type] }}
                </option>
              </select></span
            >
          </div>
          <article
            v-for="(action, index) in draft.actions"
            :key="action.id"
            class="action-card"
          >
            <header>
              <b>{{ index + 1 }} · {{ actionLabels[action.type] }}</b
              ><span
                ><button
                  type="button"
                  :disabled="readOnly || index === 0"
                  aria-label="动作上移"
                  @click="moveAction(index, -1)"
                >
                  ↑</button
                ><button
                  type="button"
                  :disabled="readOnly || index === draft.actions.length - 1"
                  aria-label="动作下移"
                  @click="moveAction(index, 1)"
                >
                  ↓</button
                ><button
                  type="button"
                  :disabled="readOnly"
                  aria-label="删除动作"
                  @click="
                    draft.actions.splice(index, 1);
                    editor.markDirty();
                  "
                >
                  ×
                </button></span
              >
            </header>
            <template v-if="action.type === 'setParameter'"
              ><div
                v-for="assignment in action.assignments"
                :key="assignment.parameterId"
                class="assignment"
              >
                <select
                  v-model="assignment.parameterId"
                  :disabled="readOnly"
                  aria-label="赋值参数"
                  @change="editor.markDirty"
                >
                  <option
                    v-for="parameter in parameters"
                    :key="parameter.id"
                    :value="parameter.id"
                  >
                    {{ parameter.name }}
                  </option></select
                ><select
                  :value="assignment.value.kind"
                  :disabled="readOnly"
                  aria-label="赋值来源"
                  @change="
                    assignment.value =
                      ($event.target as HTMLSelectElement).value === 'parameter'
                        ? {
                            kind: 'parameter',
                            parameterId: parameters[0]?.id ?? '',
                          }
                        : ($event.target as HTMLSelectElement).value ===
                            'eventField'
                          ? { kind: 'eventField', path: fields[0]?.path ?? '' }
                          : { kind: 'fixed', value: null };
                    editor.markDirty();
                  "
                >
                  <option value="fixed">固定值</option>
                  <option value="parameter">参数</option>
                  <option v-if="fields.length" value="eventField">
                    事件字段
                  </option></select
                ><textarea
                  v-if="assignment.value.kind === 'fixed'"
                  :value="JSON.stringify(assignment.value.value)"
                  :disabled="readOnly"
                  aria-label="赋值固定值"
                  @change="setFixed(assignment.value, $event)"
                ></textarea
                ><select
                  v-else-if="assignment.value.kind === 'parameter'"
                  v-model="assignment.value.parameterId"
                  :disabled="readOnly"
                  aria-label="赋值来源参数"
                  @change="editor.markDirty"
                >
                  <option
                    v-for="parameter in parameters"
                    :key="parameter.id"
                    :value="parameter.id"
                  >
                    {{ parameter.name }}
                  </option></select
                ><select
                  v-else
                  v-model="assignment.value.path"
                  :disabled="readOnly"
                  aria-label="赋值事件字段"
                  @change="editor.markDirty"
                >
                  <option
                    v-for="field in fields"
                    :key="field.path"
                    :value="field.path"
                  >
                    {{ field.label }}
                  </option>
                </select>
              </div></template
            >
            <template v-else-if="action.type === 'refresh'"
              ><select
                v-model="action.target.kind"
                :disabled="readOnly"
                aria-label="刷新目标类型"
                @change="
                  action.target =
                    action.target.kind === 'page'
                      ? { kind: 'page', pageId: owner.pageId }
                      : {
                          kind: 'components',
                          componentIds: components[0] ? [components[0].id] : [],
                        };
                  editor.markDirty();
                "
              >
                <option value="page">当前页面</option>
                <option value="components">页内组件</option></select
              ><select
                v-if="action.target.kind === 'components'"
                v-model="action.target.componentIds"
                multiple
                :disabled="readOnly"
                aria-label="刷新组件"
                @change="editor.markDirty"
              >
                <option
                  v-for="component in components"
                  :key="component.id"
                  :value="component.id"
                >
                  {{ component.title }}
                </option>
              </select></template
            >
            <template v-else-if="action.type === 'navigatePage'"
              ><div class="action-form">
                <label
                  >目标页面<select
                    v-model="action.pageId"
                    :disabled="readOnly"
                    @change="editor.markDirty"
                  >
                    <option
                      v-for="page in pages.filter(
                        (item) => item.type === 'standard',
                      )"
                      :key="page.id"
                      :value="page.id"
                    >
                      {{ page.name }}
                    </option>
                  </select></label
                ><label
                  >历史记录<select
                    v-model="action.history"
                    :disabled="readOnly"
                    @change="editor.markDirty"
                  >
                    <option value="push">可返回</option>
                    <option value="replace">替换当前页</option>
                  </select></label
                ><button
                  type="button"
                  :disabled="readOnly || !parameters.length"
                  @click="addInteractionAssignment(action)"
                >
                  添加携带参数
                </button>
              </div>
              <div
                v-for="(assignment, assignmentIndex) in action.assignments ??
                []"
                :key="assignmentIndex"
                class="assignment"
              >
                <select
                  v-model="assignment.parameterId"
                  :disabled="readOnly"
                  @change="editor.markDirty"
                >
                  <option
                    v-for="parameter in parameters"
                    :key="parameter.id"
                    :value="parameter.id"
                  >
                    {{ parameter.name }}
                  </option></select
                ><select
                  :value="assignment.value.kind"
                  :disabled="readOnly"
                  @change="
                    replaceAssignmentValue(
                      assignment,
                      ($event.target as HTMLSelectElement)
                        .value as ValueExpressionV3['kind'],
                    )
                  "
                >
                  <option value="eventField">事件字段</option>
                  <option value="parameter">应用参数</option>
                  <option value="fixed">固定值</option></select
                ><select
                  v-if="assignment.value.kind === 'eventField'"
                  v-model="assignment.value.path"
                  :disabled="readOnly"
                  @change="editor.markDirty"
                >
                  <option
                    v-for="field in fields"
                    :key="field.path"
                    :value="field.path"
                  >
                    {{ field.label }}
                  </option></select
                ><select
                  v-else-if="assignment.value.kind === 'parameter'"
                  v-model="assignment.value.parameterId"
                  :disabled="readOnly"
                  @change="editor.markDirty"
                >
                  <option
                    v-for="parameter in parameters"
                    :key="parameter.id"
                    :value="parameter.id"
                  >
                    {{ parameter.name }}
                  </option></select
                ><textarea
                  v-else
                  :value="JSON.stringify(assignment.value.value)"
                  :disabled="readOnly"
                  @change="setFixed(assignment.value, $event)"
                ></textarea
                ><button
                  type="button"
                  :disabled="readOnly"
                  @click="
                    action.assignments!.splice(assignmentIndex, 1);
                    editor.markDirty();
                  "
                >
                  ×
                </button>
              </div></template
            >
            <template v-else-if="action.type === 'openPageWindow'"
              ><div class="action-form">
                <label
                  >目标页面<select
                    v-model="action.pageId"
                    :disabled="readOnly"
                    @change="editor.markDirty"
                  >
                    <option
                      v-for="page in pages.filter(
                        (item) => item.type === 'standard',
                      )"
                      :key="page.id"
                      :value="page.id"
                    >
                      {{ page.name }}
                    </option>
                  </select></label
                ><label
                  >携带参数<select
                    v-model="action.carryParameterIds"
                    multiple
                    :disabled="readOnly"
                    @change="editor.markDirty"
                  >
                    <option
                      v-for="parameter in parameters"
                      :key="parameter.id"
                      :value="parameter.id"
                    >
                      {{ parameter.name }}
                    </option>
                  </select></label
                >
              </div></template
            >
            <template v-else-if="action.type === 'openDialog'"
              ><div class="action-form">
                <label
                  >弹窗页面<select
                    v-model="action.pageId"
                    :disabled="readOnly"
                    @change="editor.markDirty"
                  >
                    <option
                      v-for="page in pages.filter(
                        (item) => item.type === 'dialog',
                      )"
                      :key="page.id"
                      :value="page.id"
                    >
                      {{ page.name }}
                    </option>
                  </select></label
                ><label
                  >宽度<input
                    v-model.number="action.presentation.width"
                    type="number"
                    min="320"
                    :disabled="readOnly"
                    @change="editor.markDirty" /></label
                ><label
                  >高度<input
                    v-model.number="action.presentation.height"
                    type="number"
                    min="240"
                    :disabled="readOnly"
                    @change="editor.markDirty" /></label
                ><label
                  ><input
                    v-model="action.presentation.draggable"
                    type="checkbox"
                    :disabled="readOnly"
                    @change="editor.markDirty"
                  />可拖动</label
                ><label
                  ><input
                    v-model="action.presentation.resizable"
                    type="checkbox"
                    :disabled="readOnly"
                    @change="editor.markDirty"
                  />可缩放</label
                >
              </div></template
            >
            <template v-else-if="action.type === 'applyLinkage'"
              ><div class="action-form">
                <label
                  >联动组件<select
                    v-model="action.targetComponentIds"
                    multiple
                    :disabled="readOnly"
                    @change="editor.markDirty"
                  >
                    <option
                      v-for="component in components"
                      :key="component.id"
                      :value="component.id"
                    >
                      {{ component.title }}
                    </option>
                  </select></label
                ><button
                  type="button"
                  :disabled="readOnly || !parameters.length"
                  @click="addInteractionAssignment(action)"
                >
                  添加联动参数
                </button>
              </div>
              <div
                v-for="(assignment, assignmentIndex) in action.assignments"
                :key="assignmentIndex"
                class="assignment"
              >
                <select
                  v-model="assignment.parameterId"
                  :disabled="readOnly"
                  @change="editor.markDirty"
                >
                  <option
                    v-for="parameter in parameters"
                    :key="parameter.id"
                    :value="parameter.id"
                  >
                    {{ parameter.name }}
                  </option></select
                ><select
                  :value="assignment.value.kind"
                  :disabled="readOnly"
                  @change="
                    replaceAssignmentValue(
                      assignment,
                      ($event.target as HTMLSelectElement)
                        .value as ValueExpressionV3['kind'],
                    )
                  "
                >
                  <option value="eventField">事件字段</option>
                  <option value="parameter">应用参数</option>
                  <option value="fixed">固定值</option></select
                ><select
                  v-if="assignment.value.kind === 'eventField'"
                  v-model="assignment.value.path"
                  :disabled="readOnly"
                  @change="editor.markDirty"
                >
                  <option
                    v-for="field in fields"
                    :key="field.path"
                    :value="field.path"
                  >
                    {{ field.label }}
                  </option></select
                ><select
                  v-else-if="assignment.value.kind === 'parameter'"
                  v-model="assignment.value.parameterId"
                  :disabled="readOnly"
                  @change="editor.markDirty"
                >
                  <option
                    v-for="parameter in parameters"
                    :key="parameter.id"
                    :value="parameter.id"
                  >
                    {{ parameter.name }}
                  </option></select
                ><textarea
                  v-else
                  :value="JSON.stringify(assignment.value.value)"
                  :disabled="readOnly"
                  @change="setFixed(assignment.value, $event)"
                ></textarea
                ><button
                  type="button"
                  :disabled="readOnly"
                  @click="
                    action.assignments.splice(assignmentIndex, 1);
                    editor.markDirty();
                  "
                >
                  ×
                </button>
              </div></template
            >
            <template
              v-else-if="
                action.type === 'drillDown' ||
                action.type === 'drillBack' ||
                action.type === 'clearDrill'
              "
              ><div class="action-form">
                <label
                  >下钻路径<select
                    v-model="action.pathId"
                    :disabled="readOnly"
                    @change="editor.markDirty"
                  >
                    <option
                      v-for="path in drillPaths"
                      :key="path.id"
                      :value="path.id"
                    >
                      {{ path.name }}
                    </option>
                  </select></label
                >
              </div></template
            >
            <template v-else-if="action.type === 'openExternalLink'"
              ><div class="action-form">
                <label
                  >安全链接<input
                    v-model="action.url"
                    type="url"
                    :disabled="readOnly"
                    @input="editor.markDirty" /></label
                ><label
                  >携带参数<select
                    v-model="action.carryParameterIds"
                    multiple
                    :disabled="readOnly"
                    @change="editor.markDirty"
                  >
                    <option
                      v-for="parameter in parameters"
                      :key="parameter.id"
                      :value="parameter.id"
                    >
                      {{ parameter.name }}
                    </option>
                  </select></label
                >
              </div></template
            >
            <template v-else-if="action.type === 'clearLinkage'"
              ><div class="action-form">
                <label
                  >指定联动动作ID（可选）<input
                    v-model="action.linkageActionId"
                    :disabled="readOnly"
                    @input="editor.markDirty"
                /></label></div
            ></template>
            <p v-else class="action-summary">该动作无需额外参数。</p>
          </article>
        </section>
        <p v-if="error" role="alert" class="event-error">{{ error }}</p>
        <footer>
          <button type="button" :disabled="readOnly" @click="removeCurrent">
            删除事件</button
          ><span
            ><button type="button" :disabled="!dirty" @click="editor.cancel">
              取消修改</button
            ><button
              type="button"
              class="primary"
              :disabled="readOnly || !dirty || !draft.actions.length"
              @click="apply"
            >
              应用
            </button></span
          >
        </footer>
      </div>
      <div v-else class="event-empty">
        选择已有事件，或从受控能力目录新建事件。
      </div>
    </aside>
  </div>
</template>

<style scoped>
.event-panel-backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(25, 36, 48, 0.3);
}
.event-config-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: min(680px, 92vw);
  height: 100%;
  overflow: auto;
  background: #fff;
  box-shadow: -16px 0 40px rgba(20, 35, 50, 0.2);
  font:
    12px "PingFang SC",
    "Microsoft YaHei",
    sans-serif;
}
.event-config-panel > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px;
  border-bottom: 1px solid #e2e8ee;
}
.event-config-panel h2 {
  margin: 3px 0 0;
  font-size: 18px;
}
.event-config-panel small {
  color: #8795a3;
  font-size: 9px;
  letter-spacing: 0.12em;
}
.event-config-panel > header button {
  font-size: 24px;
  background: none;
  border: 0;
}
.readonly-note,
.event-error {
  margin: 10px 18px;
  padding: 9px;
  color: #a15c00;
  background: #fff6df;
  border-radius: 5px;
}
.event-selector {
  display: flex;
  gap: 6px;
  padding: 12px 18px;
  overflow: auto;
  border-bottom: 1px solid #e8edf1;
}
.event-selector button,
.event-selector select {
  padding: 7px 9px;
  background: #fff;
  border: 1px solid #d8e1e8;
  border-radius: 5px;
}
.event-selector button.active {
  color: #1477c9;
  border-color: #1477c9;
}
.event-selector i {
  margin-left: 5px;
  font-size: 9px;
  font-style: normal;
}
.event-editor {
  padding: 0 18px 20px;
}
.event-editor.readonly {
  background: #fafbfc;
}
.event-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 0;
}
.event-meta > b {
  font-size: 15px;
}
.event-meta label {
  display: flex;
  align-items: center;
  gap: 5px;
}
.event-meta input[type="number"] {
  width: 100px;
}
.event-editor section {
  padding: 14px 0;
  border-top: 1px solid #e8edf1;
}
.section-title,
.action-card > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.section-title span {
  display: flex;
  gap: 5px;
}
.section-title button,
.section-title select,
.action-card button,
.event-editor footer button {
  padding: 5px 8px;
  background: #fff;
  border: 1px solid #d8e1e8;
  border-radius: 4px;
}
.condition-row {
  display: grid;
  grid-template-columns: 100px 1fr 90px 100px 1fr 28px;
  gap: 5px;
  margin-top: 8px;
}
.condition-row select,
.condition-row textarea,
.assignment select,
.assignment textarea,
.action-card > select {
  min-width: 0;
  padding: 6px;
  border: 1px solid #d8e1e8;
  border-radius: 4px;
}
.action-card {
  margin-top: 9px;
  padding: 10px;
  background: #f7f9fb;
  border: 1px solid #e1e7ec;
  border-radius: 6px;
}
.assignment {
  display: grid;
  grid-template-columns: 1fr 110px 1fr;
  gap: 6px;
  margin-top: 8px;
}
.action-json {
  display: grid;
  gap: 6px;
  margin-top: 8px;
}
.action-json textarea {
  min-height: 145px;
  padding: 8px;
  border: 1px solid #d8e1e8;
  border-radius: 4px;
  font:
    11px Consolas,
    monospace;
}
.event-editor footer {
  display: flex;
  justify-content: space-between;
  margin-top: 16px;
}
.event-editor footer span {
  display: flex;
  gap: 6px;
}
.event-editor footer .primary {
  color: #fff;
  background: #1477c9;
}
.event-empty {
  padding: 70px 20px;
  color: #84919e;
  text-align: center;
}
.event-error {
  margin: 10px 0;
  color: #b42318;
  background: #fff0ee;
}
.assignment {
  grid-template-columns: 1fr 110px 1fr 28px;
}
.action-form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-top: 8px;
}
.action-form label {
  display: grid;
  gap: 4px;
}
.action-form select,
.action-form input {
  min-width: 0;
  padding: 6px;
  border: 1px solid #d8e1e8;
  border-radius: 4px;
}
.action-form select[multiple] {
  min-height: 78px;
}
.action-summary {
  margin: 8px 0 0;
  color: #64748b;
}
</style>
