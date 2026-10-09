# 显式勾选图表批量布局验收

任务 c2c_4a61，DIRECT。工作流4第一切片。基线 agent/p0-quality-cockpit / 80433d3；保留已有工作区候选。预演 go：范围限制为既有展示变换、UI和测试，无新schema/API/DB/runtime/persistence。候选未提交、未推送、未合并。

## 操作

打开顶部“文字调整”，勾选同一行或同一列的图表，再点左对齐、顶部对齐、水平/垂直等间距；也可填写宽高，点统一宽度/高度/宽高。先看到变更预览，再应用；用“撤销文字调整”恢复本次修改，保存后重开保留布局。

默认不选中任何图表；“全选当前页图表”是显式操作。空选择拒绝，绝不回退到整页。对齐/尺寸至少2张，等间距至少3张。改变勾选或宽高会清空旧预览。旧文字指令收在展开区，整页布局和单组件样式语义保留。

## 实现及范围

previewLocalDashboardEdit 增加可选 layoutTargetIds；不提供时保持旧整页布局语义。显式数组由服务校验为空/重复/不存在/其他页面/非原生图表/tabs内嵌图表，并按页面原顺序选中。listLocalLayoutTargets 与变换共享候选规则：line/bar/pie/area/combo/scatter/bubble七类当前页顶层图表。

选中集合复用既有对齐、等间距、尺寸、越界、重叠警告和V3校验算法；未选中的同页组件、其他页、数据绑定和来源保持。无canvas多选模型或持久化勾选状态。Designer apply/undo、完整快照过期检查及保存入口不改。

## 验证

- 定向13/13 PASS：原编辑/布局兼容，子集仅改允许字段，空/重复/缺失/跨页/nested/nonchart拒绝无输入修改，所选数量门槛、所选外包络、越界、与未选组件重叠警告及过期快照保护。
- 全量335/335 PASS。
- vue-tsc PASS。
- Vite构建 PASS（既有大块体积提示）。
- 实际浏览器/真实本地API：默认无勾选、空集拒绝、两张等距拒绝、越界拒绝、更换勾选使预览失效、只调整两张且第三张不动、精确撤销、三张快捷等距、保存重开布局一致、绑定和其他看板保留、页面/API错误0，PASS。
- 旧文字编辑、对齐、布局三个浏览器脚本 PASS。脚本增加展开文字区操作，其余断言保留。
- 渲染检查：快捷操作与预览/应用按钮同屏可见，旧文字操作收起，勾选项以标题和图表类型展示，无需输入ID或指令。

证据 E:/codex/work/ty-bi-batch-layout-20260929：before、focused.txt、full-tests.txt、typecheck.txt、build.txt、browser.json、subset-preview.png、reopened.png、legacy*.txt。

ChatGPT独立终审 c2c_4a61 / iteration 1 DONE，证据 chatgpt-review.txt；已独立读取执行输出、当前实现、scoped diff及浏览器断言。没有main/push/deploy/数据库写入。布局过大或跨度不足仍明确提示，不做静默自动缩放。

## 修改文件

src/services/localDashboardEdit.ts；src/components/LocalDashboardEditor.vue；tests/local-dashboard-layout.test.ts；scripts/test-batch-layout.mjs；三个旧浏览器脚本 test-local-edit/alignment/layout.mjs；本报告及BACKLOG.md。

教学表格内部键和下钻路径的易读显示留下一小切片，记录在BACKLOG；此轮只完成显式勾选后的局部布局操作，不声称支持自动识别行列或画布框选。
