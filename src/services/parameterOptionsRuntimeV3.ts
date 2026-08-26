import type { ParameterDefinitionV3, ParameterOptionV3 } from '../models/parameters.ts'

export interface ParameterOptionsRequestV3 {
  datasetId: string
  valueField: string
  labelField: string
  parameters: Record<string, unknown>
  signal: AbortSignal
}

export type ParameterOptionsLoaderV3 = (request: ParameterOptionsRequestV3) => Promise<ParameterOptionV3[]>

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/

export function buildParameterDependencyDagV3(definitions: readonly ParameterDefinitionV3[]) {
  const known = new Set(definitions.map((item) => item.id))
  if (known.size !== definitions.length) throw new Error('参数 ID 不能重复')
  const dependencies = new Map<string, string[]>()
  const dependents = new Map<string, string[]>()
  for (const definition of definitions) {
    const sourceDependencies = definition.source.kind === 'dataset' ? definition.source.dependencies ?? [] : []
    const ids = sourceDependencies.map((item) => item.parameterId)
    if (new Set(ids).size !== ids.length) throw new Error(`参数 ${definition.id} 的依赖不能重复`)
    const codes = sourceDependencies.map((item) => item.datasetParameterCode)
    if (new Set(codes).size !== codes.length || codes.some((code) => !CODE_PATTERN.test(code))) throw new Error(`参数 ${definition.id} 的数据集参数编码无效或重复`)
    for (const id of ids) {
      if (!known.has(id)) throw new Error(`参数 ${definition.id} 依赖不存在：${id}`)
      if (id === definition.id) throw new Error(`参数 ${definition.id} 不能依赖自身`)
      dependents.set(id, [...(dependents.get(id) ?? []), definition.id])
    }
    dependencies.set(definition.id, ids)
  }
  const visiting = new Set<string>(); const visited = new Set<string>(); const order: string[] = []
  const visit = (id: string) => {
    if (visiting.has(id)) throw new Error(`参数依赖存在循环：${id}`)
    if (visited.has(id)) return
    visiting.add(id)
    for (const dependency of dependencies.get(id) ?? []) visit(dependency)
    visiting.delete(id); visited.add(id); order.push(id)
  }
  for (const definition of definitions) visit(definition.id)
  return { dependencies, dependents, order }
}

export function dependentParameterIdsV3(dag: ReturnType<typeof buildParameterDependencyDagV3>, changedParameterIds: readonly string[]) {
  const affected = new Set<string>()
  const queue = [...changedParameterIds]
  while (queue.length) {
    const current = queue.shift()!
    for (const dependent of dag.dependents.get(current) ?? []) {
      if (affected.has(dependent)) continue
      affected.add(dependent); queue.push(dependent)
    }
  }
  return dag.order.filter((id) => affected.has(id))
}

export function reconcileParameterOptionValueV3(definition: ParameterDefinitionV3, currentValue: unknown, options: readonly ParameterOptionV3[]) {
  const allowed = new Set(options.map((item) => JSON.stringify(item.value)))
  if (definition.type === 'multiSelect') {
    const retained = Array.isArray(currentValue) ? currentValue.filter((item) => allowed.has(JSON.stringify(item))) : []
    const defaultValues = Array.isArray(definition.defaultValue) ? definition.defaultValue.filter((item) => allowed.has(JSON.stringify(item))) : []
    return retained.length ? retained : defaultValues.length ? defaultValues : undefined
  }
  const validDefault = definition.defaultValue !== undefined && allowed.has(JSON.stringify(definition.defaultValue)) ? definition.defaultValue : undefined
  return allowed.has(JSON.stringify(currentValue)) ? currentValue : validDefault
}

export function createHttpParameterOptionsLoaderV3(fetcher: typeof fetch = fetch): ParameterOptionsLoaderV3 {
  return async ({ datasetId, valueField, labelField, parameters, signal }) => {
    const response = await fetcher(`/api/datasets/${encodeURIComponent(datasetId)}/options`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, signal,
      body: JSON.stringify({ valueField, labelField, parameters, limit: 500 }),
    })
    const payload = await response.json().catch(() => ({})) as { options?: unknown; error?: unknown }
    if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : `选项加载失败（${response.status}）`)
    if (!Array.isArray(payload.options)) throw new Error('选项响应格式无效')
    return payload.options as ParameterOptionV3[]
  }
}

export class ParameterOptionsRuntimeV3 {
  readonly #definitions: Map<string, ParameterDefinitionV3>
  readonly #loader: ParameterOptionsLoaderV3
  readonly #sequence = new Map<string, number>()
  readonly #controllers = new Map<string, AbortController>()

  constructor(definitions: readonly ParameterDefinitionV3[], loader: ParameterOptionsLoaderV3) {
    buildParameterDependencyDagV3(definitions)
    this.#definitions = new Map(definitions.map((item) => [item.id, item]))
    this.#loader = loader
  }

  async load(parameterId: string, values: Readonly<Record<string, unknown>>) {
    const definition = this.#definitions.get(parameterId)
    if (!definition || definition.source.kind !== 'dataset') throw new Error(`参数不是数据集选项源：${parameterId}`)
    this.#controllers.get(parameterId)?.abort()
    const controller = new AbortController()
    this.#controllers.set(parameterId, controller)
    const sequence = (this.#sequence.get(parameterId) ?? 0) + 1
    this.#sequence.set(parameterId, sequence)
    const parameters = Object.fromEntries((definition.source.dependencies ?? []).map((item) => [item.datasetParameterCode, values[item.parameterId]]).filter(([, value]) => value !== undefined))
    try {
      const options = await this.#loader({ datasetId: definition.source.datasetId, valueField: definition.source.valueField, labelField: definition.source.labelField, parameters, signal: controller.signal })
      if (this.#sequence.get(parameterId) !== sequence) return { status: 'stale' as const, options: [] }
      const unique = new Map<string, ParameterOptionV3>()
      for (const item of options) {
        if (!item || typeof item.label !== 'string' || !['string', 'number', 'boolean'].includes(typeof item.value)) continue
        const key = JSON.stringify(item.value)
        if (!unique.has(key)) unique.set(key, { label: item.label, value: item.value })
      }
      const safe = [...unique.values()]
      return { status: 'ready' as const, options: safe }
    } catch (reason) {
      if (controller.signal.aborted || this.#sequence.get(parameterId) !== sequence) return { status: 'stale' as const, options: [] }
      return { status: 'error' as const, options: [], message: reason instanceof Error ? reason.message : '选项加载失败' }
    } finally {
      if (this.#sequence.get(parameterId) === sequence) this.#controllers.delete(parameterId)
    }
  }

  dispose() { for (const controller of this.#controllers.values()) controller.abort(); this.#controllers.clear() }
}
