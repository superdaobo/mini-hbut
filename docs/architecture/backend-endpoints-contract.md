# 🔌 后端端点与故障转移契约（Backend Endpoints & Failover Contract）

> 状态：**v1 冻结**（2026-10-02）
> 适用：mini-hbut 客户端（Tauri / Capacitor / Web）与游戏模块 SDK
> 关联计划：`data/plan-backend-fallback-mini-hbut-site.md`
> 关联实现：`apps/client/src/utils/backend_endpoints.ts`、`apps/client/src/utils/backend_failover.ts`

本契约定义「后端地址」的统一模型：**端点组（backend groups）+ 组级故障转移**。
所有后端调用（云同步 / 游戏 V2 / 游戏 Legacy / OCR / 临时上传 / 论坛 / WebDAV）都必须从本契约解析地址，
不得在业务代码里硬编码域名或自行拼路径。

---

## 1. 目的

1. **一键切换**：改远程 `remote_config.json` 即可把全部后端从 `mini.hbut.site` 切换到兜底域名（反之亦然），无需发版。
2. **自动兜底**：主域名不可达（网络错误 / 超时 / 5xx）时，客户端自动尝试兜底域名。
3. **同源安全**：游戏票据（Launch Ticket）签发端与游戏内校验端必须同源——由「组」保证，禁止按通道独立漂移。
4. **可配置可扩展**：兜底域名是一个有序数组，追加一行即可新增；应用内配置工具可视化编辑并导出。

---

## 2. 术语

| 术语 | 定义 |
|---|---|
| **端点组（group）** | `{ id, base, paths? }`；一个后端域名 + 该域名的通道路径映射。组内所有通道天然同源。 |
| **通道（channel）** | 一类后端能力：`cloud_sync` / `game_rank` / `game_platform` / `ocr` / `temp_upload` / `forum`。 |
| **生效组（active group）** | 本次请求实际使用的组；同一请求内所有通道派生**同一组**（原子），见 §7 I1。 |
| **通道级显式覆盖** | 旧字段（如 `cloud_sync.proxy_endpoint`）显式配置时，锁定该通道、不参与组切换。 |
| **生产域白名单** | 允许出现在默认值与线上配置中的域名集合（当前为两个，见 §9）。 |

---

## 3. 配置模型

### 3.1 端点组 `backend.groups`

```jsonc
"backend": {
  "groups": [
    { "id": "mini",    "base": "https://mini.hbut.site" },
    { "id": "hf-prod", "base": "https://mini-hbut-ocr-service.hf.space" }
  ]
}
```

规则：

- **顺序即优先级**：数组第 1 项为主，其余为兜底，按序尝试。
- `id` 必填、唯一、`^[a-z0-9_-]{1,32}$`；重复 `id` 只保留首个。
- `base` 必填；仅接受 `https://`（`http://` 仅允许 loopback：`localhost` / `127.0.0.1` / `[::1]` / `::1`）；`base` 末尾斜杠归一化去除。
- `enabled: false` 的组跳过（不删除，便于临时停用）。
- 非法组（缺 `base` / 协议不符 / 解析失败）**丢弃**，不计入候选；解析层返回被丢弃项的计数，日志可见。

### 3.2 路径映射 `backend.paths`

全局路径，可被组内同名键覆盖：

```jsonc
"backend": {
  "paths": {
    "cloud_sync":    "/api/cloud-sync",
    "game_rank":     "/api/game-rank",
    "game_platform": "/api/game-platform/v1",
    "ocr":           "/api/ocr/recognize",
    "temp_upload":   "/api/temp/upload",
    "forum":         "/api/forum"
  }
}
```

- 路径必须以 `/` 开头；缺失时回落到**内置默认路径**（与上表一致）。
- 组内 `paths` 覆盖全局同名键（用于个别后端路径不同的场景）。

### 3.3 故障转移参数 `backend.failover`

```jsonc
"backend": {
  "failover": {
    "enabled": true,
    "failure_ttl_seconds": 300,
    "max_attempts_per_request": 2,
    "probe_timeout_ms": 3000
  }
}
```

| 键 | 默认 | 约束 | 语义 |
|---|---|---|---|
| `enabled` | `true` | bool | 关闭后只使用首组（等价于旧的单端点行为） |
| `failure_ttl_seconds` | `300` | 30–3600 | 组被标记失败后的冷却时长 |
| `max_attempts_per_request` | `2` | 1–组数 | 单次请求最多尝试的组数（两组模型下 = 全量尝试） |
| `probe_timeout_ms` | `3000` | 1000–10000 | 切换判定用的单次探测超时（非业务超时，业务超时仍由各通道配置决定） |

### 3.4 通道级显式覆盖（旧字段，保留）

```jsonc
"cloud_sync":       { "proxy_endpoint": "", "fallback_endpoints": [] },
"game_platform":    { "api_base": "",       "fallback_api_bases": [] },
"forum":            { "api_base": "",       "fallback_api_bases": [] },
"temp_file_server": { "schedule_upload_endpoint": "", "fallback_upload_endpoints": [] },
"ocr":              { "endpoint": "", "endpoints": [], "local_fallback_endpoints": [] }
```

- 显式值非空且合法（HTTPS / loopback）时，**该通道锁定为显式值（含其 fallback 列表），不参与组切换**。
- 用途：① 兼容不认 `backend.groups` 的旧版本；② 单通道救火（例如只把 OCR 临时指向某台机器）。
- 旧字段与 `backend.groups` 同时存在时：**旧字段优先**（见 §4）。

---

## 4. 解析优先级

从高到低：

```
① 通道级显式覆盖（远程或本地设置中的非空值）
② backend.groups（远程）—— 组级故障转移
③ 本地设置（app_settings.backend.*）—— 仅当 useRemoteConfig=false 或远程/快照均不可达
④ 内置默认（见 §10）
```

补充规则：

- `useRemoteConfig=false` 时跳过 ①② 中的**远程来源**，仅使用本地设置与内置默认。
- 远程配置**拉取成功**才写入快照并生效（覆盖本地）；拉取失败保留既有快照，绝不回退到打包 JSON 覆盖快照。
- 同一进程内多处读取必须走同一解析函数，禁止业务代码自行读取 localStorage 原始键。

---

## 5. 派生规则

给定生效组 `G` 与路径映射 `P`：

| 通道 | URL |
|---|---|
| `cloud_sync` | `G.base + P.cloud_sync` |
| `game_rank` | `G.base + P.game_rank` |
| `game_platform` | `G.base + P.game_platform` |
| `ocr` | `G.base + P.ocr` |
| `temp_upload` | `G.base + P.temp_upload` |
| `forum` | `G.base + P.forum` |

禁止字符串替换式派生（如"把 `/api/cloud-sync` 换成 `/api/game-rank`"）——历史实现中的该做法是本次重构的消除对象。

---

## 6. 故障转移语义

### 6.1 触发切换（视为"组不可用"）

- `fetch` 抛出网络错误（DNS / 连接被拒 / TLS 失败）；
- 请求超时（含 `probe_timeout_ms` 与通道自身超时）；
- HTTP `5xx`；
- 响应体断言失败（例如云同步返回 `success:false` 且错误属于服务端故障类）。

### 6.2 不触发切换

- HTTP `4xx`（含 401/403/404/422）——服务活着，请求本身有问题；按各通道既有错误处理走（401 的 token 刷新逻辑不变）。
- 业务层错误码（游戏协议 error envelope 中的业务码）。

### 6.3 状态机（主组优先，冷却跳过）

策略：**未冷却组按数组原顺序尝试；冷却到期后主组自动回归。**

1. 请求前：`planAttemptOrder` 产出本次尝试顺序——取所有 `enabled` 且**未处于冷却期**的组，按数组原顺序，最多 `max_attempts_per_request` 个。
2. 失败（网络 / 超时 / 5xx，由调用方判定）：`markGroupFailed(groupId)` 写入冷却表（`id → now + failure_ttl_seconds`），本次请求继续尝试顺序中的下一组。
3. 成功：`markGroupSucceeded(groupId)` 清除该组冷却并记录为「最后成功组」；若与上次不同则广播 `hbu-backend-endpoints-updated`。
4. 全部候选组失败：返回最后一次错误；下一个请求重新按序尝试。
5. 全部组都在冷却期：优先返回「最后成功组」，无记录时返回首组（保证至少尝试一次）。
6. 冷却到期：组自动回到候选序列（无需后台轮询）；主组在数组首位，冷却一过即优先——**主组恢复后自动回归，避免永久停留在兜底**。

持久化：冷却表写入 localStorage `hbu_backend_failed_groups_v1`（含 `failedUntil: { groupId: until }` 与 `lastSucceededGroupId`）。
意义：主组长时间不可用时，冷启动直接走兜底，不必每次撞超时；同时不会因为"固化在兜底组"而长期偏离主域名。
超过 24h 的陈旧记录在读写时自动清理。

### 6.4 幂等与重试

- 只有**幂等请求**允许跨组自动重试：
  - 云同步 `upload`（覆盖式写入）、`download`（只读）、`ping`（只读）；
  - 游戏 `tickets`（携带 `Idempotency-Key`）、只读查询；
  - OCR / temp_upload / forum / WebDAV 的只读或覆盖式操作。
- 非幂等或状态不确定的请求：只尝试当前组，失败即返回错误（不自动跨组），由调用方决定是否重试。

### 6.5 令牌与端点的绑定

- 云同步 challenge、游戏 ticket 等**与端点绑定的短期凭据**，在组切换后必须重新获取；缓存键必须包含端点（现有 `challengeState.endpoint` 校验规则保留并强化）。
- 禁止把 A 组拿到的凭据发给 B 组。

---

## 7. 不变量（Invariants）

以下为**硬约束**，任何实现变更不得违反：

- **I1 游戏同源**：宿主签发 Launch Ticket 使用的组，必须与注入 iframe 的 `rank_api` 及游戏内 SDK 派生出的 V2 base 所在的组**同一**。同一时刻不得出现"票在 A 组签、游戏在 B 组验"。
- **I2 生产域白名单**：默认值与线上配置中只允许出现 `mini.hbut.site` 与 `mini-hbut-ocr-service.hf.space` 两个业务域；`mini-hbut-testocr1.hf.space` 仅用于开发/测试构建的环境隔离，不得进入生产配置。
- **I3 远程覆盖本地，失败不清空**：仅"拉取成功"触发覆盖；任何失败路径保留既有快照/本地设置。
- **I4 旧字段优先**：通道级显式覆盖优先于组模型（兼容与救火通道）。
- **I5 非幂等不自动重试**（见 §6.4）。
- **I6 单一解析源**：所有通道的地址解析必须经由 `backend_endpoints.ts` / `backend_failover.ts`，禁止业务模块自行拼接。

---

## 8. 兼容与迁移

### 8.1 对旧版本客户端

远程 `remote_config.json` 必须**同时写**新字段与旧字段：

| 新字段 | 同步写入的旧字段 |
|---|---|
| `backend.groups[0]` | `cloud_sync.proxy_endpoint`、`game_platform.api_base`、`forum.api_base`、`temp_file_server.schedule_upload_endpoint`、`ocr.endpoint(s)` |
| `backend.groups[1..]` | `cloud_sync.fallback_endpoints`、`game_platform.fallback_api_bases`、`ocr.local_fallback_endpoints`、`temp_file_server.fallback_upload_endpoints` |

旧版本客户端忽略 `backend.*`，按旧字段工作（至少主域名已切换、不报错）。

### 8.2 历史域名的处理

- `superdaobo-ocr-service.hf.space`、`1.94.167.18:5080`：从默认位与线上配置移除。
- 若客户端在历史配置/本地设置中读到这些域名：**放行不报错**（不加入默认候选、不做硬拒绝），避免存量用户配置失效。
- 判定类白名单（Rust `is_production_ocr_endpoint` / `is_first_party_ocr_endpoint`、`statistics_environment.ts`）收敛到两域 + 环境隔离域。

### 8.3 迁移步骤（运维）

1. 在配置仓 `remote_config.json` 中加入 `backend.groups`（两域）并同步旧字段；
2. 观察一个版本周期（新客户端用组、旧客户端用旧字段）；
3. 收口：移除线上 `local_fallback_endpoints` 中的历史域名。

---

## 9. 生产域白名单

| 域 | 角色 | 出现位置 |
|---|---|---|
| `https://mini.hbut.site` | 主 | 默认位、线上配置、`backend.groups[0]` |
| `https://mini-hbut-ocr-service.hf.space` | 唯一兜底 | 默认位、线上配置、`backend.groups[1]` |
| `https://mini-hbut-testocr1.hf.space` | 环境隔离（仅非 release 构建） | Rust `default_remote_ocr_endpoint()` 的非 release 分支、前端环境端点 |

其他历史域名（`superdaobo-ocr-service.hf.space`、`1.94.167.18:5080`）：**不允许**出现在默认位与线上配置；出现在用户本地配置时按 §8.2 放行。

---

## 10. 内置默认值（fresh install / 全离线）

```jsonc
{
  "backend": {
    "groups": [
      { "id": "mini",    "base": "https://mini.hbut.site" },
      { "id": "hf-prod", "base": "https://mini-hbut-ocr-service.hf.space" }
    ],
    "failover": { "enabled": true, "failure_ttl_seconds": 300, "max_attempts_per_request": 2, "probe_timeout_ms": 3000 }
  }
}
```

各通道的旧字段内置默认（无远程、无本地设置时）：

| 通道 | 默认 |
|---|---|
| `cloud_sync.proxy_endpoint` | `https://mini.hbut.site/api/cloud-sync` |
| `game_platform.api_base` | `https://mini.hbut.site/api/game-platform/v1` |
| `forum.api_base` | `https://mini.hbut.site/api/forum` |
| `temp_file_server.schedule_upload_endpoint` | `https://mini.hbut.site/api/temp/upload` |
| `ocr.endpoints` | `["https://mini.hbut.site/api/ocr/recognize"]` |
| `ocr.local_fallback_endpoints` | `["https://mini-hbut-ocr-service.hf.space/api/ocr/recognize"]` |
| 游戏 Legacy（SDK / 游戏包兜底） | `https://mini.hbut.site/api/game-rank` |

---

## 11. 验收清单（实现与测试必须覆盖）

- [ ] 组解析：顺序、去重、`enabled:false`、非法项丢弃、组内 `paths` 覆盖。
- [ ] 优先级：通道级覆盖 > 组 > 本地 > 默认；`useRemoteConfig=false` 时跳过远程。
- [ ] 故障转移：5xx/超时/网络错误触发；4xx 不触发；冷却期内不重试；成功后清冷却并在组变化时广播事件。
- [ ] 冷却持久化：跨重启有效；超 24h 陈旧记录清理；空读取不得带回历史失败记录（防共享引用回归）。
- [ ] 幂等：非幂等请求不跨组自动重试。
- [ ] 凭据绑定：组切换后 challenge / ticket 重新获取，不跨组复用。
- [ ] **I1**：游戏签票组与 `rank_api` 组同源（含切换场景的断言）。
- [ ] **I2**：默认位与线上配置只出现白名单两域。
- [ ] **I3**：远程拉取失败不清空本地；成功才覆盖。
- [ ] 远程配置 round-trip：配置工具导出的 JSON 能被归一化函数无损解析。
- [ ] 旧客户端兼容：仅旧字段的配置仍可工作（主域名切换生效）。

---

## 12. 变更流程

1. 本契约的任何修改需同步：`backend_endpoints.ts` 实现 + 单测 + 本文件版本号；
2. 线上配置变更（加组/换序）属于**运维操作**，不改客户端版本；
3. 违反 §7 不变量的改动一律拒绝合入。
