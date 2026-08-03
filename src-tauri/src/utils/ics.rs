//! ICS 导出共享工具函数（Tauri 命令通道与 HTTP Bridge 通道复用）。
//!
//! 这些纯函数此前在 `lib.rs` 与 `http_server.rs` 中各有一份逐字等价的实现，
//! 阶段 3 架构收敛统一收束到本模块，避免两通道行为漂移。

/// 文件名安全化：仅保留 ASCII 字母数字与 `-` / `_`。
pub fn sanitize_filename_part(input: &str) -> String {
    input
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
        .collect::<String>()
}

/// RFC 5545 文本转义。
pub fn escape_ics_text(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace(';', "\\;")
        .replace(',', "\\,")
        .replace("\r\n", "\\n")
        .replace('\n', "\\n")
        .replace('\r', "")
}

/// RFC 5545 §3.1 行折叠：每行不超过 75 个字节，超出部分折行并以 CRLF+空格连接
pub fn fold_ics_line(line: &str) -> String {
    let max_bytes = 75;
    if line.len() <= max_bytes {
        return format!("{}\r\n", line);
    }
    let mut result = String::new();
    let mut byte_count = 0;
    let mut first_line = true;
    for ch in line.chars() {
        let ch_len = ch.len_utf8();
        // 折行后续行以空格开头，所以可用字节数减 1
        let limit = if first_line { max_bytes } else { max_bytes - 1 };
        if byte_count + ch_len > limit {
            result.push_str("\r\n ");
            byte_count = 1; // 空格占 1 字节
            first_line = false;
        }
        result.push(ch);
        byte_count += ch_len;
    }
    result.push_str("\r\n");
    result
}

/// 解析 ICS 日期时间：优先 RFC3339，其次 `%Y-%m-%dT%H:%M:%S` 与 `%Y-%m-%d %H:%M:%S`。
pub fn parse_ics_datetime(input: &str) -> Option<chrono::NaiveDateTime> {
    if let Ok(dt) = chrono::DateTime::parse_from_rfc3339(input) {
        return Some(dt.naive_local());
    }
    chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%dT%H:%M:%S")
        .ok()
        .or_else(|| chrono::NaiveDateTime::parse_from_str(input, "%Y-%m-%d %H:%M:%S").ok())
}

#[cfg(test)]
mod unit {
    use super::*;

    #[test]
    fn sanitize_keeps_alnum_and_dash_underscore() {
        assert_eq!(sanitize_filename_part("2023-2024_01"), "2023-2024_01");
        assert_eq!(
            sanitize_filename_part("a/b\\c:d*e?f\"g<h>i|j"),
            "abcdefghij"
        );
        assert_eq!(sanitize_filename_part(""), "");
        // 中文被过滤；`-` 属于保留字符（与迁移前的 lib.rs/http_server.rs 行为一致）
        assert_eq!(sanitize_filename_part("课表-schedule"), "-schedule");
    }

    #[test]
    fn escape_handles_spec_characters() {
        assert_eq!(escape_ics_text(r"a\b"), r"a\\b");
        assert_eq!(escape_ics_text("a;b,c"), r"a\;b\,c");
        assert_eq!(escape_ics_text("a\r\nb"), r"a\nb");
        assert_eq!(escape_ics_text("a\nb"), r"a\nb");
        assert_eq!(escape_ics_text("a\rb"), r"ab");
        // CRLF 需先于 LF 处理：不应产生重复转义
        assert_eq!(escape_ics_text("x\r\ny"), r"x\ny");
    }

    #[test]
    fn fold_short_line_is_terminated() {
        assert_eq!(fold_ics_line("SUMMARY:短行"), "SUMMARY:短行\r\n");
        assert_eq!(fold_ics_line(""), "\r\n");
    }

    #[test]
    fn fold_75_byte_boundary_unchanged() {
        let line = format!("X:{}", "a".repeat(73));
        assert_eq!(line.len(), 75);
        assert_eq!(fold_ics_line(&line), format!("{}\r\n", line));
    }

    #[test]
    fn fold_long_ascii_line_wraps_at_75() {
        let line = format!("X:{}", "b".repeat(100));
        let folded = fold_ics_line(&line);
        assert!(folded.ends_with("\r\n"));
        // 折行结果除首行外每行以空格开头，且不出现超过 75 字节的行
        for seg in folded.trim_end().split("\r\n") {
            if seg.starts_with(' ') {
                assert!(seg.len() <= 75, "折行段 {} 字节 > 75", seg.len());
            }
        }
        // 首行恰好 75 字节
        let first = folded.split("\r\n").next().unwrap();
        assert_eq!(first.len(), 75);
        // 内容完整保留（去除折行标记后与原文一致）
        let reassembled: String = folded.trim_end_matches("\r\n").replace("\r\n ", "");
        assert_eq!(reassembled, line);
    }

    #[test]
    fn fold_utf8_multibyte_never_splits_char() {
        let line = format!("X:{}", "课".repeat(50)); // 每字 3 字节，共 151 字节
        let folded = fold_ics_line(&line);
        let reassembled: String = folded.trim_end_matches("\r\n").replace("\r\n ", "");
        assert_eq!(reassembled, line);
        // 折行段（以空格开头）必须落在字符边界上（每字 3 字节）
        for seg in folded.trim_end().split("\r\n") {
            if let Some(body) = seg.strip_prefix(' ') {
                assert_eq!(body.len() % 3, 0, "折行段未对齐字符边界: {seg:?}");
            }
        }
    }

    #[test]
    fn parse_datetime_supports_three_formats() {
        let rfc3339 = parse_ics_datetime("2024-03-01T08:30:00+08:00").unwrap();
        assert_eq!(
            rfc3339.format("%Y-%m-%d %H:%M:%S").to_string(),
            "2024-03-01 08:30:00"
        );

        let t_format = parse_ics_datetime("2024-03-01T08:30:00").unwrap();
        assert_eq!(
            t_format.format("%Y-%m-%d %H:%M:%S").to_string(),
            "2024-03-01 08:30:00"
        );

        let space_format = parse_ics_datetime("2024-03-01 08:30:00").unwrap();
        assert_eq!(
            space_format.format("%Y-%m-%d %H:%M:%S").to_string(),
            "2024-03-01 08:30:00"
        );
    }

    #[test]
    fn parse_datetime_rejects_invalid_input() {
        assert!(parse_ics_datetime("").is_none());
        assert!(parse_ics_datetime("not-a-date").is_none());
        assert!(parse_ics_datetime("2024-13-01T00:00:00").is_none());
        assert!(parse_ics_datetime("2024-03-01").is_none());
    }
}
