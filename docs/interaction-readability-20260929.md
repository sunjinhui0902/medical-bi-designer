# 教学表格与下钻路径显示验收

任务 c2c_72e3，DIRECT；工作流4第二切片。基线 agent/p0-quality-cockpit / 80433d3。仅修改展示层及文案，保留既有候选；未提交、未推送、未合并。

## 完成范围

业务教学表只显示已经配置的科室/医生编号和门诊人次列，不再自动追加 month/dept_id/doctor_id。范围限定为 local-business 数据集且配置列非空；普通表格及无配置列的表格保留原先自动追加行为。配置列已不在结果字段中时过滤，不以内部字段替代。

表格 renderer 仍接收完整行，隐藏键继续参与原生联动、参数和下钻。没有修改查询字段、响应、TableRenderer或事件运行时。

面包屑名称由当前内存派生：先取唯一匹配的现有参数选项，随后从 DrillPath 字段、来源表格已加载行及已配置文本列找唯一名称。只取非空字符串，排除下钻键和度量字段；歧义、缺来源/层级/数据或非表格来源保留原值。参数选项歧义直接保留原值。严格匹配键类型，不用字符串转换碰巧匹配。

显示写入本地 computed 的 displayValue；frame.value、parameterId、DrillPath、真实接口参数均不变，不新增持久化派生的面包屑名称或运行状态、不增加查询。科室显示名称，医生显示编号；路径加中文冒号。没有事件的结果表不再提示“点击行”。

## 验证

- 定向9/9 PASS：业务显示白名单、普通表格/无配置列自动字段兼容、安全过滤、唯一选项优先、类型严格匹配、歧义/缺失回退、原输入及隐藏键不变；业务运行时和只读样本适配器回归。
- 真实API浏览器业务演示 PASS：可见两列、不显示内部键；按科室名称点击，但请求和响应仍对应真实dept_id；快速切换/空值/基线恢复；科室和医生面包屑名称；医生详情请求携带对应doctor_id；面包屑返回/跨页返回/重置/重复演示/保存重开，页面/API错误0。
- 浏览器改为从真实API JSON响应读取键与可见名称映射，且核对实际表格内容，不依赖DOM哈希文本或route mock。
- 旧月份教学实际浏览器 PASS。
- 原Phase10高级事件配置与医院→科室→医生下钻 Chromium：2/2 PASS。
- 最终全量338/338 PASS、类型检查PASS、Vite构建PASS（既有大块体积提示）。见 full-tests.txt、typecheck.txt、build.txt。

证据 E:/codex/work/ty-bi-readability-20260929，包括before、scoped-ui.diff、focused.txt、full-tests.txt、typecheck.txt、build.txt、browser.json、doctor-detail.png、monthly、phase10.txt。

ChatGPT独立终审 c2c_72e3 / iteration 1 DONE；证据 chatgpt-review.txt。审核已读取执行输出、当前实现、scoped diff及实际浏览器证据。本轮不是全局表格列语义迁移；迁移生成的列与用户指定列没有持久化区别，故普通表格不变。

## 修改文件与边界

src/services/interactionPresentationV3.ts；src/views/DesignerHome.vue；src/services/businessInteractionDraft.ts（仅点击提示文案）；tests/interaction-presentation.test.ts；scripts/test-business-interaction.mjs；scripts/test-interaction-teaching.mjs（支持独立证据目录）；本报告、BACKLOG及整体计划状态。

PageSessionRuntime/DrillFrame、V3 schema、参数/事件合同、API、数据库和工作区持久化未改。真实数据仍为2026-08 bd_odr只读部分样本，指标暂定；此次只证明展示和交互可用。
