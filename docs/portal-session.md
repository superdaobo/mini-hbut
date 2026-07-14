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

关键 cookie 名（已知，完整 Max-Age 待 #352 登录实测）：

- 门户：`CASTGC`, `TGC`, `happyVoyage`
- 学习通：`UID`, `_uid`, `p_auth_token`, `cx_p_token`, `xxtenc`
- 教务：`jw_uf`, `username`

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
- #352 协议实测（Max-Age 表需登录实测后补全）  
- #353 安全与登出  
