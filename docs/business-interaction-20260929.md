# 科室→医生业务交互验收（2026-09-29）

状态：本地验证通过；ChatGPT 独立审核 c2c_b724 / iteration 1 返回 DONE。工作区候选未提交、未推送、未合并。

## 范围与操作

在“交互教学”选择“科室→医生业务样本”，点“一键创建教学看板”，进入“预览”。月份和科室均可直接选择/清空。左表点击科室联动右表；下方科室表进入科室医生页，再点医生进入详情。用返回、面包屑或“一键重新开始”重复演示。

复用标准 V3 参数、applyLinkage、navigatePage、drillDown、clearDrill；三页支持两层下钻。联动即时处理；下钻防抖200ms及非空条件避免重复推进。

## 数据边界

使用已采集 bd_odr 只读聚合快照，2026-08，8个科室、每科最多10位编号医生，共80位。来源 ads 科室/医生指标表 gzl_mzrs，采集时间2026-09-29T11:11:47.586432+08:00。

这是 top-N 部分样本，门诊人次口径暂定，不是实时查询、全院合计、全量排名或正式对账。运行时不查询数据库、不执行SQL；文件位于被Git忽略的 server/.data/interaction-business-snapshot.json。缺失或格式无效时拒绝执行，不能用模拟数据冒充。

既有 dataset GET/list/execute 路由分派扩展支持固定 local-business 数据集；写入虚拟数据集明确拒绝。没有新 endpoint、数据库写入或持久化契约变更。合法但不属于样本的筛选键返回空结果，供空结果处理；非法键和未声明参数拒绝。

## 修复及证据

pageSessionRuntimeV3 清除联动恢复参数时，原始 null 基线被空值合并表达式错误跳过，最终沿用当前科室。改为判断基线是否存在，保留 null；新增空基线和显式科室基线回归测试。

- 定向：6/6 PASS。
- 全量：332/332 PASS。
- vue-tsc：PASS。
- Vite构建：PASS（有既有大块体积提示）。
- 真实浏览器/实际本地API、无route mock：联动与清除、空科室、原科室基线恢复、快速切换两个不同科室（两次不同参数请求，结果停在第二次）、空月份、快速双击、两层下钻、跨页返回、重置、重复演示、保存重开 PASS；页面/API错误0。

证据 E:/codex/work/ty-bi-business-20260929：focused.txt、full-tests.txt、typecheck.txt、build.txt、browser.json、doctor-detail.png。

快速切换在真实本地响应速度下测试，未注入人工延迟，不宣称任意网络延迟乱序已穷尽覆盖。原版表格自动展示其他字段及面包屑使用哈希键，仍有展示优化空间，不阻断本地功能验收。

独立审核已读取执行输出和本轮实现，认可上述验收范围。审核连接根目录不是Git仓库，无法通过连接读取项目Git差异；当前文件逐项审核，Codex本地另行核对差异及git diff --check。终审证据 chatgpt-review.txt。其关于 result.json/STATUS.md 的中间状态备注已由本轮后续结果文件覆盖。

## 修改文件

server/local-business-drill.mjs；server/index.mjs；src/services/businessInteractionDraft.ts；src/services/pageSessionRuntimeV3.ts；src/views/DesignerHome.vue；src/components/InteractionTeachingAssistant.vue；tests/business-interaction.test.ts；tests/local-business-drill.test.mjs；scripts/test-business-interaction.mjs。

基线：agent/p0-quality-cockpit / 80433d3b81a08f3429c4cc6df06ee857a807c8eb。保留此前各项工作区候选，不作为本轮新增范围。没有main/push/deploy或数据库写入。
