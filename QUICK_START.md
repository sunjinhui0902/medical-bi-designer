# 快速启动

Windows 环境可以通过 `start-dev.cmd` 一键启动 Medical BI Designer。首次启动会安装锁定版本的依赖，后续启动会直接复用本地依赖。

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
