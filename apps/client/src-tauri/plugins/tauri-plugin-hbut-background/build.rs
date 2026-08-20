// 插件 build script：生成权限 schema（permissions/ 目录 -> OUT_DIR），供主应用 tauri_build 收集。
// 与主应用不同，插件 crate 没有 tauri.conf.json，必须使用 tauri_plugin::Builder（官方插件模板语义）。

const COMMANDS: &[&str] = &[
    "bg_configure",
    "bg_disable",
    "bg_sync_context",
    "bg_get_state",
    "bg_run_now",
    "bg_consume_events",
    "bg_clear_context",
];

fn main() {
    // iOS 的 Swift 实现必须在 Rust cdylib 链接阶段作为静态库参与链接，
    // 否则 mobile.rs 中的 hbut_bg_* FFI 会在 aarch64-apple-ios 上成为未定义符号。
    // Android 继续由现有 patch_android_background.py/sourceSets 接入，避免重复编译 Kotlin 类。
    let result = tauri_plugin::Builder::new(COMMANDS)
        .ios_path("ios")
        .try_build();
    if let Err(e) = result {
        if std::env::var("TARGET")
            .ok()
            .is_some_and(|t| t.contains("android"))
        {
            // docsrs/Android 文档构建时忽略插件构建结果（官方模板语义）
        } else {
            panic!("tauri-plugin build failed: {e}");
        }
    }
}
