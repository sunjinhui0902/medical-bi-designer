# Release 审计记录

本记录汇总 2026-07-23 首次 GitHub 基线提交前及 2026-07-27 公开访问前的自动化与人工审查结果。结论：代码、依赖、文档、本地启动和公开内容边界已达到 GitHub 公共访问条件。

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

未发现 GPL、AGPL、LGPL、SSPL、`UNLICENSED` 或缺失许可证项。项目自身采用“保留全部权利”的源码可见声明；公开访问不构成开放源代码授权。

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

- 如未来允许第三方复用、修改或分发，由所有者选择开放源代码许可证。
- 确定项目主页与 Release 附件范围。
- 正式 GitHub Release 发布前完成负责人签字。

## GitHub 提交结果

2026-07-27 已完成首次仓库提交及公开访问调整：

- 仓库：`sunjinhui0902/medical-bi-designer`；
- 默认分支：`main`；
- 可见性：公开；
- 仓库描述与主题标签：已配置；
- GitHub Actions CI：通过；
- `main` 分支保护与 CI 门禁：已配置；
- 本地与远端基线 SHA：一致。

公开范围复核确认：

- 真实验证数据库配置、内部验证说明、`.env.local` 和本地密钥均未被 Git 跟踪；
- Git 提交历史未发现常见 Token、私钥或包含凭据的数据库连接串；
- 生产依赖漏洞审计结果为 0；
- 截图、示例和文档只包含合成、通用或脱敏内容；
- 仓库公开不包含运行中的 Web/API 服务，使用者需按快速启动文档在本机运行。
