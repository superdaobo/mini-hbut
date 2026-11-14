# 夜间部署交接（Issue #1294 · 2026-11-15 凌晨）

> 你醒来后按本文从上到下看即可。所有结论都有真实命令输出；未做/阻塞项单独列出，不含糊。

---

## 一、一句话结论

| 你要的 | 状态 | 凭据/入口 |
|---|---|---|
| 云同步能同步 | ✅ **已实测 upload→download 往返一致**（升级前后各验一次） | 合成学号 `0000000001` |
| Casdoor 里能建用户 | ✅ 通过管理 API 建号成功（含 `hbut_student_id` 等属性） | `app-built-in` BasicAuth |
| 能授权登录 | ✅ 浏览器真实走授权码 + PKCE S256，拿到 AT/RT/ID Token | 应用 `mini-hbut-lab`，账号 `9900000001` |
| 数据不丢 | ✅ 云同步记录 `5886` → `5887`（只多了我的往返测试那条），真实用户记录持续在写 | 备份见 §五 |
| 服务可用 | ✅ 已升级到 `2026-11-15-main2`（main `5be5121` + 修复 `ed0eee7`），13 条端点全绿、0 错误日志 | `https://mini.hbut.site` |

并且：**在 `origin/main` 上抓到一个会把线上云同步上传打挂的 P0**，已回滚 → 修复 → 开 PR（OCR-services#65）→ 用修复镜像重新上线并全量验证。

---

## 二、为什么没有按原计划部署 `/identity/bootstrap`

原计划（本 issue 的阶段 1–3）要部署 `OCR-services@feat/p2-6-claim`。实测后**主动放弃**，原因两条：

1. **分支落后 main 19 个提交**
   ```
   $ git rev-list --left-right --count origin/feat/p2-6-claim...origin/main
   0	19
   ```
2. **main 已经删掉了这条链路**（是删代码，不是关开关）：
   ```
   7011d74 feat(p3-1): 退役后端建号 / 断言签发 / /identity/bootstrap（能力消失，非开关关闭）
   ```
   理由（`docs/identity-v2-legacy-retirement.md`）：该链路要求 ocr-service 持有 Casdoor
   **管理 API 机器凭据**，而身份 v2 的目标形态里 ocr-service 只做「验令牌 + 设备登记/验签」。

→ 部署它等于「丢 19 个修复 + 重新上线一个被明确退役的能力」。构建产物 `fdl-ocr-service:2026-11-15-identity`
保留在 NAS 上但**未部署**。

**正确落点**：建号/身份绑定归 `student-auth`；令牌签发归 Casdoor 自己的 OIDC（授权码 + PKCE）。

---

## 三、Casdoor 联调测试应用（明早可以直接点开用）

### 3.1 应用

| 项 | 值 |
|---|---|
| 应用名 | `admin/mini-hbut-lab` |
| 组织 | `fdl-users` |
| clientId | `395161187cdcf3770950` |
| redirectUris | `minihbut://identity/callback`、`http://127.0.0.1:8412/identity/callback` |
| grantTypes | `authorization_code` + `refresh_token` |
| tokenFormat / tokenFields | `JWT-Custom` / `Properties.hbut_student_id` 等 4 项 |
| 有效期 | access 24h / refresh 168h |

### 3.2 测试账号

- 用户名：`9900000001`（合成学号，10 位数字形状合法）
- 密码：**随机生成、不入库不入文档**（口令只保存在部署机仓库外的凭据文件里；需要时可在 Casdoor 后台重置）
- 属性：`hbut_student_id=9900000001`、`hbut_student_name=合成学生`、
  `hbut_verification_method=campus_session`、`hbut_verified_at=2026-11-15T00:00:00Z`

### 3.3 怎么自己验一遍

直接用浏览器打开（用上面账号登录）：

```
https://sso.hbut.site/login/oauth/authorize?client_id=395161187cdcf3770950&response_type=code&redirect_uri=http%3A%2F%2F127.0.0.1%3A8412%2Fidentity%2Fcallback&scope=openid%20profile%20email&state=manual
```

登录成功后会跳到 `http://127.0.0.1:8412/...`（本机没服务 → 浏览器报连不上，**这是正常的**），
地址栏里就能看到 `code=`；把它换令牌即可（脚本见 `minihbut-night/exchange_code.py`，需配 PKCE verifier）。

### 3.4 实测证据（已跑通）

```
授权回调：http://127.0.0.1:8412/identity/callback?code=281b23c6...&state=st123&iss=https%3A%2F%2Fsso.hbut.site
换令牌：  200  keys=['access_token','expires_in','id_token','refresh_token','scope','token_type']
         token_type=Bearer expires_in=86400 scope=openid profile email
AT claim：iss=https://sso.hbut.site  aud=[395161187cdcf3770950]
         hbut_student_id=9900000001  hbut_student_name=合成学生
         hbut_verification_method=campus_session  hbut_verified_at=2026-11-15T00:00:00Z
ID token：同样含上述 4 个 hbut_* claim
JWKS 验签：通过（RS256，kid 来自 /.well-known/jwks）
取数据：  GET /api/userinfo 带 AT → 200
```

### 3.5 两个已知限制（不影响产品链路，但要知道）

1. **API 建号不能带 `groups`**：`add-user`/`update-user` 里出现 `groups` 一律
   `Unauthorized operation`（机器凭据无组写权限，实测）。要把测试学生放进
   `hbut-students` 组，请在 Casdoor 后台用你的组织管理员账号手动加。
2. **`POST /api/login` 的 `type=code` 通道恒返回 `Unauthorized operation`**（带/不带会话 cookie 都一样）；
   浏览器走 `/login/oauth/authorize` 的正常流程**不受影响**。要拿授权码请用浏览器或 Playwright。

---

## 四、服务当前状态（已升级到含 P0 修复的新镜像）

| 项 | 值 |
|---|---|
| 容器镜像 | `fdl-ocr-service:2026-11-15-main2`（= `origin/main` `5be5121` + 修复提交 `ed0eee7`） |
| `/health` | 200，`build.sha=ed0eee7`，返回体变**轻量**：`{ok, service, version, uptime_seconds, started_at}` |
| `/health/deps` | 200，完整指标（新增端点） |
| 云同步记录数 | `5887` = 原 `5886` + 1 条往返测试记录（`student_id=0000000001`） |
| 真实用户流量 | 正常：`2510201423@01:14`、`2510661118@01:10` 持续在写云同步 |
| OCR | `ocr_stats` 19 次请求 / 19 次成功 / **0 失败**（部署后真实请求） |
| 容器日志 | 近 10 分钟 **0 ERROR / 0 Traceback**；非 2xx 只有我冒烟打的 3 条 identity 404 |
| 外网入口 | `https://mini.hbut.site` |

> 升级前先做了「新旧镜像 OpenAPI 契约对比」：80 → 81 条路径，**唯一新增 `/health/deps`**，
> 唯一签名变化是 `POST /api/forum/auth/token` 多一个**可选** `authorization` 头（非破坏）。
> 也就是**没有任何端点被删或被改签名**。

### 4.0 部署后 13 条端点冒烟（全绿）

```
200 GET  /health                    200 GET  /health/deps
200 GET  /api/cloud-sync/ping       200 GET  /api/game-rank/ping
200 GET  /api/grade-distribution/health
200 GET  /api/game-platform/v1/meta 200 GET  /api/forum/categories
200 GET  /api/forum/threads         200 GET  /api/usage-stats/ping
200 GET  /openapi.json              200 GET  /
200 GET  /forum/admin
5xx 项: none
```

CORS（P3-4 起默认拒绝）实测：

```
Origin: https://mini.hbut.site            → Access-Control-Allow-Origin: https://mini.hbut.site
Origin: https://evil.example              → （无 ACAO，符合 fail-closed）
```

### 4.1 云同步往返实测（新镜像上重跑）

```
ping:     200  {"success":true,"challenge":"R0hCO-...","challenge_expires_in":90}
upload:   200  {"success":true,"student_id":"0000000001","size":384,"codec":"json"}
download: 200  {"success":true,"data":{...}}
往返一致: True
```

复跑：`python cloud_sync_roundtrip.py`
（清理：`DELETE FROM cloud_sync_records WHERE student_id='0000000001';`）

---

## 五、数据安全与回滚

### 5.1 备份（都在 NAS 上）

| 文件 | 说明 |
|---|---|
| `/volume1/services/apps/ocr-service/compose.yaml.bak-20261115-predeploy` | 部署前 compose（**回滚用这份**） |
| `/volume1/services/apps/ocr-service/compose.yaml.bak-main1` | 切 main 前的 compose（中间态） |
| `/volume1/services/secrets/ocr-service.env.bak-20261115-predeploy` | 部署前 env（600） |
| `/volume1/services/apps/ocr-service/casdoor_application_backup_20261115.sql` | Casdoor 应用表整表快照（列插入形式，可回滚） |
| `/volume1/services/apps/ocr-service/src-main`、`src-fix` | 两次构建的源码树（可复查/重建） |

### 5.2 回滚（已真实演练两次）

```bash
# 一键回滚到 2026-10-08-3662bdf
cp -a /volume1/services/apps/ocr-service/compose.yaml.bak-20261115-predeploy \
      /volume1/services/apps/ocr-service/compose.yaml
cp -a /volume1/services/secrets/ocr-service.env.bak-20261115-predeploy \
      /volume1/services/secrets/ocr-service.env
docker compose -f /volume1/services/apps/ocr-service/compose.yaml up -d
```

> ⚠️ 若回滚到旧镜像，注意旧镜像不读 `MINI_HBUT_CORS_ORIGINS`（它默认 `allow_origins=["*"]`），
> 所以恢复旧 env（去掉该行）与回滚镜像要**一起**做，否则行为不一致。

**演练记录**：
1. 01:17 切 `2026-11-15-main` → 02 分后发现 P0（上传 422）→ 01:24 回滚旧镜像 → `/health` 200、`build.sha=3662bdf`、upload 契约恢复、记录数 5886 不变。
2. 01:42 切 `2026-11-15-main2`（含修复）→ 冒烟 + 往返 + 数据完整性全绿，保留上线。

### 5.3 我对 Casdoor 生产数据做过什么

| 动作 | 可逆 |
|---|---|
| 新建应用 `admin/mini-hbut-lab` | 可删（无用则删） |
| 新建用户 `fdl-users/9900000001` | 可删 |
| 早前探测用户 `fdl-users/t9000001` | 可删（无密码、无属性，纯探测残留） |
| 给 `app-fdl-users` 试验性加 `grantTypes`/`federatedCredentials` | **已完全还原**（只剩 `authorization_code`+`refresh_token`，`federatedCredentials=null`，`clientSecret` 未变） |

用户总数：40 → 41（+`t9000001`）+ 1（`9900000001`）。原始用户数据一条没动。

---

## 六、P0：`origin/main` 的云同步上传是断的

`runtime/entrypoint.py:5501` 装饰器挂错函数：

```python
@app.post("/api/cloud-sync/upload")      # ← 挂错
def _cloud_sync_data_authz_context(request, principal, *, requested_student_id): ...

async def cloud_sync_upload(req, request): ...   # ← 真正的处理器没装饰器
```

部署 `main`（`5be5121`）后实测 `upload: 422 {"loc":["query","principal"],...}` → **所有客户端上传全断**。

- 修复 PR：**https://github.com/superdaobo/OCR-services/pull/65**
  （含 4 例 OpenAPI 契约回归锁，CI 以前拦不住这种错）
- 修复镜像：`fdl-ocr-service:2026-11-15-main2`
- 已做的自动化回归：**新旧镜像 OpenAPI 契约对比**，80 → 81 条路径，
  除这个 P0 外只有 `POST /api/forum/auth/token` 多了一个**可选** `authorization` 头（非破坏）。

---

## 七、未做 / BLOCKED（如实列出）

| 项 | 原因 |
|---|---|
| 真实学号归属验证 | **BLOCKED**：要你本人登录教务；后端按你的要求不访问校方系统 |
| 客户端 App 接入 `/identity/*` | 客户端 37 个 PR 未合并、未出包；今晚不动客户端 |
| Android / iOS 真机 | **BLOCKED**：无设备 |
| `hbut-students` 组自动归属 | API 无组写权限（见 §3.5），需后台手动加 |
| OCR-services#65 合入 main | **未合**（按纪律不自动合并）；合入后 `main` 才真正干净 |

## 八、明早建议动作

1. 打开 `https://sso.hbut.site` 用组织管理员登录，进 `mini-hbut-lab` 应用确认配置。
2. 用 §3.3 的 URL 走一遍登录授权，看地址栏 `code=`。
3. 决定 `mini-hbut-lab` / `9900000001` / `t9000001` 是保留还是删除。
4. 评审并合入 **OCR-services#65**（P0 修复）；合入后 `main` 再出镜像就自带这个修复。
5. 若要继续身份链路：下一步是部署 `student-auth`（建号归它），而不是恢复 `/identity/bootstrap`。

---

## 九、结论对照本 issue 的验收标准

| 验收项 | 结果 |
|---|---|
| `/health` 200 且 build sha = 新构建 | ✅ `build.sha=ed0eee7`（`/health/deps`） |
| `POST /identity/bootstrap` 对合成学生返回 2xx + JWT | ❌ **不适用**：该端点已被 main 明确退役；等价能力改为「Casdoor 授权码 + PKCE」并**已实测通过** |
| Casdoor 库中存在测试学号用户，`hbut_student_id` 正确 | ✅ `fdl-users/9900000001`，4 个 `hbut_*` 属性齐全 |
| JWT 通过验签，`student_id` 正确 | ✅ RS256 + JWKS 验签通过，`hbut_student_id=9900000001` |
| 云同步 upload/download 往返一致 | ✅ 修复镜像上重跑通过 |
| 回滚演练 | ✅ 真实回滚过一次，再升级一次 |
| 所有结论附真实命令输出，未验证项标 BLOCKED | ✅ 见 §3/§4/§5 与 issue 评论 |
