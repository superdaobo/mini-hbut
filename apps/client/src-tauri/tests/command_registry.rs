//! Command 注册清单基线测试（纯文件解析，不编译 crate）。
//!
//! 目的：机械比较「拆分前后」Tauri command 注册名集合，防止重构遗漏/重命名。
//! - 基线：tests/command_baseline.txt（重构前 generate_handler 逐项，git HEAD 提取）
//! - 现状：src/lib.rs 的 generate_handler 引用 + 实现文件中真实存在的 fn 名
//!
//! 本测试不 `use` crate，因此不触发 tauri 链接，可在几十秒内完成。

use std::collections::HashSet;
use std::fs;
use std::path::PathBuf;

const LIB_RS: &str = "src/lib.rs";
const BASELINE_TXT: &str = "tests/command_baseline.txt";

/// 从 generate_handler![ ... ] 块中提取每一项（`name` 或 `path::name`），保持顺序。
fn load_handler_items(lib_rs: &str) -> Vec<String> {
    let mut items = Vec::new();
    let mut in_block = false;
    for raw in lib_rs.lines() {
        let line = raw.trim();
        if line.contains("generate_handler![") {
            in_block = true;
            continue;
        }
        if in_block && line.starts_with("])") {
            break;
        }
        if in_block {
            if let Some(stripped) = line.strip_suffix(',') {
                let name = stripped.trim();
                if !name.is_empty() && !name.starts_with("//") {
                    items.push(name.to_string());
                }
            }
        }
    }
    items
}

/// 递归收集 src 下所有 .rs 文件中定义的函数名（`fn name(`）。
fn collect_defined_fn_names(src_root: &PathBuf) -> HashSet<String> {
    let mut names = HashSet::new();
    let mut stack = vec![src_root.clone()];
    let mut files = Vec::new();
    while let Some(dir) = stack.pop() {
        if let Ok(entries) = fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    stack.push(path);
                } else if path.extension().and_then(|e| e.to_str()) == Some("rs") {
                    files.push(path);
                }
            }
        }
    }
    for file in files {
        if let Ok(text) = fs::read_to_string(&file) {
            // 跳过被 #[cfg(...)] 关闭的定义仍宽松：只要求名字出现即可
            for line in text.lines() {
                let t = line.trim();
                // 兼容 `pub async fn` / `pub(crate) fn` / `async fn` / `fn`
                if let Some(rest) = t.strip_prefix("pub ") {
                    if let Some(name) = fn_name_from(rest) {
                        names.insert(name);
                    }
                } else if let Some(name) = fn_name_from(t) {
                    names.insert(name);
                }
            }
        }
    }
    names
}

fn fn_name_from(s: &str) -> Option<String> {
    let trimmed = s.trim();
    // 去掉可见性前缀：`pub ` / `pub(crate) ` / `pub(super) ` / `pub(in path) `
    let after_vis = if let Some(rest) = trimmed.strip_prefix("pub ") {
        rest.trim()
    } else if let Some(rest) = trimmed.strip_prefix("pub(") {
        // pub(crate) / pub(super) / pub(in ...) 形式，取右括号之后
        rest.split_once(')')
            .map(|(_, tail)| tail.trim())
            .unwrap_or(rest)
    } else {
        trimmed
    };
    let after_async = after_vis.strip_prefix("async ").unwrap_or(after_vis);
    let name = after_async
        .strip_prefix("fn ")?
        .split(['(', '<', ' '])
        .next()?
        .to_string();
    if name.is_empty() || name.starts_with("fn") {
        return None;
    }
    Some(name)
}

fn last_segment(item: &str) -> &str {
    item.rsplit("::").next().unwrap_or(item)
}

#[test]
fn handler_matches_baseline() {
    let lib = fs::read_to_string(LIB_RS).expect("read src/lib.rs");
    let current = load_handler_items(&lib);
    let baseline = fs::read_to_string(BASELINE_TXT)
        .expect("read tests/command_baseline.txt")
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>();

    assert!(!current.is_empty(), "generate_handler 块未解析到任何项");
    assert!(!baseline.is_empty(), "基线清单为空");

    // 前端 invoke 的是函数名（路径最后一段），拆分只改变模块路径、不改变命令名；
    // 因此按 last_segment（保序）比较，路径前缀差异属预期。
    let current_names = current.iter().map(|s| last_segment(s)).collect::<Vec<_>>();
    let baseline_names = baseline.iter().map(|s| last_segment(s)).collect::<Vec<_>>();

    let missing = baseline_names
        .iter()
        .filter(|b| !current_names.contains(b))
        .collect::<Vec<_>>();
    let extra = current_names
        .iter()
        .filter(|c| !baseline_names.contains(c))
        .collect::<Vec<_>>();

    assert!(
        missing.is_empty(),
        "拆分后 handler 缺失了基线中的命令（遗漏/重命名）: {missing:?}"
    );
    assert!(
        extra.is_empty(),
        "拆分后 handler 新增了基线中没有的命令（意外变更）: {extra:?}"
    );
    assert_eq!(
        current_names.len(),
        baseline_names.len(),
        "命令数量不一致（顺序或重复项有差异）"
    );
    assert_eq!(
        current_names, baseline_names,
        "命令注册顺序与基线不一致（顺序调整需显式确认）"
    );
}

#[test]
fn handler_references_exist_in_impl() {
    let lib = fs::read_to_string(LIB_RS).expect("read src/lib.rs");
    let current = load_handler_items(&lib);
    assert!(!current.is_empty());

    let defined = collect_defined_fn_names(&PathBuf::from("src"));
    let undefined = current
        .iter()
        .filter(|item| !defined.contains(last_segment(item)))
        .collect::<Vec<_>>();

    assert!(
        undefined.is_empty(),
        "generate_handler 引用了未定义的函数（实现缺失或拼写错误）: {undefined:?}"
    );
}
