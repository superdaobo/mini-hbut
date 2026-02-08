import { reactive, watch } from 'vue'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { readFile } from '@tauri-apps/plugin-fs'

const STORAGE_KEY = 'hbu_font_settings_v1'
const CACHE_NAME = 'hbu-font-cache-v1'
const FONT_NAME = 'DeyiHei'

const FONT_SOURCES = [
  'https://raw.gitcode.com/superdaobo/mini-hbut-config/blobs/c297dc6928402fc0c73cec17ea7518d3731f7022/SmileySans-Oblique.ttf'
]


const ANDROID_SANS = "'Noto Sans SC', 'Noto Sans CJK SC', 'Roboto', sans-serif"
const ANDROID_SERIF = "'Noto Serif SC', 'Noto Serif CJK SC', serif"
const FONT_FALLBACK = `'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'Source Han Sans SC', 'WenQuanYi Micro Hei', ${ANDROID_SANS}`
const FONT_STACKS = {
  default: FONT_FALLBACK,
  deyihei: `'DeyiHei', ${FONT_FALLBACK}`,
  kaiti: `'KaiTi', 'STKaiti', 'KaiTi_GB2312', 'Kaiti SC', ${ANDROID_SERIF}`,
  heiti: `'SimHei', 'Heiti SC', 'Microsoft YaHei', ${ANDROID_SANS}`,
  songti: `'SimSun', 'Songti SC', 'STSong', ${ANDROID_SERIF}`,
  fangsong: `'FangSong', 'STFangsong', ${ANDROID_SERIF}`
} as const

const SUPPORTED_FONTS = new Set(Object.keys(FONT_STACKS))

type FontKey = keyof typeof FONT_STACKS
type FontState = {
  font: FontKey
  loaded: boolean
}

type FontDownloadPayload = {
  path: string
  base64?: string
}

const DEFAULT_SETTINGS: FontState = {
  font: 'default',
  loaded: false
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
  return {
    font: (SUPPORTED_FONTS.has(requested) ? requested : 'default') as FontKey,
    loaded: !!obj.loaded
  }
}

const state = reactive<FontState>(normalizeSettings(loadStoredSettings()))

const isTauri = () => typeof window !== 'undefined' && '__TAURI__' in window

let deyiheiLoading = false

const resolveWebFontUrl = () => {
  return FONT_SOURCES[0]
}

const applyFont = (fontKey: FontKey) => {
  const root = document.documentElement
  if (!root) return
  const stack = FONT_STACKS[fontKey] || FONT_STACKS.default
  root.style.setProperty('--ui-font-family', stack)
}

const ensureFontFaceStyle = (src: string) => {
  if (typeof document === 'undefined') return
  const id = 'deyihei-font-face'
  const existing = document.getElementById(id)
  const css = `@font-face { font-family: '${FONT_NAME}'; src: url('${src}') format('truetype'); font-display: swap; }`
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

const loadFontFromBytes = async (bytes: Uint8Array) => {
  if (typeof document === 'undefined') return false
  if (typeof FontFace === 'undefined') return false
  const font = new FontFace(FONT_NAME, toArrayBuffer(bytes))
  await font.load()
  document.fonts.add(font)
  await document.fonts.load(`12px ${FONT_NAME}`)
  return true
}

const loadFontFromUrl = async (src: string) => {
  if (typeof document === 'undefined') return false
  try {
    if (typeof FontFace !== 'undefined') {
      const font = new FontFace(FONT_NAME, `url(${src})`)
      await font.load()
      document.fonts.add(font)
      await document.fonts.load(`12px ${FONT_NAME}`)
      return true
    }
  } catch {
    // fallback to injected @font-face
  }
  ensureFontFaceStyle(src)
  if (document.fonts?.load) {
    await document.fonts.load(`12px ${FONT_NAME}`)
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
    const loaded = await loadFontFromBytes(bytes)
    if (loaded) return true
  }

  if (payload.path) {
    try {
      const bytes = await readFile(payload.path)
      const loaded = await loadFontFromBytes(bytes)
      if (loaded) return true
    } catch {
      // fallback to asset protocol loading
    }
    const fileSrc = convertFileSrc(payload.path)
    return loadFontFromUrl(fileSrc)
  }

  // fallback to legacy command
  const path = await invoke<string>('download_deyihei_font', {
    url: FONT_SOURCES[0],
    urls: FONT_SOURCES,
    force: !!force
  })
  const fileSrc = convertFileSrc(path)
  return loadFontFromUrl(fileSrc)
}

const loadDeyiHeiFontInWeb = async (force = false) => {
  const resolvedUrl = resolveWebFontUrl()
  let response: Response | null = null

  if (!force && typeof caches !== 'undefined') {
    const cache = await caches.open(CACHE_NAME)
    response = await cache.match(resolvedUrl)
  }
  if (!response) {
    response = await fetch(resolvedUrl, { mode: 'cors' })
    if (!response.ok) throw new Error(`font download failed: ${response.status}`)
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(resolvedUrl, response.clone())
    }
  }

  const buffer = await response.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  return loadFontFromBytes(bytes)
}

const loadDeyiHeiFont = async (force = false) => {
  if (!force && document.fonts?.check(`12px ${FONT_NAME}`)) {
    state.loaded = true
    return true
  }

  if (typeof FontFace === 'undefined') {
    throw new Error('当前环境不支持字体动态加载')
  }

  const ok = isTauri()
    ? await loadDeyiHeiFontInTauri(force)
    : await loadDeyiHeiFontInWeb(force)

  state.loaded = !!ok
  return ok
}

const ensureDeyiHeiFont = async (force = false) => {
  if (deyiheiLoading) return
  deyiheiLoading = true
  try {
    await loadDeyiHeiFont(force)
  } catch {
    // keep current state
  } finally {
    deyiheiLoading = false
  }
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
      if (normalized.font === 'deyihei' && !normalized.loaded) {
        ensureDeyiHeiFont()
      }
    },
    { deep: true, immediate: true }
  )

  if (state.font === 'deyihei' && !state.loaded) {
    ensureDeyiHeiFont()
  }
}

const useFontSettings = () => state

const resetFontSettings = () => {
  Object.assign(state, { ...DEFAULT_SETTINGS })
}

export {
  FONT_NAME,
  FONT_SOURCES,
  initFontSettings,
  useFontSettings,
  loadDeyiHeiFont,
  applyFont,
  resetFontSettings
}
