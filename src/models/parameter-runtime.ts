export type ParameterRuntimeValueSourceV3 = 'default' | 'control' | 'system'

export interface ParameterRuntimeStateV3 {
  values: Record<string, unknown>
  source: Record<string, ParameterRuntimeValueSourceV3>
  updatedAt: Record<string, number>
  transactionId: string
}

export interface ParameterRuntimeAssignmentV3 {
  parameterId: string
  value: unknown
}

export interface ParameterRuntimeCommitV3 {
  changed: boolean
  changedParameterIds: string[]
  state: ParameterRuntimeStateV3
}
