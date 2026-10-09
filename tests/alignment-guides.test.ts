import test from 'node:test'
import assert from 'node:assert/strict'
import { alignmentGuidesV3 } from '../src/services/alignmentGuidesV3.ts'
const bounds = { width: 800, height: 600, padding: 0 }
const box = { x: 103, y: 151, width: 100, height: 80, zIndex: 1 }
test('guides snap edges and centers to closest peer inside threshold', () => {
  const result = alignmentGuidesV3(box, [{ ...box, x: 100, y: 150 }], bounds)
  assert.equal(result.position.x, 100); assert.equal(result.position.y, 150)
  assert.ok(result.x !== undefined); assert.ok(result.y !== undefined)
  const far = alignmentGuidesV3({ ...box, x: 120, y: 170 }, [{ ...box, x: 100, y: 150 }], bounds)
  assert.equal(far.position.x, 120); assert.equal(far.x, undefined)
})
test('guides align to canvas center and keep bounds', () => {
  const center = alignmentGuidesV3({ ...box, x: 353, y: 257 }, [], bounds)
  assert.equal(center.position.x, 350); assert.equal(center.x, 400)
  const edge = alignmentGuidesV3({ ...box, x: 704, y: 522 }, [], bounds)
  assert.equal(edge.position.x, 700); assert.equal(edge.position.y, 520)
  assert.equal(edge.x, 800); assert.equal(edge.y, 600)
})
