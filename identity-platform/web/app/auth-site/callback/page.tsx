/**
 * 测试回调页（仅测试用途）：OIDC 授权完成后 Core 会 302 到这里并携带 ?code=。
 * 页面只展示授权码与换取 token 的说明，不执行任何真实业务。
 * 安全：本页不读取/记录 handoff；code 仅在地址栏展示（测试用，生产应用不得如此）。
 */
import { Suspense } from 'react'
import { TestCallbackContent } from './callback-content'
import { IconFlask } from '../_components/icons'

export const dynamic = 'force-dynamic'

export default function TestCallbackPage() {
  return (
    <main className="test-callback-page">
      <div className="callback-card">
        <div className="test-banner" role="note">
          <IconFlask aria-hidden="true" />
          <span>
            <strong>测试环境</strong>：本页面是 Mini-HBUT 授权链路测试回调页，
            不会获取、保存或使用你的任何真实数据。
          </span>
        </div>
        <h1>授权完成（测试）</h1>
        <Suspense fallback={<p>读取授权码中…</p>}>
          <TestCallbackContent />
        </Suspense>
        <hr className="callback-divider" />
        <p className="callback-note">
          拿到授权码后，可用以下命令换取访问令牌（PKCE verifier 见测试文档）：
        </p>
        <pre className="callback-code">{`curl -X POST https://id.xn--vhq74jc2fzpchter27a.com/oauth/token \
  -d "grant_type=authorization_code" \
  -d "client_id=mini-hbut-test" \
  -d "code=<上面的授权码>" \
  -d "redirect_uri=https://auth.xn--vhq74jc2fzpchter27a.com/callback" \
  -d "code_verifier=<PKCE verifier>"`}</pre>
      </div>
    </main>
  )
}
