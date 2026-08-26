# Medical BI Designer

Medical BI Designer 是一个面向医疗运营分析场景的开源低代码 BI 设计器，提供数据集建模、可视化组件、参数筛选、多页面交互和本机看板工作区等通用能力。
当前公开版本基于 V2.0 可视化底座和 V3 Phase7—Phase10 运行时，已支持参数化查询、动态选项、多页面事件、组件联动、下钻、导航、弹窗、页签容器和自适应预览。下一阶段为 Phase11 发布与治理，尚未启动。

v0.1.0 is the first public Open Source release of Medical BI Designer, based on the existing V2.0 development baseline.
v0.1.0 为 Medical BI Designer 的首个公开开源版本，基于现有 V2.0 开发基线发布。

## Preview

![Medical BI Designer](./docs/04_测试验证/截图/step5.1-真实数据集绑定验收截图.png)

## 开源许可 / License

Medical BI Designer is Open Source software licensed under the GNU Affero General Public License v3.0 (AGPL-3.0).

Medical BI Designer 是一个开源医疗低代码 BI 设计器，采用 GNU Affero General Public License v3.0（AGPL-3.0）开源许可证。
本仓库公开提供通用产品源码、脱敏示例、设计文档和验收材料，欢迎开发者用于学习、研究、部署、改进和贡献。

具体授权范围和义务请参阅 [LICENSE](./LICENSE)。

Copyright (C) 2026 sunjinhui0902.

## 数据与隐私边界

为保护医疗数据和项目资产安全，真实业务看板、数据库连接配置、数据库环境变量约定、患者或机构数据、内部 SQL、生产配置及其他敏感资产不会包含在公开仓库中。
公开仓库只包含可复用的设计器能力、脱敏或合成示例、开发文档和不依赖私有环境的自动化测试。使用者应自行创建数据源和数据集，不应把生产凭据写入源码或看板 JSON。

公开 CI 不连接开发者或客户数据库；参数、分页、联动、下钻和导航通过合成模型、受控本机数据或接口隔离进行验证。

## 已完成能力

- 管理 PostgreSQL/Greenplum 数据源和只读数据集。
- 配置字段语义、聚合、排序、多维度和多指标。
- 使用指标卡、柱图、折线图、面积图、组合图、饼图、散点图、气泡图和表格。
- 配置双轴、数据标签、预警线、同比、环比和目标进度。
- 在画布上添加、移动、八方向缩放和配置组件。
- 使用实际大小、适应宽度和适应窗口三种预览模式，并允许普通组件缩小到 20 × 20。
- 在本机工作区新建和切换多个独立看板，并在每个看板内管理多个画布。
- 使用页签块直接接收组件库或画布组件，支持跨页签移动、拖回画布，并配置标题面板样式和页签事件参数。
- 保存、导入和导出 V2 看板 JSON。
- 保存、分类和复用医疗业务组件模板。
- 使用 V3 参数定义、筛选控件和组件级数据集参数绑定。
- 使用数据集驱动的动态选项、依赖关系和级联筛选。
- 使用表格固定表头、分页、条件格式和状态徽标。
- 使用地图底图、GeoJSON 面层和经纬度点图层构建空间分析组件。
- 在服务端执行占位符条件、分组聚合、排序和限制，并按参数依赖定向刷新。
- 合并同键并发请求，使用有界短期缓存并支持手工强制刷新。
- 管理多页面并配置受控的 SetParameter、Refresh 事件，在设计器预览会话中安全执行。
- 配置页面跳转、返回、跨页参数、组件联动与清除联动。
- 使用声明式 DrillPath、下钻栈和可点击面包屑构建跨页分析路径。
- 使用可拖动、八方向缩放并避开筛选器保护区的会话弹窗。
- 通过安全浏览器端口打开内部新窗口或 http/https 外链，并拒绝危险协议。

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

### v0.2 — Interaction & Parameter System（核心运行时已完成）

Phase8—Phase10 已完成以下核心能力并通过阶段验收；正式版本标签与发布运行时仍属于后续发布治理工作。

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
- [Phase10 实施方案](./docs/02_V3架构/Phase10实施方案.md)
- [Phase10 验收记录](./docs/02_V3架构/Phase10验收记录.md)
- [Phase10 最终验收](./docs/02_V3架构/Phase10最终验收.md)
- [设计器通用能力增强记录](./docs/02_V3架构/设计器通用能力增强记录-20260826.md)
- [AI 开发交接](./AI_Development_Handover.md)
- [文档中心](./docs/README.md)

## Commercial Licensing

Medical BI Designer is currently released under the GNU Affero General Public License v3.0 (AGPL-3.0).
Commercial licensing options may be offered in the future for organizations that require proprietary integration, redistribution, OEM usage, or other licensing arrangements that are not compatible with AGPL-3.0 requirements.
