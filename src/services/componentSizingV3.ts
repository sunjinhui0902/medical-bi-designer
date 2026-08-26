import type { DashboardComponent } from '../models/dashboard.ts'

export interface ComponentMinimumSizeV3 { width: number; height: number }

const PRODUCT_MINIMUM: ComponentMinimumSizeV3 = { width: 20, height: 20 }

/**
 * Product-level minimums protect interactive charts while allowing content and
 * decoration components to participate in precise cockpit layouts.
 */
export function componentMinimumSizeV3(component: Pick<DashboardComponent, 'type' | 'decorationConfig'>): ComponentMinimumSizeV3 {
  if (component.type === 'text' || component.type === 'image' || component.type === 'icon') return PRODUCT_MINIMUM
  if (component.type === 'decoration') {
    const vertical = component.decorationConfig?.direction === 'vertical'
    if (component.decorationConfig?.shape === 'line' || component.decorationConfig?.shape === 'divider') {
      return vertical ? { width: 1, height: 20 } : { width: 20, height: 1 }
    }
    return PRODUCT_MINIMUM
  }
  return PRODUCT_MINIMUM
}
