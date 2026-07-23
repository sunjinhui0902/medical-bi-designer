# Release 审计记录

本记录汇总 2026-07-23 首次 GitHub 基线提交前的自动化与人工审查结果。结论：代码、依赖、文档和本地启动已达到私有 GitHub 仓库提交条件；公开发布仍需选择许可证并确认业务材料权属。

## 构建与运行

| 检查 | 结果 |
| --- | --- |
| Windows 一键启动 | 通过 |
| Web | `127.0.0.1:5174` 健康 |
| API | `127.0.0.1:5175` 健康 |
| `npm test` | 24/24 通过 |
| `npm run build` | 通过 |
| 干净目录 `npm ci` | 通过 |
| 干净目录测试与构建 | 通过 |

生产构建仍提示 JavaScript Chunk 约 1.34 MB，已作为非阻塞技术债记录，不影响当前私有基线提交。

## 依赖安全

第一次全量 Audit 发现开发依赖 `concurrently` 间接使用的 `shell-quote` 存在高危复杂度 DoS 公告，且无上游可用修复。已使用项目内 `scripts/dev.mjs` 替代并删除 `concurrently`。

修复后执行：

```powershell
npm audit --registry=https://registry.npmjs.org
```

结果为 0 个已知漏洞：低危、中危、高危和严重级别均为 0。

## 依赖许可证

生产依赖共 48 个：

| 许可证 | 数量 |
| --- | ---: |
| MIT | 39 |
| Apache-2.0 | 2 |
| BSD-2-Clause | 1 |
| BSD-3-Clause | 2 |
| ISC | 3 |
| 0BSD | 1 |

未发现 GPL、AGPL、LGPL、SSPL、`UNLICENSED` 或缺失许可证项。项目自身许可证尚未选择，因此仓库在添加 `LICENSE` 前不得公开。

## 敏感信息

已执行常见密钥格式和已知验证库标识扫描，公开候选文件未发现：

- 私钥 PEM；
- GitHub、OpenAI、Slack 或 AWS 常见 Token；
- 明文密码、Secret 或 API Key 赋值；
- 真实验证库地址、账号或数据源 ID。

真实本地资产已通过 `.gitignore` 排除，包括：

- `server/.data/`；
- `server/validation-database.json`；
- `.env.local`；
- `.step5-backup/`；
- `.vite/`、日志、构建产物和依赖目录；
- 内部固定验证库说明。

## 截图与示例

人工检查了 6 张 V2 验收截图。截图只展示产品界面、Mock/Demo 指标、通用科室名称和演示 SQL，没有患者、医生、账号、IP、真实机构或凭据。

V1/V2 JSON 示例使用通用字段、占位数据集 ID 和 Mock/示例业务名称，没有真实医疗数据或内部基础设施标识。

## GitHub 文件

已增加：

- `README.md`、`QUICK_START.md` 和 AI 交接；
- `SECURITY.md`、`CONTRIBUTING.md`；
- Issue 与 Pull Request 模板；
- 只运行安装、测试和构建的最小权限 CI；
- 公开环境变量和验证数据库脱敏示例。

CI 不连接数据库，不读取本机配置，也不输出私有日志。

## 剩余确认

- 选择项目开源许可证。
- 由所有者确认医疗业务组件、路线文档和示例材料的公开权利。
- GitHub 创建后配置仓库可见性、默认分支、描述、主题和分支保护。

在以上公开发布条件完成前，首个远端仓库应保持私有。
