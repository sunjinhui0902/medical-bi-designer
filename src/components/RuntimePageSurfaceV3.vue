<script setup lang="ts">
import { computed, reactive } from 'vue'
import type { DashboardComponent, TabItemConfig } from '../models/dashboard'
import type { DashboardComponentV3 } from '../models/dashboard-v3'
import { responsiveLayoutV3 } from '../services/responsiveLayoutV3'
import { safeStyleTokenV3 } from '../services/safeStyleV3'
const props = defineProps<{ components: DashboardComponent[]; width: number }>()
const emit = defineEmits<{ click: [component: DashboardComponent]; doubleClick: [component: DashboardComponent]; tab: [component: DashboardComponent, item: TabItemConfig] }>()
const selectedTabs = reactive<Record<string, string>>({})
const layout = computed(() => responsiveLayoutV3(props.components, Math.max(240, Math.min(1024, props.width))))
const roots = computed(() => {
  const children = new Set(props.components.flatMap(component => component.tabsConfig?.items.flatMap(item => item.componentIds) ?? []))
  return props.components.filter(component => !children.has(component.id))
})
function activeTab(component: DashboardComponent) {
  const items = component.tabsConfig?.items.filter(item => item.visible !== false) ?? []
  return items.find(item => item.id === (selectedTabs[component.id] ?? component.tabsConfig?.activeItemId)) ?? items[0]
}
function children(component: DashboardComponent) { const ids = activeTab(component)?.componentIds ?? []; return props.components.filter(child => ids.includes(child.id)) }
function style(component: DashboardComponent) {
  const position = layout.value.positions[component.id] ?? component.position, scale = layout.value.scales[component.id] ?? 1
  return { left: `${position.x}px`, top: `${position.y}px`, width: `${position.width / scale}px`, height: `${position.height / scale}px`, zIndex: position.zIndex,
    transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: 'top left',
    background: safeStyleTokenV3(component.styleConfig.background, '#fff'), borderColor: safeStyleTokenV3(component.styleConfig.borderColor, '#e1e7ec'),
    borderWidth: `${component.styleConfig.borderWidth ?? 1}px`, borderRadius: `${component.styleConfig.borderRadius ?? 7}px`, opacity: component.styleConfig.opacity ?? 1,
    pointerEvents: component.styleConfig.pointerEvents === 'none' ? 'none' as const : undefined }
}
function clickable(component: DashboardComponent) { return (component as DashboardComponentV3).events?.some(event => event.enabled && (event.event === 'click' || event.event === 'doubleClick')) ?? false }
function click(component: DashboardComponent) { if (!['line', 'bar', 'pie', 'area', 'combo', 'scatter', 'bubble', 'outpatient', 'ranking', 'table', 'map', 'tabs'].includes(component.type)) emit('click', component) }
function doubleClick(component: DashboardComponent) { if (!['line', 'bar', 'pie', 'area', 'combo', 'scatter', 'bubble', 'outpatient', 'ranking', 'table', 'map', 'tabs'].includes(component.type)) emit('doubleClick', component) }
function choose(component: DashboardComponent, item: TabItemConfig) { selectedTabs[component.id] = item.id; emit('tab', component, item) }
</script>
<template>
  <section class="runtime-page-surface-v3 interactive-canvas" :style="{ width: `${layout.width}px`, height: `${layout.height}px` }">
    <article v-for="component in roots" :key="component.id" class="design-component runtime-component-v3" :class="{ 'is-text-component': component.type === 'text' }" :data-component-id="component.id" :style="style(component)" :role="clickable(component) ? 'button' : undefined" :tabindex="clickable(component) ? 0 : undefined" @click.stop="click(component)" @dblclick.stop="doubleClick(component)" @keydown.enter.prevent.stop="click(component)">
      <div v-if="component.styleConfig.titleVisible" class="design-component-header"><span :style="{ color: component.styleConfig.titleColor, fontSize: `${component.styleConfig.titleSize}px`, fontWeight: component.styleConfig.titleWeight }">{{ component.title }}</span></div>
      <div class="design-component-body">
        <section v-if="component.type === 'tabs' && component.tabsConfig" class="dashboard-tab-layout" :class="`position-${component.tabsConfig.titlePosition}`">
          <nav class="dashboard-tabs" :class="`align-${component.tabsConfig.alignment}`" :style="{ flexBasis: `${component.tabsConfig.titleSize}px` }" aria-label="弹窗页签">
            <button v-for="item in component.tabsConfig.items.filter(item => item.visible !== false)" :key="item.id" type="button" :class="{ active: activeTab(component)?.id === item.id }" @click.stop="choose(component, item)">{{ item.label }}</button>
          </nav>
          <div class="dashboard-tab-content" :style="{ padding: `${activeTab(component)?.padding ?? 0}px`, background: activeTab(component)?.background }">
            <article v-for="child in children(component)" :key="child.id" class="tab-child-component" :data-component-id="child.id" :style="style(child)" :role="clickable(child) ? 'button' : undefined" :tabindex="clickable(child) ? 0 : undefined" @click.stop="click(child)" @dblclick.stop="doubleClick(child)" @keydown.enter.prevent.stop="click(child)">
              <div v-if="child.styleConfig.titleVisible" class="design-component-header"><span>{{ child.title }}</span></div>
              <div class="design-component-body"><slot name="component" :component="child" /></div>
            </article>
          </div>
        </section>
        <slot v-else name="component" :component="component" />
      </div>
    </article>
  </section>
</template>
<style scoped>
.runtime-page-surface-v3{position:relative;margin:0;border:0;background:transparent}.runtime-component-v3{position:absolute;cursor:default;touch-action:auto}.runtime-component-v3:focus-visible{outline:2px solid #1477c9;outline-offset:2px}.runtime-component-v3 .design-component-body{min-width:0}.runtime-component-v3 .tab-child-component{cursor:default;touch-action:auto}
</style>
