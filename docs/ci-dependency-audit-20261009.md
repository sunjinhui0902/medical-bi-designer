# CI 依赖审计收口

最终结果：新锁文件已通过 GitHub 完整 verify（391 项公共测试、27 项 E2E、类型检查、构建和 0 漏洞审计），PR #15 已合并。[最终 CI](https://github.com/sunjinhui0902/medical-bi-designer/actions/runs/37892104061)。以下为定位与修复过程。

2026-10-09，PR #15 的第二轮验证中，27/27 E2E、公共测试及构建已通过，但必需的高危依赖审计失败。没有降低审计阈值或跳过门禁。

## 更新范围

仅在 package.json 已有版本约束内刷新 package-lock.json：

| 依赖 | 原版本 | 修复后 |
| --- | --- | --- |
| Vue 及配套运行时、编译器、服务端渲染 | 3.5.40 | 3.5.43 |
| fast-uri | 3.1.5 | 3.1.8 |
| source-map-js | 1.2.1 | 1.2.2 |

Vue 编译链依赖随解析结果同步更新 Babel parser/types、sourcemap-codec、nanoid 与 PostCSS；共 17 个包，无主版本升级，无 package.json 或业务代码改动。更新采用官方 npm registry，未改本机全局镜像设置，未执行安装脚本。

依据：[Vue 渲染公告](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6)、[fast-uri 高危公告](https://github.com/advisories/GHSA-qw65-cvwx-89v3)、[fast-uri 补充修复](https://github.com/advisories/GHSA-hrr3-gc8f-f4qj)、[source-map-js 公告](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)。

## 验证与证据

- PASS：官方 registry 审计报告 0 vulnerabilities，git diff --check。
- GitHub verify 必须在新锁文件上重新完成公共回归、类型检查、构建、完整 E2E 与高危审计后才合并。
- 本机 npm 镜像首次返回未实现审计接口；改用单次 registry 参数恢复，没有修改全局配置。

日志：E:/codex/work/tybi-dependency-fix-20261009.txt；上一轮 CI：tybi-pr15-ci-fixture-failure-20261009.txt。最终 CI 与合并状态记录在工作区外发布证据及 PR #15。
