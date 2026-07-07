import type { PunchCard, PunchCardListResult, ShirtInfo, ShirtSlot, StudentCardInfo } from '../types/phase2'

const toNumber = (value: unknown) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : NaN
}

const padNumberArr = (number: number) => {
  const text = String(number)
  return ('00000' + text).slice(-5).split('')
}

const normalizePunchCard = (raw: unknown): PunchCard | null => {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  const cardId = data.card_id ?? data.id
  const name = String(data.name || data.title || '').trim()
  const number = toNumber(data.number)
  if (!cardId || !name) return null
  const lat = toNumber(data.latitude ?? data.lat)
  const lng = toNumber(data.longitude ?? data.lng ?? data.lon)
  const point =
    Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : undefined
  return {
    card_id: cardId as string | number,
    name,
    number: Number.isFinite(number) ? number : 0,
    numberArr: Array.isArray(data.numberArr)
      ? (data.numberArr as string[])
      : padNumberArr(Number.isFinite(number) ? number : 0),
    is_check: Boolean(data.is_check),
    latitude: point?.latitude,
    longitude: point?.longitude,
    point,
    pic: data.pic ? String(data.pic) : undefined,
    info: data.info ? String(data.info) : undefined,
    spot_id: data.spot_id as string | number | undefined,
    raw
  }
}

export const normalizePunchCardList = (raw: unknown): PunchCardListResult => {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const list = Array.isArray(data.card_list) ? data.card_list : []
  const card_list = list.map(normalizePunchCard).filter(Boolean) as PunchCard[]
  return {
    card_list,
    total: card_list.length,
    checkedTotal: card_list.filter((item) => item.is_check).length,
    compose_url: data.compose_url ? String(data.compose_url) : undefined,
    raw
  }
}

const normalizeShirtSlot = (raw: unknown): ShirtSlot | null => {
  if (!raw || typeof raw !== 'object') return null
  const data = raw as Record<string, unknown>
  return {
    id: (data.id ?? data.shirt_id) as string | number | undefined,
    name: data.name ? String(data.name) : undefined,
    pic: data.pic ? String(data.pic) : undefined,
    position_z: toNumber(data.position_z),
    raw
  }
}

export const normalizeShirtInfo = (raw: unknown): ShirtInfo => {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const list = (Array.isArray(data.list) ? data.list : []).map(normalizeShirtSlot).filter(Boolean) as ShirtSlot[]
  const frontList = list.filter((item) => item.position_z === 0)
  const behindList = list.filter((item) => item.position_z === 1)
  return {
    isJoin: Number(data.enroll) === 1,
    number: toNumber(data.number),
    frontList: frontList.length ? frontList : list.filter((_, index) => index % 2 === 0),
    behindList: behindList.length ? behindList : list.filter((_, index) => index % 2 === 1),
    list,
    raw
  }
}

export const normalizeStudentCardInfo = (raw: unknown): StudentCardInfo => {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  return {
    name: data.name ? String(data.name) : undefined,
    college: data.college ? String(data.college) : undefined,
    major: data.major ? String(data.major) : undefined,
    grade: data.grade ? String(data.grade) : undefined,
    student_no: data.student_no ? String(data.student_no) : undefined,
    avatar: data.avatar ? String(data.avatar) : undefined,
    card_url: data.card_url ? String(data.card_url) : undefined,
    raw
  }
}