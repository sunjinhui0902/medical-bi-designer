import assert from 'node:assert/strict'
import test from 'node:test'
import { escapeTextToHtmlV3 } from '../src/services/safeHtmlV3.ts'

test('P0 map labels escape database text before Leaflet HTML rendering', () => {
  assert.equal(
    escapeTextToHtmlV3('<img src=x onerror="alert(1)"> & 东台\'医院'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; 东台&#39;医院',
  )
})
