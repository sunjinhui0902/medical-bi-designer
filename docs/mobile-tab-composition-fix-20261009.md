# 移动 Tab 组合边界修复

任务 TYBI-MOBILE-TAB-20261009-092310，DIRECT，go。基线 `agent/p0-quality-cockpit` / `80433d3`；保留已有未提交改动。范围为移动 Tab 内容区边界和相关回归，不提交、不合并 main、不发布、不连接数据库。

## 冻结方案

移动布局复用 `tabContentSizeV3` 和最小容器尺寸，按 Tab 内容区宽度及配置内边距递归重排。按内容高度加实际标题/容器占用求外部高度，不使用固定 64。组合保持内部相对位置与叠放，桌面坐标和业务配置不变。

新增组与独立卡片的边缘包含断言，覆盖顶部、底部、左侧、右侧标题，标题显示/隐藏与不同内边距；真实页面验证保存重开、组合操作及手机 Tab 截图。

ChatGPT 只读检查：桥接未运行、TAILSCALE_FUNNEL_DOWN；外部 Review BLOCKED，未发送项目资料。

## 修复结果

`responsiveLayoutV3.ts` 在每个 Tab 的候选移动尺寸下计算实际内容宽度与标题/容器高度，再递归排版；子组件使用该 Tab 页配置的内边距，底部也预留相同边距。组合仍以外包络同比缩放，普通卡片仍单列排列。所有 Tab 页的内容高度共同决定容器高度，桌面组件模型不变。

修改文件：`src/services/responsiveLayoutV3.ts`、`tests/component-composition.test.ts`、`scripts/verify-component-composition.mjs`，以及本记录、组合实现记录和 `BACKLOG.md`。

## 验收

| 检查 | 状态 | 证据（E:/codex/work 下） |
| --- | --- | --- |
| 修复前边界断言 | FAIL，复现 320/top/false/0 的右边缘越界 | tybi-mobile-tab-baseline-20261009.txt |
| 定向单测 | PASS，17/17；新增断言覆盖 144 组宽度/标题方向/标题显示/内边距组合，同时检查组合与独立卡片 | tybi-mobile-tab-targeted-20261009.txt |
| 实际页面操作 | PASS；组合、整体移动/缩放、Escape、穿透、透明、层级、取消、保存重开、手机叠放 | tybi-mobile-tab-directions-accepted-20261009.txt |
| 手机 Tab 内容区边界 | PASS；四种标题方向，实际元素右边缘/下边缘均在内容区，预览保存不改变有效桌面坐标 | tybi-mobile-tab-directions-accepted-20261009/result.json |
| 截图核对 | PASS；默认顶部、左侧、底部截图中卡片四边完整可见；四方向截图均已保存 | tybi-mobile-tab-directions-accepted-20261009/phone-tab-*.png |
| 门诊移动回归 | PASS；五页 × 320/390/768/1024，原生触屏滚动 161px、联动清空、下钻返回、20 行 CSV、保存布局不变 | tybi-mobile-tab-product-mobile-20261009.txt |
| 类型检查与构建 | PASS；保留既有 >500kB 分包提示，未扩展为打包重构 | tybi-mobile-tab-build-20261009.txt |
| Diff 格式检查 | PASS；已有 start-dev.cmd 换行警告 | git diff --check |
| 全量公开单测 / 全量核心 E2E | NOT RUN，本轮以定向和实际页面回归验收；此前测试记录保留 | docs/component-composition-implementation-20261008.md |
| 外部 ChatGPT Review | BLOCKED，Tailscale 通道离线 | 只读 doctor 报告 |

四方向首轮夹具把内边距改为 24，但保留了不满足约束的桌面 x/y=20，保存时正常修正到 24，导致“坐标不变”断言失败。已把夹具起始坐标放到有效边距内，重新完整验收 PASS；没有为绕过测试修改产品的保存逻辑。失败日志 `tybi-mobile-tab-directions-browser-20261009.txt` 保留。

## 交付状态与边界

2026-10-09：前轮移动 Tab 裁切待办已关闭。状态为工作区已修改、定向测试及本地页面验收通过、待用户查看；未提交、未合并、未推送、未发布，未进行数据库操作，保留原有未提交改动。

仅支持 PC 设计和移动预览/浏览；组合成员须属于同一画布或同一 Tab 内容页，跨容器须先取消组合。浏览器验收使用隔离上下文及 Mock 视觉夹具，不代表门诊指标结论；真实 iOS/Safari/微信下载仍属于此前记录的独立待办。
