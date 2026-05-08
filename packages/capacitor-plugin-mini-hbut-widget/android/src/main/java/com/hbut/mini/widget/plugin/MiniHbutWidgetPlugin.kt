package com.hbut.mini.widget.plugin

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.hbut.mini.widget.WidgetDataStore
import com.hbut.mini.widget.WidgetRefreshScheduler

/**
 * Capacitor 插件：MiniHbutWidget
 *
 * 提供 Web 层 → 原生小组件的桥接能力：
 * - writeSnapshot：将今日课程快照写入 SharedPreferences（同步 commit）
 * - clearSnapshot：清空快照数据并刷新小组件
 * - requestRefresh：手动触发小组件刷新
 * - getCapabilities：返回平台能力与是否已固定小组件实例
 */
@CapacitorPlugin(name = "MiniHbutWidget")
class MiniHbutWidgetPlugin : Plugin() {

    private val dataStore by lazy { WidgetDataStore(context) }

    /**
     * 将 TodayCourseSnapshot 写入 SharedPreferences。
     * - 字节数校验：序列化 JSON ≤ 32KB，否则 reject SNAPSHOT_TOO_LARGE
     * - 使用 SharedPreferences.edit().commit() 同步写入
     * - 写入成功后立即触发小组件刷新
     */
    @PluginMethod
    fun writeSnapshot(call: PluginCall) {
        val json = call.getObject("snapshot")?.toString()
            ?: return call.reject("snapshot is null", "INVALID_SNAPSHOT")

        // 字节数校验（UTF-8 编码）
        val byteSize = json.toByteArray(Charsets.UTF_8).size
        if (byteSize > MAX_SNAPSHOT_BYTES) {
            return call.reject("snapshot > 32KB (actual: ${byteSize} bytes)", "SNAPSHOT_TOO_LARGE")
        }

        // 同步写入 SharedPreferences
        val ok = dataStore.writeSnapshot(json)
        if (!ok) {
            return call.reject("SharedPreferences commit failed", "WRITE_FAILED")
        }

        // 写入成功，触发小组件立即刷新
        WidgetRefreshScheduler.triggerImmediate(context)
        call.resolve()
    }

    /**
     * 清空 SharedPreferences 中的快照数据并刷新小组件。
     * 用于用户退出登录或清空数据时调用。
     */
    @PluginMethod
    fun clearSnapshot(call: PluginCall) {
        dataStore.clear()
        WidgetRefreshScheduler.triggerImmediate(context)
        call.resolve()
    }

    /**
     * 手动触发小组件刷新（不写入数据）。
     */
    @PluginMethod
    fun requestRefresh(call: PluginCall) {
        WidgetRefreshScheduler.triggerImmediate(context)
        call.resolve()
    }

    /**
     * 返回当前平台能力信息。
     * - platform: "android-appwidget"
     * - pinned: 是否存在至少一个已固定的小组件实例
     */
    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        val ret = JSObject()
        ret.put("platform", "android-appwidget")
        ret.put("pinned", WidgetRefreshScheduler.hasPinnedInstance(context))
        call.resolve(ret)
    }

    companion object {
        /** 快照最大字节数限制：32 KB */
        const val MAX_SNAPSHOT_BYTES = 32 * 1024
    }
}
