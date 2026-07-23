import type { SeriesData } from '../models/bi'
import type { AnalysisConfig } from '../models/dashboard'

export function calculateWarningValue(line: AnalysisConfig['warningLines'][number], series: SeriesData[]) {
  const selected = line.measureField ? series.filter((item) => item.field === line.measureField) : series
  const values = selected.flatMap((item) => item.values).filter(Number.isFinite).sort((a, b) => a - b)
  if (line.source === 'fixed' || !values.length) return Number(line.value) || 0
  if (line.source === 'min') return values[0]
  if (line.source === 'max') return values[values.length - 1]
  if (line.source === 'median') {
    const middle = Math.floor(values.length / 2)
    return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
  }
  if (line.source === 'percentile') {
    const percentile = Math.max(0, Math.min(100, line.percentile ?? 90))
    return values[Math.round((values.length - 1) * percentile / 100)]
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

export function percentageDenominator(
  series: SeriesData[],
  seriesIndex: number,
  dataIndex: number,
  base: 'category' | 'series',
  denominatorField?: string,
) {
  if (denominatorField) {
    return series
      .filter((item) => item.field === denominatorField)
      .reduce((sum, item) => sum + (item.values[dataIndex] ?? 0), 0)
  }
  if (base === 'series') return (series[seriesIndex]?.values ?? []).reduce((sum, value) => sum + value, 0)
  const categoryTotal = series.reduce((sum, item) => sum + (item.values[dataIndex] ?? 0), 0)
  if (series.length === 1) return (series[0]?.values ?? []).reduce((sum, value) => sum + value, 0)
  return categoryTotal
}

export function bubblePoints(categories: string[], series: SeriesData[]) {
  const x = series[0]?.values ?? []
  const y = series[1]?.values ?? []
  const size = series[2]?.values ?? []
  return x.map((value, index) => [value, y[index] ?? 0, size[index] ?? 12, categories[index] ?? ''])
}
