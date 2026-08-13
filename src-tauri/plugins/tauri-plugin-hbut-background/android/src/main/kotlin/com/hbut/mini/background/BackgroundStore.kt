// Kotlin 端持久化：与 Rust store.rs 语义对齐。
// - 目录构造（dir: File）与 Context 解耦：JVM 单测用临时目录，真机用 Context.filesDir；
// - 原子写：先写 .tmp-* 再 rename；
// - 损坏/版本不兼容：备份为 .corrupt-* 后降级，不 crash；
// - 容量上限：EVENT_INBOX_CAP，超出丢弃最旧；
// - scope 清理：账号切换/退出时完整清理 context/state/events。

package com.hbut.mini.background

import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/** 存储错误。 */
class StoreException(message: String, cause: Throwable? = null) : Exception(message, cause)

/** 插件数据目录内的文件名（与 Rust store.rs 一致，跨端契约的一部分）。 */
object StoreFiles {
    const val CONFIG = "config.json"
    const val CONTEXT = "context.json"
    const val STATE = "state.json"
    const val EVENTS = "events.json"
}

/** 落盘存储实现。 */
class BackgroundStore(private val dir: File) {

    init {
        if (!dir.exists() && !dir.mkdirs()) {
            throw StoreException("创建存储目录失败: $dir")
        }
    }

    fun dir(): File = dir

    private fun path(name: String): File = File(dir, name)

    // ---- config ----

    fun loadConfig(): BackgroundConfig {
        val obj = loadChecked<JSONObject>(StoreFiles.CONFIG) ?: return BackgroundConfig(
            schema = BG_SCHEMA_VERSION,
            enabled = false,
            intervalMinutes = 30,
            business = emptyList(),
            scope = null,
        )
        return BackgroundConfig.fromJson(obj)
    }

    fun saveConfig(config: BackgroundConfig) {
        saveAtomic(StoreFiles.CONFIG, config.toJson())
    }

    // ---- context ----

    fun loadContext(): BackgroundContext? {
        val obj = loadChecked<JSONObject>(StoreFiles.CONTEXT) ?: return null
        return BackgroundContext.fromJson(obj)
    }

    fun saveContext(context: BackgroundContext) {
        saveAtomic(StoreFiles.CONTEXT, context.toJson())
    }

    // ---- state ----

    fun loadState(): BackgroundCheckState? {
        val obj = loadChecked<JSONObject>(StoreFiles.STATE) ?: return null
        return BackgroundCheckState.fromJson(obj)
    }

    fun saveState(state: BackgroundCheckState) {
        saveAtomic(StoreFiles.STATE, state.toJson())
    }

    // ---- events ----

    fun loadEvents(): List<BackgroundEvent> {
        val arr = loadChecked<JSONArray>(StoreFiles.EVENTS) ?: return emptyList()
        return (0 until arr.length()).map { BackgroundEvent.fromJson(arr.getJSONObject(it)) }
    }

    fun saveEvents(events: List<BackgroundEvent>) {
        val kept = if (events.size > EVENT_INBOX_CAP) {
            events.subList(events.size - EVENT_INBOX_CAP, events.size)
        } else {
            events
        }
        saveAtomic(StoreFiles.EVENTS, JSONArray(kept.map { it.toJson() }))
    }

    fun appendEvent(event: BackgroundEvent) {
        saveEvents(loadEvents() + event)
    }

    /** 消费并移除事件；limit 为 null 时消费全部。 */
    fun consumeEvents(limit: Int?): ConsumeEventsResult {
        val events = loadEvents()
        val take = (limit ?: events.size).coerceAtMost(events.size)
        val consumed = events.subList(0, take)
        saveEvents(events.subList(take, events.size))
        return ConsumeEventsResult(BG_SCHEMA_VERSION, consumed, events.size - take)
    }

    // ---- scope 清理（账号切换/退出） ----

    /** 返回 (是否清除 context/state, 清除的事件数)。 */
    fun clearScope(scope: String): Pair<Boolean, Int> {
        var clearedAny = false
        loadContext()?.let { ctx ->
            if (ctx.scope == scope) {
                path(StoreFiles.CONTEXT).delete()
                clearedAny = true
            }
        }
        loadState()?.let { state ->
            if (state.scope == scope) {
                path(StoreFiles.STATE).delete()
                clearedAny = true
            }
        }
        val events = loadEvents()
        val kept = events.filter { it.scope != scope }
        saveEvents(kept)
        val removed = events.size - kept.size
        if (removed > 0) clearedAny = true
        return clearedAny to removed
    }

    // ---- 内部实现 ----

    /** 读取 + schema 版本校验；损坏/版本不兼容时备份后返回 null（安全降级）。 */
    private fun <T> loadChecked(name: String): T? {
        val file = path(name)
        if (!file.exists()) return null
        val text = try {
            file.readText()
        } catch (e: Exception) {
            return null
        }
        return try {
            @Suppress("UNCHECKED_CAST")
            val parsed = parseJson(text) as T
            val schema = (parsed as? JSONObject)?.optInt("schema")
                ?: (parsed as? JSONArray)?.let { arr ->
                    if (arr.length() > 0) arr.getJSONObject(0).optInt("schema") else BG_SCHEMA_VERSION
                }
            if (schema == BG_SCHEMA_VERSION) {
                parsed
            } else {
                backupCorrupt(name, file)
                null
            }
        } catch (e: Exception) {
            backupCorrupt(name, file)
            null
        }
    }

    private fun parseJson(text: String): Any {
        val trimmed = text.trim()
        return if (trimmed.startsWith("[")) JSONArray(trimmed) else JSONObject(trimmed)
    }

    /** 损坏/版本不兼容文件备份为 *.corrupt-<ts>。 */
    private fun backupCorrupt(name: String, file: File) {
        try {
            val backup = File(dir, "$name.corrupt-${System.currentTimeMillis()}")
            file.renameTo(backup)
        } catch (_: Exception) {
            // 备份失败不阻断降级路径
        }
    }

    /** 原子写：tmp 文件 + rename。 */
    private fun saveAtomic(name: String, value: Any) {
        val tmp = File(dir, "$name.tmp-${System.currentTimeMillis()}")
        tmp.writeText(value.toString())
        val target = path(name)
        if (!tmp.renameTo(target)) {
            tmp.delete()
            throw StoreException("原子写入失败: $name")
        }
    }
}
