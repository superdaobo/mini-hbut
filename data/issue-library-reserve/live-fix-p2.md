## TL;DR

图书馆预约的关键路径日志**不落盘**（`runtime_log` 只进内存环形缓冲 + stderr），导致真机 / 线上问题无法从 `%LOCALAPPDATA%\com.hbut.mini\logs` 取证；同时勘察契约文档与线上实测存在多处不符，会继续误导后续开发。

## 决策点

- [ ] **落盘范围与开关**：是全量 `runtime_log` 都落盘，还是仅关键 scope（如 `LibraryReserve*`）落盘？是否需要可配置开关与体积上限 / 轮转，避免 release 构建写盘膨胀？

## 问题描述

本次线上排障时，`%LOCALAPPDATA%\com.hbut.mini\logs\mini-hbut.log` 中**查不到任何** LibraryReserve 相关记录，无法确认 App 实际发出的请求参数与响应分类，只能改用浏览器侧复现。根因是 `runtime_log` 不写文件日志。

同时，勘察期只做「只读可达性 + 静态 JS 提取」，若干端点契约未经实测即写入文档并被实现采纳，本次实测已发现两处硬伤（`reserve/latest/data` 需 `itemId`、入口链不含 `*Enc`），文档若不更正会继续误导。

## 当前行为

### 1）日志不落盘

`apps/client/src-tauri/src/runtime_log.rs`：

- 日志进入进程内 `VecDeque`（`MAX_LOGS = 3000`），仅提供前端调试窗 / HTTP bridge 拉取；
- 同时 `eprintln!` 到 stderr（release 下用户看不到）；
- **没有任何文件写入**，因此 `%LOCALAPPDATA%\com.hbut.mini\logs\*.log` 中不存在 `LibraryReserve` / `LibraryReserveSeat` 等 scope 的记录（本次实测确认：全文件 grep 无命中，最后一条日志停留在非预约路径）。

对比：`hbut_helper_lib::http_client::*` 等模块有文件日志，所以日志文件本身是可用的，只是 `runtime_log` 这条通道没接进去。

### 2）契约文档与实测不符

`data/library-reserve-recon/01-api-contract.md` 现存问题：

| 文档记载 | 实测 |
| --- | --- |
| `data/apps/reserve/latest/data` =「最近预约数据」 | 需 `itemId` 参数，缺则 HTTP 400；并非列表接口 |
| 入口链携带 `enc/fidEnc/uid`（未说明不含 `*Enc`） | `seatIdEnc` / `reserveIdEnc` **不在链路**，由落地页 HTML 注入 |
| 静音仓 / 研讨室二级页可达性良好 | 落地路径为 `/front/web/apps/reservepc/index`，且页面引用的端点集比文档更全 |
| 取消 = `reserve/del/form/aprv`（静态提取） | 页面实际引用 `data/apps/reserve/item/user/cancel` |
| 未记录 | `reservepc/user/histroy`（我的预约）、`reserve/verify/reserveuser/status`、`reserve/special/rule`（含 `serverNow`）、`reserve/form/getuserinfo`、`reservepc/team/verify`、`reserve/team/out` |

## 期望行为

- 图书馆预约关键路径的日志可持久化，真机出问题时能直接取证（至少包含：入口解析结果、实际请求路径与参数个数、响应分类结论）。
- 契约文档与线上实测一致，并显式标注「已实测 / 未实测」与实测日期，避免再次把静态提取当成事实。

---

## 影响范围

| 文件 | 当前状态 |
| --- | --- |
| `apps/client/src-tauri/src/runtime_log.rs` | 内存环形缓冲 + `eprintln!`，无文件落盘 |
| `apps/client/src-tauri/src/modules/library_reserve.rs` | 关键路径已调用 `runtime_log::log_info/log_warn`（落盘后即可取证） |
| `apps/client/src-tauri/src/modules/library_reserve_seat.rs` | 同上（`座位预约上下文就绪 … 有 seatIdEnc=…` 等） |
| `apps/client/src-tauri/src/modules/library_reserve_pc.rs` | 同上（`入口未返回 reserveIdEnc…` 等） |
| `data/library-reserve-recon/01-api-contract.md` | 多处契约与实测不符（见上表） |
| `data/library-reserve-recon/00-README.md` | 需补「实测 vs 静态提取」的边界说明 |

## 触发/复现方式

1. 启动 App 并进入「图书馆预约」，操作各页签。
2. 查看 `%LOCALAPPDATA%\com.hbut.mini\logs\mini-hbut.log`。
3. 观察：没有任何 `LibraryReserve*` scope 的记录（对照 `http_client` 等模块有记录）。

## 验收标准

- [ ] 图书馆预约关键路径的日志会写入文件（含入口解析、请求路径、错误分类结论）
- [ ] 落盘有体积上限 / 轮转，不导致磁盘无限增长
- [ ] release 构建下同样可取证（或明确说明仅 debug 可用并给出替代取证方式）
- [ ] `01-api-contract.md` 更正 `reserve/latest/data`、入口链 `*Enc` 缺失、取消端点等条目，并补齐实测端点清单
- [ ] 文档显式区分「已实测（含日期）」与「静态提取待验证」
- [ ] 不因落盘引入性能或隐私问题（日志中不得出现 `enc` / `fidEnc` / `uid` / `code` 等凭证原值）

## 关联

- 父单：Epic（本 Epic）
- Epic #1051
- 证据文档：`data/library-reserve-recon/02-live-verification-2026-10-16.md`
