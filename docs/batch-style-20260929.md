# 勾选图表批量样式

整体计划第4项剩余切片。阶段预演 go：只调整当前页显式勾选的顶层原生图表的展示字段，复用现有预览、冲突检查、应用、撤销和保存合同。无新依赖，不修改 V3 Schema/runtime、数据库或模型调用。

基线 `agent/p0-quality-cockpit@80433d3`。已有大量工作区候选，全部保留。本轮未提交、未合并、未推送或发布。

## 用法

设计器点击“文字调整”，勾选需要修改的图表；在“统一样式”中选择标题字号、标题颜色或背景色，点击对应统一按钮，检查变化清单，再点击“应用到当前看板”。支持一张或多张图。可撤销最后一次调整；点击“保存”后重开保留样式。

修改选择、字号或颜色会清除旧预览，需重新预览。空选择、非法字号、不可调整组件和无变化操作给出提示。各图标题名称、数据绑定、参数、来源、未选图表、页签内图表和其他页面保留。此功能为明确样式快捷操作，未声称连续大模型调整。

## 验证

- 本轮与关联编辑/布局定向测试16项 PASS，其中新增3项覆盖字段隔离、不可调整范围、输入不变、非法值、单图与冲突保护。
- Chromium实际操作 PASS：空选择/非法字号提示、修改输入清除旧预览、两张图样式预览应用、整次撤销、三种样式、第三张图与数据/标题保留、保存重开、其他看板保留，页面JS异常0。
- 类型检查、生产构建、既有批量布局页面回归 PASS。构建沿用既有大包提示。
- 证据 `E:/codex/work/ty-bi-batch-style-20260929/browser.json`、`style-preview.png`、`reopened.png`。

修改文件：`src/services/localDashboardEdit.ts`、`src/components/LocalDashboardEditor.vue`、`tests/local-dashboard-batch-style.test.ts`、`scripts/test-batch-style.mjs`；同步本地整体计划与 BACKLOG 的已完成/待办边界。

独立 ChatGPT 审核 PASS，完整证据 `E:/codex/work/ty-bi-batch-style-20260929/chatgpt-review.txt`。该审核同时确认真实网页医院方案基础设计器闭环、趋势年度范围修复与窄指标展示。

医院模板追加修复后执行全量回归341/341 PASS、医院范围定向2项PASS、最终类型检查和构建PASS。仍是工作区候选；外部独立审查通过不代表Owner正式验收或允许合并main。
