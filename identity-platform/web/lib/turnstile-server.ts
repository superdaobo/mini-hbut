/**
 * #708 后续：Turnstile 服务端核验（developer-site 三个敏感写动作调用）。
 *
 * 策略：
 *  - 未配置 TURNSTILE_SECRET_KEY（本地/测试）→ 跳过校验，零摩擦；
 *  - 配置后：无 token / 校验失败 → ok:false（fail closed，400 turnstile_failed）；
 *  - CF siteverify 自身不可达 → ok:false（提示稍后重试），不静默放行生产流量。
 */
export interface TurnstileVerdict {
  ok: boolean
  skipped: boolean
  message?: string
}

export async function assertTurnstileFromRequest(request: Request): Promise<TurnstileVerdict> {
  const secret = process.env.TURNSTILE_SECRET_KEY
  if (!secret) {
    return { ok: true, skipped: true }
  }
  const token = request.headers.get('x-turnstile-token') ?? ''
  if (!token) {
    return { ok: false, skipped: false, message: '缺少人机验证结果，请刷新页面重试' }
  }
  try {
    const body = new URLSearchParams({ secret, response: token })
    const ip = request.headers.get('cf-connecting-ip')
    if (ip) body.set('remoteip', ip)
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body,
    })
    const j = (await res.json()) as { success?: boolean; 'error-codes'?: string[] }
    if (j.success) return { ok: true, skipped: false }
    return { ok: false, skipped: false, message: '人机验证未通过，请刷新页面后重试' }
  } catch {
    return { ok: false, skipped: false, message: '人机验证服务暂不可用，请稍后重试' }
  }
}
