# Phase10 实施方案

> 状态（2026-08-13）：P10.0—P10.7 已关闭；Phase10 最终门禁通过并停止在 Phase11 之前。

## 1. 目标与不变量

Phase10 在 Phase9 动作协议和 EventBus 上开放页面导航、新窗口、弹窗、外链、联动、下钻和返回，提供统一声明、受控执行、会话隔离和可追踪失败事实。

- Phase9 已验收能力不回退；循环、深度、预算、防抖、取消和晚到保护继续由 EventBus 提供。
- 参数变化继续使用 Phase8 Parameter Store 单次原子提交和定向刷新。
- 设计态只配置，预览态执行；发布态属于 Phase11。
- 页面栈、弹窗栈、下钻栈、联动状态和弹窗几何不写回 V3 JSON。
- 执行器不识别医院、科室、医生；医疗路径只存在于示例和 E2E fixture。

## 2. 冻结数据契约

### DrillPath

`DashboardApplicationV3` 增加可选 `drillPaths`，每条路径包含稳定 ID、名称和至少两个声明式层级。层级包含 `id`、`label`、`field`、`parameterId`；运行时按事件 payload 解析字段，不执行任意表达式。路径 ID、层级 ID 必须唯一，参数引用必须存在。

### 参数变更和携带

- `navigatePage`、`openDialog`、`applyLinkage` 使用结构化 `{ parameterId, value: ValueExpressionV3 }` assignments。
- `drillDown` 从当前 DrillPath 层级字段解析值并写入该层级 parameterId。
- `openPageWindow`、`openExternalLink` 只声明 `carryParameterIds`，从当前可信快照序列化，不修改当前 Store。

### 动作最小契约

| 动作 | 最小字段 | 语义 |
| --- | --- | --- |
| `navigatePage` | `pageId`, `history`, `assignments?` | standard 页 push/replace |
| `pageBack` | 无额外字段 | 恢复上一页面及导航前参数 |
| `openPageWindow` | `pageId`, `carryParameterIds?` | 安全端口打开内部页 |
| `openDialog` | `pageId`, `presentation`, `assignments?` | 只允许 dialog 页 |
| `closeDialog` | 无额外字段 | 关闭顶层弹窗并恢复作用域 |
| `applyLinkage` | `assignments`, `targetComponentIds` | 原子提交后只刷新目标组件 |
| `clearLinkage` | `linkageActionId?` | 恢复指定或当前联动前值 |
| `drillDown` | `pathId` | 按声明式下一层推进 |
| `drillBack` | `pathId` | 恢复上一层参数和面包屑 |
| `clearDrill` | `pathId` | 恢复初始参数并清空路径栈 |
| `openExternalLink` | `url`, `carryParameterIds?` | 仅 http/https 安全打开 |

动作对象均 `additionalProperties: false`，所有 ID 和数组非空、唯一；未知动作和非法字段 fail closed。

## 3. 运行时架构

```text
Designer Preview
  → Phase9 EventBus
    → Interaction Action Ports
      → Interaction Session Runtime
        ├─ Page Stack
        ├─ Dialog Stack
        ├─ Drill Stacks
        └─ Linkage State
      → Phase8 Parameter Store
      → Phase8/9 Targeted Refresh
      → Safe Browser Port
```

- 每次预览创建唯一 `sessionId` 和递增 `epoch`；页面、弹窗和下钻作用域带 revision。
- 导入、替换应用、退出预览和卸载使 epoch 失效并清空会话 Store。
- 晚到结果只能进入 EventBus 受限审计，不得恢复旧页面、弹窗、面包屑或联动状态。
- 执行器先纯校验并生成确定性迁移计划，再提交参数；提交前失败零副作用。
- 参数提交后取消或刷新失败不回滚参数或已生效状态，结果必须保留真实提交事实。

## 4. 节点与任务编号

### P10.0 启动预演、基线和冻结

- `P10.0-01` 核对 main/远端/工作区和 Phase9 accepted 基线。
- `P10.0-02` 创建独立分支并更新项目人工介入规则。
- `P10.0-03` 完成架构/测试预演和 Conditional Go 签字。
- `P10.0-04` 建立实施、状态、风险和验收矩阵。

### P10.1 动作 Schema、类型和兼容迁移

- `P10.1-01` 增加 DrillPath、参数变更和 11 类动作 TypeScript 联合。
- `P10.1-02` 同步 JSON Schema 严格对象定义和动作白名单。
- `P10.1-03` 增加页面类型、目标、参数、组件、DrillPath 和 URL 语义校验。
- `P10.1-04` 更新页面复制/删除引用规则与 V3 identity migration 回归。
- `P10.1-05` 增加 Phase10 示例和未知动作/字段/引用异常测试。
- `P10.1-06` 执行完整 Node、生产构建及架构/测试节点签字。

### P10.2 Page Runtime 与页面栈

- `P10.2-01` 建立 Interaction Session 身份、epoch、revision 和只读快照。
- `P10.2-02` 实现 Page Stack 的 push/replace/back/clear。
- `P10.2-03` 实现跨页参数规划、原子提交、恢复变更集和失败事实。
- `P10.2-04` 接入 EventBus 页面动作端口与预览切页。
- `P10.2-05` 覆盖空栈、取消、晚到、跨会话和卸载清理。

### P10.3 联动与清除联动

- `P10.3-01` 实现联动状态、恢复变更集与作用域隔离。
- `P10.3-02` 复用 Parameter Store 单次提交和定向刷新。
- `P10.3-03` 实现清除指定/当前联动及部分失败事实。
- `P10.3-04` 验证同值去重、目标去重、取消和晚到隔离。

### P10.4 DrillPath、下钻栈和面包屑

- `P10.4-01` 实现声明式路径解析，不识别业务名称。
- `P10.4-02` 实现 drillDown/drillBack/clearDrill 和参数恢复。
- `P10.4-03` 提供下钻栈只读快照与面包屑模型。
- `P10.4-04` 验证路径边界、循环/深度/预算、取消和旧响应。

冻结补充：Drill 栈键为当前 Interaction Session 的 `sessionId + epoch + pathId`；运行时实例已承载 session/epoch，内部按 `pathId` 存储。页面实例和组件只进入 frame 来源元数据，不阻止同一声明路径跨页、跨组件续钻。每个页面栈条目保存完整 Drill checkpoint；push 继承，pageBack/replace 在单次参数事务中恢复 checkpoint，避免旧导航分支复活。路径层级限制为 2—100，同一路径 parameterId 唯一，危险字段段拒绝；面包屑只从 frame 派生，不维护第二份状态。

### P10.5 Dialog Runtime

- `P10.5-01` 实现弹窗栈、顶层焦点、ESC、遮罩和关闭恢复。
- `P10.5-02` 实现纯函数几何约束、拖动、八方向缩放和保护区避让。
- `P10.5-03` 接入 dialog 页面渲染和会话参数作用域。
- `P10.5-04` 覆盖切页、导入、退出预览、卸载和晚到清理。

### P10.6 外链和新窗口安全端口

- `P10.6-01` 实现可注入 Browser Port 和内部页 URL 构造器。
- `P10.6-02` 实现 http/https 白名单、危险协议拒绝和解析失败 fail closed。
- `P10.6-03` 固定 noopener/noreferrer、断开 opener，处理浏览器拦截事实。
- `P10.6-04` 验证显式参数序列化、重复参数和非法值拒绝。

### P10.7 Designer、E2E 和最终验收

- `P10.7-01` 扩展事件配置 UI，设计态只生成白名单声明。
- `P10.7-02` 接入预览页面、返回、面包屑、联动、弹窗与安全端口。
- `P10.7-03` 增加声明式医院→科室→医生示例，不进入核心执行器。
- `P10.7-04` 更新迁移、交接、当前状态、README 和验收记录。
- `P10.7-05` 执行 Node 全量、Chromium、生产构建、官方 audit 与端口清理核验。
- `P10.7-06` 架构和测试最终双签，要求 P0/P1/P2=0。

## 5. 状态矩阵

| 节点 | 状态 | 前置条件 | 出口 |
| --- | --- | --- | --- |
| P10.0 | 完成 | Phase9 accepted、基线一致 | Conditional Go、矩阵冻结 |
| P10.1 | 完成 | P10.0 完成 | 契约同步、Node/build、架构测试签字 |
| P10.2 | 完成 | P10.1 关闭 | 页面栈和跨页参数正确 |
| P10.3 | 完成 | P10.2 关闭 | 联动/清除和定向刷新正确 |
| P10.4 | 完成 | P10.3 关闭 | 声明式下钻、返回和面包屑正确 |
| P10.5 | 完成 | P10.4 关闭 | 弹窗生命周期和几何正确 |
| P10.6 | 完成 | P10.5 关闭 | 外链/新窗口 fail closed |
| P10.7 | 完成 | P10.1—P10.6 关闭 | Node 268/268、Chromium 19/19、生产构建、官方审计 0 |

## 6. 验收与停止条件

- 每节点先跑精确测试；共享 Schema、验证器、EventBus 或 Parameter Store 变化时按风险扩大回归。
- P10.1、核心 EventBus/参数节点和 Phase10 最终关闭时执行完整 Node 与生产构建。
- Chromium 仅在 UI/几何节点关闭和最终关闭执行；最终记录父进程退出码与端口释放。
- 官方依赖审计只在最终关闭执行；不新增生产依赖，除非先说明必要性和架构影响。
- 同一根因连续失败达到 3 次且替代路径仍无法解决时暂停请求人工介入。
- Phase10 最终验收后必须停下汇报，不自动进入 Phase11。
