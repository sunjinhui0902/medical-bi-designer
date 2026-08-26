<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { DashboardComponent } from '../models/dashboard'
import { isSafeEmbeddedImageV3 } from '../services/controlledAssetsV3'
import { safeStyleTokenV3 } from '../services/safeStyleV3'
import { escapeTextToHtmlV3 } from '../services/safeHtmlV3'

const props = defineProps<{ component: DashboardComponent; rows?: Array<Record<string, unknown>>; interactive?: boolean }>()
const emit = defineEmits<{ action: [payload: Record<string, string | number | boolean | null>] }>()

const iconPaths: Record<string, string> = {
  hospital: 'M4 21V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v16M9 21v-4h6v4M9 8h6M12 5v6M9 11h6',
  activity: 'M3 12h4l2-6 4 12 2-6h6', warning: 'M12 9v4m0 4h.01M10.3 3.7 2 18h20l-9.7-18a1 1 0 0 0-2 0Z',
  check: 'M5 12l4 4L19 6', location: 'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Zm-8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
}

const safeImage = computed(() => {
  const source = props.component.imageConfig?.source ?? ''
  return isSafeEmbeddedImageV3(source) ? source : ''
})

const mapRows = computed(() => props.rows ?? [])
const mapElement = ref<HTMLElement>()
let leafletMap: L.Map | undefined
let dataLayer: L.LayerGroup | undefined
function safePayload(row: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(row).filter(([, value]) => value === null || ['string', 'number', 'boolean'].includes(typeof value))) as Record<string, string | number | boolean | null>
}

function scoreColor(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return '#64748b'
  if (value < 90) return '#ef6a74'
  if (value < 93) return '#f2b94b'
  return '#47c39c'
}

function createRegionIcon(label: string, value: number | undefined) {
  const safeLabel = escapeTextToHtmlV3(label)
  const score = value === undefined ? '--' : value.toFixed(1)
  return L.divIcon({
    className: 'quality-region-marker',
    html: `<button type="button" style="--region-color:${scoreColor(value)}"><span>${safeLabel}</span><strong>${score}</strong></button>`,
    iconSize: [76, 36],
    iconAnchor: [38, 18],
  })
}

function renderLeafletData() {
  const config = props.component.mapConfig
  if (!leafletMap || !config) return
  dataLayer?.remove()
  dataLayer = L.layerGroup().addTo(leafletMap)
  const locations: L.LatLngExpression[] = []
  const regionGroups = new Map<string, Array<{ latitude: number; longitude: number; value?: number }>>()
  for (const row of mapRows.value) {
    const longitude = Number(row[config.longitudeField])
    const latitude = Number(row[config.latitudeField])
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) continue
    locations.push([latitude, longitude])
    const rawValue = Number(row[config.valueField])
    const value = Number.isFinite(rawValue) ? rawValue : undefined
    const code = String(row[config.regionCodeField] ?? '')
    if (code) regionGroups.set(code, [...(regionGroups.get(code) ?? []), { latitude, longitude, value }])
    if (config.showPoints) {
      const marker = L.circleMarker([latitude, longitude], {
        radius: 6, color: '#f8fafc', weight: 2,
        fillColor: scoreColor(value), fillOpacity: .98,
      }).addTo(dataLayer)
      marker.bindTooltip(`<strong>${escapeTextToHtmlV3(row[config.pointLabelField] ?? '医疗机构')}</strong><br/>质控得分 ${value?.toFixed(1) ?? '--'}`, { direction: 'top', opacity: .96 })
      marker.on('click', () => emit('action', safePayload(row)))
    }
  }
  for (const [code, rows] of regionGroups) {
    const latitude = rows.reduce((sum, item) => sum + item.latitude, 0) / rows.length
    const longitude = rows.reduce((sum, item) => sum + item.longitude, 0) / rows.length
    const values = rows.flatMap((item) => item.value === undefined ? [] : [item.value])
    const value = values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : undefined
    const label = String(mapRows.value.find((row) => String(row[config.regionCodeField] ?? '') === code)?.region_name ?? code)
    const marker = L.marker([latitude, longitude], {
      icon: createRegionIcon(label, value),
      interactive: props.interactive !== false,
    }).addTo(dataLayer)
    marker.on('click', () => emit('action', {
      [config.regionCodeField]: code,
      [config.valueField]: value ?? null,
      region_name: label,
    }))
  }
  if (locations.length) leafletMap.fitBounds(L.latLngBounds(locations), { padding: [42, 42], maxZoom: 12 })
}

async function initializeLeaflet() {
  if (props.component.type !== 'map' || !props.component.mapConfig) return
  await nextTick()
  if (!mapElement.value || leafletMap) return
  const enabled = props.interactive !== false
  leafletMap = L.map(mapElement.value, {
    zoomControl: enabled, attributionControl: true,
    dragging: enabled, scrollWheelZoom: enabled, doubleClickZoom: enabled,
    boxZoom: enabled, keyboard: enabled,
  }).setView([32.86, 120.32], 10)
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd', maxZoom: 20,
    attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
  }).addTo(leafletMap)
  renderLeafletData()
  setTimeout(() => leafletMap?.invalidateSize(), 0)
}

onMounted(initializeLeaflet)
watch([mapRows, () => props.component.mapConfig, () => props.interactive], async () => {
  await initializeLeaflet()
  renderLeafletData()
  leafletMap?.invalidateSize()
}, { deep: true })
onBeforeUnmount(() => {
  leafletMap?.remove()
  leafletMap = undefined
  dataLayer = undefined
})
</script>

<template>
  <div v-if="component.type === 'text' && component.textConfig" class="controlled-text" :style="{ color: component.textConfig.color, fontSize: `${component.textConfig.fontSize}px`, fontWeight: component.textConfig.fontWeight, textAlign: component.textConfig.align, justifyContent: component.textConfig.verticalAlign === 'center' ? 'center' : component.textConfig.verticalAlign === 'bottom' ? 'flex-end' : 'flex-start', lineHeight: component.textConfig.lineHeight }">{{ component.textConfig.content }}</div>
  <div v-else-if="component.type === 'image' && component.imageConfig" class="controlled-image"><img v-if="safeImage" :src="safeImage" :alt="component.imageConfig.alt" :style="{ objectFit: component.imageConfig.objectFit, opacity: component.imageConfig.opacity }" /><span v-else>请选择本地 PNG/JPEG/WebP/GIF 图片（最大 2MB）</span></div>
  <div v-else-if="component.type === 'icon' && component.iconConfig" class="controlled-icon"><svg viewBox="0 0 24 24" fill="none" :stroke="component.iconConfig.color" :stroke-width="component.iconConfig.strokeWidth" stroke-linecap="round" stroke-linejoin="round" :style="{ width: `${component.iconConfig.size}px`, height: `${component.iconConfig.size}px` }"><path :d="iconPaths[component.iconConfig.name] || iconPaths.activity" /></svg></div>
  <div v-else-if="component.type === 'decoration' && component.decorationConfig" class="controlled-decoration" :class="[`shape-${component.decorationConfig.shape}`, `direction-${component.decorationConfig.direction}`]"><i :style="{ background: safeStyleTokenV3(component.decorationConfig.fill, 'transparent'), borderColor: safeStyleTokenV3(component.decorationConfig.borderColor, '#1477c9'), borderWidth: `${component.decorationConfig.borderWidth}px`, borderRadius: `${component.decorationConfig.borderRadius}px` }"></i></div>
  <div v-else-if="component.type === 'map' && component.mapConfig" class="controlled-map">
    <div ref="mapElement" class="leaflet-quality-map" aria-label="真实道路底图与医疗机构分布"></div>
    <div class="map-source-chip"><b>LIVE MAP</b><span>OpenStreetMap · CARTO</span></div>
    <div v-if="component.mapConfig.showLegend" class="map-legend quality-score-legend"><span><i class="good"></i>≥93</span><span><i class="warning"></i>90–93</span><span><i class="danger"></i>&lt;90</span></div>
  </div>
</template>

<style scoped>
.controlled-text{display:flex;width:100%;height:100%;white-space:pre-wrap;overflow:hidden;overflow-wrap:anywhere}
.controlled-image,.controlled-icon,.controlled-decoration,.controlled-map{display:flex;align-items:center;justify-content:center;width:100%;height:100%;min-height:0}
.controlled-image img{width:100%;height:100%}.controlled-image span{color:#94a3b8;font-size:11px;text-align:center}.controlled-icon svg{max-width:100%;max-height:100%}
.controlled-decoration i{display:block;box-sizing:border-box;border-style:solid}.shape-rectangle i{width:100%;height:100%}.shape-line.direction-horizontal i,.shape-divider.direction-horizontal i{width:100%;height:0}.shape-line.direction-vertical i,.shape-divider.direction-vertical i{width:0;height:100%}.shape-divider i{border-style:dashed}
.controlled-map{position:relative;isolation:isolate;overflow:hidden;background:#0b1627}.leaflet-quality-map{position:absolute;inset:0;z-index:1}
.controlled-map :deep(.leaflet-container){background:#0b1627;font-family:"Microsoft YaHei UI","PingFang SC",sans-serif}.controlled-map :deep(.leaflet-control-attribution){color:#94a3b8;background:rgba(5,15,28,.76);font-size:8px}.controlled-map :deep(.leaflet-control-attribution a){color:#7dd3fc}.controlled-map :deep(.leaflet-bar a){color:#dbeafe;background:#10233a;border-color:#27435e}.controlled-map :deep(.leaflet-tooltip){color:#dbeafe;background:rgba(5,15,28,.96);border:1px solid #315775;box-shadow:0 12px 28px rgba(2,8,23,.38)}.controlled-map :deep(.leaflet-tooltip-top::before){border-top-color:#315775}
.controlled-map :deep(.quality-region-marker){background:transparent;border:0}.controlled-map :deep(.quality-region-marker button){display:grid;grid-template-columns:1fr auto;align-items:center;gap:6px;width:76px;height:36px;padding:5px 7px;color:#eaf6ff;background:rgba(6,23,40,.9);border:1px solid color-mix(in srgb,var(--region-color) 60%,#1e3a55);border-left:3px solid var(--region-color);border-radius:4px;box-shadow:0 8px 20px rgba(2,8,23,.34);cursor:pointer}.controlled-map :deep(.quality-region-marker span){min-width:0;overflow:hidden;font-size:9px;white-space:nowrap;text-overflow:ellipsis}.controlled-map :deep(.quality-region-marker strong){color:var(--region-color);font-size:12px;font-family:"Bahnschrift","Microsoft YaHei UI",sans-serif}
.map-source-chip{position:absolute;z-index:500;top:10px;left:10px;display:flex;align-items:center;gap:7px;padding:6px 9px;color:#cbd5e1;background:rgba(5,15,28,.82);border:1px solid rgba(125,211,252,.22);border-radius:4px;box-shadow:0 8px 22px rgba(2,8,23,.28);pointer-events:none}.map-source-chip b{color:#38bdf8;font-size:8px;letter-spacing:.12em}.map-source-chip span{font-size:8px}
.map-legend{position:absolute;z-index:500;right:10px;bottom:18px;display:flex;gap:9px;padding:6px 8px;color:#cbd5e1;background:rgba(5,15,28,.82);border:1px solid rgba(148,163,184,.2);border-radius:4px;font-size:8px;pointer-events:none}.map-legend span{display:flex;align-items:center;gap:4px}.map-legend i{width:7px;height:7px;border-radius:50%}.map-legend .good{background:#47c39c}.map-legend .warning{background:#f2b94b}.map-legend .danger{background:#ef6a74}
</style>
