import { campusGuideApi } from '../api/wisdom_client'
import { CAMPUS_GUIDE_CONFIG } from '../config'

export const reportCampusSearchKeyword = async (keyword: string) => {
  const text = keyword.trim()
  if (!text) return
  try {
    await campusGuideApi.reportSearch({
      scenic_id: CAMPUS_GUIDE_CONFIG.scenicId,
      name: text
    })
  } catch {
    // 上报失败不影响搜索体验
  }
}