## TL;DR

图书馆预约三系统（座位 / 静音仓 / 研讨室）已合并上线，但线上实测发现两类缺陷：**缺 `*Enc` 凭证时超星的「应用未找到」被误报成「当前账号没有该预约项的权限」**（用户上报现象 1），以及**「我的预约」调用了错误端点，导致账号确有记录却显示为空**（用户上报现象 2）。三个子单分别收口「错误分类与凭证获取」「我的预约端点与字段映射」「日志落盘与契约文档」。

## 概述

Epic #1051 的四个 PR（#1059 / #1069 / #1070 / #1071）已全部合并到 `main`（tip `ba25e5f4`）。随后在真机 + MCP 浏览器（已登录超星）上做了全量接口实测，两个上报现象均已定位到根因，且证据可复现（响应体、HTTP 状态、代码行号齐全，见 `data/library-reserve-recon/02-live-verification-2026-10-16.md`）。

核心结论：

1. **凭证缺失 ≠ 无权限**。超星在缺少 `seatIdEnc` / `reserveIdEnc` 时返回
   `HTTP 200 {"msg":"未查询到您所访问的应用，请咨询管理员配置是否正确","success":false}`，
   而现有错误分类把这句话当作「无权限」的强特征 → 前端显示「当前账号没有该预约项的权限。」，
   且 `can_relogin=false` 会把用户引向「重新登录也没用」的错误方向。
2. **入口链不携带 `*Enc`**。`redirectUrlMobile` 的 `redirect_uri` 只带
   `enc / fidEnc / uid / mappIdEnc / formid / wfwEnc / appKey`，`seatIdEnc` 与 `reserveIdEnc`
   由落地页 HTML 服务端注入。座位模块实现了「去页面抓一次」，**PC（静音仓 / 研讨室）模块没有**，
   因此 PC 侧每次业务调用都缺 `reserveIdEnc`，稳定命中上述误报。
3. **「我的预约」端点错误**。现用的 `POST /data/apps/reserve/latest/data` 实测返回 HTTP 400
   （`Required request parameter 'itemId' ... is not present`），它并非列表接口；
   正确端点为 `POST /data/apps/reservepc/user/histroy`，实测返回 `totalRow=1`（该账号有 1 条静音仓记录），
   但真实字段名与前端期待的字段全部不一致。

## Sub-issues 总览

| # | 标题 | 依赖 |
|---|------|------|
| 1 | [P0] 缺失 `*Enc` 凭证被误报为「当前账号没有该预约项的权限」 | 无 |
| 2 | [P1] 「我的预约」端点与字段映射错误，有记录却显示为空 | 无 |
| 3 | [P2] `runtime_log` 不落盘导致真机无法取证 + 勘察契约文档与实测不符 | 无 |

## 依赖关系

```
子单1 (P0 分类/凭证) ──┐
子单2 (P1 端点/字段) ──┼──→ 可并行（改动文件不重叠）
子单3 (P2 日志/文档) ──┘
```

三个子单之间无强依赖，可并行推进；集成时需一起跑全量门闩。

## 验收标准（整体）

- [ ] 三个子单全部完成
- [ ] 登录态正常时，静音仓 / 研讨室页签不再出现「当前账号没有该预约项的权限。」
- [ ] 静音仓页签能正常返回预约项详情与可预约时段
- [ ] 「我的预约」能显示服务端实际存在的记录（实测账号有 1 条静音仓记录）
- [ ] `cargo test --lib library_reserve` 全绿、`cargo fmt --all -- --check` 无 diff
- [ ] `npm run typecheck` 通过、`npm run test:ci` 通过（含 Rust `ERR_*` kind 与前端映射的回归门闩）
- [ ] 证据文档与实测结论同步

## 关联

- Epic #1051（超星 reserve 三系统接入）
- 证据文档：`data/library-reserve-recon/02-live-verification-2026-10-16.md`
- 勘察契约：`data/library-reserve-recon/01-api-contract.md`
