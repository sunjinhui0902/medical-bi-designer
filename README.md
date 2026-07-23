# Medical BI Designer

Medical BI Designer 是面向医疗运营分析场景的低代码 BI 设计器。当前 V2.0 已完成数据集、组件、图表、指标卡与数据计算底座，正在进入 V3 Phase7 的应用模型和参数体系升级。

## 已完成能力

- 管理 PostgreSQL/Greenplum 数据源和只读数据集。
- 配置字段语义、聚合、排序、多维度和多指标。
- 使用指标卡、柱图、折线图、面积图、组合图、饼图、散点图、气泡图和表格。
- 配置双轴、数据标签、预警线、同比、环比和目标进度。
- 在画布上添加、移动、八方向缩放和配置组件。
- 保存、导入和导出 V2 看板 JSON。
- 保存、分类和复用医疗业务组件模板。

## 快速启动

Windows 用户可以双击：

```text
start-dev.cmd
```

脚本会检查 Node.js 和 npm，首次运行时根据 `package-lock.json` 安装依赖，然后启动 Web 与 API 服务并打开浏览器。

手动启动：

```powershell
npm ci
npm run dev
```

- Web：`http://127.0.0.1:5174/`
- API：`http://127.0.0.1:5175/api/health`

完整说明见 [QUICK_START.md](./QUICK_START.md)。

## 技术栈

- 前端：Vue 3、TypeScript、Vite、Vue Router、Tabler UI、ECharts。
- 后端：Node.js ESM 原生 HTTP 服务、`pg`。
- 数据库：PostgreSQL/Greenplum。
- 本地开发存储：LocalStorage 与服务端本机 JSON。

## 项目结构

```text
├── docs/        项目规划、V2 基线、V3 架构、需求和验收资料
├── scripts/     开发启动与维护脚本
├── server/      本地数据源、数据集和只读查询 API
├── src/         Vue 前端源码
├── tests/       模型、计算和组件配置测试
└── start-dev.cmd
```

## 开发入口

- [项目当前状态](./docs/项目当前状态.md)
- [Phase7 开发交接](./docs/02_V3架构/Phase7开发交接.md)
- [AI 开发交接](./AI_Development_Handover.md)
- [文档中心](./docs/README.md)

## Release 与公开边界

本仓库尚未完成 GitHub Release 门禁，也尚未选择开源许可证。正式公开前必须完成：

- [Release 准备任务](./docs/00_项目规划/Release准备任务.md)
- [开源清单](./开源清单.md)
- [私有资产清单](./私有资产清单.md)

在许可证、敏感配置脱敏和截图数据审查完成前，不应将仓库设为公开。
