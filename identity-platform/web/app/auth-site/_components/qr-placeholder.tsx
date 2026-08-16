/**
 * 二维码区域（#630 页面要求同时展示 QR）。
 * 实际二维码渲染由 #627 定义：客户端本地打包 QR library 生成，不调用任何第三方 QR API，
 * 不加载第三方图片/脚本。此处先渲染语义化占位框，带文字 fallback（可访问性：屏幕阅读器可读）；
 * 移动端通过 CSS 折叠二维码，优先"打开 App"。
 */
export function QrPlaceholder() {
  return (
    <div className="qr-box">
      <div
        className="qr-placeholder"
        role="img"
        aria-label="跨设备二维码：使用 Mini-HBUT App 扫描以完成登录（由 #627 实现）"
      >
        二维码
        <br />
        （由 #627 定义）
      </div>
      <p className="qr-fallback">
        无法打开 App？使用 Mini-HBUT App 扫描上方二维码完成登录（桌面端）。
      </p>
    </div>
  )
}
