# 游乐场灰度发布控制层（canary）

> 契约来源：`data/plan-game-platform-epic-900.md` 第十轮 Phase 0「契约 A」。
> 实现：`apps/client/src/utils/game_center/{canary,install_id,base,flags}.ts`。
> 宿主注入契约（`app_version` / `host_origin` 必须注入及缺失后果）：`host-injection.md`。
> 本文面向运维 / 发布同学：改远程配置即可分阶段放量、随时紧急关闭，**全程无需发版**。

## 1. 一句话概览

游乐场（Game Center）入口**默认关闭**；运维在远程配置 `game_platform` 块里显式开启后，
可用 `canary` 子块按「版本白名单 / 学号白名单 / 百分比分桶」逐步放量（5% → 20% → 50% → 100%）。
任何解析失败、字段非法、存储不可用都**一律关闭**（fail closed），不会误放给未灰度用户。

## 2. 配置形态

外部静态配置仓（`superdaobo/mini-hbut-config`，生产变更，本仓不修改）：

```jsonc
"game_platform": {
  "enabled": true,                             // 块级硬开关（紧急 kill switch，最高优先级）
  "flags": { "game_center_enabled": true },    // 显式开启游乐场（默认 false，必须显式写）
  "canary": {                                  // 可选：缺省 = 不做灰度（enabled=true 即全量）
    "percent": 5,                              // 0..100，稳定分桶
    "allow_versions": [],                      // 版本白名单，支持末尾 `*` 通配（如 "1.4.12-beta.*"）
    "deny_versions": [],                       // 版本黑名单（优先级最高）
    "allow_students": []                       // 内部/测试学号白名单（9/10 位数字，直接纳入）
  }
}
```

## 3. 判定顺序（不可调换）

```text
1) deny_versions 命中        → 排除（优先级最高，用于紧急屏蔽某个版本）
2) allow_students 命中       → 纳入（内部/测试学号）
3) allow_versions 命中       → 纳入（灰度版本）
4) percent 分桶              → bucket < percent 则纳入
```

- 版本模式语义：**字面前缀 + 只能出现在末尾的 `*`**（与契约 B 服务端
  `GAME_PLATFORM_WRITE_DENY_CLIENT_VERSIONS` 同构）。`*` 不允许作为空前缀（单写 `"*"` 视为非法配置）。
- 学号匹配只认合法学号（9/10 位数字）；读不到会话学号时不猜测身份，直接落到分桶。
- 分桶前若命中白名单，percent 不再参与判定（percent=0 也会纳入白名单用户）。

## 4. 分桶语义

- 分桶键：安装 id，localStorage 键 `hbu_game_install_id`，128bit 随机 hex（32 位）。
  **首次需要分桶时**生成并持久化；同一设备此后恒定。
- `bucket = sha256(installId) % 100`（0..99），同步计算、可跨端复现。
- 同一安装 id 的分桶值稳定 —— 放量比例调大时**已纳入的用户不会掉出**（只增不减）。
- **分桶键不可得**（隐私模式 / 存储被禁 / 写入失败 / 已有值被污染）→ **一律排除**（fail closed）。
  注意：`percent: 100` 同样要求分桶键可得；如需对全部用户（含隐私模式）全量，请**删除 `canary` 字段**
  （或直接用 `enabled` 全量），不要用 `percent: 100` 表达“无视存储”的意图。

## 5. 分阶段放量操作步骤（改配置即可，无需发版）

1. **准备**：在配置仓 `game_platform` 块写入 `"enabled": true`、
   `"flags": { "game_center_enabled": true }`，并加 `"canary": { "percent": 5, ... }`。
   （若同时需要内部用户先看：把内部学号放进 `allow_students`。）
2. **5%**：`percent: 5`，观察 1–3 天（崩溃率 / 反馈 / 后端指标）。
3. **20%**：把 `percent` 改成 20。已纳入用户不变，只新增 15% 用户。
4. **50%**：同上，改成 50。
5. **100%**：把 `canary` 字段整体删除（推荐，避免隐私模式用户被分桶键规则排除），
   或临时用 `percent: 100`（此时仍要求分桶键可得）。
6. 每一阶段只改一个字段并保存；客户端下次拉取配置即生效（无需发版、无需用户更新）。

版本灰度（可选，与百分比并用）：`allow_versions: ["1.4.12-beta*"]` 让指定 beta 系列
（含裸 `1.4.12-beta` 与子版本 `1.4.12-beta.1`）直接纳入；`deny_versions: ["1.4.11-beta*"]`
用于已知会出问题的 beta 系列紧急屏蔽（优先级最高）。

⚠ 通配是**字面前缀**匹配（#958）：`"1.4.11-beta.*"` 只匹配 `1.4.11-beta.` 开头的串，
**不匹配**裸 `1.4.11-beta` —— 要连裸 beta 版一起匹配，请去掉末尾点号（`1.4.11-beta*`）。
版本名单匹配串的来源与形态（CI stamp 值 vs 本地构建 `+local` 后缀）见 §9。

## 6. 紧急关闭

按优先级从高到低任选其一，**均无需发版**：

1. `"enabled": false`（块级 kill switch：清空 origin 白名单 + 坍缩全部 V2 子开关）；
2. `"flags": { "game_center_enabled": false }`（只回滚游乐场入口）；
3. `deny_versions` 加入受影响版本（精确屏蔽某个版本）。

回滚是即时且可预期的：判定的任何一步“缺失/非法/不可得”都会导致**关闭**。

## 7. fail closed 清单（逐条对应实现）

- 无任何可用配置（远程拉取失败且无有效快照 / 包内兜底也无该块）→ **关**（默认值 false）；
- `canary` 存在但 `percent` 缺省 → 按 **0%**（宁可关，不得默认全量）；
- `percent` 非 `0..100` 的有限数字（-1 / 101 / NaN / 字符串 / 对象）→ **关**；
- 版本串非法（空串、含空白、非 ASCII、`*` 不在末尾或空前缀）→ **关**；
- 学号白名单条目非法（非 9/10 位数字）→ **关**；
- 分桶键不可得（隐私模式 / 存储不可用 / 写入失败 / 值被污染）→ **一律排除**。

包内兜底 `apps/client/public/remote_config.json` **不含** `game_platform` 块，
且有结构性契约测试（`game_center_canary_wiring.spec.ts`）防止未来被改成默认开启。

## 8. 边界与注意事项

- `canary` 只控制“是否纳入”，**不会**打开任何开关：开启仍需 `enabled` + `flags.game_center_enabled` 显式写入。
- 灰度未纳入 = 等价块级关闭：会同时坍缩 `game_verified_session_enabled` / `game_economy_enabled` /
  `drift_bottle_enabled` / W3 三个新开关，并清空 `allowed_game_origins`。
- `classic_game_entries_visible`（旧「更多」页 11 个经典入口）**不在**灰度/块级坍缩范围内，避免回滚误伤。
- 合规包（App Store / TestFlight guest/demo）夹紧只会更严：即使灰度纳入也不会被打开。
- 灰度配置**不要**写进包内兜底配置：包内配置是离线兜底，改动它等于发版，
  且有护栏测试拦截“包内默认开启”。

## 9. 版本名单的匹配串口径（#976）

版本名单（本文的 `allow_versions` / `deny_versions`，以及服务端契约 B 的
`GAME_PLATFORM_WRITE_DENY_CLIENT_VERSIONS`）匹配的是**客户端自报的 `app_version`**，
其唯一来源是**构建期注入的 `VITE_APP_VERSION`**（`apps/client/vite.config.ts` ← `package.json` 版本）：

- **CI dev/beta 构建**：构建前由 `scripts/ci/stamp_app_version.mjs` 把版本 stamp 成
  `X.Y.(Z+1)-beta.N`（与同一构建发布的模块版本标签同串），名单按此形态配置（如 `1.4.12-beta*`）即可命中；
- **正式发布构建**（release 档位，`release.yml` / `ios-testflight.yml`）：上报裸正式版号（如 `1.4.11`）；
- **本地 / dev worktree 等未 stamp 构建**：自动携带可区分后缀 `+local`（如 `1.4.11+local`），
  **不会与线上正式版同串** —— 版本名单按串即可区分本地实例，排障时也能分辨构建来源。

核对方法（写名单前逐项确认）：

1. 看目标构建实例的 iframe URL `app_version` 参数（最直接，见 `host-injection.md`）；
2. 看本次构建的 stamp 值（CI 日志 `stamp_app_version` 步骤 / 同批发布的模块版本标签）；
3. 本地实例看 `apps/client/package.json` 版本 —— 未 stamp 构建上报的是 `<该版本>+local`。

注意：前缀通配会把可区分后缀一并命中 —— `1.4.11*` 同时命中正式版 `1.4.11` 与本地
`1.4.11+local`；只想精确命中正式版请用**不带 `*`** 的精确串 `1.4.11`。

## 10. 三类静默失效与手误防御（#958）

canary 配置由运维手写 JSON，无类型系统拦截。以下三类手误都会**静默失效**（表现为
“以为关了/以为灰了，实际全量”），请对照防御措施：

| # | 手误 | 失效表现 | 防御 |
|---|---|---|---|
| 1 | `canary` 键名写错（`canaries` / `canary_percent` / `canaryy` …） | 归一化得 `null` → 等价「不做灰度」→ `enabled=true` 即**全量** | 客户端归一化时检测近邻拼写键，经 `GameCenterFlags.canary_typo_keys` 诊断字段暴露（判定语义不变）；配合 §11 核对清单 |
| 2 | 通配尾点写错（`1.4.11-beta.*` 匹配不到裸 `1.4.11-beta`） | 裸 beta 版本不被 deny/allow 命中 | 官方示例已统一为无尾点形态（`1.4.11-beta*`）；匹配语义见 §3 与 `canary.ts` 注释 |
| 3 | `enabled` 字段缺省 | 缺省 = **true**（显式约定，与 `base.ts` 实现一致）：写 `flags.game_center_enabled=true` 而漏写 `enabled` 会直接全量开启 | §11 核对清单；紧急关闭必须显式写 `"enabled": false`（只删 `enabled` 不会关闭） |

其中「`canary` 键缺失 = 不做灰度（`no_canary`，全量）」是**既有契约语义**（fail closed 只针对
“配错”，不针对“没配”），已有测试锁定（`game_center_canary*.spec.ts`），**不要**把它误改成“缺失 = 关”。

## 11. 发布前核对清单（改 canary 配置后逐项打勾）

- [ ] 块级键名逐字为 `canary`（不是 `canaries` / `canary_percent` 等；写错 = 不灰度，等价全量）
- [ ] `enabled` 显式写出（缺省 = true；要关必须显式 `false`）
- [ ] `enabled` 与 `flags.game_center_enabled` 的组合符合本意
- [ ] 版本串与目标构建的 `app_version` 实际形态一致（§9 核对方法；CI beta 构建是
      `X.Y.Z-beta.N` 形态，本地未 stamp 构建带 `+local` 后缀）
- [ ] 通配只允许末尾一个 `*`；要匹配裸 beta 版时**不带尾点**（`1.4.11-beta*`）
- [ ] `allow_students` 中的条目都是 9/10 位合法学号
- [ ] `percent` 在 0..100 内；要全量时优先**删除 `canary` 字段**（避免隐私模式用户被分桶键规则排除，见 §4）
- [ ] 客户端实测：命中 / 未命中各找一台设备对照 §3 判定顺序验证入口可见性

## 12. 信任模型与能力边界（#957）

**结论：本控制层（远程配置 + 本地快照）是产品开关，不是安全边界。**

- 远程配置（含本地快照 `hbu_remote_config_snapshot`）在客户端侧**无签名、无完整性保护**：
  能修改本机 WebView localStorage 的用户（root / 改包 / 同源 XSS / 手动调试）可把快照改写为
  `game_platform.enabled=true + flags.game_center_enabled=true`，在远程明确“关闭”的状态下把自己
  “灰度进来”—— 冷启动**首帧即生效**（在线也如此；首帧优先读快照、后台再拉真远端，是
  已知的体验取舍，见 `remote_config.ts` 的 `loadSnapshot` / `fetchRemoteConfig` 注释）。
- 因此客户端侧的灰度、canary 与 kill switch 对“能改本机存储的攻击者”**不构成安全边界**；
  “关停对客户端生效”只对不会主动篡改本机存储的普通用户成立。
- **权威防线在服务端**：Launch Ticket / Game Session 签发、契约 B 写入隔离
  （`GAME_PLATFORM_WRITE_DENY_CLIENT_VERSIONS`）、经济结算规则全部由服务端独立把关；
  客户端自启用**拿不到任何服务端权益**（顶多看到入口与本地记录），服务端门禁不受客户端篡改影响。
- 客户端**不做**快照防篡改（客户端无法自我验证本机存储的真实性）；该能力边界声明同时写在
  `apps/client/src/utils/remote_config.ts` 源码注释中，两处口径一致。
