/**
 * 根路径兜底页。
 * 正常情况下 proxy.ts 会对所有 Host 做站点路由，本页不应被外部访问；
 * 仅作为极端情况（如代理被绕过）的最后防线，内容不含任何管理功能。
 */
export default function RootPage() {
  return (
    <div className="card">
      <h1>Mini-HBUT Identity</h1>
      <p>请通过以下站点域名访问对应服务：</p>
      <ul>
        <li>
          <code>auth.湖北工业大学.com</code> —— 授权等待页
        </li>
        <li>
          <code>developer.湖北工业大学.com</code> —— 开发者门户
        </li>
      </ul>
      <p>未识别的域名将返回 404。</p>
    </div>
  )
}
