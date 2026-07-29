import type { ParameterDefinitionV3 } from '../models/parameters.ts'

export interface SystemParameterTemplateV3 {
  code: string
  name: string
  description: string
  definition: Omit<ParameterDefinitionV3, 'id'>
}

export const SYSTEM_PARAMETER_TEMPLATES_V3: SystemParameterTemplateV3[] = [
  {
    code: 'year_code',
    name: '年度',
    description: '引用内置年度字典，不加载业务数据集。',
    definition: {
      code: 'year_code',
      name: '年度',
      type: 'singleSelect',
      scope: 'application',
      required: false,
      source: { kind: 'dictionary', dictionaryCode: 'builtin.year' },
      validation: { allowEmpty: true },
      aliases: [],
    },
  },
  {
    code: 'month_code',
    name: '月份',
    description: '引用内置月份字典，不加载业务数据集。',
    definition: {
      code: 'month_code',
      name: '月份',
      type: 'singleSelect',
      scope: 'application',
      required: false,
      source: { kind: 'dictionary', dictionaryCode: 'builtin.month' },
      validation: { allowEmpty: true },
      aliases: [],
    },
  },
  {
    code: 'b_date',
    name: '开始日期',
    description: '创建受控系统日期定义，运行值留待 Phase8。',
    definition: {
      code: 'b_date',
      name: '开始日期',
      type: 'date',
      scope: 'application',
      required: false,
      source: { kind: 'system', systemCode: 'currentDate' },
      validation: { allowEmpty: true },
      aliases: [],
    },
  },
  {
    code: 'e_date',
    name: '结束日期',
    description: '创建受控系统日期定义，运行值留待 Phase8。',
    definition: {
      code: 'e_date',
      name: '结束日期',
      type: 'date',
      scope: 'application',
      required: false,
      source: { kind: 'system', systemCode: 'currentDate' },
      validation: { allowEmpty: true },
      aliases: [],
    },
  },
  {
    code: 'code_lv1',
    name: '一级机构',
    description: '只创建参数定义，不加载真实机构选项。',
    definition: {
      code: 'code_lv1',
      name: '一级机构',
      type: 'singleSelect',
      scope: 'application',
      required: false,
      source: { kind: 'static', options: [] },
      validation: { allowEmpty: true },
      aliases: [],
    },
  },
  {
    code: 'code_lv2',
    name: '二级机构',
    description: '只创建参数定义，不加载真实机构选项。',
    definition: {
      code: 'code_lv2',
      name: '二级机构',
      type: 'singleSelect',
      scope: 'application',
      required: false,
      source: { kind: 'static', options: [] },
      validation: { allowEmpty: true },
      aliases: [],
    },
  },
  {
    code: 'doctor_code',
    name: '医生',
    description: '只创建参数定义，不加载真实医生选项。',
    definition: {
      code: 'doctor_code',
      name: '医生',
      type: 'singleSelect',
      scope: 'application',
      required: false,
      source: { kind: 'static', options: [] },
      validation: { allowEmpty: true },
      aliases: [],
    },
  },
  {
    code: 'flag',
    name: '标识',
    description: '通用字符串标识参数。',
    definition: {
      code: 'flag',
      name: '标识',
      type: 'string',
      scope: 'application',
      required: false,
      source: { kind: 'static', options: [] },
      validation: { allowEmpty: true },
      aliases: [],
    },
  },
]

export function findSystemParameterTemplateV3(code: string): SystemParameterTemplateV3 | undefined {
  return SYSTEM_PARAMETER_TEMPLATES_V3.find((template) => template.code === code)
}
