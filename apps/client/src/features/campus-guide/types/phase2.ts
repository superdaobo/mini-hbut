import type { GeoPoint } from './index'

export interface PunchCard {
  card_id: string | number
  name: string
  number: number
  numberArr: string[]
  is_check: boolean
  latitude?: number
  longitude?: number
  point?: GeoPoint
  pic?: string
  info?: string
  spot_id?: string | number
  raw?: unknown
}

export interface PunchCardListResult {
  card_list: PunchCard[]
  total: number
  checkedTotal: number
  compose_url?: string
  raw?: unknown
}

export interface ShirtSlot {
  id?: string | number
  name?: string
  pic?: string
  position_z: number
  raw?: unknown
}

export interface ShirtInfo {
  isJoin: boolean
  number?: number
  frontList: ShirtSlot[]
  behindList: ShirtSlot[]
  list: ShirtSlot[]
  raw?: unknown
}

export interface StudentCardInfo {
  name?: string
  college?: string
  major?: string
  grade?: string
  student_no?: string
  avatar?: string
  card_url?: string
  raw?: unknown
}

export interface YunyouUserInfo {
  nickName: string
  avatarUrl?: string
}