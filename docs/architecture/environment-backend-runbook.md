# 环境后端运行手册（dev / beta / release 统一）

> 起因：#999 —— 测试后端 `mini-hbut/testocr1` 被 Hugging Face 置为 `PAUSED`，
> 导致**所有非 release 构建**后端全线不可用，且失败是静默的。
> **2026-10-06 决策**：取消「按构建档位选后端」，所有档位统一走生产主域 + 唯一兜底域。

## 1. 当前策略（唯一权威）

**所有构建档位**（release / dev-fast / android-size / 本地 `npx tauri dev`）统一使用：

| 角色 | 域名 |
|---|---|
| 主域（primary） | `https://mini.hbut.site` |
| 唯一兜底域（fallback） | `https://mini-hbut-ocr-service.hf.space` |

唯一权威是 `apps/client/src/utils/statistics_environment.ts`（前端）与
`apps/client/src-tauri/src/http_client/mod.rs`（Rust OCR）。
**其它模块不得各自读 `VITE_BUILD_PROFILE` / `MINI_HBUT_BUILD_PROFILE` 来决定后端** ——
历史上正是「环境权威 + 云同步 + 游戏候选 + Rust OCR」四处各写一遍，
本次统一切换时一次性收敛，并有契约测试守住（`statistics_environment.spec.ts`）。

⚠️ **取舍（必须知晓）**：dev / beta 的写入会落到**生产库** —— 原本由环境隔离阻断。
需要隔离数据时，请在设置里把「自定义后端」指向自建实例，不要依赖构建档位。

## 2. 已下线的测试域

`mini-hbut-testocr1.hf.space`（HF runtime：`stage=PAUSED`、`errorMessage="Flagged as abusive"`）
**不再被任何档位使用**，并被列入「拒绝清单」：存量落盘配置若仍指向它会被清理。
理由：它的失败形态是「返回 HTML 而非 JSON」这类**静默**错误（云同步只报「无效响应」）。

因此该 Space **可以不再恢复**。若仍想保留它做隔离环境，请另行设计（不要让客户端默认指向它）。

## 3. 怎么判断"后端是不是挂了"

```bash
# 主域（本机若因 TUN 代理路由不到，用 §5 的外部视角）
curl -s "https://mini.hbut.site/health" | head -c 200
curl -s -w " [%{http_code}]\n" "https://mini.hbut.site/api/cloud-sync/ping"
curl -s -w " [%{http_code}]\n" "https://mini.hbut.site/api/game-rank/ping"

# 唯一兜底域
curl -s "https://mini-hbut-ocr-service.hf.space/health" | head -c 200
```

App 内两条可观测线索：

1. **一键启动诊断报告**（设置页）包含 `构建档位` / `后端环境` / `后端主域` 三行 ——
   可一眼看出这个包在打哪个后端（`apps/client/src/utils/boot_diagnostics.ts`）。
2. **云同步状态**：`localStorage['hbu_cloud_sync_status:<学号>']` 的 `lastUploadError`。
   若为「云同步服务返回了无效响应」，说明端点返回了 HTML 而非 JSON（即后端没在服务）。

> 坑：`[Config] cloud_sync proxy_endpoint: …` 这条日志（`src-tauri/src/transport/tauri/config.rs`）
> 只是**远程配置展示**，不是生效端点 —— 别据此判断实际打了哪个后端。

## 4. 通道级现状与已知缺口

- 云同步 / 游戏经典榜 / 论坛：主域与兜底域都在服务，且**已启用组模型与故障转移**
  （主域失败 → 自动切兜底域；4xx 不切）。
- **游戏平台（`/api/game-platform/v1/*`）：主域尚未部署**（403/404），
  目前靠远程配置把 `api_base` 钉在兜底域上。详见
  [生产后端接口缺口清单](./production-backend-gaps.md)。

## 5. 本机网络注意（排查时必读）

本机 DNS 是 TUN 代理的**伪 IP**（多个域名解析成连号的 `198.20.0.x`），
因此**本机 curl 不通 ≠ 全局不通**。判断主域是否真的挂了要用外部视角：

```bash
curl -s "https://r.jina.ai/https://mini.hbut.site/health"
```

## 6. 防复发

- 本次故障难发现，是因为**失败是静默的**（只在 localStorage 留一行）。启动诊断报告已补上后端域信息。
- 建议对主域与兜底域各加一个**外部存活探测**（定时 curl `/health`），异常时告警。
- 不要为了让 dev「能用」而恢复档位分流：那会让 dev/beta 依赖一个可能随时被停的测试 Space。

## 关联

- Issue：#999（本手册起因）、#998（排行榜真实错误透出）
- 缺口清单：[生产后端接口缺口清单](./production-backend-gaps.md)
- 契约：[后端端点与故障转移契约](./backend-endpoints-contract.md)
