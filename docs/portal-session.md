# 门户 + 学习通长效会话（#348）

## 原理

浏览器/官方 App 的「很多天还能用」依赖：

1. 服务器下发 **带 Max-Age/Expires 的持久 Cookie**
2. 客户端 **落盘** 并在冷启动 **自动灌回** 网络层
3. 有网时带上旧票；服务端未吊销即可用

本客户端目标：把 `reqwest` CookieJar 中门户与学习通 **多域 cookie** 写入 SQLite `auth_cookie_v2`，并与旧 `user_sessions.cookies` **双写兼容**。

## 桥接路径（学校 → 学习通）

```
auth.hbut.edu.cn (CASTGC / TGT)
  → /authserver/login?service=https://fysso.chaoxing.com/cassso/hbutsie
  → FYSSO
  → passport2 / i.chaoxing.com 等 .chaoxing.com cookie
```

## 持久化域列表

| key | origin | Domain 属性 |
|-----|--------|-------------|
| code | code.hbut.edu.cn | .hbut.edu.cn |
| auth | auth.hbut.edu.cn | .hbut.edu.cn |
| portal | e.hbut.edu.cn | .hbut.edu.cn |
| jwxt | jwxt.hbut.edu.cn | .hbut.edu.cn |
| chaoxing_jwxt | hbut.jw.chaoxing.com | .chaoxing.com |
| passport | passport2.chaoxing.com | .chaoxing.com |
| i_chaoxing | i.chaoxing.com | .chaoxing.com |
| mooc1 | mooc1.chaoxing.com | .chaoxing.com |
| mooc2_ans | mooc2-ans.chaoxing.com | .chaoxing.com |
| pan_yz | pan-yz.chaoxing.com | .chaoxing.com |
| mobilelearn | mobilelearn.chaoxing.com | .chaoxing.com |
| fysso | fysso.chaoxing.com | .chaoxing.com |

## #352 协议实测（2026-07-14 MCP 登录）

实测路径：统一身份认证登录成功 → `e.hbut.edu.cn` 门户 →  
`authserver/login?service=https://fysso.chaoxing.com/cassso/hbutsie` →  
`passport2.chaoxing.com/v2/loginfanya` → `hbutsie1.fanya.chaoxing.com/portal` → `i.chaoxing.com` 可用。

### 学习通（`passport2` Set-Cookie，Domain=`.chaoxing.com`）

| Cookie | HttpOnly | Expires / Max-Age（实测） | 约有效期 |
|--------|----------|---------------------------|----------|
| `UID` / `_uid` / `_d` | 否 | Expires ≈ 登录后 +7.4 天 | **~7 天** |
| `cx_p_token` | 否 | 同上 | **~7 天** |
| `p_auth_token` | 是 | 同上；JWT `exp-loginTime=604800s` | **7 天（精确）** |
| `vc3` / `uf` / `DSSTASH_LOG` | vc3 是 | 同上 | **~7 天** |
| `uname` / `fid` | 否 | Expires ≈ 登录后 +30 天 | **~30 天** |
| `xxtenc` | 否 | 同上 | **~30 天** |
| `JSESSIONID`（passport/fanya） | 是 | 无 Expires | **会话级** |
| `route` | 否 | 无 Expires | **会话级** |

### FYSSO（`fysso.chaoxing.com`）

| Cookie | 属性（实测） | 约有效期 |
|--------|--------------|----------|
| `INGRESSCOOKIE` | `Max-Age=172800`; HttpOnly | **2 天** |
| `jrose` | Path=/; Secure | 会话级（无 Max-Age） |
| `route` | Path=/ | 会话级 |

### 泛雅校区站（`hbutsie1.fanya.chaoxing.com`）

| Cookie | 属性（实测） |
|--------|--------------|
| `fanyamoocs` | Domain=chaoxing.com; Path=/; HttpOnly；无 Max-Age（会话级） |
| `JSESSIONID` | Path=/; HttpOnly；会话级 |

### 门户 / CAS（`auth.hbut.edu.cn`）

| Cookie | 观测 | 说明 |
|--------|------|------|
| `CASTGC` | 登录后 Cookie 请求头中长期携带 `TGT-...` | 本轮未抓到首次 Set-Cookie 行；凭此可静默签发 ST 进门户/学习通 |
| `happyVoyage` | `Path=/; HttpOnly`，每次换 ST 会轮换 | 响应中 **无 Max-Age**（会话/轮换型） |
| `JSESSIONID` | `Path=/personalInfo; Secure; HttpOnly` | 会话级 |
| `MOD_AUTH_CAS` | 登录后短期 ST 形态 | 一次性/短期 |
| `WIS_PER_ENC` / `REFERERCE_TOKEN` | 个人中心 | 无 Max-Age |

### 融合门户（`e.hbut.edu.cn`）

| Cookie | 观测 |
|--------|------|
| `route` / `gwroute-casp-portal` / `COM.WISEDU.CASP.*` / `WISCPSID` | 多为 Path=/、无 Max-Age；依赖上游 CAS 会话 |

### 超星教务（`hbut.jw.chaoxing.com`，经 i.chaoxing 空间登录）

| Cookie | Max-Age（实测） | 约有效期 |
|--------|-----------------|----------|
| `jw_uf` / `jw_uf_d` / `jw_uf_u` | `7200` | **2 小时** |
| `username` / `puid` | `1209600` | **14 天** |
| `twiceAuthSign` | `43200` | **12 小时** |
| `defaultPass` / `initPass` / `inactivePass` | `1209600` | **14 天** |
| `uid`（会话） | 无 Max-Age；HttpOnly; SameSite=lax | 会话级 |

### 对客户端持久化的含义

1. **学习通业务票（UID / cx_p_token / p_auth_token）约 7 天**，落盘后冷启动可免桥接复用；过期后需 CASTGC 再桥接。  
2. **uname/fid/xxtenc 约 30 天**，辅助身份，不能单独当会话。  
3. **门户 `happyVoyage` 无 Max-Age**：浏览器关窗可能丢；应用侧必须 **jar→SQLite 落盘** 才能跨进程长效。  
4. **`CASTGC` 是静默续期枢纽**：务必从 auth 域导出并 hydrate，否则 7 天后只能重登门户。  
5. **超星教务 `jw_uf` 仅 2 小时**：列表/成绩接口宜短周期重登或用学习通 SSO 重刷，不能指望数天免登。  

### 客户端续期策略（实现）

| 票种 | 策略 |
|------|------|
| 学习通 7 天票 | `ensure_chaoxing_sso`：jar 有 UID+token 则 `cookie_reuse`；进程内 7 天 SSO 缓存；30 分钟内跳过网络探针 |
| 教务 jw_uf 2h | `ensure_chaoxing_academic_session`：90 分钟 soft TTL；过期先 `getMenuList` 探针，失败再 xxtlogin 续期 |
| keep-alive | 前端约 20 分钟 `refresh_session`：门户信息刷新 + jw 短票 + **后台 `ensure_chaoxing_sso` 补票**（#351，失败不阻断） |
| 进页 | 有 last-class 时先进壳并行拉资料；登录后 `spawn_chaoxing_sso_warmup` 预热（#351） |

关键 cookie 名：

- 门户：`CASTGC`, `happyVoyage`, `MOD_AUTH_CAS`
- 学习通：`UID`, `_uid`, `p_auth_token`, `cx_p_token`, `xxtenc`, `uf`, `vc3`
- 教务：`jw_uf`, `jw_uf_u`, `username`, `puid`

## 读/写顺序

**读：** `auth_cookie_v2` → 文件快照 `hbut_cookie_snapshot.json`（旧 `user_sessions.cookies` 在启动/restore 时叠加）  
**写：** jar → `auth_cookie_v2` + 仅更新旧 cookies 列（`update_user_session_cookies_only`，不碰密码/电费 token）+ 文件快照  

## 挂钩点

| 时机 | 行为 |
|------|------|
| 门户登录成功 | `persist_session_cookies` |
| 学习通 CAS 桥接/复用成功 | `persist_session_cookies` |
| 冷启动 | `hydrate_session_cookies_from_store`（优先 v2） |
| `restore_session` | hydrate v2 + 凭据回填后再 persist |
| 登出 | `clear_auth_cookies` + 删除文件快照（记住密码保留） |

## 相关 Issue

- #348 Epic  
- #349 数据层  
- #350 网络层  
- #351 SSO 体验  
- #352 协议实测（已于 2026-07-14 MCP 登录补全主表）  
- #353 安全与登出  
