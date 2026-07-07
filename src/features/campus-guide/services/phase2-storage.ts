import type { YunyouUserInfo } from '../types/phase2'

const YUNYOU_INTRO_KEY = 'campus_guide_yunyou_intro_seen'
const YUNYOU_USER_KEY = 'campus_guide_yunyou_user'

export const hasSeenYunyouIntro = () => {
  try {
    return localStorage.getItem(YUNYOU_INTRO_KEY) === '1'
  } catch {
    return false
  }
}

export const markYunyouIntroSeen = () => {
  try {
    localStorage.setItem(YUNYOU_INTRO_KEY, '1')
  } catch {
    // ignore
  }
}

export const readYunyouUser = (): YunyouUserInfo | null => {
  try {
    const raw = localStorage.getItem(YUNYOU_USER_KEY)
    return raw ? (JSON.parse(raw) as YunyouUserInfo) : null
  } catch {
    return null
  }
}

export const writeYunyouUser = (user: YunyouUserInfo | null) => {
  try {
    if (!user) {
      localStorage.removeItem(YUNYOU_USER_KEY)
      return
    }
    localStorage.setItem(YUNYOU_USER_KEY, JSON.stringify(user))
  } catch {
    // ignore
  }
}