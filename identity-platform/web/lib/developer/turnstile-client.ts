/** #708 Turnstile 前端令牌中转：隐式组件回调写入 window，提交时消费（一次性）。 */

export function setTurnstileToken(t: string | null): void {
  if (typeof window === 'undefined') return
  ;(window as unknown as { __mhTurnstileToken?: string | undefined }).__mhTurnstileToken =
    t ?? undefined
}

export function consumeTurnstileToken(): string | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { __mhTurnstileToken?: string | undefined }
  const t = w.__mhTurnstileToken ?? null
  w.__mhTurnstileToken = undefined
  return t
}

if (typeof window !== 'undefined') {
  ;(window as unknown as { __mhTtSet: (t: string) => void }).__mhTtSet = (t: string) =>
    setTurnstileToken(t)
}
