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

export interface ForumApiClient {
  createThread(options?: Record<string, unknown>): Promise<ForumThreadResponse>
  listThreads(options?: Record<string, unknown>, meta?: Record<string, unknown>): Promise<Record<string, unknown>>
  checkIn(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  searchThreads(options?: Record<string, unknown>, meta?: Record<string, unknown>): Promise<Record<string, unknown>>
  getMeSummary(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listMyThreads(options?: Record<string, unknown>, meta?: Record<string, unknown>): Promise<Record<string, unknown>>
  listMyReplies(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listMyBookmarks(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listNotifications(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listMessages(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  getUserProfile(studentId: string): Promise<Record<string, unknown>>
  listAdminReports(options?: number | Record<string, unknown>): Promise<Record<string, unknown>>
  listAdminUsers(query?: string | Record<string, unknown>): Promise<Record<string, unknown>>
  listAdminBackups(limit?: number | Record<string, unknown>): Promise<Record<string, unknown>>
  runBackup(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  setUserBan(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  grantBadge(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  listPolls(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  createPoll(options?: Record<string, unknown>): Promise<Record<string, unknown>>
  votePoll(pollId: number, optionId: number): Promise<Record<string, unknown>>
  closePoll(pollId: number): Promise<Record<string, unknown>>
  listBackups(options?: Record<string, unknown>, meta?: Record<string, unknown>): Promise<Record<string, unknown>>
  listCategories(options?: Record<string, unknown>, meta?: Record<string, unknown>): Promise<Record<string, unknown>>
  scoreThread?: unknown
  getAttachmentUrl(url: string): string
}

export function normalizeForumEndpoint(value: unknown): string
export function buildForumApiBase(forumConfig?: Record<string, unknown>): string
export function readForumProfile(studentId: string): ForumProfile
export function writeForumProfile(studentId: string, profile?: Partial<ForumProfile>): ForumProfile
export function createForumApiClient(options: Record<string, unknown>): ForumApiClient
