import { platformBridge } from '../platform'

const normalizeHttpUrl = (href: string) => {
  try {
    const url = new URL(href, window.location.href)
    if (!/^https?:/i.test(url.href)) return null
    return url.href
  } catch {
    return null
  }
}

const isLikelyMiniProgramCode = (value: string) => {
  const trimmed = (value || '').trim()
  return trimmed.startsWith('#小程序://') || trimmed.startsWith('小程序://')
}

const extractMiniProgramToken = (value: string) => {
  const trimmed = (value || '').trim()
  if (!trimmed) return ''
  const clean = trimmed.replace(/^#/, '')
  const tokenMatch = clean.match(/\/([A-Za-z0-9_-]{6,})$/)
  return tokenMatch?.[1] || ''
}

const miniProgramCandidates = (value: string) => {
  const trimmed = (value || '').trim()
  if (!trimmed) return []

  const clean = trimmed.replace(/^#/, '')
  const candidates = new Set<string>()

  // 解析口令尾部 token，优先转换成 weixin 深链，兼容 iOS/Android。
  const token = extractMiniProgramToken(clean)
  if (token) {
    candidates.add(`weixin://dl/business/?t=${token}`)
    candidates.add(`wechat://dl/business/?t=${token}`)
    // 兜底：至少先拉起微信，由用户粘贴口令打开。
    candidates.add('weixin://')
  }

  // 原始口令放在后面，避免“已打开但落到无效页”导致后续深链不再尝试。
  candidates.add(trimmed)
  candidates.add(clean)

  return [...candidates].filter(Boolean)
}

const miniProgramAppIdCandidates = (
  appId: string,
  path?: string,
  envVersion: 'release' | 'trial' | 'develop' = 'release'
) => {
  const normalizedAppId = (appId || '').trim()
  if (!normalizedAppId) return []
  const candidates = new Set<string>()
  const normalizedPath = (path || '').trim()
  const encodedPath = normalizedPath ? encodeURIComponent(normalizedPath) : ''

  if (encodedPath) {
    candidates.add(
      `weixin://dl/business/?appid=${normalizedAppId}&path=${encodedPath}&env_version=${envVersion}`
    )
    candidates.add(
      `weixin://dl/business/?appid=${normalizedAppId}&path=${normalizedPath}&env_version=${envVersion}`
    )
    candidates.add(`wechat://dl/business/?appid=${normalizedAppId}&path=${encodedPath}`)
  }

  candidates.add(`weixin://dl/business/?appid=${normalizedAppId}&env_version=${envVersion}`)
  candidates.add(`weixin://dl/business/?appid=${normalizedAppId}`)
  candidates.add(`wechat://dl/business/?appid=${normalizedAppId}`)
  return [...candidates]
}

type MiniProgramOpenOptions = {
  code?: string
  appId?: string
  path?: string
  ghId?: string
  envVersion?: 'release' | 'trial' | 'develop'
}

export const openExternal = async (href: string) => {
  const url = normalizeHttpUrl(href)
  if (!url) return false
  return platformBridge.openHttp(url)
}

export const openExternalRaw = async (target: string) => {
  const raw = (target || '').trim()
  if (!raw) return false

  const tryTargets = isLikelyMiniProgramCode(raw) ? miniProgramCandidates(raw) : [raw, encodeURI(raw)]
  for (const item of tryTargets) {
    const ok = await platformBridge.openUri(item)
    if (ok) return true
  }
  return false
}

export const openWeChatMiniProgram = async (input: string | MiniProgramOpenOptions) => {
  const opts: MiniProgramOpenOptions =
    typeof input === 'string' ? { code: input } : (input || {})

  const allCandidates = new Set<string>()
  const appId = String(opts.appId || '').trim()
  const ghId = String(opts.ghId || '').trim()
  const code = String(opts.code || '').trim()
  const envVersion = opts.envVersion || 'release'

  if (appId) {
    for (const item of miniProgramAppIdCandidates(appId, opts.path, envVersion)) {
      allCandidates.add(item)
    }
  }

  if (ghId) {
    allCandidates.add(`weixin://dl/businessTempSession/?username=${encodeURIComponent(ghId)}`)
    allCandidates.add(`wechat://dl/businessTempSession/?username=${encodeURIComponent(ghId)}`)
    if (appId) {
      allCandidates.add(
        `weixin://dl/businessTempSession/?username=${encodeURIComponent(ghId)}&appid=${encodeURIComponent(appId)}`
      )
    }
  }

  const token = extractMiniProgramToken(code)
  if (token) {
    allCandidates.add(`weixin://dl/business/?t=${token}`)
    allCandidates.add(`wechat://dl/business/?t=${token}`)
  }

  if (code) {
    for (const item of miniProgramCandidates(code)) {
      allCandidates.add(item)
    }
  }

  allCandidates.add('weixin://')

  for (const target of allCandidates) {
    const ok = await openExternalRaw(target)
    if (ok) return true
  }
  return false
}

export const isHttpLink = (href: string) => !!normalizeHttpUrl(href)
