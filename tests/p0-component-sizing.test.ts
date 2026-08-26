import test from 'node:test'
import assert from 'node:assert/strict'
import { componentMinimumSizeV3 } from '../src/services/componentSizingV3.ts'

test('P0 ordinary components allow a 20 by 20 product minimum', () => {
  assert.deepEqual(componentMinimumSizeV3({ type: 'text' }), { width: 20, height: 20 })
  assert.deepEqual(componentMinimumSizeV3({ type: 'image' }), { width: 20, height: 20 })
  assert.deepEqual(componentMinimumSizeV3({ type: 'icon' }), { width: 20, height: 20 })
  assert.deepEqual(componentMinimumSizeV3({ type: 'bar' }), { width: 20, height: 20 })
  assert.deepEqual(componentMinimumSizeV3({ type: 'table' }), { width: 20, height: 20 })
  assert.deepEqual(componentMinimumSizeV3({ type: 'map' }), { width: 20, height: 20 })
})

test('P0 line decorations can be one pixel on the thickness axis', () => {
  assert.deepEqual(componentMinimumSizeV3({ type: 'decoration', decorationConfig: { shape: 'line', direction: 'horizontal' } as never }), { width: 20, height: 1 })
  assert.deepEqual(componentMinimumSizeV3({ type: 'decoration', decorationConfig: { shape: 'divider', direction: 'vertical' } as never }), { width: 1, height: 20 })
})
