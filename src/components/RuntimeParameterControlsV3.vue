<script setup lang="ts">
import type { ParameterControlV3 } from '../models/dashboard-v3'
import type { ParameterDefinitionV3 } from '../models/parameters'
defineProps<{ controls: ParameterControlV3[]; parameterFor: (id: string) => ParameterDefinitionV3 | undefined; parameterOptionState: (id: string) => { status: string; message?: string }; optionsForParameter: (parameter: ParameterDefinitionV3) => Array<{ value: unknown; label: string }>; controlValue: (id: string) => unknown; scalarControlValue: (id: string) => string | number; dateRangeControlValue: (id: string, index: number) => string; updateControlValue: (control: ParameterControlV3, id: string, event: Event) => void; updateDateRangeControl: (control: ParameterControlV3, id: string, index: number, event: Event) => void; setControlValue: (control: ParameterControlV3, id: string, value: unknown) => void; clearControl: (control: ParameterControlV3) => void; submitControl: (control: ParameterControlV3) => void }>()
</script>
<template>
            <section
              v-for="control in controls"
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
                    :aria-label="parameterFor(parameterId)!.name"
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
                    :aria-label="parameterFor(parameterId)!.name"
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
                      :aria-label="`${parameterFor(parameterId)!.name}开始日期`"
                      :value="dateRangeControlValue(parameterId, 0)"
                      @change="
                        updateDateRangeControl(control, parameterId, 0, $event)
                      " /><i>至</i
                    ><input
                      type="date"
                      :aria-label="`${parameterFor(parameterId)!.name}结束日期`"
                      :value="dateRangeControlValue(parameterId, 1)"
                      @change="
                        updateDateRangeControl(control, parameterId, 1, $event)
                      "
                  /></span>
                  <input
                    v-else
                    :aria-label="parameterFor(parameterId)!.name"
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
                  v-if="control.interaction.clearable && control.parameterIds.every(id => !parameterFor(id)?.required)"
                  type="button"
                  :aria-label="`清空${control.parameterIds.map(id => parameterFor(id)?.name ?? '').join('、')}筛选`"
                  @click="clearControl(control)"
                >清空</button>
                <button
                  v-if="control.interaction.submitMode === 'manual'"
                  type="button"
                  @click="submitControl(control)"
                >
                  应用
                </button>
              </div>
            </section>
</template>
