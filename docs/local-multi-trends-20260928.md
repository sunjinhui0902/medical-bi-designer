# 知识入口与多指标趋势（2026-09-28）

Owner 初步测试单指标助手通过，并再次授权知识库不确定定义先用于本地试用，不等待业务确认。本轮DIRECT，基线仍为agent/p0-quality-cockpit@80433d3；保留前轮与原有dirty candidate。预演go：原生V3图表、月度证据及workspace存储均可复用；不改持久化契约，不写数据库，不合并发布。修改前备份在E:/codex/work/ty-bi-multi-20260928/before。

## 功能

知识库与设计器共用本地看板助手，支持1至4指标、明确月份区间、同比或环比。只给结束月并要求趋势时默认最近6个月；支持同年简写，例如2026年1月至8月。生成最新月份文字卡及每指标独立原生折线图，避免不同单位混轴。知识页创建后保存独立workspace草稿并跳回设计器；原看板保留。来源、SQL/证据引用和暂定定义状态保留，审批PENDING不阻断。缺数据项提示后跳过，其余指标继续；全部无数据才返回错误。

新增local-dashboard-plan端点，旧local-plan保持原有兼容行为。原生折线绑定只读local-series:<metric>:<from>:<to>虚拟数据集。范围固化于ID；修改月份可重新生成，不增加参数持久化合同。数据集只从既有脱敏月度证据读取，不执行SQL、不连接数据库，不写datasets.json。目录仅在设计器显式请求localIds时附加metadata；不可通过创建接口覆盖虚拟ID。保存重开后再次读取本地证据，非实时数据库刷新。

计划差异：按Owner优先级，dashboardAlignment待比对项只作为provisional提示，不阻断；可用数据的CSK本地趋势允许生成。没有忽略真实数据缺口。未接大模型、任意SQL或科室下钻。

## 验证

- 18项定向测试PASS：单指标兼容、月度单位与来源引用、多指标2/3/4组合、简写区间、缺数据部分成功、虚拟数据集视图、V3验证及存储重放。
- 完整回归311项PASS（npm test）；定向测试另覆盖mjs服务模块。
- vue-tsc类型检查PASS；JS语法与git diff --check PASS。
- Vite独立目录构建PASS，沿用前轮已确认outDir方式，不删除旧dist。既有大bundle警告保留。
- scripts/test-local-trends.mjs本地E2E PASS：知识库入口→三指标预览→设计器三个原生chart canvas→修改标题→保存→重开图表重新加载；已有看板保留；页面异常及API失败均为0。预览与重开截图已保存，曲线和单位可见。
- 初次草稿测试错误选择组件数组位置而误判；改为按line类型核对重开后数据集ID，测试PASS。内置浏览器热加载操作不稳定，采用可重复headless本地E2E，没有依此修改产品逻辑。

## 文件与状态

server/local-dashboard-plan.mjs（新增）、server/local-question-plan.mjs（仅导出原意图表）、server/index.mjs（新增虚拟分支及新plan端点）；src/services/localDashboardDraft.ts、src/components/LocalDashboardAssistant.vue、src/views/KnowledgeManager.vue、src/views/DesignerHome.vue；tests/local-dashboard-plan.test.mjs、tests/local-dashboard-draft.test.ts、scripts/test-local-trends.mjs及本报告。

证据：E:/codex/work/ty-bi-multi-20260928。候选未提交、未合并、未发布。ChatGPT独立审核DONE，确认共享入口、多指标原生趋势及编辑保存重开闭环通过；审核证据见chatgpt-review.txt。下一步可优先迭代图表布局/样式、已有看板按自然语言调整，暂不扩大数据治理。
