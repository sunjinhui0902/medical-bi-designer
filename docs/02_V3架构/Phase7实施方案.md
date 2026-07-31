# 医疗 BI Designer V3 Phase7 详细任务拆解

> 状态：实施中（P7.0—P7.6 已完成，下一步 P7.7）
> 适用范围：Phase7
> 上位文档：[V3整体架构.md](./V3整体架构.md)
> 优先级：若本文与上位文档的 Phase7 描述存在差异，以本文为准。

## 1. 结论与边界

Phase7 只交付以下三项核心能力：

1. V3 JSON 模型；
2. V1/V2 到 V3 的迁移、校验、备份与回退机制；
3. 参数中心基础能力。

Phase7 不实现参数与数据集绑定、SQL 参数注入、组件联动、下钻、页面管理、权限控制、查询缓存、AI 语义层或算法挖掘。`pages[]`、扩展引用等字段只作为 V3 稳定结构的一部分建立，不在本阶段提供对应业务界面或运行逻辑。

气泡图、坐标轴等视觉优化作为独立小任务处理，与 Phase7 核心架构分支、测试和验收门禁隔离，不能阻塞或扩大 Phase7。

## 2. Phase7 交付清单

| 编号 | 交付项 | 本阶段完成标准 |
| --- | --- | --- |
| P7-01 | V3 TypeScript 模型 | 根模型、页面容器、参数、运行策略和扩展引用均有明确类型 |
| P7-02 | V3 JSON Schema | 可校验合法 V3 文档并给出可定位的错误信息 |
| P7-03 | 迁移器 | 支持 V1 → V2 → V3、V2 → V3、V3 幂等读取 |
| P7-04 | 存储适配 | 双读、单写 V3，迁移前保留旧数据备份 |
| P7-05 | 导入导出适配 | 可导入 V1/V2/V3，统一导出 V3 |
| P7-06 | 参数注册与校验 | 参数增删改查、编码唯一性、类型及默认值校验 |
| P7-07 | 参数中心界面 | 支持搜索、创建、编辑、删除和基础参数模板 |
| P7-08 | 设计器兼容层 | 现有单页设计器通过活动页适配器继续工作 |
| P7-09 | 自动化与人工验收 | 构建通过，迁移、参数和原有设计器均完成回归 |

## 3. 数据表与持久化设计

### 3.1 Phase7 数据库变更

Phase7 新增数据库表数量：**0**。

本阶段继续使用浏览器本地草稿和 JSON 文件完成验证，不修改 PostgreSQL 表结构，不修改现有数据源、数据集及查询 API。这样可先稳定文档模型与迁移链路，避免把存储服务化、权限和发布机制提前混入 Phase7。

### 3.2 本地持久化

| 数据 | 建议存储位置 | 读写规则 |
| --- | --- | --- |
| V3 当前草稿 | `medical-bi-designer-dashboard-v3` | Phase7 唯一写入格式 |
| 当前 V2 草稿 | 保留项目现有 V2 Key | 只读兼容，不覆盖 |
| V2 迁移备份 | `medical-bi-designer-dashboard-v2-backup` | 首次成功迁移前写入 |
| 系统参数模板 | 前端静态注册表 | 不作为用户草稿单独持久化 |
| 内置字典 | 前端静态注册表 | 本阶段只读 |

实施时应先核实现有 LocalStorage Key，若与上述建议命名不同，沿用现有 Key，并通过常量集中管理，不能在多个文件中散落字符串。

### 3.3 未来数据表保留

以下表名只用于未来架构定位，Phase7 不创建、不迁移、不调用：

| 未来表 | 预留用途 | 预计阶段 |
| --- | --- | --- |
| `bi_dashboard_application` | 应用主记录 | 发布与服务化阶段 |
| `bi_dashboard_version` | JSON 版本、发布版本和历史版本 | 发布与版本管理阶段 |
| `bi_resource_permission` | 用户、角色、资源权限 | 权限体系阶段 |
| `bi_query_cache_policy` | 查询缓存策略 | 查询优化阶段 |
| `bi_semantic_layer_binding` | AI 语义层绑定 | AI 扩展阶段 |
| `bi_algorithm_provider_binding` | 算法服务绑定 | 算法挖掘阶段 |

## 4. V3 JSON 结构

### 4.1 根结构

```json
{
  "version": 3,
  "id": "dashboard-001",
  "name": "医疗运营驾驶舱",
  "defaultPageId": "page-home",
  "parameters": [],
  "pages": [
    {
      "id": "page-home",
      "name": "首页",
      "code": "home",
      "order": 1,
      "type": "standard",
      "canvas": {
        "width": 1200,
        "height": 600
      },
      "titleStyle": {},
      "controls": [],
      "components": [],
      "pageEvents": []
    }
  ],
  "theme": {
    "id": "medical-light",
    "tokens": {}
  },
  "runtimePolicy": {
    "previewScaleMode": "width",
    "allowScroll": true,
    "parameterPersistence": "session",
    "maxEventDepth": 10
  },
  "extensionRefs": {}
}
```

### 4.2 Phase7 对页面结构的限制

- V3 必须使用 `pages[]`，以免未来多页面再次破坏根结构。
- Phase7 只允许创建和使用一个默认页。
- 不提供页面新增、复制、删除、排序或切换界面。
- 现有画布、标题和组件数据原样放入默认页。
- `controls[]` 和 `pageEvents[]` 固定为空数组，仅保证后续 JSON 兼容。

### 4.3 参数结构

```json
{
  "id": "parameter-year",
  "code": "year_code",
  "name": "年度",
  "type": "singleSelect",
  "scope": "application",
  "required": false,
  "defaultValue": "2026",
  "source": {
    "kind": "dictionary",
    "dictionaryCode": "builtin.year"
  },
  "validation": {
    "allowEmpty": true
  },
  "aliases": []
}
```

Phase7 支持的参数类型：

- `string`
- `number`
- `date`
- `dateRange`
- `singleSelect`
- `multiSelect`

Phase7 可创建的数据来源：

- `static`：参数中直接保存选项；
- `dictionary`：引用内置字典；
- `system`：使用系统上下文产生默认值。

数据集字段、派生表达式和远程字典来源不在 Phase7 实现。后续 Schema 扩展时必须通过带判别字段的联合类型新增来源，不能改变已有来源的含义。

### 4.4 参数中心基础能力

本阶段包括：

- 参数列表与编码、名称搜索；
- 创建、编辑、复制和删除参数；
- 参数编码唯一性校验；
- 参数名称、类型、是否必填、默认值配置；
- 静态选项维护；
- 内置字典选择；
- 系统参数模板一键创建；
- 删除前确认；
- 保存后刷新仍可恢复；
- 随看板 V3 JSON 一起导入和导出。

本阶段不包括：

- 参数控件渲染到画布；
- 参数运行值管理；
- 参数绑定数据集或字段；
- SQL 模板替换；
- 参数联动组件刷新；
- 应用级与页面级参数冲突处理。

`scope` 字段在 Phase7 固定写入 `application`，`page` 仅作为未来枚举值保留。

### 4.5 系统参数模板和内置字典

系统参数模板至少包含：

| 参数编码 | 名称 | 建议类型 |
| --- | --- | --- |
| `year_code` | 年度 | `singleSelect` |
| `month_code` | 月份 | `singleSelect` |
| `b_date` | 开始日期 | `date` |
| `e_date` | 结束日期 | `date` |
| `code_lv1` | 一级机构 | `singleSelect` |
| `code_lv2` | 二级机构 | `singleSelect` |
| `doctor_code` | 医生 | `singleSelect` |
| `flag` | 标识 | `string` |

内置字典至少包含：

- `builtin.year`
- `builtin.month`
- `builtin.dateShortcut`

机构和医生参数在 Phase7 只创建参数定义，不加载真实选项，避免提前引入数据集依赖。

## 5. 迁移机制

### 5.1 迁移路径

```text
V1 JSON ──现有迁移器──> V2 JSON ──新迁移器──> V3 JSON
V2 JSON ──────────────────────────> V3 JSON
V3 JSON ──────────────────────────> 校验后原样使用
```

### 5.2 V2 到 V3 的字段映射

| V2 字段 | V3 字段 | 规则 |
| --- | --- | --- |
| `version` | `version` | 固定写为 `3` |
| `id` | `id` | 有值沿用，无值生成 |
| `name` | `name` | 原样沿用 |
| `canvas` | `pages[0].canvas` | 原样迁移，缺失时使用 `1200 × 600` |
| `titleStyle` | `pages[0].titleStyle` | 原样迁移 |
| `components` | `pages[0].components` | 顺序、图层和配置原样保留 |
| 不存在 | `parameters` | 初始化为空数组 |
| 不存在 | `pages[0].controls` | 初始化为空数组 |
| 不存在 | `pages[0].pageEvents` | 初始化为空数组 |
| 不存在 | `theme` | 写入默认主题引用 |
| 不存在 | `runtimePolicy` | 写入安全默认值 |
| 不存在 | `extensionRefs` | 初始化为空对象 |

默认页 ID 必须使用稳定规则生成。对同一份输入重复迁移应得到相同的 ID，避免每次打开都被判断为新页面。

### 5.3 双读单写

读取顺序：

1. 读取并校验 V3 草稿；
2. 若没有 V3，则读取 V2 草稿并迁移；
3. 若识别为 V1，则先执行现有 V1 → V2，再执行 V2 → V3；
4. 全部失败时才创建空白 V3 草稿。

写入规则：

- 设计器保存、本地自动保存和 JSON 导出统一写 V3；
- 不回写或覆盖 V1/V2；
- 首次迁移成功前保存旧 JSON 备份；
- 新 V3 通过 Schema 校验后，才替换当前草稿；
- 迁移失败时继续保留旧数据，并显示可理解的失败原因。

### 5.4 迁移报告

迁移结果至少返回：

```ts
interface MigrationReport {
  sourceVersion: 1 | 2 | 3
  targetVersion: 3
  success: boolean
  warnings: string[]
  errors: string[]
  generatedIds: string[]
  migratedAt: string
}
```

要求：

- V3 输入幂等，不重复包裹页面；
- 迁移函数不修改原始对象；
- 未识别但安全的扩展字段尽量保留；
- 无法安全迁移的字段写入告警，不静默删除；
- 密钥、密码和数据库凭据不得进入迁移报告或 V3 JSON。

## 6. 未来扩展接口

### 6.1 JSON 引用

```json
{
  "extensionRefs": {
    "permissionPolicyRef": "permission-policy-id",
    "queryCachePolicyRef": "cache-policy-id",
    "semanticLayerRef": "semantic-layer-id",
    "algorithmProviderRefs": ["algorithm-provider-id"]
  }
}
```

Phase7 只允许这些字段作为不透明引用随 JSON 保存和迁移，不解析、不调用、不提供配置界面。

### 6.2 TypeScript 契约

可在 V3 模型层预留最小接口：

```ts
interface PermissionProvider {
  can(action: string, resource: string): Promise<boolean>
}

interface QueryCacheProvider {
  get(key: string): Promise<unknown | undefined>
  set(key: string, value: unknown, ttlSeconds?: number): Promise<void>
}

interface SemanticLayerProvider {
  resolveMetric(metricCode: string): Promise<unknown>
}

interface AlgorithmProvider {
  execute(algorithmCode: string, input: unknown): Promise<unknown>
}
```

Phase7 不实现 Provider、不注册实例，也不在运行链路中调用。接口不得包含固定厂商、真实地址、凭据或数据库结构。

## 7. 修改文件规划

以下为实施期的目标文件清单。实际开发前先核对当前目录结构；如现有职责已有对应文件，应在原文件扩展，避免重复服务。

### 7.1 新增文件

| 文件 | 作用 |
| --- | --- |
| `src/models/dashboard-v3.ts` | V3 根模型、页面容器、运行策略和扩展引用 |
| `src/models/parameters.ts` | 参数类型、来源、校验和系统模板类型 |
| `src/schemas/dashboard-v3.schema.json` | V3 运行时 JSON 校验规则 |
| `src/services/dashboardMigrationV3.ts` | V2 → V3 及迁移编排 |
| `src/services/dashboardStorageV3.ts` | 双读、单写、备份和恢复 |
| `src/services/parameterRegistry.ts` | 参数增删改查及模板注册 |
| `src/services/parameterValidation.ts` | 参数编码、类型和默认值校验 |
| `src/data/systemParameters.ts` | 系统参数模板 |
| `src/data/builtinDictionaries.ts` | 年、月、日期快捷项等内置字典 |
| `src/views/ParameterManager.vue` | 参数中心页面 |
| `src/styles/parameter-manager.css` | 参数中心独立样式 |

### 7.2 修改文件

| 文件 | 修改范围 |
| --- | --- |
| `src/router/index.ts` | 新增参数中心路由 |
| `src/views/DesignerHome.vue` | 接入 V3 读写及活动页适配器 |
| `src/models/dashboard.ts` | 保留 V2 类型，仅补充兼容导出或弃用说明 |
| `src/services/dashboardMigration.ts` | 保留 V1 → V2，并供 V3 迁移编排调用 |
| 现有导航组件 | 增加“参数中心”入口，不改变其他导航行为 |
| 现有导入导出服务 | 接入版本识别、V3 校验和迁移报告 |

### 7.3 测试文件

| 文件 | 覆盖范围 |
| --- | --- |
| `tests/phase7-dashboard-v3.test.ts` | V3 Schema 和默认模型 |
| `tests/phase7-migration-v3.test.ts` | V1/V2/V3 迁移路径 |
| `tests/phase7-storage-v3.test.ts` | 双读单写、备份和恢复 |
| `tests/phase7-parameter-registry.test.ts` | 参数增删改查和模板 |
| `tests/phase7-parameter-validation.test.ts` | 编码、类型、默认值和选项校验 |
| 现有设计器测试 | V3 活动页兼容回归 |

上述路径是任务拆解，不代表本次已创建业务文件。

## 8. 前后端影响

### 8.1 前端影响

主要影响：

- 看板根对象从 V2 单画布模型切换为 V3 应用模型；
- 设计器通过 `activePage` 或等价适配器读取默认页；
- 本地保存、自动保存、导入和导出改用 V3；
- 新增参数中心路由与管理界面；
- 原组件渲染、数据绑定和属性配置继续读取默认页内的组件，不做业务重构。

控制原则：

- 不要求所有组件一次性认识 V3 根模型；
- 组件层继续接收原有组件数据结构；
- 根级 V3 到当前页的转换集中在适配层；
- Phase7 不修改图表配置模型，不趁机处理气泡图和坐标轴。

### 8.2 后端影响

Phase7 后端影响：**无**。

- 不修改服务端路由；
- 不新增或修改 PostgreSQL 表；
- 不修改 ODR 固定验证数据源；
- 不修改数据集执行接口；
- 不实现参数查询、SQL 拼接或缓存接口；
- 不实现权限、AI 或算法接口。

若实施时发现现有保存逻辑实际依赖后端，应先停止扩张范围，仅增加 V3 JSON 透传能力，并单独记录偏差，不在 Phase7 引入版本发布服务。

## 9. 详细开发顺序

### P7.0 范围与现状基线

- 盘点现有 V1/V2 类型、LocalStorage Key、导入导出入口；
- 固化一份 V2 真实样例和一份空白样例；
- 记录当前自动化测试基线；
- 确认 Phase7 文件修改清单。

完成条件：范围清单、样例和基线齐全，未开始业务扩张。

### P7.1 V3 类型与 Schema

- 建立 V3 根模型和单页容器；
- 建立参数模型；
- 增加扩展引用；
- 编写 JSON Schema；
- 建立默认 V3 工厂函数。

完成条件：合法样例通过，错误版本、缺失页面、重复参数编码等非法样例被拒绝。

### P7.2 迁移器

- 复用现有 V1 → V2；
- 实现 V2 → V3；
- 实现版本识别和迁移编排；
- 输出迁移报告；
- 验证幂等、不变性和字段保留。

完成条件：固定样例迁移结果稳定，组件数量、顺序、位置、配置与 V2 一致。

### P7.3 存储与导入导出

- 接入 V3 优先读取；
- 建立旧草稿备份；
- 保存统一写 V3；
- 导入时识别版本并迁移；
- 导出时只生成 V3；
- 失败时恢复旧草稿并提示。

完成条件：刷新、重新打开、导入导出均不丢失数据。

### P7.4 参数注册、模板和校验

- 实现参数注册表；
- 实现编码唯一性和默认值校验；
- 注册系统参数模板；
- 注册内置字典；
- 实现参数 JSON 序列化。

完成条件：参数服务单元测试全部通过。

### P7.5 参数中心界面

- 实现列表、搜索、创建、编辑、复制和删除；
- 实现参数类型、默认值、静态选项及字典配置；
- 实现系统模板一键创建；
- 接入 V3 草稿保存。

完成条件：页面操作可持久化，但不触发任何数据集查询或组件刷新。

### P7.6 设计器兼容接入

- 建立默认活动页适配器；
- 设计器加载和保存使用 V3；
- 保证现有组件库、画布、配置区和数据集入口行为不变；
- 验证旧 V2 看板打开后的视觉和交互一致。

完成条件：V3 改造不造成现有设计器功能回归。

### P7.7 测试、文档与交付

- 执行单元、集成和回归测试；
- 固定使用 `http://127.0.0.1:5174/` 人工验收；
- 输出修改说明、文件列表、JSON 示例、测试结果和风险；
- 保留 V2 迁移前备份。

完成条件：满足第 11 节验收门禁。

## 10. 测试方案

### 10.1 单元测试

V3 模型：

- 默认画布为 `1200 × 600`；
- 至少有一个默认页；
- `defaultPageId` 必须指向存在的页面；
- 参数编码在同一应用内唯一；
- 未知扩展引用可安全往返。

迁移：

- V2 根级画布、标题和组件正确进入默认页；
- V1 可通过链式迁移到 V3；
- V3 重复迁移结果不变；
- 输入对象不被修改；
- 缺失可选字段使用默认值；
- 非法版本和损坏 JSON 给出明确错误；
- 同一输入生成稳定 ID；
- 迁移报告不包含连接密码等敏感信息。

参数：

- 各参数类型接受正确默认值并拒绝错误类型；
- `dateRange` 必须为合法起止值；
- `multiSelect` 默认值必须为数组；
- 静态选项值不能重复；
- 编码只能使用约定字符且不能重复；
- 系统参数模板复制后产生独立实例；
- 删除、复制和重命名不破坏其他参数。

存储：

- V3 存在时优先读取；
- 只有 V2 时自动迁移；
- 迁移前保留 V2 备份；
- Schema 校验失败时不覆盖当前草稿；
- 导出再导入后 JSON 语义一致。

### 10.2 集成测试

1. 使用现有 V2 看板启动设计器；
2. 自动迁移为内存中的 V3；
3. 检查组件数量、顺序、图层、位置和配置；
4. 保存并刷新；
5. 确认再次读取 V3，不重复迁移；
6. 创建、编辑、复制和删除参数；
7. 刷新后确认参数仍存在；
8. 导出 V3，再导入到空白环境；
9. 确认看板和参数完整恢复；
10. 模拟损坏 JSON，确认旧草稿仍可恢复。

### 10.3 回归测试

- 组件拖入和八方向缩放；
- 图层顺序和新增组件置顶；
- 组件配置、样式、交互和布局面板；
- 数据源、数据集和数据集 2.0 入口；
- 已保存业务组件和分类；
- 原有 V2 JSON 样例打开；
- 当前项目全部自动化测试；
- `npm run build`。

Phase7 不以气泡图和坐标轴视觉问题作为核心回归失败项，但必须确认本阶段没有新增相关回归。

### 10.4 性能与容量测试

- 使用至少 500 个组件的 V2 JSON 执行迁移；
- 迁移过程不阻塞浏览器到不可操作；
- 迁移只执行一次，不在每次状态更新时重复执行；
- 参数列表达到 200 项时搜索和编辑仍可正常使用；
- 导入异常大文件时给出限制或错误，不造成草稿损坏。

### 10.5 人工验收清单

- [ ] V2 看板第一次打开后内容完整；
- [ ] 刷新后不再次弹出迁移或生成重复页面；
- [ ] V3 JSON 可导出并重新导入；
- [ ] 迁移失败时旧草稿仍在；
- [ ] 参数中心可搜索、新建、编辑、复制和删除；
- [ ] 重复参数编码无法保存；
- [ ] 参数默认值与类型不匹配时有明确提示；
- [ ] 系统参数模板可一键创建；
- [ ] 参数刷新后仍存在；
- [ ] 参数操作不触发数据集请求；
- [ ] 设计器原有画布和组件操作未回归；
- [ ] 验证地址固定为 `http://127.0.0.1:5174/`。

## 11. Phase7 验收门禁

只有同时满足以下条件，Phase7 才能判定完成：

1. V3 TypeScript 模型和 JSON Schema 一致；
2. V1/V2/V3 三类输入均有明确处理结果；
3. 迁移具备备份、校验、报告和失败回退；
4. 设计器只写 V3，且原 V2 看板可无损打开；
5. 参数中心基础增删改查和校验可用；
6. 不存在数据库 DDL、查询接口、联动或权限实现；
7. 自动化测试和构建通过；
8. 人工验收清单通过；
9. 输出修改说明、文件清单、V3 JSON 示例和测试结果。

## 12. 独立视觉优化任务

任务编号建议：`UI-FIX-01 气泡图与坐标轴视觉修复`。

范围可包括：

- 气泡图 Y 轴标题显示；
- 气泡图分类名、X 值、Y 值和气泡大小的标签及提示；
- 坐标轴方向箭头和颜色一致性；
- 标题隐藏时同步隐藏左侧六点标识；
- 图例位置配置；
- 双轴或组合图的独立标签配置。

隔离要求：

- 不修改 V3 根结构和参数模型；
- 不依赖参数中心完成；
- 独立提交、独立测试、独立验收；
- 视觉任务未完成不阻塞 Phase7；
- 若视觉任务需要改变通用图表 JSON，必须另行评审，不能隐式并入 Phase7。

## 13. 主要风险与控制

| 风险 | 控制方式 |
| --- | --- |
| V3 改造牵动所有组件 | 使用活动页适配器，组件层继续接收原结构 |
| 旧草稿被新格式覆盖 | 先备份、后校验、最后写入 V3 |
| 多页面能力提前膨胀 | Phase7 固定单页，不提供页面管理 |
| 参数中心提前耦合数据集 | 只实现静态、内置字典和系统模板 |
| 未来接口污染当前模型 | 只保存不透明引用，不实现 Provider |
| 视觉修复干扰架构验证 | 独立任务、独立提交和验收门禁 |
| Schema 与 TypeScript 漂移 | 使用同一组有效/无效样例进行双重测试 |

## 14. Phase7 完成后的下一步

Phase7 验收通过后，再进入参数的数据链路阶段，依次讨论：

1. 参数运行值与控件；
2. 参数绑定数据集字段；
3. 安全的查询条件生成；
4. 组件刷新机制；
5. 联动、下钻和导航。

在 Phase7 完成前，不提前实现上述能力。
