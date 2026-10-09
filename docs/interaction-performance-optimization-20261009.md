# 交互与性能续轮优化

任务 TYBI-INTERACTION-PERF-20261009-100940，DIRECT，go。基线 `agent/p0-quality-cockpit` / `80433d3`；保留原有未提交改动，不提交、不合并 main、不发布、不连接数据库。

顺序：透明背景恢复和焦点 → 弹窗原生组件 → 独立合成百万行/并发/切页压测，按实际瓶颈处理。P3 框选/通用撤销不扩大到本轮。

冻结边界：记忆原背景使用可选样式字段，保持旧配置可读；弹窗复用现有 DataChart、TableRendererV3、ControlledContentRenderer 与指标计算，不硬编码门诊交互。查询与事件仍由现有运行时协调，按页执行配置。压力数据只属于隔离测试夹具，不写入业务快照，不作为分析结论。

ChatGPT doctor 只读预检：桥接未运行、Tailscale 通道离线，外部 Review BLOCKED；未向外部发送项目材料。

## 已完成

- 透明背景：可选 `backgroundBeforeTransparent` 保存原颜色，开关、关闭面板、保存重开后均可恢复。旧透明配置没有原颜色时仍回退白色。图层面板按钮关闭和 Escape 关闭都恢复入口焦点。
- 弹窗：`RuntimePageSurfaceV3` 按可用宽度复用现有自适应布局，保留组合叠放及 Tab 所有权；图表、表格、文本/图片/地图等内容使用既有原生渲染器，指标复用主值与同比/环比计算。主页面和弹窗共用提取出的 `RuntimeParameterControlsV3`，没有修改原筛选交互。
- 弹窗数据按配置进入页加载，参数变化仅刷新声明 `onParameterChange` 的绑定组件；事件传入正确页 ID，表格按 rowClick/click 声明执行。关闭取消未完成的弹窗读取并恢复主页面显示；窗口缩小时弹窗及内容宽度限制在视口内。交互未硬编码为门诊。
- 百万行测试复现最小值/最大值展开数组导致 `RangeError`，服务端与展示聚合均改为归约，保留空值及非数字既有语义；新增 20 万行单组断言。未引入数据库或缓存架构重构。

## 实际验证

| 验证 | 结果 | E:/codex/work 下证据 |
| --- | --- | --- |
| 图层、原色恢复与焦点 | PASS；保存重开恢复自定义色，关闭按钮/Escape 返回入口，组合和四方向手机 Tab 回归 | tybi-interaction-perf-composition-20261009.txt |
| 定向单测 | 20/20 PASS | tybi-interaction-targeted-20261009.txt |
| 公开回归 | 384/384 PASS | tybi-interaction-public-tests-20261009.txt |
| 弹窗交互 E2E | 7/7 PASS；原六项与新增原生图表/KPI/Tab/筛选/CSV/行事件关闭、手机边界 | tybi-interaction-dialog-final-20261009.txt |
| 门诊移动回归 | PASS；五页 × 四种宽度、触屏滚动、联动清空、返回、20 行 CSV、保存重开 | tybi-interaction-product-mobile-20261009.txt |
| 连续切页与取消 | PASS；100 次恢复 20 行目录，取消 JSON 读取不污染缓存，无未捕获页面错误 | tybi-interaction-switches-20261009.txt |
| 类型与构建 | PASS；已有大分包提示仍存在 | tybi-interaction-build-20261009.txt |
| 负载测试 | PASS；独立合成夹具及临时回环服务，无数据库操作 | tybi-interaction-perf-20261009/load/result.json |
| 截图核对 | PASS；桌面/手机弹窗、手机 CSV 明细可访问 | tybi-interaction-perf-20261009/native-dialog-desktop.png、native-dialog-phone.png |

百万行的单组 min/max 加分组前 20 计算，本机约 954ms，额外堆约 182.1MB，20 行响应约 941 字节；四个并发请求约 1.75 秒完成。同步内存聚合仍会排队；测试类别数为 1000，没有证明百万个不同类别、高并发数据库或低端手机的生产性能。100 次切页属于重复操作稳定性验证，不等同数小时持续负载。界面仅展示受限响应，未把百万行数据发送到浏览器。

原生弹窗首次夹具缺少控件 position/styleConfig，恢复被 Schema 拒绝；补齐后发现夹具声明 onPageEnter，所以筛选不刷新，按本轮目标改为 onParameterChange 后通过。保留失败日志 native-dialog、native-dialog-recheck、native-dialog-valid；未放宽 Schema 或刷新策略来绕过验证。压力测试的栈溢出失败记录保存在 load-baseline。

## 状态和边界

工作区已修改、定向与公开回归/本地页面验收通过；未提交、未合并、未推送、未发布、未连接数据库。所有既有未提交改动保留。独立 GPT Review BLOCKED；真实模型 API、医生准确性与真实手机浏览器兼容按既有范围另行处理。P3 框选/对齐/通用撤销未纳入本轮。
