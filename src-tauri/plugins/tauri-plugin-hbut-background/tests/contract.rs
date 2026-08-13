//! 跨端契约测试（serde contract tests）：验证 Rust DTO 与 contract-fixtures/ 的三端共享 JSON 一致。
//!
//! fixture 为单一事实源：Kotlin 单测（android/src/test）与 Swift 契约测试（ios/Tests）读取同一批文件。
//! 本测试保证：
//! 1. 合法 fixture 可被 Rust DTO 精确反序列化（字段名 camelCase、枚举值语义一致）；
//! 2. schema 版本边界：未来版本（schema=999）JSON 结构可解析但版本检查为不兼容；
//! 3. 无 schema 字段的旧格式必须被拒绝（强制版本契约）；
//! 4. Kotlin runNow 返回的 RunSummary JSON 与 Rust 端一致（native 桥契约）。

use std::fs;
use std::path::PathBuf;

use tauri_plugin_hbut_background::dto::{
    check_schema, BackgroundCheckState, BackgroundConfig, BackgroundContext, BackgroundEvent,
    BackgroundPlatform, BackgroundSource, ConsumeEventsResult, RunSummary, SchemaCheck,
    BG_SCHEMA_VERSION,
};

fn fixture(name: &str) -> String {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("contract-fixtures")
        .join(name);
    fs::read_to_string(&path).unwrap_or_else(|e| panic!("读取 fixture {name} 失败: {e}"))
}

#[test]
fn config_fixture_matches_dto() {
    let cfg: BackgroundConfig = serde_json::from_str(&fixture("config.json")).expect("解析失败");
    assert_eq!(cfg.schema, BG_SCHEMA_VERSION);
    assert!(cfg.enabled);
    assert_eq!(cfg.interval_minutes, Some(30));
    assert_eq!(cfg.business, vec!["grades", "exams"]);
    assert_eq!(cfg.scope.as_deref(), Some("2024010101"));
    assert_eq!(check_schema(cfg.schema), SchemaCheck::Ok);
}

#[test]
fn context_fixture_matches_dto() {
    let ctx: BackgroundContext = serde_json::from_str(&fixture("context.json")).expect("解析失败");
    assert_eq!(ctx.schema, BG_SCHEMA_VERSION);
    assert_eq!(ctx.scope, "2024010101");
    assert_eq!(ctx.business, vec!["grades", "exams"]);
    assert!(!ctx.updated_at.is_empty());
}

#[test]
fn state_fixture_desktop_rust() {
    let state: BackgroundCheckState =
        serde_json::from_str(&fixture("state.json")).expect("解析失败");
    assert_eq!(state.platform, BackgroundPlatform::Desktop);
    assert_eq!(state.source, BackgroundSource::Rust);
    assert!(state.configured);
    assert_eq!(state.pending_events, 2);
    assert_eq!(state.last_run_ok, Some(true));
}

#[test]
fn state_fixture_android_is_real_platform() {
    // Android/iOS 必须返回自己的 platform/source，而不是统一伪造（#611 验收）。
    let state: BackgroundCheckState =
        serde_json::from_str(&fixture("state-android.json")).expect("解析失败");
    assert_eq!(state.platform, BackgroundPlatform::Android);
    assert_eq!(state.source, BackgroundSource::Android);
}

#[test]
fn event_fixture_matches_dto() {
    let evt: BackgroundEvent = serde_json::from_str(&fixture("event.json")).expect("解析失败");
    assert_eq!(evt.kind, "synthetic_run");
    assert_eq!(evt.source, BackgroundSource::Android);
    assert_eq!(evt.scope.as_deref(), Some("2024010101"));
    assert_eq!(
        evt.payload["message"].as_str(),
        Some("Kotlin 执行成功"),
        "事件负载必须保留跨端语义"
    );
}

#[test]
fn consume_result_fixture_matches_dto() {
    let result: ConsumeEventsResult =
        serde_json::from_str(&fixture("consume-result.json")).expect("解析失败");
    assert_eq!(result.events.len(), 2);
    assert_eq!(result.remaining, 2);
    assert_eq!(result.events[0].source, BackgroundSource::Ios);
    assert_eq!(result.events[1].source, BackgroundSource::Rust);
}

#[test]
fn run_summary_fixture_is_kotlin_bridge_contract() {
    // Kotlin HbutBackgroundPlugin.runNow 返回的 JSON 摘要，Rust JNI 端必须能直接解析。
    let summary: RunSummary = serde_json::from_str(&fixture("run-summary.json")).expect("解析失败");
    assert!(summary.ok);
    assert!(summary.synthetic);
    assert_eq!(summary.events_produced, 1);
    assert_eq!(summary.message.as_deref(), Some("Kotlin 执行成功"));
}

#[test]
fn future_schema_is_json_compatible_but_version_incompatible() {
    // 未来版本：字段结构兼容（可解析），但版本检查必须判为不兼容 -> 存储层降级路径。
    let cfg: BackgroundConfig =
        serde_json::from_str(&fixture("future-schema-config.json")).expect("解析失败");
    assert_eq!(check_schema(cfg.schema), SchemaCheck::Incompatible);
    assert_eq!(cfg.schema, 999);
}

#[test]
fn legacy_no_schema_is_rejected() {
    // 无 schema 字段的旧格式：反序列化必须失败（强制版本契约，禁止无版本落盘）。
    let result: Result<BackgroundConfig, _> =
        serde_json::from_str(&fixture("legacy-no-schema-config.json"));
    assert!(result.is_err(), "缺 schema 字段的文件必须被拒绝");
}

#[test]
fn all_fixture_keys_are_camel_case() {
    // 防契约漂移：所有 fixture 的 JSON 字段名（key）不得出现 snake_case；
    // 值（如 kind="synthetic_run"）允许 snake_case，不参与检查。
    let names = [
        "config.json",
        "context.json",
        "state.json",
        "state-android.json",
        "event.json",
        "consume-result.json",
        "run-summary.json",
        "future-schema-config.json",
    ];
    for name in names {
        let value: serde_json::Value = serde_json::from_str(&fixture(name))
            .unwrap_or_else(|e| panic!("fixture {name} 非法 JSON: {e}"));
        let mut keys = Vec::new();
        collect_keys(&value, &mut keys);
        for key in keys {
            assert!(
                !key.contains('_'),
                "fixture {name} 的字段名 {key} 含下划线，跨端契约要求 camelCase"
            );
        }
    }
}

fn collect_keys(value: &serde_json::Value, out: &mut Vec<String>) {
    match value {
        serde_json::Value::Object(map) => {
            for (k, v) in map {
                out.push(k.clone());
                collect_keys(v, out);
            }
        }
        serde_json::Value::Array(items) => {
            for item in items {
                collect_keys(item, out);
            }
        }
        _ => {}
    }
}
