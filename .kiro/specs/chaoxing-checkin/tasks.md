# Implementation Plan · chaoxing-checkin

> 本任务列表将 `requirements.md` 与 `design.md` 拆分为一组**可独立执行、可验证的原子步骤**；依赖关系通过编号与前后顺序显式表达。每个任务均包含：
>
> - 带编号的 checkbox（必做任务；可选任务后缀 `*`）
> - 子任务清单（文件路径 / 主要函数 / 关键类型）
> - 覆盖的需求条款引用（`Requirements: Req X.Y`）
> - 若涉及 PBT，附带关联的正确性属性（`Properties: Pn`）
> - DoD（Definition of Done）：可机器或人工快速验证的产出（命令、测试结果、CI 状态）
>
> **依赖原则**：后续任务可串行依赖前序任务的产出；凡能并行的同组子任务，在同一编号下并列。全程使用简体中文。

## Overview

实现路线自底向上：基础设施 → 数据层 → 纯函数层（优先 PBT）→ 协议层 → 并发幂等层 → Tauri 命令层 → 前端桥与视图 → 设计系统与隐私安全 → 测试 → 构建与 CI → 文档与验收。

---

## Tasks

### 1. 基础设施与合规骨架

- [x] 1. 基础设施与合规骨架
  - _Requirements: Req 18.1, 18.2, 18.3, 18.5, 18.6_

  - [x] 1.1 创建 `modules/chaoxing_checkin/` 目录与子模块骨架
    - 新增目录：`src-tauri/src/modules/chaoxing_checkin/`
    - 新增空文件骨架（仅空 `pub mod` 与文档注释，不写业务逻辑）：
      - `mod.rs`（对外 `pub use` 聚合）
      - `types.rs`（DTO 占位）
      - `errors.rs`（`CheckinErrorCode` 占位）
      - `qr_url.rs`（parse / compose 占位）
      - `qr_decode.rs`（占位，仅声明 fn 签名）
      - `screen_capture.rs`（占位，含 `#[cfg(any(target_os="windows", target_os="macos", target_os="linux"))]` gate）
      - `inflight.rs`（`InflightRegistry` 占位）
      - `log_repo.rs`（日志读写占位）
      - `session.rs`（`detect_session_expired` 占位）
      - `protocol.rs`（端点 fn 占位）
    - 每个 `.rs` 文件头部写入强制 SPDX + Attribution 注释（共 3 行）：
      ```
      // SPDX-License-Identifier: GPL-3.0-or-later
      // Portions of this module are ported from AneryCoft/course_helper (GPL-3.0-or-later).
      // Upstream: https://github.com/AneryCoft/course_helper
      ```
    - _Requirements: Req 18.2_
    - _DoD_: `cargo check` 通过；`rg -n "^// SPDX-License-Identifier: GPL-3.0-or-later" src-tauri/src/modules/chaoxing_checkin` 命中全部 10 个文件。

  - [x] 1.2 在 `modules/mod.rs` 挂载新模块
    - 在 `src-tauri/src/modules/mod.rs` 追加 `pub mod chaoxing_checkin;`
    - _Requirements: Req 18.2_
    - _DoD_: `cargo build` 成功；`rg "pub mod chaoxing_checkin" src-tauri/src/modules/mod.rs` 命中。

  - [x] 1.3 新增 Cargo 依赖与 cargo deny 白名单
    - 在 `src-tauri/Cargo.toml` 主依赖新增：`rqrr`、`image`、`dashmap`
    - 新增 desktop cfg 门禁依赖 `xcap`：`[target.'cfg(any(target_os="windows", target_os="macos", target_os="linux"))'.dependencies] xcap = "…"`
    - `[dev-dependencies]` 新增：`proptest`、`proptest-derive`、`wiremock`
    - 更新 `cargo deny` 白名单（若存在 `deny.toml`/`cargo-deny.toml`），允许 `rqrr`、`image`、`xcap`、`dashmap` 的许可证（需与 GPL-3.0-or-later 兼容）
    - _Requirements: Req 7.3, Req 7.4, Req 17 (P1–P18 需 proptest), Req 18_
    - _DoD_: `cargo build` 与 `cargo deny check`（若配置存在）通过；`cargo tree -p rqrr` 可列出该 crate。

  - [x] 1.4 新增 `THIRD_PARTY_NOTICES.md` 条目与协议文档骨架
    - 在仓库根 `THIRD_PARTY_NOTICES.md` 追加 `## AneryCoft/course_helper` 一节：Upstream、License（GPL-3.0-or-later）、Use、Attribution Notes（与 `design.md §10.2` 完全一致）
    - 新增 `docs/chaoxing-protocol.md` 骨架，包含 Scope、Endpoints 占位（五个端点各一节）、Upstream Sync Log 空表头
    - _Requirements: Req 18.3, 18.5_
    - _DoD_: `rg "AneryCoft/course_helper" THIRD_PARTY_NOTICES.md` 命中；`docs/chaoxing-protocol.md` 存在且含 `## Upstream Sync Log` 段。

- [x] 2. 检查点 - 骨架与合规基线
  - 确认 1.1–1.4 全部完成：`cargo check` 绿灯、SPDX 头齐全、依赖安装到位、NOTICE/protocol 文档就位
  - Ensure all tests pass, ask the user if questions arise.

---

### 2. 数据层

- [x] 3. 数据层建设
  - _Requirements: Req 2.3, Req 10.1, Req 10.5, Req 5.5, Req 13.4_

  - [x] 3.1 `chaoxing_checkin_log` 表 DDL 与迁移
    - 修改 `src-tauri/src/db.rs`：新增 `migrate_add_chaoxing_checkin_log(db: &Connection) -> Result<()>`，包含 `CREATE TABLE IF NOT EXISTS chaoxing_checkin_log (...)` 与索引 `idx_checkin_log_student_time`（DDL 与 `design.md §4.3.2` 完全一致）
    - 在 `db::ensure_schema()` 调用链末尾追加该迁移（幂等）
    - _Requirements: Req 10.1_
    - _DoD_: 运行单测 `cargo test db::tests::ensure_schema_creates_checkin_log` 通过；`PRAGMA table_info(chaoxing_checkin_log)` 输出 9 列。

  - [x] 3.2 `log_repo` 实现读写与按学号删除 + 惰性 90d 清理
    - 实现 `modules/chaoxing_checkin/log_repo.rs`：
      - `pub fn append(conn, entry: &CheckinLogEntry) -> Result<()>`（写入后触发惰性 `DELETE` 90d 清理）
      - `pub fn query_history(conn, student_id, limit) -> Result<Vec<CheckinLogEntry>>`（`ORDER BY submitted_at DESC LIMIT ?`）
      - `pub fn delete_by_student(conn, student_id) -> Result<usize>`
    - 在 `db.rs` 暴露同名薄包装 `db::delete_chaoxing_checkin_log_by_student(...)`，供 `clear_chaoxing_data` 调用
    - _Requirements: Req 10.1, 10.3, 10.5, 13.4_
    - _Properties_: 为 P11 提供被测函数
    - _DoD_: `cargo test -p mini-hbut modules::chaoxing_checkin::log_repo` 通过 append / query / cleanup 三个单测样例。

  - [x] 3.3 位置历史 `kv_store` 读写封装
    - 在 `modules/chaoxing_checkin/log_repo.rs`（或独立 `location_history.rs`）新增：
      - `pub fn push_location_history(conn, sid, item: LocationHistoryItem) -> Result<()>`（保留最近 5 条，FIFO）
      - `pub fn get_location_history(conn, sid) -> Result<Vec<LocationHistoryItem>>`
    - 使用既有 `kv_store` 表（不新增表），key 形如 `chaoxing_checkin.location_history.{sid}`，value 为 JSON 数组
    - _Requirements: Req 5.5, Req 13.7（不写 localStorage）_
    - _DoD_: `cargo test ... push_location_history_caps_at_five` 通过（写入 7 条后读出长度 = 5）。

- [x] 4. 检查点 - 数据层
  - 确认 3.1–3.3 完成；DB schema、日志读写、位置历史均可用
  - Ensure all tests pass, ask the user if questions arise.

---

### 3. 纯函数层（PBT 优先）

- [x] 5. QR URL 解析与构造（纯函数 + PBT）
  - _Requirements: Req 7.5, 7.6, 15.1, 15.2, 15.4, 15.5_

  - [x] 5.1 实现 `qr_url::parse` 与 `qr_url::compose`
    - 文件：`modules/chaoxing_checkin/qr_url.rs`
    - 类型：`pub struct QrUrlParts { active_id: String, enc: String }`
    - 常量：`pub const QR_HOST_WHITELIST: &[&str]`（含 `mobilelearn.chaoxing.com / www.chaoxing.com / k.chaoxing.com`）
    - 函数：
      - `pub fn parse(url: &str) -> Result<QrUrlParts, CheckinErrorCode>`（使用 `url::Url`，容忍 `%20` / `+` / `&amp;` / 额外 query / fragment，host 非白名单返回 `BadRequest`）
      - `#[cfg(any(test, feature = "testing"))] pub fn compose(active_id: &str, enc: &str) -> String`
    - 严禁在本文件引入 `reqwest` / `tokio::fs` / `std::env` 副作用
    - _Requirements: Req 7.5, 15.1, 15.4, 15.5_
    - _DoD_: `cargo test -p mini-hbut modules::chaoxing_checkin::qr_url::unit` 的 5+ 个样例全过。

  - [x] 5.2 Property 1 测试：QR URL round-trip
    - **Property 1: QR URL 解析/构造 round-trip**
    - **Validates: Requirements 7.5, 7.6, 15.1, 15.2, 15.4**
    - 文件：`src-tauri/src/modules/chaoxing_checkin/qr_url.rs` 的 `#[cfg(test)] mod proptest_p1_qr_url_roundtrip`
    - proptest 策略：`active_id ∈ /^[1-9][0-9]{0,18}$/`、`enc ∈ /^[0-9a-fA-F]{1,64}$/`；URL 构造器附加噪声（额外 query、fragment、空格、HTML 实体）
    - 首行注释：`// Feature: chaoxing-checkin, Property 1: QR URL 解析/构造 round-trip`
    - 迭代：`cases = 256`
    - _DoD_: `cargo test proptest_p1_qr_url_roundtrip -- --nocapture` 通过。

- [x] 6. 校验器纯函数（位置 / 手势 / 照片输入）
  - _Requirements: Req 5.2, 5.3, 5.7, 6.2, 6.3, 8.2, 8.3_

  - [x] 6.1 实现 `types::validate_location / validate_gesture_pattern / validate_photo_input`
    - 文件：`modules/chaoxing_checkin/types.rs`
    - 函数签名：
      - `pub fn validate_location(lat: f64, lng: f64, addr: &str) -> Result<(), CheckinErrorCode>`（lat ∈ [-90,90]、lng ∈ [-180,180]、len(addr) ∈ [1,80]）
      - `pub fn validate_gesture_pattern(pattern: &str) -> Result<(), CheckinErrorCode>`（len ∈ [4,9]、字符 ∈ `'1'..='9'`、互不重复）
      - `pub fn validate_photo_input(bytes: &[u8], mime: &str) -> Result<(), CheckinErrorCode>`（len ≤ 5MB、mime ∈ {jpeg, png, webp}）
    - _Requirements: Req 5.2, 5.3, 5.7, 6.2, 6.3, 8.2, 8.3_
    - _DoD_: `cargo test types::unit` 基础单测全过。

  - [x] 6.2 Property 5 测试：位置签到输入合法性
    - **Property 5: 位置签到输入合法性**
    - **Validates: Requirements 5.2, 5.3, 5.7**
    - 文件：`modules/chaoxing_checkin/types.rs` 的 `#[cfg(test)] mod proptest_p5_location`
    - 迭代 ≥ 100；生成任意 `f64` 与任意长度字符串
    - _DoD_: `cargo test proptest_p5_location` 通过。

  - [x] 6.3 Property 6 测试：手势密码格式
    - **Property 6: 手势密码格式**
    - **Validates: Requirements 8.2, 8.3**
    - 文件：`modules/chaoxing_checkin/types.rs` 的 `mod proptest_p6_gesture`
    - 生成任意字符的字符串；断言合法输入 ↔ `Ok(())`、非法 ↔ `Err(BadRequest)`
    - _DoD_: `cargo test proptest_p6_gesture` 通过。

  - [x] 6.4 Property 7 测试：图片 MIME 与大小
    - **Property 7: 图片 MIME 与大小**
    - **Validates: Requirements 6.2, 6.3**
    - 文件：`modules/chaoxing_checkin/types.rs` 的 `mod proptest_p7_photo`
    - 生成 `bytes.len() ∈ [0, 10MB]`、`mime ∈ 常见 MIME 集合`
    - _DoD_: `cargo test proptest_p7_photo` 通过。

- [x] 7. 隐私工具函数：脱敏与截断
  - _Requirements: Req 13.3, 13.5_

  - [x] 7.1 实现 `utils/mask.rs::mask_student_id` 与 `utils/truncate.rs::truncate_sensitive`
    - 文件：`src-tauri/src/utils/mask.rs`（新增）与 `src-tauri/src/utils/truncate.rs`（新增）
    - 在 `src-tauri/src/utils/mod.rs` 新增 `pub mod mask; pub mod truncate;`
    - 函数体按 `design.md §9.4` 实现
    - _DoD_: `cargo test utils::mask::unit`、`cargo test utils::truncate::unit` 通过。

  - [x] 7.2 Property 15 测试：学号脱敏纯函数
    - **Property 15: 学号脱敏纯函数**
    - **Validates: Requirements 13.3**
    - 文件：`src-tauri/src/utils/mask.rs` 的 `mod proptest_p15_mask_student_id`
    - _DoD_: `cargo test proptest_p15_mask_student_id` 通过。

  - [x] 7.3 Property 16 测试：日志字段截断
    - **Property 16: 日志字段截断**
    - **Validates: Requirements 13.5**
    - 文件：`src-tauri/src/utils/truncate.rs` 的 `mod proptest_p16_truncate`
    - _DoD_: `cargo test proptest_p16_truncate` 通过。

- [x] 8. 错误码映射表
  - _Requirements: Req 9.1, 9.6_

  - [x] 8.1 实现 `errors::CheckinErrorCode` 与 `human_message`
    - 文件：`modules/chaoxing_checkin/errors.rs`
    - 枚举：`CheckinErrorCode { NetworkError, SessionExpired, BadRequest, ServerError, AlreadySigned, RateLimited, PermissionDenied, Unknown }`（`#[serde(rename_all="snake_case")]`）
    - 函数：`pub fn human_message(code: CheckinErrorCode, body_hint: Option<&str>) -> String`
    - 中文模板集合与 `design.md §6.1` 一致；body_hint 经过白名单 token 选择（不直出原文）
    - _DoD_: `cargo test errors::unit` 覆盖每个枚举至少一个中文消息断言。

  - [x] 8.2 Property 18 测试：错误消息中文化
    - **Property 18: 错误消息中文化**
    - **Validates: Requirements 9.1, 9.6**
    - 文件：`modules/chaoxing_checkin/errors.rs` 的 `mod proptest_p18_human_message`
    - 断言：返回 message 不含 `<`/`>`、不含长英文片段（>20B）、属于预定义中文模板集合
    - _DoD_: `cargo test proptest_p18_human_message` 通过。

- [x] 9. 协议重试策略（指数退避）
  - _Requirements: Req 9.4_

  - [x] 9.1 实现 `protocol::retry_policy`
    - 文件：`modules/chaoxing_checkin/protocol.rs`（或 `protocol/retry.rs`）
    - 函数：`pub fn should_retry(err: &CheckinErrorCode, attempt: u32) -> Option<Duration>`
    - 规则：attempt 0→1 返回 800ms ± 10%；attempt 1→2 返回 1800ms ± 10%；≥2 或不可重试错误返回 `None`
    - 可重试错误集：`NetworkError | ServerError`；其他立即停止
    - _DoD_: `cargo test protocol::retry::unit` 通过。

  - [x] 9.2 Property 17 测试：重试策略与指数退避
    - **Property 17: 重试策略与指数退避**
    - **Validates: Requirements 9.4**
    - 文件：`modules/chaoxing_checkin/protocol.rs` 的 `mod proptest_p17_retry_policy`
    - _DoD_: `cargo test proptest_p17_retry_policy` 通过。

- [x] 10. 检查点 - 纯函数层
  - 确认 5–9 完成；所有纯函数单测与已启用的 PBT 全绿
  - Ensure all tests pass, ask the user if questions arise.

---

### 4. 协议层（移植 course_helper）

- [x] 11. 协议端点 Rust 重写
  - _Requirements: Req 3, Req 4, Req 5.4, Req 6.4, Req 6.6, Req 7.7, Req 8.4, Req 18.1, 18.2, 18.4_

  - [x] 11.1 集中化 HTTP header 指纹
    - 文件：`modules/chaoxing_checkin/protocol/headers.rs`（新增子文件）或 `protocol.rs` 内模块 `mod headers`
    - 函数：`pub fn default_headers() -> HeaderMap`（仿真 ChaoXingLearning 桌面/移动客户端 UA + 必要 header 指纹）
    - _Requirements: Req 18.4_
    - _DoD_: 单测校验必要 header 字段存在（UA、Accept、Referer）。

  - [x] 11.2 实现 `list_activities` 与 `list_clazz`
    - 文件：`modules/chaoxing_checkin/protocol.rs`
    - 函数：
      - `pub async fn list_activities(client: &HbutClient, limit_hours: i64) -> Result<Vec<CheckinActivity>, CheckinErrorCode>`（`GET mobilelearn.chaoxing.com/v2/apis/active/student/activelist`）
      - `pub async fn list_clazz(client: &HbutClient) -> Result<Vec<ClazzInfo>, CheckinErrorCode>`（`GET mooc1-api.chaoxing.com/mycourse/backclazzdata`）
      - `pub fn normalize_activities(...)`：合并 clazz 信息、去重、按 status & start_time 排序
    - 采用纯函数 `normalize_activities`，便于 P3/P4 测试
    - _Requirements: Req 3.2, 3.3, 3.4_
    - _DoD_: `cargo test protocol::list_activities_unit`（用 wiremock mock 响应）通过。

  - [x] 11.3 Property 3 测试：活动状态分类互斥
    - **Property 3: 活动状态分类互斥**
    - **Validates: Requirements 3.2, 3.3**
    - 文件：`modules/chaoxing_checkin/protocol.rs` 的 `mod proptest_p3_activity_status_exclusive`
    - 策略：生成含重复/错序/时间跨度的原始 JSON → 调 `normalize_activities`
    - _DoD_: `cargo test proptest_p3_activity_status_exclusive` 通过。

  - [x] 11.4 Property 4 测试：列表排序不变式
    - **Property 4: 列表排序不变式**
    - **Validates: Requirements 3.3, 3.4**
    - 文件：`modules/chaoxing_checkin/protocol.rs` 的 `mod proptest_p4_sorting`
    - _DoD_: `cargo test proptest_p4_sorting` 通过。

  - [x] 11.5 实现 `pre_sign / ppt_sign / ppt_sign_with_code`
    - 函数：
      - `pub async fn pre_sign(client, active_id, course_id, clazz_id) -> Result<PreSignResult, CheckinErrorCode>`
      - `pub async fn ppt_sign(client, params: PptSignParams) -> Result<CheckinSubmitResult, CheckinErrorCode>`
      - `pub async fn ppt_sign_with_code(client, active_id, sign_code) -> Result<CheckinSubmitResult, CheckinErrorCode>`
    - 与 `design.md §3.4.2` 端点列表对齐
    - _Requirements: Req 4, 5.4, 8.4, 18.4_
    - _DoD_: `cargo test protocol::ppt_sign_wiremock` 的 3 个样例通过。

  - [x] 11.6 实现 `upload_photo` 与 `qr_pre_sign`
    - 函数：
      - `pub async fn upload_photo(client, bytes, mime, name) -> Result<PhotoUploadResult, CheckinErrorCode>`（`POST pan-yz.chaoxing.com/upload`）
      - `pub async fn qr_pre_sign(client, active_id, enc) -> Result<PreSignResult, CheckinErrorCode>`
    - _Requirements: Req 6.4, 7.7, 18.4_
    - _DoD_: wiremock 样例通过。

- [x] 12. 请求目的地拦截器（白名单强制）
  - _Requirements: Req 11.5, 13.1, 13.2_

  - [x] 12.1 实现 `InterceptingClient` 包装层
    - 文件：`src-tauri/src/http_client/intercepting_client.rs`（新增）；在 `HbutClient` 对外暴露的签到子集使用该包装
    - 常量：`SAFE_DOMAIN_WHITELIST` 迁入 `modules/chaoxing_checkin/types.rs`（与 `design.md §9.1` 一致）
    - 规则：发起前断言 `host ∈ whitelist`（后缀匹配 `.chaoxing.com` / `.hbut.edu.cn`）；debug 模式 panic、release 模式返回 `PermissionDenied`
    - _DoD_: `cargo test http_client::intercepting_client::unit` 覆盖命中与拒绝两条路径。

  - [x] 12.2 Property 8 测试：网络目的地白名单
    - **Property 8: 网络目的地白名单**
    - **Validates: Requirements 11.5, 13.1, 13.2**
    - 文件：`src-tauri/src/http_client/intercepting_client.rs` 的 `mod proptest_p8_domain_whitelist`
    - 生成任意 URL + 任意输入参数，断言所有真实 HTTP 请求 host ∈ whitelist
    - _DoD_: `cargo test proptest_p8_domain_whitelist` 通过。

- [x] 13. 会话自愈
  - _Requirements: Req 2.6, 9.2, 9.3_

  - [x] 13.1 实现 `session::detect_session_expired` 与 `on_session_expired_hook`
    - 文件：`modules/chaoxing_checkin/session.rs`
    - 函数：
      - `pub fn detect_session_expired(status: StatusCode, final_url: &str, body: &str) -> bool`（规则与 `design.md §3.8` 一致）
      - `pub async fn on_session_expired(student_id: &str) -> Result<()>`：清 cookie（`db::save_online_learning_platform_state(..., connected=false, cookie_blob="")`）+ 清 `HbutClient.cookie_jar` 中 `.chaoxing.com` 条目
    - _DoD_: `cargo test session::detect_unit` 覆盖 6 个样例（302 login、body"请先登录"、passport2 等）。

  - [x] 13.2 Property 9 测试：会话自愈一致性
    - **Property 9: 会话自愈一致性**
    - **Validates: Requirements 2.6, 9.2, 9.3**
    - 文件：`modules/chaoxing_checkin/session.rs` 的 `mod proptest_p9_session_selfheal`
    - _DoD_: `cargo test proptest_p9_session_selfheal` 通过。

- [x] 14. 检查点 - 协议层
  - 确认 11–13 完成；wiremock 协议契约测试全绿；白名单拦截器与会话自愈生效
  - Ensure all tests pass, ask the user if questions arise.

---

### 5. 并发与幂等层

- [x] 15. Inflight 合并注册表
  - _Requirements: Req 14.3, 16.1, 16.2, 16.3, 16.4_

  - [x] 15.1 实现 `inflight::InflightRegistry`
    - 文件：`modules/chaoxing_checkin/inflight.rs`
    - 类型：`pub struct InflightRegistry { map: DashMap<String, Arc<tokio::sync::Mutex<Option<CheckinSubmitResult>>>> }`
    - 函数：
      - `pub fn new() -> Self`
      - `pub async fn run<F, Fut>(&self, active_id: &str, f: F) -> CheckinSubmitResult`（60s TTL，复用缓存时覆写 `result = AlreadySigned`）
      - 60s 后台清理采用 `tokio::spawn(sleep → map.remove)`
    - _Requirements: Req 16.4_
    - _DoD_: `cargo test inflight::basic_reuse` 通过。

  - [x] 15.2 Property 2 测试：普通签到幂等性（顺序）
    - **Property 2: 普通签到幂等性（顺序）**
    - **Validates: Requirements 4.4, 16.1, 16.2, 16.3**
    - 文件：`modules/chaoxing_checkin/inflight.rs` 的 `mod proptest_p2_idempotence_sequential`
    - 策略：顺序 N∈[2,8] 次 `run(same_active_id, …)`；mock HTTP 计数 ≤ 1
    - _DoD_: `cargo test proptest_p2_idempotence_sequential` 通过。

  - [x] 15.3 Property 12 测试：并发合并
    - **Property 12: 并发合并**
    - **Validates: Requirements 14.3, 16.1, 16.3, 16.4**
    - 文件：`modules/chaoxing_checkin/inflight.rs` 的 `mod proptest_p12_inflight_merge`
    - 策略：`tokio::join!` N∈[2,64] 个 task；断言远端 HTTP 调用计数 ≤ 1、success 日志 ≤ 1
    - _DoD_: `cargo test proptest_p12_inflight_merge` 通过。

- [x] 16. 检查点 - 并发幂等层
  - 确认 15.1–15.3 完成；`f(f(x)) == f(x)` 断言在顺序与并发两路径成立
  - Ensure all tests pass, ask the user if questions arise.

---

### 6. QR 解码与截屏能力

- [x] 17. 本地 QR 解码
  - _Requirements: Req 7.3, 7.10_

  - [x] 17.1 实现 `qr_decode::decode_qr_image`
    - 文件：`modules/chaoxing_checkin/qr_decode.rs`
    - 函数：`pub fn decode_qr_image(bytes: &[u8], mime: &str) -> Result<String, CheckinErrorCode>`
    - 实现：`image::load_from_memory` → `to_luma8()` → `rqrr::PreparedImage::prepare` → 取第一个 `decode()` 结果
    - 严禁 `use reqwest`、`tokio::fs`、`std::fs`
    - 无 QR / 损坏图 / 非图像字节 → `BadRequest`；禁止 `unwrap()`
    - _DoD_: `cargo test qr_decode::unit` 覆盖成功、无 QR、损坏字节三条路径。

- [x] 18. 桌面屏幕截图
  - _Requirements: Req 7.4, 17 P14_

  - [x] 18.1 实现 `screen_capture::capture_screen_qr`
    - 文件：`modules/chaoxing_checkin/screen_capture.rs`
    - 类型：`pub struct ScreenRect { x: i32, y: i32, w: u32, h: u32 }`
    - 函数（仅 `#[cfg(any(target_os="windows", target_os="macos", target_os="linux"))]`）：
      - `pub fn capture_screen_qr(rect: Option<ScreenRect>) -> Result<String, CheckinErrorCode>`
      - 使用 `xcap::Monitor::all()?`，挑 `is_primary()`；`rect=None` 全图，否则 `crop(rect)`
      - 结果 `DynamicImage` 交给 `qr_decode::decode_from_dynamic_image`
      - 不写盘、不开临时文件
    - 非桌面平台提供 `#[cfg(not(...))]` 版本直接返回 `PermissionDenied`
    - _DoD_: `cargo test screen_capture::unit_desktop_only`（需 `cfg(target_os="...")` 门禁）通过。

  - [x] 18.2 Property 13 测试：本地 QR 解码纯粹性
    - **Property 13: 本地 QR 解码纯粹性**
    - **Validates: Requirements 7.3, 7.10**
    - 文件：`modules/chaoxing_checkin/qr_decode.rs` 的 `mod proptest_p13_decode_purity`
    - 断言：执行期 HTTP 计数 = 0（经 InterceptingClient mock）；相同输入稳定；非 QR → `BadRequest` 且不 panic
    - _DoD_: `cargo test proptest_p13_decode_purity` 通过。

  - [x] 18.3 Property 14 测试：截屏数据不落盘
    - **Property 14: 截屏数据不落盘**
    - **Validates: Requirements 7.4**
    - 文件：`modules/chaoxing_checkin/screen_capture.rs` 的 `mod proptest_p14_capture_no_disk`
    - 断言：调用前后 `std::env::temp_dir()` 与应用数据目录文件数差为 0
    - _DoD_: `cargo test proptest_p14_capture_no_disk` 通过（非桌面平台自动 skip）。

- [x] 19. 检查点 - 解码与截屏
  - 确认 17–18 完成
  - Ensure all tests pass, ask the user if questions arise.

---

### 7. Tauri 命令层（11 条 + 内部 compose）

- [ ] 20. `Checkin_Command_Set` 注册与实现
  - _Requirements: Req 3.1, 4, 5, 6, 7, 8, 10.3, 7.3, 7.4, 7.5, 11.4_

  - [x] 20.1 统一返回类型与命令模块骨架
    - 文件：`src-tauri/src/commands/chaoxing_checkin.rs`（新增）
    - 类型：`CheckinSubmitResult { result: SubmitResult, message, error_code, server_response }`、`SubmitResult { Success, AlreadySigned, Failure }`（与 `design.md §3.3.1 / §3.3.2` 一致）
    - 模块挂载：`src-tauri/src/commands/mod.rs` 新增 `pub mod chaoxing_checkin;`
    - _DoD_: `cargo build` 通过；`rg "pub mod chaoxing_checkin" src-tauri/src/commands/mod.rs` 命中。

  - [x] 20.2 命令 1：`chaoxing_checkin_list`
    - 入参 `{ force_refresh: bool }`；出参 `Vec<CheckinActivity>`；内含 60s 内存缓存
    - 失败按 `CheckinErrorCode` 返回
    - _Requirements: Req 3.1, 3.7_
    - _DoD_: `cargo test commands::chaoxing_checkin::list_wiremock` 通过。

  - [x] 20.3 命令 2：`chaoxing_checkin_submit_common`
    - 入参 `{ active_id }`；内部走 `InflightRegistry::run` → `pre_sign + ppt_sign` → `log_repo::append`
    - _Requirements: Req 4, 16_
    - _DoD_: 顺序重复与并发两路集成测试通过。

  - [x] 20.4 命令 3：`chaoxing_checkin_submit_location`
    - 入参 `{ active_id, latitude: f64, longitude: f64, address: String }`
    - 后端再次调用 `validate_location` 兜底（防桥层绕过）
    - _Requirements: Req 5_
    - _DoD_: wiremock 集成测试覆盖成功 + 非法经纬度两条路径。

  - [x] 20.5 命令 4：`chaoxing_checkin_upload_photo`
    - 入参 `{ image_bytes, mime_type, file_name }`；出参 `{ object_id, thumb_url }`
    - 后端再次 `validate_photo_input`
    - _Requirements: Req 6.4_
    - _DoD_: wiremock 集成测试通过。

  - [x] 20.6 命令 5：`chaoxing_checkin_submit_photo`
    - 入参 `{ active_id, object_id }`；内部 pre_sign + ppt_sign
    - _Requirements: Req 6.6_
    - _DoD_: 集成测试通过。

  - [x] 20.7 Property 10 测试：拍照签到流程依赖
    - **Property 10: 拍照签到流程依赖（metamorphic）**
    - **Validates: Requirements 6.5, 6.6**
    - 文件：`src-tauri/src/commands/chaoxing_checkin.rs` 的 `mod proptest_p10_photo_flow`
    - 断言：`upload_photo` 失败 ⇒ `submit_photo` 调用计数 = 0；成功 ⇒ `object_id` 透传
    - _DoD_: `cargo test proptest_p10_photo_flow` 通过。

  - [x] 20.8 命令 6：`chaoxing_checkin_submit_qrcode`
    - 入参 `{ active_id, enc }`；内部 `qr_pre_sign + ppt_sign`；无任何本地硬编码 `sleep`
    - _Requirements: Req 7.7, 7.8_
    - _DoD_: wiremock 集成测试通过；`rg "sleep\\(10" src-tauri/src/modules/chaoxing_checkin` 无命中。

  - [x] 20.9 命令 7：`chaoxing_checkin_submit_gesture`
    - 入参 `{ active_id, pattern }`；后端再次 `validate_gesture_pattern`；内部 `ppt_sign_with_code`
    - _Requirements: Req 8.4_
    - _DoD_: 集成测试覆盖正/反例。

  - [x] 20.10 命令 8：`chaoxing_checkin_history`
    - 入参 `{ student_id: Option<String>, limit: u32 }`（None 取 `currentStudentId`）；出参 `Vec<CheckinLogEntry>`
    - 调用 `log_repo::query_history`
    - _Requirements: Req 10.3_
    - _DoD_: 单测 + 集成测试通过。

  - [x] 20.11 Property 11 测试：Checkin_Log 保留与查询
    - **Property 11: Checkin_Log 保留与查询**
    - **Validates: Requirements 10.3, 10.5, 10.1**
    - 文件：`modules/chaoxing_checkin/log_repo.rs` 的 `mod proptest_p11_log_retention`
    - _DoD_: `cargo test proptest_p11_log_retention` 通过。

  - [x] 20.12 命令 9：`chaoxing_checkin_parse_qr_url`
    - 入参 `{ url }`；出参 `QrUrlParts`；薄包装 `qr_url::parse`
    - _Requirements: Req 7.5, 15_
    - _DoD_: 命令级 wiremock 无需，只需调 `qr_url::parse` 的 5+ 个样例单测通过。

  - [x] 20.13 命令 10：`chaoxing_checkin_decode_qr_image`（cfg gate）
    - 桌面/移动端：调用 `qr_decode::decode_qr_image`
    - `#[cfg(target_arch = "wasm32")]` 或不支持平台：返回 `PermissionDenied`
    - _Requirements: Req 7.3, 17 P13_
    - _DoD_: `cargo test ... decode_command_desktop_ok` 通过。

  - [x] 20.14 命令 11：`chaoxing_checkin_capture_screen_qr`（cfg gate）
    - 仅在桌面 cfg 下调用 `screen_capture::capture_screen_qr`；其他平台返回 `PermissionDenied`
    - _Requirements: Req 7.4, 17 P13, P14_
    - _DoD_: 桌面平台集成测试通过；非桌面平台返回正确 error_code。

  - [x] 20.15 内部 `chaoxing_checkin_compose_qr_url`（test-only）
    - `#[cfg(any(test, feature = "testing"))] fn chaoxing_checkin_compose_qr_url(...)` 暴露对合函数
    - _Requirements: Req 15.2_
    - _DoD_: 测试编译时可见，release 编译时不可见。

  - [x] 20.16 在 `lib.rs::invoke_handler!` 注册所有 11 条命令
    - 文件：`src-tauri/src/lib.rs`
    - 将 20.2–20.14 的 11 条命令加入 `tauri::generate_handler![...]`
    - _DoD_: `cargo build` 通过；启动后 `invoke('chaoxing_checkin_list', { force_refresh: false })` 可返回空数组或明确错误。

- [x] 21. 清空数据级联
  - _Requirements: Req 13.4_

  - [x] 21.1 实现 `clear_chaoxing_data` 命令
    - 文件：`src-tauri/src/commands/chaoxing_checkin.rs`
    - 内部按 `design.md §9.3` 四步级联：清 cookie → 清签到日志 → 重置内存（inflight registry + list cache）→ 整体 `tokio::time::timeout(Duration::from_secs(2), …)`
    - 在 `lib.rs::invoke_handler` 注册；在 `MeView.vue` 的"退出登录"/"清空数据"触发链中调用（前端接入在视图任务中完成）
    - _DoD_: 集成测试 `clear_chaoxing_data_within_2s` 通过。

- [x] 22. 检查点 - 命令层
  - 确认 20–21 完成；11 条命令全部注册并能被 invoke；命令级 PBT P10/P11 绿灯
  - Ensure all tests pass, ask the user if questions arise.

---

### 8. 前端桥与类型

- [x] 23. 前端类型与桥接层
  - _Requirements: Req 9.1, 11.1, 11.4, 11.5_

  - [x] 23.1 `src/types/chaoxing_checkin.ts`（类型镜像 + CI snapshot 对齐）
    - 文件：`src/types/chaoxing_checkin.ts`
    - 类型：`ActivityType | ActivityStatus | SubmitResult | CheckinErrorCode | CheckinActivity | CheckinSubmitResponse | CheckinLogEntry | QrUrlParts | ScreenRect`（与 `design.md §4.1` 完全一致）
    - 在 `.github/workflows/*.yml` 增加 snapshot 步骤（本任务只产出 TS 文件与脚本 `scripts/check-enum-parity.mjs`），CI 任务由 第 30 章统一配置
    - _DoD_: `pnpm type-check` 通过；脚本 `node scripts/check-enum-parity.mjs` 对比 Rust 枚举与 TS 镜像一致。

  - [x] 23.2 `src/composables/useChaoxingCheckin.ts`
    - 提供 `activities / history / session / inflight / refresh() / dispatchSubmit(a, payload?)`
    - 所有调用经 `invokeNative()`（现有 `utils/platform/native.ts`）
    - 严禁前端裸调 `*.chaoxing.com`
    - _DoD_: `vitest run src/composables/useChaoxingCheckin.spec.ts` 通过。

  - [x] 23.3 `src/composables/useQrScanner.ts`
    - 探测相机可用性：`isTauriRuntime()` + `@capacitor/camera` 权限检查；返回 `{ available, scanOnce() }`
    - _DoD_: 单测覆盖 Tauri / Capacitor / Web 三种分支。

  - [x] 23.4 `src/composables/useGeolocation.ts`
    - 探测定位可用性：`navigator.geolocation` / `@capacitor/geolocation`；返回 `{ available, getCurrent() }`
    - _DoD_: 单测覆盖可用 / 拒绝 / 不支持三种分支。

- [x] 24. 检查点 - 桥与类型
  - 确认 23.1–23.4；枚举镜像 CI 脚本可用
  - Ensure all tests pass, ask the user if questions arise.

---

### 9. 前端视图与模态

- [x] 25. `MoreView` 注册模块卡片
  - _Requirements: Req 1.1, 1.2, 1.3, 1.4_

  - [x] 25.1 在 `MoreView.vue` 的 `DEFAULT_MODULES` 追加 `chaoxing_checkin`
    - `id=chaoxing_checkin`、`kind='internal'`、`view='more_chaoxing_checkin'`、`icon='check-square'`（Heroicons/Lucide）
    - 排序参数使 `order ≤ 2`
    - 卡片徽章：`connected=true` → `TStatusBadge(success, '已就绪')`；否则 `TStatusBadge(warning, '需登录')`
    - 点击 emit `navigate('more_chaoxing_checkin')`；路由器在 `App.vue` 接入 `MoreChaoxingCheckinView`
    - _DoD_: `vitest run src/components/MoreView.spec.ts` 断言 `chaoxing_checkin` 在 DEFAULT_MODULES 首两项；手动启动可见卡片。

- [x] 26. `MoreChaoxingCheckinView` 容器与子组件
  - _Requirements: Req 1.5, 1.6, 2.5, 3, 9.3, 10.4, 12_

  - [x] 26.1 `MoreChaoxingCheckinView.vue` 骨架
    - 目录：`src/components/`
    - 骨架仅由 T* 组件组装：`TPageHeader`、`TSection`、`TCard`、`TStatusBadge`、`TEmptyState`、`TModal`
    - 注入 `useChaoxingCheckin`；按 `active / pending / signed / expired` 分区渲染
    - 引入子组件：`SessionStatusBanner`、`CheckinActivityCard`、`CheckinHistoryList`、4 个模态
    - _Requirements: Req 1.6, 12.1_
    - _DoD_: Vue 组件单测断言无裸 `<div class="card">` 自绘卡片。

  - [x] 26.2 `SessionStatusBanner.vue`
    - 目录：`src/components/chaoxing_checkin/`
    - `session.connected=false` 时显示登录引导（三入口：SSO / 密码 / 扫码，复用 `LoginV3.vue` 的学习通模态）
    - 收到 `error_code='session_expired'` 时显示 `TModal` "会话已过期，是否重新登录？"
    - _Requirements: Req 2.5, 9.3_
    - _DoD_: 组件单测覆盖 connected/disconnected/expired 三态。

  - [x] 26.3 `CheckinActivityCard.vue`
    - 基于 `TCard + TStatusBadge`；按 `activity_type` 决定"立即签到"按钮的 modal
    - "进行中"首项高亮 `TStatusBadge(info, '进行中')`
    - _Requirements: Req 3.4, 4.1_
    - _DoD_: 组件单测。

  - [x] 26.4 `CheckinHistoryList.vue`
    - 调 `chaoxing_checkin_history`；使用 `TCard + TStatusBadge` 展示；`student_id` 通过 `mask_student_id`（前端镜像）脱敏
    - _Requirements: Req 10.4, 13.3_
    - _DoD_: 组件单测。

- [x] 27. 签到模态（4 个）
  - _Requirements: Req 5, 6, 7, 8_

  - [x] 27.1 `LocationCheckinModal.vue`
    - 三入口：手动输入 / 历史选取 / 系统定位（`useGeolocation`）
    - 前端拦截 `lat ∈ [-90,90]`、`lng ∈ [-180,180]`、`addr.length ∈ [1,80]`
    - 提交：`invokeNative('chaoxing_checkin_submit_location', …)`
    - _Requirements: Req 5.1–5.7_
    - _DoD_: 组件单测覆盖非法经纬度拦截。

  - [x] 27.2 `PhotoCheckinModal.vue`
    - 两入口：从相册选择 / 拍照；平台不支持的置灰
    - 前端拦截 MIME ∈ {jpeg,png,webp}、size ≤ 5MB
    - 流程：`invokeNative('chaoxing_checkin_upload_photo', …)` → 成功后 `invokeNative('chaoxing_checkin_submit_photo', …)`
    - _Requirements: Req 6.1–6.7_
    - _DoD_: 组件单测覆盖"上传失败不触发 submit_photo"（P10 对应的前端行为）。

  - [x] 27.3 `GestureCheckinModal.vue`
    - 九宫格手势盘 + 数字输入
    - 前端拦截 len ∈ [4,9]、字符 ∈ '1'..'9'、不重复
    - 提交期间按钮 disabled
    - _Requirements: Req 8.1–8.6_
    - _DoD_: 组件单测。

  - [x] 27.4 `QrCheckinModal.vue` 与 `QrScreenSelectOverlay.vue`
    - 四入口：相机 / 选择图片 / 屏幕区域截图 / 粘贴 URL（使用 `useQrScanner` + `isTauriRuntime()` 判断可用性）
    - `QrScreenSelectOverlay.vue`：全屏透明浮层，鼠标拖拽产生 `rect{x,y,w,h}`，按 DPR 换算逻辑像素
    - 提交前若解析得到的 `active_id` 与当前活动不一致 → 提示"二维码与活动不匹配，请确认"，不调用 submit
    - _Requirements: Req 7.1–7.10_
    - _DoD_: 组件单测覆盖四入口；Playwright 视觉回归在任务 31 统一补。

- [x] 28. 检查点 - 前端视图
  - 确认 25–27 完成；手动冒烟进入页面、弹起四类模态可正常调用 Tauri 命令
  - Ensure all tests pass, ask the user if questions arise.

---

### 10. 设计系统合规

- [ ] 29. 设计系统合规校验
  - _Requirements: Req 12.1–12.7_

  - [x] 29.1 stylelint/grep 规则
    - 新增/扩展 `.stylelintrc.*`：禁止硬编码 hex（`color-no-hex`），强制走 `--ui-*` tokens
    - 新增 grep 脚本 `scripts/check-design-tokens.mjs`：
      - 扫描 `src/components/MoreChaoxingCheckinView.vue` 与 `src/components/chaoxing_checkin/**`
      - 禁止 `#[0-9a-fA-F]{3,8}` 十六进制色值、禁止硬编码 `rem`/`px` 字号、禁止硬编码 box-shadow 值
    - _Requirements: Req 12.2_
    - _DoD_: `pnpm lint:style`、`node scripts/check-design-tokens.mjs` 均通过。

  - [ ] 29.2 响应式与无障碍断点断言
    - Playwright 视觉用例（在任务 31 扩展）覆盖 375/768/1024/1440 四档 + 深色模式
    - 可点击元素具备 `cursor: pointer` + `:focus-visible`；`@media (prefers-reduced-motion: reduce)` 下动画降级
    - _Requirements: Req 12.4, 12.5, 12.6_
    - _DoD_: 视觉快照通过；无障碍断言在 `src/components/chaoxing_checkin/**.spec.ts` 中有显式覆盖。

- [x] 30. 检查点 - 设计系统
  - 确认 29.1–29.2；stylelint 与 grep 零告警
  - Ensure all tests pass, ask the user if questions arise.

---

### 11. 隐私与安全

- [ ] 31. 前端日志脱敏与 grep
  - _Requirements: Req 13.5, 13.6_

  - [x] 31.1 前端脱敏工具镜像
    - 文件：`src/utils/mask.ts`（`maskStudentId`）、`src/utils/truncate.ts`（`truncateSensitive`）
    - 在 `useChaoxingCheckin` 与模态的 `pushDebugLog`/`console.log` 调用位置统一使用
    - _DoD_: `vitest run src/utils/mask.spec.ts src/utils/truncate.spec.ts` 通过。

  - [x] 31.2 CI grep：禁止前端裸调超星域 + 敏感字段落日志
    - 扩展 `scripts/check-frontend-safety.mjs`：
      - `fetch\(['"]https?://[^'"]*chaoxing\.com` 必须 0 命中（`src/**/*`）
      - `console\.log\([^)]*(cookie|enc|object_id|student_id)` 必须 0 命中
      - `sleep\(10` 在 `src-tauri/src/modules/chaoxing_checkin/**` 必须 0 命中
    - _Requirements: Req 7.8, Req 11.5, Req 13.2, 13.5_
    - _DoD_: `node scripts/check-frontend-safety.mjs` 零告警。

- [x] 32. 检查点 - 隐私与安全
  - 确认 31.1–31.2；白名单 + 脱敏 + 清空数据级联（第 21 章）统一验证
  - Ensure all tests pass, ask the user if questions arise.

---

### 12. 测试（集成 / 前端 PBT / 视觉回归）

- [ ] 33. Rust 集成测试（wiremock）
  - _Requirements: Req 2.2, 3.1, 4, 5, 6, 7, 8, 9.3, 10.3, 18.4_

  - [ ] 33.1 协议端点契约测试
    - 文件：`src-tauri/tests/chaoxing_checkin_protocol.rs`
    - 覆盖：`list_activities / list_clazz / pre_sign / ppt_sign / ppt_sign_with_code / upload_photo / qr_pre_sign`
    - 至少 3 个样本/端点（成功、失败、边界）
    - _DoD_: `cargo test --test chaoxing_checkin_protocol` 通过。

  - [ ] 33.2 会话自愈集成
    - 文件：`src-tauri/tests/chaoxing_checkin_session_selfheal.rs`
    - 场景：wiremock 返回 302 → authserver/login；断言命令返回 `session_expired` 且 DB `connected=false`
    - _Requirements: Req 9.3_
    - _DoD_: 测试通过。

- [ ] 34. TypeScript PBT 镜像（fast-check）
  - _Requirements: Req 7.5, 15, 13.3, 13.5_

  - [ ] 34.1 前端 QR URL round-trip
    - 文件：`src/types/__tests__/qr_url.fast-check.spec.ts`
    - 若前端实现了 `parse/compose` 镜像（否则跳过）
    - _DoD_: `vitest run src/types/__tests__/qr_url.fast-check.spec.ts` 通过。

  - [ ] 34.2 前端校验器与脱敏镜像
    - 文件：`src/utils/__tests__/mask.fast-check.spec.ts`、`truncate.fast-check.spec.ts`、`validate_location.fast-check.spec.ts`、`validate_gesture.fast-check.spec.ts`、`validate_photo.fast-check.spec.ts`
    - 每个 property 至少 100 runs
    - _DoD_: `vitest run` 通过。

- [ ] 35. Vue 组件单测 + Playwright 视觉回归
  - _Requirements: Req 12.5, 12.6_

  - [ ] 35.1 组件单测
    - 覆盖 `MoreView.vue`、`MoreChaoxingCheckinView.vue` 及 `src/components/chaoxing_checkin/**`
    - _DoD_: `vitest run` 全部通过。

  - [ ] 35.2 Playwright 视觉回归
    - 文件：`tests/visual/chaoxing-checkin.spec.ts`
    - 断点：375 / 768 / 1024 / 1440；模式：亮色 / 深色
    - _DoD_: `pnpm playwright test tests/visual/chaoxing-checkin.spec.ts` 通过。

- [ ] 36. 检查点 - 测试
  - 确认 33–35；所有必做测试绿灯；可选 PBT 已启用的亦绿灯
  - Ensure all tests pass, ask the user if questions arise.

---

### 13. 构建与 CI

- [ ] 37. 构建与 CI 规则
  - _Requirements: Req 11.6, 12, 13, 18_

  - [x] 37.1 clippy 严格模式
    - 在 `src-tauri/Cargo.toml` 或 `clippy.toml` 启用 `-D warnings`、`clippy::unwrap_used`、`clippy::expect_used`（测试模块允许）
    - CI：`cargo clippy --all-targets -- -D warnings`
    - _Requirements: Req 6.3（兜底）_
    - _DoD_: CI `clippy` 绿灯。

  - [x] 37.2 CI grep 集合
    - 新增/扩展 `.github/workflows/lint.yml`：
      - 所有 `modules/chaoxing_checkin/*.rs` 与 `qr_url.rs/protocol.rs` 头部包含 SPDX + Attribution
      - 前端零裸调 `*.chaoxing.com`
      - `src-tauri/src/modules/chaoxing_checkin/` 内零出现被排除端点关键字：`record_page`、`homework`、`vote`、`face`、`yuketang`
      - 前端零出现 `console.log(cookie|enc|object_id|student_id)`
    - _Requirements: Req 18.2, 18.6, 19, 11.5, 13.5_
    - _DoD_: CI `lint` 作业全绿。

  - [x] 37.3 Capacitor `npx cap sync` 门禁
    - CI：`npx cap sync` 失败即阻塞 merge
    - _Requirements: Req 11.6_
    - _DoD_: CI `capacitor-sync` 作业全绿。

- [x] 38. 检查点 - CI
  - 确认 37.1–37.3；本地与 CI 双通
  - Ensure all tests pass, ask the user if questions arise.

---

### 14. 文档与验收

- [ ] 39. 文档终稿与 E2E 冒烟
  - _Requirements: Req 1.1, 1.2, 18.2, 18.3, 18.5_

  - [x] 39.1 完成 `docs/chaoxing-protocol.md`
    - 补齐 5 个端点章节（入参 / 响应 / upstream ref）
    - `## Upstream Sync Log` 追加首行：`| YYYY-MM-DD | <course_helper commit> | 初始移植 | <reviewer> |`
    - _DoD_: `rg "初始移植" docs/chaoxing-protocol.md` 命中。

  - [x] 39.2 `THIRD_PARTY_NOTICES.md` 终稿校对
    - 与 `design.md §10.2` 逐字对齐
    - _DoD_: `rg "AneryCoft/course_helper" THIRD_PARTY_NOTICES.md` 命中；人工评审确认。

  - [ ] 39.3 E2E 冒烟测试
    - 文件：`tests/e2e/chaoxing-checkin.smoke.spec.ts`
    - 断言：
      1. 启动后 `DEFAULT_MODULES` 含 `chaoxing_checkin`
      2. `cargo build` 输出的 `modules/chaoxing_checkin/**.rs` 头部保留 SPDX + Attribution
      3. `THIRD_PARTY_NOTICES.md` 含 `course_helper` 条目
    - _Requirements: Req 1.1, 1.2, 18.2, 18.3_
    - _DoD_: `pnpm playwright test tests/e2e/chaoxing-checkin.smoke.spec.ts` 通过。

- [x] 40. 最终检查点 - 工作流完成
  - 确认全部 1–39 任务完成；所有测试与 CI 绿灯
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- 带 `*` 的子任务为可选测试（PBT / 视觉回归 / 前端 fast-check 镜像），可在 MVP 阶段跳过，但**推荐实现**以覆盖 `design.md §5` 的 18 条 Correctness Properties。
- 顶层任务（1–40）不含 `*` 后缀，必须全部实现。
- 每条任务的 Requirements 引用精确到子条款号，便于追溯。
- 带 `Properties:` 的任务显式引用 `design.md §5` 中的属性编号与被验证需求。
- 任务依赖链：1 → 2 → 3 → 4 → 5 → … → 40（同一编号内的子任务允许并行，跨编号串行）。
- 本工作流**仅产出 Spec 与计划文档**。真正的编码实现请用户在 `tasks.md` 中点击 "Start task" 启动。
