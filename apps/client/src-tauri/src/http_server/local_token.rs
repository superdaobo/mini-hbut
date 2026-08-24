//! 本机 Agent 令牌生命周期（#698）。
//!
//! 契约：
//! - 令牌文件固定为 `%APPDATA%/mini-hbut/local-agent-token`，内容为 64 位小写 hex；
//! - App 启动时缺失则生成并写入；存在且格式合法则复用（持久化保证外部 Agent 引用稳定）；
//! - 文件存在但内容非法（非 64 位小写 hex）时重置为新令牌；
//! - 目录不存在则创建。
//!
//! 该令牌仅用于本机 HTTP Bridge `/local/*` 只读数据端点族门禁
//! （请求头 `Authorization: LocalToken <hex>`）；Bridge 本身仍只绑定 127.0.0.1。

use rand::RngCore;
use std::path::{Path, PathBuf};
use std::sync::Arc;

/// 令牌文件所在目录名（契约固定：`%APPDATA%/mini-hbut/`）。
const LOCAL_AGENT_TOKEN_DIR: &str = "mini-hbut";

/// 令牌文件名（契约固定）。
const LOCAL_AGENT_TOKEN_FILE: &str = "local-agent-token";

/// 解析令牌文件路径（契约默认 + 测试/高级部署可覆盖）。
///
/// 优先级：
/// 1. `HBUT_LOCAL_AGENT_TOKEN_PATH` 显式指定完整文件路径；
/// 2. `%APPDATA%/mini-hbut/local-agent-token`（非 Windows 依次回退
///    `LOCALAPPDATA` / `HOME`，仅作兜底，契约面向 Windows 桌面）。
pub(crate) fn local_agent_token_path() -> Option<PathBuf> {
    if let Ok(raw) = std::env::var("HBUT_LOCAL_AGENT_TOKEN_PATH") {
        let path = PathBuf::from(raw.trim());
        if !path.as_os_str().is_empty() {
            return Some(path);
        }
    }
    let base = std::env::var("APPDATA")
        .or_else(|_| std::env::var("LOCALAPPDATA"))
        .or_else(|_| std::env::var("HOME"))
        .ok()?;
    Some(
        PathBuf::from(base)
            .join(LOCAL_AGENT_TOKEN_DIR)
            .join(LOCAL_AGENT_TOKEN_FILE),
    )
}

/// 校验令牌文本：64 位小写 hex（0-9 a-f）。
fn is_valid_local_agent_token(text: &str) -> bool {
    text.len() == 64
        && text
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// 生成新令牌：32 随机字节 → 64 位小写 hex。
fn generate_local_agent_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::thread_rng().fill_bytes(&mut bytes);
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// 在指定路径确保令牌文件存在并返回令牌（纯路径参数化，便于单测）：
/// - 缺失 / 内容非法 → 生成新令牌并以 tmp+rename 原子写入（#550 同款，避免写一半被读取）；
/// - 存在且格式合法 → 原样复用（外部 Agent 长期引用稳定）。
fn ensure_local_agent_token_at(path: &Path) -> std::io::Result<String> {
    if let Ok(existing) = std::fs::read_to_string(path) {
        let token = existing.trim();
        if is_valid_local_agent_token(token) {
            return Ok(token.to_string());
        }
    }

    let token = generate_local_agent_token();
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent)?;
        }
    }
    let tmp = path.with_extension(format!("tmp.{}", std::process::id()));
    std::fs::write(&tmp, &token)?;
    // Windows 上 rename 使用 MOVEFILE_REPLACE_EXISTING，可覆盖非法旧文件
    std::fs::rename(&tmp, path)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(token)
}

/// 启动入口：确保本机 Agent 令牌可用；失败仅告警并返回 None，
/// 此时 `/local/*` 端点因 expected 为空而一律拒绝（fail closed）。
pub(crate) fn ensure_local_agent_token() -> Option<Arc<str>> {
    let path = local_agent_token_path()?;
    match ensure_local_agent_token_at(&path) {
        Ok(token) => Some(Arc::from(token)),
        Err(error) => {
            eprintln!(
                "[HTTP] 本机 Agent 令牌初始化失败（/local 端点将拒绝访问）path={}: {}",
                path.display(),
                error
            );
            None
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 合法令牌判定：64 位小写 hex 通过，其余（大写 / 超长 / 过短 / 非 hex）拒绝。
    #[test]
    fn token_format_validation_accepts_only_64_lowercase_hex() {
        assert!(is_valid_local_agent_token(&"a".repeat(64)));
        assert!(is_valid_local_agent_token(&"0123456789abcdef".repeat(4)));

        assert!(!is_valid_local_agent_token(&"A".repeat(64))); // 大写非法
        assert!(!is_valid_local_agent_token(&"g".repeat(64))); // 非 hex 字符
        assert!(!is_valid_local_agent_token(&"a".repeat(63))); // 少一位
        assert!(!is_valid_local_agent_token(&"a".repeat(65))); // 多一位
        assert!(!is_valid_local_agent_token("")); // 空
    }

    /// 生成器输出恒满足格式契约（64 位小写 hex）。
    #[test]
    fn generated_token_is_64_lowercase_hex() {
        let token = generate_local_agent_token();
        assert!(
            is_valid_local_agent_token(&token),
            "生成结果必须合法: {token}"
        );
        assert_ne!(generate_local_agent_token(), token, "随机令牌不应重复");
    }

    /// 生命周期冒烟：缺失 → 生成并写入；再次调用 → 复用同一令牌；
    /// 写入非法内容 → 重置为新合法令牌。目录不存在时自动创建。
    #[test]
    fn ensure_token_creates_reuses_and_resets_file() {
        let dir = std::env::temp_dir().join(format!(
            "hbut_local_token_test_{}_{:?}",
            std::process::id(),
            std::thread::current().id()
        ));
        let path = dir.join("nested").join("local-agent-token");
        let _ = std::fs::remove_dir_all(&dir);

        // 缺失 → 生成并写入
        let first = ensure_local_agent_token_at(&path).expect("首次生成应成功");
        assert!(is_valid_local_agent_token(&first));
        assert_eq!(std::fs::read_to_string(&path).unwrap(), first);

        // 存在且合法 → 复用（持久化保证外部 Agent 引用稳定）
        let second = ensure_local_agent_token_at(&path).expect("复用应成功");
        assert_eq!(second, first);

        // 内容非法 → 重置为新合法令牌
        std::fs::write(&path, "not-a-valid-token").unwrap();
        let third = ensure_local_agent_token_at(&path).expect("重置应成功");
        assert!(is_valid_local_agent_token(&third));
        assert_ne!(third, first);

        // 清理临时目录
        let _ = std::fs::remove_dir_all(&dir);
    }
}
