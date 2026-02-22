import { reactive, watch } from 'vue'
import {
  invokeNative as invoke,
  isTauriRuntime,
  readNativeBinaryFile,
  toNativeFileSrc
} from '../platform/native'

const STORAGE_KEY = 'hbu_font_settings_v1'
const FONT_NAME = 'DeyiHei'

const FONT_SOURCES = [
  'https://raw.gitcode.com/superdaobo/mini-hbut-config/blobs/c297dc6928402fc0c73cec17ea7518d3731f7022/SmileySans-Oblique.ttf'
]

const REMOTE_FONT_SOURCES = {
  heiti: {
    jsdelivr: [
      'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2',
      'https://cdn.jsdelivr.net/npm/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff'
    ],
    unpkg: [
      'https://unpkg.com/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff2',
      'https://unpkg.com/@fontsource/noto-sans-sc/files/noto-sans-sc-chinese-simplified-400-normal.woff'
    ]
  },
  songti: {
    jsdelivr: [
      'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff2',
      'https://cdn.jsdelivr.net/npm/@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff'
    ],
    unpkg: [
      'https://unpkg.com/@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff2',
      'https://unpkg.com/@fontsource/noto-serif-sc/files/noto-serif-sc-chinese-simplified-400-normal.woff'
    ]
  },
  kaiti: {
    jsdelivr: [
      'https://cdn.jsdelivr.net/npm/@fontsource/ma-shan-zheng/files/ma-shan-zheng-chinese-simplified-400-normal.woff2',
      'https://cdn.jsdelivr.net/npm/@fontsource/ma-shan-zheng/files/ma-shan-zheng-chinese-simplified-400-normal.woff'
    ],
    unpkg: [
      'https://unpkg.com/@fontsource/ma-shan-zheng/files/ma-shan-zheng-chinese-simplified-400-normal.woff2',
      'https://unpkg.com/@fontsource/ma-shan-zheng/files/ma-shan-zheng-chinese-simplified-400-normal.woff'
    ]
  },
  fangsong: {
    jsdelivr: [
      'https://cdn.jsdelivr.net/npm/@fontsource/zcool-xiaowei/files/zcool-xiaowei-chinese-simplified-400-normal.woff2',
      'https://cdn.jsdelivr.net/npm/@fontsource/zcool-xiaowei/files/zcool-xiaowei-chinese-simplified-400-normal.woff'
    ],
    unpkg: [
      'https://unpkg.com/@fontsource/zcool-xiaowei/files/zcool-xiaowei-chinese-simplified-400-normal.woff2',
      'https://unpkg.com/@fontsource/zcool-xiaowei/files/zcool-xiaowei-chinese-simplified-400-normal.woff'
    ]
  }
} as const

const ANDROID_SANS = "'Noto Sans SC', 'Noto Sans CJK SC', 'Roboto', sans-serif"
const ANDROID_SERIF = "'Noto Serif SC', 'Noto Serif CJK SC', serif"
const FONT_FALLBACK = `'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'Source Han Sans SC', 'WenQuanYi Micro Hei', ${ANDROID_SANS}`
const FONT_STACKS = {
  default: FONT_FALLBACK,
  deyihei: `'DeyiHei', ${FONT_FALLBACK}`,
  heiti: `'HBUT-Heiti', 'SimHei', 'Heiti SC', 'Microsoft YaHei', ${ANDROID_SANS}, ${FONT_FALLBACK}`,
  songti: `'HBUT-Songti', 'SimSun', 'Songti SC', 'STSong', ${ANDROID_SERIF}, ${FONT_FALLBACK}`,
  kaiti: `'HBUT-KaiTi', 'KaiTi', 'STKaiti', 'KaiTi_GB2312', 'Kaiti SC', ${ANDROID_SERIF}, ${FONT_FALLBACK}`,
  fangsong: `'HBUT-FangSong', 'FangSong', 'STFangsong', ${ANDROID_SERIF}, ${FONT_FALLBACK}`
} as const

const SUPPORTED_FONTS = new Set(Object.keys(FONT_STACKS))
const FONT_CDN_PROVIDERS = ['auto', 'jsdelivr', 'unpkg'] as const

type FontKey = keyof typeof FONT_STACKS
type CdnProvider = (typeof FONT_CDN_PROVIDERS)[number]
type FontState = {
  font: FontKey
  loaded: boolean
  cdnProvider: CdnProvider
}

type FontDownloadPayload = {
  path: string
  base64?: string
}

type RemoteFontKey = Exclude<FontKey, 'default' | 'deyihei'>
type PrefetchFontKey = Exclude<FontKey, 'default'>
type RemoteFontProfile = {
  family: string
  cacheName: string
}
type FontFormat = 'truetype' | 'woff2' | 'woff'

const FONT_CDN_OPTIONS = [
  { key: 'auto', label: '自动（推荐）', desc: '优先 jsDelivr，失败自动回退 unpkg' },
  { key: 'jsdelivr', label: 'jsDelivr', desc: '优先使用 jsDelivr CDN' },
  { key: 'unpkg', label: 'unpkg', desc: '优先使用 unpkg CDN' }
] as const

const CDN_PROVIDER_ORDER: Record<CdnProvider, readonly ('jsdelivr' | 'unpkg')[]> = {
  auto: ['jsdelivr', 'unpkg'],
  jsdelivr: ['jsdelivr', 'unpkg'],
  unpkg: ['unpkg', 'jsdelivr']
}

const DEFAULT_SETTINGS: FontState = {
  font: 'default',
  loaded: false,
  cdnProvider: 'auto'
}

const loadStoredSettings = (): Partial<FontState> | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const normalizeSettings = (raw: unknown): FontState => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const obj = raw as Record<string, unknown>
  const requested = typeof obj.font === 'string' ? obj.font : 'default'
  const requestedProvider = typeof obj.cdnProvider === 'string' ? obj.cdnProvider : 'auto'
  const provider = FONT_CDN_PROVIDERS.includes(requestedProvider as CdnProvider)
    ? (requestedProvider as CdnProvider)
    : 'auto'
  return {
    font: (SUPPORTED_FONTS.has(requested) ? requested : 'default') as FontKey,
    loaded: !!obj.loaded,
    cdnProvider: provider
  }
}

const state = reactive<FontState>(normalizeSettings(loadStoredSettings()))

const isTauri = () => isTauriRuntime()

const fontLoadingMap = new Set<FontKey>()

const resolveWebFontUrl = () => {
  return FONT_SOURCES[0]
}

const REMOTE_FONT_PROFILE_MAP: Record<RemoteFontKey, RemoteFontProfile> = {
  heiti: {
    family: 'HBUT-Heiti',
    cacheName: 'hbu-font-cache-heiti'
  },
  songti: {
    family: 'HBUT-Songti',
    cacheName: 'hbu-font-cache-songti'
  },
  kaiti: {
    family: 'HBUT-KaiTi',
    cacheName: 'hbu-font-cache-kaiti'
  },
  fangsong: {
    family: 'HBUT-FangSong',
    cacheName: 'hbu-font-cache-fangsong'
  }
}

const REMOTE_FONT_FAMILY_MAP: Record<Exclude<FontKey, 'default'>, string> = {
  deyihei: FONT_NAME,
  heiti: REMOTE_FONT_PROFILE_MAP.heiti.family,
  songti: REMOTE_FONT_PROFILE_MAP.songti.family,
  kaiti: REMOTE_FONT_PROFILE_MAP.kaiti.family,
  fangsong: REMOTE_FONT_PROFILE_MAP.fangsong.family
}

const inferFontFormat = (url: string): FontFormat => {
  const lower = String(url || '').toLowerCase()
  if (lower.endsWith('.woff2')) return 'woff2'
  if (lower.endsWith('.woff')) return 'woff'
  return 'truetype'
}

const resolveRemoteFontSources = (fontKey: RemoteFontKey, provider: CdnProvider): string[] => {
  const map = REMOTE_FONT_SOURCES[fontKey]
  if (!map) return []
  const order = CDN_PROVIDER_ORDER[provider] || CDN_PROVIDER_ORDER.auto
  const seen = new Set<string>()
  const list: string[] = []
  for (const vendor of order) {
    const sources = map[vendor] || []
    for (const url of sources) {
      const text = String(url || '').trim()
      if (!text || seen.has(text)) continue
      seen.add(text)
      list.push(text)
    }
  }
  return list
}

const applyFont = (fontKey: FontKey) => {
  const root = document.documentElement
  if (!root) return
  const stack = FONT_STACKS[fontKey] || FONT_STACKS.default
  root.style.setProperty('--ui-font-family', stack)
}

const ensureFontFaceStyle = (fontFamily: string, src: string, format: FontFormat) => {
  if (typeof document === 'undefined') return
  const id = `font-face-${fontFamily.replace(/[^\w-]/g, '_')}`
  const existing = document.getElementById(id)
  const css = `@font-face { font-family: '${fontFamily}'; src: url('${src}') format('${format}'); font-display: swap; }`
  if (existing) {
    existing.textContent = css
    return
  }
  const style = document.createElement('style')
  style.id = id
  style.textContent = css
  document.head.appendChild(style)
}

const toArrayBuffer = (bytes: Uint8Array): ArrayBuffer => {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
}

const decodeBase64 = (base64Text: string): Uint8Array => {
  const normalized = base64Text.replace(/\s+/g, '')
  const binary = atob(normalized)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

const loadFontFromBytes = async (fontFamily: string, bytes: Uint8Array) => {
  if (typeof document === 'undefined') return false
  if (typeof FontFace === 'undefined') return false
  const font = new FontFace(fontFamily, toArrayBuffer(bytes))
  await font.load()
  document.fonts.add(font)
  await document.fonts.load(`12px ${fontFamily}`)
  return true
}

const loadFontFromUrl = async (fontFamily: string, src: string, format: FontFormat) => {
  if (typeof document === 'undefined') return false
  try {
    if (typeof FontFace !== 'undefined') {
      const font = new FontFace(fontFamily, `url(${src})`)
      await font.load()
      document.fonts.add(font)
      await document.fonts.load(`12px ${fontFamily}`)
      return true
    }
  } catch {
    // fallback to injected @font-face
  }
  ensureFontFaceStyle(fontFamily, src, format)
  if (document.fonts?.load) {
    await document.fonts.load(`12px ${fontFamily}`)
  }
  return true
}

const loadDeyiHeiFontInTauri = async (force = false) => {
  const payload = await invoke<FontDownloadPayload>('download_deyihei_font_payload', {
    url: FONT_SOURCES[0],
    urls: FONT_SOURCES,
    force: !!force
  })

  if (payload.base64) {
    const bytes = decodeBase64(payload.base64)
    const loaded = await loadFontFromBytes(FONT_NAME, bytes)
    if (loaded) return true
  }

  if (payload.path) {
    try {
      const bytes = await readNativeBinaryFile(payload.path)
      const loaded = await loadFontFromBytes(FONT_NAME, bytes)
      if (loaded) return true
    } catch {
      // fallback to asset protocol loading
    }
    const fileSrc = await toNativeFileSrc(payload.path)
    return loadFontFromUrl(FONT_NAME, fileSrc, 'truetype')
  }

  // fallback to legacy command
  const path = await invoke<string>('download_deyihei_font', {
    url: FONT_SOURCES[0],
    urls: FONT_SOURCES,
    force: !!force
  })
  const fileSrc = await toNativeFileSrc(path)
  return loadFontFromUrl(FONT_NAME, fileSrc, 'truetype')
}

const loadDeyiHeiFontInWeb = async (force = false) => {
  const resolvedUrl = resolveWebFontUrl()
  return loadRemoteFontWithCache(FONT_NAME, [resolvedUrl], 'hbu-font-cache-deyihei', force)
}

const fetchRemoteFontResponse = async (
  sourceUrl: string,
  cacheName: string,
  force = false
): Promise<Response | null> => {
  let response: Response | null = null
  try {
    if (!force && typeof caches !== 'undefined') {
      const cache = await caches.open(cacheName)
      response = await cache.match(sourceUrl)
    }
    if (!response) {
      response = await fetch(sourceUrl, { mode: 'cors' })
      if (!response.ok) throw new Error(`font download failed: ${response.status}`)
      if (typeof caches !== 'undefined') {
        const cache = await caches.open(cacheName)
        await cache.put(sourceUrl, response.clone())
      }
    }
  } catch {
    response = null
  }
  return response
}

const loadRemoteFontWithCache = async (
  fontFamily: string,
  sources: readonly string[],
  cacheName: string,
  force = false
): Promise<boolean> => {
  for (const sourceUrl of sources) {
    const response = await fetchRemoteFontResponse(sourceUrl, cacheName, force)
    if (response) {
      try {
        const buffer = await response.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        const loaded = await loadFontFromBytes(fontFamily, bytes)
        if (loaded) return true
      } catch {
        // 继续 URL 模式兜底
      }
    }

    try {
      const loaded = await loadFontFromUrl(fontFamily, sourceUrl, inferFontFormat(sourceUrl))
      if (loaded) return true
    } catch {
      // 尝试下一个地址
    }
  }
  return false
}

const loadRemoteFontInWeb = async (fontKey: RemoteFontKey, force = false): Promise<boolean> => {
  const profile = REMOTE_FONT_PROFILE_MAP[fontKey]
  if (!profile) return false
  const sources = resolveRemoteFontSources(fontKey, state.cdnProvider)
  if (sources.length === 0) return false
  return loadRemoteFontWithCache(profile.family, sources, profile.cacheName, force)
}

const loadFontByKey = async (fontKey: FontKey, force = false): Promise<boolean> => {
  if (fontKey === 'default') return true

  const remoteFamily = REMOTE_FONT_FAMILY_MAP[fontKey as Exclude<FontKey, 'default'>]
  if (!force && remoteFamily && document.fonts?.check(`12px ${remoteFamily}`)) {
    if (fontKey === 'deyihei') state.loaded = true
    return true
  }

  let ok = false
  if (fontKey === 'deyihei') {
    ok = isTauri() ? await loadDeyiHeiFontInTauri(force) : await loadDeyiHeiFontInWeb(force)
    state.loaded = !!ok
    return ok
  }

  ok = await loadRemoteFontInWeb(fontKey as RemoteFontKey, force)
  return ok
}

const ensureFontLoaded = async (fontKey: FontKey, force = false): Promise<boolean> => {
  if (fontKey === 'default') return true
  if (fontLoadingMap.has(fontKey)) return false
  fontLoadingMap.add(fontKey)
  try {
    return await loadFontByKey(fontKey, force)
  } catch {
    return false
  } finally {
    fontLoadingMap.delete(fontKey)
  }
}

const loadDeyiHeiFont = async (force = false) => {
  const ok = await ensureFontLoaded('deyihei', force)
  state.loaded = !!ok
  return ok
}

const setFontCdnProvider = (provider: CdnProvider) => {
  if (!FONT_CDN_PROVIDERS.includes(provider)) return
  state.cdnProvider = provider
}

const prefetchCdnFonts = async (
  force = false,
  onProgress?: (payload: {
    key: PrefetchFontKey
    index: number
    total: number
    ok: boolean
  }) => void
) => {
  const targets: PrefetchFontKey[] = ['heiti', 'songti', 'kaiti', 'fangsong', 'deyihei']
  const results: Record<string, boolean> = {}
  for (let i = 0; i < targets.length; i += 1) {
    const key = targets[i]
    const ok = await ensureFontLoaded(key, force)
    results[key] = ok
    onProgress?.({
      key,
      index: i + 1,
      total: targets.length,
      ok
    })
  }
  return results
}

const ensurePreferredFontLoaded = async (fontKey: FontKey) => {
  if (fontKey === 'default') return true
  const loaded = await ensureFontLoaded(fontKey, false)
  if (loaded) return true
  return ensureFontLoaded(fontKey, true)
}

const initFontSettings = () => {
  watch(
    state,
    () => {
      const normalized = normalizeSettings(state)
      const changed = Object.keys(normalized).some((key) => normalized[key as keyof FontState] !== state[key as keyof FontState])
      if (changed) {
        Object.assign(state, normalized)
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized))
      } catch {
        // ignore
      }
      if (typeof document !== 'undefined') {
        applyFont(normalized.font)
      }
      if (normalized.font !== 'default') {
        ensurePreferredFontLoaded(normalized.font).catch(() => {})
      }
    },
    { deep: true, immediate: true }
  )

  if (state.font !== 'default') {
    ensurePreferredFontLoaded(state.font).catch(() => {})
  }
}

const useFontSettings = () => state

const resetFontSettings = () => {
  Object.assign(state, { ...DEFAULT_SETTINGS })
}

export {
  FONT_CDN_OPTIONS,
  FONT_NAME,
  FONT_SOURCES,
  initFontSettings,
  useFontSettings,
  loadDeyiHeiFont,
  ensureFontLoaded,
  setFontCdnProvider,
  prefetchCdnFonts,
  applyFont,
  resetFontSettings
}
