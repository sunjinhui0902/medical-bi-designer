# Gemini 连接代理修复

任务：TYBI-GEMINI-PROXY-20261009-111532。工作区 `E:\codex\个人开发版`，分支 `agent/p0-quality-cockpit`，基线 `80433d3`。保留此前未提交改动。

## 根因与方案

本机已有 HTTP/HTTPS 代理，Windows 系统代理已启用。本机 Node 为 22.22.1，但原 BI API 启动时没有启用 Node 环境代理支持。

无密钥对照探测结果：Node 普通 fetch 访问 Google 出现 `UND_ERR_CONNECT_TIMEOUT`；通过 `--use-env-proxy` 启动后得到 Google HTTP 404，证明已到达该服务。curl 经已有代理也收到 Google HTTP 404。Gemini 原配置地址与 [Google 官方兼容接口文档](https://ai.google.dev/gemini-api/docs/openai) 一致，无需修改。

采用 [Node 官方环境代理方式](https://nodejs.org/learn/http/enterprise-network-configuration)：已有 HTTP_PROXY/HTTPS_PROXY 时，为支持该能力的 Node API 子进程启用 NODE_USE_ENV_PROXY=1。保留明确的关闭选项，合并原 NO_PROXY 并确保 localhost/127.0.0.1/IPv6 回环绕过代理。代理环境在进程启动时生效，已在本机验证仅在运行中设置该变量不会修复 fetch。

阶段结论：go。修改限于 API 启动环境和安全错误提示；不改变 TLS 证书验证、本机 API 访问限制、模型配置持久化、数据查询或看板配置。

## 修改

- `scripts/api-network-env.mjs`：整理 API 子进程代理环境，支持 Node 22.21+、24.5+及更高主版本，保留显式 opt-out。
- `scripts/dev.mjs`：开发 API 子进程使用该环境。
- `scripts/start-api.mjs`、`package.json`：独立 `npm run start:api` 也使用相同启动环境。
- `server/model-provider.mjs`：区分连接超时、域名解析、连接拒绝和证书问题。只使用已知错误码，不回显异常原文、密钥或上游响应。
- `tests/api-network-env.test.mjs`、`tests/model-provider.test.mjs`：真实本机代理转发与回环绕过、版本/关闭兼容、错误脱敏、原加密配置及请求回归。

## 验证

- 定向测试 6/6 PASS，包含实际子进程 fetch 通过临时 HTTP 代理访问测试域名、同一子进程回环请求直接访问；均不调用外部模型。
- 项目开发服务已重启，健康检查 HTTP 200。
- 重启前后模型配置文件 SHA256 一致；配置未丢失、未覆盖。Gemini 当时未保存密钥，不能将缺少密钥视为连接测试结果。
- DeepSeek 使用已保存配置实际连接 HTTP 200，约 624ms。
- Owner 保存 Gemini 密钥后，Gemini `gemini-3.8-flash` 实际连接 HTTP 200，约 2658ms。测试提示仅要求返回 `{ "ok": true }`，没有业务数据。
- 真实配置页点击“测试连接”，页面显示“连接成功 · gemini-3.8-flash · 2574 ms”。截图：`E:\codex\work\tybi-gemini-connected-20261009.png`；测试日志：`E:\codex\work\tybi-gemini-proxy-tests-20261009.txt`。
- 院级快照接口 HTTP 200（20 个可用月份）、科室本地快照查询 HTTP 200（8 行）；未连接远程 ODR 或写数据库。
- 定向 `git diff --check` PASS。没有前端源码改动，未扩大为全量构建或重复压力测试。

当前默认入口仍为 `chatgpt-web`，未自动替 Owner 选择模型服务。需要 API 生成时，在模型设置页面选择希望使用的服务并点击“设为默认”。

## 状态与边界

工作区已修改、定向测试与真实 API 调用通过；未提交、未推送、未合并 main。ChatGPT 独立 Review 未执行：只读 doctor 显示协作连接不可用。本次为明确网络配置缺陷，由 Codex 直接处理。

无需重新填写已保存 Key。若更换代理，需按已有环境变量更新代理地址并重启服务。节点版本早于支持范围时不会自动启用此选项，需升级受支持 Node 或自行提供兼容的网络运行环境。
