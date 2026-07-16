/**
 * 外链 / 内嵌内容域名白名单（合规构建强制；默认构建也可复用校验）。
 */

const DEFAULT_ALLOWED_HOST_SUFFIXES = Object.freeze([
  'hbut.6661111.xyz',
  'github.com',
  'github.io',
  'githubusercontent.com',
  'gitcode.com',
  'jsdelivr.net',
  'unpkg.com',
  'docs.qq.com',
  'qq.com',
  'map.qq.com',
  'apis.map.qq.com'
])

export function isAllowedHttpsUrl(url: unknown, extraSuffixes: string[] = []): boolean {
  const text = String(url || '').trim()
  if (!text) return false
  let parsed: URL
  try {
    parsed = new URL(text)
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:') return false
  if (parsed.username || parsed.password) return false
  const host = parsed.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') return false
  const suffixes = [...DEFAULT_ALLOWED_HOST_SUFFIXES, ...extraSuffixes.map((s) => s.toLowerCase())]
  return suffixes.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
}

export function isDangerousUrlScheme(url: unknown): boolean {
  const text = String(url || '').trim().toLowerCase()
  return (
    text.startsWith('javascript:') ||
    text.startsWith('data:') ||
    text.startsWith('file:') ||
    text.startsWith('vbscript:')
  )
}
