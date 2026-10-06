# 环境后端运行手册（dev / beta / release）

> 起因：#999 —— 测试后端 `mini-hbut/testocr1` 被 Hugging Face 置为 `PAUSED`，
> 导致**所有非 release 构建**（dev / beta / 本地）后端全线不可用，且失败是静默的。
> 本手册给出「怎么判断、怎么恢复、怎么防复发」。

## 1. 构建档位决定后端（唯一权威）

`apps/client/src/utils/statistics_environment.ts` 是后端环境的唯一权威：

| 构建档位（`MINI_HBUT_BUILD_PROFILE`） | 环境 | 后端主域 |
|---|---|---|
| `release` | production | `https://mini.hbut.site`（主）+ `https://mini-hbut-ocr-service.hf.space`（唯一兜底） |
| `dev-fast`（dev-build.yml）、`android-size`、以及**任何其它值/缺省** | test | `https://mini-hbut-testocr1.hf.space` |

档位来源：`.github/workflows/dev-build.yml:15`（`dev-fast`）、`release.yml:20` /
`ios-testflight.yml:40`（`release`）；本地 `npx tauri dev` 不设该变量 → `standard` → **test**。

## 2. 环境隔离会把兜底域一并拒掉（设计如此，不要绕过）

`apps/client/src/utils/game_center/base.ts` 的 `toGameCandidate` 会调用
`isStatisticsServiceUrlCompatible`，**测试构建拒绝生产域**：

- 远程配置 `backend.groups`（`mini.hbut.site` + `mini-hbut-ocr-service.hf.space`）在
  test 构建里会被全部丢弃；
- `apps/client/src/utils/cloud_sync_config.ts` 的 `resolveCloudSyncEndpoints` 对非 release
  直接返回环境隔离端点，**忽略**远程 `cloud_sync` 配置与 `fallback_endpoints`。

结论：**测试域一挂，dev / beta 构建没有任何可用后端**，且兜底机制救不了。
这是刻意的安全取舍（dev 不得写生产库），因此不能通过「放开跨环境」来绕过。

## 3. 怎么判断当前是不是这个故障

```bash
# ① 测试 Space 的运行状态（PAUSED / RUNNING）
curl -s "https://huggingface.co/api/spaces/mini-hbut/testocr1/runtime"
# 期望：{"stage":"RUNNING",...}；若为 PAUSED 即命中本故障

# ② 测试域是否真的在服务（PAUSED 时返回 HuggingFace 占位 HTML，而不是 JSON）
curl -s "https://mini-hbut-testocr1.hf.space/health" | head -c 120

# ③ 兜底/生产域是否正常
curl -s "https://mini-hbut-ocr-service.hf.space/health" | head -c 120
```

App 内两条可观测线索：

1. **一键启动诊断报告**（设置页）：现在包含 `后端环境` 与 `后端主域` 两行
   （`apps/client/src/utils/boot_diagnostics.ts`），可一眼看出这个包在打哪个后端。
2. **云同步状态**：`localStorage['hbu_cloud_sync_status:<学号>']` 的
   `lastUploadError` 若为「云同步服务返回了无效响应」，就是「端点返回 HTML 而非 JSON」
   的典型形态 —— 即测试域没在服务。

## 4. 恢复步骤

1. **重启 / 恢复测试 Space**（需要 HF 写权限，本机桌面密钥文件里的 `HF_TOKEN`）：
   - 优先在 HF 网页控制台点 Restart；
   - 若被 `errorMessage: "Flagged as abusive"` 拦住，说明是 HF 侧策略处置，
     需要申诉或**换一个新的测试 Space**，而不是反复重启。
2. **换新 Space 时同步改这三处**（漏一处就会出现「一半走新域、一半走旧域」）：
   - `apps/client/src/utils/statistics_environment.ts` 的 test 分支常量；
   - 任何写死测试域的部署脚本 / 文档；
   - 配置仓（gitcode）里对应的测试域引用（如有）。
3. **验证**：按第 3 节三条 curl 全绿；再跑一个 dev 包确认
   `hbu_cloud_sync_status` 的 `lastUploadOk=true`。

## 5. 防复发

- 本故障之所以难发现，是因为**失败是静默的**：上传失败只在 localStorage 里留一行，
  界面无提示。新增「环境后端不可用」的用户可见信号前，请至少保证启动诊断报告可用（已做）。
- 建议在测试 Space 上加一个**外部存活探测**（定时 curl `/health`），
  PAUSED 时告警，避免长期停摆无人知。
- 不要为了让 dev 能用而放开跨环境校验：那会让测试数据写进生产库（见第 2 节）。

## 关联

- Issue：#999（本手册起因）、#998（游戏内排行榜把真实错误吞掉，放大了本故障的不可诊断性）
- 契约：[后端端点与故障转移契约](./backend-endpoints-contract.md)
