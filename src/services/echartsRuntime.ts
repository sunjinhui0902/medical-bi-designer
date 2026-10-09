import { use } from 'echarts/core'
import { LineChart, BarChart, PieChart, ScatterChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, DataZoomComponent } from 'echarts/components'
import { LabelLayout } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
use([LineChart, BarChart, PieChart, ScatterChart, GridComponent, TooltipComponent, LegendComponent, MarkLineComponent, DataZoomComponent, LabelLayout, CanvasRenderer])
export { init } from 'echarts/core'
export type { ECharts, EChartsOption, SeriesOption } from 'echarts'
