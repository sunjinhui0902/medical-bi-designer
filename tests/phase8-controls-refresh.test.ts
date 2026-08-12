import assert from 'node:assert/strict'
import test from 'node:test'

import type { DashboardComponent } from '../src/models/dashboard.ts'
import {
  buildParameterDependencyGraphV3,
  componentsAffectedByParameterCommitV3,
  componentsForPageEnterV3,
  resolveDatasetParameterValuesV3,
} from '../src/services/parameterRefreshV3.ts'

function component(id: string, policy: 'onParameterChange' | 'manual' | 'onPageEnter', parameterId = 'p-year'): DashboardComponent {
  return {
    id, type: 'table', title: id,
    position: { x: 0, y: 0, width: 100, height: 100, zIndex: 1 },
    dataConfig: {
      version: 3, sourceKind: 'server', datasetId: 'dataset-a', dimensions: [], measures: [], filters: [], sort: [], limit: 100,
      parameterBindings: [{ datasetParameterCode: 'year_code', parameterId }], refreshPolicy: policy,
    },
    styleConfig: { background: '#fff', borderColor: '#ddd', borderWidth: 1, borderRadius: 0, padding: 0, shadow: false, titleVisible: true, titleColor: '#000', titleSize: 12, titleWeight: 400 },
  }
}

test('依赖图按参数 ID 汇总组件并自动去重', () => {
  const graph = buildParameterDependencyGraphV3([component('a', 'onParameterChange'), component('b', 'manual')])
  assert.deepEqual([...graph.componentIdsByParameterId.get('p-year')!], ['a', 'b'])
})

test('参数事务只刷新绑定且策略为 onParameterChange 的组件', () => {
  const items = [component('auto', 'onParameterChange'), component('manual', 'manual'), component('enter', 'onPageEnter'), component('other', 'onParameterChange', 'p-dept')]
  assert.deepEqual(componentsAffectedByParameterCommitV3(items, ['p-year']).map((item) => item.id), ['auto'])
  assert.deepEqual(componentsAffectedByParameterCommitV3(items, []).map((item) => item.id), [])
})

test('首次进入加载自动与页面进入策略，跳过手动组件', () => {
  const items = [component('auto', 'onParameterChange'), component('manual', 'manual'), component('enter', 'onPageEnter')]
  assert.deepEqual(componentsForPageEnterV3(items).map((item) => item.id), ['auto', 'enter'])
})

test('组件只把自身绑定的运行值转换为数据集参数值', () => {
  const item = component('auto', 'onParameterChange')
  assert.deepEqual(resolveDatasetParameterValuesV3(item, { 'p-year': '2026', 'p-dept': ['A'] }), { year_code: '2026' })
})
