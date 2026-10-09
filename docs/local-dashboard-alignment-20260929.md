# 当前页图表对齐与标题样式

任务 ty_bi_align_0929，DIRECT；延续 agent/p0-quality-cockpit@80433d3 工作区候选。用户已授权按推荐继续。阶段预演 go：复用文字调整的纯变换、V3 校验、页面会话及单步撤销，不改变数据绑定、持久化协议或知识口径。保留其他未提交改动。

## 完成范围

支持“当前页图表左对齐”“当前页图表顶部对齐”，无需选中组件。限定 line/bar/pie/area/combo/scatter/bubble 七类当前页顶层原生图表，排除 tabs 所有 componentIds 归属成员、非图表及医疗封装组件。至少两个可用图表；已对齐时提示无需调整。

左对齐统一至现有最小 x，顶部对齐统一至最小 y。仅改变一个坐标，不改变尺寸、层级、ID、数据和来源。预览列出具体移动项、目标数量；新增组件重叠会提示，可应用后调整或一次撤销，未加入自动排版算法。

选中组件支持六位 hex 标题色、标题加粗/半粗/常规、标题粗细改为400/600/700。原标题、背景色、字号指令兼容。示例按钮和错误提示沿用同一入口。未选中组件时仅允许页面对齐指令。

保留完整快照冲突保护；任一手工变更或选择/页面变化会拒绝覆盖。撤销一次对齐原子恢复全部原坐标。没有新增撤销历史、存储键或服务端 API；暂定知识定义继续用于本地试用。

## 验证

六项纯变换定向测试 PASS：旧命令及新标题色/粗细字段隔离，非法输入拒绝，三图坐标对齐，tabs 所有权排除、非图表及其他页保持，新增重叠提示、无操作拒绝、过期预览保护。变换输入不变，整个 application 与只改允许字段的期望对象逐项一致。

scripts/test-local-alignment.mjs E2E PASS：从知识入口生成三趋势 → 无选择对齐 → 重叠预览 → 两种坐标对齐应用 → 保存后单步撤销 → 标题色/粗体 → 保存重开三原生图。对齐后完整对象只改目标坐标；撤销恢复原对象（仅忽略快照自动更新时间）；数据绑定、来源及其他看板保持，页面/API错误均为0。

类型检查 PASS；完整回归317项PASS，独立目录构建PASS；既有大bundle警告保留。证据 E:/codex/work/ty-bi-align-20260929，包含测试日志、页面 JSON 与预览/重开截图。ChatGPT 独立终审DONE，证据见chatgpt-review.txt；审核读取过程中提及的结果索引旧running状态已回写PASS。改动未提交、未合并、未发布。

修改文件：src/services/localDashboardEdit.ts、src/components/LocalDashboardEditor.vue、src/views/DesignerHome.vue、tests/local-dashboard-edit.test.ts、scripts/test-local-alignment.mjs、本报告。

后续可优先做等间距分布、尺寸统一或少量组合指令；本轮未扩大到自动排版、任意自然语言、LLM 或数据治理。
