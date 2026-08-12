import type { JsonValueV3 } from '../models/dashboard-v3.ts'
import type { DashboardComponent } from '../models/dashboard.ts'
import { createQueryRuntimeKeyV3, type QueryRuntimeCacheV3 } from './queryRuntimeCacheV3.ts'
import { resolveDatasetParameterValuesV3 } from './parameterRefreshV3.ts'

export interface ComponentQueryDescriptorV3 {
  component: DashboardComponent
  componentId: string
  datasetId: string
  parameters: Record<string, unknown>
  limit: number
  view?: unknown
  queryKey: string
}
export interface ComponentQueryLoadRequestV3 extends ComponentQueryDescriptorV3 { signal: AbortSignal }
export interface ComponentQueryResolvedV3<T> { descriptor: ComponentQueryDescriptorV3; value: T; source: 'network' | 'cache' | 'merged' }
export interface ComponentQueryRefreshRuntimeV3 { describe(component: DashboardComponent, values: Readonly<Record<string, JsonValueV3>>): ComponentQueryDescriptorV3 | undefined; execute(descriptor: ComponentQueryDescriptorV3, force: boolean, signal: AbortSignal): Promise<{ queryKey: string; source: 'network' | 'cache' | 'merged' }> }

export function isQueryableServerComponentV3(component: DashboardComponent): boolean {
  const config = component.dataConfig
  return config.version === 3 && config.sourceKind === 'server' && typeof config.datasetId === 'string' && Boolean(config.datasetId.trim()) && Number.isInteger(config.limit) && config.limit > 0
}

export function createComponentQueryRefreshV3<T>(options: {
  cache: QueryRuntimeCacheV3<T>
  load(request: ComponentQueryLoadRequestV3): Promise<T>
  resolveView?(component: DashboardComponent): unknown
  onResolved?(result: ComponentQueryResolvedV3<T>): void | Promise<void>
}): ComponentQueryRefreshRuntimeV3 {
  interface QueryResult { value: T; source: 'network' | 'cache' | 'merged' }
  interface ForcedEntry { queryKey: string; promise: Promise<QueryResult>; controller: AbortController; waiters: Set<symbol>; settled: boolean; mergeable: boolean }
  const forcedInFlight = new Map<string, ForcedEntry>()
  const waitFor = <V>(entry: ForcedEntry, signal: AbortSignal): Promise<V> => {
    if (signal.aborted) return Promise.reject(new Error('refresh waiter cancelled'))
    const waiter = Symbol('forced-refresh-waiter'); entry.waiters.add(waiter)
    return new Promise((resolve, reject) => {
      const leave = (cancelled: boolean) => {
        signal.removeEventListener('abort', abort)
        if (!entry.waiters.delete(waiter)) return
        if (cancelled && !entry.settled && entry.waiters.size === 0) {
          entry.mergeable = false
          if (forcedInFlight.get(entry.queryKey) === entry) forcedInFlight.delete(entry.queryKey)
          entry.controller.abort()
        }
      }
      const abort = () => { leave(true); reject(new Error('refresh waiter cancelled')) }
      signal.addEventListener('abort', abort, { once: true })
      entry.promise.then((value) => { leave(false); resolve(value as V) }, (reason) => { leave(false); reject(reason) })
    })
  }
  return {
    describe(component, values) {
      if (!isQueryableServerComponentV3(component)) return undefined
      const datasetId = component.dataConfig.datasetId
      const parameters = resolveDatasetParameterValuesV3(component, values)
      const limit = component.dataConfig.limit
      const view = options.resolveView?.(component)
      return { component, componentId: component.id, datasetId, parameters, limit, ...(view === undefined ? {} : { view }), queryKey: createQueryRuntimeKeyV3(datasetId, parameters, limit, view) }
    },
    async execute(descriptor, force, signal) {
      const finish = async (result: QueryResult) => { if (signal.aborted) throw new Error('refresh waiter cancelled'); await options.onResolved?.({ descriptor, value: result.value, source: result.source }); return { queryKey: descriptor.queryKey, source: result.source } }
      if (!force) { const result = await options.cache.execute(descriptor.queryKey, () => options.load({ ...descriptor, signal }), false); return finish(result) }
      if (signal.aborted) throw new Error('refresh waiter cancelled')
      const running = forcedInFlight.get(descriptor.queryKey)
      if (running?.mergeable && !running.controller.signal.aborted) { const result = await waitFor<QueryResult>(running, signal); return finish({ value: result.value, source: 'merged' }) }
      if (running && forcedInFlight.get(descriptor.queryKey) === running) forcedInFlight.delete(descriptor.queryKey)
      const sharedController = new AbortController()
      const request = options.cache.execute(descriptor.queryKey, async () => { const value = await options.load({ ...descriptor, signal: sharedController.signal }); if (sharedController.signal.aborted) throw new Error('forced refresh cancelled before cache write'); return value }, true)
      const entry: ForcedEntry = { queryKey: descriptor.queryKey, promise: request, controller: sharedController, waiters: new Set(), settled: false, mergeable: true }
      forcedInFlight.set(descriptor.queryKey, entry)
      void request.then(() => { entry.settled = true; entry.mergeable = false; if (forcedInFlight.get(descriptor.queryKey) === entry) forcedInFlight.delete(descriptor.queryKey) }, () => { entry.settled = true; entry.mergeable = false; if (forcedInFlight.get(descriptor.queryKey) === entry) forcedInFlight.delete(descriptor.queryKey) })
      const result = await waitFor<QueryResult>(entry, signal); return finish(result)
    },
  }
}
