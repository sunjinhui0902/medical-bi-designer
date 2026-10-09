# 快速切页空白修复

任务 TYBI-QUERY-CANCEL-20261008-184029，DIRECT，go。基线 agent/p0-quality-cockpit / 80433d3。保留现有 156 项工作区改动；不连接远程 ODR、不写数据库、不提交、不合并 main。

## 修复前证据与冻结方案

三个确定性逻辑测试均复现缺陷：取消第一个普通查询调用者会取消仍在等待的合并调用者；忽略取消的读取结果仍能写入空缓存；clear 之前的挂起请求能够覆盖之后的新结果。

真实本地科室目录浏览器复现：只在测试页控制首个响应 JSON 读取，成功响应返回后切离页面，读取因取消拒绝；再次进入同页，科室目录 0 行而非正常 20 行。记录 `E:/codex/work/tybi-query-cancellation-20261008/failure.json` 与 `failure.png`，不使用伪造业务数据。修复前测试输出为预期 FAIL：`tybi-query-cancellation-before.txt`、`tybi-query-cancellation-browser-before.txt`。

方案：共享查询使用独立传输信号，各调用者只取消自身等待；最后调用者离开才取消共享传输并移出待复用集合。取消、清空或新查询之后的迟到结果不得覆盖缓存。成功响应解析失败和取消必须报错，不转换为空对象；合法 rows:[] 仍作为无数据结果处理。

保持 TTL、容量、结果拷贝、查询键、服务端分页和强制刷新原契约。用确定性测试、同一浏览器复现脚本、手机完整闭环、核心回归和构建验收。

参考：[Fetch 响应体读取取消语义](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch)、[TanStack 查询取消](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation)。本项目复用取消生命周期原则，不引入新查询框架。

`codex-with-chatgpt` 只读预检仍为固定连接离线，未做外部 Review，未上传本地内容。

## 已实施范围

- `queryRuntimeCacheV3.ts`：共享传输使用独立信号；每个读者取消自身等待，最后读者离开时取消传输并停止复用。缓存代际和最新请求身份阻止 clear 前或旧请求的迟到结果覆盖新结果。保留容量、TTL、结果拷贝及强制刷新契约。
- `componentQueryRefreshV3.ts`：普通查询和强制刷新传入调用者信号，由缓存管理共享传输。
- `queryResponseV3.ts`、`DesignerHome.vue`：取消和响应解析错误不再转换为空查询结果；合法空 rows 仍表示无数据。这是传输结构检查，不涉及用户暂停的医生对账或业务准确性校验。
- 新增取消、替代请求、清空缓存、强制刷新和响应读取回归；浏览器脚本只控制读取时序，数据仍来自已有本地快照。
- 验收追加发现并修复 `DatasetManager.vue` 的导航竞态：Trace 显示进入 `/data-sources` 后，旧数据集详情回调又把地址替换为 `/datasets?id=…`。页面卸载或选择已被替代后禁止旧回调改表单或跳转，并增加真实详情响应延迟的 E2E。
- 可重复入口：`npm run test:query-cancellation`、`npm run test:product-mobile`，服务需已在本地 5174/5175 运行。

## 验收证据

| 验证 | 状态 | 证据 |
| --- | --- | --- |
| 修复前取消逻辑与真实页面复现 | 预期 FAIL | `tybi-query-cancellation-before.txt`、`tybi-query-cancellation-browser-before.txt` |
| 定向回归 | PASS，39/39 | `E:/codex/work/tybi-query-cancellation-targeted-final.txt` |
| 公开回归 | PASS，374/374 | `E:/codex/work/tybi-query-cancellation-unit.txt`；其后新增的 2 项已包含在最终定向回归中 |
| 本地快照回归 | PASS，26/26 | `E:/codex/work/tybi-query-cancellation-local.txt` |
| 响应体取消后重新进入目录 | PASS，20 行、12 次快速切页 | `E:/codex/work/tybi-query-cancellation-20261008/result.json`、`directory-phone.png` |
| 移动完整闭环 | PASS，五页 × 四种宽度 | `E:/codex/work/tybi-query-cancellation-mobile.txt`；原生触控滚动 161px、联动清空、下钻返回、20 行 CSV、保存重开、桌面坐标不变 |
| 最终类型检查与构建 | PASS | `E:/codex/work/tybi-query-cancellation-build-final.txt`；DesignerHome 与图表分包仍超过 500kB |
| 最终核心 E2E | PASS，25/25 | `E:/codex/work/tybi-query-cancellation-e2e-after-nav-fix.txt`；包含普通管理页导航和延迟详情响应不拉回旧页 |
| ChatGPT 外部 Review | BLOCKED | 固定 Tailscale 连接离线，未发送项目内容 |

E2E 包装器最初因已有服务占用端口而拒绝启动，尚未进入测试；使用项目现有 `TY_BI_E2E_EXTERNAL_SERVER=1` 模式复核，保留用户服务。首轮导航失败及单项通过记录分别保存在 `tybi-query-cancellation-e2e-final.txt`、`tybi-query-cancellation-nav-recheck.txt`。

第二轮导航失败日志为 `tybi-query-cancellation-e2e-recheck.txt`，失败 Trace 单独保留在 `E:/codex/work/tybi-query-cancellation-20261008/navigation-failure-trace.zip`。核对 Vue Router [源码](https://github.com/vuejs/router/blob/main/packages/router/src/router.ts) 与[导航守卫说明](https://router.vuejs.org/guide/advanced/navigation-guards)后，按实际 Trace 限制旧页面回调，未调整路由框架或放宽断言。并行浏览器快速切页复核仍 PASS，日志 `tybi-query-cancellation-browser-concurrent.txt`。

## 边界与交付状态

本轮修复通用查询生命周期，未增加门诊专用交互分支，未改业务数据或取消合法无数据提示。手机验收为 Chromium 下当前五页的浏览与交互；真实 iOS/Safari/微信下载、任意组件的移动布局及百万行并发仍是后续专项。产品范围按最新需求限定为 PC 设计、移动预览与自适应浏览。

工作区已修改并保留原有改动；未提交、未合并 main、未发布、未写数据库。用户原有浏览器工作区未被测试覆盖。最终本地测试、浏览器验收和构建通过，状态为可供用户验收；外部 Review 状态单独保留。`git diff --check` 通过，分支及 HEAD 与基线一致。
