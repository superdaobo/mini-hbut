// BusinessRuntimeStore —— #615 新增业务（考试变化/学校消息）的 Worker 运行时存储。
//
// 与 BackgroundRuntimeStore（#612 成绩专用）并存的扩展运行时：
// - 按 feature（"exams" / "school"）隔离：每个 feature 有独立 baseline/knownIds/
//   lastAttempt/lastSuccess/lastResult/lastError（#615 验收：成绩/考试/学校消息
//   失败相互隔离，runtime state 能区分各项结果）；
// - cooldown 依据：lastAttemptAt（最小冷却，避免 runNow 与周期 Worker 重复请求）；
// - school knownIds：首次同步建立基线（不推历史），之后只对「新到且未读」通知；
//   notifiedKeys 为去重兜底（同一消息只通知一次）；
// - scope 绑定：账号切换/退出时按 scope 清理（#608 红线：旧账号状态不污染新账号）。
//
// 文件：business-runtime.json（schema 校验/原子写/损坏降级与 BackgroundRuntimeStore 同模式）。

package com.hbut.mini.background

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** feature 键：exams = 考试安排变化；school = 学校消息。 */
object BusinessFeature {
    const val EXAMS: String = "exams"
    const val SCHOOL: String = "school"
}

/** 单 feature 运行时状态（非敏感；禁止含认证材料）。 */
data class BusinessFeatureState(
    val schema: Int,
    /** 绑定的学生 scope（账号隔离）。 */
    val scope: String?,
    /** exams：考试 baseline signature；null = 尚未建立。 */
    val baselineSignature: String?,
    /** exams：baseline 建立时间（RFC3339）。 */
    val baselineAt: String?,
    /** school：已知消息 ID 列表（provider 前缀 ID，上限 500）。 */
    val knownIds: List<String>,
    /** school：最近一次 knownIds 更新时间（RFC3339）。 */
    val knownIdsAt: String?,
    /** school：最近一次使用的 provider（portal/chaoxing/unsupported）。 */
    val provider: String?,
    /** school：provider 在后台不可用（无安全材料/不受支持），诚实标记而非静默假成功。 */
    val unsupported: Boolean,
    /** 最近一次尝试时间（RFC3339；冷却依据）。 */
    val lastAttemptAt: String?,
    /** 最近一次成功时间（RFC3339）。 */
    val lastSuccessAt: String?,
    /** 最近一次执行结果（RuntimeResult 常量 + "cooldown"/"unsupported"）。 */
    val lastResult: String?,
    /** 最近一次错误摘要（非敏感）。 */
    val lastError: String?,
    /** 最近一次已通知的变化 signature/eventKey（去重兜底）。 */
    val lastChangedKey: String?,
    /** 最近一次变化通知时间（RFC3339）。 */
    val lastChangedAt: String?,
    /** school：最近已通知的 eventKey 列表（有界去重兜底，最多 NOTIFIED_KEYS_CAP 条）。 */
    val notifiedKeys: List<String>,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("schema", schema)
        put("scope", scope)
        put("baselineSignature", baselineSignature)
        put("baselineAt", baselineAt)
        put("knownIds", JSONArray(knownIds))
        put("knownIdsAt", knownIdsAt)
        put("provider", provider)
        put("unsupported", unsupported)
        put("lastAttemptAt", lastAttemptAt)
        put("lastSuccessAt", lastSuccessAt)
        put("lastResult", lastResult)
        put("lastError", lastError)
        put("lastChangedKey", lastChangedKey)
        put("lastChangedAt", lastChangedAt)
        put("notifiedKeys", JSONArray(notifiedKeys))
    }

    companion object {
        fun empty(): BusinessFeatureState = BusinessFeatureState(
            schema = BG_SCHEMA_VERSION,
            scope = null,
            baselineSignature = null,
            baselineAt = null,
            knownIds = emptyList(),
            knownIdsAt = null,
            provider = null,
            unsupported = false,
            lastAttemptAt = null,
            lastSuccessAt = null,
            lastResult = null,
            lastError = null,
            lastChangedKey = null,
            lastChangedAt = null,
            notifiedKeys = emptyList(),
        )

        fun fromJson(obj: JSONObject): BusinessFeatureState = BusinessFeatureState(
            schema = obj.getInt("schema"),
            scope = if (obj.isNull("scope")) null else obj.optString("scope"),
            baselineSignature = if (obj.isNull("baselineSignature")) null else obj.optString("baselineSignature"),
            baselineAt = if (obj.isNull("baselineAt")) null else obj.optString("baselineAt"),
            knownIds = obj.optJSONArray("knownIds")?.let { arr ->
                (0 until arr.length()).map { arr.getString(it) }
            } ?: emptyList(),
            knownIdsAt = if (obj.isNull("knownIdsAt")) null else obj.optString("knownIdsAt"),
            provider = if (obj.isNull("provider")) null else obj.optString("provider"),
            unsupported = obj.optBoolean("unsupported", false),
            lastAttemptAt = if (obj.isNull("lastAttemptAt")) null else obj.optString("lastAttemptAt"),
            lastSuccessAt = if (obj.isNull("lastSuccessAt")) null else obj.optString("lastSuccessAt"),
            lastResult = if (obj.isNull("lastResult")) null else obj.optString("lastResult"),
            lastError = if (obj.isNull("lastError")) null else obj.optString("lastError"),
            lastChangedKey = if (obj.isNull("lastChangedKey")) null else obj.optString("lastChangedKey"),
            lastChangedAt = if (obj.isNull("lastChangedAt")) null else obj.optString("lastChangedAt"),
            notifiedKeys = obj.optJSONArray("notifiedKeys")?.let { arr ->
                (0 until arr.length()).map { arr.getString(it) }
            } ?: emptyList(),
        )
    }
}

/** 全部 feature 的运行时表（business-runtime.json）。 */
data class BusinessRuntimeState(
    val schema: Int,
    /** feature 键 -> 状态。 */
    val features: Map<String, BusinessFeatureState>,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("schema", schema)
        val featuresJson = JSONObject()
        features.forEach { (key, state) -> featuresJson.put(key, state.toJson()) }
        put("features", featuresJson)
    }

    companion object {
        fun empty(): BusinessRuntimeState = BusinessRuntimeState(
            schema = BG_SCHEMA_VERSION,
            features = emptyMap(),
        )

        fun fromJson(obj: JSONObject): BusinessRuntimeState {
            val features = mutableMapOf<String, BusinessFeatureState>()
            obj.optJSONObject("features")?.let { featuresJson ->
                featuresJson.keys().forEach { key ->
                    val value = featuresJson.optJSONObject(key)
                    if (value != null) {
                        features[key] = BusinessFeatureState.fromJson(value)
                    }
                }
            }
            return BusinessRuntimeState(
                schema = obj.getInt("schema"),
                features = features,
            )
        }
    }
}

/** 扩展运行时存储（按 feature 读写；损坏/版本不兼容安全降级为空状态）。 */
class BusinessRuntimeStore(private val dir: File) {

    private val file: File = File(dir, BUSINESS_RUNTIME_FILE)

    fun load(): BusinessRuntimeState {
        if (!file.exists()) return BusinessRuntimeState.empty()
        return try {
            val obj = JSONObject(file.readText())
            if (obj.optInt("schema") == BG_SCHEMA_VERSION) {
                BusinessRuntimeState.fromJson(obj)
            } else {
                backupCorrupt()
                BusinessRuntimeState.empty()
            }
        } catch (e: Exception) {
            backupCorrupt()
            BusinessRuntimeState.empty()
        }
    }

    fun save(state: BusinessRuntimeState) {
        val tmp = File(dir, "$BUSINESS_RUNTIME_FILE.tmp-${System.currentTimeMillis()}")
        tmp.writeText(state.toJson().toString())
        try {
            try {
                java.nio.file.Files.move(
                    tmp.toPath(), file.toPath(),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                    java.nio.file.StandardCopyOption.ATOMIC_MOVE,
                )
            } catch (e: java.nio.file.AtomicMoveNotSupportedException) {
                java.nio.file.Files.move(
                    tmp.toPath(), file.toPath(),
                    java.nio.file.StandardCopyOption.REPLACE_EXISTING,
                )
            }
        } catch (e: Exception) {
            tmp.delete()
            throw StoreException("原子写入失败: $BUSINESS_RUNTIME_FILE")
        }
    }

    /** 读取指定 feature 状态（缺失返回空状态）。 */
    fun loadFeature(feature: String): BusinessFeatureState =
        load().features[feature] ?: BusinessFeatureState.empty()

    /** 更新指定 feature 状态（保留其他 feature 不变）。 */
    fun saveFeature(feature: String, state: BusinessFeatureState) {
        val current = load()
        val next = current.features.toMutableMap()
        next[feature] = state
        save(BusinessRuntimeState(BG_SCHEMA_VERSION, next))
    }

    /** 按 scope 清理（账号切换/退出）；命中返回 true。 */
    fun clearScope(scope: String): Boolean {
        val current = load()
        val matched = current.features.values.any { it.scope == scope }
        if (!matched) return false
        val next = current.features.filterValues { it.scope != scope }
        save(BusinessRuntimeState(BG_SCHEMA_VERSION, next))
        return true
    }

    private fun backupCorrupt() {
        try {
            file.renameTo(File(dir, "$BUSINESS_RUNTIME_FILE.corrupt-${System.currentTimeMillis()}"))
        } catch (_: Exception) {
            // 备份失败不阻断降级路径
        }
    }

    companion object {
        const val BUSINESS_RUNTIME_FILE: String = "business-runtime.json"

        /** school knownIds 上限（与前台 500 对齐，防无限增长）。 */
        const val KNOWN_IDS_CAP: Int = 500

        /** school 去重兜底 keys 上限（有界）。 */
        const val NOTIFIED_KEYS_CAP: Int = 500

        /** 运行时结果值：本次执行在最小冷却内，跳过请求。 */
        const val RESULT_COOLDOWN: String = "cooldown"

        /** 运行时结果值：provider 在后台不可用（无安全材料），诚实标记。 */
        const val RESULT_UNSUPPORTED: String = "unsupported"
    }
}
