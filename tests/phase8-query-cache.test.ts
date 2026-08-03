import assert from 'node:assert/strict'
import test from 'node:test'

import { createQueryRuntimeKeyV3, QueryRuntimeCacheV3 } from '../src/services/queryRuntimeCacheV3.ts'

test('查询键规范化参数顺序并区分参数、限制和视图', () => {
  const left = createQueryRuntimeKeyV3('d1', { year: '2026', dept: ['A'] }, 100, { dimensions: [0] })
  const reordered = createQueryRuntimeKeyV3('d1', { dept: ['A'], year: '2026' }, 100, { dimensions: [0] })
  assert.equal(left, reordered)
  assert.notEqual(left, createQueryRuntimeKeyV3('d1', { year: '2025', dept: ['A'] }, 100, { dimensions: [0] }))
  assert.notEqual(left, createQueryRuntimeKeyV3('d1', { year: '2026', dept: ['A'] }, 10, { dimensions: [0] }))
})

test('同键并发请求只执行一次并返回独立结果', async () => {
  const cache = new QueryRuntimeCacheV3<{ rows: number[] }>()
  let calls = 0
  let resolve!: (value: { rows: number[] }) => void
  const loader = () => { calls += 1; return new Promise<{ rows: number[] }>((done) => { resolve = done }) }
  const first = cache.execute('same', loader)
  const second = cache.execute('same', loader)
  resolve({ rows: [1] })
  const [a, b] = await Promise.all([first, second])
  assert.equal(calls, 1)
  assert.equal(a.source, 'network')
  assert.equal(b.source, 'merged')
  a.value.rows.push(2)
  assert.deepEqual(b.value.rows, [1])
})

test('成功结果按 TTL 缓存，过期后重新加载', async () => {
  let now = 100
  let calls = 0
  const cache = new QueryRuntimeCacheV3<number>({ ttlMs: 10, now: () => now })
  const loader = async () => ++calls
  assert.deepEqual(await cache.execute('a', loader), { value: 1, source: 'network' })
  assert.deepEqual(await cache.execute('a', loader), { value: 1, source: 'cache' })
  now = 111
  assert.deepEqual(await cache.execute('a', loader), { value: 2, source: 'network' })
})

test('失败不缓存，强制刷新绕过有效缓存', async () => {
  const cache = new QueryRuntimeCacheV3<number>()
  let calls = 0
  await assert.rejects(cache.execute('bad', async () => { calls += 1; throw new Error('failed') }), /failed/)
  assert.deepEqual(await cache.execute('bad', async () => ++calls), { value: 2, source: 'network' })
  assert.deepEqual(await cache.execute('bad', async () => ++calls, true), { value: 3, source: 'network' })
})

test('缓存容量有界并淘汰最久未使用项', async () => {
  const cache = new QueryRuntimeCacheV3<number>({ maxEntries: 2 })
  await cache.execute('a', async () => 1)
  await cache.execute('b', async () => 2)
  await cache.execute('a', async () => 9)
  await cache.execute('c', async () => 3)
  assert.equal(cache.size, 2)
  assert.deepEqual(await cache.execute('b', async () => 4), { value: 4, source: 'network' })
})
