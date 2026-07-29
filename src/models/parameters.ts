export const PARAMETER_TYPES = [
  'string',
  'number',
  'date',
  'dateRange',
  'singleSelect',
  'multiSelect',
] as const

export type ParameterTypeV3 = typeof PARAMETER_TYPES[number]
export type ParameterScopeV3 = 'application' | 'page'

export interface ParameterOptionV3 {
  label: string
  value: unknown
}

export type ParameterValueSourceV3 =
  | { kind: 'static'; options: ParameterOptionV3[] }
  | { kind: 'dictionary'; dictionaryCode: string }
  | { kind: 'system'; systemCode: string }

export interface ParameterValidationV3 {
  allowEmpty?: boolean
  min?: number
  max?: number
  pattern?: string
}

export interface ParameterDefinitionV3 {
  id: string
  code: string
  name: string
  type: ParameterTypeV3
  scope: ParameterScopeV3
  pageId?: string
  required: boolean
  defaultValue?: unknown
  source: ParameterValueSourceV3
  validation?: ParameterValidationV3
  aliases?: string[]
}
