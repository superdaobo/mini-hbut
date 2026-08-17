import { CAMPUS_GUIDE_CONFIG } from '../config'
import { normalizePunchCardList, normalizeShirtInfo, normalizeStudentCardInfo } from './phase2-normalize'
import { PHASE2_ENDPOINTS } from './phase2-endpoints'
import { wisdomPost } from './wisdom_client'

const withScenic = (params: Record<string, unknown> = {}) => ({
  scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
  ...params
})

export const phase2Api = {
  getCardList: async (params: Record<string, unknown> = {}) =>
    normalizePunchCardList(await wisdomPost(PHASE2_ENDPOINTS.cardList, withScenic(params))),
  postCardCheck: (params: Record<string, unknown> = {}) =>
    wisdomPost(PHASE2_ENDPOINTS.cardCheck, withScenic(params)),
  postCardCompose: (params: Record<string, unknown> = {}) =>
    wisdomPost<{ compose_url?: string; url?: string }>(PHASE2_ENDPOINTS.cardCompose, withScenic(params)),
  getShirtInfo: async (params: Record<string, unknown> = {}) =>
    normalizeShirtInfo(await wisdomPost(PHASE2_ENDPOINTS.shirtInfo, params)),
  postShirtEnroll: (params: Record<string, unknown> = {}) =>
    wisdomPost(PHASE2_ENDPOINTS.shirtEnroll, params),
  postShirtSign: (params: Record<string, unknown> = {}) =>
    wisdomPost(PHASE2_ENDPOINTS.shirtSign, params),
  postShirtUnlock: (params: Record<string, unknown> = {}) =>
    wisdomPost(PHASE2_ENDPOINTS.shirtUnlock, params),
  getStudentCardInfo: async (params: Record<string, unknown> = {}) =>
    normalizeStudentCardInfo(await wisdomPost(PHASE2_ENDPOINTS.studentCardInfo, withScenic(params))),
  updateStudentCard: (params: Record<string, unknown> = {}) =>
    wisdomPost(PHASE2_ENDPOINTS.studentCardUpdate, withScenic(params)),
  updateOpenIdInfo: (params: Record<string, unknown> = {}) =>
    wisdomPost(PHASE2_ENDPOINTS.openIdUpdate, withScenic(params))
}