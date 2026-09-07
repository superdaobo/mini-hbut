// deep_link_register.rs
//
// #809：Windows dev 深链注册守卫。
//
// 背景（根因）：tauri-plugin-deep-link 的 `register()` 在 Windows 上会无条件写入
// `HKCU\Software\Classes\{protocol}\shell\open\command = "{current_exe}" "%1"`。
// 旧实现（#621）在 dev 启动时直接 `register_all()`，导致每次 dev 启动都把
// minihbut:// 协议关联劫持到 debug exe（内嵌 devUrl localhost:5173）：
// vite 未运行时，门户深链唤起 = 空白窗口；且会覆写 NSIS 安装版写入的同一 HKCU 键。
//
// 方案：写操作仍调用插件 `register()`（与上游行为一致），守卫只做「读 + 比对 + 决策」：
// - 键不存在（首次 dev 使用）→ 注册；
// - 值指向当前 exe（dev 自身写入，大小写/引号已规范化）→ 幂等注册；
// - 值指向其他 exe（用户的正式安装版等）→ 跳过并打日志，不覆盖。
//
// fail-open 取舍：注册表「读失败」（键不存在 / 权限不足 / 类型不符）一律视为
// 「未注册」回退到注册（dev 历史默认行为）。因为读失败大概率就是键不存在，
// 而 dev 注册 debug exe 的代价（可手动删键恢复）远小于 dev 完全无法注册的困惑。
// 但「键存在且值解析不出 exe 路径」不算读失败——未知内容一律保守跳过（fail-closed）。
//
// scheme 列表契约：插件未公开「读取已配置 schemes」的 API，因此本模块用常量
// `DESKTOP_SCHEMES` 与 tauri.conf.json 的 plugins.deep-link.desktop.schemes 保持
// 一致，由本文件底部契约测试强制（与前端 deep_link_config_contract.spec.ts 呼应）。

/// Windows dev 深链注册的 scheme 白名单。
/// 必须与 `apps/client/src-tauri/tauri.conf.json` 的
/// `plugins.deep-link.desktop.schemes` 完全一致（契约测试强制）。
#[cfg(any(test, target_os = "linux", all(debug_assertions, windows)))]
pub const DESKTOP_SCHEMES: &[&str] = &["minihbut"];

/// 守卫决策结果。
#[cfg(any(test, target_os = "linux", all(debug_assertions, windows)))]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RegistrationDecision {
    /// 注册表无既有关联（或即当前 exe 写入的键）→ 允许插件注册 / 幂等重写。
    Register,
    /// 注册表已指向其他 exe（如正式安装版）→ 跳过，不覆盖。
    Skip,
}

/// 从协议 command 值（如 `'"C:\path\exe" "%1"'`）提取 exe 路径片段。
///
/// - 带引号：取首对引号内内容（标准 NSIS / 插件写法）；
/// - 无引号：截取到第一个空白字符。注意：无引号路径本身含空格时存在固有歧义，
///   截断会导致与 current_exe 不匹配 → 决策为 Skip（保护方向安全，最多是不注册）。
/// - 空串 / 无法解析 → None。
#[cfg(any(test, target_os = "linux", all(debug_assertions, windows)))]
pub fn extract_exe_path_from_command(command: &str) -> Option<&str> {
    let command = command.trim();
    if command.is_empty() {
        return None;
    }
    if let Some(rest) = command.strip_prefix('"') {
        let end = rest.find('"')?;
        Some(&rest[..end])
    } else {
        let end = command.find([' ', '\t']).unwrap_or(command.len());
        Some(&command[..end])
    }
}

/// 规范化 exe 路径用于比较：去引号与首尾空白、剥 `\\?\` / `\\?\UNC\` 前缀、
/// 统一 `/` 为 `\`、ASCII 小写（Windows 路径大小写不敏感；用 ASCII 小写避免
/// 非 ASCII 区域设置的大小写陷阱）。
#[cfg(any(test, target_os = "linux", all(debug_assertions, windows)))]
pub fn normalize_exe_path(raw: &str) -> String {
    let trimmed = raw.trim().trim_matches('"').trim();
    // std::env::current_exe() 可能返回带 `\\?\` 前缀的路径；插件写入用的是
    // dunce::simplified 后的普通形式，比较前必须剥掉前缀。
    let without_prefix = if let Some(rest) = trimmed.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = trimmed.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        trimmed.to_string()
    };
    without_prefix.replace('/', "\\").to_ascii_lowercase()
}

/// 守卫决策：输入注册表现有 command 值（None = 键不存在 / 读取失败）与
/// 当前 exe 路径，输出是否允许注册。
///
/// - None → Register（fail-open：键不存在是读失败的常态，见模块头注释）；
/// - Some(值) 且解析不出 exe → Skip（fail-closed：未知内容不覆盖）；
/// - Some(值) 且 exe 与当前 exe 规范化后相同 → Register（dev 幂等重写自身）；
/// - Some(值) 且指向其他 exe → Skip。
#[cfg(any(test, target_os = "linux", all(debug_assertions, windows)))]
pub fn decide_registration(
    existing_command: Option<&str>,
    current_exe: &str,
) -> RegistrationDecision {
    let Some(command) = existing_command else {
        return RegistrationDecision::Register;
    };
    let Some(exe) = extract_exe_path_from_command(command) else {
        // 键存在但内容为空 / 损坏：不属于「读失败」，保守跳过，不覆盖未知键。
        return RegistrationDecision::Skip;
    };
    if normalize_exe_path(exe) == normalize_exe_path(current_exe) {
        RegistrationDecision::Register
    } else {
        RegistrationDecision::Skip
    }
}

/// 读取当前用户 `HKCU\Software\Classes\{scheme}\shell\open\command` 的默认值。
/// 任何失败（不存在 / 权限 / 类型不符）都返回 None，由决策层按 fail-open 处理。
#[cfg(all(target_os = "windows", debug_assertions))]
fn read_hkcu_open_command(scheme: &str) -> Option<String> {
    use windows_registry::CURRENT_USER;
    let path = format!(r"Software\Classes\{scheme}\shell\open\command");
    match CURRENT_USER.open(&path) {
        Ok(key) => key.get_string("").ok(),
        Err(_) => None,
    }
}

/// setup 阶段的深链注册入口（平台门控与旧 `register_all()` 一致）：
/// - Linux：保持插件 `register_all()`（注册 .desktop 文件，无 HKCU 篡改问题）；
/// - Windows dev：逐 scheme 走注册守卫；
/// - Windows release / macOS / 移动端：本函数不参与编译（生产注册由安装器完成）。
#[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
pub fn register_with_guard<R: tauri::Runtime>(app: &tauri::App<R>) {
    use tauri_plugin_deep_link::DeepLinkExt;

    #[cfg(target_os = "linux")]
    {
        let _ = app.deep_link().register_all();
    }

    #[cfg(all(debug_assertions, windows))]
    {
        // current_exe 获取失败 → fail-open 回退为无条件注册（与旧行为一致）。
        let current_exe = match std::env::current_exe() {
            Ok(exe) => exe.to_string_lossy().into_owned(),
            Err(e) => {
                log::info!(
                    "deep-link 守卫：current_exe 获取失败（{e}），回退为无条件注册（fail-open）"
                );
                let _ = app.deep_link().register_all();
                return;
            }
        };

        for scheme in DESKTOP_SCHEMES {
            let existing = read_hkcu_open_command(scheme);
            match decide_registration(existing.as_deref(), &current_exe) {
                RegistrationDecision::Register => {
                    // 写操作仍走插件，保证注册内容（URL Protocol / DefaultIcon /
                    // command）与上游完全一致。
                    if let Err(e) = app.deep_link().register(scheme) {
                        log::info!("deep-link dev 注册 {scheme} 失败: {e}");
                    } else {
                        log::info!("deep-link dev 已注册 {scheme} -> {current_exe}");
                    }
                }
                RegistrationDecision::Skip => {
                    // 不覆盖用户既有关联：例如 NSIS 安装版写入的正式 exe。
                    let existing_exe = existing
                        .as_deref()
                        .and_then(extract_exe_path_from_command)
                        .unwrap_or("<无法解析>");
                    log::info!(
                        "deep-link 守卫：检测到 {scheme}:// 协议既有注册指向其他安装 \
                         （{existing_exe}），跳过 dev 注册，不覆盖既有关联；\
                         如需 dev 深链冷启动，请删除注册表项 \
                         HKCU\\Software\\Classes\\{scheme}\\shell\\open\\command"
                    );
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---------- extract_exe_path_from_command ----------

    #[test]
    fn extract_quoted_command_with_arg() {
        // 标准 NSIS / 插件写法：带引号路径 + 带引号 %1
        assert_eq!(
            extract_exe_path_from_command(r#""C:\path\hbut.exe" "%1""#),
            Some(r"C:\path\hbut.exe")
        );
    }

    #[test]
    fn extract_quoted_command_without_arg() {
        assert_eq!(
            extract_exe_path_from_command(r#""D:\Program\Mini-HBUT\hbut-helper.exe""#),
            Some(r"D:\Program\Mini-HBUT\hbut-helper.exe")
        );
    }

    #[test]
    fn extract_unquoted_path() {
        assert_eq!(
            extract_exe_path_from_command(r"C:\path\hbut.exe %1"),
            Some(r"C:\path\hbut.exe")
        );
        // 无引号且无参数
        assert_eq!(
            extract_exe_path_from_command(r"C:\path\hbut.exe"),
            Some(r"C:\path\hbut.exe")
        );
    }

    #[test]
    fn extract_unquoted_path_with_spaces_is_truncated() {
        // 无引号路径含空格：固有歧义，截断到第一个空白（决策层按 Skip 保护处理）
        assert_eq!(
            extract_exe_path_from_command(r#"C:\Program Files\hbut.exe "%1""#),
            Some(r"C:\Program")
        );
    }

    #[test]
    fn extract_trims_surrounding_whitespace() {
        assert_eq!(
            extract_exe_path_from_command(r#"   "C:\path\hbut.exe" "%1"   "#),
            Some(r"C:\path\hbut.exe")
        );
    }

    #[test]
    fn extract_invalid_inputs() {
        assert_eq!(extract_exe_path_from_command(""), None);
        assert_eq!(extract_exe_path_from_command("   "), None);
        // 只有起始引号，无闭合引号
        assert_eq!(extract_exe_path_from_command(r#""C:\path\hbut.exe"#), None);
    }

    // ---------- normalize_exe_path ----------

    #[test]
    fn normalize_is_case_insensitive() {
        assert_eq!(
            normalize_exe_path(r"C:\Path\HBUT.EXE"),
            normalize_exe_path(r"c:\path\hbut.exe")
        );
    }

    #[test]
    fn normalize_strips_quotes_and_whitespace() {
        assert_eq!(
            normalize_exe_path(r#"  "C:\path\hbut.exe"  "#),
            normalize_exe_path(r"C:\path\hbut.exe")
        );
    }

    #[test]
    fn normalize_strips_verbatim_prefix() {
        // current_exe() 可能带 \\?\ 前缀（dunce::simplified 之前的形式）
        assert_eq!(
            normalize_exe_path(r"\\?\C:\path\hbut.exe"),
            normalize_exe_path(r"C:\path\hbut.exe")
        );
        // UNC 变体
        assert_eq!(
            normalize_exe_path(r"\\?\UNC\server\share\hbut.exe"),
            normalize_exe_path(r"\\server\share\hbut.exe")
        );
    }

    #[test]
    fn normalize_unifies_separators() {
        assert_eq!(
            normalize_exe_path("C:/path/hbut.exe"),
            normalize_exe_path(r"C:\path\hbut.exe")
        );
    }

    // ---------- decide_registration ----------

    #[test]
    fn decide_none_means_register() {
        // 键不存在 / 读失败 → fail-open 注册
        assert_eq!(
            decide_registration(None, r"C:\dev\target\debug\hbut-helper.exe"),
            RegistrationDecision::Register
        );
    }

    #[test]
    fn decide_unparsable_value_means_skip() {
        // 键存在但内容为空（损坏 / 异常状态）→ 保守跳过
        assert_eq!(
            decide_registration(Some(""), r"C:\dev\hbut-helper.exe"),
            RegistrationDecision::Skip
        );
        assert_eq!(
            decide_registration(Some(r#""无闭合引号"#), r"C:\dev\hbut-helper.exe"),
            RegistrationDecision::Skip
        );
    }

    #[test]
    fn decide_same_exe_means_register() {
        // 插件写入的标准格式，与 current_exe 一致（大小写不同也应视为相同）
        assert_eq!(
            decide_registration(
                Some(r#""C:\Dev\Target\Debug\hbut-helper.exe" "%1""#),
                r"c:\dev\target\debug\hbut-helper.exe"
            ),
            RegistrationDecision::Register
        );
        // current_exe 带 \\?\ 前缀也能匹配注册表里的普通形式
        assert_eq!(
            decide_registration(
                Some(r#""C:\dev\target\debug\hbut-helper.exe" "%1""#),
                r"\\?\C:\dev\target\debug\hbut-helper.exe"
            ),
            RegistrationDecision::Register
        );
    }

    #[test]
    fn decide_other_exe_means_skip() {
        // 正式安装版占用协议关联：不覆盖
        assert_eq!(
            decide_registration(
                Some(r#""D:\Program\Mini-HBUT\hbut-helper.exe" "%1""#),
                r"C:\dev\target\debug\hbut-helper.exe"
            ),
            RegistrationDecision::Skip
        );
    }

    #[test]
    fn decide_table_driven() {
        let cases: &[(&str, &str, RegistrationDecision)] = &[
            // (注册表现有值, current_exe, 期望)
            ("", r"C:\a.exe", RegistrationDecision::Skip),
            (
                r#""C:\a.exe" "%1""#,
                r"C:\a.exe",
                RegistrationDecision::Register,
            ),
            (
                r#""C:\A.EXE" "%1""#,
                r"c:\a.exe",
                RegistrationDecision::Register,
            ),
            (
                r#""C:\b.exe" "%1""#,
                r"C:\a.exe",
                RegistrationDecision::Skip,
            ),
            (r"C:\a.exe %1", r"C:\a.exe", RegistrationDecision::Register),
        ];
        for (existing, exe, expected) in cases {
            assert_eq!(
                decide_registration(Some(existing), exe),
                *expected,
                "existing={existing:?}, exe={exe:?}"
            );
        }
    }

    // ---------- tauri.conf.json 契约 ----------

    /// 强制 DESKTOP_SCHEMES 与 tauri.conf.json 的
    /// plugins.deep-link.desktop.schemes 完全一致（单一 minihbut 协议入口，
    /// 与前端 src/platform/deep_link_config_contract.spec.ts 呼应）。
    #[test]
    fn desktop_schemes_match_tauri_conf() {
        // tauri.conf.json 就在 src-tauri（CARGO_MANIFEST_DIR）目录下。
        let conf_path = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("tauri.conf.json");
        let raw = std::fs::read_to_string(&conf_path)
            .expect("读取 tauri.conf.json 失败（相对 CARGO_MANIFEST_DIR）");
        let conf: serde_json::Value = serde_json::from_str(&raw).expect("解析 tauri.conf.json");
        let schemes: Vec<String> = conf
            .get("plugins")
            .and_then(|p| p.get("deep-link"))
            .and_then(|d| d.get("desktop"))
            .and_then(|d| d.get("schemes"))
            .and_then(|s| serde_json::from_value(s.clone()).expect("schemes 应为字符串数组"))
            .expect("tauri.conf.json 缺少 plugins.deep-link.desktop.schemes");
        assert_eq!(
            schemes,
            DESKTOP_SCHEMES
                .iter()
                .map(|s| s.to_string())
                .collect::<Vec<_>>()
        );
    }
}
