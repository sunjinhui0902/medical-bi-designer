# Phase10 P10.4—P10.6 冻结补充

## 覆盖层与下钻

- Drill、Linkage 与页面入口参数共同进入会话内有序覆盖层；清除任一层时保留最新存活层。
- 页面返回恢复该页面 checkpoint；页面栈、下钻栈、联动状态不写入 V3 JSON。

## Dialog Runtime

- Dialog 只支持 `openDialog` push 与顶层 close，不存在隐式 replace。
- 声明式打开/关闭走 EventBus；ESC、遮罩、标题栏、拖动和缩放通过密封生命周期端口，携带 session/epoch/instance/revision lease。
- Dialog 栈上限 100；嵌套来源只能是活动 standard 页面或顶层 dialog。
- 切页、返回、clear、import、退出预览、应用替换和卸载必须恢复弹窗参数并清空栈。
- viewport 与筛选器保护矩形来自真实 DOM 测量，要求零面积重叠；打开无解时提交前失败，拖动/八向缩放无解时保留上一合法矩形。

## Safe Browser Port

- Browser 动作只能由组件 `click/doubleClick/rowClick` 直接触发，且必须是动作序列首个浏览器动作。
- 内部新窗口只接受现有 standard pageId，并从部署基路径构造 URL。
- 外链只接受无凭据、无控制字符、无首尾空白的绝对 http/https URL；同源外链必须改用内部新窗口。
- 跨域携参默认拒绝，仅宿主白名单 origin 可用；参数从 EventBus 冻结快照全有或全无地 JSON 编码。
- 重复键、缺值、未知 ID、超过 50 项或 URL 超过 8192 字节均 fail closed。
- Web Adapter 固定请求 `_blank` 与 `noopener,noreferrer`；标准浏览器返回 null 不作为拦截事实。
- 审计只记录 protocol/origin/pathname，不记录查询串或参数值。

## 节点状态

| 节点 | 状态 | 证据摘要 |
| --- | --- | --- |
| P10.4 | ACCEPTED | 跨页 DrillPath、checkpoint、导航覆盖层碰撞回归、面包屑模型。 |
| P10.5 | ACCEPTED | Dialog 栈、原子恢复、焦点/ESC/遮罩、拖动、八向缩放、保护区与生命周期清理。 |
| P10.6 | ACCEPTED | Safe Browser Port、协议/凭据/Origin/快照/隐私门禁及真实 Chromium 新窗口。 |
| P10.7 | ACCEPTED | Designer 返回/可点击面包屑/清除联动、URL 参数导入和医院→科室→医生真实 Chromium 出口；最终全门禁通过。 |
