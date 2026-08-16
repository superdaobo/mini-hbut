const ISSUER = 'https://id.xn--vhq74jc2fzpchter27a.com';
const DEVELOPER_PORTAL = 'https://developer.xn--vhq74jc2fzpchter27a.com';

const endpoints = [
    ['Discovery', `${ISSUER}/.well-known/openid-configuration`],
    ['Authorization', `${ISSUER}/oauth/authorize`],
    ['Token', `${ISSUER}/oauth/token`],
    ['JWKS', `${ISSUER}/oauth/jwks`],
    ['UserInfo', `${ISSUER}/oauth/userinfo`],
    ['Revocation', `${ISSUER}/oauth/revoke`],
    ['Logout', `${ISSUER}/oauth/logout`],
];

const scopes = [
    {
        id: 'openid',
        risk: '基础',
        desc: 'OIDC 必选 scope。返回 ID Token 与 pairwise sub，用于确认“同一个 Mini-HBUT 账户”完成了登录。',
    },
    {
        id: 'profile',
        risk: '基础',
        desc: '返回允许展示的基础资料，如 name / preferred_username；不等同于学校官方身份。',
    },
    {
        id: 'student.identity',
        risk: '敏感',
        desc: '通过 UserInfo 返回学校身份快照与验证来源。申请时需要说明用途、隐私政策与联系方式，并经过管理员审核和用户授权。',
    },
    {
        id: 'offline_access',
        risk: '敏感',
        desc: '允许签发 Refresh Token。仅在确实需要长期会话时申请，并按高敏感凭据存储和轮换。',
    },
];

const webSample = `import * as oidc from 'openid-client'

const issuer = new URL(process.env.MINI_HBUT_ISSUER!)
const clientSecret = process.env.MINI_HBUT_CLIENT_SECRET!
const config = await oidc.discovery(
  issuer,
  process.env.MINI_HBUT_CLIENT_ID!,
  {
    client_secret: clientSecret,
    redirect_uris: ['https://your-app.example.com/oauth/callback'],
    token_endpoint_auth_method: 'client_secret_basic',
  },
  oidc.ClientSecretBasic(clientSecret),
)

// 每次登录生成新的 verifier / state / nonce，并绑定到当前服务端会话。
const verifier = oidc.randomPKCECodeVerifier()
const challenge = await oidc.calculatePKCECodeChallenge(verifier)
const state = oidc.randomState()
const nonce = oidc.randomNonce()

const authorizationUrl = oidc.buildAuthorizationUrl(config, {
  redirect_uri: 'https://your-app.example.com/oauth/callback',
  response_type: 'code',
  scope: 'openid profile',
  code_challenge: challenge,
  code_challenge_method: 'S256',
  state,
  nonce,
})

// 回调收到 code 后，在服务端完成授权码交换。
const tokens = await oidc.authorizationCodeGrant(config, currentUrl, {
  pkceCodeVerifier: verifier,
  expectedState: state,
  expectedNonce: nonce,
})`;

const nativeSample = `// Native/Public Client：没有 client_secret，仍然使用 Authorization Code + PKCE S256。
// 1. 生成 verifier / challenge / state / nonce
// 2. 使用系统浏览器打开 authorization_endpoint
// 3. 通过已经注册的 custom URI scheme 或 127.0.0.1 loopback 接收 code
// 4. 使用同一个 verifier 调 token_endpoint 兑换 token

GET ${ISSUER}/oauth/authorize
  ?client_id=YOUR_NATIVE_CLIENT_ID
  &redirect_uri=my-app:/oauth/callback
  &response_type=code
  &scope=openid%20profile
  &state=RANDOM_STATE
  &nonce=RANDOM_NONCE
  &code_challenge=BASE64URL_SHA256_VERIFIER
  &code_challenge_method=S256`;

const userInfoSample = `GET ${ISSUER}/oauth/userinfo
Authorization: Bearer ACCESS_TOKEN

// 申请并获批 student.identity 后，UserInfo 可能包含：
{
  "sub": "PAIRWISE_SUBJECT",
  "name": "显示姓名",
  "preferred_username": "显示姓名",
  "hbut_student_id": "学校身份快照",
  "hbut_student_name": "学校姓名快照",
  "hbut_verification_method": "mini_hbut_app",
  "hbut_verified_at": "2026-08-15T00:00:00.000Z"
}`;

const IdentityOidc = () => (
    <div className="space-y-10">
        <header className="space-y-4 border-b border-gray-800 pb-6">
            <div className="text-sm font-semibold uppercase tracking-[0.2em] text-cyan/80">开发者文档 · Identity</div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-cyan to-purple bg-clip-text text-transparent">
                Mini-HBUT OIDC 接入指南
            </h1>
            <p className="text-lg leading-8 text-gray-300">
                面向第三方网站、服务端应用和原生客户端的统一接入说明。本页是 Mini-HBUT Identity 的唯一正式开发者文档入口；
                Developer Portal 只负责应用创建、审核状态、Redirect URI、Scope 与凭据生命周期管理。
            </p>
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/5 p-5 text-sm leading-7 text-amber-100">
                <strong>身份保证边界：</strong> Mini-HBUT 是第三方学生开发工具，不是湖北工业大学官方统一身份认证服务。
                当前学校身份验证来源为 <code>mini_hbut_app</code>，表示 Mini-HBUT App 基于用户本地学校登录状态完成验证；
                它不是学校服务器直接向第三方签发的官方 OIDC 身份断言。请勿用于金融、考试身份核验等要求官方强实名的场景。
            </div>
        </header>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">1. 协议入口与 canonical issuer</h2>
            <p className="text-sm leading-7 text-gray-300">
                OIDC 的 <code>issuer</code> 必须按字符串精确比较。中文域名只适合人类展示；协议配置、Discovery、
                <code>iss</code> 校验和 SDK 配置统一使用下面的 ASCII / Punycode canonical issuer。
            </p>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-sm leading-7 text-cyan">{ISSUER}</pre>
            <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[680px] text-left text-sm">
                    <thead className="bg-white/[0.05] text-gray-200">
                        <tr><th className="p-3">能力</th><th className="p-3">端点</th></tr>
                    </thead>
                    <tbody>
                        {endpoints.map(([label, url]) => (
                            <tr key={label} className="border-t border-white/10">
                                <td className="p-3 font-semibold text-white">{label}</td>
                                <td className="p-3"><code className="break-all text-cyan">{url}</code></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="text-sm leading-7 text-gray-400">
                首选做法是让 OIDC SDK读取 Discovery，而不是在业务代码里长期硬编码各端点。V1 只开放 Authorization Code；
                不提供 implicit/hybrid，也不宣告未实现的 PAR 动态入口。
            </p>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">2. 先在 Developer Portal 注册应用</h2>
            <p className="text-sm leading-7 text-gray-300">
                前往 <a className="text-cyan hover:underline" href={DEVELOPER_PORTAL}>Mini-HBUT Developer Portal</a> 创建应用。
                V1 对外提供两种应用类型：
            </p>
            <div className="grid gap-4 md:grid-cols-2">
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-lg font-bold text-cyan">Web / Confidential</h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                        <li>服务端安全持有 <code>client_secret</code>；</li>
                        <li>Token 端点使用 <code>client_secret_basic</code>；</li>
                        <li>生产 Redirect URI 必须为 HTTPS；</li>
                        <li>即使有 secret，也仍强制使用 PKCE S256。</li>
                    </ul>
                </article>
                <article className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="text-lg font-bold text-purple">Native / Public</h3>
                    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                        <li>不签发、也绝不能内置 <code>client_secret</code>；</li>
                        <li>Token 端点认证方式为 <code>none</code>；</li>
                        <li>支持自定义 scheme 与 127.0.0.1 / [::1] loopback；</li>
                        <li>必须使用 PKCE S256，并使用系统浏览器完成授权。</li>
                    </ul>
                </article>
            </div>
            <p className="text-sm leading-7 text-gray-300">
                应用生命周期为 Draft → Pending Review → Approved → Active。只有 Active Client 可以进入授权流程。
                Suspended / Revoked Client 会立即失去授权能力；Revoked 为终态。
            </p>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">3. Redirect URI 规则</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>授权请求中的 <code>redirect_uri</code> 必须与已审核注册值精确匹配，不支持通配符、前缀、后缀或正则匹配。</li>
                <li>禁止 fragment（<code>#...</code>）、userinfo（<code>user@host</code>）和控制字符。</li>
                <li>Web / Confidential 生产地址只能使用 HTTPS；本地开发例外仅用于明确的 localhost 环境。</li>
                <li>Native custom scheme 不能使用 http/https；示例：<code>my-app:/oauth/callback</code>。</li>
                <li>Native loopback 仅允许 <code>http://127.0.0.1</code> 或 <code>http://[::1]</code>，可使用运行时动态端口。</li>
                <li>不要把授权码、token、handoff secret 或其它凭据放进自己定义的 Redirect URI 静态参数。</li>
            </ul>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">4. Web 服务端接入</h2>
            <p className="text-sm leading-7 text-gray-300">
                推荐使用成熟 OIDC SDK。下面以 <code>openid-client</code> 的典型服务端流程表示关键约束；示例中的所有 Client 值均为占位符。
            </p>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{webSample}</pre>
            <div className="rounded-xl border border-cyan/20 bg-cyan/5 p-5 text-sm leading-7 text-gray-300">
                授权码交换、Client Secret、Access Token、Refresh Token 和 ID Token 都应留在服务端。浏览器最好只拿到你自己站点的
                Secure + HttpOnly + SameSite 会话 Cookie，不要把 OIDC token 写入 localStorage/sessionStorage。
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">5. Native / 桌面 / 移动端接入</h2>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{nativeSample}</pre>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>Native App 是 Public Client：二进制中不能安全保存一个所有用户共用的 Client Secret。</li>
                <li>外部系统浏览器负责展示授权页；不要用内嵌 WebView 收集身份认证凭据。</li>
                <li>每次请求独立生成 <code>code_verifier</code>、<code>state</code>、<code>nonce</code>。</li>
                <li>回调后同时校验 state、ID Token nonce、issuer、audience、有效期与签名。</li>
                <li>自定义 scheme 可能被其它 App 抢占；能使用平台验证过的 App Link / Universal Link 时应优先使用。</li>
            </ul>
        </section>

        <section className="space-y-5">
            <h2 className="text-2xl font-bold text-white">6. Scope 与 Claims</h2>
            <div className="grid gap-4 md:grid-cols-2">
                {scopes.map((scope) => (
                    <article key={scope.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                        <div className="flex flex-wrap items-center gap-3">
                            <code className="text-base font-semibold text-cyan">{scope.id}</code>
                            <span className="rounded-full border border-white/10 px-2 py-0.5 text-xs text-gray-400">{scope.risk}</span>
                        </div>
                        <p className="mt-3 text-sm leading-7 text-gray-300">{scope.desc}</p>
                    </article>
                ))}
            </div>
            <p className="text-sm leading-7 text-gray-300">
                <code>sub</code> 是 pairwise subject，不是学号，也不保证跨不同第三方 Client 相同。第三方自己的账号关联应以当前 Client
                下稳定的 <code>sub</code> 为主键，不要用姓名、学号快照或昵称代替 OIDC subject。
            </p>
            <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/50 p-4 text-xs leading-6 text-gray-200">{userInfoSample}</pre>
            <p className="text-sm leading-7 text-gray-400">
                学校身份类字段只在申请并获批 <code>student.identity</code> 后通过 UserInfo 获取，平台刻意不把这些敏感字段塞进 ID Token，
                以减少前端日志、Cookie 或第三方中间件无意长期保存的概率。
            </p>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">7. Mini-HBUT App Approval 实际发生什么</h2>
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>第三方应用把用户重定向到标准 <code>/oauth/authorize</code>。</li>
                <li>Identity Core 校验 Client、Redirect URI、Scope、PKCE 后创建短期 AuthRequest。</li>
                <li>浏览器进入 <code>auth.*</code> 接力页，只展示应用、域名、Scope 并尝试唤起 Mini-HBUT；也可以展示跨设备二维码。</li>
                <li>Mini-HBUT 从服务端重新读取 AuthRequest，不相信 Deep Link/QR 中携带的应用名称、Scope 或身份字段。</li>
                <li>用户在 App 内确认允许/拒绝；App 使用本机设备 Ed25519 私钥对 request/challenge/client/scope/nonce 等上下文签名。</li>
                <li>Core 验证设备绑定、签名、nonce、时间窗、请求状态与一次性约束后推进授权状态。</li>
                <li>浏览器接力页观察到批准后恢复 OIDC Interaction，最终由 OIDC Provider 把一次性 Authorization Code 返回已注册的第三方 callback。</li>
            </ol>
            <p className="text-sm leading-7 text-gray-400">
                Deep Link / QR 只是“把短期请求带到 App”的唤起通道，本身不是认证凭据；学校密码、学校 Cookie 和 CAS 会话不会发送给第三方应用。
            </p>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">8. Token、刷新与撤销</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li>Authorization Code 一次性使用；兑换失败或过期后重新发起登录，不重复使用旧 code。</li>
                <li>Access Token / ID Token 都必须按 Discovery/JWKS 验证 issuer、audience、签名与有效期。</li>
                <li>需要 Refresh Token 时显式申请 <code>offline_access</code>；平台启用 Refresh Token rotation，旧 refresh token 不应重复使用。</li>
                <li>令牌撤销使用 <code>POST /oauth/revoke</code>；退出 OIDC 会话使用 RP-Initiated Logout 端点。</li>
                <li>Client Secret 泄露后在 Developer Portal 立即轮换；旧 secret 失效后同步吊销相关会话/令牌并检查审计日志。</li>
            </ul>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">9. 常见错误</h2>
            <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[760px] text-left text-sm">
                    <thead className="bg-white/[0.05] text-gray-200">
                        <tr><th className="p-3">错误</th><th className="p-3">通常含义</th><th className="p-3">处理建议</th></tr>
                    </thead>
                    <tbody className="text-gray-300">
                        {[
                            ['invalid_request', '参数缺失、PKCE/state 等格式不符合要求', '重新生成完整授权请求，不复用旧 code'],
                            ['unauthorized_client', 'Client 类型、状态或流程不允许', '确认应用已经审核并处于 Active'],
                            ['invalid_redirect_uri', '回调与注册值不完全一致', '逐字符核对 Developer Portal 中的 Redirect URI'],
                            ['invalid_scope', '请求了未批准的 Scope', '删除未批准 Scope，或重新提交审核'],
                            ['access_denied', '用户在 Mini-HBUT 中拒绝了本次授权', '尊重拒绝，不静默循环重新唤起'],
                            ['invalid_grant', 'code / refresh token 过期、已使用或绑定信息不匹配', '创建一轮全新的授权流程'],
                            ['invalid_client', 'Confidential Client 认证失败', '核对服务端 secret，必要时执行轮换'],
                        ].map(([code, meaning, action]) => (
                            <tr key={code} className="border-t border-white/10">
                                <td className="p-3"><code className="text-cyan">{code}</code></td>
                                <td className="p-3">{meaning}</td>
                                <td className="p-3">{action}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">10. 上线前安全检查</h2>
            <div className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                    <li>使用 Discovery + 成熟 OIDC/OAuth SDK，不自己实现 JWT/签名/授权码解析。</li>
                    <li>所有 Client 都启用 PKCE S256；state、nonce、verifier 每次随机并绑定当前登录会话。</li>
                    <li>Confidential secret 仅存在服务器 Secret Manager / 环境变量，不进入浏览器 bundle、移动 App、日志或 Git。</li>
                    <li>浏览器不长期保存 OIDC token；服务端使用 Secure / HttpOnly / SameSite Cookie 建立自己的会话。</li>
                    <li>Redirect URI 使用最小集合；不开放通配、开放重定向或“任意 next URL”。</li>
                    <li>只申请业务真正需要的 Scope；尤其不要为了“以后可能用到”默认申请 student.identity / offline_access。</li>
                    <li>把 <code>mini_hbut_app</code> 验证来源如实展示给需要身份保证判断的业务，不包装成“湖北工业大学官方认证”。</li>
                    <li>日志中禁止记录 Authorization header、token、client secret、授权码、PKCE verifier 或 App Approval handoff secret。</li>
                    <li>收到 Suspended/Revoked、invalid_client、refresh reuse 等信号后 fail closed，不用旧凭据继续尝试。</li>
                </ul>
            </div>
        </section>

        <section className="space-y-4">
            <h2 className="text-2xl font-bold text-white">11. 规范与更多入口</h2>
            <ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-gray-300">
                <li><a className="text-cyan hover:underline" href="https://www.rfc-editor.org/rfc/rfc9700">OAuth 2.0 Security Best Current Practice (RFC 9700)</a></li>
                <li><a className="text-cyan hover:underline" href="https://www.rfc-editor.org/rfc/rfc8252">OAuth 2.0 for Native Apps (RFC 8252)</a></li>
                <li><a className="text-cyan hover:underline" href="https://openid.net/specs/openid-connect-core-1_0.html">OpenID Connect Core 1.0</a></li>
                <li><a className="text-cyan hover:underline" href={DEVELOPER_PORTAL}>Developer Portal：创建应用、审核、Redirect URI、Scope 与 Credentials</a></li>
            </ul>
        </section>
    </div>
);

export default IdentityOidc;
