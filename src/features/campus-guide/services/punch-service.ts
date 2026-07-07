import { phase2Api } from '../api/phase2-client'
import { CAMPUS_GUIDE_CONFIG } from '../config'
import type { GeoPoint } from '../types'
import type { PunchCard, PunchCardListResult, StudentCardInfo } from '../types/phase2'
import { distanceMeters } from '../utils/geo'
import { getCampusGuideOpenId } from './device-id'

const CHECK_RADIUS_METERS = 120

export const loadPunchCards = async (): Promise<PunchCardListResult> =>
  phase2Api.getCardList({ open_id: getCampusGuideOpenId() })

export const checkInPunchCard = async (card: PunchCard, location: GeoPoint) => {
  if (!card.point) throw new Error('该打卡点缺少坐标信息')
  const distance = distanceMeters(location, card.point)
  if (distance > CHECK_RADIUS_METERS) {
    throw new Error(`距离打卡点还有 ${Math.round(distance)} 米，请靠近后再试`)
  }
  await phase2Api.postCardCheck({
    open_id: getCampusGuideOpenId(),
    card_id: card.card_id,
    latitude: location.latitude,
    longitude: location.longitude
  })
  return loadPunchCards()
}

export const composePunchPostcard = async () => {
  const result = await phase2Api.postCardCompose({ open_id: getCampusGuideOpenId() })
  return String(result?.compose_url || result?.url || '')
}

export const loadStudentCard = async (): Promise<StudentCardInfo> =>
  phase2Api.getStudentCardInfo({ open_id: getCampusGuideOpenId() })

export const saveStudentCard = async (payload: Record<string, unknown>) =>
  phase2Api.updateStudentCard({
    open_id: getCampusGuideOpenId(),
    scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
    ...payload
  })

export const canCheckInCard = (card: PunchCard, location: GeoPoint) => {
  if (!card.point || card.is_check) return false
  return distanceMeters(location, card.point) <= CHECK_RADIUS_METERS
}