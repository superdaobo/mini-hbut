// 测试 fixture：forum_api 模块类型声明（与 forum_api.js 导出对齐）
export interface ForumProfile {
  nickname: string
  avatar_url: string
  bio: string
  admin_secret: string
  [key: string]: unknown
}

// createThread 响应同时兼容「列表式」({ items }) 与「单帖式」({ id, title }) 两种形态
export interface ForumThreadResponse {
  items: Array<{ id?: number; title?: string; [key: string]: unknown }>
  id?: number
  title?: string
  [key: string]: unknown
}

/**
 * 论坛 API 客户端类型：与 utils/forum_api.js 中 createForumApiClient 返回对象逐一对齐。
 * 所有 request() 返回响应体 Record；items/thread 等字段由调用方用 Array.isArray/类型守卫收窄。
 */
export interface ForumApiClient {
  getToken(): string
  listCategories(params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  createCategory(payload: Record<string, unknown>): Promise<Record<string, unknown>>
  listThreads(params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listHotThreads(limit?: number, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  searchThreads(params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  getThread(threadId: string | number, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  // 兼容「列表式」({ items }) 与「单帖式」({ id, title }) 两种响应形态（forum_api.spec.ts 契约断言 items）
  createThread(payload: Record<string, unknown>): Promise<ForumThreadResponse>
  createReply(threadId: string | number, payload: Record<string, unknown>): Promise<Record<string, unknown>>
  reactToPost(postId: string | number, reaction: unknown): Promise<Record<string, unknown>>
  bookmarkThread(threadId: string | number, active?: boolean): Promise<Record<string, unknown>>
  listPolls(params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  createPoll(payload: Record<string, unknown>): Promise<Record<string, unknown>>
  votePoll(pollId: string | number, optionId: string | number): Promise<Record<string, unknown>>
  closePoll(pollId: string | number): Promise<Record<string, unknown>>
  getMeSummary(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listMyThreads(params?: Record<string, unknown> | number, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listMyReplies(params?: Record<string, unknown> | number, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listMyBookmarks(params?: Record<string, unknown> | number, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  getUserProfile(studentId: string, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  followUser(targetStudentId: string, active?: boolean): Promise<Record<string, unknown>>
  reportContent(payload: Record<string, unknown>): Promise<Record<string, unknown>>
  listNotifications(params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listMessages(params?: Record<string, unknown>, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  sendMessage(payload: Record<string, unknown>): Promise<Record<string, unknown>>
  checkIn(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listBadges(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listBackups(params?: Record<string, unknown> | number, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listAdminReports(params?: Record<string, unknown> | number, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listAdminUsers(params?: Record<string, unknown> | string, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listAdminBackups(params?: Record<string, unknown> | number, options?: Record<string, unknown>): Promise<Record<string, unknown>>
  runBackup(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  setUserBan(payload: Record<string, unknown>): Promise<Record<string, unknown>>
  grantBadge(payload: Record<string, unknown>): Promise<Record<string, unknown>>
  getAttachmentUrl(attachmentIdOrUrl: string): string
  uploadAttachment(file: File): Promise<Record<string, unknown>>
  scoreThread?: unknown
}

export function normalizeForumEndpoint(value: unknown): string
export function buildForumApiBase(forumConfig?: Record<string, unknown>): string
export function readForumProfile(studentId: string): ForumProfile
export function writeForumProfile(studentId: string, profile?: Partial<ForumProfile>): ForumProfile

/**
 * 管理员口令加密持久化（设备本地密钥 AES-CBC）；空值清除密文。
 * 设备密钥与密文同存于 localStorage：仅降低静态备份/扫描泄露风险，不是 XSS 安全边界。
 */
export function saveForumAdminSecret(studentId: string, secret: string): Promise<void>

/** 读取加密存储的管理员口令；无密文或解密失败返回空串（无明文回退）。 */
export function loadForumAdminSecret(studentId: string): Promise<string>

export function createForumApiClient(options: Record<string, unknown>): ForumApiClient
