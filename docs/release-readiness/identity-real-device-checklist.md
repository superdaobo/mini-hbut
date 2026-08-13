# Identity Real-device QA Checklist（#628 L8）

> 状态：**待用户真机执行**。CI/Agent 不能使用真实 HBUT 账号与真实设备，
> 因此本清单是「Parent Production Ready」之前的最后一关（#628 Done 9）。
> 完成全部打勾并记录日期/设备后，才允许标记 Parent Production Ready。
>
> 安全约定：
> - 人工 QA 不把账号/密码/二维码 secret 截图提交 GitHub；
> - 不把 handoff / 完整深链 URL 贴进任何 issue/评论；
> - 测试后清理测试设备与测试 Client。

## A. Windows（桌面主平台）

- [ ] 冷启动深链：App 完全退出 → 打开 `minihbut://identity?...` fixture → App 启动并收到请求（Identity Approval Overlay 出现）
- [ ] 热深链：App 运行中再打开深链 → 不产生第二个进程，Overlay 切到新请求
- [ ] 单实例：连续快速触发 3 次深链 → 任务管理器始终只有 1 个主进程
- [ ] 最小化恢复：最小化后触发深链 → 窗口 unminimize + focus
- [ ] invalid deep link（缺 request_id/handoff、畸形编码）→ 不崩溃、无 handoff 回显
- [ ] 本地登录恢复：未登录收到深链 → 引导登录 → 登录后恢复 pending 请求
- [ ] keyring：设备密钥存在系统凭据管理器；删除凭据后 Identity 功能 fail closed（不降级）
- [ ] approve：点击允许 → PC 浏览器轮询完成 → 第三方回调成功
- [ ] 浏览器完成：同设备网页登录完整闭环（authorize → auth 页 → App 允许 → 回调）
- [ ] 日志检查：dev 终端与 App 日志无 handoff/深链 URL 明文

## B. Android

- [ ] 生成工程深链：`minihbut://identity` 在 Tauri 生成包中可唤起（`check_mobile_scheme_contract.mjs` CI 已过前提下）
- [ ] App 被杀后深链：冷启动收到请求
- [ ] 后台/后台返回：App 在后台 → 深链 → 恢复到前台并显示请求
- [ ] QR 相机权限：扫码入口申请权限正常；拒绝权限时给出可操作提示
- [ ] QR 跨设备：PC 页面扫码 → 手机 App 显示同一请求 → 允许 → PC 完成登录
- [ ] secure storage：设备密钥在 Android Keystore；应用数据清除后密钥不可用（fail closed）
- [ ] approve / deny / 过期请求各一次
- [ ] 已撤销设备：设置中撤销该设备 → 该设备 approve 被服务端拒绝

## C. iOS

- [ ] 生成工程 URL scheme：`minihbut` 在 Info.plist CFBundleURLTypes（macOS CI 生成后确认）
- [ ] App 被杀/后台深链行为
- [ ] QR 扫码与相机权限
- [ ] Keychain：设备密钥在 Keychain；卸载重装不自动恢复旧密钥
- [ ] 安全区：Overlay 在刘海屏/底部横条无遮挡（safe area）

## 执行记录

```text
Windows：日期/设备/结果/问题
Android：日期/设备/结果/问题
iOS：日期/设备/结果/问题
```

完成全部勾选后：更新 `docs/release-readiness/identity-testing-gate.md` 的 L8 状态，
再向主 Agent 声明 Parent Production Ready。
