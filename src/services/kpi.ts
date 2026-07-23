import type { KpiConfig } from '../models/dashboard'

export function formatKpiValue(value: number, config: KpiConfig) {
  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: config.decimals,
    maximumFractionDigits: config.decimals,
    useGrouping: config.useGrouping,
  }).format(Number.isFinite(value) ? value : 0)
}

export function comparisonRate(current: number, baseline: number) {
  if (!Number.isFinite(current) || !Number.isFinite(baseline) || baseline === 0) return null
  return (current - baseline) / Math.abs(baseline) * 100
}

export function targetProgress(current: number, target: number) {
  if (!Number.isFinite(current) || !Number.isFinite(target) || target === 0) return 0
  return Math.max(0, current / target * 100)
}

export function comparisonColor(rate: number, config: KpiConfig) {
  return rate < 0 ? config.negativeColor : config.positiveColor
}
