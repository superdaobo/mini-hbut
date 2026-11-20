# 容量基线与灰度上线（Epic #1243 · G8-01/G8-02 / mini-hbut#1270、#1271）

> 状态：**基线已测（进程内）+ 灰度方案已定**；**真实 NAS/学校接口压测 = BLOCKED**。

## 1. 集成门禁（#1271）

一条命令回答「这次整体能不能上线」：

```bash
cd OCR-services
python scripts/ci/epic1243_gates.py            # 全量（约 4–6 分钟）
python scripts/ci/epic1243_gates.py --quick    # 只跑 Epic 新增用例
python scripts/ci/epic1243_gates.py --only ocr,docs
```

| 门禁 | 内容 | 失败即阻断 |
|---|---|---|
| G1 OCR 语法 | `compileall` | ✅ |
| G2 OCR 测试 | `pytest -q`（`--quick` 只跑 9 个 Epic 测试文件） | ✅ |
| G3 客户端类型 | `npm run typecheck` | ✅ |
| G4 客户端构建 | `npm run build` | ✅ |
| G5 客户端测试 | `npm run test:ci`（`--quick` 跳过） | ✅ |
| G6 契约文档 | 3 份文档存在且 ≥500 字节 | ✅ |
| G7 迁移成对 | 每个 `*.sql` 必须有 `*.rollback.sql` | ✅ |
| G8 敏感内容 | SecretGuard（脚本不存在则跳过） | ✅ |

**跨仓库语义**：在 OCR / student-auth 仓库里跑时，客户端与文档门禁**跳过并显示「非 mini-hbut 仓库，跳过」**（不隐藏、不伪装成通过）。

实测（本机）：

```
G1 OCR 语法    PASS  0.1s
G2 OCR 测试    PASS  4.0s
G3 客户端类型  PASS  (非 mini-hbut 仓库，跳过)
...
OK: 全部 8 个门禁通过
```

## 2. 容量基线（#1270）

```bash
python scripts/bench/epic1243_capacity.py --requests 400 --concurrency 8 --json out.json
```

**实测（本机 Windows 10 / Python 3.13.7 / 进程内 TestClient / 已授权 + 40 条课表快照）**：

| 并发 | 请求数 | 吞吐 | p50 | p95 | p99 | max | 异常 |
|---|---|---|---|---|---|---|---|
| 1 | 200 | 332.7 req/s | 2.84 ms | 3.61 ms | 4.04 ms | 18.08 ms | 0 |
| 8 | 400 | **418.4 req/s** | 18.77 ms | 24.35 ms | 29.74 ms | 35.18 ms | 0 |
| 32 | 400 | 372.7 req/s | 81.80 ms | 107.16 ms | 123.99 ms | 132.12 ms | 0 |

### 这张表能说明什么、不能说明什么

**能说明**：
- 鉴权链 + 同意判定 + 字段投影的**单请求开销在毫秒级**（conc=1 时 p50 2.84 ms）；
- 在 400 请求、0 异常下**没有泄漏/崩溃**；
- 吞吐在 conc=8 附近达峰，之后下降 —— 这是 **TestClient 的线程模型 + GIL** 造成的，**不是服务端真实容量曲线**。

**不能说明**（必须标 BLOCKED）：
- 真实 uvicorn+uvloop 的吞吐（会显著高于上表）；
- 真实 PostgreSQL 查询开销（本基准快照在内存里，**没有 SQL**）；
- 学校接口的真实延迟（本基准不触达学校）；
- 多副本 + 共享票据存储下的表现。

> **结论**：上表只用于「回归对比」（改动前后跑同一基准，看是否劣化），**不能作为生产容量承诺**。

## 3. 灰度方案（#1271）

### 阶段（每阶段观察 ≥24h，异常即回退）

| 阶段 | 范围 | 开关 | 通过条件 |
|---|---|---|---|
| S0 内部 | 开发/测试账号 | 全部能力**关**（默认） | 现有功能零回归（测试全绿） |
| S1 影子 | 1 个已审核应用 + 5 名志愿者 | `MINI_HBUT_APP_DATA_API_ENABLED=true` | 无 5xx；`snapshot_missing` 比例符合预期；撤销能立即生效 |
| S2 小流量 | 全部已审核应用 + 10% 学生 | + `MINI_HBUT_APP_DATA_CONSENT_ENFORCED=true` | 同意授予/撤销成功率 >99%；无跨用户告警 |
| S3 全量 | 全部 | + `MINI_HBUT_APP_LAUNCH_ENABLED=true` | 票据兑换成功率 >99.5%；无 `app_mismatch` 误报 |
| S4 清理 | 全量 | 移除 `?gpt=` 旧路径 | 无旧路径调用 |

**每个开关都是默认关**，这是回滚的基础（见 §4）。

### 上线前必须满足

1. `python scripts/ci/epic1243_gates.py` 全绿（含 G7 迁移成对）。
2. 迁移按 `0005 → 0006 → 0007` 顺序执行，每个迁移的 `.rollback.sql` 已演练。
3. 真实 PG 上跑过一遍同意/快照往返（**BLOCKED：本机无 PG**）。
4. 真实 Casdoor 令牌走通 `/api/app-data/v1/*`（**BLOCKED：无凭据**）。
5. 法律/隐私文案过审（**BLOCKED：需法务**）。

## 4. 回滚方案

| 层 | 手段 | 影响 |
|---|---|---|
| 功能 | 关掉对应 env 开关（全部默认关） | 端点不注册 → 404，客户端回退到现状 |
| 代码 | `git revert` 对应 PR | 无数据影响 |
| 数据 | 执行对应 `.rollback.sql` | 删表/删索引；**同意记录与快照会丢失** → 仅在无流量时执行 |
| 客户端 | 回滚版本发布 | 旧版本不调用新端点，无兼容问题（新端点默认关） |

**不可回滚的部分**：学生已授予的同意记录一旦被删除无法恢复；第三方已拿走的副本无法回收（见 `privacy-1243.md` §6）。

## 5. 未完成 / BLOCKED（如实）

| 项 | 状态 |
|---|---|
| 真实 NAS/学校接口压测 | **BLOCKED**（无权限） |
| 真实 PostgreSQL 容量与并发 | **BLOCKED**（本机无 PG） |
| 多副本共享票据存储 | 未实现（内存实现，接口可替换） |
| 灰度 S1–S4 的实际执行 | 未执行（需生产环境） |
| 限流接线的压测 | 未做（分层限流仍未接到 app-data 端点） |
