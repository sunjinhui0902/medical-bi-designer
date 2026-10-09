export interface QueryRuntimeCacheOptionsV3 {
  ttlMs?: number
  maxEntries?: number
  now?: () => number
}

export interface QueryRuntimeResultV3<T> {
  value: T
  source: 'network' | 'cache' | 'merged'
}

interface PendingQueryV3<T> {
  promise: Promise<T>
  controller: AbortController
  waiters: Set<symbol>
  settled: boolean
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue)
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]))
  }
  return value
}

export function createQueryRuntimeKeyV3(
  datasetId: string,
  parameters: Record<string, unknown>,
  limit: number,
  view?: unknown,
): string {
  return JSON.stringify(stableValue({ datasetId, parameters, limit, ...(view === undefined ? {} : { view }) }))
}

export class QueryRuntimeCacheV3<T> {
  private readonly ttlMs: number
  private readonly maxEntries: number
  private readonly now: () => number
  private readonly cache = new Map<string, { value: T; expiresAt: number }>()
  private readonly inFlight = new Map<string, PendingQueryV3<T>>()
  private readonly latest = new Map<string, PendingQueryV3<T>>()
  private generation = 0

  constructor(options: QueryRuntimeCacheOptionsV3 = {}) {
    this.ttlMs = Math.max(1, options.ttlMs ?? 15_000)
    this.maxEntries = Math.max(1, options.maxEntries ?? 50)
    this.now = options.now ?? Date.now
  }

  async execute(key: string, loader: (signal: AbortSignal) => Promise<T>, force = false, signal?: AbortSignal): Promise<QueryRuntimeResultV3<T>> {
    if (signal?.aborted) throw new Error('refresh waiter cancelled')
    if (!force) {
      const cached = this.cache.get(key)
      if (cached && cached.expiresAt > this.now()) {
        this.cache.delete(key)
        this.cache.set(key, cached)
        return { value: structuredClone(cached.value), source: 'cache' }
      }
      if (cached) this.cache.delete(key)
      const running = this.inFlight.get(key)
      if (running && !running.controller.signal.aborted) return { value: await this.waitFor(key, running, signal), source: 'merged' }
    }

    const controller = new AbortController(), generation = this.generation
    let request: Promise<T>
    try { request = loader(controller.signal) } catch (reason) { request = Promise.reject(reason) }
    const entry: PendingQueryV3<T> = { promise: request, controller, waiters: new Set(), settled: false }
    this.latest.set(key, entry)
    if (!force) this.inFlight.set(key, entry)
    entry.promise = request.then(value => {
      if (controller.signal.aborted) throw new Error('query cancelled before cache write')
      if (generation === this.generation && this.latest.get(key) === entry) {
        this.cache.set(key, { value: structuredClone(value), expiresAt: this.now() + this.ttlMs })
        while (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value!)
      }
      return value
    }).finally(() => {
      entry.settled = true
      if (this.inFlight.get(key) === entry) this.inFlight.delete(key)
      if (this.latest.get(key) === entry) this.latest.delete(key)
    })
    return { value: await this.waitFor(key, entry, signal), source: 'network' }
  }

  private waitFor(key: string, entry: PendingQueryV3<T>, signal?: AbortSignal): Promise<T> {
    const waiter = Symbol('query-reader')
    entry.waiters.add(waiter)
    return new Promise((resolve, reject) => {
      let finished = false
      const leave = () => { signal?.removeEventListener('abort', abort); entry.waiters.delete(waiter) }
      const abort = () => {
        if (finished) return
        finished = true; leave()
        if (!entry.settled && !entry.waiters.size) {
          if (this.inFlight.get(key) === entry) this.inFlight.delete(key)
          if (this.latest.get(key) === entry) this.latest.delete(key)
          entry.controller.abort()
        }
        reject(new Error('refresh waiter cancelled'))
      }
      entry.promise.then(value => {
        if (finished) return
        finished = true; leave(); resolve(structuredClone(value))
      }, reason => {
        if (finished) return
        finished = true; leave(); reject(reason)
      })
      signal?.addEventListener('abort', abort, { once: true })
      if (signal?.aborted) abort()
    })
  }

  clear(): void {
    this.cache.clear()
    this.generation++
    this.inFlight.clear()
    this.latest.clear()
  }

  get size(): number {
    return this.cache.size
  }
}
