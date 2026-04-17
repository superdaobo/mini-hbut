const DAILY_ACCESS_STORAGE_KEY = 'hbu_daily_access_grant'
const DAILY_ACCESS_SALT = 'MiniHBUT::DailyAccess::2025'
const KEY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'

const getAccessStorage = () => {
  if (typeof window === 'undefined') return null
  return window.sessionStorage || window.localStorage
}

export const PROTECTED_VIEWS = Object.freeze([
  // 视图级门禁已迁移到模块级（更多页仅刷课模块单点校验）
])

const PROTECTED_VIEW_LABELS = Object.freeze({
  more: '更多中心'
})

const normalizeDate = (value = new Date()) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  const parsed = new Date(value)
  if (!Number.isNaN(parsed.getTime())) return parsed
  return new Date()
}

export const getDailyDateStamp = (value = new Date()) => {
  const date = normalizeDate(value)
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}${month}${day}`
}

const fnv1a = (input) => {
  let hash = 0x811c9dc5
  for (const char of String(input || '')) {
    hash ^= char.codePointAt(0) || 0
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

const encodeChunk = (value, length = 5) => {
  let current = value >>> 0
  let output = ''
  for (let i = 0; i < length; i += 1) {
    output = KEY_ALPHABET[current & 31] + output
    current = current >>> 5
  }
  return output
}

export const generateDailyAccessKey = (value = new Date()) => {
  const stamp = getDailyDateStamp(value)
  const left = encodeChunk((fnv1a(`${DAILY_ACCESS_SALT}:${stamp}:L`) ^ 0x13579bdf) >>> 0)
  const right = encodeChunk((fnv1a(`${DAILY_ACCESS_SALT}:${stamp}:R`) ^ 0x2468ace0) >>> 0)
  return `${left}-${right}`
}

export const sanitizeDailyAccessInput = (value = '') => {
  const cleaned = String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replace(/[IO]/g, '')
    .slice(0, 10)
  return cleaned.length > 5 ? `${cleaned.slice(0, 5)}-${cleaned.slice(5)}` : cleaned
}

export const verifyDailyAccessKey = (value, date = new Date()) => {
  return sanitizeDailyAccessInput(value) === generateDailyAccessKey(date)
}

export const isProtectedView = (view) => {
  const normalized = String(view || '').trim()
  return PROTECTED_VIEWS.includes(normalized)
}

export const getProtectedViewLabel = (view) => {
  const normalized = String(view || '').trim()
  return PROTECTED_VIEW_LABELS[normalized] || '该页面'
}

export const hasDailyAccessGrant = (date = new Date()) => {
  const storage = getAccessStorage()
  if (!storage) return false
  const expected = getDailyDateStamp(date)
  const stored = String(storage.getItem(DAILY_ACCESS_STORAGE_KEY) || '').trim()
  if (!stored) return false
  if (stored === expected) return true
  storage.removeItem(DAILY_ACCESS_STORAGE_KEY)
  return false
}

export const markDailyAccessGranted = (date = new Date()) => {
  const storage = getAccessStorage()
  if (!storage) return
  storage.setItem(DAILY_ACCESS_STORAGE_KEY, getDailyDateStamp(date))
}

export const clearDailyAccessGrant = () => {
  const storage = getAccessStorage()
  if (!storage) return
  storage.removeItem(DAILY_ACCESS_STORAGE_KEY)
}
