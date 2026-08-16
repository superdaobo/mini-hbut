/**
 * Preview 落地页：显式识别 Preview host 后的入口。
 * Preview 部署只有一个 host，无法按 auth/developer 分流，故提供选择页。
 * 注意：Preview 环境的 issuer 必须显式配置（IDENTITY_PREVIEW_ISSUER），
 * 禁止自动使用 Production issuer。
 */
import { getPublicIssuer } from '@/lib/issuer'

export default function PreviewSitePage() {
  let issuer = ''
  try {
    issuer = getPublicIssuer(process.env)
  } catch {
    issuer = '（未配置，拒绝使用 Production issuer）'
  }
  return (
    <div className="card">
      <h1>Preview 环境</h1>
      <p>这是 Vercel Preview 部署的落地页（骨架）。</p>
      <ul>
        <li>
          auth 站点路径：<code>/auth-site</code>
        </li>
        <li>
          developer 站点路径：<code>/developer-site</code>
        </li>
      </ul>
      <p>
        当前公开 issuer：<code>{issuer}</code>
      </p>
      <p>
        <strong>安全提示：</strong>Preview 与 Production 必须使用独立环境变量、DB 与 issuer。
      </p>
    </div>
  )
}
