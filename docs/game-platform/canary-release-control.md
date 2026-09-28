# 游乐场灰度发布控制层（canary）

> 契约来源：`data/plan-game-platform-epic-900.md` 第十轮 Phase 0「契约 A」。
> 实现：`apps/client/src/utils/game_center/{canary,install_id,base,flags}.ts`。
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

版本灰度（可选，与百分比并用）：`allow_versions: ["1.4.12-beta.*"]` 让指定版本直接纳入；
`deny_versions: ["1.4.11-beta.*"]` 用于已知会出问题的版本紧急屏蔽（优先级最高）。

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
