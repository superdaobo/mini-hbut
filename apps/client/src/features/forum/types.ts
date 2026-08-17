// 论坛领域类型定义
// 描述：ForumView 拆分后各领域（列表/详情/发布/评论/媒体/投票/通知/我的/管理）共享的类型。
import type { Ref } from 'vue'

/** 论坛版块分类 */
export interface ForumCategory {
  id?: number | string
  slug?: string
  name?: string
  description?: string
}

/** 论坛帖子（列表项与详情共用） */
export interface ForumThread {
  id?: number | string
  category_id?: number | string
  title?: string
  content_md?: string
  author_student_id?: string
  created_at?: string
  updated_at?: string
  reply_count?: number
  attachment_ids?: Array<number | string>
}

/** 帖子回复 */
export interface ForumReply {
  id?: number | string
  thread_id?: number | string
  thread_title?: string
  author_student_id?: string
  content_md?: string
  created_at?: string
  up_count?: number
  down_count?: number
  attachment_ids?: Array<number | string>
}

/** 帖子详情（含作者与回复列表） */
export interface ForumThreadDetail {
  thread?: ForumThread
  replies?: ForumReply[]
}

/** 社区个人资料（本地缓存与表单共用） */
export interface ForumProfile {
  nickname?: string
  avatar_url?: string
  bio?: string
  admin_secret?: string
  [key: string]: unknown
}

/** 通知条目 */
export interface ForumNotification {
  id?: number | string
  title?: string
  content?: string
  is_read?: number | boolean
  created_at?: string
}

/** 私信条目 */
export interface ForumMessage {
  id?: number | string
  sender_student_id?: string
  receiver_student_id?: string
  content?: string
  created_at?: string
}

/** 徽章 */
export interface ForumBadge {
  badge_key?: string
  display_name?: string
}

/** 投票选项 */
export interface ForumPollOption {
  id?: number | string
  label?: string
  score?: number
  votes?: number
}

/** 投票 */
export interface ForumPoll {
  id?: number | string
  title?: string
  description?: string
  status?: 'active' | 'closed'
  created_at?: string
  my_vote_option_id?: number | null
  options: ForumPollOption[]
}

/** 管理后台-举报 */
export interface AdminReport {
  id?: number | string
  target_type?: string
  target_id?: number | string
  reason?: string
  reporter_student_id?: string
  created_at?: string
}

/** 管理后台-用户 */
export interface AdminUser {
  student_id?: string
  nickname?: string
  is_banned?: number | boolean
}

/** 管理后台-备份 */
export interface AdminBackup {
  id?: number | string
  kind?: string
  created_at?: string
  hf_path?: string
  onedrive_path?: string
  onedrive_status?: string
  sqlite_path?: string
}

/** 被查看用户的主页数据 */
export interface ViewedUserProfile {
  profile?: Record<string, unknown>
  stats?: Record<string, unknown>
  badges?: ForumBadge[]
}

/** 上传队列条目（图床上传体验面板） */
export interface UploadQueueItem {
  key: string
  scope: string
  file: File | null
  name: string
  sizeLabel: string
  status: 'queued' | 'uploading' | 'success' | 'failed'
  progress: number
  attachmentId: string
  proxyUrl: string
  error: string
  updatedAt: number
}

/** 文件类对象的最小形状（兼容 File / 表单条目） */
export type FileLike = { name?: unknown; size?: unknown; lastModified?: unknown }

/** 可写引用工具类型 */
export type WritableRef<T> = Ref<T>
