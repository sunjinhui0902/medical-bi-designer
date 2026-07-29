# Phase7 P7.0 基线

本基线在 Phase7 业务编码开始前冻结 V2 兼容输入、存储入口和回归范围。Phase7 按“V3 外壳 + 默认活动页适配器”渐进实施，后端与数据库保持不变。

## 输入样例

- V1 固定样例：`docs/01_V2版本/示例/dashboard-v1-legacy.json`
- V2 固定样例：`docs/01_V2版本/示例/dashboard-v2-multi-field.json`
- 空白 V2：由现有 `migrateDashboard` 测试夹具构造
- 大组件量样例：在 P7.2 迁移性能测试中程序化生成，避免提交重复业务 JSON

## 当前 LocalStorage Key

| 用途 | Key | Phase7 规则 |
| --- | --- | --- |
| V2 当前草稿 | `medical-bi-designer-dashboard-v2` | 只读兼容，不覆盖 |
| V1 兼容草稿 | `medical-bi-designer-dashboard-v1` | 只读兼容，不覆盖 |
| V3 当前草稿 | `medical-bi-designer-dashboard-v3` | P7.3 起唯一写入格式 |
| V2 迁移备份 | `medical-bi-designer-dashboard-v2-backup` | P7.3 首次迁移前写入 |
| 组件模板 | `medical-bi-designer-component-templates-v1` | Phase7 保持现状 |

P7.3 将上述看板 Key 收敛到存储服务常量；P7.0 只记录现状，不提前改动设计器读写。

## 回归基线

- 当前测试：7 个文件、24 项测试。
- 生产构建：通过。
- 固定人工地址：`http://127.0.0.1:5174/`。
- 已知非阻塞项：生产 JavaScript Chunk 约 1.34 MB。

## 首批修改边界

P7.1 只允许新增 V3/参数类型、默认工厂、JSON Schema、统一校验入口和对应测试，不接入设计器，不增加页面管理，不触发数据集请求，不修改后端或数据库。
