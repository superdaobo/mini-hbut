# Casdoor 联调矩阵（Epic #1243 · G1-03 / mini-hbut#1247）

> 状态：**全部未实测**（无 FDL 测试租户凭据 / 无 admin token / 无测试学生账号）。
> 本文件的作用是：把「拿到凭据后 30 分钟内怎么跑完」写死，避免下一轮重新摸索；
> 以及明确**哪些结论已有代码/文档证据、哪些完全是空白**。
> 契约见 [`epic-1243-contracts.md`](./contracts/epic-1243-contracts.md) §9.1 / §13 B2。

## 0. 证据等级图例

| 等级 | 含义 |
|---|---|
| `已有代码` | 客户端/服务端代码路径存在，**不代表真实环境可用** |
| `已有文档证据` | 有历史实测记录（#1216 / #1238），可作约束，但不是本轮复测 |
| `待实测` | 需要真实 Casdoor/FDL 环境，本轮 **BLOCKED** |
| `模拟` | 用假 Casdoor（`scripts/identity_v2_phase0_fake_casdoor.py`）跑通，**不得**当真实通过 |

## 1. 九项矩阵

| # | 要验证什么 | 现有资产 | 跑法（拿到凭据后） | 当前等级 |
|---|---|---|---|---|
| 1 | Discovery / JWKS：`issuer`、`jwks_uri`、算法集、`kid` 轮换 | #1238 `daae57a1`（JWKS 仅 1 把 RSA/RS256）；客户端 `oidcFlow.ts` | `curl -s $ISSUER/.well-known/openid-configuration` + `curl -s $JWKS_URI`；再对 `kid` 轮换做两次拉取比对 | `已有文档证据`（算法/kid 形状），`待实测`（轮换） |
| 2 | authorize + code + PKCE（public client，无 secret） | #1232 `a788ba9a`（`minihbut://` 回调 + loopback 回退） | 客户端 `oidcBegin()` → 浏览器授权 → `oidcComplete(callbackUrl)`；断言 `code_verifier` 生效、`state`/`nonce` 绑定 | `已有代码` / `待实测` |
| 3 | token 交换：`iss`/`aud`/`exp`/`alg` 校验 | 同上 + `student-auth` `oidc/token.py` | 用上一步 code 换 token；再用**错 aud / 过期 / 错签名** 三组负向 token 断言被拒 | `已有代码` / `待实测`（负向需真实签发能力） |
| 4 | userinfo | `student-auth` `oidc/userinfo.py` | `curl -H "Authorization: Bearer $AT" $ISSUER/api/userinfo`；断言返回学号/组 | `已有代码` / `待实测` |
| 5 | refresh：轮换与吊销 | #1233 `bccdb52c`（refresh 为默认刷新路径） | 用 refresh 换新 AT，断言旧 refresh **失效**（轮换）；再登出后断言 refresh 被拒 | `已有代码` / `待实测` |
| 6 | logout | `oidcFlow.ts::oidcLogout` | 调 logout 后断言 AT 不可再读 userinfo | `已有代码` / `待实测` |
| 7 | 上游建号幂等（同 sub 多次登录只建一个学生） | `student-auth` `oidc/clients.py`、`docs/casdoor-upstream-setup.md` §4/5 | 同一测试账号登录 3 次；用 admin token 查 Casdoor 用户数 == 1 | `待实测`（需 admin token） |
| 8 | 学生组：只进普通学生组，不给管理员 | #1238（`claims_supported` **无** `groups` → 组只能靠 Casdoor 侧配置） | 建号后查该用户的 groups；断言恰为普通学生组 | `待实测`（需 admin token） |
| 9 | **无 UI 授权可行性**（Epic 核心体验：学生看不到 Casdoor 页面） | 无 | 用后台通路（client_credentials / token exchange / 受控建号）尝试在不渲染登录页的前提下拿到学生 token | **空白**（这是 #1247 的最大风险项） |

## 2. 已有的可跑资产（不需要凭据的部分）

| 资产 | 位置 | 说明 |
|---|---|---|
| 5 个无凭据探测 | `mini-hbut-student-auth/deploy/nas/rehearsal/casdoor_probes.py`（`PROBE_ORDER`） | `device_grant` / `token_exchange` / `token_attributes` / `account_linking` / `registration_off`；**无 admin token 时返回 `_unavailable_result`（BLOCKED 形状，不伪装成功）** |
| 假 Casdoor 联调 stub | `mini-hbut/scripts/identity_v2_phase0_fake_casdoor.py` | 校验 id_token 形状/HMAC/claims，**只回显 claims 与 16 位指纹**（防令牌进日志）；仅 `模拟` 等级 |
| 客户端 OIDC 封装 | `apps/client/src/features/identity/oidc/oidcFlow.ts` | `oidcBegin/Complete/SessionStatus/Logout/BeginLoopback/AwaitCallback` |
| 无感 SSO 接线 | `apps/client/src/features/identity/sso/identitySsoBootstrap.ts`（本 Epic T05 新增） | 登录后幂等尝试；失败不影响主流程；切号作废 |

## 3. 拿到凭据后的一次性清单

需要向 FDL 申请（**不需要生产权限**）：

1. 一个**测试组织**下的测试应用：`client_id`（public，无 secret）、回调白名单含 `minihbut://identity-callback` 与 `http://127.0.0.1:<port>/identity-callback`；
2. 一个**测试学生账号**（可用合成学号，但必须在 Casdoor 侧允许建号）；
3. 一个**只读 admin token**（用于查用户数/组归属，验证 7、8 两项）；
4. 确认是否允许「关闭注册时上游自动建号」（#1216 的 `registration_off` 项，被凭据阻塞）。

拿到后按 §1 的 1→9 顺序跑，每项记录：命令、原始响应（**脱敏**）、PASS/FAIL/BLOCKED。

## 4. 本轮结论

- 1–8 项：**代码/文档资产齐全，真实环境全部 `待实测`**。
- 第 9 项（无 UI 授权）：**空白 + 高风险**。若 Casdoor 真实版本不支持无 UI 通路，Epic 的核心体验（学生看不到 Casdoor）无法成立，必须回到需求方重新确认——**不能用「客户端偷偷填密码」之类的降级方案绕过**。
- 因此 G1-03 保持 **BLOCKED**，不得因本文件存在而勾选完成。
