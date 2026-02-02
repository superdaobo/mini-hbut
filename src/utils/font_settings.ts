import { reactive, watch } from 'vue'
import { convertFileSrc, invoke } from '@tauri-apps/api/core'

const STORAGE_KEY = 'hbu_font_settings_v1'
const CACHE_NAME = 'hbu-font-cache-v1'
const FONT_NAME = 'DeyiHei'
const FONT_URL = 'https://raw.gitcode.com/superdaobo/mini-hbut-config/blobs/c297dc6928402fc0c73cec17ea7518d3731f7022/SmileySans-Oblique.ttf'
const DEV_FONT_PROXY = '/font/deyihei.ttf'

const FONT_FALLBACK = "'Noto Sans SC', 'Microsoft YaHei', 'PingFang SC', 'Hiragino Sans GB', 'Source Han Sans SC', 'WenQuanYi Micro Hei', sans-serif"
const FONT_STACKS = {
  default: FONT_FALLBACK,
  deyihei: `'DeyiHei', ${FONT_FALLBACK}`,
  kaiti: "'KaiTi', 'STKaiti', 'KaiTi_GB2312', 'Kaiti SC', serif",
  heiti: "'SimHei', 'Heiti SC', 'Microsoft YaHei', sans-serif",
  songti: "'SimSun', 'Songti SC', 'STSong', serif",
  fangsong: "'FangSong', 'STFangsong', serif"
}
const SUPPORTED_FONTS = new Set(Object.keys(FONT_STACKS))

const DEFAULT_SETTINGS = {
  font: 'default',
  loaded: false
}

const loadStoredSettings = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const normalizeSettings = (raw) => {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_SETTINGS }
  const requested = typeof raw.font === 'string' ? raw.font : 'default'
  return {
    font: SUPPORTED_FONTS.has(requested) ? requested : 'default',
    loaded: !!raw.loaded
  }
}

const state = reactive(normalizeSettings(loadStoredSettings()))

const isTauri = () => typeof window !== 'undefined' && '__TAURI__' in window

let deyiheiLoading = false

const resolveWebFontUrl = () => {
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
    return DEV_FONT_PROXY
  }
  return FONT_URL
}

const applyFont = (fontKey) => {
  const root = document.documentElement
  if (!root) return
  const stack = FONT_STACKS[fontKey] || FONT_STACKS.default
  root.style.setProperty('--ui-font-family', stack)
}

const loadDeyiHeiFont = async (force = false) => {
  if (!force && document.fonts?.check(`12px ${FONT_NAME}`)) {
    state.loaded = true
    return true
  }
  if (typeof FontFace === 'undefined') {
    throw new Error('当前环境不支持字体加载')
  }

  if (isTauri()) {
    const filePath = await invoke<string>('download_deyihei_font', {
      url: FONT_URL,
      force: !!force
    })
    const fileSrc = convertFileSrc(filePath)
    const font = new FontFace(FONT_NAME, `url(${fileSrc})`)
    await font.load()
    document.fonts.add(font)
    state.loaded = true
    return true
  }

  const resolvedUrl = resolveWebFontUrl()
  let response = null
  if (!force && typeof caches !== 'undefined') {
    const cache = await caches.open(CACHE_NAME)
    response = await cache.match(resolvedUrl)
  }
  if (!response) {
    response = await fetch(resolvedUrl, { mode: 'cors' })
    if (!response.ok) throw new Error('下载失败')
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(CACHE_NAME)
      await cache.put(resolvedUrl, response.clone())
    }
  }
  const buffer = await response.arrayBuffer()
  const font = new FontFace(FONT_NAME, buffer)
  await font.load()
  document.fonts.add(font)
  state.loaded = true
  return true
}

const ensureDeyiHeiFont = async (force = false) => {
  if (deyiheiLoading) return
  deyiheiLoading = true
  try {
    await loadDeyiHeiFont(force)
  } catch {
    // leave loaded state untouched on failure
  } finally {
    deyiheiLoading = false
  }
}

const initFontSettings = () => {
  watch(
    state,
    () => {
      const normalized = normalizeSettings(state)
      const changed = Object.keys(normalized).some((key) => normalized[key] !== state[key])
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
  FONT_URL,
  initFontSettings,
  useFontSettings,
  loadDeyiHeiFont,
  applyFont,
  resetFontSettings
}
