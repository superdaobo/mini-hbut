/** 学习通签到 — 前端类型定义（镜像 Rust DTO） */

export type ActivityType = 'normal' | 'location' | 'photo' | 'qrcode' | 'gesture'
export type ActivityStatus = 'active' | 'pending' | 'signed' | 'expired'
export type SubmitResult = 'success' | 'already_signed' | 'failure'
export type CheckinErrorCode =
  | 'network_error'
  | 'session_expired'
  | 'bad_request'
  | 'server_error'
  | 'already_signed'
  | 'rate_limited'
  | 'permission_denied'
  | 'unknown'

export interface CheckinActivity {
  active_id: string
  course_id: string
  clazz_id: string
  course_name: string
  teacher_name: string
  activity_type: ActivityType
  status: ActivityStatus
  start_time: number
  end_time: number
  snapshot_timestamp: number
}

export interface CheckinSubmitResponse {
  result: SubmitResult
  message: string
  error_code?: CheckinErrorCode
}

export interface CheckinLogEntry {
  student_id: string
  active_id: string
  activity_type: ActivityType
  course_name: string
  result: SubmitResult
  error_code?: CheckinErrorCode
  error_message?: string
  submitted_at: number
}

export interface QrUrlParts {
  active_id: string
  enc: string
}

export interface ScreenRect {
  x: number
  y: number
  w: number
  h: number
}

export interface PhotoUploadResult {
  object_id: string
  thumb_url: string
}

export interface QrDecodeResponse {
  url: string
}
