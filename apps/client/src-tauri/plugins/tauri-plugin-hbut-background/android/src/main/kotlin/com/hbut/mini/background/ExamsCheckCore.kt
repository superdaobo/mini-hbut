// ExamsCheckCore —— 考试安排变化检测核心编排（#615 Part A）。
//
// 与 #612 GradesCheckCore 同构：读取 config/context -> 拉取考试 -> 计算 signature ->
// baseline/diff -> 变化时写 exams_changed event + 本地通知。纯 JVM 代码
// （依赖注入 fetcher/notifier），单测用 fake 覆盖全部分支。
//
// 语义（#615 考试变化验收）：
// - baseline 不存在 -> 保存当前 signature，lastResult=baselined，不发通知（首次不推历史）；
// - current == baseline -> 更新 lastSuccessAt，不通知（同 signature 不重复）；
// - current != baseline 且未通知过该 signature -> 写 event + 通知，更新 baseline；
// - current != baseline 但该 signature 已通知过（retry/重复调度）-> 只更新 baseline，不重复通知；
// - 最小冷却：lastAttemptAt 在冷却窗口内 -> cooldown（不联网，防 runNow/周期/重复调度连环请求）。
//
// 错误映射（与 #612 对齐）：
// - 网络不可用/临时失败 -> network-error（允许带退避 retry）；
// - auth/会话过期 -> auth-expired（不 retry，等待 App 恢复会话刷新 context）；
// - 解析失败/业务错误 -> parse-error（不更新 baseline，不误报，不 retry）；
// - 功能关闭/context 缺失 -> no-op（立即安全退出）。
// 日志与 event 严禁包含 cookie/header/完整响应体等敏感字段。

package com.hbut.mini.background

import org.json.JSONObject

/** 考试拉取结果（fetcher 层分类；不携带任何敏感字段）。 */
sealed class ExamsFetchResult {
    /** 网络层成功：原始 HTTP 响应交解析层处理。 */
    data class Response(val response: HttpResponse) : ExamsFetchResult()

    /** 网络层失败（无网/超时/HTTP 状态异常等），已分类。 */
    data class Failure(val kind: GradesErrorKind, val summary: String) : ExamsFetchResult()
}

/** 考试数据源（Worker 用真实 HTTP 实现；单测用 fake）。 */
interface ExamsDataFetcher {
    /** 同步拉取考试数据（调用方负责在 IO 线程执行）。 */
    fun fetch(scope: String): ExamsFetchResult
}

/** 考试变化通知发送器（Worker 用系统通知实现；单测用 fake）。 */
interface ExamsNotifier {
    /** 发送考试安排变化通知；权限关闭/系统失败返回 false（不抛异常，不得误判为检查失败）。 */
    fun notifyExamsChanged(scope: String, signature: String): Boolean
}

/** 检查结果（Worker 据此决定 retry/no-retry）。 */
sealed class ExamsCheckOutcome {
    /** 功能关闭或无 context：立即 no-op（Worker success 退出，不联网）。 */
    object NoOp : ExamsCheckOutcome()

    /** 最小冷却内：跳过本次请求（不联网）。 */
    object Cooldown : ExamsCheckOutcome()

    /** 首次成功：只建立 baseline，不发通知。 */
    object Baselined : ExamsCheckOutcome()

    /** 与 baseline 相同：不通知。 */
    object Unchanged : ExamsCheckOutcome()

    /** 同一变化已通知过（重试/重复调度）：不重复通知。 */
    object Deduplicated : ExamsCheckOutcome()

    /** 发现考试安排变化：已写 event + 已发送通知。 */
    data class Changed(val eventId: String, val notificationShown: Boolean) : ExamsCheckOutcome()

    /** 网络不可用/临时失败：允许带退避 retry。 */
    data class NetworkError(val summary: String) : ExamsCheckOutcome()

    /** auth/会话过期：不 retry，等待 App 恢复。 */
    data class AuthExpired(val summary: String) : ExamsCheckOutcome()

    /** 解析失败/业务错误：不更新 baseline，不 retry。 */
    data class ParseError(val summary: String) : ExamsCheckOutcome()
}

/** 考试变化检测核心编排（纯逻辑，无 Android 依赖）。 */
object ExamsCheckCore {

    const val EVENT_KIND = "exams_changed"

    /** 进程内串行化锁：防并发 runCheck 对同一变化重复通知（与 GradesCheckCore 同模式）。 */
    private val CHECK_LOCK = Any()

    /**
     * 执行一次考试安排变化检测。
     *
     * @param store 插件存储（config/context/state/events，现有 #611）
     * @param runtime #615 扩展运行时（exams baseline/冷却/诊断）
     * @param fetcher 考试数据源
     * @param notifier 通知发送器
     * @param scopeOverride runNow 显式指定 scope（null 时用 context.scope）
     * @param cooldownMs 最小冷却（毫秒；<=0 表示不限制）
     */
    fun runCheck(
        store: BackgroundStore,
        runtime: BusinessRuntimeStore,
        fetcher: ExamsDataFetcher,
        notifier: ExamsNotifier,
        scopeOverride: String? = null,
        cooldownMs: Long = DEFAULT_COOLDOWN_MS,
    ): ExamsCheckOutcome {
        // 1. 功能开关：关闭或无 exams 业务 -> 立即 no-op（不联网）
        val config = store.loadConfig()
        if (!config.enabled || !config.business.contains("exams")) {
            saveResult(runtime, BusinessFeature.EXAMS, scopeOverride, RuntimeResult.NO_OP, null, null, null)
            return ExamsCheckOutcome.NoOp
        }
        // 2. context：缺失 -> 安全停止（等待 App 恢复后 syncContext）
        val context = store.loadContext()
        if (context == null || context.scope.isBlank()) {
            saveResult(runtime, BusinessFeature.EXAMS, scopeOverride, RuntimeResult.NO_OP, null, null, "后台 context 缺失，等待 App 恢复")
            return ExamsCheckOutcome.NoOp
        }
        val scope = scopeOverride ?: context.scope

        // 3. 最小冷却：窗口内跳过（不联网，防 runNow/周期/重复调度连环请求）
        val state = runtime.loadFeature(BusinessFeature.EXAMS)
        if (cooldownMs > 0 && state.lastAttemptAt != null && withinCooldown(state.lastAttemptAt, cooldownMs)) {
            runtime.saveFeature(
                BusinessFeature.EXAMS,
                state.copy(scope = scope, lastResult = BusinessRuntimeStore.RESULT_COOLDOWN),
            )
            return ExamsCheckOutcome.Cooldown
        }

        // 4. 标记尝试时间（冷却依据；锁外写，失败不阻断检查）。
        // 注意：此处不得重绑 scope——scope 一致性检查在 baseline diff 阶段完成，
        // 提前重绑会让旧账号状态被误认为「同账号」而跳过重置。
        runtime.saveFeature(BusinessFeature.EXAMS, state.copy(lastAttemptAt = nowRfc3339()))

        // 5. 拉取考试（fetcher 已做安全边界准备的最小请求）
        val fetchResult = try {
            fetcher.fetch(scope)
        } catch (e: Exception) {
            saveResult(runtime, BusinessFeature.EXAMS, scope, RuntimeResult.NETWORK_ERROR, null, null, "拉取考试异常: ${e.message}")
            return ExamsCheckOutcome.NetworkError("拉取考试异常: ${e.message}")
        }
        val response = when (fetchResult) {
            is ExamsFetchResult.Response -> fetchResult.response
            is ExamsFetchResult.Failure -> {
                when (fetchResult.kind) {
                    GradesErrorKind.NETWORK_ERROR -> {
                        saveResult(runtime, BusinessFeature.EXAMS, scope, RuntimeResult.NETWORK_ERROR, null, null, fetchResult.summary)
                        ExamsCheckOutcome.NetworkError(fetchResult.summary)
                    }
                    GradesErrorKind.AUTH_EXPIRED -> {
                        saveResult(runtime, BusinessFeature.EXAMS, scope, RuntimeResult.AUTH_EXPIRED, null, null, fetchResult.summary)
                        ExamsCheckOutcome.AuthExpired(fetchResult.summary)
                    }
                    GradesErrorKind.PARSE_ERROR -> {
                        saveResult(runtime, BusinessFeature.EXAMS, scope, RuntimeResult.PARSE_ERROR, null, null, fetchResult.summary)
                        ExamsCheckOutcome.ParseError(fetchResult.summary)
                    }
                }.let { return it }
            }
        }

        // 6. 解析 + signature
        val parsed = ExamsParser.parseResponse(response)
        val signature = when (parsed) {
            is ExamsParseResult.Error -> {
                when (parsed.kind) {
                    GradesErrorKind.AUTH_EXPIRED -> {
                        saveResult(runtime, BusinessFeature.EXAMS, scope, RuntimeResult.AUTH_EXPIRED, null, null, parsed.summary)
                        ExamsCheckOutcome.AuthExpired(parsed.summary)
                    }
                    GradesErrorKind.PARSE_ERROR -> {
                        saveResult(runtime, BusinessFeature.EXAMS, scope, RuntimeResult.PARSE_ERROR, null, null, parsed.summary)
                        ExamsCheckOutcome.ParseError(parsed.summary)
                    }
                    GradesErrorKind.NETWORK_ERROR -> {
                        saveResult(runtime, BusinessFeature.EXAMS, scope, RuntimeResult.NETWORK_ERROR, null, null, parsed.summary)
                        ExamsCheckOutcome.NetworkError(parsed.summary)
                    }
                }.let { return it }
            }
            is ExamsParseResult.Success -> ExamSignatureV1.compute(parsed.records)
        }

        // 7. baseline/diff（锁内串行化：防周期 work 与 runNow 并发对同一变化重复通知）
        return synchronized(CHECK_LOCK) {
            // 账号隔离防御：runtime 绑定的 scope 与当前不一致（旧账号残留）-> 重置
            var current = runtime.loadFeature(BusinessFeature.EXAMS)
            if (current.scope != null && current.scope != scope) {
                current = BusinessFeatureState.empty()
            }
            val baseline = current.baselineSignature
            val now = nowRfc3339()
            if (baseline == null) {
                // 首次成功：只建立 baseline，不发通知（#615 首次 baseline 不误报）
                runtime.saveFeature(
                    BusinessFeature.EXAMS,
                    current.copy(
                        scope = scope,
                        baselineSignature = signature,
                        baselineAt = now,
                        lastSuccessAt = now,
                        lastResult = RuntimeResult.BASELINED,
                        lastError = null,
                    ),
                )
                store.saveState(updatedState(store, ok = true, error = null))
                ExamsCheckOutcome.Baselined
            } else if (baseline == signature) {
                // 无变化：更新 lastSuccessAt（同 signature 不重复通知）
                runtime.saveFeature(
                    BusinessFeature.EXAMS,
                    current.copy(
                        scope = scope,
                        lastSuccessAt = now,
                        lastResult = RuntimeResult.UNCHANGED,
                        lastError = null,
                    ),
                )
                store.saveState(updatedState(store, ok = true, error = null))
                ExamsCheckOutcome.Unchanged
            } else if (signature == current.lastChangedKey) {
                // 有变化但该 signature 已通知过（异常路径防御，正常流程 baseline 已同步更新）
                runtime.saveFeature(
                    BusinessFeature.EXAMS,
                    current.copy(
                        scope = scope,
                        baselineSignature = signature,
                        baselineAt = now,
                        lastSuccessAt = now,
                        lastResult = RuntimeResult.DEDUPLICATED,
                        lastError = null,
                    ),
                )
                store.saveState(updatedState(store, ok = true, error = null))
                ExamsCheckOutcome.Deduplicated
            } else {
                // 新变化：写 exams_changed event + 本地通知
                val shown = try {
                    notifier.notifyExamsChanged(scope, signature)
                } catch (e: Exception) {
                    // 通知异常不允许使整个检查失败：视为未展示，检查仍成功
                    false
                }
                val event = buildEvent(scope, signature, shown, now)
                store.appendEvent(event)
                runtime.saveFeature(
                    BusinessFeature.EXAMS,
                    current.copy(
                        scope = scope,
                        baselineSignature = signature,
                        baselineAt = now,
                        lastSuccessAt = now,
                        lastResult = RuntimeResult.CHANGED,
                        lastError = null,
                        lastChangedKey = signature,
                        lastChangedAt = now,
                    ),
                )
                store.saveState(updatedState(store, ok = true, error = null))
                ExamsCheckOutcome.Changed(event.id, shown)
            }
        }
    }

    /** 构造 exams_changed 事件（payload 对齐 #609 BackgroundDetectedEvent 契约字段）。 */
    private fun buildEvent(scope: String, signature: String, shown: Boolean, now: String): BackgroundEvent {
        val payload = JSONObject().apply {
            put("type", "exams-changed")
            put("source", "android-workmanager")
            put("targetView", "exams")
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

    /** 更新 #611 BackgroundCheckState（lastRunAt/lastRunOk/error），保证 getState 链路可见。 */
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

    /** 记录 feature 诊断结果（非敏感）；cooldown 分支不覆盖 lastResult（由调用方单独处理）。 */
    private fun saveResult(
        runtime: BusinessRuntimeStore,
        feature: String,
        scope: String?,
        result: String,
        baseline: String?,
        successAt: String?,
        error: String?,
    ) {
        val current = runtime.loadFeature(feature)
        val now = nowRfc3339()
        runtime.saveFeature(
            feature,
            current.copy(
                scope = scope ?: current.scope,
                baselineSignature = baseline ?: current.baselineSignature,
                lastResult = result,
                lastError = error,
                lastSuccessAt = successAt ?: if (error == null) now else current.lastSuccessAt,
            ),
        )
    }

    /** 判断时间戳是否在冷却窗口内。 */
    private fun withinCooldown(lastAttemptAt: String, cooldownMs: Long): Boolean {
        val attempted = lastAttemptAt.removeSuffix("Z").toLongOrNull() ?: return false
        val nowSecs = System.currentTimeMillis() / 1000
        return (nowSecs - attempted) * 1000 < cooldownMs
    }

    /** RFC3339 简化格式（秒级 UTC，与插件/Rust 一致）。 */
    private fun nowRfc3339(): String = "${System.currentTimeMillis() / 1000}Z"

    /** 默认最小冷却：5 分钟（runNow/周期/重复调度不连环请求学校系统）。 */
    const val DEFAULT_COOLDOWN_MS: Long = 5 * 60 * 1000L

    private val EVENT_SEQ = java.util.concurrent.atomic.AtomicLong(0)
}
