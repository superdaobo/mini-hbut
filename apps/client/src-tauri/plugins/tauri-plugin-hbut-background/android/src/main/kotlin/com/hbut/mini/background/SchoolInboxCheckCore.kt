// SchoolInboxCheckCore —— 学校消息后台检测核心编排（#615 Part B）。
//
// 事件粒度：按「provider + message ID」生成稳定 eventKey（一次可新到多条消息，
// 不适合整列表 signature），保持 #23/#201 历史产品语义：
// - 首次 known-ID baseline：保存当前列表 IDs，不把历史消息批量推送；
// - 新消息：不在 known IDs + 当前标记未读（数据源提供可靠字段）+ 未被本端通知过
//   （notifiedKeys 兜底）才通知一次；
// - 已知/已读消息不会因为 context 重建/重复调度再次推送（knownIds 按 scope 持久化）；
// - 不同 provider/account 不串数据：ID 带 provider 前缀（portal:tzsjx:xxx /
//   chaoxing:notice:xxx），状态按 scope 隔离。
//
// provider 可用性（#615 验收：不受支持显示真实 unsupported，而不是静默假成功）：
// - portal：需 jwxt 会话 cookie 快照（现有 hbut_cookie_snapshot.json）；
// - chaoxing：需学习通通知 cookie 快照（hbut_notice_cookie_snapshot.json，
//   由 Rust 会话层写入；缺失时该 provider 标记 unsupported）；
// - 全部不可用 -> Unsupported 结果（不写事件、不通知、不算网络错误）。
//
// 失败隔离：本单元失败只影响 school 的 lastResult/lastError，不阻塞成绩/考试单元。
// 日志与 event 严禁包含 cookie/header/完整正文/敏感响应。

package com.hbut.mini.background

import org.json.JSONObject

/** 标准化学校消息（只保留 eventKey/通知渲染所需的最小字段；不存正文）。 */
data class SchoolMessageItem(
    /** 稳定 ID（provider 前缀）：portal:tzsjx:xxx / chaoxing:notice:xxx。 */
    val id: String,
    /** 短标题（通知渲染用，写入 event 前按长度上限截断）。 */
    val title: String,
    /** 是否已读（数据源提供可靠字段；true 的消息不通知）。 */
    val isRead: Boolean,
    /** provider 抽象值：portal / chaoxing。 */
    val provider: String,
    /** 创建时间（RFC3339/原始文本；可空，仅诊断用途）。 */
    val createdAt: String?,
)

/** 学校消息拉取结果。 */
sealed class SchoolInboxFetchResult {
    /** 成功：标准化消息列表 + 实际使用的 provider。 */
    data class Response(val items: List<SchoolMessageItem>, val provider: String) : SchoolInboxFetchResult()

    /** 失败分类（非敏感摘要）。 */
    data class Failure(val kind: SchoolInboxErrorKind, val summary: String) : SchoolInboxFetchResult()
}

/** 错误分类：网络临时失败/auth 过期/解析失败/provider 后台不可用。 */
enum class SchoolInboxErrorKind {
    /** 网络不可用/临时失败：允许带退避 retry。 */
    NETWORK_ERROR,
    /** 会话/auth 过期：不 retry，等待 App 恢复。 */
    AUTH_EXPIRED,
    /** 响应解析失败/业务错误：不更新 knownIds，不误报，不 retry。 */
    PARSE_ERROR,
    /** provider 在后台安全 context 下不可用（无 cookie 快照/不受支持）。 */
    UNSUPPORTED,
}

/** 学校消息数据源（Worker 用真实 HTTP 实现；单测用 fake）。 */
interface SchoolInboxDataFetcher {
    /** 同步拉取学校消息（调用方负责在 IO 线程执行）。 */
    fun fetch(scope: String): SchoolInboxFetchResult
}

/** 学校消息通知发送器（Worker 用系统通知实现；单测用 fake）。 */
interface SchoolInboxNotifier {
    /** 发送单条新消息通知；权限关闭/系统失败返回 false（不抛异常，不得误判为检查失败）。 */
    fun notifyNewMessage(scope: String, item: SchoolMessageItem): Boolean
}

/** 检查结果。 */
sealed class SchoolInboxCheckOutcome {
    /** 功能关闭或无 context：立即 no-op。 */
    object NoOp : SchoolInboxCheckOutcome()

    /** 最小冷却内：跳过本次请求。 */
    object Cooldown : SchoolInboxCheckOutcome()

    /** 首次成功：只建立 known-ID baseline，不推历史消息（#23/#201 语义）。 */
    object Baselined : SchoolInboxCheckOutcome()

    /** 无新消息（或新消息均已读）。 */
    object NoNewMessages : SchoolInboxCheckOutcome()

    /** 发现新未读消息：已写 event（每条一个）+ 已发送通知。 */
    data class Changed(val eventIds: List<String>, val notificationShown: Boolean) : SchoolInboxCheckOutcome()

    /** provider 后台不可用（无安全材料）：诚实标记，不算网络错误。 */
    data class Unsupported(val summary: String) : SchoolInboxCheckOutcome()

    /** 网络不可用/临时失败：允许带退避 retry。 */
    data class NetworkError(val summary: String) : SchoolInboxCheckOutcome()

    /** auth/会话过期：不 retry，等待 App 恢复。 */
    data class AuthExpired(val summary: String) : SchoolInboxCheckOutcome()

    /** 解析失败/业务错误：不更新 knownIds，不 retry。 */
    data class ParseError(val summary: String) : SchoolInboxCheckOutcome()
}

/** 学校消息检测核心编排（纯逻辑，无 Android 依赖）。 */
object SchoolInboxCheckCore {

    const val EVENT_KIND = "school_message"

    /** 进程内串行化锁（与 Grades/Exams 同模式）。 */
    private val CHECK_LOCK = Any()

    /**
     * 执行一次学校消息后台检测。
     *
     * @param store 插件存储（config/context/state/events）
     * @param runtime #615 扩展运行时（school knownIds/notifiedKeys/冷却/诊断）
     * @param fetcher 学校消息数据源
     * @param notifier 通知发送器
     * @param scopeOverride runNow 显式指定 scope（null 时用 context.scope）
     * @param cooldownMs 最小冷却（毫秒；<=0 表示不限制）
     */
    fun runCheck(
        store: BackgroundStore,
        runtime: BusinessRuntimeStore,
        fetcher: SchoolInboxDataFetcher,
        notifier: SchoolInboxNotifier,
        scopeOverride: String? = null,
        cooldownMs: Long = DEFAULT_COOLDOWN_MS,
    ): SchoolInboxCheckOutcome {
        // 1. 功能开关：关闭或无 school_inbox 业务 -> 立即 no-op（不联网）
        val config = store.loadConfig()
        if (!config.enabled || !config.business.contains("school_inbox")) {
            saveResult(runtime, scopeOverride, RuntimeResult.NO_OP, null)
            return SchoolInboxCheckOutcome.NoOp
        }
        // 2. context：缺失 -> 安全停止（等待 App 恢复后 syncContext）
        val context = store.loadContext()
        if (context == null || context.scope.isBlank()) {
            saveResult(runtime, scopeOverride, RuntimeResult.NO_OP, "后台 context 缺失，等待 App 恢复")
            return SchoolInboxCheckOutcome.NoOp
        }
        val scope = scopeOverride ?: context.scope

        // 3. 最小冷却：窗口内跳过（不联网）
        val state = runtime.loadFeature(BusinessFeature.SCHOOL)
        if (cooldownMs > 0 && state.lastAttemptAt != null && withinCooldown(state.lastAttemptAt, cooldownMs)) {
            runtime.saveFeature(
                BusinessFeature.SCHOOL,
                state.copy(scope = scope, lastResult = BusinessRuntimeStore.RESULT_COOLDOWN),
            )
            return SchoolInboxCheckOutcome.Cooldown
        }
        // 标记尝试时间（冷却依据；锁外写，失败不阻断检查）。
        // 注意：此处不得重绑 scope——scope 一致性检查在 known-ID diff 阶段完成，
        // 提前重绑会让旧账号状态被误认为「同账号」而跳过重置。
        runtime.saveFeature(BusinessFeature.SCHOOL, state.copy(lastAttemptAt = nowRfc3339()))

        // 4. 拉取（provider 由 fetcher 按可用性选择；全部不可用 -> Unsupported）
        val fetchResult = try {
            fetcher.fetch(scope)
        } catch (e: Exception) {
            saveResult(runtime, scope, RuntimeResult.NETWORK_ERROR, "拉取学校消息异常: ${e.message}")
            return SchoolInboxCheckOutcome.NetworkError("拉取学校消息异常: ${e.message}")
        }
        val (items, provider) = when (fetchResult) {
            is SchoolInboxFetchResult.Response -> fetchResult.items to fetchResult.provider
            is SchoolInboxFetchResult.Failure -> {
                when (fetchResult.kind) {
                    SchoolInboxErrorKind.NETWORK_ERROR -> {
                        saveResult(runtime, scope, RuntimeResult.NETWORK_ERROR, fetchResult.summary)
                        SchoolInboxCheckOutcome.NetworkError(fetchResult.summary)
                    }
                    SchoolInboxErrorKind.AUTH_EXPIRED -> {
                        saveResult(runtime, scope, RuntimeResult.AUTH_EXPIRED, fetchResult.summary)
                        SchoolInboxCheckOutcome.AuthExpired(fetchResult.summary)
                    }
                    SchoolInboxErrorKind.PARSE_ERROR -> {
                        saveResult(runtime, scope, RuntimeResult.PARSE_ERROR, fetchResult.summary)
                        SchoolInboxCheckOutcome.ParseError(fetchResult.summary)
                    }
                    SchoolInboxErrorKind.UNSUPPORTED -> {
                        // 诚实标记：provider 后台不可用（不是静默假成功，也不污染其他 feature）
                        runtime.saveFeature(
                            BusinessFeature.SCHOOL,
                            runtime.loadFeature(BusinessFeature.SCHOOL).copy(
                                scope = scope,
                                lastResult = BusinessRuntimeStore.RESULT_UNSUPPORTED,
                                lastError = fetchResult.summary,
                                unsupported = true,
                                provider = null,
                            ),
                        )
                        SchoolInboxCheckOutcome.Unsupported(fetchResult.summary)
                    }
                }.let { return it }
            }
        }

        // 5. known-ID diff（锁内串行化：防周期 work 与 runNow 并发对同一消息重复通知）
        return synchronized(CHECK_LOCK) {
            // 账号隔离防御：runtime 绑定的 scope 与当前不一致（旧账号残留）-> 重置
            var current = runtime.loadFeature(BusinessFeature.SCHOOL)
            if (current.scope != null && current.scope != scope) {
                current = BusinessFeatureState.empty()
            }
            val knownSet = current.knownIds.toSet()
            val isFirstSync = current.knownIds.isEmpty()
            val allIds = items.map { it.id }.filter { it.isNotBlank() }
            val now = nowRfc3339()

            if (isFirstSync) {
                // 首次成功：只建立 known-ID baseline，不推历史消息（#23/#201 语义）
                runtime.saveFeature(
                    BusinessFeature.SCHOOL,
                    current.copy(
                        scope = scope,
                        knownIds = allIds.take(BusinessRuntimeStore.KNOWN_IDS_CAP),
                        knownIdsAt = now,
                        lastSuccessAt = now,
                        lastResult = RuntimeResult.BASELINED,
                        lastError = null,
                        unsupported = false,
                        provider = provider,
                    ),
                )
                store.saveState(updatedState(store, ok = true, error = null))
                SchoolInboxCheckOutcome.Baselined
            } else {
                // 新消息：不在 known IDs + 未读 + 未被本端通知过（notifiedKeys 兜底）
                val notifiedSet = current.notifiedKeys.toSet()
                val toNotify = items.filter { item ->
                    val id = item.id
                    id.isNotBlank() && !knownSet.contains(id) && !item.isRead && !notifiedSet.contains(id)
                }
                val eventIds = ArrayList<String>(toNotify.size)
                var shown = false
                for (item in toNotify) {
                    val shownNow = try {
                        notifier.notifyNewMessage(scope, item)
                    } catch (e: Exception) {
                        false // 通知异常不允许使整个检查失败
                    }
                    shown = shown || shownNow
                    val event = buildEvent(scope, item, shownNow, now)
                    store.appendEvent(event)
                    eventIds.add(event.id)
                }
                // 更新 knownIds（全量最新，上限 500）+ notifiedKeys（有界）
                val nextNotified = (current.notifiedKeys + toNotify.map { it.id })
                    .distinct()
                    .takeLast(BusinessRuntimeStore.NOTIFIED_KEYS_CAP)
                runtime.saveFeature(
                    BusinessFeature.SCHOOL,
                    current.copy(
                        scope = scope,
                        knownIds = allIds.take(BusinessRuntimeStore.KNOWN_IDS_CAP),
                        knownIdsAt = now,
                        lastSuccessAt = now,
                        lastResult = if (toNotify.isEmpty()) RuntimeResult.UNCHANGED else RuntimeResult.CHANGED,
                        lastError = null,
                        unsupported = false,
                        provider = provider,
                        lastChangedKey = toNotify.lastOrNull()?.id,
                        lastChangedAt = if (toNotify.isEmpty()) current.lastChangedAt else now,
                        notifiedKeys = nextNotified,
                    ),
                )
                store.saveState(updatedState(store, ok = true, error = null))
                if (toNotify.isEmpty()) {
                    SchoolInboxCheckOutcome.NoNewMessages
                } else {
                    SchoolInboxCheckOutcome.Changed(eventIds, shown)
                }
            }
        }
    }

    /** 构造单条 school_message 事件（不保存完整正文；title 有长度上限）。 */
    private fun buildEvent(scope: String, item: SchoolMessageItem, shown: Boolean, now: String): BackgroundEvent {
        val payload = JSONObject().apply {
            put("type", "school-message")
            put("source", "android-workmanager")
            put("targetView", "school_inbox")
            put("detectedAt", now)
            put("presented", shown)
            put("signature", item.id) // eventKey 载体：provider + message ID 的稳定组合
            put("meta", JSONObject()
                .put("provider", item.provider)
                .put("messageId", item.id)
                .put("title", item.title.take(TITLE_CAP))
                .put("notificationShown", shown))
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

    /** 更新 #611 BackgroundCheckState。 */
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

    /** 记录 feature 诊断结果（非敏感）。 */
    private fun saveResult(runtime: BusinessRuntimeStore, scope: String?, result: String, error: String?) {
        val current = runtime.loadFeature(BusinessFeature.SCHOOL)
        val now = nowRfc3339()
        runtime.saveFeature(
            BusinessFeature.SCHOOL,
            current.copy(
                scope = scope ?: current.scope,
                lastResult = result,
                lastError = error,
                lastSuccessAt = if (error == null) now else current.lastSuccessAt,
            ),
        )
    }

    private fun withinCooldown(lastAttemptAt: String, cooldownMs: Long): Boolean {
        val attempted = lastAttemptAt.removeSuffix("Z").toLongOrNull() ?: return false
        val nowSecs = System.currentTimeMillis() / 1000
        return (nowSecs - attempted) * 1000 < cooldownMs
    }

    private fun nowRfc3339(): String = "${System.currentTimeMillis() / 1000}Z"

    /** 事件 meta 中 title 的长度上限（通知渲染足够，防止正文混入 event store）。 */
    const val TITLE_CAP: Int = 60

    /** 默认最小冷却：5 分钟。 */
    const val DEFAULT_COOLDOWN_MS: Long = 5 * 60 * 1000L

    private val EVENT_SEQ = java.util.concurrent.atomic.AtomicLong(0)
}
