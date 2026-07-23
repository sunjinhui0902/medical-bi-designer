export interface DatasetField {
  name: string
  label: string
  type: 'string' | 'number'
}

export interface MockDataset {
  id: string
  name: string
  description: string
  fields: DatasetField[]
  rows: Array<Record<string, string | number>>
}

export const mockDatasets: MockDataset[] = [
  {
    id: 'income_month',
    name: '收入月度汇总',
    description: '按月份汇总的医院收入演示数据',
    fields: [
      { name: 'month_code', label: '月份', type: 'string' },
      { name: 'amount', label: '收入金额', type: 'number' },
    ],
    rows: [
      { month_code: '1月', amount: 840 },
      { month_code: '2月', amount: 960 },
      { month_code: '3月', amount: 910 },
      { month_code: '4月', amount: 1180 },
      { month_code: '5月', amount: 1260 },
      { month_code: '6月', amount: 1420 },
    ],
  },
  {
    id: 'op_visit_month',
    name: '门诊量月度趋势',
    description: '按月份汇总的门诊人次演示数据',
    fields: [
      { name: 'month_code', label: '月份', type: 'string' },
      { name: 'visit_count', label: '门诊人次', type: 'number' },
    ],
    rows: [
      { month_code: '1月', visit_count: 18420 },
      { month_code: '2月', visit_count: 19760 },
      { month_code: '3月', visit_count: 20110 },
      { month_code: '4月', visit_count: 21680 },
      { month_code: '5月', visit_count: 22450 },
      { month_code: '6月', visit_count: 24160 },
    ],
  },
  {
    id: 'dept_income_rank',
    name: '科室收入排名',
    description: '各科室收入排名演示数据',
    fields: [
      { name: 'dept_name', label: '科室', type: 'string' },
      { name: 'amount', label: '收入金额', type: 'number' },
    ],
    rows: [
      { dept_name: '心内科', amount: 1420 },
      { dept_name: '骨科', amount: 1260 },
      { dept_name: '普外科', amount: 1180 },
      { dept_name: '神经内科', amount: 960 },
      { dept_name: '儿科', amount: 840 },
    ],
  },
  {
    id: 'bed_usage',
    name: '床位利用率',
    description: '科室床位使用情况演示数据',
    fields: [
      { name: 'dept_name', label: '科室', type: 'string' },
      { name: 'usage_rate', label: '利用率', type: 'number' },
    ],
    rows: [
      { dept_name: '心内科', usage_rate: 94.2 },
      { dept_name: '骨科', usage_rate: 91.6 },
      { dept_name: '普外科', usage_rate: 89.4 },
      { dept_name: '神经内科', usage_rate: 87.8 },
      { dept_name: '儿科', usage_rate: 85.1 },
    ],
  },
]

export function getMockDataset(id: string) {
  return mockDatasets.find((dataset) => dataset.id === id) ?? mockDatasets[0]
}
