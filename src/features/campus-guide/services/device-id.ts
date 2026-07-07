const DEVICE_KEY = 'campus_guide_device_id'
const OPEN_ID_KEY = 'campus_guide_open_id'

export const getCampusGuideDeviceId = () => {
  try {
    const existing = localStorage.getItem(DEVICE_KEY)
    if (existing) return existing
    const next = `cg_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
    localStorage.setItem(DEVICE_KEY, next)
    return next
  } catch {
    return `cg_fallback_${Date.now()}`
  }
}

export const getCampusGuideOpenId = () => {
  try {
    return localStorage.getItem(OPEN_ID_KEY) || getCampusGuideDeviceId()
  } catch {
    return getCampusGuideDeviceId()
  }
}

export const setCampusGuideOpenId = (openId: string) => {
  try {
    localStorage.setItem(OPEN_ID_KEY, openId)
  } catch {
    // ignore
  }
}