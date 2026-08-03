# Phase7 交付说明

Phase7 已完成 V3 JSON 根模型、V1/V2 迁移、双读单写存储、参数中心和设计器兼容接入。现有 V2 组件、图表、指标卡、数据计算和数据集链路继续工作；本阶段未修改后端接口或 PostgreSQL/Greenplum 表结构。

交付日期：2026-08-03

## 交付范围

本次交付覆盖 `Phase7实施方案.md` 定义的 P7.0—P7.7：

- 建立 V3 TypeScript 模型、默认工厂、JSON Schema 和统一校验入口。
- 支持 V1 → V2 → V3、V2 → V3 和 V3 幂等读取，并输出迁移报告。
- 建立 V3 优先读取、旧草稿备份、校验后写入和失败回退机制。
- 导入兼容 V1/V2/V3，保存和导出统一使用 V3。
- 建立参数注册表、六类参数校验、八个系统模板和三个内置字典。
- 增加参数中心的搜索、新建、编辑、复制、删除和持久化能力。
- 通过默认活动页适配器让现有单页设计器接入 V3 根模型。

以下内容仍不属于 Phase7：参数运行值与控件、数据集参数绑定、SQL 条件生成、组件联动、多页面管理、权限、发布运行时、查询缓存和 AI 能力。

## 数据模型变化

V2 的根级画布模型升级为 V3 应用模型：

```text
DashboardModelV2
├── canvas
├── titleStyle
└── components[]

DashboardApplicationV3
├── id / name / defaultPageId
├── parameters[]
├── pages[]
│   └── 默认活动页
│       ├── canvas
│       ├── titleStyle
│       ├── controls[]
│       ├── components[]
│       └── pageEvents[]
├── theme
├── runtimePolicy
├── extensionRefs
└── publishConfig?
```

Phase7 固定使用一个默认活动页，`controls[]` 与 `pageEvents[]` 保持为空。现有组件继续使用原有结构，由适配器完成根模型与页面视图之间的转换。

## 持久化与迁移

| 用途 | LocalStorage Key | 规则 |
| --- | --- | --- |
| V3 当前草稿 | `medical-bi-designer-dashboard-v3` | 唯一写入格式 |
| V2 兼容草稿 | `medical-bi-designer-dashboard-v2` | 只读，不覆盖 |
| V1 兼容草稿 | `medical-bi-designer-dashboard-v1` | 只读，不覆盖 |
| V2 迁移备份 | `medical-bi-designer-dashboard-v2-backup` | 首次迁移前写入 |
| V1 迁移备份 | `medical-bi-designer-dashboard-v1-backup` | 首次迁移前写入 |
| 无效 V3 备份 | `medical-bi-designer-dashboard-v3-invalid-backup` | 回退前保留损坏原文 |

存储读取顺序为 V3、V2、V1、默认空白 V3。新草稿只有通过 Schema 与语义校验后才会替换当前 V3；备份失败或导入文件损坏、超限时，不覆盖有效草稿。

## 主要文件

新增的核心实现：

- `src/models/dashboard-v3.ts`、`src/models/parameters.ts`：V3 应用与参数类型。
- `src/schemas/dashboard-v3.schema.json`、`src/services/dashboardValidationV3.ts`：结构及语义校验。
- `src/services/dashboardMigrationV3.ts`：版本识别与迁移编排。
- `src/services/dashboardStorageV3.ts`：双读单写、备份、恢复和导入导出。
- `src/services/dashboardDesignerAdapterV3.ts`：默认活动页兼容层。
- `src/services/parameterRegistry.ts`、`src/services/parameterValidation.ts`：参数注册与校验。
- `src/data/systemParameters.ts`、`src/data/builtinDictionaries.ts`：系统模板与内置字典。
- `src/views/ParameterManager.vue`、`src/styles/parameter-manager.css`：参数中心界面。
- `docs/02_V3架构/示例/dashboard-v3-phase7.json`：脱敏 V3 交付示例。

修改的主要入口：

- `src/views/DesignerHome.vue`：加载、保存、导入和导出接入 V3。
- `src/router/index.ts`、`src/views/DataSourceManager.vue`、`src/views/DatasetManager.vue`：参数中心路由与导航入口。
- `package.json`、`package-lock.json`、`src/json.d.ts`：Schema 校验依赖与 JSON 类型声明。

验证文件包括六组 Phase7 专项测试和 `tests/phase7-delivery.test.ts`。完整验收证据见 [Phase7 最终验收记录](../04_测试验证/验收记录/Phase7最终验收记录.md)。

## 验证结果

| 检查项 | 结果 |
| --- | --- |
| 自动化测试 | 62/62 通过 |
| TypeScript 与生产构建 | 通过 |
| 依赖安全审计 | 0 个漏洞 |
| V3 示例校验及导出再导入 | 通过 |
| 500 组件 V2 迁移 | 数量和顺序保持，约 59 ms |
| 200 参数注册、搜索和编辑 | 通过，约 13 ms |
| 固定地址浏览器验收 | `http://127.0.0.1:5174/` 通过 |
| 实际 `.v3.json` 文件下载 | 用户确认成功 |
| 页面控制台应用错误 | 0 |

## 已知风险

- 生产构建的主 JavaScript Chunk 约 1.50 MB，Vite 给出大体积警告。当前不影响功能验收，后续应通过路由级动态加载、ECharts 按需引入和手工分包治理。
- `DesignerHome.vue` 仍承担较多职责。Phase7 仅增加边界适配，没有完成设计器模块化拆分。
- V3 当前仍使用浏览器本地草稿，尚无服务端版本、发布快照、多用户并发或权限控制。
- 参数目前只有定义和配置能力，尚未进入查询运行时；Phase8 必须通过结构化条件生成接入数据集，禁止字符串拼接 SQL。
- `package.json` 工程版本仍为 `0.1.0`，与业务版本 V2.0/V3 阶段命名尚未统一。

## 下一步

下一阶段进入 Phase8 前置设计与实施，优先顺序为参数运行值、筛选控件、数据集字段绑定、安全查询条件生成和组件刷新机制。页面管理、统一事件与联动继续按整体路线在后续阶段实施。
