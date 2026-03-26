# 异步安全 Markdown 预编译器管线 (markdown.js)

## 1. 模块定位与职责

在许多学生公告或者考试提醒中，后台通常运用 Markdown 或 HTML 发送富文本（甚至由于工科大学特性，有时候需要用到 KaTeX 公式）。
本模块运用著名的 `marked` 以及著名的安全过滤库 `DOMPurify` 搭建了渲染引擎，并且深度集成了**动态加载数学环境机制**。

## 2. 基于 CDN 拦截的动态运行时初始化

为了避免庞大的 Katex 引擎（近1MB级）拖慢首页首屏渲染，这里使用 `cdn_loader.js` 的并发加载策略包装了 `initMarkdownRuntime` 方法：
```javascript
export const initMarkdownRuntime = async (timeoutMs = 8000) => {
    // 按需同时从 jsdelivr/unpkg 的各个镜像请求公式样式依赖
    await loadStyleFromCdn({
       cacheKey: 'katex-css',
       urls: CDN_CONFIG.katexStyle,
    })
    
    // ... 然后等待脚本并动态注册进 marked 插件链
}
```

## 3. 防 XSS 剥离渲染 (`renderMarkdown`)
所有输出给 Vue 组件中 `v-html` 的字符串，都会经历双重洗礼：
1. **Markup 转译**：`marked.parse()` 转换为粗 HTML。
2. **污点清洗**：`DOMPurify.sanitize()` **核心防御点**，过滤掉恶意服务器甚至被黑的通知渠道发来的 `<script>` 或含有 `onerror` 的畸形标签。这保障了 Tauri 中的 Webview 跨站脚本安全水位。

## 4. 纯文本降级提取 (`stripMarkdown`)

如果目标位置只是一个单行 `<span class="ellipsis">` 怎么办？模块提供了正则表达式清理方案：
```javascript
export function stripMarkdown(content = '') {
  return content
    .replace(/`{1,3}[^`]*`{1,3}/g, '')    // 移除代码块
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // 移除图片
    .replace(/[#>*_~\-]/g, '')            // 移除语法符号
    //...
}
```
专门给诸如 "推送标题" 或者 "聊天摘要" 提供纯洁无样式的精练文本。