// BackgroundRuntimeStore —— Worker 运行时状态（#612 新增）。
//
// 与 BackgroundStore（#611 config/context/state/events）并存的 Worker 专用存储：
// - baseline：首次成功检查建立的成绩 signature（null=尚未建立）；
// - lastChangedSignature：最近一次已通知过的变化 signature（Worker retry/重复调度去重兜底）；
// - lastResult/lastError/lastSuccessAt：诊断可观测状态（非敏感，禁止含认证材料）；
// - scope 绑定：账号切换/退出时按 scope 清理（#608 红线：旧账号 baseline 不污染新账号）。
//
// 文件：runtime-state.json（插件数据目录内，schema 校验/原子写/损坏降级与 BackgroundStore 同模式）。

package com.hbut.mini.background

import org.json.JSONObject
import java.io.File

/** 运行结果状态值（与 #609 BackgroundCheckResult 对齐的 native 内部版本）。 */
object RuntimeResult {
    /** 首次成功建立 baseline（不发通知）。 */
    const val BASELINED = "baselined"
    /** 与 baseline 相同，无变化。 */
    const val UNCHANGED = "unchanged"
    /** 检测到成绩变化并已通知。 */
    const val CHANGED = "changed"
    /** 同一变化已通知过（Worker 重试/重复调度，不重复通知）。 */
    const val DEDUPLICATED = "deduplicated"
    /** 网络不可用/临时失败（允许 retry）。 */
    const val NETWORK_ERROR = "network-error"
    /** 会话/auth 过期（不 retry，等待 App 恢复）。 */
    const val AUTH_EXPIRED = "auth-expired"
    /** 响应解析失败（不 retry，不更新 baseline）。 */
    const val PARSE_ERROR = "parse-error"
    /** 功能关闭/无 context（立即 no-op）。 */
    const val NO_OP = "no-op"
}

/** Worker 运行时状态（native 内部诊断 + 去重所需）。 */
data class BackgroundRuntimeState(
    val schema: Int,
    /** 绑定的学生 scope（账号隔离）。 */
    val scope: String?,
    /** 成绩 baseline signature；null = 尚未建立。 */
    val baselineSignature: String?,
    /** baseline 建立时间（RFC3339）。 */
    val baselineAt: String?,
    /** 最近一次成功检查时间（RFC3339）。 */
    val lastSuccessAt: String?,
    /** 最近一次执行结果（RuntimeResult 常量）。 */
    val lastResult: String?,
    /** 最近一次错误摘要（非敏感）。 */
    val lastError: String?,
    /** 最近一次已通知的变化 signature（去重兜底）。 */
    val lastChangedSignature: String?,
    /** 最近一次变化通知时间（RFC3339）。 */
    val lastChangedAt: String?,
) {
    fun toJson(): JSONObject = JSONObject().apply {
        put("schema", schema)
        put("scope", scope)
        put("baselineSignature", baselineSignature)
        put("baselineAt", baselineAt)
        put("lastSuccessAt", lastSuccessAt)
        put("lastResult", lastResult)
        put("lastError", lastError)
        put("lastChangedSignature", lastChangedSignature)
        put("lastChangedAt", lastChangedAt)
    }

    companion object {
        fun empty(): BackgroundRuntimeState = BackgroundRuntimeState(
            schema = BG_SCHEMA_VERSION,
            scope = null,
            baselineSignature = null,
            baselineAt = null,
            lastSuccessAt = null,
            lastResult = null,
            lastError = null,
            lastChangedSignature = null,
            lastChangedAt = null,
        )

        fun fromJson(obj: JSONObject): BackgroundRuntimeState = BackgroundRuntimeState(
            schema = obj.getInt("schema"),
            scope = if (obj.isNull("scope")) null else obj.optString("scope"),
            baselineSignature = if (obj.isNull("baselineSignature")) null else obj.optString("baselineSignature"),
            baselineAt = if (obj.isNull("baselineAt")) null else obj.optString("baselineAt"),
            lastSuccessAt = if (obj.isNull("lastSuccessAt")) null else obj.optString("lastSuccessAt"),
            lastResult = if (obj.isNull("lastResult")) null else obj.optString("lastResult"),
            lastError = if (obj.isNull("lastError")) null else obj.optString("lastError"),
            lastChangedSignature = if (obj.isNull("lastChangedSignature")) null else obj.optString("lastChangedSignature"),
            lastChangedAt = if (obj.isNull("lastChangedAt")) null else obj.optString("lastChangedAt"),
        )
    }
}

/** Worker 运行时存储。 */
class BackgroundRuntimeStore(private val dir: File) {

    private val file: File = File(dir, RUNTIME_STATE_FILE)

    /** 加载运行时状态；损坏/版本不兼容时备份后返回空状态（安全降级，不 crash）。 */
    fun load(): BackgroundRuntimeState {
        if (!file.exists()) return BackgroundRuntimeState.empty()
        return try {
            val obj = JSONObject(file.readText())
            if (obj.optInt("schema") == BG_SCHEMA_VERSION) {
                BackgroundRuntimeState.fromJson(obj)
            } else {
                backupCorrupt()
                BackgroundRuntimeState.empty()
            }
        } catch (e: Exception) {
            backupCorrupt()
            BackgroundRuntimeState.empty()
        }
    }

    fun save(state: BackgroundRuntimeState) {
        val tmp = File(dir, "$RUNTIME_STATE_FILE.tmp-${System.currentTimeMillis()}")
        tmp.writeText(state.toJson().toString())
        try {
            // 与 BackgroundStore 同模式：move 覆盖（File.renameTo 在 Windows 上无法覆盖已存在目标）
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
            throw StoreException("原子写入失败: $RUNTIME_STATE_FILE")
        }
    }

    /** 按 scope 清理（账号切换/退出）；匹配返回 true。 */
    fun clearScope(scope: String): Boolean {
        val state = load()
        if (state.scope != scope) return false
        file.delete()
        return true
    }

    private fun backupCorrupt() {
        try {
            file.renameTo(File(dir, "$RUNTIME_STATE_FILE.corrupt-${System.currentTimeMillis()}"))
        } catch (_: Exception) {
            // 备份失败不阻断降级路径
        }
    }

    companion object {
        const val RUNTIME_STATE_FILE: String = "runtime-state.json"
    }
}
