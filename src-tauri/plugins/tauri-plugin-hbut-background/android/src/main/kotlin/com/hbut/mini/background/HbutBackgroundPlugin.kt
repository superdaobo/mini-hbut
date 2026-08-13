// Android JNI 入口：Rust（mobile.rs android 分支）通过静态方法调用本 object。
// JNI 签名契约（与 Rust 侧一致）：
//   runNow:      (Landroid/content/Context;Ljava/lang/String;Z)Ljava/lang/String;
//   configure:   (Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;
//   disable:     (Landroid/content/Context;Z)Ljava/lang/String;
//   syncContext: (Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;
//   getStateJson:(Landroid/content/Context;)Ljava/lang/String;
//   consumeEvents:(Landroid/content/Context;Ljava/lang/Integer;)Ljava/lang/String;
//   clearContext:(Landroid/content/Context;Ljava/lang/String;)Ljava/lang/String;
// 返回统一 JSON（Rust dto 可直接解析），失败返回 RunSummary.failed 摘要（不伪造成功）。
//
// #612 接入：
// - configure/disable：保存配置后同步 WorkManager 唯一周期 work（enable/interval 变更不重复注册）；
// - runNow（非 synthetic）：走与周期 Worker 相同的 GradesCheckCore 真实核心（#612 验收）；
// - Worker 周期执行（App 不在运行）时由 GradesCheckWorker 直接写事件到插件 store；
//   runNow 场景事件同样落盘；Rust 内存 events 与盘的最终一致由 #614 Event Inbox 统一收口。
//
// 本文件依赖 android.content.Context，仅真机/模拟器编译（JVM 单测工程排除）。

package com.hbut.mini.background

import android.content.Context
import java.io.File

/** 插件入口（object 静态方法便于 JNI 调用）。 */
object HbutBackgroundPlugin {

    /** 数据目录：context.filesDir/background（与 Rust store 目录语义一致）。 */
    private fun storeFor(context: Context): BackgroundStore {
        val dir = File(context.filesDir, "background")
        return BackgroundStore(dir)
    }

    /**
     * runNow：开发/调试一次性执行入口。
     * forceSynthetic=true -> 强制 synthetic 摘要（跨端管道验证）；
     * forceSynthetic=false -> 走 GradesCheckCore 真实成绩变化检测（#612 验收：同一核心）。
     * 返回 RunSummary JSON（非敏感诊断）。
     */
    @JvmStatic
    fun runNow(context: Context, scope: String?, forceSynthetic: Boolean): String {
        val store = storeFor(context)
        val runtime = BackgroundRuntimeStore(store.dir())
        // 同步系统调度（enable/interval 变更在 runNow 时立即生效）
        try {
            GradesCheckScheduler.syncFromConfig(context, store.loadConfig())
        } catch (e: Exception) {
            // 调度同步失败不阻断 runNow 本体
        }
        return try {
            if (forceSynthetic) {
                RunSummary.synthetic("开发态强制 synthetic 运行（Android native）").toJson().toString()
            } else {
                // 真实核心：同一 fetcher/notifier 与周期 Worker 一致
                val fetcher = GradesHttpFetcher(File(context.filesDir, "hbut_cookie_snapshot.json"))
                val notifier = GradesNotificationSender(context)
                val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier, scope)
                when (outcome) {
                    is GradesCheckOutcome.NoOp ->
                        RunSummary.failed("后台检查未执行（功能关闭或无 context）")
                    is GradesCheckOutcome.Baselined ->
                        RunSummary(ok = true, synthetic = false, eventsProduced = 0,
                            message = "首次执行：已建立 baseline，未发送通知")
                    is GradesCheckOutcome.Unchanged ->
                        RunSummary(ok = true, synthetic = false, eventsProduced = 0,
                            message = "成绩无变化")
                    is GradesCheckOutcome.Deduplicated ->
                        RunSummary(ok = true, synthetic = false, eventsProduced = 0,
                            message = "该成绩变化已通知过（去重，不重复通知）")
                    is GradesCheckOutcome.Changed ->
                        RunSummary(ok = true, synthetic = false, eventsProduced = 1,
                            message = "发现成绩变化，已写 grades_changed 事件" +
                                "（notificationShown=${outcome.notificationShown}）")
                    is GradesCheckOutcome.NetworkError ->
                        RunSummary.failed("网络不可用（允许重试）: ${outcome.summary}")
                    is GradesCheckOutcome.AuthExpired ->
                        RunSummary.failed("会话已过期，等待 App 恢复登录: ${outcome.summary}")
                    is GradesCheckOutcome.ParseError ->
                        RunSummary.failed("成绩解析失败（不更新 baseline）: ${outcome.summary}")
                }.toJson().toString()
            }
        } catch (e: Exception) {
            RunSummary.failed("Kotlin runNow 失败: ${e.message}").toJson().toString()
        }
    }

    /** configure：保存配置 JSON + 同步唯一周期 work；返回回显 JSON。 */
    @JvmStatic
    fun configure(context: Context, configJson: String): String {
        val store = storeFor(context)
        return try {
            val config = BackgroundConfig.fromJson(org.json.JSONObject(configJson))
            store.saveConfig(config)
            // #612：enable/interval 变更 -> 唯一 work UPDATE（不累积）；disable -> cancel
            GradesCheckScheduler.syncFromConfig(context, config)
            config.toJson().toString()
        } catch (e: Exception) {
            org.json.JSONObject()
                .put("schema", BG_SCHEMA_VERSION)
                .put("error", "configure 失败: ${e.message}")
                .toString()
        }
    }

    /** disable：关闭调度（落盘 + cancel 唯一周期 work）；返回状态 JSON。 */
    @JvmStatic
    fun disable(context: Context, keepDiagnostics: Boolean): String {
        val store = storeFor(context)
        return try {
            val config = store.loadConfig().copy(enabled = false)
            store.saveConfig(config)
            GradesCheckScheduler.cancelPeriodic(context)
            val state = (store.loadState()
                ?: BackgroundCheckState.initial(BackgroundPlatform.ANDROID, BackgroundSource.ANDROID))
                .copy(enabled = false)
            store.saveState(state)
            state.toJson().toString()
        } catch (e: Exception) {
            RunSummary.failed("Kotlin disable 失败: ${e.message}").toJson().toString()
        }
    }

    /** syncContext：保存非敏感上下文 JSON（敏感材料禁止进入）。 */
    @JvmStatic
    fun syncContext(context: Context, contextJson: String): String {
        val store = storeFor(context)
        return try {
            val ctx = BackgroundContext.fromJson(org.json.JSONObject(contextJson))
            if (ctx.scope.isBlank()) {
                return org.json.JSONObject()
                    .put("schema", BG_SCHEMA_VERSION)
                    .put("error", "context.scope 不能为空")
                    .toString()
            }
            store.saveContext(ctx)
            ctx.toJson().toString()
        } catch (e: Exception) {
            org.json.JSONObject()
                .put("schema", BG_SCHEMA_VERSION)
                .put("error", "syncContext 失败: ${e.message}")
                .toString()
        }
    }

    /** getStateJson：返回统一状态 JSON（真实 Android 平台/来源）。 */
    @JvmStatic
    fun getStateJson(context: Context): String {
        val store = storeFor(context)
        return try {
            val base = store.loadState()
                ?: BackgroundCheckState.initial(BackgroundPlatform.ANDROID, BackgroundSource.ANDROID)
            base.copy(
                pendingEvents = store.loadEvents().size,
                configured = true,
                enabled = store.loadConfig().enabled,
                scope = base.scope ?: store.loadContext()?.scope,
            ).toJson().toString()
        } catch (e: Exception) {
            BackgroundCheckState.initial(BackgroundPlatform.ANDROID, BackgroundSource.ANDROID)
                .copy(error = "getState 失败: ${e.message}")
                .toJson().toString()
        }
    }

    /** consumeEvents：消费 native inbox。 */
    @JvmStatic
    fun consumeEvents(context: Context, limit: Int?): String {
        val store = storeFor(context)
        return try {
            store.consumeEvents(limit).toJson().toString()
        } catch (e: Exception) {
            RunSummary.failed("Kotlin consumeEvents 失败: ${e.message}").toJson().toString()
        }
    }

    /** clearContext：按 scope 清理 context/state/events + Worker 运行时状态（账号切换/退出）。 */
    @JvmStatic
    fun clearContext(context: Context, scope: String?): String {
        val store = storeFor(context)
        return try {
            val target = scope ?: store.loadState()?.scope ?: store.loadContext()?.scope
            if (target == null) {
                return org.json.JSONObject()
                    .put("schema", BG_SCHEMA_VERSION)
                    .put("cleared", false)
                    .put("removedEvents", 0)
                    .toString()
            }
            val (cleared, removed) = store.clearScope(target)
            // #612：切换账号后旧 baseline/运行时状态不污染新账号
            val runtimeCleared = BackgroundRuntimeStore(store.dir()).clearScope(target)
            org.json.JSONObject()
                .put("schema", BG_SCHEMA_VERSION)
                .put("cleared", cleared || runtimeCleared)
                .put("removedEvents", removed)
                .toString()
        } catch (e: Exception) {
            RunSummary.failed("Kotlin clearContext 失败: ${e.message}").toJson().toString()
        }
    }

    /** RFC3339 简化格式（秒级 UTC，与 Rust now_rfc3339 语义一致）。 */
    private fun nowRfc3339(): String {
        return "${System.currentTimeMillis() / 1000}Z"
    }
}
