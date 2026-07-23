/**
 * 自定义课程颜色：预设色板与 hex 规范化/校验（纯函数，可单测）。
 * 与课表 courseThemes 视觉语言对齐，主色采用偏饱和的 border 色便于卡片描边与色点预览。
 */

export type CourseColorPreset = {
  id: string
  /** 主色（hex），写入表单/持久化 */
  hex: string
  /** 浅底（传统卡片背景参考） */
  bg: string
  /** 深字色 */
  text: string
  label: string
}

/** 与 ScheduleView courseThemes 对齐的 12 色预设 */
export const COURSE_COLOR_PRESETS: readonly CourseColorPreset[] = [
  { id: 'lake', hex: '#72b9ff', bg: '#e7f4ff', text: '#0f5da8', label: '湖蓝' },
  { id: 'coral', hex: '#ffb390', bg: '#fff0e8', text: '#cb4f2f', label: '珊瑚橘' },
  { id: 'wisteria', hex: '#b8aaff', bg: '#efe9ff', text: '#5f52cf', label: '紫藤' },
  { id: 'amber', hex: '#efc465', bg: '#fff4db', text: '#be7a07', label: '琥珀' },
  { id: 'rose', hex: '#f3a8c4', bg: '#ffeaf2', text: '#c33f73', label: '玫瑰' },
  { id: 'teal', hex: '#8adcc4', bg: '#e8faf5', text: '#117f67', label: '青绿' },
  { id: 'indigo', hex: '#9eb4ff', bg: '#e8efff', text: '#335ccb', label: '靛蓝' },
  { id: 'berry', hex: '#f0acbb', bg: '#fff1f5', text: '#b63f58', label: '浅莓' },
  { id: 'spring', hex: '#9dd7a7', bg: '#edf8ef', text: '#2f8c3d', label: '春绿' },
  { id: 'sky', hex: '#84d6ec', bg: '#e8f9ff', text: '#007893', label: '青空' },
  { id: 'orchid', hex: '#c6adf1', bg: '#f4edff', text: '#7548c1', label: '兰紫' },
  { id: 'apricot', hex: '#efb67f', bg: '#fff2e2', text: '#b05c16', label: '暖杏' },
] as const

/** 未选择时的默认主色（空字符串表示沿用系统自动配色） */
export const DEFAULT_COURSE_COLOR = ''

const HEX6_RE = /^#([0-9a-fA-F]{6})$/
const HEX3_RE = /^#([0-9a-fA-F]{3})$/
const HEX8_RE = /^#([0-9a-fA-F]{8})$/

/**
 * 判断字符串是否为可接受的 hex 颜色（#RGB / #RRGGBB / #RRGGBBAA）。
 */
export function isValidHexColor(value: unknown): boolean {
  if (typeof value !== 'string') return false
  const raw = value.trim()
  return HEX6_RE.test(raw) || HEX3_RE.test(raw) || HEX8_RE.test(raw)
}

/**
 * 将输入规范化为 #RRGGBB（小写）；非法则返回 null。
 * 8 位 hex 丢弃 alpha；#RGB 扩展为 6 位。
 * 无 # 前缀时仅接受 6/8 位（避免 "bad" 等被当成 3 位 hex）。
 */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null

  const hasHash = raw.startsWith('#')
  let body = hasHash ? raw.slice(1).trim() : raw

  if (hasHash && /^[0-9a-fA-F]{3}$/.test(body)) {
    body = body
      .split('')
      .map((ch) => ch + ch)
      .join('')
  } else if (/^[0-9a-fA-F]{8}$/.test(body)) {
    body = body.slice(0, 6)
  } else if (!/^[0-9a-fA-F]{6}$/.test(body)) {
    return null
  }

  return `#${body.toLowerCase()}`
}

/**
 * 规范化用户可选颜色：空/空白 → 空字符串（表示未设定）；非法 → null。
 */
export function normalizeOptionalCourseColor(value: unknown): string | null {
  if (value === null || value === undefined) return ''
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return ''
  return normalizeHexColor(trimmed)
}

/** 预设主色列表（hex） */
export function getPresetHexList(): string[] {
  return COURSE_COLOR_PRESETS.map((p) => p.hex)
}

/**
 * 若 hex 匹配某个预设（忽略大小写），返回该预设；否则 null。
 */
export function findPresetByHex(hex: unknown): CourseColorPreset | null {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return null
  return COURSE_COLOR_PRESETS.find((p) => p.hex.toLowerCase() === normalized) ?? null
}

/**
 * 由主色推导可读的深色文字色（用于传统卡片文字）。
 * 简单相对亮度：亮色用深字，暗色用白字。
 */
export function contrastTextForHex(hex: unknown): string {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return '#0f172a'
  const r = parseInt(normalized.slice(1, 3), 16)
  const g = parseInt(normalized.slice(3, 5), 16)
  const b = parseInt(normalized.slice(5, 7), 16)
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  return luminance > 0.55 ? '#0f172a' : '#ffffff'
}

/**
 * 将主色混合到白色得到浅底（传统卡片背景）。
 * amount: 0~1，越大主色占比越高。
 */
export function mixHexWithWhite(hex: unknown, amount = 0.22): string {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return '#f8fafc'
  const t = Math.min(1, Math.max(0, amount))
  const r = parseInt(normalized.slice(1, 3), 16)
  const g = parseInt(normalized.slice(3, 5), 16)
  const b = parseInt(normalized.slice(5, 7), 16)
  const mix = (c: number) => Math.round(255 * (1 - t) + c * t)
  const toHex = (n: number) => n.toString(16).padStart(2, '0')
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
}

export type HsvColor = { h: number; s: number; v: number }

export function hexToHsv(hex: unknown): HsvColor | null {
  const normalized = normalizeHexColor(hex)
  if (!normalized) return null
  const r = parseInt(normalized.slice(1, 3), 16) / 255
  const g = parseInt(normalized.slice(3, 5), 16) / 255
  const b = parseInt(normalized.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const d = max - min
  let h = 0
  if (d !== 0) {
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60
    else if (max === g) h = ((b - r) / d + 2) * 60
    else h = ((r - g) / d + 4) * 60
  }
  const s = max === 0 ? 0 : d / max
  return { h, s, v: max }
}

export function hsvToHex(h: number, s: number, v: number): string {
  const hh = ((h % 360) + 360) % 360
  const ss = Math.min(1, Math.max(0, s))
  const vv = Math.min(1, Math.max(0, v))
  const c = vv * ss
  const x = c * (1 - Math.abs(((hh / 60) % 2) - 1))
  const m = vv - c
  let rp = 0
  let gp = 0
  let bp = 0
  if (hh < 60) {
    rp = c
    gp = x
  } else if (hh < 120) {
    rp = x
    gp = c
  } else if (hh < 180) {
    gp = c
    bp = x
  } else if (hh < 240) {
    gp = x
    bp = c
  } else if (hh < 300) {
    rp = x
    bp = c
  } else {
    rp = c
    bp = x
  }
  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, '0')
  return `#${toHex(rp)}${toHex(gp)}${toHex(bp)}`
}
