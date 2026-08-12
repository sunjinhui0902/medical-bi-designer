import type { ParameterOptionV3 } from '../models/parameters.ts'

export interface BuiltinDictionaryV3 {
  code: string
  name: string
  options: ParameterOptionV3[]
}

export function createBuiltinDictionariesV3(referenceDate = new Date()): BuiltinDictionaryV3[] {
  const currentYear = referenceDate.getFullYear()
  const years = Array.from({ length: 8 }, (_, index) => currentYear + 1 - index)

  return [
    {
      code: 'builtin.year',
      name: '年度',
      options: years.map((year) => ({ label: `${year}年`, value: String(year) })),
    },
    {
      code: 'builtin.month',
      name: '月份',
      options: Array.from({ length: 12 }, (_, index) => {
        const month = String(index + 1).padStart(2, '0')
        return { label: `${index + 1}月`, value: month }
      }),
    },
    {
      code: 'builtin.dateShortcut',
      name: '日期快捷项',
      options: [
        { label: '今天', value: 'today' },
        { label: '昨天', value: 'yesterday' },
        { label: '本月', value: 'currentMonth' },
        { label: '上月', value: 'previousMonth' },
      ],
    },
  ]
}

export const BUILTIN_DICTIONARIES_V3 = createBuiltinDictionariesV3()

export function findBuiltinDictionaryV3(code: string): BuiltinDictionaryV3 | undefined {
  return BUILTIN_DICTIONARIES_V3.find((dictionary) => dictionary.code === code)
}
