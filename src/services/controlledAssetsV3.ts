import type { GeoJsonFeatureCollection, GeoJsonGeometry } from '../models/dashboard'

const SAFE_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
export const MAX_EMBEDDED_IMAGE_BYTES_V3 = 2 * 1024 * 1024
export const MAX_GEOJSON_BYTES_V3 = 5 * 1024 * 1024

export function isSafeEmbeddedImageV3(source: string): boolean {
  const match = /^data:([^;,]+);base64,([a-z0-9+/=]+)$/i.exec(source)
  if (!match || !SAFE_IMAGE_MIME.has(match[1].toLowerCase())) return false
  return Math.ceil(match[2].length * 0.75) <= MAX_EMBEDDED_IMAGE_BYTES_V3
}

function finitePosition(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= -180 && value <= 180
}

function validRing(value: unknown): value is number[][] {
  return Array.isArray(value) && value.length >= 4 && value.every((position) =>
    Array.isArray(position) && position.length >= 2 && finitePosition(position[0]) && finitePosition(position[1]))
}

function validGeometry(value: unknown): value is GeoJsonGeometry {
  if (!value || typeof value !== 'object') return false
  const geometry = value as { type?: unknown; coordinates?: unknown }
  if (geometry.type === 'Polygon') return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0 && geometry.coordinates.every(validRing)
  if (geometry.type === 'MultiPolygon') return Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0
    && geometry.coordinates.every((polygon) => Array.isArray(polygon) && polygon.length > 0 && polygon.every(validRing))
  return false
}

export function parseSafeGeoJsonV3(source: string): GeoJsonFeatureCollection {
  if (new TextEncoder().encode(source).byteLength > MAX_GEOJSON_BYTES_V3) throw new Error('GeoJSON 超过 5MB 上限')
  const value = JSON.parse(source) as unknown
  if (!value || typeof value !== 'object') throw new Error('GeoJSON 根节点必须是对象')
  const collection = value as { type?: unknown; features?: unknown }
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features) || !collection.features.length) throw new Error('仅支持非空 FeatureCollection')
  const features = collection.features.map((feature, index) => {
    if (!feature || typeof feature !== 'object') throw new Error(`第 ${index + 1} 个区域不是 Feature`)
    const candidate = feature as { type?: unknown; properties?: unknown; geometry?: unknown }
    if (candidate.type !== 'Feature' || !validGeometry(candidate.geometry)) throw new Error(`第 ${index + 1} 个区域仅支持 Polygon/MultiPolygon`)
    const properties = candidate.properties && typeof candidate.properties === 'object' && !Array.isArray(candidate.properties)
      ? candidate.properties as Record<string, string | number | boolean | null>
      : {}
    return { type: 'Feature' as const, properties, geometry: candidate.geometry }
  })
  return { type: 'FeatureCollection', features }
}

type Point = [number, number]

function geometryPoints(geometry: GeoJsonGeometry): Point[] {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates as number[][][]] : geometry.coordinates as number[][][][]
  return polygons.flatMap((polygon) => polygon.flatMap((ring) => ring.map((point) => [point[0], point[1]] as Point)))
}

export interface MapProjectionV3 {
  paths: string[]
  project: (longitude: number, latitude: number) => Point
}

export function projectGeoJsonV3(collection: GeoJsonFeatureCollection, width: number, height: number, padding = 10): MapProjectionV3 {
  const all = collection.features.flatMap((feature) => geometryPoints(feature.geometry))
  const xs = all.map(([x]) => x); const ys = all.map(([, y]) => y)
  const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys)
  const spanX = Math.max(maxX - minX, 1e-9); const spanY = Math.max(maxY - minY, 1e-9)
  const scale = Math.min(Math.max(1, width - padding * 2) / spanX, Math.max(1, height - padding * 2) / spanY)
  const offsetX = (width - spanX * scale) / 2; const offsetY = (height - spanY * scale) / 2
  const project = (longitude: number, latitude: number): Point => [offsetX + (longitude - minX) * scale, height - offsetY - (latitude - minY) * scale]
  const ringPath = (ring: number[][]) => ring.map((point, index) => `${index ? 'L' : 'M'}${project(point[0], point[1]).join(' ')}`).join(' ') + ' Z'
  const paths = collection.features.map((feature) => {
    const polygons = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates as number[][][]] : feature.geometry.coordinates as number[][][][]
    return polygons.flatMap((polygon) => polygon.map(ringPath)).join(' ')
  })
  return { paths, project }
}
