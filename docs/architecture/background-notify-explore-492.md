# 后台通知能力探索结论（GitHub #492）

> **文档类型**：架构探索 / 方案选型备忘录  
> **范围**：iOS + Android（Capacitor 壳）后台检查 → 系统通知栏推送  
> **非目标**：本文件不改实现、不引入推送服务、不改密钥/证书  
> **关联**：`issues-draft/background-notify-explore.md`、#23、#246、#385、#450–#453

---

## 1. 一句话结论

**现状已具备「本地轮询 + LocalNotifications」骨架；Android 杀进程后仍有 Headless 检查机会，iOS 只能依赖系统不保证准时的 BGAppRefresh。无法通过客户端常连达到 QQ/微信级「永远在线」——要逼近该体验必须上 APNs/FCM（或厂商通道）远程推送，并由服务端做 diff。**

**推荐路线**：短期强化路径 A（本地 BG + LocalNotifications + 诚实预期）；中长期按需评估路径 C（本地尽力 + 关键事件远程推送）。**不推荐**强行前台服务保活对标 IM、不推荐纯依赖 iOS BG 承诺准点。

---

## 2. 现有能力盘点（代码事实）

### 2.1 依赖与配置

| 组件 | 版本/位置 | 作用 |
|------|-----------|------|
| `@transistorsoft/capacitor-background-fetch` | `^6.0.2`（`package.json`） | 系统级后台唤醒调度 |
| `@capacitor/local-notifications` | `^6.1.0` | 本地通知展示 / 权限 / Channel |
| Capacitor 插件配置 | `capacitor.config.ts` | `LocalNotifications.presentationOptions: badge/sound/alert` |
| **无** FCM / APNs / `@capacitor/push-notifications` | 全仓检索无业务接入 | 无远程推送链路 |

### 2.2 Capacitor BackgroundFetch（JS 调度）

**入口**：`src/utils/background_fetch.js`  
**挂载**：`src/main.ts` → `initBackgroundFetchScheduler` → `runNotificationCheck` + `runCampusNetworkAutoLogin`

关键参数（`BackgroundFetch.configure`）：

| 参数 | 值 | 含义 |
|------|-----|------|
| `minimumFetchInterval` | **15** 分钟 | 插件允许的最小间隔；实际触发仍由 OS 决定 |
| `stopOnTerminate` | `false` | 进程结束仍尝试保留任务（Android 侧更有效） |
| `startOnBoot` | `true` | 开机后尝试恢复 |
| `enableHeadless` | `true` | Android 无 JS 运行时也可跑原生 Headless |
| `requiredNetworkType` | `NETWORK_TYPE_ANY` | 有网即可 |

Android 额外 `scheduleTask`：

- `taskId`: `com.hbut.mini.notify.periodic`
- `delay`: 15 分钟，`periodic: true`
- `forceAlarmManager: true`（对抗 Doze 的尽力措施，**非保证**）
- 与 iOS `BGTaskSchedulerPermittedIdentifiers` 中同名 id 对齐声明

偏好键（`Preferences` / CapacitorStorage，供 Headless 读取）：

- 学号、API base、各通知开关（成绩/考试/电费/上课/学校消息）
- 上课提前分钟、检查间隔、宿舍路径、学习通 cookie 快照、学校消息去重 id

### 2.3 业务检查链（前台/WebView 存活时）

**`src/utils/notify_center.js`**

| 能力 | 行为 |
|------|------|
| `runNotificationCheck` | 并行：课表静默刷新、成绩 diff、考试、电费、课前提醒、学校消息 → 队列 → `sendQueuedNotifications` |
| `startNotificationMonitor` | `setInterval`（默认 30min，最小 15min）+ 启动延迟检查 + Capacitor `appStateChange` resume 检查 |
| 后台开关 | `settings.enableBackground`；关闭则 background-fetch 原因可跳过 |
| 上下文同步 | 每次检查后 `syncBackgroundFetchContext`，把开关/cookie/去重状态写给原生 |
| Android 前台服务 | `platformBridge.setAggressiveKeepAlive(enableBackground)` → `KeepAliveForegroundService` |

### 2.4 LocalNotifications（Capacitor）

**适配器**：`src/platform/adapters/capacitor.ts`

- 权限：`checkPermissions` / `requestPermissions`
- Android Channel：`createChannel`（importance 4）
- 发送：`schedule`，约 **1.5s 后**触发（非“立即 API”，而是短延迟 schedule）
- iOS：不传 `channelId`；`allowWhileIdle` 在 iOS 上关闭
- 点击：`localNotificationActionPerformed` → 业务 `targetView`

配置侧：`capacitor.config.ts` 已声明 presentationOptions。

### 2.5 iOS BG modes 声明

**`ios/App/App/Info.plist`**

```xml
UIBackgroundModes:
  - fetch
  - processing
BGTaskSchedulerPermittedIdentifiers:
  - com.transistorsoft.fetch
  - com.hbut.mini.notify.periodic
```

**未声明**：

- `remote-notification`（静默/可见远程推送）
- `voip` / `audio` / `location`（也不应滥用于“伪装保活”）

App Store 说明（`docs/app-store/APP_REVIEW_NOTES.md`）已写明：Background fetch/processing 用于课表/考试类可选刷新；合规构建中电费等模块可能被裁剪。

### 2.6 Android 原生层

| 组件 | 路径 | 作用 |
|------|------|------|
| Headless 任务 | `android/.../BackgroundFetchHeadlessTask.java`（~650+ 行） | 进程被杀后：读 prefs → HTTP 拉成绩/考试/电费/课表/学习通消息 → 本地 NotificationManager |
| 前台服务 | `KeepAliveForegroundService.java` | `FOREGROUND_SERVICE_TYPE_DATA_SYNC` + 常驻低优先级通知 |
| 开机恢复 | `BootCompletedReceiver` | `BOOT_COMPLETED` / `MY_PACKAGE_REPLACED` |
| 权限 | `AndroidManifest.xml` | `POST_NOTIFICATIONS`、`RECEIVE_BOOT_COMPLETED`、`WAKE_LOCK`、`FOREGROUND_SERVICE(_DATA_SYNC)`、`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` |
| 小组件 | Widget providers + Headless 内 `WidgetRefreshScheduler` | 后台顺带刷新桌面组件 |

Headless 约束（代码注释/逻辑）：

- 学校消息：**仅 chaoxing 登录模式** + 前台同步的 cookie 快照；门户模式需 in-app session，Headless 直接 skip
- 依赖对外 API base（默认 `https://hbut.6661111.xyz/api`）与会话/缓存语义，**非**纯端上 cookie 万能

### 2.7 Tauri 桌面侧（对照，非移动端方案）

**`src-tauri/src/modules/notification.rs`**：进程内 `sleep` 循环查成绩/考试。  
进程被挂起/杀掉即停；**不等于**移动端后台推送，也不应被用户理解为“手机后台”。

### 2.8 用户设置与诊断 UI

**`src/components/NotificationView.vue`**

- 开关：后台自动检查、各业务通知
- 展示 BackgroundFetch runtime status、前台服务状态
- Android：引导电池优化白名单 / 系统设置
- iOS 文案已诚实：**“后台任务由系统自动调度，前台服务保活不可用”**

---

## 3. 平台系统约束

### 3.1 iOS

| 维度 | 约束 | 对本项目含义 |
|------|------|----------------|
| BGAppRefresh / Background Fetch | 系统按使用频率、电量、网络**机会性**调度；可数小时不触发 | `minimumFetchInterval: 15` **不是 SLA** |
| BGProcessingTask | 适合更长任务，但仍机会性；需正确 identifier | 已声明 `processing` + ids，但触发仍不可控 |
| 后台执行窗口 | 通常很短（数十秒级量级），超时必须 `finish` | 检查必须极轻：少请求、快失败 |
| 本地通知 | 已授权则可展示；**产生**通知仍要进程被叫醒 | 仅 schedule 未来提醒可靠（课前提醒可预排），“成绩刚出”需即时检查或远程推送 |
| 远程推送 APNs | 被杀后仍可达；需证书/密钥、服务端、用户授权 | **当前未接入**；是唯一接近 IM 体验的正统路径 |
| 审核 | 后台模式须与声明用途一致；禁止伪 VoIP/定位挂机 | 现有 fetch/processing 用途与课表/考试刷新一致即可；勿扩模式伪装保活 |
| 电池/低电量/低数据模式 | 进一步节流 BG | 用户侧无法强制“每 15 分钟” |

### 3.2 Android

| 维度 | 约束 | 对本项目含义 |
|------|------|----------------|
| Doze / App Standby | 限制网络与唤醒；Alarm 被合并 | `forceAlarmManager` 仅提升机会，OEM 可更狠 |
| 厂商杀后台（小米/华为/OPPO/vivo…） | 强杀后 Job/Alarm 不稳定；需自启动白名单 | 设置页引导电池优化是必要 UX，非可选 |
| 前台服务 | Android 12+ 类型限制；用户可见常驻通知 | `dataSync` 类型已用；滥用会被系统/商店打压，耗电与口碑差 |
| WorkManager / JobScheduler | 系统批处理，不保证精确时间 | BackgroundFetch 底层同类；应预期 **15–60+ 分钟抖动** |
| 通知权限 | Android 13+ `POST_NOTIFICATIONS` 运行时权限 | 已声明；未授权则 Headless `sendNotification` 失败 |
| FCM | 被杀后仍可唤醒短时处理 | **当前未接入**；国内另需厂商通道才稳 |

### 3.3 跨端共性

1. **无服务端 diff**：端上每次被叫醒都要拉成绩/考试/消息 → 耗电、依赖会话、失败面大。  
2. **会话过期**：后台无交互续登；cookie/token 失效则静默失败（用户只感觉“没通知”）。  
3. **演示账号 / 未登录**：无 studentId 时 Headless 与 `runNotificationCheck` 均 early-return。  
4. **App Store 合规构建**：部分模块（如电费）可能被 clamp，后台检查范围应与可见功能对齐。

---

## 4. 可选架构对比

### 路径 A — 纯本地：BGAppRefresh / BackgroundFetch + LocalNotifications

```
[OS 叫醒] → [短任务检查教务/API] → [diff] → [LocalNotifications]
```

| 项 | 评估 |
|----|------|
| 现状契合度 | **已基本落地**（JS + Android Headless + iOS BG 声明） |
| iOS 可达性 | 低～中：不保证频率；重度用户更易被调度 |
| Android 可达性 | 中：白名单 + Headless 后可用；OEM 差异大 |
| 服务器成本 | 无额外推送基建；仍消耗现有 API |
| 审核风险 | 低（用途诚实） |
| 与微信差距 | **大**：无常连、无服务端即时下发 |

**适合**：课前提醒（可预 schedule）、考试日提醒、用户常打开 App 时的“附带检查”。

### 路径 B — 远程推送：APNs / FCM（+ 国内厂商）

```
[服务端监控或用户事件] → [APNs/FCM] → [系统通知 / 静默唤醒短任务]
```

| 项 | 评估 |
|----|------|
| 现状契合度 | **从零建设**（无 SDK、无 token 上报、无推送服务） |
| iOS 可达性 | **高**（系统级通道） |
| Android 可达性 | 高（FCM）；中国大陆需厂商通道或第三方聚合 |
| 服务器成本 | 高：证书、设备 token 库、推送编排、隐私合规、可选服务端爬数/订阅 |
| 审核/合规 | 中：隐私政策声明推送；数据最小化；勿滥发 |
| 与微信差距 | 体验接近“被杀仍能到”，但微信另有私有长连接与系统特权 |

**适合**：成绩发布、紧急学校消息等“时效敏感”事件。

### 路径 C — 混合

- 本地：课前提醒预排、resume 全量检查、BackgroundFetch 尽力兜底  
- 远程：仅关键事件（成绩变更、重要 inbox）由服务端推  

| 项 | 评估 |
|----|------|
| 工程量 | 中高，可分阶段 |
| 性价比 | **最佳长期形态** |
| 风险 | 需清晰产品边界，避免两套逻辑状态不一致 |

### 路径 D — 前台常驻 / 伪保活（对照）

| 项 | 评估 |
|----|------|
| Android 前台服务 | **已部分使用**；用户可见通知、耗电、商店与系统策略风险 |
| iOS | **不可用**（无合法常驻） |
| 对标 QQ/微信 | 不可行：IM 有系统与商业特权，校园助手不应走灰色保活 |

---

## 5. 与 QQ / 微信的差距（诚实预期）

| 能力 | QQ / 微信 | Mini-HBUT 现状 | 能否用客户端补齐 |
|------|-----------|----------------|------------------|
| 进程被杀后即时通知 | 服务端长连接 + APNs/厂商推送 | 无远程推送 | **否**，必须服务端通道 |
| 秒级～分钟级到达 | 是（消息类） | 否；BG 机会性 | **否**（本地路径） |
| 后台网络常连 | 是（特权/厂商合作） | 否 | **否**（且不应做） |
| 本地 diff 拉教务 | 不依赖此做 IM | 是主路径 | 已是主路径 |
| 用户可感知的“后台在跑” | 系统推送即可 | Android 前台服务通知 / iOS 几乎无感 | iOS 无对等物 |
| 会话与登录态 | 自有账号体系 | 教务/门户/学习通 cookie 碎片 | 后台续期极难、合规敏感 |

**产品话术建议**：

- ✅「在系统允许后台刷新且已开通知时，会**尽力**检查成绩/考试等并提醒」  
- ✅「课前提醒可按课表提前安排（本地 schedule）」  
- ❌「像微信一样关闭后立刻收到成绩」——在无远程推送前**禁止承诺**

---

## 6. 差距矩阵（能力 × 平台）

图例：✅ 已有/可用 · ⚠️ 有限/尽力 · ❌ 无/不可承诺 · 🔧 可演进

| 能力项 | iOS 现状 | Android 现状 | 微信级目标 | 建议 |
|--------|----------|--------------|------------|------|
| 本地通知展示 | ✅ LocalNotifications | ✅ + Channel + Headless NM | ✅ | 保持 |
| 通知权限引导 | ✅ | ✅ POST_NOTIFICATIONS + 设置页 | ✅ | 保持 |
| 前台 interval 轮询 | ✅ setInterval（进程活） | ✅ | n/a | 保持 |
| Resume 检查 | ✅ appStateChange | ✅ | n/a | 保持 |
| 系统 BG 周期检查 | ⚠️ BGAppRefresh 不保证 | ⚠️ Job/Alarm + Headless | 远程推送为主 | 诚实文案 + 观测 lastRunAt |
| 杀进程后检查 | ⚠️ 仅系统愿意时 | ⚠️ Headless + 开机 + 白名单 | ✅ 推送 | A 优化 + 评估 B |
| 精确 15min SLA | ❌ | ❌（OEM 更差） | ❌（IM 也不靠本地轮询） | 产品不承诺 |
| 前台服务保活 | ❌ | ⚠️ 已实现 dataSync | 不用此对标 IM | 默认关/可选，勿作为主路径 |
| 远程推送 | ❌ | ❌ | ✅ | 路径 B/C 另开 epic |
| 服务端 diff | ❌ | ❌ | ✅ | 推送前置条件 |
| 课前提醒预排 | 🔧 可增强（多条 schedule） | 🔧 | n/a | 本地路径高价值增强 |
| 学校消息后台 | ⚠️ 依赖 cookie + 被叫醒 | ⚠️ Headless 仅 chaoxing cookie | 推送更稳 | 文档化限制 |
| 电费后台 | ⚠️ 合规构建可能裁剪 | ⚠️ Headless 有 | n/a | 与功能开关一致 |
| 门户 cookie 后台 | ❌ 基本不可靠 | ❌ 同左 | n/a | 禁止过度承诺 |
| App Store 后台模式说明 | ✅ 已有 notes | n/a | n/a | 保持一致 |
| 诊断（lastRun / status） | ⚠️ 设置页有 | ⚠️ 有 | n/a | 可加强埋点 |

---

## 7. 推荐路线与不推荐项

### 7.1 推荐（按优先级）

**P0 — 产品与预期（零/低代码）**

1. 设置页 / FAQ 固定文案：iOS 系统调度、Android 需电池白名单、均**非**微信级。  
2. 明确检查项清单与开关默认值（成绩、考试、课前、电费、学校消息）；未登录/演示账号禁用后台。  
3. 将本文件结论回写 issue #492 验收项。

**P1 — 强化路径 A（小改，非本探索强制）**

1. **课前提醒本地预 schedule**：在前台有课表时用 `LocalNotifications.schedule` 排未来 N 条，不依赖 BG 准点。  
2. 收紧后台任务体积：Headless/JS 检查超时预算、并行上限、失败快速返回。  
3. 会话健康：前台刷新时更新 cookie/签名快照；后台失败分类（无网 / 未授权 / 会话失效）写入 snapshot 供 UI 展示。  
4. Android：保留 Headless 为主路径；前台服务改为**可选高级项**并解释耗电。  
5. 观测：`lastRunAt`、连续失败次数、statusCode，便于支持排障。

**P2 — 路径 C 可行性调研（独立 epic）**

1. 是否有合规的服务端数据源（用户授权后的成绩变更 webhook / 自建轮询队列）。  
2. APNs + FCM（或国内聚合如个推/极光）成本、隐私政策、账号体系。  
3. 仅推「成绩变更 / 重要消息」等高价值事件，本地继续兜底。

### 7.2 不推荐

| 项 | 原因 |
|----|------|
| 承诺“关闭 App 仍像微信一样秒到” | 技术上在无 APNs/FCM 时为虚假宣传 |
| iOS 滥用 `audio` / `voip` / 后台定位保活 | 审核拒绝 + 用户信任崩坏 |
| 以常驻前台服务作为唯一方案 | iOS 无对等；Android 体验差、政策紧 |
| 后台明文长期存高权限密码做静默登录 | 安全与合规红线 |
| 在未评估服务器与证书前硬上推送 SDK | 范围膨胀、密钥与隐私未就绪 |
| 把 Tauri `notification.rs` 循环当成移动端方案 | 运行时模型完全不同 |

### 7.3 默认假设（探索未决时采用）

1. 目标用户主要是在校生，可接受“打开 App / 充电联网时更准”。  
2. 短期不建推送服务器；先交付诚实本地方案。  
3. 后台检查允许失败静默，但应在通知设置页暴露“最近一次后台运行时间”。  
4. 合规构建中被关闭的模块，后台检查同步关闭。

---

## 8. 会话、安全与合规要点

| 主题 | 结论 |
|------|------|
| 后台拉数依赖 | API base + studentId +（部分）cookie 快照；门户完整会话在 Headless **不可靠** |
| 静默续期 | 当前无安全的通用后台 SSO 续期；应优先提示用户打开 App |
| Token 存储 | 仅存检查所需最小快照；禁止新增明文密码落盘 |
| App Store | 后台模式用途已与课表/考试类刷新一致；勿为“保活”扩 UIBackgroundModes |
| 隐私 | 若上推送：设备 token、推送内容最小化、政策页声明、用户可关 |
| 关联合规 | #385 定位/WebView/后台；后台通知勿与定位绑定 |

---

## 9. 与现有代码衔接（实现时）

| 模块 | 衔接建议 |
|------|----------|
| `background_fetch.js` | 继续作为 Capacitor 唯一调度入口；偏好键保持兼容 |
| `notify_center.js` | 检查逻辑唯一真相源；Headless 应逐步对齐语义或共享契约文档 |
| `capacitor.ts` LocalNotifications | 扩展预 schedule API（课前多条） |
| `BackgroundFetchHeadlessTask.java` | Android 杀进程路径；改检查项时双端同步 |
| `NotificationView.vue` | 预期文案、诊断、白名单引导 |
| `notification.rs` | 仅桌面；文档标明不服务移动端 |
| Info.plist | 无远程推送前**不要**加 `remote-notification` |

**双端逻辑漂移风险**：JS `runNotificationCheck` 与 Java Headless 各写一套 HTTP/diff。长期应定义“检查契约”（字段、签名算法、去重键），或让 Headless 只做最小子集并在文档标明差异。

---

## 10. 后续 Sub-issue 标题草案（若进入实现）

1. `[Notify] 产品文案与预期：iOS/Android 后台能力边界（设置页+FAQ）`  
2. `[Notify] 课前提醒改为 LocalNotifications 预 schedule（不依赖 BG 准点）`  
3. `[Notify] 后台运行诊断：lastRunAt / 失败原因 / status 展示与埋点`  
4. `[Android] Headless 与 notify_center 检查契约对齐（成绩签名/考试/电费）`  
5. `[Android] 前台服务改为可选高级项 + 耗电说明`  
6. `[iOS] BGTask 触发与超时遥测（验证真实调度间隔）`  
7. `[Session] 后台 cookie 快照生命周期与失效提示`  
8. `[Epic] 远程推送可行性：APNs/FCM/厂商通道 + 服务端 diff 成本评估`  
9. `[Compliance] 推送/后台与隐私政策、App Review Notes 同步`  

---

## 11. 验收对照（探索 issue 完成定义）

| 期望产出 | 本文件 |
|----------|--------|
| 推荐路径 A/B/C + 理由 | §4、§7 |
| iOS/Android 能力矩阵 | §3、§6 |
| 与现有 BG/LocalNotifications 差距清单 | §2、§5、§6 |
| 实现拆分 sub-issue | §10 |
| App Store / 合规注意 | §3.1、§8 |
| 类微信可达度诚实说明 | §5、§1 |

---

## 12. 关键源码索引（绝对路径）

- `D:\Documents\C_learn\成绩查询\tauri-app\src\utils\background_fetch.js`
- `D:\Documents\C_learn\成绩查询\tauri-app\src\utils\notify_center.js`
- `D:\Documents\C_learn\成绩查询\tauri-app\src\main.ts`
- `D:\Documents\C_learn\成绩查询\tauri-app\src\platform\adapters\capacitor.ts`
- `D:\Documents\C_learn\成绩查询\tauri-app\src\components\NotificationView.vue`
- `D:\Documents\C_learn\成绩查询\tauri-app\capacitor.config.ts`
- `D:\Documents\C_learn\成绩查询\tauri-app\ios\App\App\Info.plist`
- `D:\Documents\C_learn\成绩查询\tauri-app\android\app\src\main\AndroidManifest.xml`
- `D:\Documents\C_learn\成绩查询\tauri-app\android\app\src\main\java\com\hbut\mini\BackgroundFetchHeadlessTask.java`
- `D:\Documents\C_learn\成绩查询\tauri-app\android\app\src\main\java\com\hbut\mini\KeepAliveForegroundService.java`
- `D:\Documents\C_learn\成绩查询\tauri-app\src-tauri\src\modules\notification.rs`
- `D:\Documents\C_learn\成绩查询\tauri-app\issues-draft\background-notify-explore.md`
- `D:\Documents\C_learn\成绩查询\tauri-app\docs\app-store\APP_REVIEW_NOTES.md`

---

*探索完成日期：2026-07-24 · 对应 GitHub issue #492 · 只读分析，无实现变更*
