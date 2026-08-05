use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

fn collect_rs_files(root: &Path, output: &mut Vec<PathBuf>) {
    for entry in fs::read_dir(root).expect("read http_server source directory") {
        let entry = entry.expect("read directory entry");
        let path = entry.path();
        if path.is_dir() {
            collect_rs_files(&path, output);
        } else if path.extension().and_then(|value| value.to_str()) == Some("rs") {
            output.push(path);
        }
    }
}

/// 按括号和字符串边界提取单个 `.route(...)` 表达式。
///
/// 不使用跨表达式正则，避免把后续路由的链式方法错算到前一条路径。
fn route_expressions(source: &str) -> Vec<&str> {
    let bytes = source.as_bytes();
    let mut output = Vec::new();
    let mut cursor = 0usize;
    while let Some(offset) = source[cursor..].find(".route") {
        let start = cursor + offset;
        let Some(open_offset) = source[start..].find('(') else {
            break;
        };
        let open = start + open_offset;
        let mut depth = 0i32;
        let mut quote: Option<u8> = None;
        let mut escaped = false;
        let mut end = None;
        for (index, byte) in bytes.iter().enumerate().skip(open) {
            if let Some(active_quote) = quote {
                if escaped {
                    escaped = false;
                } else if *byte == b'\\' {
                    escaped = true;
                } else if *byte == active_quote {
                    quote = None;
                }
                continue;
            }
            match *byte {
                b'\'' | b'"' => quote = Some(*byte),
                b'(' => depth += 1,
                b')' => {
                    depth -= 1;
                    if depth == 0 {
                        end = Some(index + 1);
                        break;
                    }
                }
                _ => {}
            }
        }
        let end = end.expect("route expression must have balanced parentheses");
        output.push(&source[start..end]);
        cursor = end;
    }
    output
}

fn route_path(expression: &str) -> Option<&str> {
    let first_quote = expression.find('"')?;
    let remainder = &expression[first_quote + 1..];
    let closing_quote = remainder.find('"')?;
    Some(&remainder[..closing_quote])
}

fn route_methods(expression: &str) -> Vec<&'static str> {
    const METHODS: [(&str, &str); 6] = [
        ("any(", "ANY"),
        ("get(", "GET"),
        ("post(", "POST"),
        ("put(", "PUT"),
        ("delete(", "DELETE"),
        ("patch(", "PATCH"),
    ];
    let mut found = Vec::new();
    let bytes = expression.as_bytes();
    for index in 0..bytes.len() {
        let prefix_ok =
            index == 0 || matches!(bytes[index - 1], b',' | b'.' | b' ' | b'\n' | b'\r' | b'\t');
        if !prefix_ok {
            continue;
        }
        let suffix = &expression[index..];
        for (needle, method) in METHODS {
            if suffix.starts_with(needle) {
                found.push(method);
            }
        }
    }
    found
}

fn registered_routes() -> BTreeSet<String> {
    let source_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("src/http_server");
    let mut files = Vec::new();
    collect_rs_files(&source_root, &mut files);

    let mut routes = BTreeSet::new();
    for file in files {
        let source = fs::read_to_string(&file).expect("read route source");
        for expression in route_expressions(&source) {
            let Some(path) = route_path(expression) else {
                continue;
            };
            for method in route_methods(expression) {
                routes.insert(format!("{method} {path}"));
            }
        }
    }
    routes
}

fn baseline_routes() -> BTreeSet<String> {
    include_str!("http_route_baseline.txt")
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(ToOwned::to_owned)
        .collect()
}

#[test]
fn http_method_and_path_registry_matches_phase5_baseline() {
    let actual = registered_routes();
    let expected = baseline_routes();
    assert_eq!(
        actual, expected,
        "HTTP method+path registry changed; update behavior deliberately before changing the baseline"
    );
}

#[test]
fn phase5_http_registry_has_no_duplicate_or_empty_entries() {
    let baseline = include_str!("http_route_baseline.txt")
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();
    let unique = baseline.iter().copied().collect::<BTreeSet<_>>();
    assert_eq!(
        baseline.len(),
        unique.len(),
        "baseline contains duplicate routes"
    );
    assert_eq!(baseline.len(), 119, "unexpected public HTTP route count");
}
