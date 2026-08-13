import assert from 'node:assert/strict'
import test from 'node:test'

import { moveDialogV3, placeDialogV3, resizeDialogByV3 } from '../src/services/dialogGeometryV3.ts'
import type { DialogPresentationV3 } from '../src/models/dashboard-v3.ts'

const presentation: DialogPresentationV3 = { width: 640, height: 420, minWidth: 320, minHeight: 240, maxWidth: 960, maxHeight: 720, draggable: true, resizable: true, closeOnEscape: true, closeOnBackdrop: false }
const viewport = { width: 1200, height: 800 }
const protectedRegion = { x: 0, y: 0, width: 1200, height: 120 }

test('P10.5 dialog placement clamps dimensions and avoids protected filter regions', () => {
  const placed = placeDialogV3(presentation, viewport, [protectedRegion])
  assert.deepEqual(placed, { x: 280, y: 190, width: 640, height: 420 })
  const oversized = placeDialogV3({ ...presentation, width: 2000, height: 2000, minWidth: 10, minHeight: 10 }, { width: 500, height: 400 })
  assert.deepEqual(oversized, { x: 0, y: 0, width: 500, height: 400 })
})

test('P10.5 dialog movement and resize stay in viewport and out of protection', () => {
  const initial = placeDialogV3(presentation, viewport, [protectedRegion])
  assert.deepEqual(moveDialogV3(initial, -200, -200, presentation, viewport, [protectedRegion]), { ...initial, x: 0, y: 120 })
  assert.deepEqual(moveDialogV3(initial, 5000, 5000, presentation, viewport, [protectedRegion]), { ...initial, x: 560, y: 380 })
  const resized = resizeDialogByV3(initial, 'se', 5000, -410, presentation, viewport, [protectedRegion])
  assert.equal(resized.width, 960); assert.equal(resized.height, 240)
  assert.ok(resized.x >= 0 && resized.y >= 120 && resized.x + resized.width <= viewport.width && resized.y + resized.height <= viewport.height)
})

test('P10.5 all eight resize directions preserve their opposite anchors', () => {
  const initial = { x: 280, y: 190, width: 640, height: 420 }
  const right = initial.x + initial.width
  const bottom = initial.y + initial.height
  const cases = [
    ['n', 0, -40], ['ne', 40, -40], ['e', 40, 0], ['se', 40, 40],
    ['s', 0, 40], ['sw', -40, 40], ['w', -40, 0], ['nw', -40, -40],
  ] as const
  for (const [direction, deltaX, deltaY] of cases) {
    const resized = resizeDialogByV3(initial, direction, deltaX, deltaY, presentation, viewport)
    assert.notDeepEqual(resized, initial, direction)
    if (direction.includes('w')) assert.equal(resized.x + resized.width, right, direction)
    else assert.equal(resized.x, initial.x, direction)
    if (direction.includes('n')) assert.equal(resized.y + resized.height, bottom, direction)
    else assert.equal(resized.y, initial.y, direction)
    assert.ok(resized.x >= 0 && resized.y >= 0 && resized.x + resized.width <= viewport.width && resized.y + resized.height <= viewport.height, direction)
  }
})

test('P10.5 impossible protection fails closed while invalid coordinates normalize', () => {
  assert.throws(() => placeDialogV3(presentation, viewport, [{ x: 0, y: 0, width: 1200, height: 800 }]), /cannot avoid/)
  const initial = placeDialogV3(presentation, viewport)
  assert.deepEqual(moveDialogV3(initial, Number.NaN, Number.POSITIVE_INFINITY, presentation, viewport), { ...initial, x: 0, y: 0 })
})
