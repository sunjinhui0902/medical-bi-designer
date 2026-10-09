# 快速启动

Windows 环境可以通过 `start-dev.cmd` 一键启动 Medical BI Designer。首次启动会安装锁定版本的依赖，后续启动会直接复用本地依赖。

更新仓库后，如果 `package-lock.json` 有变化，请先执行 `npm ci` 再启动。已存在的 `node_modules` 不会由一键启动自动升级。

## 环境要求

- Windows 10/11。
- Node.js 22 LTS，当前验证版本为 `v22.22.1`。
- npm 10，当前验证版本为 `10.9.4`。
- 5174 和 5175 端口可用。

## 一键启动

双击项目根目录中的：

```text
start-dev.cmd
```

也可以在 PowerShell 中执行：

```powershell
.\start-dev.cmd
```

脚本会：

1. 检查 `node` 和 `npm`。
2. 在 `node_modules` 不存在时执行 `npm ci`。
3. 清理本项目上一次启动的开发进程。
4. 后台启动 Web 和 API。
5. 通过 Web 代理检查 API 健康状态。
6. 打开 `http://127.0.0.1:5174/`。

重复执行会重启本项目服务，便于快速复用。

若不希望自动打开浏览器：

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\start-dev.ps1 -NoBrowser
```

## 手动启动

```powershell
npm ci
npm run dev
```

手动启动时终端需要保持打开。

## 服务地址

| 服务 | 地址 |
| --- | --- |
| Web | `http://127.0.0.1:5174/` |
| API 健康检查 | `http://127.0.0.1:5175/api/health` |
| Web 代理健康检查 | `http://127.0.0.1:5174/api/health` |

## 启动后的入口

- 主题与布局：画布工具条选择“深色驾驶舱”或“浅色日常分析”，开启“对齐参考线”；左右侧栏可从顶部独立折叠。
- 模型服务：顶部“模型 API”进入设置页，保存后在“已保存模型”查看配置；“本地看板助手”通过“本次调用模型”选择所用服务。
- 手机适配：PC 设计，启用“移动端自适应”，在预览的“设备”选择手机或平板。当前提供电脑模拟，真机结果另行验收。
- 门诊样例：准备本地知识资产与 ADS 快照后，选择“门诊运营分析 · 五页样例”。首次克隆不含真实快照和已保存模型 Key；缺少数据时会提示。

完整步骤见 [本轮使用与验收说明](./docs/release-20261009.md)、[模型配置](./docs/model-api-config-20260929.md) 和 [移动预览](./docs/mobile-validation-guide-20261009.md)。

## 常见问题

### 端口被占用

一键脚本会清理 5174、5175 上由本项目启动的旧进程。若仍失败，请检查是否有其他应用占用端口：

```powershell
Get-NetTCPConnection -LocalPort 5174,5175 -ErrorAction SilentlyContinue
```

### 首次安装失败

确认网络和 npm Registry 可用后执行：

```powershell
npm cache verify
npm ci
```

### 页面能打开但数据管理失败

检查 API：

```powershell
Invoke-RestMethod http://127.0.0.1:5175/api/health
```

真实数据库连接需要本机私有配置。不要把密码、`server/.data/` 或本机密钥复制进公开仓库。
