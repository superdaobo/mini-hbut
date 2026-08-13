// 与 Rust dto.rs 对齐的 DTO 模型（schema/version 契约的 Kotlin 端）。
// 字段名 camelCase，与 contract-fixtures/ 与 Swift/Rust 保持一致。
// 注意：本文件不引入 kotlinx.serialization，手写 org.json 编解码，
// 以保证 Android 平台（org.json 内置）与 JVM 单测行为一致。

package com.hbut.mini.background

import org.json.JSONArray
import org.json.JSONObject

/** 当前插件数据 schema 版本（与 Rust BG_SCHEMA_VERSION 对齐）。 */
const val BG_SCHEMA_VERSION: Int = 1

/** 事件 inbox 容量上限（与 Rust EVENT_INBOX_CAP 对齐）。 */
const val EVENT_INBOX_CAP: Int = 50

/** 平台（JSON 值为 snake_case 字符串）。 */
enum class BackgroundPlatform(val wire: String) {
    DESKTOP("desktop"),
    ANDROID("android"),
    IOS("ios"),
    WEB("web");

    companion object {
        fun fromWire(value: String?): BackgroundPlatform =
            entries.firstOrNull { it.wire == value } ?: DESKTOP
    }
}

/** 状态/事件来源。 */
enum class BackgroundSource(val wire: String) {
    NONE("none"),
    RUST("rust"),
    ANDROID("android"),
    IOS("ios");

    companion object {
        fun fromWire(value: String?): BackgroundSource =
            entries.firstOrNull { it.wire == value } ?: NONE
    }
}

/** 用户后台配置（configure 入参 + 落盘对象）。 */
data class BackgroundConfig(
    val schema: Int,
    val enabled: Boolean,
    val intervalMinutes: Int?,
    val business: List<String>,
    val scope: String?,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("schema", schema)
        put("enabled", enabled)
        put("intervalMinutes", intervalMinutes)
        put("business", JSONArray(business))
        put("scope", scope)
    }

    companion object {
        fun fromJson(obj: JSONObject): BackgroundConfig = BackgroundConfig(
            schema = obj.getInt("schema"),
            enabled = obj.optBoolean("enabled", false),
            intervalMinutes = if (obj.isNull("intervalMinutes")) null else obj.optInt("intervalMinutes", 30),
            business = obj.optJSONArray("business")?.let { arr ->
                (0 until arr.length()).map { arr.getString(it) }
            } ?: emptyList(),
            scope = if (obj.isNull("scope")) null else obj.optString("scope"),
        )
    }
}

/** 后台执行最小上下文（syncContext 入参；不含任何敏感材料）。 */
data class BackgroundContext(
    val schema: Int,
    val scope: String,
    val business: List<String>,
    val updatedAt: String,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("schema", schema)
        put("scope", scope)
        put("business", JSONArray(business))
        put("updatedAt", updatedAt)
    }

    companion object {
        fun fromJson(obj: JSONObject): BackgroundContext = BackgroundContext(
            schema = obj.getInt("schema"),
            scope = obj.getString("scope"),
            business = obj.optJSONArray("business")?.let { arr ->
                (0 until arr.length()).map { arr.getString(it) }
            } ?: emptyList(),
            updatedAt = obj.optString("updatedAt"),
        )
    }
}

/** 统一后台检查状态（getState 返回）。 */
data class BackgroundCheckState(
    val schema: Int,
    val platform: BackgroundPlatform,
    val source: BackgroundSource,
    val enabled: Boolean,
    val configured: Boolean,
    val scope: String?,
    val lastRunAt: String?,
    val lastRunOk: Boolean?,
    val pendingEvents: Int,
    val error: String?,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("schema", schema)
        put("platform", platform.wire)
        put("source", source.wire)
        put("enabled", enabled)
        put("configured", configured)
        put("scope", scope)
        put("lastRunAt", lastRunAt)
        put("lastRunOk", lastRunOk)
        put("pendingEvents", pendingEvents)
        put("error", error)
    }

    companion object {
        /** 初始状态（平台/来源为真实值，不伪造 ready）。 */
        fun initial(platform: BackgroundPlatform, source: BackgroundSource): BackgroundCheckState =
            BackgroundCheckState(
                schema = BG_SCHEMA_VERSION,
                platform = platform,
                source = source,
                enabled = false,
                configured = false,
                scope = null,
                lastRunAt = null,
                lastRunOk = null,
                pendingEvents = 0,
                error = null,
            )

        fun fromJson(obj: JSONObject): BackgroundCheckState = BackgroundCheckState(
            schema = obj.getInt("schema"),
            platform = BackgroundPlatform.fromWire(obj.optString("platform")),
            source = BackgroundSource.fromWire(obj.optString("source")),
            enabled = obj.optBoolean("enabled", false),
            configured = obj.optBoolean("configured", false),
            scope = if (obj.isNull("scope")) null else obj.optString("scope"),
            lastRunAt = if (obj.isNull("lastRunAt")) null else obj.optString("lastRunAt"),
            lastRunOk = if (obj.isNull("lastRunOk")) null else obj.optBoolean("lastRunOk"),
            pendingEvents = obj.optInt("pendingEvents", 0),
            error = if (obj.isNull("error")) null else obj.optString("error"),
        )
    }
}

/** 后台事件（event inbox 条目）。 */
data class BackgroundEvent(
    val schema: Int,
    val id: String,
    val source: BackgroundSource,
    val kind: String,
    val scope: String?,
    val occurredAt: String,
    val payload: JSONObject,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("schema", schema)
        put("id", id)
        put("source", source.wire)
        put("kind", kind)
        put("scope", scope)
        put("occurredAt", occurredAt)
        put("payload", payload)
    }

    companion object {
        fun fromJson(obj: JSONObject): BackgroundEvent = BackgroundEvent(
            schema = obj.getInt("schema"),
            id = obj.getString("id"),
            source = BackgroundSource.fromWire(obj.optString("source")),
            kind = obj.optString("kind"),
            scope = if (obj.isNull("scope")) null else obj.optString("scope"),
            occurredAt = obj.optString("occurredAt"),
            payload = obj.optJSONObject("payload") ?: JSONObject(),
        )
    }
}

/** consumeEvents 返回结构。 */
data class ConsumeEventsResult(
    val schema: Int,
    val events: List<BackgroundEvent>,
    val remaining: Int,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("schema", schema)
        put("events", JSONArray(events.map { it.toJson() }))
        put("remaining", remaining)
    }

    companion object {
        fun fromJson(obj: JSONObject): ConsumeEventsResult = ConsumeEventsResult(
            schema = obj.getInt("schema"),
            events = obj.optJSONArray("events")?.let { arr ->
                (0 until arr.length()).map { BackgroundEvent.fromJson(arr.getJSONObject(it)) }
            } ?: emptyList(),
            remaining = obj.optInt("remaining", 0),
        )
    }
}

/** runNow 单次执行摘要（Rust JNI 端解析本 JSON；不得含敏感字段）。 */
data class RunSummary(
    val ok: Boolean,
    val synthetic: Boolean,
    val eventsProduced: Int,
    val message: String?,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("schema", BG_SCHEMA_VERSION)
        put("ok", ok)
        put("synthetic", synthetic)
        put("eventsProduced", eventsProduced)
        put("message", message)
    }

    companion object {
        fun synthetic(message: String): RunSummary =
            RunSummary(ok = true, synthetic = true, eventsProduced = 1, message = message)

        fun failed(message: String): RunSummary =
            RunSummary(ok = false, synthetic = false, eventsProduced = 0, message = message)

        fun fromJson(obj: JSONObject): RunSummary = RunSummary(
            ok = obj.optBoolean("ok", false),
            synthetic = obj.optBoolean("synthetic", false),
            eventsProduced = obj.optInt("eventsProduced", 0),
            message = if (obj.isNull("message")) null else obj.optString("message"),
        )
    }
}
