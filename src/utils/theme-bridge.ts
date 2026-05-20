/**
 * Theme Bridge — 主题桥接模块
 *
 * 将 UI_PRESETS 中的主题颜色映射到 Tailwind CSS / shadcn-vue 所需的 CSS 自定义属性。
 * 通过动态修改 :root 上的 CSS 变量实现运行时主题切换，无需 Tailwind 重编译。
 *
 * 职责：
 * - hexToHsl: 颜色格式转换 (hex → HSL)
 * - transformPresetToAppleDesign: 将 UiPreset 转换为 Apple 设计规范的 CSS 变量集
 * - applyThemePreset: 应用指定主题预设到 :root
 * - initThemeBridge: 初始化（读取持久化偏好，首次绘制前注入 CSS 变量）
 */

import type { UiPreset, UiThemeCategory } from '@/config/ui_settings'
import { UI_PRESETS } from '@/config/ui_settings'

// localStorage 存储键（与 ui_settings.ts 保持一致）
const UI_SETTINGS_STORAGE_KEY = 'hbu_ui_settings_v2'

// 默认回退预设
const DEFAULT_PRESET_KEY = 'campus_blue'

/**
 * 将 hex 颜色值转换为 HSL 字符串格式 "H S% L%"
 * 用于 CSS 变量中 hsl(var(--x) / alpha) 的写法
 *
 * @param hex - 十六进制颜色值，如 "#0066cc" 或 "0066cc"
 * @returns HSL 字符串，格式为 "H S% L%"（空格分隔，无逗号）
 */
export function hexToHsl(hex: string): string {
  if (!hex || typeof hex !== 'string') {
    console.warn('[theme-bridge] hexToHsl: 无效颜色值', hex)
    return '0 0% 0%'
  }

  // 去除 # 前缀并规范化
  const cleaned = hex.replace(/^#/, '').trim()

  // 验证长度（支持 3 位和 6 位 hex）
  if (!/^[0-9a-fA-F]{3}$|^[0-9a-fA-F]{6}$/.test(cleaned)) {
    console.warn('[theme-bridge] hexToHsl: 无效颜色格式', hex)
    return '0 0% 0%'
  }

  // 展开 3 位 hex 为 6 位
  const fullHex =
    cleaned.length === 3
      ? cleaned[0] + cleaned[0] + cleaned[1] + cleaned[1] + cleaned[2] + cleaned[2]
      : cleaned

  const r = parseInt(fullHex.slice(0, 2), 16) / 255
  const g = parseInt(fullHex.slice(2, 4), 16) / 255
  const b = parseInt(fullHex.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const delta = max - min

  // 计算 Lightness
  const l = (max + min) / 2

  if (delta === 0) {
    // 无色相（灰色）
    return `0 0% ${Math.round(l * 100)}%`
  }

  // 计算 Saturation
  const s = l > 0.5 ? delta / (2 - max - min) : delta / (max + min)

  // 计算 Hue
  let h: number
  if (max === r) {
    h = ((g - b) / delta + (g < b ? 6 : 0)) * 60
  } else if (max === g) {
    h = ((b - r) / delta + 2) * 60
  } else {
    h = ((r - g) / delta + 4) * 60
  }

  return `${Math.round(h)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`
}

/**
 * 将 UiPreset 转换为符合 Apple 设计规范的 CSS 变量集
 *
 * 转换规则：
 * - light/vivid/neutral 类别: primary → #0066cc, background → #f5f5f7, card → #ffffff
 * - dark 类别: primary → #2997ff, background → #272729, card → #2a2a2c
 *
 * @param preset - UI 预设对象
 * @returns CSS 变量键值对（键含 -- 前缀，值为 HSL 格式）
 */
export function transformPresetToAppleDesign(preset: UiPreset): Record<string, string> {
  const isDark = preset.category === 'dark'

  if (isDark) {
    // 暗色模式 Apple 设计规范
    return {
      '--primary': hexToHsl('#2997ff'),           // primary-on-dark
      '--primary-foreground': hexToHsl('#ffffff'), // on-dark
      '--secondary': hexToHsl('#2a2a2c'),         // surface-tile-2
      '--secondary-foreground': hexToHsl('#ffffff'),
      '--background': hexToHsl('#272729'),        // surface-tile-1
      '--foreground': hexToHsl('#ffffff'),         // on-dark
      '--card': hexToHsl('#2a2a2c'),              // surface-tile-2
      '--card-foreground': hexToHsl('#ffffff'),
      '--border': hexToHsl('#252527'),            // surface-tile-3
      '--muted': hexToHsl('#252527'),             // surface-tile-3
      '--muted-foreground': hexToHsl('#cccccc'),  // body-muted
      '--accent': hexToHsl('#252527'),            // surface-tile-3
      '--accent-foreground': hexToHsl('#ffffff'),
      '--destructive': hexToHsl('#ef4444'),       // 标准 destructive
      '--destructive-foreground': hexToHsl('#ffffff'),
      '--radius': '0.6875rem',                    // 11px = rounded.md
    }
  }

  // 亮色/vivid/neutral 模式 Apple 设计规范
  return {
    '--primary': hexToHsl('#0066cc'),             // Apple primary blue
    '--primary-foreground': hexToHsl('#ffffff'),   // on-primary
    '--secondary': hexToHsl('#f5f5f7'),           // canvas-parchment
    '--secondary-foreground': hexToHsl('#1d1d1f'), // ink
    '--background': hexToHsl('#f5f5f7'),          // canvas-parchment
    '--foreground': hexToHsl('#1d1d1f'),           // ink
    '--card': hexToHsl('#ffffff'),                 // canvas (white)
    '--card-foreground': hexToHsl('#1d1d1f'),      // ink
    '--border': hexToHsl('#e0e0e0'),              // hairline
    '--muted': hexToHsl('#f5f5f7'),               // canvas-parchment
    '--muted-foreground': hexToHsl('#7a7a7a'),    // ink-muted-48
    '--accent': hexToHsl('#f5f5f7'),              // canvas-parchment
    '--accent-foreground': hexToHsl('#1d1d1f'),    // ink
    '--destructive': hexToHsl('#ef4444'),          // 标准 destructive
    '--destructive-foreground': hexToHsl('#ffffff'),
    '--radius': '0.6875rem',                      // 11px = rounded.md
  }
}

/**
 * 应用指定主题预设
 *
 * 1. 从 UI_PRESETS 获取预设
 * 2. 调用 transformPresetToAppleDesign 转换
 * 3. 将所有 CSS 变量设置到 document.documentElement.style
 * 4. 根据预设类别添加/移除 dark class
 *
 * @param presetKey - 预设键名（如 'campus_blue', 'graphite_night'）
 */
export function applyThemePreset(presetKey: string): void {
  const preset = UI_PRESETS[presetKey]

  if (!preset) {
    console.warn(`[theme-bridge] 未知预设 "${presetKey}"，回退到 "${DEFAULT_PRESET_KEY}"`)
    const fallback = UI_PRESETS[DEFAULT_PRESET_KEY]
    if (!fallback) return
    applyThemePresetInternal(fallback)
    return
  }

  applyThemePresetInternal(preset)
}

/**
 * 内部实现：应用预设到 DOM
 */
function applyThemePresetInternal(preset: UiPreset): void {
  if (typeof document === 'undefined') return

  const vars = transformPresetToAppleDesign(preset)
  const root = document.documentElement

  // 注入所有 CSS 变量到 :root
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value)
  }

  // 管理 dark class
  if (preset.category === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
}

/**
 * 检测操作系统颜色方案偏好
 *
 * @returns 'dark' | 'light'
 */
function detectOsColorScheme(): UiThemeCategory {
  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')
      if (darkQuery.matches) return 'dark'
    }
  } catch {
    // OS 偏好检测失败，默认 light
  }
  return 'light'
}

/**
 * 从 localStorage 读取持久化的主题预设键
 *
 * @returns 预设键名，或 null（无持久化数据）
 */
function readPersistedPresetKey(): string | null {
  try {
    const raw = localStorage.getItem(UI_SETTINGS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.preset === 'string' && UI_PRESETS[parsed.preset]) {
      return parsed.preset
    }
    return null
  } catch {
    // Pinia/localStorage 读取失败
    return null
  }
}

/**
 * 初始化主题桥接
 *
 * 执行顺序：
 * 1. 读取 localStorage 中持久化的主题偏好
 * 2. 若无偏好，检测 OS prefers-color-scheme 作为默认值
 * 3. 在首次绘制前注入 CSS 变量
 * 4. 设置 OS 颜色方案变化监听器
 */
export function initThemeBridge(): void {
  if (typeof document === 'undefined') return

  // 1. 读取持久化偏好
  const persistedKey = readPersistedPresetKey()

  let presetKey: string

  if (persistedKey) {
    // 使用持久化的偏好
    presetKey = persistedKey
  } else {
    // 无持久化偏好，根据 OS 颜色方案选择默认主题
    const osScheme = detectOsColorScheme()
    if (osScheme === 'dark') {
      // 查找第一个 dark 类别的预设
      const darkPresetKey = Object.keys(UI_PRESETS).find(
        (key) => UI_PRESETS[key].category === 'dark'
      )
      presetKey = darkPresetKey || DEFAULT_PRESET_KEY
    } else {
      presetKey = DEFAULT_PRESET_KEY
    }
  }

  // 2. 首次绘制前注入 CSS 变量
  applyThemePreset(presetKey)

  // 3. 监听 OS 颜色方案变化（仅在无用户偏好时响应）
  setupOsSchemeListener()

  // 4. 初始化暗色模式 class（从 localStorage 读取用户偏好）
  initDarkModeClass()
}

/**
 * 初始化暗色模式 class
 * 在首次绘制前根据 localStorage 偏好设置 html.dark class
 */
function initDarkModeClass(): void {
  if (typeof document === 'undefined') return
  try {
    const stored = localStorage.getItem('hbu_dark_mode')
    if (stored === '1') {
      document.documentElement.classList.add('dark')
    } else if (stored === '0') {
      document.documentElement.classList.remove('dark')
    }
  } catch {
    // localStorage 不可用时静默忽略
  }
}

/**
 * 设置 OS 颜色方案变化监听器
 * 当用户未手动设置主题偏好时，跟随系统切换
 */
function setupOsSchemeListener(): void {
  try {
    if (typeof window === 'undefined' || !window.matchMedia) return

    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)')

    const handler = (event: MediaQueryListEvent) => {
      // 仅在无用户持久化偏好时响应 OS 变化
      const persisted = readPersistedPresetKey()
      if (persisted) return

      if (event.matches) {
        const darkPresetKey = Object.keys(UI_PRESETS).find(
          (key) => UI_PRESETS[key].category === 'dark'
        )
        applyThemePreset(darkPresetKey || DEFAULT_PRESET_KEY)
      } else {
        applyThemePreset(DEFAULT_PRESET_KEY)
      }
    }

    // 兼容旧版浏览器 API
    if (darkQuery.addEventListener) {
      darkQuery.addEventListener('change', handler)
    } else if (darkQuery.addListener) {
      darkQuery.addListener(handler)
    }
  } catch {
    // 监听器设置失败，静默忽略
  }
}
