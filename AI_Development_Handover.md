# AI Development Handover

本文是新开发会话的最短交接入口。当前 V2 可视化底座、V3 Phase7 和 Phase8 已完成本地验收；Phase9 多页面与事件基础已完成全量门禁和架构/测试双签，正式 accepted。未经项目所有者决定不得进入 Phase10。

## 当前状态

- V2 数据集、组件、图表、指标卡和数据计算底座已完成。
- V3 JSON、Schema、迁移、存储、参数中心和设计器兼容接入已通过 Phase7 验收。
- Phase8 参数运行时、绑定、筛选控件、服务端安全聚合、定向刷新和短期查询缓存已实现。
- Phase9 已实现多页面、受控事件编辑、事件总线、SetParameter、Refresh 和仅预览执行的设计器运行时。
- 最新完整门禁：193 项 Node、13 项 Chromium、生产构建和官方依赖审计全部通过。
- 当前分支为 `agent/phase9-multipage-events`，基线 `73d5fba`；工作区未 commit、push 或 merge。
- P9-FG1 门禁退出专项已由架构和测试双重 accepted，P0/P1/P2 均为 0。

权威状态见 [项目当前状态](./docs/项目当前状态.md)，总体架构和 PR 顺序见 [总体架构规划与开发合并方案](./docs/02_V3架构/总体架构规划与开发合并方案.md)，当前范围与证据见 [Phase9 实施方案](./docs/02_V3架构/Phase9实施方案.md) 和 [Phase9 最终验收记录](./docs/04_测试验证/验收记录/Phase9最终验收记录.md)。

## 开始工作前

1. 阅读 [文档中心](./docs/README.md)。
2. 阅读 [总体架构规划与开发合并方案](./docs/02_V3架构/总体架构规划与开发合并方案.md) 和 [Phase9 实施方案](./docs/02_V3架构/Phase9实施方案.md)。
3. 阅读 [V3 数据模型](./docs/02_V3架构/数据模型.md) 和 [参数体系](./docs/02_V3架构/参数体系.md)。
4. 执行 `npm run verify:full`，确认当前基线。
5. 检查 `.gitignore` 与 [私有资产清单](./私有资产清单.md)。
6. 检查当前分支、目标差异和验收记录；未经项目所有者判断不得提交、推送、合并或进入 Phase10。

## 代码架构

| 区域 | 关键文件 | 当前职责 |
| --- | --- | --- |
| 设计器 | `src/views/DesignerHome.vue` | V3 应用下默认活动页的画布、属性和运行数据接入 |
| 看板模型 | `src/models/dashboard-v3.ts`、`src/models/dashboard.ts` | V3 应用外壳与 V2 组件兼容模型 |
| BI 模型 | `src/models/bi.ts` | 数据集、字段、指标与组件数据绑定 |
| 迁移与存储 | `dashboardMigrationV3.ts`、`dashboardStorageV3.ts` | V1/V2/V3 迁移、备份、单写 V3 |
| 参数 | `parameterRegistry.ts`、`parameterRuntimeV3.ts` | 参数定义管理与会话运行值 |
| 数据计算 | `src/services/queryResult.ts` | 分组、聚合、排序、系列和表格转换 |
| 图表 | `src/components/DataChart.vue` | ECharts 渲染 |
| 数据集管理 | `src/views/DatasetManager.vue` | 数据集 2.0 编辑与字段语义 |
| 本地 API | `server/index.mjs` | 数据源、数据集和只读查询 |

`DesignerHome.vue` 和 `server/index.mjs` 仍然职责集中。Phase9 应继续围绕明确门禁抽离页面与事件边界，不进行无验收目标的全面重写。

## 当前关闭边界

Phase9 已实现页面实体管理、受控事件运行骨架、来源/目标/条件/循环保护，并保持 Phase8 参数和查询运行时兼容。当前只允许补充验收证据和修复关闭门禁缺陷。

不得实现：

- Phase10 的下钻、导航、弹窗、外链等动作执行器。
- 发布快照、服务端看板版本、权限、AI 或算法接口。
- 客户端 SQL、字段名、运算符或字符串模板替换。
- 与 Phase8 验收无关的视觉重构。

## 常用命令

```powershell
.\start-dev.cmd
npm run build
node --experimental-strip-types --test (Get-ChildItem .\tests\*.test.ts)
```

Web 固定为 5174，API 固定为 5175。

## 私有资产边界

以下内容不得进入公开仓库：

- `server/.data/` 及其中的 `secret.key`、数据源和数据集本机状态。
- `.step5-backup/`、`.vite/`、日志、构建产物和依赖目录。
- 数据库密码、Windows Credential、私有数据库连接配置。
- 未经脱敏确认的固定验证库配置、内部截图和真实医疗数据。

完整规则见 [私有资产清单](./私有资产清单.md)。

## 已知风险

- 远端主干尚未包含 Phase7，必须先合并 Phase7 再更新 Phase8 PR。
- Phase8 本地提交仍需通过受保护分支的 PR 与 CI，不能把本地通过等同于远端已合并。
- 服务端数据集目前最多返回 200 行，正式聚合不得继续基于截断样本。
- SSL 的 `verify-ca`、`verify-full` 尚未实现真实证书校验，阻塞非本机生产部署。
- Schema 与 TypeScript 可能漂移，必须共享有效/无效测试样例。
- 前端生产主 Chunk 约 1.50 MB，当前作为非阻塞技术债。
