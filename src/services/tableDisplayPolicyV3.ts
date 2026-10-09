import type { DashboardComponent } from '../models/dashboard.ts'
import { resolveDatasetParameterValuesV3 } from './parameterRefreshV3.ts'

export function tableQueryScopeV3(component: DashboardComponent, parameters: Record<string, unknown>, refreshVersion = 0) {
  const scoped = resolveDatasetParameterValuesV3(component, parameters)
  return JSON.stringify({ datasetId: component.dataConfig.datasetId, parameters: scoped, refreshVersion })
}
export function tableDisplayPolicyV3(component: DashboardComponent, rowCount: number) {
  const requested = component.tableConfig?.pagination
  const protectedLargeTable = requested?.enabled === false && rowCount > 200
  const value = requested?.pageSize ?? 20
  return { enabled: requested?.enabled !== false || protectedLargeTable, pageSize: Number.isSafeInteger(value) ? Math.min(200, Math.max(1, value)) : 20, protectedLargeTable }
}
