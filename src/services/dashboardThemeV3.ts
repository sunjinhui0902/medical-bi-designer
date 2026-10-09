import { darkThemeTokensV3, lightThemeTokensV3, type DashboardApplicationV3 } from '../models/dashboard-v3.ts'

/** Apply the visible theme preset to every native page, including dialog pages. */
export function applyDashboardThemeV3(application: DashboardApplicationV3, preset: 'light' | 'dark') {
  const tokens = preset === 'dark' ? darkThemeTokensV3 : lightThemeTokensV3
  application.theme = { id: preset === 'dark' ? 'medical-dark' : 'medical-light', tokens: { ...tokens, chartPalette: [...tokens.chartPalette] } }
  for (const page of application.pages) {
    page.canvas.background = tokens.canvasBackground
    page.canvas.showGrid = false
    page.titleStyle.color = tokens.textPrimary
    for (const component of page.components) {
      const style = component.styleConfig
      if (style.background !== 'transparent') style.background = tokens.panelBackground
      style.titleColor = tokens.textPrimary
      style.borderColor = tokens.panelBorder
      style.borderRadius = tokens.panelRadius
      style.shadow = tokens.panelShadow
      if (component.textConfig) component.textConfig.color = tokens.textPrimary
    }
  }
}
