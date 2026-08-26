<script setup lang="ts">
import type { DrillPathV3 } from '../models/dashboard-v3.ts'
import type { ParameterDefinitionV3 } from '../models/parameters.ts'

const props = defineProps<{ paths: DrillPathV3[]; parameters: ParameterDefinitionV3[] }>()
const emit = defineEmits<{ dirty: [] }>()

function newLevel(index: number, usedParameterIds: string[] = []) {
  const parameter = props.parameters.find((item) => !usedParameterIds.includes(item.id))
  return { id: `level-${crypto.randomUUID()}`, label: `层级 ${index + 1}`, field: '', parameterId: parameter?.id ?? '' }
}
function addPath() {
  props.paths.push({ id: `drill-${crypto.randomUUID()}`, name: '新建下钻路径', levels: [newLevel(0), newLevel(1)] })
  emit('dirty')
}
function addLevel(path: DrillPathV3) {
  if (path.levels.length >= 12 || path.levels.length >= props.parameters.length) return
  path.levels.push(newLevel(path.levels.length, path.levels.map((level) => level.parameterId))); emit('dirty')
}
function removeLevel(path: DrillPathV3, index: number) {
  if (path.levels.length <= 2) return
  path.levels.splice(index, 1); emit('dirty')
}
function moveLevel(path: DrillPathV3, index: number, delta: -1 | 1) {
  const target = index + delta
  if (target < 0 || target >= path.levels.length) return
  ;[path.levels[index], path.levels[target]] = [path.levels[target], path.levels[index]]
  emit('dirty')
}
</script>

<template>
  <section class="drill-manager">
    <header><div><h3>下钻路径</h3><p>按事件真实字段依次写入应用参数，至少保留两个层级。</p></div><button type="button" :disabled="parameters.length < 2" @click="addPath">新增路径</button></header>
    <p v-if="parameters.length < 2" class="drill-warning">请先在参数中心创建至少两个应用参数。</p>
    <article v-for="(path, pathIndex) in paths" :key="path.id">
      <div class="path-heading"><label>路径名称<input v-model="path.name" @input="emit('dirty')" /></label><label>稳定ID<input :value="path.id" readonly title="稳定 ID 不可直接修改，避免已有动作引用失效" /></label><button type="button" @click="paths.splice(pathIndex,1);emit('dirty')">删除路径</button></div>
      <div v-for="(level, levelIndex) in path.levels" :key="level.id" class="level-row">
        <b>{{ levelIndex + 1 }}</b>
        <label>层级名称<input v-model="level.label" @input="emit('dirty')" /></label>
        <label>事件字段<input v-model="level.field" placeholder="company_code" @input="emit('dirty')" /></label>
        <label>写入参数<select v-model="level.parameterId" @change="emit('dirty')"><option v-for="parameter in parameters" :key="parameter.id" :value="parameter.id">{{ parameter.name }} · {{ parameter.code }}</option></select></label>
        <span><button type="button" :disabled="levelIndex === 0" @click="moveLevel(path,levelIndex,-1)">↑</button><button type="button" :disabled="levelIndex === path.levels.length-1" @click="moveLevel(path,levelIndex,1)">↓</button><button type="button" :disabled="path.levels.length <= 2" @click="removeLevel(path,levelIndex)">×</button></span>
      </div>
      <button type="button" class="add-level" :disabled="path.levels.length >= 12 || path.levels.length >= parameters.length" @click="addLevel(path)">添加层级</button>
    </article>
    <p v-if="!paths.length" class="drill-empty">暂无下钻路径。新增后可在事件动作中直接选择，不需要编辑JSON。</p>
  </section>
</template>

<style scoped>
.drill-manager{display:grid;gap:10px}.drill-manager>header,.path-heading,.level-row{display:flex;align-items:end;gap:8px}.drill-manager>header{align-items:flex-start;justify-content:space-between}.drill-manager h3,.drill-manager p{margin:0}.drill-manager p{color:#64748b;font-size:10px}.drill-manager button,.drill-manager input,.drill-manager select{padding:6px;border:1px solid #d8e1e8;border-radius:4px;background:#fff}.drill-manager article{display:grid;gap:8px;padding:10px;border:1px solid #e1e7ec;border-radius:6px;background:#f8fafc}.path-heading label,.level-row label{display:grid;flex:1;gap:3px;font-size:9px;color:#64748b}.level-row>b{align-self:center;color:#1477c9}.level-row>span{display:flex;gap:3px}.add-level{justify-self:start}.drill-warning{padding:8px;color:#a15c00!important;background:#fff6df}.drill-empty{padding:18px;text-align:center;border:1px dashed #d8e1e8}
</style>
