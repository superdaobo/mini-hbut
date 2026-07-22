## TL;DR

新增学习通「课程中心」与「收件箱」：展示各课信息与通知，详情链接可安全跳转；复用现有 SSO 与学校消息学习通源。

## 问题/需求描述

官方学习通有课程列表、通知流、收件箱，但 App 仅有班级资料与签到。用户需要在 App 内看课、看通知，并点击链接跳到合理目标。

## 当前行为

- `ChaoxingClassView`：邀请码 + 资料，非全量课程中心。
- `school_inbox`：已抓取教务通知 + 学习通 `notice.chaoxing.com` 列表/详情/已读。
- `chaoxing_sso`：门户 → FYSSO 桥接。

## 期望行为

- **课程中心**：课程列表；详情含概览/作业或通知等可拿到的信息。
- **收件箱**：独立入口；列表/详情/已读；正文链接统一处理（应用内模块 / SSO WebView / 外开白名单 / 拦截危险 scheme）。
- UI 适配主题与黑暗模式。
- 会话失败走 SessionGuard。

## 影响范围

- 新前端：`ChaoxingHubView`、`ChaoxingInboxView`（或复用 SchoolInbox 过滤）
- 后端：课程列表 API（与 online_learning 同源优先）、inbox 可 alias school_inbox
- 链接处理：`external_link` / 新 `handleChaoxingLink`

## 验收标准

- [ ] 登录后课程中心可见课程（或明确空态/错误）
- [ ] 收件箱可刷列表并打开详情
- [ ] 详情内合法链接可跳转；非法 scheme 被拦截
- [ ] 掉会话可恢复或可读失败
- [ ] 浅色/深色可读
