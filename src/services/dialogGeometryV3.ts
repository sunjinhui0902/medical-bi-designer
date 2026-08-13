import type { DialogPresentationV3 } from '../models/dashboard-v3.ts'

export interface DialogRectV3 { x: number; y: number; width: number; height: number }
export interface DialogViewportV3 { width: number; height: number }
export type DialogResizeDirectionV3 = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw'

function finite(value: number, fallback: number) { return Number.isFinite(value) ? value : fallback }
function clamp(value: number, minimum: number, maximum: number) { return Math.min(Math.max(value, minimum), Math.max(minimum, maximum)) }

function normalizedRect(rect: DialogRectV3): DialogRectV3 {
  return {
    x: finite(rect.x, 0),
    y: finite(rect.y, 0),
    width: Math.max(0, finite(rect.width, 0)),
    height: Math.max(0, finite(rect.height, 0)),
  }
}

function overlapArea(left: DialogRectV3, right: DialogRectV3) {
  const width = Math.max(0, Math.min(left.x + left.width, right.x + right.width) - Math.max(left.x, right.x))
  const height = Math.max(0, Math.min(left.y + left.height, right.y + right.height) - Math.max(left.y, right.y))
  return width * height
}

function isLegal(rect: DialogRectV3, regions: ReadonlyArray<DialogRectV3>) { return regions.every((region) => overlapArea(rect, region) === 0) }

function fit(rect: DialogRectV3, viewport: DialogViewportV3, presentation: DialogPresentationV3): DialogRectV3 {
  const viewportWidth = Math.max(1, finite(viewport.width, 1))
  const viewportHeight = Math.max(1, finite(viewport.height, 1))
  const minWidth = Math.min(viewportWidth, presentation.minWidth ?? 1)
  const minHeight = Math.min(viewportHeight, presentation.minHeight ?? 1)
  const maxWidth = Math.min(viewportWidth, presentation.maxWidth ?? viewportWidth)
  const maxHeight = Math.min(viewportHeight, presentation.maxHeight ?? viewportHeight)
  const width = clamp(finite(rect.width, presentation.width), minWidth, maxWidth)
  const height = clamp(finite(rect.height, presentation.height), minHeight, maxHeight)
  return {
    x: clamp(finite(rect.x, 0), 0, viewportWidth - width),
    y: clamp(finite(rect.y, 0), 0, viewportHeight - height),
    width,
    height,
  }
}

function avoidProtectedRegions(rect: DialogRectV3, viewport: DialogViewportV3, presentation: DialogPresentationV3, regions: ReadonlyArray<DialogRectV3>, fallback?: DialogRectV3) {
  const protectedRegions = regions.map(normalizedRect).filter((item) => item.width > 0 && item.height > 0)
  if (!protectedRegions.length) return rect
  const candidates = [rect, ...(fallback ? [fit(fallback, viewport, presentation)] : [])]
  for (const region of protectedRegions) {
    candidates.push(
      fit({ ...rect, y: region.y + region.height }, viewport, presentation),
      fit({ ...rect, y: region.y - rect.height }, viewport, presentation),
      fit({ ...rect, x: region.x + region.width }, viewport, presentation),
      fit({ ...rect, x: region.x - rect.width }, viewport, presentation),
    )
  }
  const ranked = candidates
    .map((candidate) => ({
      candidate,
      overlap: protectedRegions.reduce((total, region) => total + overlapArea(candidate, region), 0),
      distance: Math.abs(candidate.x - rect.x) + Math.abs(candidate.y - rect.y),
    }))
    .sort((left, right) => left.overlap - right.overlap || left.distance - right.distance)
  const legal = ranked.find((item) => item.overlap === 0)
  if (!legal) throw new Error('dialog cannot avoid protected regions')
  return legal.candidate
}

export function placeDialogV3(presentation: DialogPresentationV3, viewport: DialogViewportV3, protectedRegions: ReadonlyArray<DialogRectV3> = []): DialogRectV3 {
  const width = Math.min(presentation.width, Math.max(1, finite(viewport.width, 1)))
  const height = Math.min(presentation.height, Math.max(1, finite(viewport.height, 1)))
  const initial = fit({ x: (viewport.width - width) / 2, y: (viewport.height - height) / 2, width, height }, viewport, presentation)
  return avoidProtectedRegions(initial, viewport, presentation, protectedRegions)
}

export function moveDialogV3(rect: DialogRectV3, x: number, y: number, presentation: DialogPresentationV3, viewport: DialogViewportV3, protectedRegions: ReadonlyArray<DialogRectV3> = []): DialogRectV3 {
  return avoidProtectedRegions(fit({ ...rect, x, y }, viewport, presentation), viewport, presentation, protectedRegions, rect)
}

export function resizeDialogV3(rect: DialogRectV3, width: number, height: number, presentation: DialogPresentationV3, viewport: DialogViewportV3, protectedRegions: ReadonlyArray<DialogRectV3> = []): DialogRectV3 {
  const regions = protectedRegions.map(normalizedRect)
  const desired = fit({ ...rect, width, height }, viewport, presentation)
  return isLegal(desired, regions) ? desired : fit(rect, viewport, presentation)
}

export function resizeDialogByV3(rect: DialogRectV3, direction: DialogResizeDirectionV3, deltaX: number, deltaY: number, presentation: DialogPresentationV3, viewport: DialogViewportV3, protectedRegions: ReadonlyArray<DialogRectV3> = []): DialogRectV3 {
  const right = rect.x + rect.width
  const bottom = rect.y + rect.height
  const west = direction.includes('w'); const east = direction.includes('e')
  const north = direction.includes('n'); const south = direction.includes('s')
  const rawWidth = rect.width + (east ? deltaX : west ? -deltaX : 0)
  const rawHeight = rect.height + (south ? deltaY : north ? -deltaY : 0)
  const sized = fit({ x: west ? right - rawWidth : rect.x, y: north ? bottom - rawHeight : rect.y, width: rawWidth, height: rawHeight }, viewport, presentation)
  const width = sized.width; const height = sized.height
  const anchored = fit({ x: west ? right - width : rect.x, y: north ? bottom - height : rect.y, width, height }, viewport, presentation)
  const regions = protectedRegions.map(normalizedRect)
  return isLegal(anchored, regions) ? anchored : fit(rect, viewport, presentation)
}
