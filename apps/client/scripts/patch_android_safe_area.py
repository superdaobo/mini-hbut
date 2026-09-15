#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
#810：将顶部安全区 inset 注入逻辑 patch 进 Tauri 生成的 Android MainActivity.kt。

背景：Android 端 `enableEdgeToEdge()` 让 WebView 延伸到透明状态栏之下，但 WebView 内
`env(safe-area-inset-top)` 恒为 0，前端无法感知状态栏高度，滚动内容会穿透状态栏。

本脚本在 `npm run tauri android init` 之后、构建之前执行，对
`<工作目录>/src-tauri/gen/android/app/src/main/java/com/hbut/mini/MainActivity.kt` 幂等追加：
1. androidx.core.view 相关 import（ViewCompat / WindowCompat / WindowInsetsCompat）
2. setOnApplyWindowInsetsListener：读取 WindowInsets.Type.statusBars() 的 top（raw px），
   按 density 换算成 CSS px 后，通过 evaluateJavascript 写入 documentElement 的
   CSS 变量 --android-safe-top
3. onWebViewCreate 回调里兜底注入一次（覆盖 insets 回调早于 WebView 创建的时序）；
   insets listener 在旋转 / 折叠屏布局变化时自动重新回调，天然覆盖配置变化

目标路径解析：优先相对当前工作目录（CI 在 apps/client 下执行），其次相对本脚本
所在仓库根（便于本地从任意目录调用）。

#826：WindowInsets 返回的是 Android 视图坐标物理像素（raw px），而 CSS px 与之相差
density 倍。换算必须在本脚本生成的 Kotlin 内完成（injectSafeAreaTop 入参保持 raw px
语义，函数内部统一除以 density），否则高 DPI 设备上顶部安全区会被放大约 density 倍，
表现为全页面顶部巨量留白。前端只消费 CSS px 语义的 --android-safe-top，不做二次换算。

幂等性：以标记字符串 "Mini-HBUT safe-area-top inset patch (#810)" 与单位换算标记
"Mini-HBUT safe-area-top unit conversion (#826)" 共同判重，重复执行不重复插入；
若检测到 #810 旧版补丁（raw px 直接注入、无 #826 标记），先剥离旧块再重新注入，
使脚本收敛到当前版本而不是留下失效的旧补丁。
androidx.core 依赖说明：androidx.activity:activity-ktx 1.10.1 / appcompat 1.7.1
均传递依赖 androidx.core（WindowCompat 所在库），gen 工程默认可用，无需追加依赖。
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent


def candidate_roots() -> list[Path]:
    """目标根目录候选：cwd 优先（CI 语义），脚本所在工程根兜底（本地语义）。"""
    roots = []
    cwd = Path(os.getcwd()).resolve()
    roots.append(cwd)
    if cwd != PROJECT_DIR and PROJECT_DIR.name == "client":
        roots.append(PROJECT_DIR)
    return roots


def find_mainactivity() -> Path | None:
    for root in candidate_roots():
        candidate = root / "src-tauri" / "gen" / "android" / "app" / "src" / "main" / "java" / "com" / "hbut" / "mini" / "MainActivity.kt"
        if candidate.exists():
            return candidate
    return None

# 幂等标记：两个标记同时存在才视为已 patch（只有 #810 标记 = 旧版补丁，需要就地升级）
PATCH_MARKER = "Mini-HBUT safe-area-top inset patch (#810)"
UNIT_MARKER = "Mini-HBUT safe-area-top unit conversion (#826)"

# 已插入补丁块的正则：#826 就地升级用 —— 先剥离旧块再重新注入，
# 避免出现两份 insets listener / 两份 webView 字段声明。
# 前置 \n? 一并吃掉块前的换行，剥离后不留多余空行。
PATCH_BLOCK_PATTERN = re.compile(
    r"\n?^[ \t]*// Mini-HBUT safe-area-top inset patch \(#810\) BEGIN\n.*?"
    r"^[ \t]*// Mini-HBUT safe-area-top inset patch \(#810\) END[ \t]*\n",
    flags=re.MULTILINE | re.DOTALL,
)


def strip_existing_blocks(text: str) -> str:
    """剥离已存在的 #810 补丁块（#826：把旧版补丁升级到当前版本，避免重复块）。"""
    stripped, count = PATCH_BLOCK_PATTERN.subn("", text)
    if count == 0:
        # 没有旧块时原样返回，避免对未 patch 的生成文件做无谓改写
        return text
    # 剥离后可能留下连续空行，收敛为单个空行，保持生成代码可读
    return re.sub(r"\n{3,}", "\n\n", stripped)


# 需要的 import 行（已存在则跳过对应行）
REQUIRED_IMPORTS = [
    "import android.view.View",
    "import android.webkit.WebView",
    "import androidx.core.view.ViewCompat",
    "import androidx.core.view.WindowCompat",
    "import androidx.core.view.WindowInsetsCompat",
]

INSET_LISTENER_BLOCK = '''
    // Mini-HBUT safe-area-top inset patch (#810) BEGIN
    // Android WebView 中 env(safe-area-inset-top) 恒为 0，
    // 这里读取原生 statusBars inset（Android 视图坐标 raw px）并注入 CSS 变量
    // --android-safe-top 供前端消费；raw px -> CSS px 的换算在 injectSafeAreaTop 内完成。
    // 变量取值链见 apps/client/src/index.css：
    // --app-safe-top = max(--android-safe-top, env(...), --app-safe-top-fallback)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val hbutRootView = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(hbutRootView) { view, insets ->
      val statusBarTopPx = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
      if (statusBarTopPx > 0) {
        injectSafeAreaTop(statusBarTopPx)
      }
      insets
    }
    // Mini-HBUT safe-area-top inset patch (#810) END
'''

INJECT_FUNCTION_BLOCK = '''
  // Mini-HBUT safe-area-top inset patch (#810) BEGIN
  // 把状态栏高度写入 WebView 根元素的 CSS 变量 --android-safe-top；
  // 入参 statusBarTopPx 是 WindowInsets 的 Android 视图坐标物理像素（raw px）。
  // WebView 未就绪时延迟重试（首帧 insets 回调早于页面加载完成的情况）。
  // insets listener 在旋转 / 折叠屏布局变化时自动重新回调，无需额外监听配置变化。
  // Mini-HBUT safe-area-top unit conversion (#826)：
  // CSS px 与 raw px 相差 density 倍，必须在本函数内统一换算，否则高 DPI 设备上
  // 顶部安全区会被放大约 density 倍（density≈3 → 留白约 3 倍，全页面整体下推）。
  private fun injectSafeAreaTop(statusBarTopPx: Int) {
    val wv = webView
    if (wv == null) {
      android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ injectSafeAreaTop(statusBarTopPx) }, 200)
      return
    }
    val density = resources.displayMetrics.density
    // density 异常为 0 时退化为 1:1，避免除零
    val statusBarTopCssPx = if (density > 0f) statusBarTopPx / density else statusBarTopPx.toFloat()
    // Locale.US 固定小数点分隔符：避免部分地区格式化成逗号，写出非法 CSS 长度
    val statusBarTopCss = "%.2f".format(java.util.Locale.US, statusBarTopCssPx)
    wv.evaluateJavascript(
      "document.documentElement.style.setProperty('--android-safe-top','${statusBarTopCss}px');try{window.dispatchEvent(new Event('androidSafeTopChange'))}catch(e){}",
      null
    )
  }
  // Mini-HBUT safe-area-top inset patch (#810) END
'''

WEBVIEW_FIELD_BLOCK = '''
  // Mini-HBUT safe-area-top inset patch (#810) BEGIN
  // 持有 WebView 引用：由 WryActivity.setWebView -> onWebViewCreate 回调填充
  private var webView: android.webkit.WebView? = null

  override fun onWebViewCreate(webView: WebView) {
    super.onWebViewCreate(webView)
    this.webView = webView
    // WebView 创建后主动注入一次（覆盖 insets 回调早于 WebView 创建的时序）
    val insets = ViewCompat.getRootWindowInsets(window.decorView)
    val statusBarTopPx = insets?.getInsets(WindowInsetsCompat.Type.statusBars())?.top ?: 0
    if (statusBarTopPx > 0) {
      injectSafeAreaTop(statusBarTopPx)
    }
  }
  // Mini-HBUT safe-area-top inset patch (#810) END
'''


def patch_imports(text: str) -> tuple[str, bool]:
    """幂等追加所需 import（缺失的才插入，位置放在最后一个 import 之后）。"""
    missing = [imp for imp in REQUIRED_IMPORTS if imp not in text]
    if not missing:
        return text, False
    import_lines = re.findall(r"^import .*$", text, flags=re.MULTILINE)
    if not import_lines:
        raise SystemExit("No import statements found in MainActivity.kt")
    last_import = import_lines[-1]
    insert_block = "\n".join(missing)
    text = text.replace(last_import, last_import + "\n" + insert_block, 1)
    return text, True


def patch_inset_listener(text: str) -> tuple[str, bool]:
    """在 onCreate 的 enableEdgeToEdge() 之后插入 insets 监听（幂等 + 旧版就地升级）。"""
    if PATCH_MARKER in text and UNIT_MARKER in text:
        return text, False
    # #826：旧版 #810 补丁不含单位换算，先剥离再重新注入，保证收敛到当前版本
    text = strip_existing_blocks(text)
    if PATCH_MARKER in text:
        raise SystemExit(
            "Existing safe-area-top patch block could not be stripped safely; "
            "delete src-tauri/gen/android and re-run 'npm run tauri android init'"
        )
    # 锚点用 [ \t]*$（而不是 \s*$）：\s 会吞掉换行，导致插入位置随前置空行数漂移
    edge_match = re.search(r"^[ \t]*enableEdgeToEdge\(\)[ \t]*$", text, flags=re.MULTILINE)
    if not edge_match:
        raise SystemExit("enableEdgeToEdge() call not found in MainActivity.kt")
    insert_at = edge_match.end()
    text = text[:insert_at] + "\n" + INSET_LISTENER_BLOCK.rstrip("\n") + "\n" + text[insert_at:]

    # 类体末尾追加 injectSafeAreaTop + onWebViewCreate（最后一个 '}' 之前）
    inject_and_webview = INJECT_FUNCTION_BLOCK + WEBVIEW_FIELD_BLOCK
    class_end = text.rstrip().rfind("}")
    if class_end <= 0:
        raise SystemExit("Cannot locate class closing brace in MainActivity.kt")
    head = text[:class_end].rstrip("\n")
    tail = text[class_end:]
    text = head + "\n" + inject_and_webview.rstrip("\n") + "\n" + tail
    return text, True


def main() -> int:
    print("=" * 60)
    print("Patch Tauri Android MainActivity with safe-area-top inset injection (#810/#826)")
    print("=" * 60)

    kt_path = find_mainactivity()
    if kt_path is None:
        print("[ERROR] MainActivity.kt not found (run 'npm run tauri android init' first):")
        for root in candidate_roots():
            print(
                "  - "
                + str(
                    root
                    / "src-tauri/gen/android/app/src/main/java/com/hbut/mini/MainActivity.kt"
                )
            )
        return 1

    text = kt_path.read_text(encoding="utf-8")
    text, imports_added = patch_imports(text)
    text, listener_added = patch_inset_listener(text)
    if imports_added or listener_added:
        kt_path.write_text(text, encoding="utf-8")
        print(f"[OK] Patched {kt_path}")
    else:
        print(f"[OK] {kt_path} already contains safe-area-top inset patch; nothing to do")
    if imports_added:
        print("  [ADD] androidx.core.view / android.view imports")
    if listener_added:
        print("  [ADD] ViewCompat.setOnApplyWindowInsetsListener + JS CSS var injection")
        print("  [ADD] raw px -> CSS px density conversion (#826)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
