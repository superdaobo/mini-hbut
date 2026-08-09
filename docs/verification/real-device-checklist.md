# 真机全链路验证清单（Issue #556）

> 阶段 4D：iOS、Android 与真实账号全链路验证。
> 本清单由 Agent 整理为可执行步骤；**真机执行与真实账号操作需由用户/QA 完成**（Agent 无真机与真实账号）。
> 覆盖范围：#556 要求 + 本轮 Phase 1/2/4 改动（#582/#583/#575/#578/#591/#594/#595）的回归重点。

## 0. 构建来源

- iOS：TestFlight 包（`ios-testflight.yml`，`VITE_APP_STORE_BUILD=1` + `VITE_EXCLUDE_HIDDEN_VIEWS=1` + Rust `mobile-slim,bridge`）。
- Android：beta APK（`dev-build.yml`，`VITE_EXCLUDE_HIDDEN_VIEWS=1` + Rust `mobile-slim`）。
- 对照：本地 `npm run build` + `tauri dev`（Windows 全功能，用于差异对比）。

## 1. iOS 必测路径

| # | 场景 | 步骤 | 预期 |
|---|---|---|---|
| 1.1 | 低内存/大课程列表 | 加载含 100+ 门课程的学习通课程中心，快速滚动 | 分批渲染生效，无闪退（#530 回归） |
| 1.2 | 前后台恢复 | 播放视频/浏览课程中途退后台 5 分钟再回前台 | 页面状态恢复，Bridge 重新 ensure/respawn（#452/#453 回归） |
| 1.3 | 长闲会话 | 登录后闲置 1 小时 | 静默续期或可读提示，非误报（#587 回归） |
| 1.4 | 学习通视频/学期/签到 | 课程中心学期筛选、视频播放、进度统计；签到（远程卡片入口 more_chaoxing_checkin） | 视频经 proxy/video 代理播放；签到可用（#524 回归） |
| 1.5 | 论坛不可达 | 深链 `#/{学号}/forum`、历史缓存指向 forum | 策略收敛回 home，无白屏/无未处理错误（#591 回归） |
| 1.6 | Bridge 必需路径 | 官网（school_website）、远程模块（module_bundle/content）、媒体代理 | proxy/system/ai 路由可用（#593 矩阵） |
| 1.7 | TestFlight 安装与审核态 | 审核未登录/演示账号 | 隐藏学习通/一码通/敏感模块（#493 回归） |

## 2. Android 必测路径

| # | 场景 | 步骤 | 预期 |
|---|---|---|---|
| 2.1 | 厂商后台限制 | 华为/小米/OPPO 等后台 30 分钟 | 通知/背景任务按现有策略降级，无崩溃（#492 相关） |
| 2.2 | 非 Bridge 降级路径 | 无 Bridge 状态下使用课程中心/成绩/课表 | 走 Tauri invoke，功能正常（#593 Android 矩阵） |
| 2.3 | 长闲会话 | 登录后闲置 1 小时 | 静默续期或可读提示 |
| 2.4 | 教务维护与网络切换 | 教务维护时查成绩/课表；Wi-Fi↔4G 切换 | 明确"维护中/网络错误"文案（#587 回归）；缓存降级 offline=true |
| 2.5 | 校园网 | 校园网环境下登录/校园网模块 | campus_network 正常 |
| 2.6 | Widget | 添加课表/成绩 Widget | 快照渲染正常 |
| 2.7 | 论坛不可达 | 深链 forum、历史状态恢复 | 收敛 home，无白屏（#591） |
| 2.8 | 选课/签到 | 真实登录选课中心（course_selection 保留）；学习通签到 | 可用（#591 矩阵保留项） |

## 3. 跨平台回归

| # | 场景 | 预期 |
|---|---|---|
| 3.1 | 登录/登出/切换账号 | keyring 凭据与多用户隔离正常（#557 相关） |
| 3.2 | 成绩/课表/考试/校历 | 双传输语义一致（#578） |
| 3.3 | 学习通课程中心核心路径 | chaoxing_fetch_courses/outline/knowledge_cards/video_status/score 可用（#592 保留矩阵） |
| 3.4 | 备份与恢复 | 加密备份（backup_database_encrypted）可恢复 |
| 3.5 | 云同步 | cloud_sync 快照同步正常 |

## 4. 结果记录

- 每项标注：通过 / 失败（附设备型号、系统版本、复现步骤）。
- 失败项按现有 bug 流程开 issue；本仓库 PR 需在合并说明中引用验证结果。
