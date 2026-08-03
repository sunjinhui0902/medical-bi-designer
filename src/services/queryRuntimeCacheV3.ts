export interface QueryRuntimeCacheOptionsV3 {
  ttlMs?: number
  maxEntries?: number
  now?: () => number
}

export interface QueryRuntimeResultV3<T> {
  value: T
  source: 'network' | 'cache' | 'merged'
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
  private readonly inFlight = new Map<string, Promise<T>>()

  constructor(options: QueryRuntimeCacheOptionsV3 = {}) {
    this.ttlMs = Math.max(1, options.ttlMs ?? 15_000)
    this.maxEntries = Math.max(1, options.maxEntries ?? 50)
    this.now = options.now ?? Date.now
  }

  async execute(key: string, loader: () => Promise<T>, force = false): Promise<QueryRuntimeResultV3<T>> {
    if (!force) {
      const cached = this.cache.get(key)
      if (cached && cached.expiresAt > this.now()) {
        this.cache.delete(key)
        this.cache.set(key, cached)
        return { value: structuredClone(cached.value), source: 'cache' }
      }
      if (cached) this.cache.delete(key)
      const running = this.inFlight.get(key)
      if (running) return { value: structuredClone(await running), source: 'merged' }
    }

    const request = loader()
    if (!force) this.inFlight.set(key, request)
    try {
      const value = await request
      this.cache.set(key, { value: structuredClone(value), expiresAt: this.now() + this.ttlMs })
      while (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value!)
      return { value: structuredClone(value), source: 'network' }
    } finally {
      if (!force && this.inFlight.get(key) === request) this.inFlight.delete(key)
    }
  }

  clear(): void {
    this.cache.clear()
  }

  get size(): number {
    return this.cache.size
  }
}
