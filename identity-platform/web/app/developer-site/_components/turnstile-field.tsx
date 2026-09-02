'use client'

/**
 * #708 Turnstile 隐式组件占位：api.js 会自动渲染 class="cf-turnstile" 的元素，
 * 回调把令牌写入 lib/developer/turnstile-client 的令牌仓；站点钥匙未配置时不渲染。
 */
const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ''

export function TurnstileField() {
  if (!SITE_KEY) return null
  return (
    <div
      className="cf-turnstile"
      data-sitekey={SITE_KEY}
      data-callback="__mhTtSet"
      data-theme="auto"
    />
  )
}
