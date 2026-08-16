/**
 * auth.* 站点首页（授权等待页占位）。
 * V1 仅承载：App 唤起、二维码、状态轮询、错误/过期页。
 * 具体交互由 #630（Web Handoff 接力页）落地；这里只固定站点骨架与声明。
 */
export default function AuthSiteHomePage() {
  return (
    <div className="card">
      <h1>授权确认</h1>
      <p>本页为 auth.* 站点的授权等待页骨架。</p>
      <p>
        当第三方应用发起登录后，将跳转到形如{' '}
        <code>auth.湖北工业大学.com/r/&lt;request_id&gt;</code> 的页面（见右侧导航/路径）。
      </p>
      <ul>
        <li>展示请求应用名称、域名、开发者状态与请求权限；</li>
        <li>“打开 Mini-HBUT”按钮与跨设备二维码；</li>
        <li>过期倒计时；</li>
        <li>明确的非官方声明（页面底部公共 footer 已固定）。</li>
      </ul>
      <p>
        <strong>占位说明：</strong>本 Issue（#618）只建立可部署骨架，授权交互由 #630 实现。
      </p>
    </div>
  )
}
