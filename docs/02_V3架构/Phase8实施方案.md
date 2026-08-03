# Medical BI Designer V3 Phase8 实施方案

Phase8 将 Phase7 已保存的参数定义接入真实查询链路，交付参数运行值、筛选控件、数据集参数声明与绑定、安全条件生成、依赖图、定向刷新和短期查询缓存。实现必须保持设计态与运行态分离，并继续复用现有 V2 组件渲染和数据计算能力。

> 状态：实施中（P8.0）
> 适用范围：Phase8
> 上位文档：[V3整体架构.md](./V3整体架构.md)、[参数体系.md](./参数体系.md)
> 前置条件：[Phase7最终验收记录](../04_测试验证/验收记录/Phase7最终验收记录.md) 已通过

## 1. 当前代码架构

### 数据集与查询服务

数据集仍使用 V2 元数据，`parameters[]` 只有 `id/name/type/required/defaultValue`。数据集管理页能够维护这些字段，但缺少稳定编码、SQL 字段名、空值规则和运算符。

后端 `POST /api/datasets/:id/execute` 不读取请求体，直接把已保存 SQL 交给 `previewQuery`。查询已经具备 SELECT/WITH 白名单、危险关键字拦截、只读事务、超时和最大行数，但尚无参数值校验、参数化条件或查询缓存。

### 看板与组件运行时

V3 根模型已保存应用参数，但参数值尚未进入独立运行时。设计器加载服务端数据集时只按 `datasetId` 请求，页面上绑定同一数据集的组件无法按参数组合区分，也没有依赖图和定向刷新。

组件仍使用 `ComponentDataConfigV2`，没有 `parameterBindings` 与 `refreshPolicy`。`DashboardPageV3.controls` 仍为不透明对象，JSON Schema 规定控件数组最多为 0 项。

## 2. 设计与代码差异

| Phase8 设计要求 | 当前实现 | 差异 |
| --- | --- | --- |
| 参数定义与运行值分离 | 只有参数定义 | 缺少运行时 Store、来源与事务信息 |
| 数据集声明查询参数 | 只有简化参数列表 | 缺少编码、SQL 字段、空值策略和校验 |
| 自动匹配与人工映射 | 无组件参数绑定 | 缺少匹配服务和配置界面 |
| 参数化 SQL | 仅执行静态 SQL | `execute` 不接收参数，无法生成占位符条件 |
| 筛选控件 | `controls[]` 固定为空 | 缺少类型、Schema、渲染和提交模式 |
| 定向刷新 | 按数据集手工刷新 | 缺少参数到组件的依赖图 |
| 请求合并与短期缓存 | 每次直接 `fetch` | 同参数查询可能重复执行 |
| 确定的空值与复合类型规则 | 无运行时校验 | 必填、多选和日期范围没有执行语义 |

## 3. 核心设计决策

### 3.1 安全查询条件

Phase8 不执行字符串模板替换，也不接受客户端 SQL。数据集继续保存经过只读校验的基础 SQL，并为每个查询参数声明一个结果字段和受限运算符。服务端把基础 SQL 包装为子查询，再用 PostgreSQL 占位符追加条件：

```sql
SELECT *
FROM (<validated base SQL>) AS bi_runtime
WHERE "year_code" = $1
  AND "dept_code" = ANY($2)
  AND "stat_date" BETWEEN $3 AND $4
LIMIT $5
```

字段名必须存在于数据集字段元数据并通过标识符校验；运算符只允许 `eq`、`in` 和 `between`。参数值始终通过 `pg` 的 values 数组传递，客户端不能提交字段名、运算符或 SQL 片段。

### 3.2 空值规则

| 场景 | 执行规则 |
| --- | --- |
| 必填参数为空 | 拒绝查询并返回参数编码和原因 |
| `emptyPolicy: reject` | 拒绝查询 |
| `emptyPolicy: omit` | 不生成该参数的 WHERE 条件 |
| `emptyPolicy: null` | 生成 `IS NULL` |
| `emptyPolicy: emptyString` | 绑定空字符串 |
| 空多选数组 | 按空值策略处理，不生成非法 `IN ()` |
| 日期范围 | 必须为合法、正序的两个 ISO 日期，再生成 `BETWEEN` |

### 3.3 运行时与持久化边界

参数当前值、来源、更新时间、事务 ID、查询缓存和请求状态只存在于内存，不写回 V3 JSON。V3 只新增筛选控件定义及组件绑定配置。

## 4. 数据模型变化

```ts
interface DatasetQueryParameterV3 {
  id: string
  code: string
  name: string
  type: ParameterTypeV3
  required: boolean
  sqlName: string
  operator: 'eq' | 'in' | 'between'
  defaultValue?: unknown
  emptyPolicy: 'omit' | 'null' | 'emptyString' | 'reject'
}

interface DatasetParameterBindingV3 {
  datasetParameterCode: string
  parameterId: string
}

interface ComponentDataConfigV3 extends Omit<ComponentDataConfigV2, 'version'> {
  version: 3
  parameterBindings: DatasetParameterBindingV3[]
  refreshPolicy: 'onParameterChange' | 'manual' | 'onPageEnter'
}

interface ParameterRuntimeStateV3 {
  values: Record<string, unknown>
  source: Record<string, 'default' | 'control' | 'system'>
  updatedAt: Record<string, number>
  transactionId: string
}

interface ParameterControlV3 {
  id: string
  type: 'buttonGroup' | 'singleSelect' | 'multiSelect' | 'date' | 'dateRange'
  parameterIds: string[]
  position: Position
  styleConfig: Record<string, unknown>
  interaction: {
    submitMode: 'immediate' | 'manual'
    clearable: boolean
    cascadeFrom?: string[]
  }
}
```

旧数据集参数在读取时补齐稳定 `code`、`sqlName`、`operator` 和 `emptyPolicy`。旧组件继续合法；只有配置参数绑定时才升级其 `dataConfig.version` 为 3。

## 5. 实施顺序

### P8.0 范围与基线

- 固化本实施方案、Phase7 的 62 项测试基线和固定验收地址。
- 建立独立分支 `agent/phase8-query-runtime`。
- 冻结现有静态数据集执行和 V2 组件回归样例。

### P8.1 类型、规范化与校验

- 新增数据集查询参数、组件绑定、控件与运行时类型。
- 数据集服务端规范化旧参数，校验编码、字段、类型、运算符和空值策略。
- 更新 V3 JSON Schema，允许 Phase8 控件和 V3 组件数据配置。

### P8.2 参数运行时

- 从应用参数默认值和受控系统值初始化 Store。
- 支持读取、批量提交、清空、来源记录和事务 ID。
- 相同值不产生变更事务；非法值与缺失必填值返回可定位错误。

### P8.3 数据集参数绑定

- 按参数编码、再按别名生成自动匹配候选。
- 支持组件级人工映射、移除映射和刷新策略。
- 拒绝不存在的参数、重复绑定和类型不兼容关系。

### P8.4 服务端安全查询

- `execute` 接收结构化参数值，不接收 SQL、字段名或运算符。
- 服务端依据已保存元数据生成占位符条件和 values。
- 覆盖必填、空值、多选、日期范围、未知参数和危险输入。

### P8.5 筛选控件与定向刷新

- 在默认页增加筛选控件配置与运行时渲染。
- 支持即时提交和手动提交。
- 建立参数 → 组件依赖图，只刷新 `onParameterChange` 的受影响组件。
- 手工刷新和首次页面进入继续可用。

### P8.6 请求合并与短期缓存

- 查询键由数据集 ID、规范化参数值和限制共同生成。
- 同键并发请求合并；成功结果使用有界短期内存缓存。
- 参数变化产生新键；失败结果不缓存；支持手工强制刷新。

### P8.7 测试、文档与交付

- 执行单元、集成、回归、生产构建和浏览器验收。
- 输出 Phase8 JSON 示例、修改清单、验收记录和遗留风险。
- 固定使用 `http://127.0.0.1:5174/` 验收。

## 6. 验收门禁

Phase8 只有同时满足以下条件才可关闭：

1. 参数运行值不写回 V3 JSON，刷新设计草稿不会混入会话状态。
2. 旧数据集参数和旧 V2/V3 组件仍可读取与执行。
3. 精确编码、别名候选和人工映射都有确定结果。
4. 客户端无法提交 SQL、字段名或运算符，查询值全部使用数据库占位符。
5. 必填、空值、单选、多选和日期范围规则均有自动化覆盖。
6. 参数变化只刷新依赖组件，相同值不重复刷新。
7. 同键查询可合并与缓存，手工刷新能够绕过缓存。
8. 参数控件、绑定、保存、刷新和重新导入通过浏览器验收。
9. Phase7 及 V2 核心测试无回归，生产构建通过。
10. 未提前实现 Phase9 事件总线、多页面或联动动作。

## 7. 风险点

| 风险 | 控制方式 |
| --- | --- |
| 动态字段名导致 SQL 注入 | 字段只能来自已保存元数据，正则校验后由服务端双引号转义 |
| 多选和日期范围占位符规则不一致 | 统一编译器与参数规范化函数，API 与单测共享 |
| 数据集旧参数缺少编码 | 读取时生成稳定编码，保存后固化，不修改原始 SQL |
| 组件绑定升级牵动现有计算 | 使用 V2/V3 数据配置联合类型，渲染层继续读取公共字段 |
| 参数变化产生请求风暴 | 事务去重、依赖图、并发合并和短期缓存共同控制 |
| 缓存返回过期结果 | 缓存仅限运行时短 TTL，手工刷新绕过，失败不缓存 |
| 筛选控件挤压现有画布 | 控件使用独立页面层，Phase8 不改变普通组件布局协议 |
| 前后端类型漂移 | 使用固定 API 夹具和端到端编译结果测试 |

## 8. 阶段边界

Phase8 不实现事件总线、组件点击联动、多页面、跳转、下钻、弹窗、发布快照、权限和 AI。筛选控件只负责写入参数 Store 并驱动依赖刷新，不生成 Phase9 的通用事件动作。
