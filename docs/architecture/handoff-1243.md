# Epic #1243 交接手册（G8-02 / mini-hbut#1272）

> 面向：接手的开发者/维护者。读这一份就能知道**有什么、怎么验、怎么合、哪里还是空的**。
> 契约：[`contracts/epic-1243-contracts.md`](./contracts/epic-1243-contracts.md)（权威）
> 配套：[隐私方案](./privacy-1243.md) · [红队矩阵](./redteam-1243.md) · [容量与灰度](./capacity-and-rollout-1243.md) · [第三方接入示例](./third-party-api-example-1243.md)

---

## 1. 现在有什么（25 个 PR，全部 OPEN，未合并 main）

### mini-hbut（13 个）

| PR | 分支 | 内容 |
|---|---|---|
| [#1273](https://github.com/superdaobo/mini-hbut/pull/1273) | `g0-01-contracts` | 契约冻结 + 三仓基线 |
| [#1274](https://github.com/superdaobo/mini-hbut/pull/1274) | `g1-04-sso-bootstrap` | 无感 SSO 引导 + Casdoor 联调矩阵 |
| [#1275](https://github.com/superdaobo/mini-hbut/pull/1275) | `g1-05-account-epoch` | 账号代际（切号隔离） |
| [#1276](https://github.com/superdaobo/mini-hbut/pull/1276) | `g2-02-host-isolation` | 远端 iframe 沙箱判定 |
| [#1277](https://github.com/superdaobo/mini-hbut/pull/1277) | `g2-03-launch-ticket` | 宿主桥严格模式（nonce + 能力白名单） |
| [#1278](https://github.com/superdaobo/mini-hbut/pull/1278) | `g2-04-app-catalog-client` | 应用目录客户端数据层 |
| [#1279](https://github.com/superdaobo/mini-hbut/pull/1279) | `g3-03-consent-ui` | 逐类同意逻辑层 + 授权 API 客户端 |
| [#1280](https://github.com/superdaobo/mini-hbut/pull/1280) | `g4-02-sync-queue` | 持久待同步队列 + 调度决策层 |
| [#1281](https://github.com/superdaobo/mini-hbut/pull/1281) | `g4-06-background-policy` | 三端后台能力矩阵 |
| [#1282](https://github.com/superdaobo/mini-hbut/pull/1282) | `g5-03-third-party-example` | 第三方接入示例 |
| [#1283](https://github.com/superdaobo/mini-hbut/pull/1283) | `g3-05-privacy-review` | 隐私方案 + 红队矩阵 |
| [#1284](https://github.com/superdaobo/mini-hbut/pull/1284) | `g8-02-capacity-rollout` | 容量基线 + 灰度/回滚 |

### OCR-services（12 个）

| PR | 分支 | 内容 |
|---|---|---|
| [#50](https://github.com/superdaobo/OCR-services/pull/50) | `g3-01-app-consents` | 用户级逐域同意存储 |
| [#53](https://github.com/superdaobo/OCR-services/pull/53) | `g2-01-app-manifest` | 清单三字段校验 |
| [#54](https://github.com/superdaobo/OCR-services/pull/54) | `g2-04-app-catalog` | 公开应用目录 API |
| [#55](https://github.com/superdaobo/OCR-services/pull/55) | `g3-02-app-consents-api` | 逐类授权管理 API |
| [#56](https://github.com/superdaobo/OCR-services/pull/56) | `g4-05-domain-merge` | 对象级合并与墓碑 |
| [#57](https://github.com/superdaobo/OCR-services/pull/57) | `g5-01-app-data-api` | 第三方分类只读 API |
| [#58](https://github.com/superdaobo/OCR-services/pull/58) | `g2-03-launch-code` | 一次性启动票据 |
| [#59](https://github.com/superdaobo/OCR-services/pull/59) | `g7-01-redteam` | 跨模块红队 23 例 |
| [#60](https://github.com/superdaobo/OCR-services/pull/60) | `g7-02-registry-refactor` | 可选端点注册收敛 |
| [#61](https://github.com/superdaobo/OCR-services/pull/61) | `g8-01-capacity-and-gates` | 容量基准 + 集成门禁 |
| [#51](https://github.com/superdaobo/OCR-services/pull/51) | `g4-01-domain-snapshots` | 分域云快照 + 限流策略 |
| [#52](https://github.com/superdaobo/OCR-services/pull/52) | `g1-02-multi-device` | 同号多设备 school_verified |

### mini-hbut-student-auth（1 个）

| PR | 分支 | 内容 |
|---|---|---|
| [#23](https://github.com/superdaobo/mini-hbut-student-auth/pull/23) | `g1-01-verified-subject` | 可信学号主体（fail-closed） |

---

## 2. 合并顺序（**必须按此顺序**）

### OCR-services

```
#50 → #53 → #54 → #55 → #56 → #57 → #58 → #59 → #60 → #61     （stacked 链，逐级）
#51                                                          （独立，合并时 entrypoint 冲突一次 → 删其尾部块）
#52                                                          （独立，无冲突）
```

**#51 的冲突处理（唯一一次）**：`runtime/entrypoint.py` 冲突 → **删除 #51 追加的那段
`[CloudDomains]` 注册块**（能力已由 `runtime/register_optional_routes.py` 接管）。
已实测：删块后 `cloud_sync_domains: True` 且 2 条 v2 路由正常注册。

### mini-hbut

```
#1273（docs）→ #1274 → #1275 → #1280（依赖 #1275）→ #1276 → #1277 → #1278 → #1279 → #1281 → #1282 → #1283 → #1284
```

### student-auth

```
#23（独立）
```

---

## 3. 环境开关（**全部默认关闭**，这是回滚基础）

| 变量 | 默认 | 作用 |
|---|---|---|
| `MINI_HBUT_APP_DATA_CONSENT_ENFORCED` | `false` | 启用同意存储 + `/identity/app-consents*` 端点 |
| `MINI_HBUT_APP_DATA_API_ENABLED` | `false` | 启用 `/api/app-data/v1/*` |
| `MINI_HBUT_APP_LAUNCH_ENABLED` | `false` | 启用 `/api/app-launch/v1/*` |
| `MINI_HBUT_CLOUD_DOMAINS_ENABLED` | `false` | 启用 `/api/cloud-sync/v2/domains` |
| `MINI_HBUT_APP_CATALOG_ENABLED` | `true` | 应用目录端点（无数据时返回空目录） |
| `MINI_HBUT_APP_CATALOG` | 空 | 目录 JSON（由 `gen_data_whitelist.py --catalog-out` 产出） |
| `VITE_ENFORCE_REMOTE_MODULE_SANDBOX` | 关 | 客户端远端模块强制沙箱 |

---

## 4. 迁移顺序（OCR-services）

```
0005_app_data_consents.sql        → 同意记录表
0006_student_cloud_domains.sql    → 分域快照表
0007_multi_device_school_verified.sql → 多设备条件唯一索引
```

每个都有对应 `.rollback.sql`（门禁 G7 会检查成对）。

---

## 5. 怎么验证（三条命令）

```bash
# 1) 三仓整体门禁（8 道）
cd OCR-services && python scripts/ci/epic1243_gates.py

# 2) 容量基准（回归对比用，不是生产容量）
cd OCR-services && python scripts/bench/epic1243_capacity.py --requests 400 --concurrency 8

# 3) 红队矩阵
cd OCR-services && python -m pytest -q tests/test_redteam_1243.py
```

**基线数字**（本机实测，合并全部 PR 后）：

| 仓库 | 用例数 | 说明 |
|---|---|---|
| OCR-services | **2913 passed / 30 skipped** | 含 12 个 PR |
| mini-hbut client | **4342 passed** | 含 12 个 PR；1 个既有环境失败 `ios_deep_link_scheme_patch.spec.ts` |
| student-auth | **718 passed** | 含 #23 |

---

## 6. 还没做 / 被阻塞的（**必须原样传递**）

### BLOCKED（本机无法验证，需外部条件）

| 项 | 需要什么 |
|---|---|
| 学校可信身份根（R-01 P0） | 校方接口文档 + 真实凭据；当前 `FailClosedVerifier` 是**生产行为** |
| Casdoor 真实联调（九项矩阵第 9 项「无 UI 授权」） | 真实租户；**不得用「密码代填」绕过** |
| 真实 PostgreSQL | 条件索引、迁移执行、并发 CAS、同意/快照往返 |
| Android/iOS 真机 | 宿主隔离负例、11 游戏回归、切号端到端、后台行为、授权页 |
| 真实 NAS/学校接口压测 | 权限 |
| 法律/商店审查 | 法务 |

### 未接线（代码在，但没接上调用点）

| 项 | 状态 |
|---|---|
| 同步队列 / 调度 / 后台策略 | 三个逻辑层都已交付，**无调用点**（`subscribeAccountEpoch` 订阅者仍为空） |
| 应用中心全屏页 UI | 未做（依赖 launch code + 运行时验证） |
| 授权管理页 UI | 未做（逻辑层 + API 客户端已交付） |
| 分层限流接到 app-data | 未接（`rate_limit=None`） |
| CORS 精确白名单 | 未接（未动全局 `allow_origins`） |
| `?gpt=` 旧路径切换 | 客户端未切到 `/api/app-launch/v1/code` |
| 导出/删除端点 | 未做 |
| 旧「关闭同步」迁移告知页 | 未做 |
| 使用统计独立开关 | 未做 |
| 多副本共享票据存储 | 当前进程内 `InMemoryLaunchCodeStore` |
| 对象级合并接进 `put` | 模块已交付，未接进 `cloud_domains_storage.put` |

---

## 7. 结构性债务与已修

| 项 | 状态 |
|---|---|
| `entrypoint.py` 追加式注册导致合并必冲突（复现 3 次） | **已修**（PR #60，收敛到 `register_optional_routes.py`） |
| 红队矩阵引用测试名可能造假 | 已核对（14 个引用逐个 grep 命中） |
| 门禁脚本 GBK 控制台崩溃 | 已修（改 ASCII 标记） |

---

## 8. 一句话总结

**契约、授权、隔离、合并、票据、只读 API 都有代码 + 自动化测试；真实环境验证、UI 页面、接线与法务审查尚未完成 —— 这些都在 §6 里列全了，没有一项被说成「已完成」。**
