# Phase10 验收记录

> 分支：`agent/phase10-interactions`。本文件只记录工作区事实，不代表已提交、已推送或已合并。

## 状态矩阵

| 节点 | 状态 | 风险 | 关闭证据 |
| --- | --- | --- | --- |
| P10.0 | ACCEPTED | 高 | 基线、契约、状态机、风险和验收矩阵冻结 |
| P10.1 | ACCEPTED | 高 | 动作白名单、Schema、TypeScript、语义校验、迁移、示例同步；Node 200/200；生产构建通过；架构/测试 P0/P1/P2=0 |
| P10.2 | ACCEPTED | 高 | 页面栈、受信 session lease、参数事务、Designer 切页；全量 Node 211/211；生产构建；架构/测试 P0/P1/P2=0 |
| P10.3 | ACCEPTED | 高 | 页面实例作用域、交叠覆盖层、定向刷新、可信 claim、销毁清理；Node 230/230；生产构建 7000 modules；架构/测试 P0/P1/P2=0 |
| P10.4 | ACCEPTED | 高 | DrillPath、跨页 checkpoint、覆盖层、面包屑和生命周期端口通过 |
| P10.5 | ACCEPTED | 高 | Dialog 栈、焦点环、ESC、遮罩、内部事件、拖动、八向缩放和保护区通过 |
| P10.6 | ACCEPTED | 高 | Safe Browser 协议、Origin、快照、隐私、noopener/noreferrer 和目标页通过 |
| P10.7 | ACCEPTED | 高 | Node 268/268；Chromium 19/19；生产构建 7006 modules；官方审计 0 |

## P10.2 验收矩阵

| 编号 | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| P10.2-A01 | push/replace/back/clear 状态转换 | 通过 | `tests/phase10-page-runtime.test.ts` |
| P10.2-A02 | 跨页参数单次原子提交与返回恢复 | 通过 | 无效赋值零页面副作用；replace 保留原始恢复基线 |
| P10.2-A03 | EventBus 统一动作端口与 handoff 防伪 | 通过 | 合法交接更新事务快照；伪造值 fail closed |
| P10.2-A04 | root back、close、旧会话与跨会话隔离 | 通过 | root skipped；close 递增 epoch 并清空栈；独立 Store/Session |
| P10.2-A05 | Designer 预览接线和 Phase9 回归 | 通过 | `tests/phase9-designer-runtime-integration.test.ts` 7/7 |
| P10.2-A06 | 共享核心扩大回归 | 通过 | `npm run verify:node -- P10.2`：定向通过、全量 Node 206/206 |
| P10.2-A07 | TypeScript 与生产构建 | 通过 | 沙箱内 Vite 临时目录 EPERM；同一代码沙箱外 `npm run build` 成功，6999 modules |
| P10.2-A08 | 架构/测试独立双签 | 通过 | 最终复审均 ACCEPTED，P0/P1/P2=0 |

## P10.3 验收矩阵

| 编号 | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| P10.3-A01 | apply/clear 单次原子提交与恢复 | 通过 | `tests/phase10-linkage-runtime.test.ts` |
| P10.3-A02 | 页面实例作用域与交叠覆盖层 | 通过 | 任意清除顺序、跨页隔离、replace/back 销毁清理 |
| P10.3-A03 | 提交前目标校验与定向刷新 | 通过 | 重复/不可查询目标零副作用；部分失败保留真实提交事实 |
| P10.3-A04 | claim provenance 与防伪 | 通过 | 官方 apply/clear 可复用；注入刷新端口和伪造 Interaction Port 均不可传播 |
| P10.3-A05 | 取消、晚到和跨会话隔离 | 通过 | clear/close、畸形 DTO、throw 后均复核 session lease |
| P10.3-A06 | 完整 Node 与生产构建 | 通过 | `npm test` 230/230；`npm run build` 7000 modules |
| P10.3-A07 | 架构/测试独立双签 | 通过 | 最终复审均 ACCEPTED，P0/P1/P2=0 |

## 失败事实

- P10.2 门禁中的唯一命令失败来自 Vite 写入 `node_modules/.vite-temp` 的沙箱权限限制，不属于项目失败；沙箱外生产构建已通过。
- P10.3 构建同样仅在沙箱内遇到已知 Vite `.vite-temp` EPERM；沙箱外生产构建通过。
- 未使用 PostgreSQL 凭据；未新增生产依赖；未提交、推送或合并；未进入 Phase11。

## Phase10 最终验收矩阵

| 编号 | 验收项 | 结果 | 证据 |
| --- | --- | --- | --- |
| P10-F01 | 动作白名单、Schema、TypeScript、语义校验和迁移同步 | 通过 | 未知动作/额外字段 fail closed；旧 V3 根扩展迁入 `extensionRefs.legacyRoot` |
| P10-F02 | 页面栈、弹窗栈、下钻栈、联动状态机 | 通过 | push/replace/back/clear、100 层预算、旧 lease、跨会话隔离和会话态非持久化 |
| P10-F03 | 参数原子事务和 Phase8/Phase9 复用边界 | 通过 | 单次提交、真实失败事实、存活覆盖层、可信 PageSession handoff |
| P10-F04 | 新窗口和外链安全 | 通过 | http/https、Origin 白名单、冻结快照、noopener/noreferrer、隐私证据 |
| P10-F05 | Dialog 生命周期与几何 | 通过 | 焦点环/恢复、ESC、遮罩、内部 closeDialog、拖动、八向缩放、保护区零重叠 |
| P10-F06 | 医院→科室→医生阶段出口 | 通过 | 真实 Chromium 验证跨页参数、面包屑、两级返回、清除联动和下钻回退 |
| P10-F07 | 最终质量与供应链门禁 | 通过 | `npm test` 268/268；`npm run test:e2e` 19/19；`npm run build`；`npm audit` 0 |
| P10-F08 | 范围和敏感信息边界 | 通过 | 无 Phase11、无生产依赖新增、无 PostgreSQL 凭据、无提交/推送/合并 |
