# 生产后端接口缺口清单（`mini.hbut.site`）

> **面向**：后端 / 部署负责人
> **编写时间**：2026-10-06
> **客户端基线**：`origin/main` `506bc157`（worktree 分支 `fix/oidc-launch-rank-netstatus`）
> **服务端线上版本**：兜底域 HF Space `hf-prod/main` = `1fcdc0a`

## ✅ 状态更新（2026-10-07）：下列缺口**已全部补齐**

主域完成一次部署后复测（经外部视角，见 §5 命令），**本文档列出的 P0–P3 全部通过**：

| 项 | 复测结果 |
|---|---|
| P0 主域缺 `/api/game-platform/v1/*` | ✅ `/meta` **200**（原 403）、`/me/wallet` **401 AUTH_REQUIRED**（原 404，端点已存在） |
| P1 `capabilities.verified_reward` 缺失 | ✅ 已为 `true` |
| P2 `capabilities.gomoku_competitive` 缺失 | ✅ 已为 `true` |
| P3 `board=verified` / `classic` 返回 400 | ✅ 两者均返回 `success: true` |
| 其它通道 | ✅ `/health`、`/api/game-rank/ping`（PG）、`/api/cloud-sync/ping`（PG）均 200 |

**仍成立的一条约束（P0-2，属客户端行为，不是后端缺陷）**：客户端故障转移**不覆盖 4xx**
（`apps/client/src/utils/game_center/api.ts:238-242`）。因此若主域再次出现 403/404，
不会自动切到兜底域 —— 这一点在后端再次变更时需要留意。

以下为**修复前**的原始记录，保留以便回溯与回归对照。

---

## 0. 一句话结论

**生产主域 `mini.hbut.site` 缺整套 `/api/game-platform/v1/*`**（#909 积分中心 / #910 漂流瓶 / 钱包 / 总排行榜 / 每日任务 / 五子棋对战），
而唯一兜底域 `mini-hbut-ocr-service.hf.space` 功能齐全。目前是靠客户端远程配置把游戏平台 `api_base` **硬钉在兜底域**才"看起来正常"；
一旦远程配置不可达，主域会 403/404 而**客户端不会故障转移**（4xx 不触发切换），整个游乐场会变暗。

另外兜底域 `/meta` 的 `capabilities` 少了两个键，直接导致两个用户可见功能被**永久隐藏**。

---

## 1. 两域现状（2026-10-06 实测）

| 通道 | 主域 `mini.hbut.site` | 兜底域 `mini-hbut-ocr-service.hf.space` |
|---|---|---|
| `/health` | 200（uptime 3 天+） | 200 |
| `/api/cloud-sync/ping` | 200（`mini-hbut-cloud-sync-pg`，PG） | 200 |
| `/api/game-rank/ping` | 200（`mini-hbut-game-rank-pg`，PG，`db_ready:true`） | 200 |
| `/api/game-platform/v1/meta` | **403 `FEATURE_DISABLED`** | 200（`capabilities` 基本齐全，但缺 2 键，见 §2） |
| `/api/game-platform/v1/me/wallet` | **404 `FEATURE_DISABLED`**（路由未注册） | 401（端点存在，需鉴权） |
| `/api/forum/categories` | 200 | 200 |

结论：主域**不是"整体没部署"**，而是**只缺 game-platform 这一块**。cloud-sync / game-rank / forum 都在，且已迁 PG。

> 主域数据经**外部视角**取得（本机网络对主域有 TUN 代理路由问题，直连不通 ≠ 全局不通）。复现命令见 §5。

---

## 2. 缺口清单（按影响面排序）

### P0-1 主域缺整套 `/api/game-platform/v1/*`

- **实测**：`/meta` → 403 `{"code":"FEATURE_DISABLED","message":"该功能暂未开放"}`；`/me/wallet` → 404 同错误码。
- **客户端为什么需要**：release 构建的默认游戏源就是主域（`STATISTICS_SERVICE_BASE_URL`）。当远程配置不可用（离线 / 配置仓不可达 / 用户关闭远程配置）时，游戏平台会回落到主域 → 能力表全 false → 游乐场整体变暗。
- **期望**：与兜底域一致的 `/meta` 及全部已注册路由。
- **需要做的两件事**：
  1. 把 `hf-prod/main`（`1fcdc0a`）同步/部署到主域；
  2. 打开主域的游戏平台总开关（`GAME_PLATFORM_ENABLED`）—— 当前 403 正是平台总开关关闭导致的（`routes_support.py` 的 `require_enabled()`）。
- **参考实现（线上已有）**：`1fcdc0a` 的 `modules/game_platform/routes.py`（#909/#910 路由已注册）。

### P0-2 客户端故障转移**不覆盖 4xx**（设计约束，需后端知晓）

- 代码：`apps/client/src/utils/game_center/api.ts:238-242`

  ```js
  const isGameFailoverWorthy = (error) => {
    if (error.httpStatus >= 400) return error.httpStatus >= 500
    return error.code === LOCAL_ERROR_CODES.transportFailed
  }
  ```

- **含义**：主域返回 **403 / 404 时不会切到兜底域**（4xx 被判定为"服务活着 / 调用方问题"）。
- **因此**：在 P0-1 修好之前，远程配置**必须继续**把 `game_platform.api_base` 钉在兜底域，不能去掉；
  否则游乐场会直接不可用，而不是自动兜底。
- 若希望"主域坏掉能自动兜底"，要么主域在未启用时返回 5xx，要么把 `FEATURE_DISABLED` 纳入客户端的可切换错误码 —— 后者属客户端契约变更，需另行评审。

### P1 `/meta.capabilities` 缺 `verified_reward` → 可信结算发奖 UI 永久隐藏

- **实测**（兜底域）：`features.verified_reward = true`，但 `capabilities` 里**没有** `verified_reward` 键。
- **客户端**：`apps/client/src/components/GameCenterView.vue:135`

  ```js
  verifiedRewardEnabled = flags.verified_reward_enabled === true && capabilities.verified_reward === true
  ```

  宿主 UI **按设计只读 `capabilities`**（不读 `features`），所以 `features` 里的 true 救不回来
  → `GameCenterRankTab.vue:100` 永远显示「本轮不计发奖励」，可信结算发奖入口被前置隐藏。
- **期望**：`capabilities.verified_reward: true`（与 `features` 同源同值）。
- **服务端位置**：`1fcdc0a:modules/game_platform/routes_support.py:214-227` 的 `PROTOCOL_CAPABILITIES`（现有 9 键，无此项）。

### P2 `/meta.capabilities` 缺 `gomoku_competitive`

- 客户端 SDK 的 canonical 能力键是 `gomoku_competitive`，服务端只声明 `gomoku_match`。
- 当前靠 `features.gomoku_competitive` 兜底读取（线上为 false，与预期一致），**暂不显现**；
  但一旦 capabilities 权威化或 features 被清理，SDK 会误判五子棋竞技不可用。
- **期望**：`capabilities.gomoku_competitive`（与 `gomoku_match` 同源）。

### P3 `/leaderboards` 的 `board` 枚举与客户端不一致（活缺陷）

- **实测**（兜底域）：

  | 请求 | 结果 |
  |---|---|
  | `board=global_xp&limit=3` | 200（`items: []`） |
  | `board=verified&game_id=hbut_gomoku&scope=school` | **400 `BOARD_INVALID`「榜单类型不支持」** |
  | `board=classic&game_id=hbut_gomoku&scope=school` | **400 `BOARD_INVALID`** |

- **服务端**：`1fcdc0a:modules/game_platform/leaderboards.py:50` → `SUPPORTED_BOARDS = (BOARD_GLOBAL_XP,)`，只支持 `global_xp`。
- **客户端发送的 board 值**：
  - `GameCenterView.vue:314` Verified 赛季榜 → `board: 'verified'`
  - 游戏 SDK 默认 → `board: 'classic'`（`_sdk/src/adapters/adapter.js:245`）
  - 总排行榜 → `board: 'global_xp'`（`points.ts:40`，唯一对得上的）
- **影响**：线上 `game_verified_session_enabled=true` 且 `capabilities.leaderboards=true` → Verified 赛季榜区块会请求 `board=verified` → 400 → 显示错误而非数据；
  任何走 SDK verified 模式并沿用默认 `classic` 的游戏榜同样 400。
- **需要决策（两端契约不一致，二选一）**：
  - (a) 服务端把 `verified` / `classic` 作为别名接受（映射到赛季榜 / 经典榜）；
  - (b) 明确只做 `global_xp`，由客户端改调用（需客户端契约变更）。
  当前是"两端各自以为对方支持"，会持续产生 400。

---

## 3. 环境与部署提醒

- **本地 ocr-service 工作树与线上分叉**：本机 `HEAD = e9be1f0`，线上兜底域跑的是 `hf-prod/main = 1fcdc0a`，两者**不是祖先关系**。
  排查时请以 `git show 1fcdc0a:<path>` 为准，**不要用本地文件当生产事实**。
  - 典型差异：本地 `routes_support.py` 仍写 `leaderboards/wallet/daily_tasks/drift_bottle = False`（#909/#910 之前的状态），线上已是 `true`。
- **测试后端已下线，且客户端不再使用它**：`mini-hbut/testocr1` 的 HF runtime 是 `stage=PAUSED`、`errorMessage="Flagged as abusive"`。
  客户端已改为**所有构建档位统一走生产主域 + 唯一兜底域**，并把 `testocr1` 列入"拒绝清单"（存量配置会被清理）。
  因此该 Space **可以不再恢复**；若仍想保留它做隔离环境，请另行设计（不要让客户端默认指向它）。

---

## 4. 未验证的部分（诚实声明）

写入类端点（`/tickets`、`/sessions`、`/runs`、`/runs/{id}/finish`、`POST /drift-bottles` 及 `claim/report/hide`、
`/matches/*`、`/api/game-rank/submit`、`/api/cloud-sync/upload`、`/api/ocr/recognize`、`/api/temp/upload`、
`/api/usage-stats/upload|heartbeat`、论坛写入类、五子棋 relay `join/send/leave`）
**本次只做代码层盘点，未发起真实请求**（避免副作用 / 脏数据）。
它们的存在性通过 `GET` 探针间接确认（返回 405 = 端点存在但方法不对）。

---

## 5. 复现命令

```bash
# ── 兜底域（线上实际游戏后端）────────────────────────────
B=https://mini-hbut-ocr-service.hf.space
curl -s "$B/api/game-platform/v1/meta" | python -m json.tool | head -40
curl -s -w " [%{http_code}]\n" "$B/api/game-platform/v1/leaderboards?board=global_xp&limit=3"
curl -s -w " [%{http_code}]\n" "$B/api/game-platform/v1/leaderboards?board=verified&game_id=hbut_gomoku&scope=school&limit=3"
curl -s -w " [%{http_code}]\n" "$B/api/game-platform/v1/leaderboards?board=classic&game_id=hbut_gomoku&scope=school&limit=3"
curl -s -w " [%{http_code}]\n" "$B/api/game-platform/v1/me/wallet"

# ── 主域 ────────────────────────────────────────────────
P=https://mini.hbut.site
curl -s -w " [%{http_code}]\n" "$P/api/game-platform/v1/meta"
curl -s -w " [%{http_code}]\n" "$P/api/game-platform/v1/me/wallet"
curl -s -w " [%{http_code}]\n" "$P/api/game-rank/ping"
curl -s -w " [%{http_code}]\n" "$P/api/cloud-sync/ping"

# ── 外部视角（本机对主域有 TUN 代理路由问题，直连不通 ≠ 全局不通）──
curl -s "https://r.jina.ai/https://mini.hbut.site/api/game-platform/v1/meta"
```

---

## 6. 服务端代码位置速查（线上 `1fcdc0a`）

| 关注点 | 位置 |
|---|---|
| 能力表（缺 `verified_reward` / `gomoku_competitive`） | `modules/game_platform/routes_support.py:214-227` |
| 能力 → 路由漂移断言 | `modules/game_platform/routes_support.py:229+` |
| 榜单支持类型（只有 `global_xp`） | `modules/game_platform/leaderboards.py:50` |
| #909 / #910 路由注册 | `modules/game_platform/routes.py`、`drift_routes.py`、`gomoku_routes.py` |
| 平台总开关（主域 403 的来源） | `routes_support.py` 的 `require_enabled()` |

---

## 关联

- 客户端侧同轮修复：issue #998（排行榜真实错误透出）、#999（环境后端可观测性 + 运行手册）
- 环境与档位说明：[环境后端运行手册](./environment-backend-runbook.md)
- 两域模型契约：[后端端点与故障转移契约](./backend-endpoints-contract.md)
