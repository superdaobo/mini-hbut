# Security Policy

## Supported Versions

| Version | Supported |
| ------- | --------- |
| 1.4.x   | ✅        |

## Reporting a Vulnerability

请勿在公开 Issue 中披露可利用的安全细节。

1. 在 GitHub 使用 **Security Advisories → Report a vulnerability** 私下报告，或
2. 通过仓库维护者认可的私有渠道联系。

请尽量包含：影响版本、复现步骤、预期与实际行为、是否涉及凭证或远程代码执行。

我们会在确认后尽快回复，并在修复发布前协调披露时间。

## Security Practices (Mini-HBUT)

- **密码存储**：用户密码保存在操作系统密钥环（`keyring`），SQLite 不保存可逆密码。
- **TLS**：Release 构建默认校验证书；仅 Debug 或显式设置 `MINI_HBUT_INSECURE_TLS=1` 时放宽。
- **本地 HTTP Bridge（:4399）**：桌面 Release 默认不启动，启用需 `HBUT_HTTP_BRIDGE_ENABLED=1`；**Tauri iOS Release 为内嵌小游戏/学校官网默认开启** loopback Bridge。敏感路由需 `HBUT_BRIDGE_TOKEN`。
- **调试接口**：`debug.enable_bridge_tools` 等能力仅在受控调试环境使用，勿在生产分发包中开启。
- **签名密钥**：Android 发布密钥仅通过 CI Secrets 注入，勿提交 `.jks` / `keystore-base64.txt`。

## 质量门禁（DevSecOps）

| 工具 | 作用 | 配置位置 |
| ---- | ---- | -------- |
| **GitHub Actions (CI)** | push/PR 时自动构建、测试、fmt/clippy | [`.github/workflows/ci.yml`](.github/workflows/ci.yml) |
| **CodeQL** | 静态安全扫描（JS/TS、Rust、Actions workflow） | [`.github/workflows/codeql.yml`](.github/workflows/codeql.yml) |
| **Dependabot** | 依赖版本升级 PR + 已知 CVE 安全告警 | [`.github/dependabot.yml`](.github/dependabot.yml) |

### Dependabot 说明

- **Version updates**：按 `dependabot.yml` 每周自动开依赖升级 PR（默认忽略 major，降低破坏性）。
- **Security alerts**：在 **Security → Dependabot** 查看已知漏洞；与版本升级 PR 不同，需单独关注高危 CVE。
- **Security updates**（若已启用）：Dependabot 会为部分 CVE 自动开修复 PR。

合并依赖或安全修复 PR 前，请确认 **CI** 与 **CodeQL** 均通过。
