# W4 Gate Review 验收记录（2026-08-14）

> 主 Agent 验收：3 个实现 Agent 并行完成（#623 首次模型故障，从断点续跑成功），CI 全绿，验收通过。

## 验收结果总览

| Issue | 状态 | 关键证据 |
|---|---|---|
| #623 App UX 授权确认 | ✅ 通过 | 前端 1006/1006 + 38 新测试；12 相位 Overlay + 登录恢复闭环 + 设备安全设置；修复 4 个实现 bug（detail 未存/结果页隐藏/队列覆盖/sessionValidation 重置） |
| #625 Admin 审核后台 | ✅ 通过 | core 160 + web 257；Done 7 条全达成；revision 内容寻址防 TOCTOU；suspend 物理删 artifact；user_roles + step-up + 9 audit 事件 |
| #615 考试+学校消息 | ✅ 通过 | Android 142/142 + ExamSignatureV1 三端冻结（9 case）；Part A 7/7 + Part B 8/8；per-feature 三开关；预算控制 |

## 主 Agent 收口操作（Gate 期间）

1. **修复 #615 遗留的 4 个 vue-tsc 错误**：`notify_center_checks.ts` 中 `sid` 未声明（#615 报告的"vue-tsc 零错误"不实，#623 先发现）——补 `const sid = toSafeText(studentId)`，修复后 vue-tsc 0 错误 + 1006 测试复跑全绿
2. **核实 core flaky 失败**：`review.test.ts` 的 `fetch failed: bad port`（Windows 高并发端口时序）——单独跑 3 次 + 全量重跑均全绿（160/160），登记为已知 flaky（建议 CI 真 PG 时观察）
3. **确认契约**：#623 与 #622 Core API 对接完整（approve/deny/challenge，私钥不进 JS 断言）；#615 与 #610/#614 联动零内部修改（只加调用）；#625 admin 落 `developer-site/admin/**`（proxy 约束下正确布局）

## CI 验证结果

- 前端：**152 文件 / 1006 测试全绿** + vue-tsc 0 错误
- Rust：**279/279** + command_registry 2/2 + fmt 干净
- identity-platform：core **160** + web **257** 全绿（flaky 重跑确认）

## 登记项（转交后续 Wave）

| 项 | 来源 | 处理 |
|---|---|---|
| BFF→Core 服务令牌认证 | #625 | #626 Security 硬化 |
| #619 状态机 rejected 终态 vs #624 web rejected→pending_review 冲突 | #625 | 开发者 API 落地时 Core 放开迁移（#629/W6） |
| developer 域 CSP/安全头 | #624/#625 | #626 统一附加 |
| admin-grant 生产 bootstrap | #625 | 需用户环境执行 |
| #610 iOS 定时通知序列化 | 跟踪 | 原生调度命令仍待补 |

## 交付物

- 主仓库：`src/features/identity/` 全套（Overlay/ScopeList/ClientCard/ResultState/DeviceSettings + store/service + 3 spec 38 用例）、IdentityCoordinator 4 bug 修复、AuthCoordinator resume 闭环、SettingsView security Tab、notify_center_checks exam/school 扩展、插件 android/ios exam+school checker、exams-signature fixture + 独立复算脚本
- 私有：core `api/admin/**`（35 测试）+ `0002_admin_roles.sql`、web `developer-site/admin/**`（32 测试）
