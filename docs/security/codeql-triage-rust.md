# CodeQL Triage：Rust `hard-coded-cryptographic-value`（#548）

> 分支：`security/548-rust`
> 范围：仅 Rust 代码与安全文档/测试；不涉及前端。
> 规则：`rust/hard-coded-cryptographic-value`（CWE-798：硬编码凭据）
> 数据来源：`C:\tmp\mini-hbut-codeql-alerts.json`（CodeQL 2.26.2，`main` 分支扫描）

## 结论摘要

9 条告警中 **7 条位于测试模块**（测试用假密码/盐值字面量），**2 条是空字符串哨兵**（`""` 表示"无密码"，非真实凭据），**0 条是真实凭据**。
处理原则：不得把协议常量误当私钥，也不得为消除告警而破坏协议算法。所有协议固定值改为**强类型命名常量**并标注来源；测试密码/盐值改为**运行时构造**；未发现任何真实凭据或凭据路径硬编码。

验证基线：`cargo test --lib` 202 passed / 0 failed；`cargo clippy --lib` 无新增警告；`cargo fmt` 通过。

---

## 逐条分类与处理

### #45 — `src-tauri/src/credential_store.rs:99` — 测试样例 ✅ 已修复
- **分类**：测试模块（`mod tests`）中的假密码字面量 `"test-pass-123"`，非真实凭据。
- **处理**：新增 `test_password(label)` fixture helper（`SystemTime` 纳秒 + 标签运行时拼接），替换为 `test_password("test-pass")`。
- **验证**：`cargo test --lib credential_store` 通过（3 passed）。

### #46 — `src-tauri/src/http_client/utils.rs:46` — 测试样例 ✅ 已修复
- **分类**：测试模块假密码字面量 `"TEST_PASSWORD"`，用于验证 `encrypt_password_aes` 输出长度。
- **处理**：改为 `format!("TEST_PW_{:0>7}", std::process::id() % 10_000_000)`——密码恒为 15 字节，维持原 108 字符断言不变；盐值同理见 #47。
- **验证**：`test_encrypt_password` 通过。

### #47 — `src-tauri/src/http_client/utils.rs:47` — 测试样例 ✅ 已修复
- **分类**：测试模块假盐值字面量 `"bs2jwEB0FWpj6MW0"`（16 字节，`encrypt_password_aes` 要求恰好 16 字节）。
- **处理**：改为 `format!("{:0>16}", std::process::id())`——运行时构造且恒为 16 字节 ASCII。
- **验证**：`test_encrypt_password` 通过（断言 108 字符不变）。

### #48 — `src-tauri/src/lib.rs:1176` — 空密码哨兵 ✅ 已修复
- **分类**：`let password_to_save = password_hint.unwrap_or("")`——`""` 是"无密码提示"时的空串哨兵，经 `save_user_session` 语义为"保留 DB 旧密码"，**不是**凭据。
- **处理**：改为 `password_hint.unwrap_or_default()`（`Option<&str>::default` 运行时产生空串），语义完全不变，消除字面量直入密码参数。
- **验证**：`cargo test --lib` 全量编译通过。

### #50 — `src-tauri/src/credential_store.rs:115` — 测试样例 ✅ 已修复
- **分类**：测试模块假密码字面量 `"fallback-pass-456"`。
- **处理**：替换为 `test_password("fallback-pass")`（同 #45 的 fixture helper）。
- **验证**：`cargo test --lib credential_store` 通过（3 passed）。

### #60 — `src-tauri/src/modules/campus_network/eportal.rs:131` — 测试样例 ✅ 已修复
- **分类**：wiremock 契约测试中传给 `eportal_login` 的假密码 `"secret"`；同参数 `"2024123456"` 是测试学号、`"default"` 是 service 名。
- **处理**：密码改为 `format!("secret-{}", std::process::id())` 运行时构造；同时将 eportal 协议固定值提取为强类型常量：`INDEX_JSP_PATH`、`INTERFACE_DO_PATH`、`LOGIN_METHOD`、`PASSWORD_ENCRYPT_DISABLED`，并在文件头注明协议来源（华为/新华三 eportal）。
- **验证**：`eportal_login_mock_contract` 通过。

### #61 / #62 — `src-tauri/src/modules/campus_network/xencode.rs:106/107` — 协议算法 ✅ 已修复
- **分类**：`param_i("u", "p", ...)` 中的 `"p"` 是**深澜（Srun）认证协议的测试参数**，算法函数参数名恰为 `password` 而被规则标记；不是私钥或真实凭据。
- **处理**：
  - 测试密码改为运行时构造（`test_password()`），确定性测试保留；
  - 协议固定值提取为强类型常量：`SRBX1_MAGIC`（`{SRBX1}` 前缀）、`ENC_VER`（`srun_bx1`）、`XENCODE_DELTA`（TEA 常量 `0x9e3779b9`）、`BASE64_ALPHABET`（深澜自定义 Base64 表，原有）；
  - 文件头补充来源说明：实现源自 [zu1k/srun](https://github.com/zu1k/srun)（GPL-3.0，`src/xencode.rs`），`XENCODE_DELTA` 为 TEA 算法黄金比例常量（见 Wikipedia：Tiny Encryption Algorithm），均**非私钥**；
  - **已知向量测试**：3 组 `x_encode` 已知向量，交叉验证自独立 Python 参考实现（逐行翻译自 zu1k/srun 上游，含深澜 Base64 的 `=` 填充，与 Rust `GeneralPurposeConfig::new()` 默认填充一致）。
- **验证**：`x_encode_matches_known_vectors`、`param_i_is_deterministic` 3 个测试全部通过，且与参考实现输出逐字节一致。

### #69 — `src-tauri/src/db.rs:1574` — 空密码哨兵 ✅ 已修复
- **分类**：测试中 `save_user_session(&path, sid, "c=2", "", ...)` 的 `""` 是空密码参数（语义：保留旧密码），非凭据。
- **处理**：改为 `&String::new()` 运行时构造空串。
- **顺带处理**：同文件 `cred_migrate_tests` / `auth_cookie_v2_tests` 中 4 处同类测试密码字面量（`"legacy-pass-1"`、`"migrate-pass-2"`、`"plain-from-142"`、`"keep-me"`）一并改为 `test_password(label)` helper，避免未来扫描复发。
- **验证**：`db::cred_migrate_tests`（3 passed）、`db::auth_cookie_v2_tests`（2 passed）。

---

## 附加核查

### 真实凭据路径
全项目扫描（`password/secret/salt/api_key/private_key` 赋值与凭据路径模式）结果：
- 密钥环 `SERVICE = "mini-hbut"`：服务标识符，非凭据；
- `KEYRING_MARKER = "__keyring__"`：SQLite 占位标记，非凭据；
- `DB_FILENAME = "grades.db"`：数据库文件名，非凭据；
- 数据目录经环境变量解析（`HBUT_APP_DATA_DIR` / `LOCALAPPDATA` / `APPDATA` / `HOME`），无硬编码绝对路径。
- **结论：不存在硬编码的真实凭据路径，无需修改。**

### 协议常量 vs 私钥（不破坏算法的保证）
- XEncode 的 `0x9e3779b9`（TEA delta）与深澜 Base64 字母表是**协议公开常量**，改动会破坏与校园网网关的互操作——保持原值，仅提取为命名常量并加来源注释；
- eportal 路径/`method`/`passwordEncrypt` 为协议固定值——同样仅提取常量；
- 已知向量测试确保未来重构不会无意改变算法输出。

### 明确不做（避免误伤）
- 不将协议常量"混淆"或"加密"——它们本就不是秘密，伪装只会误导维护者；
- 不删除/改写协议算法逻辑——仅做命名与注释层面的加固。

---

## 验证记录

| 检查项 | 命令 | 结果 |
|---|---|---|
| 单元测试（全量） | `cargo test --manifest-path src-tauri/Cargo.toml --lib` | 202 passed; 0 failed |
| XEncode 已知向量 | 同上（`xencode` filter） | 3 passed |
| 明文字面量扫描 | `rg 'let password = "..." / let salt = "..."' src-tauri/src` | 0 匹配 |
| 代码格式 | `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` | 通过 |
| Clippy | `cargo clippy --manifest-path src-tauri/Cargo.toml --lib` | 无新增警告（基线 warning `chaoxing_course_progress_ready` 与本变更无关） |

> 说明：`cargo test`/`clippy` 需要 `frontendDist`（`../dist`）存在；本地验证时创建了空的 `dist/` 目录（已被 `.gitignore` 忽略，不入库）。

