#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
#810：将顶部安全区 inset 注入逻辑 patch 进 Tauri 生成的 Android MainActivity.kt。

背景：Android 端 `enableEdgeToEdge()` 让 WebView 延伸到透明状态栏之下，但 WebView 内
`env(safe-area-inset-top)` 恒为 0，前端无法感知状态栏高度，滚动内容会穿透状态栏。

本脚本在 `npm run tauri android init` 之后、构建之前执行，对
`<工作目录>/src-tauri/gen/android/app/src/main/java/com/hbut/mini/MainActivity.kt` 幂等追加：
1. androidx.core.view 相关 import（ViewCompat / WindowCompat / WindowInsetsCompat）
2. setOnApplyWindowInsetsListener：读取 WindowInsets.Type.statusBars() 的 top，
   通过 evaluateJavascript 写入 documentElement 的 CSS 变量 --android-safe-top
3. onWebViewCreate 回调里兜底注入一次（覆盖 insets 回调早于 WebView 创建的时序）；
   insets listener 在旋转 / 折叠屏布局变化时自动重新回调，天然覆盖配置变化

目标路径解析：优先相对当前工作目录（CI 在 apps/client 下执行），其次相对本脚本
所在仓库根（便于本地从任意目录调用）。

幂等性：以标记字符串 "Mini-HBUT safe-area-top inset patch (#810)" 判重，重复执行不重复插入。
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

# 幂等标记：存在即视为已 patch，跳过
PATCH_MARKER = "Mini-HBUT safe-area-top inset patch (#810)"

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
    // 这里读取原生 statusBars inset 并注入 CSS 变量 --android-safe-top 供前端消费。
    // 变量取值链见 apps/client/src/index.css：
    // --app-safe-top = max(--android-safe-top, env(...), --app-safe-top-fallback)
    WindowCompat.setDecorFitsSystemWindows(window, false)
    val hbutRootView = findViewById<View>(android.R.id.content)
    ViewCompat.setOnApplyWindowInsetsListener(hbutRootView) { view, insets ->
      val statusBarTop = insets.getInsets(WindowInsetsCompat.Type.statusBars()).top
      if (statusBarTop > 0) {
        injectSafeAreaTop(statusBarTop)
      }
      insets
    }
    // Mini-HBUT safe-area-top inset patch (#810) END
'''

INJECT_FUNCTION_BLOCK = '''
  // Mini-HBUT safe-area-top inset patch (#810) BEGIN
  // 把状态栏高度写入 WebView 根元素的 CSS 变量 --android-safe-top；
  // WebView 未就绪时延迟重试（首帧 insets 回调早于页面加载完成的情况）。
  // insets listener 在旋转 / 折叠屏布局变化时自动重新回调，无需额外监听配置变化。
  private fun injectSafeAreaTop(statusBarTop: Int) {
    val wv = webView
    if (wv == null) {
      android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({ injectSafeAreaTop(statusBarTop) }, 200)
      return
    }
    wv.evaluateJavascript(
      "document.documentElement.style.setProperty('--android-safe-top','${statusBarTop}px');try{window.dispatchEvent(new Event('androidSafeTopChange'))}catch(e){}",
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
    val statusBarTop = insets?.getInsets(WindowInsetsCompat.Type.statusBars())?.top ?: 0
    if (statusBarTop > 0) {
      injectSafeAreaTop(statusBarTop)
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
    """在 onCreate 的 enableEdgeToEdge() 之后插入 insets 监听（幂等）。"""
    if PATCH_MARKER in text:
        return text, False
    edge_match = re.search(r"^[ \t]*enableEdgeToEdge\(\)\s*$", text, flags=re.MULTILINE)
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
    print("Patch Tauri Android MainActivity with safe-area-top inset injection (#810)")
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
    return 0


if __name__ == "__main__":
    sys.exit(main())
