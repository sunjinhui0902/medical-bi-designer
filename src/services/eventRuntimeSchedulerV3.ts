import type { EventClockV3 } from './eventRuntimeTypesV3.ts'

type TaskState = 'queued' | 'in-flight' | 'effects-finished' | 'completing'
interface Task<T> {
  applicationId: string
  run: (signal: AbortSignal, effectsFinished: (value: T) => void) => Promise<T>
  controller: AbortController
  cancelled: () => T
  rejected: (reason: unknown) => T
  tooLate: (value: T) => T
  resolve: (value: T) => void
  settled: boolean
  state: TaskState
  effectsValue?: T
  onLate?: (value?: T, reason?: unknown) => void
}

export class ApplicationEventSchedulerV3 {
  private queues = new Map<string, Task<unknown>[]>()
  private active = new Map<string, Task<unknown>>()
  private tasks = new Set<Task<unknown>>()
  schedule<T>(applicationId: string, run: (signal: AbortSignal, effectsFinished: (value: T) => void) => Promise<T>, cancelled: () => T, rejected: (reason: unknown) => T, onLate?: (value?: T, reason?: unknown) => void, externalSignal?: AbortSignal, tooLate: (value: T) => T = (value) => value): Promise<T> {
    return new Promise<T>((resolve) => {
      if (externalSignal?.aborted) { resolve(cancelled()); return }
      const task: Task<T> = { applicationId, run, controller: new AbortController(), cancelled, rejected, tooLate, resolve, settled: false, state: 'queued', onLate }
      this.tasks.add(task as Task<unknown>)
      const abort = () => this.cancel(task)
      externalSignal?.addEventListener('abort', abort, { once: true })
      ;(task as Task<T> & { cleanup?: () => void }).cleanup = () => externalSignal?.removeEventListener('abort', abort)
      const queue = this.queues.get(applicationId) ?? []
      queue.push(task as Task<unknown>); this.queues.set(applicationId, queue)
      this.pump(applicationId)
    })
  }
  cancelAll(): void { for (const task of [...this.tasks]) this.cancel(task) }
  private cancel<T>(task: Task<T>): void {
    if (!this.tasks.has(task as Task<unknown>)) return
    if (task.state === 'effects-finished' && task.effectsValue !== undefined) {
      task.state = 'completing'; task.settled = true; task.resolve(task.tooLate(task.effectsValue)); return
    }
    task.controller.abort()
    if (!task.settled) { task.settled = true; task.resolve(task.cancelled()) }
    if (task.state === 'queued') {
      const queue = this.queues.get(task.applicationId); if (queue) this.queues.set(task.applicationId, queue.filter((item) => item !== task))
      this.finish(task as Task<unknown>)
    }
  }
  private pump(applicationId: string): void {
    if (this.active.has(applicationId)) return
    const task = this.queues.get(applicationId)?.shift()
    if (!task) return
    task.state = 'in-flight'; this.active.set(applicationId, task)
    const effectsFinished = (value: unknown) => { if (!task.settled) { task.effectsValue = value; task.state = 'effects-finished' } }
    let execution: Promise<unknown>
    try { execution = Promise.resolve(task.run(task.controller.signal, effectsFinished)) } catch (reason) { execution = Promise.reject(reason) }
    void execution.then((value) => {
      if (task.settled) { if (task.state !== 'completing') task.onLate?.(value) }
      else { task.state = 'completing'; task.settled = true; task.resolve(value) }
    }, (reason) => {
      const value = task.rejected(reason)
      if (task.settled) task.onLate?.(undefined, reason)
      else { task.state = 'completing'; task.settled = true; task.resolve(value) }
    }).finally(() => { this.active.delete(applicationId); this.finish(task); this.pump(applicationId) })
  }
  private finish(task: Task<unknown>): void { try { (task as Task<unknown> & { cleanup?: () => void }).cleanup?.() } catch { /* cleanup cannot block the queue */ } this.tasks.delete(task) }
}

export const systemEventClockV3: EventClockV3 = { now: () => Date.now(), setTimeout: (callback, delay) => globalThis.setTimeout(callback, delay), clearTimeout: (handle) => globalThis.clearTimeout(handle as number) }
