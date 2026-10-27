## TL;DR

为图书馆预约建立 Rust 侧基础模块，打通「学校 CAS → 超星登录态 → 三套预约系统」的凭证链路，
产出可供后续 sub-issue 复用的统一入口与配置获取能力。

## 需求描述

前端要展示图书馆预约的余量、时段、我的预约，前提是 Rust 侧能稳定拿到三套系统的
**真实系统地址**与**基础配置**。本 issue 只做地基，不含具体业务接口。

## 当前行为

- `modules/chaoxing_sso.rs:539` 已有 `ensure_chaoxing_sso(...)`，可换取超星登录态（**复用，不重写**）
- 尚无任何图书馆预约相关模块；`modules/mod.rs` 中无对应声明
- 尚无 `transport/tauri/library_reserve.rs` 命令层

## 期望行为

- 新增 Rust 模块，能通过 mAppId 解析出三套系统的真实入口地址与关键凭证
- 新增 Tauri 命令层，供前端调用
- 凭证/地址的获取失败时返回可区分的错误（未登录 / 已登录但无权限 / 网络不可达），
  避免前端只能显示"加载失败"

## 已知事实（勘察产出，非实现建议）

### 入口链路（已验证三系统全部可达）

```
GET https://v1.chaoxing.com/mobileSet/redirectUrlMobile?mAppId=<APP_ID>
    ↓ 302
GET https://auth.chaoxing.com/connect/oauth2/authorize?appid=<...>&redirect_uri=<真实系统>
    ↓ 超星登录态自动授权
GET <真实系统>
```

### APP_ID 对照

| 应用 | mAppId | 真实系统 |
| --- | --- | --- |
| 座位预约 | `19248837` | `reserve.chaoxing.com/front/apps/seatengine/index?seatId=3597` |
| 静音仓预约 | `19261750` | `reserve.chaoxing.com/front/web/apps/reservepc/index?reserveId=24727` |
| 研讨室预约 | `19248835` | `reserve.chaoxing.com/front/web/apps/reservepc/index?reserveId=24679` |

### 关键凭证参数

真实系统 URL 会携带 `enc` / `fidEnc` / `uid` / `mappIdEnc` / `formid` / `wfwEnc` /
`reserveIdEnc` / `seatIdEnc` 等参数，后续业务接口大量依赖它们。

- 图书馆 `fidEnc` 观测值：`c7450f13f8a0e9ab`（`fid=25285`）
- 座位预约 `seatId=3597`，`seatIdEnc=b146028eafa4eea9`
- 静音仓 `reserveId=24727`，`reserveIdEnc=838c48dae7db28c`；研讨室 `reserveId=24679`

> ⚠️ 上述 `*Enc` 值疑似**短时效**，不应硬编码，需每次实时获取。

## 影响范围

涉及模块：Rust 侧 `modules/` 与 `transport/tauri/`，命令注册在 `lib.rs`

| 文件 | 当前状态 |
| --- | --- |
| `apps/client/src-tauri/src/modules/mod.rs` | 无图书馆预约模块声明 |
| `apps/client/src-tauri/src/transport/tauri/mod.rs` | 无对应命令层 |
| `apps/client/src-tauri/src/lib.rs` | invoke_handler 中无对应命令 |
| `apps/client/src-tauri/src/modules/chaoxing_sso.rs` | 已有 `ensure_chaoxing_sso`，可复用 |

## 验收标准

- [ ] 存在可调用的 Tauri 命令，返回三套系统的真实入口地址与凭证
- [ ] 复用既有超星 SSO，不新建第二套登录通道
- [ ] 未登录超星时返回可区分错误（非笼统的"加载失败"）
- [ ] 三套系统解析结果与勘察文档 `data/library-reserve-recon/01-api-contract.md` 一致
- [ ] `cargo check` 通过，无新增 warning
- [ ] 关键流程有简体中文注释

## 关联

- 父 Epic：图书馆预约三系统接入
- 被依赖：S2 / S3 / S4
- 勘察文档：`data/library-reserve-recon/00-README.md`、`01-api-contract.md`
