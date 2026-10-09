import test from 'node:test'
import assert from 'node:assert/strict'
import type { DashboardComponent } from '../src/models/dashboard.ts'
import { responsiveLayoutV3 } from '../src/services/responsiveLayoutV3.ts'
test('mobile KPI grid uses two columns, wider screens three, and keeps cards inside canvas', () => {
  const cards = Array.from({length:6},(_,i)=>({id:`kpi-${i}`,type:'kpi',position:{x:i*210,y:0,width:200,height:160,zIndex:i+1}} as DashboardComponent))
  for (const width of [320,390,768]) {
    const layout=responsiveLayoutV3(cards,width), first=layout.positions['kpi-0']!, second=layout.positions['kpi-1']!
    assert.equal(first.y,second.y);assert.ok(second.x>first.x+first.width)
    for(const position of Object.values(layout.positions))assert.ok(position.x+position.width<=width-12+.01)
    const next=layout.positions[`kpi-${width>=600?3:2}`]!
    assert.ok(next.y>first.y+first.height)
  }
})
