package com.hbut.mini.widget

import android.content.Context
import android.content.res.Configuration
import android.widget.RemoteViews
import androidx.core.content.res.ResourcesCompat

/**
 * #758：应用内主题模式（system/light/dark）→ 小组件渲染适配。
 *
 * 模式值由前端经原生桥写入 SharedPreferences（key=theme_mode，见 WidgetDataStore）。
 * - system：完全沿用系统资源限定符机制（values-night / Material You 动态色），渲染零干预；
 * - light/dark：应用强制模式可能与系统深浅色相反，渲染时需覆盖背景与中性文字色，
 *   否则会出现「浅底浅字 / 深底深字」。品牌主题色（theme_color）跨模式可用，保持不变。
 */
object WidgetThemeMode {
    const val SYSTEM = "system"
    const val LIGHT = "light"
    const val DARK = "dark"

    /** 读取应用写入的主题模式；缺省/非法值一律兜底为 system（与旧版行为一致，零回归） */
    fun resolve(context: Context): String {
        val mode = WidgetDataStore(context).readThemeMode().trim().lowercase()
        return if (mode == LIGHT || mode == DARK) mode else SYSTEM
    }

    fun isForced(mode: String): Boolean = mode == LIGHT || mode == DARK

    /** 强制模式下应使用的背景 drawable 资源名；system 返回 null（保持布局默认） */
    fun backgroundResName(mode: String): String? = when (mode) {
        LIGHT -> "widget_background_light"
        DARK -> "widget_background_dark"
        else -> null
    }

    /**
     * 强制模式下覆盖 widget 根节点背景（setBackgroundResource 是 RemoteViews 支持的标准反射方法）。
     * system 模式 / rootId 无效 / 资源缺失时不做任何事。
     */
    fun applyBackground(context: Context, mode: String, views: RemoteViews, rootId: Int) {
        val resName = backgroundResName(mode) ?: return
        if (rootId == 0) return
        val resId = context.resources.getIdentifier(resName, "drawable", context.packageName)
        if (resId != 0) {
            views.setInt(rootId, "setBackgroundResource", resId)
        }
    }

    /**
     * 强制模式下按模式解析颜色并应用到指定 TextView。
     * colorResName 与布局静态引用同名（widget_text_primary 等），经 uiMode 覆盖后的
     * ConfigurationContext 解析，保证文字色与背景同一套深浅色。
     * system 模式 / viewId 无效 / 解析失败时不做任何事（保持布局默认色）。
     */
    fun bindTextColor(context: Context, mode: String, views: RemoteViews, viewId: Int, colorResName: String) {
        if (!isForced(mode) || viewId == 0) return
        val color = resolveColor(context, mode, colorResName) ?: return
        views.setTextColor(viewId, color)
    }

    /** 生成 uiMode 覆盖后的 Context：强制 light → NIGHT_NO，dark → NIGHT_YES（保留其余配置） */
    private fun themedContext(context: Context, mode: String): Context {
        val conf = Configuration(context.resources.configuration)
        conf.uiMode = (conf.uiMode and Configuration.UI_MODE_NIGHT_MASK.inv()) or
            if (mode == DARK) Configuration.UI_MODE_NIGHT_YES else Configuration.UI_MODE_NIGHT_NO
        return context.createConfigurationContext(conf)
    }

    /** 按模式解析颜色资源；失败返回 null（调用方保持布局默认色） */
    private fun resolveColor(context: Context, mode: String, colorResName: String): Int? {
        return try {
            val themed = themedContext(context, mode)
            val res = themed.resources
            val id = res.getIdentifier(colorResName, "color", themed.packageName)
            // ResourcesCompat 兼容 minSdk 22（res.getColor(id, theme) 需 API 23+）
            if (id == 0) null else ResourcesCompat.getColor(res, id, null)
        } catch (_: Exception) {
            null
        }
    }
}
