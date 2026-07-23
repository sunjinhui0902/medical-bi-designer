# AI Development Handover

本文是新 AI 开发会话的最短交接入口。当前业务版本为 V2.0，下一开发阶段为 V3 Phase7；不得跳过 Phase7 直接实现参数运行时、多页面或联动。

## 当前状态

- V2 数据集、组件、图表、指标卡和数据计算底座已完成。
- 生产构建通过。
- 7 个测试文件共 24 项测试通过。
- V3 业务代码尚未开始。
- Git 仓库当前没有提交和远程地址，文件仍未形成正式基线。

权威状态见 [项目当前状态](./docs/项目当前状态.md)，Phase7 技术分析见 [Phase7 开发交接](./docs/02_V3架构/Phase7开发交接.md)。

## 开始工作前

1. 阅读 [文档中心](./docs/README.md)。
2. 阅读 [Phase7 实施方案](./docs/02_V3架构/Phase7实施方案.md)。
3. 阅读 [V3 数据模型](./docs/02_V3架构/数据模型.md) 和 [参数体系](./docs/02_V3架构/参数体系.md)。
4. 执行 `npm run build` 和全部测试，确认 V2 基线。
5. 检查 `.gitignore` 与 [私有资产清单](./私有资产清单.md)。
6. 在用户确认后建立 V2 Git 基线，再开始 Phase7 编码。

## 代码架构

| 区域 | 关键文件 | 当前职责 |
| --- | --- | --- |
| 设计器 | `src/views/DesignerHome.vue` | V2 看板状态、画布、属性、存储、导入导出 |
| 看板模型 | `src/models/dashboard.ts` | 单页 `DashboardModelV2` |
| BI 模型 | `src/models/bi.ts` | 数据集、字段、指标与组件数据绑定 |
| 迁移 | `src/services/dashboardMigration.ts` | V1/V2 规范化为 V2 |
| 数据计算 | `src/services/queryResult.ts` | 分组、聚合、排序、系列和表格转换 |
| 图表 | `src/components/DataChart.vue` | ECharts 渲染 |
| 数据集管理 | `src/views/DatasetManager.vue` | 数据集 2.0 编辑与字段语义 |
| 本地 API | `server/index.mjs` | 数据源、数据集和只读查询 |

`DesignerHome.vue` 职责集中。Phase7 应先抽离 V3 模型、迁移、存储和活动页适配器，不在同一阶段全面重写设计器。

## Phase7 范围

必须实现：

- V3 TypeScript 模型与 JSON Schema。
- V1 → V2 → V3、V2 → V3 和 V3 幂等读取。
- 双读、单写 V3、旧草稿备份与失败回退。
- 参数定义、系统模板、内置字典、校验和参数中心。
- 默认单页活动页适配器。
- 自动化测试和 V2 回归。

不得实现：

- 参数控件运行时。
- 数据集参数绑定或 SQL 参数注入。
- 页面管理、联动、下钻、导航或发布。
- 后端看板存储、数据库 DDL、权限、AI 或算法接口。
- 与架构无关的气泡图、坐标轴视觉优化。

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

- V2 迁移器会裁剪未知字段。
- 应用参数与数据集查询参数名称相近，但语义不同。
- 根模型和页面 ID 需要稳定生成规则。
- Schema 与 TypeScript 可能漂移，必须共享有效/无效测试样例。
- 前端生产 Chunk 约 1.34 MB，当前作为非阻塞技术债。
- GitHub 公开发布受许可证和敏感资产脱敏阻断。
