## TL;DR

为新业务统一「掉票 → 灌缓存 → 静默重登/桥接 → 重试」会话护栏，与现有门户/学习通/一码通体系融为一体。

## 问题/需求描述

新功能（学习通课程、收件箱、电费缴费、评教）分属多域 cookie/token。若各自手写续期，易出现假复用、重复桥接或与首页会话灯不一致。

## 当前行为

- 学习通：`modules/chaoxing_sso.rs` 已有预热、TTL、静默门户重登、cookie 探针。
- 一码通/电费：`one_code_token`、`electricity_refresh_token` 落盘；`ensure_electricity_token` 存在。
- 门户 cookie：`auth_cookie_v2` / `user_sessions` 双写与 hydrate。
- 各 command 对失败重试策略不统一。

## 期望行为

- 业务请求失败判定未登录时：hydrate → 按域补票 → persist → 重试一次。
- 返回结构化错误（可读 message、`can_relogin`）。
- 前端有缓存则 stale 展示 + 横幅；无缓存则引导登录。
- 不引入第二套登录体系。

## 影响范围

- `src-tauri/src/modules/chaoxing_sso.rs`
- `src-tauri/src/http_client/` session / electricity / auth
- `src-tauri/src/db.rs` cookie/token 读写
- 新建或扩展统一 ensure 入口（执行者自定）

## 验收标准

- [ ] 新模块 command 文档/代码走统一 ensure 路径
- [ ] 模拟 cookie 过期时，有密码缓存可静默恢复（或明确失败原因）
- [ ] 不在日志中打印密码/完整 token
