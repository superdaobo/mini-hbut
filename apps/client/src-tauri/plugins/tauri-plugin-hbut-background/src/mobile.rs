//! native 承载分派：Android（JNI -> Kotlin）/ iOS（FFI -> Swift）/ desktop|web no-op。
//!
//! 语义（#611 验收「不统一伪造 ready」）：
//! - Android：真实 JNI 调用 Kotlin `HbutBackgroundPlugin` 静态方法，成败如实返回；
//!   - runNow：与周期 Worker 共用同一 GradesCheckCore 真实核心（#612）；
//!   - configure/disable：同步 WorkManager 唯一周期 work（#614 收口 #612「首次 enable 不注册调度」）；
//!   - syncContext/clearContext：落盘幂等 / 清理 baseline runtime（账号隔离）。
//! - iOS：FFI 调用 Swift `HbutBackgroundPlugin` 静态方法（#614 收口 #613，接入 BGAppRefresh 真实业务）；
//!   桥符号由 ios/CFFIBridge.swift（@_cdecl）导出，宿主 Xcode 工程接入 SPM 包后链接可用
//!   （见 ios/INTEGRATION.md；Windows 本机无法编译/验证 iOS target）。
//! - desktop/web：返回 None，由上层给出明确 unsupported/no-op 语义，应用不崩溃。
//!
//! store_dir：Rust 与 native（Kotlin/Swift）共享同一事件/配置文件目录，
//! 这是「native 写事件 → Rust 读盘合并」一致性的前提（#614）。

use std::path::PathBuf;

use crate::dto::{BackgroundPlatform, BackgroundSource, RunSummary};
use crate::state::NativeRunner;

/// 真实 native 执行器（注入 PluginState.perform_run_now 等）。
pub struct MobileRunner {
    platform: BackgroundPlatform,
    store_dir: PathBuf,
}

impl MobileRunner {
    pub fn new(platform: BackgroundPlatform, store_dir: PathBuf) -> Self {
        Self {
            platform,
            store_dir,
        }
    }
}

impl NativeRunner for MobileRunner {
    fn run_native(&self, scope: &Option<String>, force_synthetic: bool) -> Option<RunSummary> {
        dispatch_run(self.platform, scope, force_synthetic, &self.store_dir)
    }

    fn configure_native(&self, config_json: &str) -> Option<Result<(), String>> {
        dispatch_configure(self.platform, config_json, &self.store_dir)
    }

    fn disable_native(&self, keep_diagnostics: bool) -> Option<Result<(), String>> {
        dispatch_disable(self.platform, keep_diagnostics, &self.store_dir)
    }

    fn sync_context_native(&self, context_json: &str) -> Option<Result<(), String>> {
        dispatch_sync_context(self.platform, context_json, &self.store_dir)
    }

    fn clear_context_native(&self, scope: &str) -> Option<Result<(), String>> {
        dispatch_clear_context(self.platform, scope, &self.store_dir)
    }
}

/// runNow 平台分派：仅当前编译平台对应分支可解析（Windows 只编译 desktop 分支）。
fn dispatch_run(
    platform: BackgroundPlatform,
    scope: &Option<String>,
    force_synthetic: bool,
    store_dir: &std::path::Path,
) -> Option<RunSummary> {
    #[cfg(target_os = "android")]
    {
        if platform == BackgroundPlatform::Android {
            return android::run_native(scope, force_synthetic);
        }
    }
    #[cfg(target_os = "ios")]
    {
        if platform == BackgroundPlatform::Ios {
            return ios::run_native(scope, force_synthetic, store_dir);
        }
    }
    // desktop/web（或跨平台测试构造的移动平台值）：无 native 承载，返回 None 由上层降级。
    let _ = (platform, scope, force_synthetic, store_dir);
    None
}

/// configure 平台分派（系统调度更新）。
fn dispatch_configure(
    platform: BackgroundPlatform,
    config_json: &str,
    store_dir: &std::path::Path,
) -> Option<Result<(), String>> {
    #[cfg(target_os = "android")]
    {
        if platform == BackgroundPlatform::Android {
            return android::configure(config_json);
        }
    }
    #[cfg(target_os = "ios")]
    {
        if platform == BackgroundPlatform::Ios {
            return ios::configure(config_json, store_dir);
        }
    }
    let _ = (platform, config_json, store_dir);
    None
}

/// disable 平台分派（取消系统调度）。
fn dispatch_disable(
    platform: BackgroundPlatform,
    keep_diagnostics: bool,
    store_dir: &std::path::Path,
) -> Option<Result<(), String>> {
    #[cfg(target_os = "android")]
    {
        if platform == BackgroundPlatform::Android {
            return android::disable(keep_diagnostics);
        }
    }
    #[cfg(target_os = "ios")]
    {
        if platform == BackgroundPlatform::Ios {
            return ios::disable(keep_diagnostics, store_dir);
        }
    }
    let _ = (platform, keep_diagnostics, store_dir);
    None
}

/// syncContext 平台分派（iOS 在 context 就绪后补提交调度；Android 落盘幂等）。
fn dispatch_sync_context(
    platform: BackgroundPlatform,
    context_json: &str,
    store_dir: &std::path::Path,
) -> Option<Result<(), String>> {
    #[cfg(target_os = "android")]
    {
        if platform == BackgroundPlatform::Android {
            return android::sync_context(context_json);
        }
    }
    #[cfg(target_os = "ios")]
    {
        if platform == BackgroundPlatform::Ios {
            return ios::sync_context(context_json, store_dir);
        }
    }
    let _ = (platform, context_json, store_dir);
    None
}

/// clearContext 平台分派（Android 清 baseline runtime / iOS 清 Keychain 安全材料）。
fn dispatch_clear_context(
    platform: BackgroundPlatform,
    scope: &str,
    store_dir: &std::path::Path,
) -> Option<Result<(), String>> {
    #[cfg(target_os = "android")]
    {
        if platform == BackgroundPlatform::Android {
            return android::clear_context(scope);
        }
    }
    #[cfg(target_os = "ios")]
    {
        if platform == BackgroundPlatform::Ios {
            return ios::clear_context(scope, store_dir);
        }
    }
    let _ = (platform, scope, store_dir);
    None
}

/// 当前编译平台（真实值，用于 getState.platform 与事件来源）。
pub fn current_platform() -> BackgroundPlatform {
    #[cfg(target_os = "android")]
    {
        BackgroundPlatform::Android
    }
    #[cfg(target_os = "ios")]
    {
        BackgroundPlatform::Ios
    }
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        BackgroundPlatform::Desktop
    }
}

/// 当前编译平台对应的默认状态来源（真实值，不伪造）。
pub fn current_source() -> BackgroundSource {
    match current_platform() {
        BackgroundPlatform::Android => BackgroundSource::Android,
        BackgroundPlatform::Ios => BackgroundSource::Ios,
        BackgroundPlatform::Desktop | BackgroundPlatform::Web => BackgroundSource::Rust,
    }
}

/// 从 native 返回的 JSON 中提取错误摘要（仅移动端分支使用）：
/// `error` 字段非空，或 `ok=false`（RunSummary.failed）视为失败。
#[cfg(any(target_os = "android", target_os = "ios"))]
fn extract_error(json: &str) -> Option<String> {
    let value: serde_json::Value = serde_json::from_str(json).ok()?;
    if let Some(err) = value.get("error").and_then(|v| v.as_str()) {
        if !err.is_empty() {
            return Some(err.to_string());
        }
    }
    if value.get("ok").and_then(|v| v.as_bool()) == Some(false) {
        return Some(
            value
                .get("message")
                .and_then(|v| v.as_str())
                .map(|m| m.to_string())
                .unwrap_or_else(|| "native 返回 ok=false".to_string()),
        );
    }
    None
}

/// Android 分支：JNI 调用 Kotlin（仅 android target 编译；Windows 不参与构建/clippy）。
#[cfg(target_os = "android")]
mod android {
    use jni::objects::{JObject, JValue};
    use jni::sys::{jboolean, jobject};
    use jni::JavaVM;

    use crate::dto::RunSummary;

    /// Kotlin 插件 FQCN（android/ 目录内 HbutBackgroundPlugin object）。
    const KOTLIN_CLASS: &str = "com/hbut/mini/background/HbutBackgroundPlugin";

    /// JNI 方法参数（Context 之后的可变参数，按方法签名组合）。
    enum KotlinArg {
        Str(String),
        Bool(bool),
        /// Java null 引用（如 runNow 的 scope 缺省）。
        Null,
    }

    /// 通用 JNI 调用：调用 Kotlin 静态方法（返回 JSON 字符串）。
    /// 覆盖本插件全部方法签名：runNow/configure/disable/syncContext/clearContext。
    fn call_kotlin(method: &str, signature: &str, args: &[KotlinArg]) -> Result<String, String> {
        let vm_ptr = ndk_context::android_context()
            .vm()
            .cast::<jni::sys::JavaVM>();
        let vm = unsafe { JavaVM::from_raw(vm_ptr) }
            .map_err(|e| format!("获取 Android JavaVM 失败: {e}"))?;
        let mut env = vm
            .attach_current_thread()
            .map_err(|e| format!("附加 JNI 线程失败: {e}"))?;
        let class = env.find_class(KOTLIN_CLASS).map_err(|e| {
            format!("找不到 Kotlin 插件类 {KOTLIN_CLASS}（骨架未集成进 app 工程）: {e}")
        })?;
        let context_ptr = ndk_context::android_context().context() as jobject;
        let context = unsafe { JObject::from_raw(context_ptr) };

        let mut jargs: Vec<JValue> = vec![JValue::Object(&context)];
        for arg in args {
            match arg {
                KotlinArg::Str(s) => {
                    let java_str = env
                        .new_string(s)
                        .map_err(|e| format!("构造 {method} 参数失败: {e}"))?;
                    let obj: JObject = java_str.into();
                    jargs.push(JValue::Object(&obj));
                }
                KotlinArg::Bool(b) => jargs.push(JValue::Bool(*b as jboolean)),
                KotlinArg::Null => jargs.push(JValue::Object(&JObject::null())),
            }
        }
        let result = env
            .call_static_method(class, method, signature, &jargs)
            .map_err(|e| format!("Kotlin {method} 调用失败: {e}"))?;
        let JValue::Object(obj) = result else {
            return Err(format!("Kotlin {method} 返回类型异常"));
        };
        let string = env
            .get_string(&obj.into())
            .map_err(|e| format!("读取 Kotlin {method} 返回字符串失败: {e}"))?;
        Ok(string.to_str().unwrap_or_default().to_string())
    }

    /// 调用 Kotlin `runNow(context, scope, forceSynthetic)`，解析 JSON 摘要返回。
    /// 任何 JNI 失败都如实返回失败摘要（不伪造 ready），由上层写入 state.error。
    pub fn run_native(scope: &Option<String>, force_synthetic: bool) -> Option<RunSummary> {
        let mut args: Vec<KotlinArg> = Vec::new();
        args.push(match scope {
            Some(s) => KotlinArg::Str(s.clone()),
            // 缺省 scope：传 Java null，Kotlin 侧回退到 context.scope。
            None => KotlinArg::Null,
        });
        args.push(KotlinArg::Bool(force_synthetic));
        let json = call_kotlin(
            "runNow",
            "(Landroid/content/Context;Ljava/lang/String;Z)Ljava/lang/String;",
            &args,
        );
        Some(match json {
            Err(e) => RunSummary::failed(e),
            Ok(text) => match serde_json::from_str::<RunSummary>(&text) {
                Ok(summary) => summary,
                Err(e) => RunSummary::failed(format!("Kotlin 摘要解析失败: {e}")),
            },
        })
    }

    /// 调用 Kotlin `configure(context, configJson)`：保存配置 + 同步 WorkManager 唯一周期 work。
    /// #614 收口 #612：Rust configure 落盘后必须转发 native，否则首次 enable 不注册调度。
    pub fn configure(config_json: &str) -> Option<Result<(), String>> {
        let json = call_kotlin(
            "configure",
            "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
            &[KotlinArg::Str(config_json.to_string())],
        );
        Some(native_ok(json))
    }

    /// 调用 Kotlin `disable(context, keepDiagnostics)`：取消唯一周期 work。
    pub fn disable(keep_diagnostics: bool) -> Option<Result<(), String>> {
        let json = call_kotlin(
            "disable",
            "(Landroid/content/Context;Z)Ljava/lang/String;",
            &[KotlinArg::Bool(keep_diagnostics)],
        );
        Some(native_ok(json))
    }

    /// 调用 Kotlin `syncContext(context, contextJson)`（落盘幂等）。
    pub fn sync_context(context_json: &str) -> Option<Result<(), String>> {
        let json = call_kotlin(
            "syncContext",
            "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
            &[KotlinArg::Str(context_json.to_string())],
        );
        Some(native_ok(json))
    }

    /// 调用 Kotlin `clearContext(context, scope)`：清理 baseline runtime（账号隔离）。
    pub fn clear_context(scope: &str) -> Option<Result<(), String>> {
        let json = call_kotlin(
            "clearContext",
            "(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;",
            &[KotlinArg::Str(scope.to_string())],
        );
        Some(native_ok(json))
    }

    /// 把 Kotlin 返回 JSON 转为 Result：含 error 字段或 ok=false（RunSummary.failed）视为失败。
    fn native_ok(json: Result<String, String>) -> Result<(), String> {
        json.and_then(|text| {
            if let Some(err) = crate::mobile::extract_error(&text) {
                Err(err)
            } else {
                Ok(())
            }
        })
    }
}

/// iOS 分支：FFI 调用 Swift（#614 收口 #613，接入 BGAppRefresh 真实业务）。
/// 桥符号由 ios/CFFIBridge.swift（@_cdecl）导出；仅 ios target 编译（Windows 不参与构建/clippy）。
#[cfg(target_os = "ios")]
mod ios {
    use std::ffi::{CStr, CString};
    use std::os::raw::{c_char, c_int};
    use std::path::Path;

    use crate::dto::RunSummary;

    // ---- Swift C FFI 符号声明（与 ios/CFFIBridge.swift @_cdecl 一一对应）----
    // 约定：入参为 UTF-8 C 字符串（可空表示缺省）；返回 heap 分配的 JSON 字符串，
    // 调用方用 hbut_bg_free_string 释放；布尔用 c_int（0/1）避免跨语言 bool ABI 歧义。
    unsafe extern "C" {
        fn hbut_bg_configure(config_json: *const c_char, store_dir: *const c_char)
            -> *const c_char;
        fn hbut_bg_disable(keep_diagnostics: c_int, store_dir: *const c_char) -> *const c_char;
        fn hbut_bg_sync_context(
            context_json: *const c_char,
            store_dir: *const c_char,
        ) -> *const c_char;
        fn hbut_bg_run_now(
            scope: *const c_char,
            force_synthetic: c_int,
            store_dir: *const c_char,
        ) -> *const c_char;
        fn hbut_bg_clear_context(scope: *const c_char, store_dir: *const c_char) -> *const c_char;
        /// 认证材料写入 Keychain（#608 红线 2：JS 不得提交，由 Rust 会话层直接调用）。
        fn hbut_bg_set_secure_envelope(
            envelope_json: *const c_char,
            store_dir: *const c_char,
        ) -> *const c_char;
        fn hbut_bg_free_string(ptr: *mut c_char);
    }

    /// 调用 Swift FFI 并返回 JSON 字符串；符号缺失/调用失败如实返回错误。
    fn call_bridge(
        store_dir: &Path,
        invoke: impl FnOnce(*const c_char) -> *const c_char,
    ) -> Result<String, String> {
        let dir_c = CString::new(store_dir.to_string_lossy().as_bytes())
            .map_err(|_| "store_dir 含 NUL 字节，无法传给 Swift".to_string())?;
        let ptr = invoke(dir_c.as_ptr());
        if ptr.is_null() {
            return Err("Swift FFI 返回空指针（桥未接入或 native 崩溃）".to_string());
        }
        // 复制出字符串后立即释放 Swift 侧分配的内存，避免泄漏。
        let result = unsafe { CStr::from_ptr(ptr) }.to_string_lossy().to_string();
        unsafe { hbut_bg_free_string(ptr as *mut c_char) };
        Ok(result)
    }

    /// 解析 Swift 返回 JSON 为 RunSummary；失败如实报告（不伪造 ready）。
    fn parse_summary(json: Result<String, String>) -> RunSummary {
        match json {
            Err(e) => RunSummary::failed(e),
            Ok(text) => match serde_json::from_str::<RunSummary>(&text) {
                Ok(summary) => summary,
                Err(e) => RunSummary::failed(format!("Swift 摘要解析失败: {e}")),
            },
        }
    }

    /// runNow：Swift 真实核心（source=manual，与系统 BGTask 共用同一 coordinator）。
    pub fn run_native(
        scope: &Option<String>,
        force_synthetic: bool,
        store_dir: &Path,
    ) -> Option<RunSummary> {
        let scope_c = scope.as_ref().and_then(|s| CString::new(s.as_str()).ok());
        let json = call_bridge(store_dir, |dir| unsafe {
            hbut_bg_run_now(
                scope_c.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
                force_synthetic as c_int,
                dir,
            )
        });
        Some(parse_summary(json))
    }

    /// configure：Swift 侧保存配置 + 提交 BGAppRefresh request（context 未 ready 时内部跳过）。
    pub fn configure(config_json: &str, store_dir: &Path) -> Option<Result<(), String>> {
        let json_c = CString::new(config_json.as_bytes()).ok();
        let json = call_bridge(store_dir, |dir| unsafe {
            hbut_bg_configure(
                json_c.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
                dir,
            )
        });
        Some(json.and_then(|text| {
            if let Some(err) = crate::mobile::extract_error(&text) {
                Err(err)
            } else {
                Ok(())
            }
        }))
    }

    /// disable：Swift 侧取消 pending request + 落盘 enabled=false。
    pub fn disable(keep_diagnostics: bool, store_dir: &Path) -> Option<Result<(), String>> {
        let json = call_bridge(store_dir, |dir| unsafe {
            hbut_bg_disable(keep_diagnostics as c_int, dir)
        });
        Some(json.and_then(|text| {
            if let Some(err) = crate::mobile::extract_error(&text) {
                Err(err)
            } else {
                Ok(())
            }
        }))
    }

    /// syncContext：Swift 侧保存非敏感上下文；enabled 且 ready 时补提交调度。
    pub fn sync_context(context_json: &str, store_dir: &Path) -> Option<Result<(), String>> {
        let json_c = CString::new(context_json.as_bytes()).ok();
        let json = call_bridge(store_dir, |dir| unsafe {
            hbut_bg_sync_context(
                json_c.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
                dir,
            )
        });
        Some(json.and_then(|text| {
            if let Some(err) = crate::mobile::extract_error(&text) {
                Err(err)
            } else {
                Ok(())
            }
        }))
    }

    /// clearContext：Swift 侧清理 context/state/events/baseline + Keychain 安全材料。
    pub fn clear_context(scope: &str, store_dir: &Path) -> Option<Result<(), String>> {
        let scope_c = CString::new(scope.as_bytes()).ok();
        let json = call_bridge(store_dir, |dir| unsafe {
            hbut_bg_clear_context(
                scope_c.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
                dir,
            )
        });
        Some(json.and_then(|text| {
            if let Some(err) = crate::mobile::extract_error(&text) {
                Err(err)
            } else {
                Ok(())
            }
        }))
    }

    /// 认证材料写入 Keychain（#608 红线 2）：JS 不得提交敏感材料，
    /// 由 Rust 会话层（登录成功后）直接调用本桥。
    /// 当前 Rust 会话层调用点属 #622/#626 范围（本 Issue 不触碰 src-tauri/src/**），
    /// 此处仅提供 FFI 能力与符号声明；接入后 iOS 后台成绩检查即可复用 secure envelope。
    #[allow(dead_code)] // 供 Rust 会话层后续接入调用（Windows 不编译本模块）
    pub fn set_secure_envelope(
        envelope_json: &str,
        store_dir: &Path,
    ) -> Option<Result<(), String>> {
        let json_c = CString::new(envelope_json.as_bytes()).ok();
        let json = call_bridge(store_dir, |dir| unsafe {
            hbut_bg_set_secure_envelope(
                json_c.as_ref().map_or(std::ptr::null(), |c| c.as_ptr()),
                dir,
            )
        });
        Some(json.and_then(|text| {
            if let Some(err) = crate::mobile::extract_error(&text) {
                Err(err)
            } else {
                Ok(())
            }
        }))
    }
}
