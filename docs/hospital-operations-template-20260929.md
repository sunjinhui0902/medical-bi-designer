# 医院运营概览模板样例验收

整体计划第5项模板首切片。目标为参考截图布局、本地知识数据、预算等空值、可见样例和可复用提示词。

基线 agent/p0-quality-cockpit，HEAD 80433d3b81a08f3429c4cc6df06ee857a807c8eb。工作区候选，保留原改动，未提交/合并/发布。

实现：templates/hospital-operations-overview.html；scripts/generate-hospital-operations-demo.mjs；docs/hospital-operations-template-prompt.md；本地助手样例入口；npm run demo:hospital。

复用 server/local-baselines.mjs 合同校验，仅读取7项医院指标和20个月证据，不执行SQL或数据库写入。内嵌已有本地图表库，离线HTML可用；输出产物由gitignore排除。

门诊收入、医疗成本、门急诊人次、出院人次和病床使用率使用本地快照。总收入、医疗收入、总成本、预算、结余率、住院收入、次均费用、构成、科室收入、床位散点保持null；医疗成本独立命名，未复制参考数字。

浏览器PASS：助手入口、金额单位、119.16%保留、年月联动/超界回落、同比环比重算、实际柱图点击切月、键盘来源弹窗、提示词/缺口说明、390px无横向溢出、离线渲染；零页面错误/失败请求。类型检查和构建见work/ty-bi-hospital-template-20260929/checks.txt。不重复核心全量测试，因为本轮不修改核心运行时/V3/API/持久化。

证据目录 E:/codex/work/ty-bi-hospital-template-20260929，包含参考、桌面/手机/提示词截图、browser.json。

边界：AI生成者为Codex，产品端完整LLM生成链路仍待接通。导航仅作模板栏目，缺明细区无假下钻。下一步将模板选择、知识库映射和空值策略作为模型输入，再接入可编辑草稿。

ChatGPT独立审核：DONE。完整结论见 E:/codex/work/ty-bi-hospital-template-20260929/chatgpt-review.txt。
