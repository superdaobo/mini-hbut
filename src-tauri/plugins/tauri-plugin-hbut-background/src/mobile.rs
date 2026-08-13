//! native 承载分派：Android（JNI -> Kotlin 骨架）/ iOS（Swift 骨架接入前 synthetic）/ desktop|web no-op。
//!
//! 语义（#611 验收「不统一伪造 ready」）：
//! - Android：真实 JNI 调用 Kotlin `HbutBackgroundPlugin.runNow`，成败如实返回；
//! - iOS：Swift 骨架已提供同构实现（ios/ 目录），Rust 侧在 #613 接入 FFI 前返回平台真实 synthetic；
//! - desktop/web：返回 None，由上层给出明确 unsupported/no-op 语义，应用不崩溃。

use crate::dto::{BackgroundPlatform, BackgroundSource, RunSummary};
use crate::state::NativeRunner;

/// 真实 native 执行器（注入 PluginState.perform_run_now）。
pub struct MobileRunner {
    platform: BackgroundPlatform,
}

impl MobileRunner {
    pub fn new(platform: BackgroundPlatform) -> Self {
        Self { platform }
    }
}

impl NativeRunner for MobileRunner {
    fn run_native(&self, scope: &Option<String>, force_synthetic: bool) -> Option<RunSummary> {
        dispatch_native(self.platform, scope, force_synthetic)
    }
}

/// 平台分派：仅当前编译平台对应分支可解析（Windows 只编译 desktop 分支）。
fn dispatch_native(
    platform: BackgroundPlatform,
    scope: &Option<String>,
    force_synthetic: bool,
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
            return ios::run_native();
        }
    }
    // desktop/web（或跨平台测试构造的移动平台值）：无 native 承载，返回 None 由上层降级。
    let _ = (platform, scope, force_synthetic);
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

/// Android 分支：JNI 调用 Kotlin 骨架（仅 android target 编译；Windows 不参与构建/clippy）。
#[cfg(target_os = "android")]
mod android {
    use jni::objects::JObject;
    use jni::sys::{jboolean, jobject};
    use jni::{JNIEnv, JavaVM};

    use crate::dto::RunSummary;

    /// Kotlin 骨架 FQCN（android/ 目录内 HbutBackgroundPlugin object）。
    const KOTLIN_CLASS: &str = "com/hbut/mini/background/HbutBackgroundPlugin";

    /// 调用 Kotlin `runNow(context, scope, forceSynthetic)` 静态方法，解析 JSON 摘要返回。
    /// 任何 JNI 失败都如实返回失败摘要（不伪造 ready），由上层写入 state.error。
    pub fn run_native(scope: &Option<String>, force_synthetic: bool) -> Option<RunSummary> {
        let vm_ptr = ndk_context::android_context()
            .vm()
            .cast::<jni::sys::JavaVM>();
        // JavaVM 全局引用：进程生命周期有效，无需 detach。
        let vm = unsafe { JavaVM::from_raw(vm_ptr) };
        let vm = match vm {
            Ok(vm) => vm,
            Err(e) => return Some(RunSummary::failed(format!("获取 Android JavaVM 失败: {e}"))),
        };
        let mut env = match vm.attach_current_thread() {
            Ok(env) => env,
            Err(e) => return Some(RunSummary::failed(format!("附加 JNI 线程失败: {e}"))),
        };
        let class = match env.find_class(KOTLIN_CLASS) {
            Ok(class) => class,
            Err(e) => {
                return Some(RunSummary::failed(format!(
                    "找不到 Kotlin 插件类 {KOTLIN_CLASS}（骨架未集成进 app 工程）: {e}"
                )))
            }
        };

        // 参数组装：(Context, String|null, boolean)
        let context_ptr = ndk_context::android_context().context() as jobject;
        let context = unsafe { JObject::from_raw(context_ptr) };
        let scope_java = match scope {
            Some(s) => match env.new_string(s) {
                Ok(str) => str.into(),
                Err(_) => JObject::null(),
            },
            None => JObject::null(),
        };

        let result = env.call_static_method(
            class,
            "runNow",
            "(Landroid/content/Context;Ljava/lang/String;Z)Ljava/lang/String;",
            &[
                jni::objects::JValue::Object(&context),
                jni::objects::JValue::Object(&scope_java),
                jni::objects::JValue::Bool(force_synthetic as jboolean),
            ],
        );
        match result {
            Ok(jni::objects::JValue::Object(obj)) => {
                let string = match env.get_string(&obj.into()) {
                    Ok(s) => s,
                    Err(e) => {
                        return Some(RunSummary::failed(format!(
                            "读取 Kotlin 返回字符串失败: {e}"
                        )))
                    }
                };
                parse_summary(string.to_str().unwrap_or_default())
            }
            Ok(_) => Some(RunSummary::failed("Kotlin runNow 返回类型异常")),
            Err(e) => Some(RunSummary::failed(format!("Kotlin runNow 调用失败: {e}"))),
        }
    }

    /// 解析 Kotlin 返回的 JSON 摘要；解析失败如实报错（不伪造成功）。
    fn parse_summary(json: &str) -> Option<RunSummary> {
        match serde_json::from_str::<RunSummary>(json) {
            Ok(summary) => Some(summary),
            Err(e) => Some(RunSummary::failed(format!("Kotlin 摘要解析失败: {e}"))),
        }
    }
}

/// iOS 分支：Swift 骨架（ios/ 目录）与 Rust DTO 同构；#613 接入 BGAppRefresh 后在此改 FFI 调用。
#[cfg(target_os = "ios")]
mod ios {
    use crate::dto::RunSummary;

    pub fn run_native() -> Option<RunSummary> {
        // 平台真实存在（source=Ios），但骨架阶段业务为 synthetic；
        // 返回信息不含任何 scope/敏感字段（日志安全约束）。
        Some(RunSummary::synthetic(
            "iOS native 承载就绪（BGAppRefresh 接入由 #613 完成），本次为 synthetic 结果",
        ))
    }
}
