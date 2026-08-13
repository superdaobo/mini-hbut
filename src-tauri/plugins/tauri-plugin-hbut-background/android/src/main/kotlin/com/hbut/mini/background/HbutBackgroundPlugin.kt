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
// #615 接入：
// - 新增业务（考试变化/学校消息）使用独立唯一周期 work（BusinessChecksWorker），
//   与成绩 work 互不干扰；configure/disable 同时同步两个 work；
// - runNow（非 synthetic）顺序执行成绩/考试/学校消息三个 check unit（每 unit 独立失败隔离）；
// - clearContext 同时清理 #615 扩展运行时（business-runtime.json）。
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
     * forceSynthetic=false -> 顺序执行全部已启用 check unit 的真实核心
     * （#612 成绩 + #615 考试变化/学校消息；每 unit 独立失败隔离，互不阻塞）。
     * 返回 RunSummary JSON（非敏感诊断）。
     */
    @JvmStatic
    fun runNow(context: Context, scope: String?, forceSynthetic: Boolean): String {
        val store = storeFor(context)
        val runtime = BackgroundRuntimeStore(store.dir())
        val businessRuntime = BusinessRuntimeStore(store.dir())
        // 同步系统调度（enable/interval 变更在 runNow 时立即生效）
        try {
            GradesCheckScheduler.syncFromConfig(context, store.loadConfig())
            BusinessChecksScheduler.syncFromConfig(context, store.loadConfig())
        } catch (e: Exception) {
            // 调度同步失败不阻断 runNow 本体
        }
        return try {
            if (forceSynthetic) {
                RunSummary.synthetic("开发态强制 synthetic 运行（Android native）").toJson().toString()
            } else {
                runRealUnits(context, store, runtime, businessRuntime, scope)
            }
        } catch (e: Exception) {
            RunSummary.failed("Kotlin runNow 失败: ${e.message}").toJson().toString()
        }
    }

    /** 顺序执行成绩/考试/学校消息三个 check unit（每 unit 独立失败隔离）。 */
    private fun runRealUnits(
        context: Context,
        store: BackgroundStore,
        runtime: BackgroundRuntimeStore,
        businessRuntime: BusinessRuntimeStore,
        scope: String?,
    ): String {
        val config = store.loadConfig()
        val businessConfig = config.business
        var eventsProduced = 0
        val messages = ArrayList<String>()
        var hasError = false

        // 1. 成绩（#612 既有核心，保持不变）
        if (config.enabled && businessConfig.contains("grades")) {
            val fetcher = GradesHttpFetcher(File(context.filesDir, "hbut_cookie_snapshot.json"))
            val notifier = GradesNotificationSender(context)
            val outcome = GradesCheckCore.runCheck(store, runtime, fetcher, notifier, scope)
            when (outcome) {
                is GradesCheckOutcome.Changed -> {
                    eventsProduced += 1
                    messages.add("成绩变化已通知（notificationShown=${outcome.notificationShown}）")
                }
                is GradesCheckOutcome.Baselined -> messages.add("成绩：首次执行已建立 baseline")
                is GradesCheckOutcome.Unchanged -> messages.add("成绩无变化")
                is GradesCheckOutcome.Deduplicated -> messages.add("成绩变化已通知过（去重）")
                is GradesCheckOutcome.NetworkError -> {
                    hasError = true
                    messages.add("成绩检查网络不可用: ${outcome.summary}")
                }
                is GradesCheckOutcome.AuthExpired -> {
                    hasError = true
                    messages.add("成绩会话过期: ${outcome.summary}")
                }
                is GradesCheckOutcome.ParseError -> {
                    hasError = true
                    messages.add("成绩解析失败: ${outcome.summary}")
                }
                is GradesCheckOutcome.NoOp -> messages.add("成绩：未执行（功能关闭或无 context）")
            }
        }

        // 2. 考试安排变化（#615 Part A）
        if (config.enabled && businessConfig.contains("exams")) {
            val fetcher = ExamsHttpFetcher(File(context.filesDir, "hbut_cookie_snapshot.json"))
            val notifier = BusinessNotificationSender(context)
            val outcome = try {
                ExamsCheckCore.runCheck(store, businessRuntime, fetcher, notifier, scope)
            } catch (e: Exception) {
                ExamsCheckOutcome.NetworkError("Worker 考试检查异常: ${e.message}")
            }
            when (outcome) {
                is ExamsCheckOutcome.Changed -> {
                    eventsProduced += 1
                    messages.add("考试安排变化已通知（notificationShown=${outcome.notificationShown}）")
                }
                is ExamsCheckOutcome.Baselined -> messages.add("考试：首次执行已建立 baseline")
                is ExamsCheckOutcome.Unchanged -> messages.add("考试安排无变化")
                is ExamsCheckOutcome.Deduplicated -> messages.add("考试变化已通知过（去重）")
                is ExamsCheckOutcome.Cooldown -> messages.add("考试：冷却期内跳过")
                is ExamsCheckOutcome.NetworkError -> {
                    hasError = true
                    messages.add("考试检查网络不可用: ${outcome.summary}")
                }
                is ExamsCheckOutcome.AuthExpired -> {
                    hasError = true
                    messages.add("考试会话过期: ${outcome.summary}")
                }
                is ExamsCheckOutcome.ParseError -> {
                    hasError = true
                    messages.add("考试解析失败: ${outcome.summary}")
                }
                is ExamsCheckOutcome.NoOp -> messages.add("考试：未执行（功能关闭或无 context）")
            }
        }

        // 3. 学校消息（#615 Part B；provider 不可用 -> Unsupported 诚实标记）
        if (config.enabled && businessConfig.contains("school_inbox")) {
            val fetcher = SchoolInboxHttpFetcher(
                File(context.filesDir, "hbut_cookie_snapshot.json"),
                File(context.filesDir, "hbut_notice_cookie_snapshot.json"),
            )
            val notifier = BusinessNotificationSender(context)
            val outcome = try {
                SchoolInboxCheckCore.runCheck(store, businessRuntime, fetcher, notifier, scope)
            } catch (e: Exception) {
                SchoolInboxCheckOutcome.NetworkError("Worker 学校消息检查异常: ${e.message}")
            }
            when (outcome) {
                is SchoolInboxCheckOutcome.Changed -> {
                    eventsProduced += outcome.eventIds.size
                    messages.add("新学校消息 ${outcome.eventIds.size} 条已通知（notificationShown=${outcome.notificationShown}）")
                }
                is SchoolInboxCheckOutcome.Baselined -> messages.add("学校消息：首次执行已建立 known-ID baseline")
                is SchoolInboxCheckOutcome.NoNewMessages -> messages.add("学校消息无新消息")
                is SchoolInboxCheckOutcome.Cooldown -> messages.add("学校消息：冷却期内跳过")
                is SchoolInboxCheckOutcome.Unsupported -> {
                    // 诚实标记：不是静默假成功（#615 验收）
                    hasError = true
                    messages.add("学校消息后台检测不可用: ${outcome.summary}")
                }
                is SchoolInboxCheckOutcome.NetworkError -> {
                    hasError = true
                    messages.add("学校消息网络不可用: ${outcome.summary}")
                }
                is SchoolInboxCheckOutcome.AuthExpired -> {
                    hasError = true
                    messages.add("学校消息会话过期: ${outcome.summary}")
                }
                is SchoolInboxCheckOutcome.ParseError -> {
                    hasError = true
                    messages.add("学校消息解析失败: ${outcome.summary}")
                }
                is SchoolInboxCheckOutcome.NoOp -> messages.add("学校消息：未执行（功能关闭或无 context）")
            }
        }

        val summary = messages.joinToString("；")
        return if (hasError) {
            RunSummary.failed(summary).toJson().toString()
        } else {
            RunSummary(ok = true, synthetic = false, eventsProduced = eventsProduced, message = summary)
                .toJson().toString()
        }
    }

    /** configure：保存配置 JSON + 同步唯一周期 work（成绩 + #615 新增业务）；返回回显 JSON。 */
    @JvmStatic
    fun configure(context: Context, configJson: String): String {
        val store = storeFor(context)
        return try {
            val config = BackgroundConfig.fromJson(org.json.JSONObject(configJson))
            store.saveConfig(config)
            // #612：enable/interval 变更 -> 唯一 work UPDATE（不累积）；disable -> cancel
            GradesCheckScheduler.syncFromConfig(context, config)
            // #615：考试/学校消息 check unit 使用独立唯一周期 work（幂等）
            BusinessChecksScheduler.syncFromConfig(context, config)
            config.toJson().toString()
        } catch (e: Exception) {
            org.json.JSONObject()
                .put("schema", BG_SCHEMA_VERSION)
                .put("error", "configure 失败: ${e.message}")
                .toString()
        }
    }

    /** disable：关闭调度（落盘 + cancel 两个唯一周期 work）；返回状态 JSON。 */
    @JvmStatic
    fun disable(context: Context, keepDiagnostics: Boolean): String {
        val store = storeFor(context)
        return try {
            val config = store.loadConfig().copy(enabled = false)
            store.saveConfig(config)
            GradesCheckScheduler.cancelPeriodic(context)
            BusinessChecksScheduler.cancelPeriodic(context)
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
            // #615：考试/学校消息扩展运行时同样按 scope 清理
            val businessCleared = BusinessRuntimeStore(store.dir()).clearScope(target)
            org.json.JSONObject()
                .put("schema", BG_SCHEMA_VERSION)
                .put("cleared", cleared || runtimeCleared || businessCleared)
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
