import { ref, computed } from 'vue'
import { invokeNative } from '../platform/native'
import type {
  CheckinActivity,
  CheckinSubmitResponse,
  CheckinLogEntry,
  PhotoUploadResult,
  QrUrlParts,
  QrDecodeResponse,
  ScreenRect
} from '../types/chaoxing_checkin'

/**
 * 学习通签到核心 composable。
 * 所有后端交互通过 invokeNative 调用 Tauri 命令，前端不直接请求超星域名。
 */
export function useChaoxingCheckin() {
  const activities = ref<CheckinActivity[]>([])
  const history = ref<CheckinLogEntry[]>([])
  const loading = ref(false)
  const sessionConnected = ref(false)
  const inflightIds = ref<Set<string>>(new Set())

  const activeActivities = computed(() =>
    activities.value.filter((a) => a.status === 'active')
  )
  const pendingOrExpired = computed(() =>
    activities.value.filter((a) => a.status !== 'active')
  )

  /** 拉取签到活动列表 */
  async function refresh(force = false) {
    loading.value = true
    try {
      const result = await invokeNative<CheckinActivity[]>('chaoxing_checkin_list', {
        forceRefresh: force
      })
      activities.value = result
      sessionConnected.value = true
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('session_expired') || msg.includes('请先登录')) {
        sessionConnected.value = false
      }
      throw err
    } finally {
      loading.value = false
    }
  }

  /** 普通签到 */
  async function submitCommon(activeId: string): Promise<CheckinSubmitResponse> {
    inflightIds.value.add(activeId)
    try {
      return await invokeNative<CheckinSubmitResponse>('chaoxing_checkin_submit_common', {
        active_id: activeId
      })
    } finally {
      inflightIds.value.delete(activeId)
    }
  }

  /** 位置签到 */
  async function submitLocation(
    activeId: string,
    lat: number,
    lng: number,
    addr: string
  ): Promise<CheckinSubmitResponse> {
    inflightIds.value.add(activeId)
    try {
      return await invokeNative<CheckinSubmitResponse>('chaoxing_checkin_submit_location', {
        active_id: activeId,
        latitude: lat,
        longitude: lng,
        address: addr
      })
    } finally {
      inflightIds.value.delete(activeId)
    }
  }

  /** 上传照片（返回 object_id 用于后续提交） */
  async function uploadPhoto(
    bytes: Uint8Array,
    mime: string,
    name: string
  ): Promise<PhotoUploadResult> {
    return await invokeNative<PhotoUploadResult>('chaoxing_checkin_upload_photo', {
      image_bytes: Array.from(bytes),
      mime_type: mime,
      file_name: name
    })
  }

  /** 拍照签到 */
  async function submitPhoto(
    activeId: string,
    objectId: string
  ): Promise<CheckinSubmitResponse> {
    inflightIds.value.add(activeId)
    try {
      return await invokeNative<CheckinSubmitResponse>('chaoxing_checkin_submit_photo', {
        active_id: activeId,
        object_id: objectId
      })
    } finally {
      inflightIds.value.delete(activeId)
    }
  }

  /** 二维码签到 */
  async function submitQrcode(
    activeId: string,
    enc: string
  ): Promise<CheckinSubmitResponse> {
    inflightIds.value.add(activeId)
    try {
      return await invokeNative<CheckinSubmitResponse>('chaoxing_checkin_submit_qrcode', {
        active_id: activeId,
        enc
      })
    } finally {
      inflightIds.value.delete(activeId)
    }
  }

  /** 手势签到 */
  async function submitGesture(
    activeId: string,
    pattern: string
  ): Promise<CheckinSubmitResponse> {
    inflightIds.value.add(activeId)
    try {
      return await invokeNative<CheckinSubmitResponse>('chaoxing_checkin_submit_gesture', {
        active_id: activeId,
        pattern
      })
    } finally {
      inflightIds.value.delete(activeId)
    }
  }

  /** 获取签到历史 */
  async function fetchHistory(limit?: number) {
    const result = await invokeNative<CheckinLogEntry[]>('chaoxing_checkin_history', {
      student_id: null,
      limit: limit ?? 50
    })
    history.value = result
  }

  /** 解析二维码 URL，提取 active_id 和 enc */
  async function parseQrUrl(url: string): Promise<QrUrlParts> {
    return await invokeNative<QrUrlParts>('chaoxing_checkin_parse_qr_url', { url })
  }

  /** 解码二维码图片 */
  async function decodeQrImage(bytes: Uint8Array, mime: string): Promise<QrDecodeResponse> {
    return await invokeNative<QrDecodeResponse>('chaoxing_checkin_decode_qr_image', {
      image_bytes: Array.from(bytes),
      mime_type: mime
    })
  }

  /** 屏幕区域截图解码二维码（仅桌面端） */
  async function captureScreenQr(rect?: ScreenRect): Promise<QrDecodeResponse> {
    return await invokeNative<QrDecodeResponse>('chaoxing_checkin_capture_screen_qr', {
      rect: rect ?? null
    })
  }

  function isInflight(activeId: string): boolean {
    return inflightIds.value.has(activeId)
  }

  return {
    activities,
    history,
    loading,
    sessionConnected,
    activeActivities,
    pendingOrExpired,
    refresh,
    submitCommon,
    submitLocation,
    uploadPhoto,
    submitPhoto,
    submitQrcode,
    submitGesture,
    fetchHistory,
    parseQrUrl,
    decodeQrImage,
    captureScreenQr,
    isInflight
  }
}
