import test from 'node:test'
import assert from 'node:assert/strict'
import { createComponentQueryRefreshV3 } from '../src/services/componentQueryRefreshV3.ts'
import { QueryRuntimeCacheV3 } from '../src/services/queryRuntimeCacheV3.ts'
import type { DashboardComponent } from '../src/models/dashboard.ts'

const component: DashboardComponent = { id: 'directory', title: 'directory', type: 'table', position: { x: 0, y: 0, width: 500, height: 300, zIndex: 1 }, styleConfig: { background: '#fff', titleColor: '#000', titleSize: 14, titleWeight: 500, titleVisible: true }, dataConfig: { version: 3, sourceKind: 'server', datasetId: 'local-fixture', dimensions: [], measures: [], filters: [], sort: [], limit: 20, parameterBindings: [], refreshPolicy: 'onPageEnter' } }

test('normal query cancellation leaves a merged live reader connected', async () => {
  let release!: () => void, sharedSignal!: AbortSignal
  const runtime = createComponentQueryRefreshV3({ cache: new QueryRuntimeCacheV3<number>(), load({ signal }) {
    sharedSignal = signal
    return new Promise<number>((resolve, reject) => {
      release = () => resolve(20)
      signal.addEventListener('abort', () => reject(new DOMException('cancelled', 'AbortError')), { once: true })
    })
  } })
  const firstController = new AbortController(), secondController = new AbortController()
  const descriptor = runtime.describe(component, {})!
  const first = runtime.execute(descriptor, false, firstController.signal), second = runtime.execute(descriptor, false, secondController.signal)
  const results = Promise.allSettled([first, second])
  firstController.abort()
  const cancelledUnderlying = sharedSignal.aborted
  release()
  const [a, b] = await results
  assert.equal(a.status, 'rejected')
  assert.equal(cancelledUnderlying, false, 'a live merged reader must keep the shared transport alive')
  assert.equal(b.status, 'fulfilled')
})

test('last normal reader cancellation prevents an ignored abort from writing an empty cache entry', async () => {
  const cache = new QueryRuntimeCacheV3<{ rows: number[] }>()
  let release!: () => void
  const runtime = createComponentQueryRefreshV3({ cache, load: async () => {
    await new Promise<void>(resolve => { release = resolve })
    return { rows: [] } // Simulates a transport that completes after cancellation.
  } })
  const controller = new AbortController(), query = runtime.execute(runtime.describe(component, {})!, false, controller.signal)
  const result = Promise.allSettled([query])
  controller.abort(); release(); await result
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal(cache.size, 0)
})

test('clearing cache prevents an earlier request from overwriting a fresh result', async () => {
  const cache = new QueryRuntimeCacheV3<number>()
  let release!: (value: number) => void
  const old = cache.execute('directory', () => new Promise<number>(resolve => { release = resolve }))
  cache.clear()
  const fresh = cache.execute('directory', async () => 20, true)
  await fresh; release(0); await old
  assert.equal((await cache.execute('directory', async () => 99)).value, 20)
})

test('a returning reader starts a new request instead of merging the cancelled request', async () => {
  const cache = new QueryRuntimeCacheV3<number>()
  let release!: (value: number) => void, oldSignal!: AbortSignal
  const controller = new AbortController()
  const old = cache.execute('directory', signal => {
    oldSignal = signal
    return new Promise<number>(resolve => { release = resolve })
  }, false, controller.signal)
  const cancelled = assert.rejects(old, /cancelled/)
  controller.abort()
  const fresh = await cache.execute('directory', async () => 20)
  assert.equal(oldSignal.aborted, true)
  assert.equal(fresh.source, 'network')
  release(0)
  await cancelled
  await new Promise<void>(resolve => setImmediate(resolve))
  assert.equal((await cache.execute('directory', async () => 99)).value, 20)
})

test('a slow normal query cannot overwrite a newer forced refresh in the cache', async () => {
  const cache = new QueryRuntimeCacheV3<number>()
  let release!: (value: number) => void
  const old = cache.execute('directory', () => new Promise<number>(resolve => { release = resolve }))
  assert.equal((await cache.execute('directory', async () => 20, true)).value, 20)
  release(0)
  assert.equal((await old).value, 0)
  assert.equal((await cache.execute('directory', async () => 99)).value, 20)
})
