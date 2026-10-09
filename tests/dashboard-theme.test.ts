import test from 'node:test'
import assert from 'node:assert/strict'
import { createDefaultDashboardApplicationV3, darkThemeTokensV3, lightThemeTokensV3 } from '../src/models/dashboard-v3.ts'
import { applyDashboardThemeV3 } from '../src/services/dashboardThemeV3.ts'

test('theme applies across native pages while preserving transparent layers and interactions', () => {
  const app = createDefaultDashboardApplicationV3()
  const first = app.pages[0]!
  first.components.push({ id:'card', title:'指标', type:'kpi', position:{x:10,y:10,width:200,height:120,zIndex:1}, groupId:'group', styleConfig:{background:'#ffffff',titleColor:'#000000',titleSize:14,titleWeight:600,titleVisible:true}, dataConfig:{version:3,sourceKind:'mock',datasetId:'fixture',dimensions:[],measures:[],filters:[],sort:[],limit:200,parameterBindings:[],refreshPolicy:'onPageEnter'} })
  const second = structuredClone(first); second.id = 'another'; second.type = 'dialog'
  app.pages.push(second)
  first.components[0]!.styleConfig.background = 'transparent'
  const content = app.pages.map(p => p.components.map(c => ({id:c.id,position:c.position,data:c.dataConfig,events:c.events,group:c.groupId})))
  applyDashboardThemeV3(app, 'dark')
  for (const page of app.pages) {
    assert.equal(page.canvas.background, darkThemeTokensV3.canvasBackground)
    assert.equal(page.titleStyle.color, darkThemeTokensV3.textPrimary)
    assert.ok(page.components.every(c => c.styleConfig.titleColor === darkThemeTokensV3.textPrimary))
  }
  assert.equal(first.components[0]!.styleConfig.background, 'transparent')
  assert.deepEqual(app.pages.map(p => p.components.map(c => ({id:c.id,position:c.position,data:c.dataConfig,events:c.events,group:c.groupId}))), content)
  applyDashboardThemeV3(app, 'light')
  assert.equal(second.components[0]!.styleConfig.background, lightThemeTokensV3.panelBackground)
  assert.equal(first.components[0]!.styleConfig.background, 'transparent')
  assert.equal(first.canvas.showGrid, false)
})
