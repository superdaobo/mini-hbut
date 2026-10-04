# Issue #984 修复规划：CAS 登录后 JWXT 会话落地失败被误报「会话已过期」

- 基线：`origin/main` = `32a246eb`（本地 `main` = `0dad6ede`，落后 1 个提交）
- worktree：`D:\Documents\C_learn\成绩查询\wt\tauri-984-auth`
- 分支：`fix/984-cas-jwxt-session-bootstrap`
- 日期：2026-10-04

---

## 一、本轮已完成（不依赖账号密码的部分）

### 1. Issue #984 通读结论

Issue 给出 4 类缺陷、7 条必须新增的回归测试、12 条验收标准，以及一份「禁止的表面修复」清单。
核心诉求：把 **CAS 认证状态 / JWXT 会话落地状态 / 历史会话过期状态** 拆开处理，
不允许继续用一个「会话已过期」覆盖整条失败链。

### 2. 源码定点核查（结论：Issue 描述的缺陷在基线上真实存在）

| # | 位置 | 现状 | 判定 |
|---|------|------|------|
| D1 | `auth.rs:564` | `is_already_logged_in = !final_url.contains("authserver/login") \|\| ...` | ✅ 属实。`https://jwxt.hbut.edu.cn/admin/login` 不含 `authserver/login` → 被判「已登录」 |
| D2 | `auth.rs:450 / 458` | `let _ = self.client.get(&caslogin_url).send().await?;` | ✅ 属实。status / final_url 全部丢弃，补票失败与真实过期不可区分 |
| D3 | `session.rs:612` | `return Err("会话已过期，请重新登录".into())` | ✅ 属实，且这是**用户看到的文案唯一来源**：`login()` → `login_finalize_session()` → `finalize_jwxt_user_session()` → `fetch_user_info()` → 该行 |
| D4 | `mod.rs:208` vs `auth.rs:564` | 同项目两套「教务登录页」定义 | ✅ 属实。`looks_like_academic_login_url` 同时排除 `authserver/login` + `/admin/login`，而 `get_login_page_with_service` 只排除前者 |
| D5 | `auth.rs:1302` | `is_on_auth_page` 含 `response_url.contains("auth.hbut.edu.cn")` | ⚠️ 过粗：`auth.hbut.edu.cn` 下任何路径都算「仍在登录页」 |
| D6 | `auth.rs:1326-1328` | 成功判定含 `!response_url.contains("login")` | ⚠️ 过粗：任何含 `login` 字样的合法 URL 都会被误判为未成功 |
| D7 | `mod.rs:95` | `HttpClientErrorKind` 只有 `Transport / AuthFailed / Other` | ⚠️ 缺 `SessionExpired` 与 `JwxtBootstrapFailed`，无法表达情况 C |

### 3. 可达错误链（已按代码逐跳确认）

```text
残留 CAS/JWXT Cookie
  → get_login_page_with_service(TARGET_SERVICE)
  → final_url = https://jwxt.hbut.edu.cn/admin/login
  → D1: is_already_logged_in = true
  → login() auth.rs:1099 直接 break 到 fetch_user_info()，本次密码 POST 被跳过
  → fetch_user_info() 命中登录页
  → session.rs:612 return Err("会话已过期，请重新登录")
  → login() 用 `?` 直接透传（不记 60s 冷却、不区分密码对错）
  → UI 显示「会话已过期，请重新登录」
```

与用户现象完全一致。**用户输入的密码可能根本没被提交过。**

### 4. 现有测试注入点（决定 Phase 4 怎么写测试）

- `mod.rs:358/367/376`：`test_login_page` / `test_cas_post` / `test_finalize`
- `auth.rs:1366/1383/1404`：三处在测试构建下短路真实网络
- **缺口**：`/admin/caslogin` 这一跳没有任何注入点 → 必须新增 `test_caslogin`（或本地 mock server）才能测 T4/T5

### 5. 环境准备与基线

- worktree 已建（基于最新 `origin/main`）
- 已补 `apps/client/dist/index.html` 占位（否则 `generate_context!` panic）
- 基线 `cargo test -p hbut-helper --lib http_client::` **全绿**：
  `33 passed; 0 failed; 336 filtered out`（编译 5m43s，测试 2.04s）
  - 编译期有 45 个 warning（`summarize_pending_count` / `extract_meta_json` /
    `resolve_online_learning_student_id` 等 never used），**均为既有噪音，与本次改动无关**
  - ⚠️ 关键观察：`login_cooldown_tests::success_path_still_works_and_counts_as_cas_attempt`
    通过 `test_finalize` 注入口**绕过了真实的 `finalize_jwxt_user_session()`**，
    也就是说 `/admin/caslogin` 这一跳在现有测试里**从未被真实执行过**。
    这正是 T4/T5 写不出来、缺陷能长期存活的原因，也印证了「必须新增 `test_caslogin` 注入点」。

---

## 二、Phase 1：浏览器全链路抓包（需账号密码）

工具：Chrome DevTools MCP。逐条链路记录：**请求序列 / 每次重定向的 final URL / Set-Cookie / 错误响应形态**。

### 链路 1：新融合门户 → 教务系统
`e.hbut.edu.cn` 登录 → service 跳转 → `jwxt.hbut.edu.cn/admin/caslogin` → `/admin/xsd/xsjbxx/xskp`
重点确认：CAS 成功后 service 落地页到底是 `/admin/?loginType=1` 还是先落 `/admin/login` 再补票。

### 链路 2：一码通
`code.hbut.edu.cn`（`server/auth/getLoginUser`、`server/auth/host/open`）
重点确认：`check_code_login()` 的判定字段是否仍为 `success: true`。

### 链路 3：智慧迎新
`modules/smart_orientation.rs` 对应入口
重点确认：它走的是 CAS service 还是独立登录。

### 链路 4：学习通
`passport2.chaoxing.com` → `i.chaoxing.com/base` → `xxtlogin` 桥接 → `hbut.jw.chaoxing.com`
重点确认：`jw_uf` 短票（约 2h）的失效形态，以及 `probe_jw_uf_alive` 的判定是否可靠。

### 错误注入（必须实际复现，不能只读代码）
1. 错误密码（CAS 明确拒绝）
2. 残留 Cookie + 正确密码（本次核心缺陷）
3. CAS 成功但 JWXT bootstrap 失败
4. 网络中断 / 超时（CAS GET / CAS POST / caslogin / fetch_user_info 四处）

**产出**：`data/issue-984-link-map.md`（链路图 + 每跳 URL + 关键 Cookie + 错误形态 + 四类错误各自的真实响应样本）

---

## 三、Phase 2：状态语义收敛（Rust，单一权威）

在 `http_client/mod.rs` 收敛为唯一口径，禁止各文件自写 `contains(...)`：

```rust
enum JwxtBootstrapOutcome {
    Authenticated,        // 真正拿到教务在线会话
    NeedsCasAuth,         // 回到 CAS 登录页 → 需要重新认证
    JwxtBootstrapFailed,  // CAS 成功但教务会话建不起来
    TransportError,       // 网络/DNS/TLS/超时
}
```

统一 helper（语义收敛，至少覆盖 Issue 要求 D 的四个概念）：
- `looks_like_cas_login_url()`
- `looks_like_academic_login_url()`（复用现有，收编 `auth.rs:564`）
- `response_indicates_service_success()`（复用现有，收编 `auth.rs:1326`）

---

## 四、Phase 3：缺陷修复

| 对应 | 改动 |
|------|------|
| A | `get_login_page_with_service()` 改用统一 helper；`/admin/login` 必须判**未登录**；只有「真正回到 service 成功页 / 明确拿到 ticket」才算已登录 |
| B | 手动登录不被残留 Session 短路：CAS 看似有状态但 JWXT 落 `/admin/login` → 判「会话不一致」→ **最小定向自愈**（仅清认证域 Cookie，重新拉一次新鲜 CAS 登录页参数）→ 最多 1 次自愈 + 1 次正常登录；**不动成绩/课表等业务缓存**，不破坏静默恢复 |
| C | `finalize_jwxt_user_session()` 显式检查 status / final_url，返回 `JwxtBootstrapOutcome`；删除两处 `let _ = ...` |
| D | `session.rs:612` 拆分为「业务请求真实失效」与「登录过程中 bootstrap 失败」两种语义 |
| E | 新增错误 kind（`SessionExpired` / `JwxtBootstrapFailed`）+ 关键日志：`[Auth] CAS password POST final_url=...`、`[Auth] JWXT caslogin status=... final_url=...`、`[Auth] JWXT bootstrap result=...`；**禁止打印明文密码 / 完整 Cookie / 完整 execution** |

前端配套：`login_errors.ts` 增加 JWXT bootstrap 失败的独立文案映射；`LoginV3.vue` 仅在需要时透出。

---

## 五、Phase 4：回归测试（逐条对应 Issue 的 7 条）

| # | 场景 | 断言 |
|---|------|------|
| T1 | `authserver/login` → final_url = `/admin/login` | `is_already_logged_in == false`，且继续走密码 POST |
| T2 | 残留 Cookie + **错误**密码 | 得到「用户名或密码错误」，**不得**得到「会话已过期」 |
| T3 | 残留 Cookie + **正确**密码 | 正常登录成功（防止收紧判定后误伤真已登录用户） |
| T4 | CAS 成功但 caslogin 仍落 `/admin/login` | 不误报密码错误 / 不误报普通过期；返回 JWXT bootstrap 失败类错误；**不无限重试** |
| T5 | caslogin 回到 `authserver/login` | 识别为 `NeedsCasAuth`，不盲目继续 `fetch_user_info()` |
| T6 | 四处 transport error | 仍走 network 分类，不被统一压成「会话已过期」 |
| T7 | 现有成功路径 | CAS POST → service → caslogin → fetch_user_info → UserInfo 全通；60s 冷却 / SingleFlight / 凭据持久化不回归 |

前置改造：新增 `test_caslogin` 注入点（现有三处注入点覆盖不到这一跳）。

---

## 六、Phase 5：验收

- [ ] `cargo fmt --check` / `cargo test` / `cargo clippy` 全绿
- [ ] 前端 `vue-tsc` + `vitest` 全绿
- [ ] Issue #984 的 12 条验收标准逐条对账
- [ ] 真机/浏览器复现四类错误，确认文案与链路正确
- [ ] PR 到 `main`（不破坏 #659 / #927 / #931 的既有治理）

---

## 七、默认假设（不确定处先假设，实测后修正）

- **假设 A**：新融合门户仍以 `auth.hbut.edu.cn/authserver` 为 CAS，教务仍走 `/admin/caslogin` 补票。
  若 Phase 1 实测已改版 → 按实测链路修正 Phase 2/3。
- **假设 B**：一码通 / 智慧迎新 / 学习通 均复用 `looks_like_academic_login_url`，收敛口径时不能误伤。
  Phase 1 逐条确认调用点行为。
- **假设 C**：`/admin/login2` 维持现有契约（`looks_like_academic_login_url` 明确排除它）——**不动**。

## 八、风险与对策

| 风险 | 对策 |
|------|------|
| R1：收紧 `is_already_logged_in` 后，真已登录用户多走一次 CAS POST | T3 覆盖；且 POST 前若 service 已成功跳转仍走快路径 |
| R2：Cookie 定向自愈过宽，破坏 #659 静默恢复 | 只清认证域 Cookie、限一次、不碰业务缓存；单独测试 |
| R3：误改 `looks_like_academic_login_url` 影响 10+ 调用点（成绩/课表/考试/排名…） | 该函数本身不改，只做「调用方收敛」；跑全量 `http_client::` 测试 |
| R4：浏览器抓包发现门户已改版，Phase 3 需重做 | Phase 1 先于 Phase 3 落地；Phase 2 的枚举设计对链路变化不敏感 |

---

## 九、执行结果（2026-10-04 收口）

### 9.1 实测推翻了 Issue 的核心假设 —— 找到了更深的根因

Issue 假设「CAS 看似有状态但 JWXT 落 `/admin/login`」时会走 `finalize_jwxt_user_session()`
并因不校验结果而失败。实测发现两层问题：

1. **该分支根本不会进入 `finalize_jwxt_user_session()`**（`auth.rs:1099` 直接
   `fetch_user_info()`），所以连唯一能建立会话的步骤也被绕过；
2. **更根本的是 service 字符串选错了**。对照实验（唯一变量 = service）：

   | service | 最终 URL | 结果 |
   |---------|----------|------|
   | `/admin/?loginType=1` | `/admin/login` | ❌ 教务 303 丢弃 ticket |
   | `/admin/caslogin` | `/admin/?loginType=1` | ✅ 一步建立会话 |

   因此 `/admin/caslogin` 不是「可选补偿」，而是**建立教务会话的必要步骤**。

详见 `data/issue-984-link-map.md`。

### 9.2 交付物

| 项 | 内容 |
|----|------|
| 分支 | `fix/984-cas-jwxt-session-bootstrap` |
| 提交 | `1329f266` |
| PR | https://github.com/superdaobo/mini-hbut/pull/994 |
| 抓包档案 | `data/issue-984-link-map.md`（四条链路 + 四类错误形态） |
| Epic / Sub | #985 ← #984 + #986–#990 |

### 9.3 代码改动

1. `TARGET_SERVICE` → `https://jwxt.hbut.edu.cn/admin/caslogin`（根因）
2. `compute_is_already_logged_in()` 纯函数取代 `!contains("authserver/login")` 启发式
3. 统一 helper 收敛到 `mod.rs`（`looks_like_cas_login_url` / `looks_like_portal_login_url` /
   `looks_like_login_landing_url` / `response_indicates_service_success`）
4. `bootstrap_jwxt_caslogin()` 显式校验 status + final_url，分类为 `JwxtBootstrapOutcome`；
   删除两处 `let _ = …`
5. 新增 `HttpClientErrorKind::JwxtBootstrapFailed` + 独立文案
6. 残留会话定向自愈 `reset_hbut_auth_cookies()`（只清 `.hbut.edu.cn` 认证 Cookie，最多一次）
7. 错误词表补齐门户真实文案（「图形动态码错误」/「用户名或者密码有误」）
8. 关键日志 `[Auth] CAS password POST started` / `final_url=` / `JWXT caslogin status=` /
   `JWXT bootstrap result=`，不打印密码 / 完整 Cookie / 完整 execution
9. `chaoxing_sso` 静默重登首选 service 同步修正（同根因第二个受害点）

### 9.4 验证

| 检查 | 结果 |
|------|------|
| `cargo test -p hbut-helper --lib` | 380 passed / 0 failed |
| `cargo test -p hbut-helper --lib http_client::` | 44 passed（基线 33） |
| `cargo fmt --all -- --check` | 通过 |
| `cargo clippy -p hbut-helper --lib --tests` | 0 error |
| 真实账号 HTTP 对照实验 | 新 service 一步建立会话，xskp 返回 213KB 真实数据 |

新增 `test_caslogin` 注入点 —— 此前 `test_finalize` 整体替换 finalize，
`/admin/caslogin` 这一跳在测试中从未被真实执行。

### 9.5 剩余风险与未做项

- **未做**：Tauri 开发构建里的端到端点击验证与真机四类错误复测。
  建议合入后在开发构建上冒烟一次再关闭 #984。
- **未做**：前端 `vue-tsc` / `vitest` 本地运行（本 PR 零前端改动、工作区无 `node_modules`），
  交由 CI 覆盖。
- **未完成**：学习通登录 + `xxtlogin` 桥接全链（缺学习通凭证）。
- **未实测**：传输层错误四点的真实样本（未人为断网，避免影响会话）。
- **顺带发现（未修，建议另立）**：
  1. `check_code_login()`（`auth.rs`）依赖 `/server/auth/getLoginUser` 返回 `success:true`，
     但一码通移动端流程下该端点返回 **401**（会话走 URL 的 `tid` 参数，Cookie 为空）
     → 该函数在用户一码通完全可用时仍返回 `false`。
  2. `auth.rs` 中 `final_url.contains("code.hbut.edu.cn/server/auth/host/open")` 判定失效：
     成功后的最终 URL 是 `/?tid=…`，不含该路径。
  3. CAS 会**重排** service 的查询串（`host=28&org=2` → `org=2&host=28`），
     任何依赖 service 精确匹配的逻辑都需注意。

