import type { DashboardComponent } from '../models/dashboard.ts'

export interface ParameterDependencyGraphV3 {
  componentIdsByParameterId: Map<string, Set<string>>
}

export function buildParameterDependencyGraphV3(components: DashboardComponent[]): ParameterDependencyGraphV3 {
  const componentIdsByParameterId = new Map<string, Set<string>>()
  for (const component of components) {
    if (component.dataConfig.version !== 3) continue
    for (const binding of component.dataConfig.parameterBindings) {
      const ids = componentIdsByParameterId.get(binding.parameterId) ?? new Set<string>()
      ids.add(component.id)
      componentIdsByParameterId.set(binding.parameterId, ids)
    }
  }
  return { componentIdsByParameterId }
}

export function componentsAffectedByParameterCommitV3(
  components: DashboardComponent[],
  changedParameterIds: string[],
): DashboardComponent[] {
  if (!changedParameterIds.length) return []
  const graph = buildParameterDependencyGraphV3(components)
  const affectedIds = new Set(changedParameterIds.flatMap((id) => [...(graph.componentIdsByParameterId.get(id) ?? [])]))
  return components.filter((component) =>
    affectedIds.has(component.id)
    && component.dataConfig.version === 3
    && component.dataConfig.refreshPolicy === 'onParameterChange')
}

export function componentsForPageEnterV3(components: DashboardComponent[]): DashboardComponent[] {
  return components.filter((component) =>
    component.dataConfig.version !== 3 || component.dataConfig.refreshPolicy !== 'manual')
}

export function resolveDatasetParameterValuesV3(
  component: DashboardComponent,
  runtimeValues: Record<string, unknown>,
): Record<string, unknown> {
  if (component.dataConfig.version !== 3) return {}
  return Object.fromEntries(component.dataConfig.parameterBindings
    .filter((binding) => Object.hasOwn(runtimeValues, binding.parameterId))
    .map((binding) => [binding.datasetParameterCode, structuredClone(runtimeValues[binding.parameterId])]))
}
