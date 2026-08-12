# Medical BI Designer

Medical BI Designer 是一个面向医疗运营分析场景的开源低代码 BI 设计器，目标是将数据源、数据集、指标体系、可视化组件、参数联动和 AI 辅助分析整合到统一的平台中。
当前 V2.0 可视化底座、V3 Phase7 应用模型、Phase8 参数运行时与 Phase9 多页面及事件基础均已完成本地验收，后续将继续推进应用交互、发布治理和 AI Analytics 能力。

v0.1.0 is the first public Open Source release of Medical BI Designer, based on the existing V2.0 development baseline.
v0.1.0 为 Medical BI Designer 的首个公开开源版本，基于现有 V2.0 开发基线发布。

## Preview

![Medical BI Designer](./docs/04_测试验证/截图/step5.1-真实数据集绑定验收截图.png)

## 开源许可 / License

Medical BI Designer is Open Source software licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

Medical BI Designer 是一个开源医疗低代码 BI 设计器，采用 GNU Affero General Public License v3.0（AGPL-3.0）开源许可证。
本仓库公开提供项目源码、脱敏示例、设计文档和验收材料，欢迎开发者用于学习、研究、部署、改进和贡献。

具体授权范围和义务请参阅 [LICENSE](./LICENSE)。

Copyright (C) 2026 sunjinhui0902.

## 数据与隐私边界

为保护医疗数据安全，真实数据库凭据、患者数据、医院内部 SQL、生产环境配置及其他敏感资产不会包含在公开仓库中。
公开仓库仅包含经过审查的源码、脱敏示例、开发文档、测试材料和可公开的配置示例。

## 已完成能力

- 管理 PostgreSQL/Greenplum 数据源和只读数据集。
- 配置字段语义、聚合、排序、多维度和多指标。
- 使用指标卡、柱图、折线图、面积图、组合图、饼图、散点图、气泡图和表格。
- 配置双轴、数据标签、预警线、同比、环比和目标进度。
- 在画布上添加、移动、八方向缩放和配置组件。
- 保存、导入和导出 V2 看板 JSON。
- 保存、分类和复用医疗业务组件模板。
- 使用 V3 参数定义、筛选控件和组件级数据集参数绑定。
- 在服务端执行占位符条件、分组聚合、排序和限制，并按参数依赖定向刷新。
- 合并同键并发请求，使用有界短期缓存并支持手工强制刷新。
- 管理多页面并配置受控的 SetParameter、Refresh 事件，在设计器预览会话中安全执行。

## Roadmap

### v0.1.0 — Initial Open Source Release
- PostgreSQL / Greenplum data source management
- Dataset modeling
- Field semantics
- KPI cards
- Common chart components
- Dashboard canvas
- Aggregation and sorting
- Dashboard JSON import/export
- Reusable healthcare BI components
- Open Source repository governance

### v0.2 — Interaction & Parameter System
- Complete parameter system
- Dashboard parameter interactions
- Component linkage
- Drill-down capabilities
- Improved dashboard designer
- Reusable dashboard templates
- Expanded automated testing

### v0.3 — AI Analytics
- Natural-language-to-SQL prototype
- AI-assisted metric analysis
- Metadata understanding
- Dataset semantic analysis
- AI-assisted dashboard generation
- Intelligent analytics workflows

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
├── tests/       模型、计算、查询运行时和浏览器验收测试
└── start-dev.cmd
```

## 开发入口

- [项目当前状态](./docs/项目当前状态.md)
- [Phase8 实施方案](./docs/02_V3架构/Phase8实施方案.md)
- [Phase8 最终验收记录](./docs/04_测试验证/验收记录/Phase8最终验收记录.md)
- [Phase9 实施方案](./docs/02_V3架构/Phase9实施方案.md)
- [Phase9 迁移说明](./docs/02_V3架构/Phase9迁移说明.md)
- [Phase9 最终验收记录](./docs/04_测试验证/验收记录/Phase9最终验收记录.md)
- [AI 开发交接](./AI_Development_Handover.md)
- [文档中心](./docs/README.md)

## Commercial Licensing

Medical BI Designer is currently released under the GNU Affero General Public License v3.0 (AGPL-3.0).
Commercial licensing options may be offered in the future for organizations that require proprietary integration, redistribution, OEM usage, or other licensing arrangements that are not compatible with AGPL-3.0 requirements.
