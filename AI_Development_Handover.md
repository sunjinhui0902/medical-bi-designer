# AI Development Handover

本文是新开发会话的最短交接入口。当前 V2 可视化底座、V3 Phase7 和 Phase8 已完成本地验收；下一步是 Phase9 多页面与事件基础设计，不得把 Phase10 联动动作提前塞入 Phase9。

## 当前状态

- V2 数据集、组件、图表、指标卡和数据计算底座已完成。
- V3 JSON、Schema、迁移、存储、参数中心和设计器兼容接入已通过 Phase7 验收。
- Phase8 参数运行时、绑定、筛选控件、服务端安全聚合、定向刷新和短期查询缓存已实现。
- 95 项 Node 测试、5 项 Chromium 测试、生产构建和依赖审计通过。
- 当前分支为 `agent/phase8-query-runtime`，远端合并状态必须在开始 Phase9 前重新核对。
- Phase8 本地提交形成后仍需按总体合并方案经 PR 与 CI 进入受保护主干。

权威状态见 [项目当前状态](./docs/项目当前状态.md)，总体架构和 PR 顺序见 [总体架构规划与开发合并方案](./docs/02_V3架构/总体架构规划与开发合并方案.md)，当前功能范围见 [Phase8 实施方案](./docs/02_V3架构/Phase8实施方案.md)。

## 开始工作前

1. 阅读 [文档中心](./docs/README.md)。
2. 阅读 [总体架构规划与开发合并方案](./docs/02_V3架构/总体架构规划与开发合并方案.md) 和 [Phase8 实施方案](./docs/02_V3架构/Phase8实施方案.md)。
3. 阅读 [V3 数据模型](./docs/02_V3架构/数据模型.md) 和 [参数体系](./docs/02_V3架构/参数体系.md)。
4. 执行 `npm run build` 和全部测试，确认当前基线。
5. 检查 `.gitignore` 与 [私有资产清单](./私有资产清单.md)。
6. 检查当前分支、提交范围和 CI 状态，确认 Phase8 已进入目标基线后再创建 Phase9 分支。

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

## 下一阶段边界

Phase9 应先设计：

- 页面实体管理与默认页切换。
- 统一事件模型的最小运行骨架。
- 事件来源、目标、条件和循环深度保护。
- Phase8 参数与查询运行时继续保持兼容。

不得实现：

- 页面管理、通用事件总线、组件点击联动、下钻、导航或弹窗。
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
