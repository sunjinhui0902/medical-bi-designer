# TY_BI 本地功能优先开发（2026-09-28）

Owner 已确认阶段1限定验收及bd_odr最小闭环。当前目标为纯本地试用，优先功能可用、好用；指标及知识定义默认作为暂定口径接受，使用AI做看板时再调整，不作为本地草稿开发阻断。此决策不把未执行测试改记PASS，不授权main合并、发布或数据库写入。

本轮 DIRECT，目标是打通已有意图查询计划到可编辑草稿。基线 agent/p0-quality-cockpit@80433d3b81a08f3429c4cc6df06ee857a807c8eb，工作区已有用户候选；保留全部，DesignerHome.vue修改前备份在 E:/codex/work/ty-bi-function-20260928/before。预演go：接口、V3模型与存储均存在，不改公共契约和后端SQL。

新增工具栏“本地看板助手”。输入一个月份和一个经营指标，预览本地快照，生成V3独立草稿；三块静态文本分别为值、同比/环比、来源和口径，可编辑、保存及重开。草稿不覆盖已有看板，保留SQL/证据引用及暂定指标状态。实现复用现有规则式local-plan，并未接入大模型API；当前不生成动态趋势图、多指标或科室下钻，数据不自动刷新。

改动：src/components/LocalDashboardAssistant.vue、src/services/localDashboardDraft.ts、src/views/DesignerHome.vue、tests/local-dashboard-draft.test.ts、本报告。知识API、SQL、原始知识资产及数据库未修改。知识页快捷入口后续复用此助手。

验证：8项定向测试PASS（新草稿2项、既有local-plan6项）；类型检查PASS。默认build因旧dist产物EPERM清理失败，遵循Vite官方build.outDir选项将产物输出到证据目录后构建PASS，未删除旧产物。参考 https://vite.dev/config/build-options.html#build-outdir 。内置浏览器实测输入→预览2988.58万元→创建→正文编辑→保存→重开保留编辑PASS；已有旧看板保留由存储测试验证。旧区域质控示例存在数据集缺失，不属于本轮新功能。

独立ChatGPT Review返回DONE，限定本地单指标静态可编辑草稿闭环通过；见证据目录chatgpt-review.txt。本轮候选未提交、未合并、未发布。下一步是知识页统一入口与多指标组合/趋势图；按本地功能优先推进，不继续穷尽数据审核。
