import { phase2Api } from '../api/phase2-client'
import type { ShirtInfo } from '../types/phase2'
import { getCampusGuideOpenId } from './device-id'
import { readYunyouUser } from './phase2-storage'

export const loadShirtInfo = async (): Promise<ShirtInfo> =>
  phase2Api.getShirtInfo({ open_id: getCampusGuideOpenId() })

export const enrollYunyouShirt = async () => {
  const user = readYunyouUser()
  await phase2Api.postShirtEnroll({
    open_id: getCampusGuideOpenId(),
    nick_name: user?.nickName || '云游用户'
  })
  return loadShirtInfo()
}

export const signYunyouShirt = async (payload: Record<string, unknown>) => {
  await phase2Api.postShirtSign({
    open_id: getCampusGuideOpenId(),
    ...payload
  })
  return loadShirtInfo()
}

export const unlockYunyouShirt = async (payload: Record<string, unknown> = {}) => {
  await phase2Api.postShirtUnlock({
    open_id: getCampusGuideOpenId(),
    ...payload
  })
  return loadShirtInfo()
}