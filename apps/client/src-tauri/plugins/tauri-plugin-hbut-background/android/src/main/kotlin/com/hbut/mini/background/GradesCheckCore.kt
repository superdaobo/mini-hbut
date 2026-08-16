// GradesCheckCore —— 成绩变化检测核心编排（#612）。
//
// Worker（周期/runNow/一次性）共用同一核心：读取 config/context -> 拉取成绩 ->
// 计算 signature -> baseline/diff -> 变化时写 grades_changed event + 本地通知。
// 本文件为纯 JVM 代码（依赖注入 fetcher/notifier），单测用 fake 实现覆盖全部分支。
//
// 语义（#612 Baseline/Diff 验收）：
// - baseline 不存在 -> 保存当前 signature，lastResult=baselined，不发通知；
// - current == baseline -> 更新 lastSuccessAt，不通知；
// - current != baseline 且未通知过该 signature -> 写 event + 通知，更新 baseline；
// - current != baseline 但该 signature 已通知过（Worker retry/重复调度）-> 只更新 baseline，不重复通知。
//
// 错误映射（#612 网络与错误处理验收）：
// - 网络不可用/临时失败 -> network-error（允许带退避 retry）；
// - auth/会话过期 -> auth-expired（不 retry，等待 App 恢复会话刷新 context）；
// - 解析失败/业务错误 -> parse-error（不更新 baseline，不误报，不 retry）；
// - 功能关闭/context 缺失 -> no-op（立即安全退出）。
// 日志与 event 严禁包含 cookie/header/完整响应体等敏感字段。

package com.hbut.mini.background

import org.json.JSONObject

/** 数据拉取结果（fetcher 层分类；不携带任何敏感字段）。 */
sealed class GradesFetchResult {
    /** 网络层成功：原始 HTTP 响应交解析层处理。 */
    data class Response(val response: HttpResponse) : GradesFetchResult()

    /** 网络层失败（无网/超时/HTTP 状态异常等），已分类。 */
    data class Failure(val kind: GradesErrorKind, val summary: String) : GradesFetchResult()
}

/** 成绩数据源（Worker 用真实 HTTP 实现；单测用 fake）。 */
interface GradesDataFetcher {
    /** 同步拉取成绩数据（调用方负责在 IO 线程执行）。 */
    fun fetch(scope: String): GradesFetchResult
}

/** 成绩变化通知发送器（Worker 用系统通知实现；单测用 fake）。 */
interface GradesNotifier {
    /** 发送成绩变化通知；权限关闭/系统失败返回 false（不抛异常，不得误判为检查失败）。 */
    fun notifyGradeChanged(scope: String, signature: String): Boolean
}

/** 检查结果（Worker 据此决定 retry/no-retry）。 */
sealed class GradesCheckOutcome {
    /** 功能关闭或无 context：立即 no-op（Worker success 退出，不联网）。 */
    object NoOp : GradesCheckOutcome()

    /** 首次成功：只建立 baseline，不发通知。 */
    object Baselined : GradesCheckOutcome()

    /** 与 baseline 相同：不通知。 */
    object Unchanged : GradesCheckOutcome()

    /** 同一变化已通知过（重试/重复调度）：不重复通知。 */
    object Deduplicated : GradesCheckOutcome()

    /** 发现成绩变化：已写 event + 已发送通知。 */
    data class Changed(val eventId: String, val notificationShown: Boolean) : GradesCheckOutcome()

    /** 网络不可用/临时失败：允许 WorkManager 带退避 retry。 */
    data class NetworkError(val summary: String) : GradesCheckOutcome()

    /** auth/会话过期：不 retry，等待 App 恢复。 */
    data class AuthExpired(val summary: String) : GradesCheckOutcome()

    /** 解析失败/业务错误：不更新 baseline，不 retry。 */
    data class ParseError(val summary: String) : GradesCheckOutcome()
}

/** 核心编排（纯逻辑，无 Android 依赖）。 */
object GradesCheckCore {

    private const val EVENT_KIND = "grades_changed"

    /**
     * 进程内串行化锁：防并发 runCheck 对同一变化重复通知。
     * 场景：WorkManager 周期 work 与 runNow（不同 work 名）可能同时执行；
     * 若两者都读到旧 baseline 都会走「变化」分支。锁内做 baseline 比较/更新，
     * 先到者通知并更新 baseline，后到者命中 Unchanged，不重复通知。
     * 网络拉取/解析在锁外执行（不占用锁做 IO）。
     */
    private val CHECK_LOCK = Any()

    /**
     * 执行一次成绩变化检测。
     *
     * @param store 插件存储（config/context/state/events，现有 #611）
     * @param runtime 运行时存储（baseline/去重/诊断）
     * @param fetcher 成绩数据源
     * @param notifier 通知发送器
     * @param scopeOverride runNow 显式指定 scope（null 时用 context.scope）
     */
    fun runCheck(
        store: BackgroundStore,
        runtime: BackgroundRuntimeStore,
        fetcher: GradesDataFetcher,
        notifier: GradesNotifier,
        scopeOverride: String? = null,
    ): GradesCheckOutcome {
        // 1. 功能开关：关闭或无 grades 业务 -> 立即 no-op（不联网）
        val config = store.loadConfig()
        if (!config.enabled || !config.business.contains("grades")) {
            saveRuntimeResult(runtime, scopeOverride, RuntimeResult.NO_OP, null, null)
            return GradesCheckOutcome.NoOp
        }
        // 2. context：缺失 -> 安全停止（等待 App 恢复后 syncContext）
        val context = store.loadContext()
        if (context == null || context.scope.isBlank()) {
            saveRuntimeResult(runtime, scopeOverride, RuntimeResult.NO_OP, null, "后台 context 缺失，等待 App 恢复")
            return GradesCheckOutcome.NoOp
        }
        val scope = scopeOverride ?: context.scope

        // 3. 拉取成绩（fetcher 已做安全边界准备的最小请求；锁外执行 IO）
        val fetchResult = try {
            fetcher.fetch(scope)
        } catch (e: Exception) {
            saveRuntimeResult(runtime, scope, RuntimeResult.NETWORK_ERROR, null, "拉取成绩异常: ${e.message}")
            return GradesCheckOutcome.NetworkError("拉取成绩异常: ${e.message}")
        }
        val response = when (fetchResult) {
            is GradesFetchResult.Response -> fetchResult.response
            is GradesFetchResult.Failure -> {
                when (fetchResult.kind) {
                    GradesErrorKind.NETWORK_ERROR -> {
                        saveRuntimeResult(runtime, scope, RuntimeResult.NETWORK_ERROR, null, fetchResult.summary)
                        GradesCheckOutcome.NetworkError(fetchResult.summary)
                    }
                    GradesErrorKind.AUTH_EXPIRED -> {
                        saveRuntimeResult(runtime, scope, RuntimeResult.AUTH_EXPIRED, null, fetchResult.summary)
                        GradesCheckOutcome.AuthExpired(fetchResult.summary)
                    }
                    GradesErrorKind.PARSE_ERROR -> {
                        saveRuntimeResult(runtime, scope, RuntimeResult.PARSE_ERROR, null, fetchResult.summary)
                        GradesCheckOutcome.ParseError(fetchResult.summary)
                    }
                }.let { return it }
            }
        }

        // 5. 解析 + signature
        val parsed = GradesParser.parseResponse(response)
        val signature = when (parsed) {
            is GradesParseResult.Error -> {
                when (parsed.kind) {
                    GradesErrorKind.AUTH_EXPIRED -> {
                        saveRuntimeResult(runtime, scope, RuntimeResult.AUTH_EXPIRED, null, parsed.summary)
                        GradesCheckOutcome.AuthExpired(parsed.summary)
                    }
                    GradesErrorKind.PARSE_ERROR -> {
                        saveRuntimeResult(runtime, scope, RuntimeResult.PARSE_ERROR, null, parsed.summary)
                        GradesCheckOutcome.ParseError(parsed.summary)
                    }
                    GradesErrorKind.NETWORK_ERROR -> {
                        saveRuntimeResult(runtime, scope, RuntimeResult.NETWORK_ERROR, null, parsed.summary)
                        GradesCheckOutcome.NetworkError(parsed.summary)
                    }
                }.let { return it }
            }
            is GradesParseResult.Success -> GradeSignatureV1.compute(parsed.records)
        }

        // 6. baseline/diff（锁内串行化：防周期 work 与 runNow 并发对同一变化重复通知）
        return synchronized(CHECK_LOCK) {
            // 账号隔离防御：runtime 绑定的 scope 与当前不一致（旧账号残留）-> 重置
            var current = runtime.load()
            if (current.scope != null && current.scope != scope) {
                current = BackgroundRuntimeState.empty()
            }
            val baseline = current.baselineSignature
            val now = nowRfc3339()
            if (baseline == null) {
                // 首次成功：只建立 baseline，不发通知
                current = current.copy(
                    scope = scope,
                    baselineSignature = signature,
                    baselineAt = now,
                    lastSuccessAt = now,
                    lastResult = RuntimeResult.BASELINED,
                    lastError = null,
                )
                runtime.save(current)
                store.saveState(updatedState(store, ok = true, error = null))
                GradesCheckOutcome.Baselined
            } else if (baseline == signature) {
                // 无变化：更新 lastSuccessAt
                current = current.copy(
                    scope = scope,
                    lastSuccessAt = now,
                    lastResult = RuntimeResult.UNCHANGED,
                    lastError = null,
                )
                runtime.save(current)
                store.saveState(updatedState(store, ok = true, error = null))
                GradesCheckOutcome.Unchanged
            } else if (signature == current.lastChangedSignature) {
                // 有变化但该 signature 已通知过（异常路径防御，正常流程 baseline 已同步更新）
                current = current.copy(
                    scope = scope,
                    baselineSignature = signature,
                    baselineAt = now,
                    lastSuccessAt = now,
                    lastResult = RuntimeResult.DEDUPLICATED,
                    lastError = null,
                )
                runtime.save(current)
                store.saveState(updatedState(store, ok = true, error = null))
                GradesCheckOutcome.Deduplicated
            } else {
                // 新变化：写 grades_changed event + 本地通知
                val shown = try {
                    notifier.notifyGradeChanged(scope, signature)
                } catch (e: Exception) {
                    // 通知异常不允许使整个检查失败：视为未展示，检查仍成功
                    false
                }
                val event = buildEvent(scope, signature, shown, now)
                store.appendEvent(event)
                current = current.copy(
                    scope = scope,
                    baselineSignature = signature,
                    baselineAt = now,
                    lastSuccessAt = now,
                    lastResult = RuntimeResult.CHANGED,
                    lastError = null,
                    lastChangedSignature = signature,
                    lastChangedAt = now,
                )
                runtime.save(current)
                store.saveState(updatedState(store, ok = true, error = null))
                GradesCheckOutcome.Changed(event.id, shown)
            }
        }
    }

    /** 构造 grades_changed 事件（payload 对齐 #609 BackgroundDetectedEvent 契约字段）。 */
    private fun buildEvent(scope: String, signature: String, shown: Boolean, now: String): BackgroundEvent {
        val payload = JSONObject().apply {
            put("type", "grades-changed")
            put("source", "android-workmanager")
            put("targetView", "grades")
            put("detectedAt", now)
            put("presented", shown)
            put("signature", signature)
            put("meta", JSONObject().put("notificationShown", shown))
        }
        return BackgroundEvent(
            schema = BG_SCHEMA_VERSION,
            id = "evt-${System.currentTimeMillis()}-${EVENT_SEQ.incrementAndGet()}",
            source = BackgroundSource.ANDROID,
            kind = EVENT_KIND,
            scope = scope,
            occurredAt = now,
            payload = payload,
        )
    }

    /** 更新 #611 BackgroundCheckState（lastRunAt/lastRunOk/error），保证现有 getState 链路可见。 */
    private fun updatedState(store: BackgroundStore, ok: Boolean, error: String?): BackgroundCheckState {
        val base = store.loadState()
            ?: BackgroundCheckState.initial(BackgroundPlatform.ANDROID, BackgroundSource.ANDROID)
        return base.copy(
            lastRunAt = nowRfc3339(),
            lastRunOk = ok,
            error = error,
            enabled = store.loadConfig().enabled,
            scope = base.scope ?: store.loadContext()?.scope,
        )
    }

    /** 记录 runtime 诊断结果（非敏感）。 */
    private fun saveRuntimeResult(
        runtime: BackgroundRuntimeStore,
        scope: String?,
        result: String,
        baseline: String?,
        error: String?,
    ) {
        val current = runtime.load()
        val now = nowRfc3339()
        runtime.save(
            current.copy(
                scope = scope ?: current.scope,
                baselineSignature = baseline ?: current.baselineSignature,
                lastResult = result,
                lastError = error,
                lastSuccessAt = if (error == null) now else current.lastSuccessAt,
            )
        )
    }

    /** RFC3339 简化格式（秒级 UTC，与插件/Rust 一致）。 */
    private fun nowRfc3339(): String = "${System.currentTimeMillis() / 1000}Z"

    private val EVENT_SEQ = java.util.concurrent.atomic.AtomicLong(0)
}
