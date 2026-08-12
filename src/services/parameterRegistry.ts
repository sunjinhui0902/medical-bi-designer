import {
  findSystemParameterTemplateV3,
  type SystemParameterTemplateV3,
} from '../data/systemParameters.ts'
import type { ParameterDefinitionV3 } from '../models/parameters.ts'
import {
  validateParameterCollectionV3,
  validateParameterDefinitionV3,
  type ParameterValidationIssueV3,
} from './parameterValidation.ts'

export type ParameterIdFactoryV3 = () => string

export class ParameterRegistryErrorV3 extends Error {
  readonly issues: ParameterValidationIssueV3[]

  constructor(
    message: string,
    issues: ParameterValidationIssueV3[],
  ) {
    super(message)
    this.name = 'ParameterRegistryErrorV3'
    this.issues = issues
  }
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function defaultIdFactory(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `parameter-${crypto.randomUUID()}`
  }
  return `parameter-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function uniqueCopyCode(baseCode: string, parameters: ParameterDefinitionV3[]): string {
  let candidate = `${baseCode}_copy`
  let sequence = 2
  const codes = new Set(parameters.map((parameter) => parameter.code))
  while (codes.has(candidate)) {
    candidate = `${baseCode}_copy${sequence}`
    sequence += 1
  }
  return candidate
}

export class ParameterRegistryV3 {
  private parameters: ParameterDefinitionV3[]

  private readonly idFactory: ParameterIdFactoryV3
  constructor(
    initial: ParameterDefinitionV3[] = [],
    idFactory: ParameterIdFactoryV3 = defaultIdFactory,
  ) {
    this.idFactory = idFactory
    const cloned = cloneJson(initial)
    const validation = validateParameterCollectionV3(cloned)
    if (!validation.valid) {
      throw new ParameterRegistryErrorV3('初始参数集合无效', validation.issues)
    }
    this.parameters = cloned
  }

  list(search = ''): ParameterDefinitionV3[] {
    const keyword = search.trim().toLocaleLowerCase()
    const result = keyword
      ? this.parameters.filter((parameter) =>
        parameter.code.toLocaleLowerCase().includes(keyword)
        || parameter.name.toLocaleLowerCase().includes(keyword)
        || (parameter.aliases || []).some((alias) => alias.toLocaleLowerCase().includes(keyword)))
      : this.parameters
    return cloneJson(result)
  }

  get(id: string): ParameterDefinitionV3 | undefined {
    const parameter = this.parameters.find((item) => item.id === id)
    return parameter ? cloneJson(parameter) : undefined
  }

  create(definition: Omit<ParameterDefinitionV3, 'id'> & { id?: string }): ParameterDefinitionV3 {
    const parameter: ParameterDefinitionV3 = {
      ...cloneJson(definition),
      id: definition.id?.trim() || this.idFactory(),
    }
    this.assertValid(parameter)
    this.parameters.push(parameter)
    return cloneJson(parameter)
  }

  update(
    id: string,
    changes: Partial<Omit<ParameterDefinitionV3, 'id'>>,
  ): ParameterDefinitionV3 {
    const index = this.parameters.findIndex((parameter) => parameter.id === id)
    if (index < 0) throw new Error(`参数不存在：${id}`)

    const updated: ParameterDefinitionV3 = {
      ...this.parameters[index],
      ...cloneJson(changes),
      id,
    }
    this.assertValid(updated, id)
    this.parameters[index] = updated
    return cloneJson(updated)
  }

  copy(
    id: string,
    overrides: Partial<Omit<ParameterDefinitionV3, 'id'>> = {},
  ): ParameterDefinitionV3 {
    const source = this.parameters.find((parameter) => parameter.id === id)
    if (!source) throw new Error(`参数不存在：${id}`)

    return this.create({
      ...cloneJson(source),
      ...cloneJson(overrides),
      code: overrides.code || uniqueCopyCode(source.code, this.parameters),
      name: overrides.name || `${source.name} 副本`,
      id: this.idFactory(),
    })
  }

  remove(id: string): boolean {
    const index = this.parameters.findIndex((parameter) => parameter.id === id)
    if (index < 0) return false
    this.parameters.splice(index, 1)
    return true
  }

  createFromTemplate(
    templateCode: string,
    overrides: Partial<Omit<ParameterDefinitionV3, 'id'>> = {},
  ): ParameterDefinitionV3 {
    const template = findSystemParameterTemplateV3(templateCode)
    if (!template) throw new Error(`系统参数模板不存在：${templateCode}`)
    return this.createFromResolvedTemplate(template, overrides)
  }

  replaceAll(parameters: ParameterDefinitionV3[]): void {
    const cloned = cloneJson(parameters)
    const validation = validateParameterCollectionV3(cloned)
    if (!validation.valid) {
      throw new ParameterRegistryErrorV3('参数集合无效', validation.issues)
    }
    this.parameters = cloned
  }

  toJSON(): ParameterDefinitionV3[] {
    return cloneJson(this.parameters)
  }

  private createFromResolvedTemplate(
    template: SystemParameterTemplateV3,
    overrides: Partial<Omit<ParameterDefinitionV3, 'id'>>,
  ): ParameterDefinitionV3 {
    return this.create({
      ...cloneJson(template.definition),
      ...cloneJson(overrides),
      id: this.idFactory(),
    })
  }

  private assertValid(
    parameter: ParameterDefinitionV3,
    currentId?: string,
  ): void {
    if (this.parameters.some((item) => item.id === parameter.id && item.id !== currentId)) {
      throw new ParameterRegistryErrorV3('参数 ID 重复', [{
        path: '/id',
        code: 'duplicateId',
        message: '参数 ID 在同一应用内不能重复',
      }])
    }

    const validation = validateParameterDefinitionV3(parameter, this.parameters)
    if (!validation.valid) {
      throw new ParameterRegistryErrorV3('参数定义无效', validation.issues)
    }
  }
}
