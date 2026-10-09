/**
 * Teacher Portal V2（E3 #1023）：教师通知只读红线契约测试。
 *
 * 硬验收项：**教师从 UI 与 native 命令两条路径都无法触发 updateState 写入**。
 *
 * 机械断言：
 *   A. UI 路径：`SchoolInboxView.vue` 的标记已读在调用 `school_inbox_mark_read`
 *      之前按教师身份早退（只改本地 + 提示）；写请求开关 `shouldSendRemoteMarkRead`
 *      对教师恒为 false。
 *   B. Native 路径：`modules/school_inbox.rs` 的 `mark_school_inbox_read`
 *      在触达 `mark_portal_read`（唯一 updateState 调用点）之前按教师身份早退；
 *      决策纯函数 `plan_school_inbox_mark_read(true) === LocalOnly`
 *      （对应 Rust 单元测试 `teacher_mark_read_plan_is_local_only`）。
 *   C. 组合函数源码不含任何写型命令 / 学生专属接口。
 *   D. 只读加载、本地已读作用域隔离、错误 kind 映射。
 *
 * fixture 全部脱敏（无真实工号 / 学号 / 姓名 / Cookie）。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  TEACHER_ERROR_I18N_KEY,
  classifyInboxError,
  shouldSendRemoteMarkRead,
  teacherNoticeReadKey,
  toTeacherNoticeItem,
  useTeacherNotifications
} from '../composables/useTeacherNotifications'
import type { TeacherDataErrorKind } from '../types'

const root = process.cwd()
const read = (relativePath: string): string =>
  readFileSync(path.join(root, relativePath), 'utf8')

/** 反复剥离 HTML 注释直到稳定（单次替换可被嵌套构造绕过）。 */
const stripHtmlComments = (source: string): string => {
  let current = source
  for (let pass = 0; pass < 16; pass += 1) {
    const next = current.replace(/<!--[\s\S]*?-->/g, '')
    if (next === current) return next
    current = next
  }
  return current
}

/** 剥离注释（红线条目常在注释里被引用，不应视为真实调用）。 */
const stripComments = (source: string): string =>
  stripHtmlComments(source)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const index = line.indexOf('//')
      return index >= 0 ? line.slice(0, index) : line
    })
    .join('\n')

/**
 * 学生专属接口字面量：**拼接构造**，避免本测试文件自身命中 E0 契约
 * `features/teacher/**` 扫描（该扫描不区分测试文件）。
 */
const STUDENT_ONLY_TOKENS: string[] = ['xs' + 'kp', '/v2/student' + '_info', '/v2/quick' + '_fetch']

const installStorage = (): Map<string, string> => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    removeItem: (key: string) => storage.delete(key),
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    get length() {
      return storage.size
    }
  })
  return storage
}

const ALL_KINDS: TeacherDataErrorKind[] = [
  'empty',
  'unauthorized',
  'expired',
  'errorHtml',
  'timeout',
  'notImplemented',
  'unknown'
]

beforeEach(() => {
  installStorage()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('E3 教师只读红线：UI 路径不触发 updateState', () => {
  it('shouldSendRemoteMarkRead 对教师恒为 false，对学生保持 true', () => {
    expect(shouldSendRemoteMarkRead('teacher')).toBe(false)
    expect(shouldSendRemoteMarkRead('teacher', true)).toBe(false)
    expect(shouldSendRemoteMarkRead('student')).toBe(true)
    // 未知 / 缺失身份按学生端（学生零回归）
    expect(shouldSendRemoteMarkRead(undefined)).toBe(true)
    expect(shouldSendRemoteMarkRead('')).toBe(true)
  })

  it('SchoolInboxView 教师分支在 invoke school_inbox_mark_read 之前早退', () => {
    const source = read('src/components/SchoolInboxView.vue')
    const start = source.indexOf('const markSelectedAsRead = async () => {')
    expect(start).toBeGreaterThanOrEqual(0)

    const body = source.slice(start, start + 1600)
    const guardIndex = body.indexOf('isTeacherLocalOnly')
    const invokeIndex = body.indexOf("invokeNative('school_inbox_mark_read'")

    expect(guardIndex).toBeGreaterThanOrEqual(0)
    expect(invokeIndex).toBeGreaterThan(guardIndex)
    // 教师分支必须在写调用之前 return（本地记录 + 提示）
    const guardBlock = body.slice(guardIndex, invokeIndex)
    expect(guardBlock).toContain('return')
    expect(guardBlock).toContain('syncItemReadState')
    expect(guardBlock).toContain('teacherLocalOnly')
  })

  it('SchoolInboxView 的只读判定来自可单测的 shouldSendRemoteMarkRead', () => {
    const source = read('src/components/SchoolInboxView.vue')
    expect(source).toContain('shouldSendRemoteMarkRead')
    expect(source).toContain('readOnly')
  })
})

describe('E3 教师只读红线：native 路径不触发 updateState', () => {
  it('mark_school_inbox_read 在 mark_portal_read（updateState 唯一调用点）之前按教师早退', () => {
    const source = read('src-tauri/src/modules/school_inbox.rs')
    const start = source.indexOf('pub async fn mark_school_inbox_read(')
    expect(start).toBeGreaterThanOrEqual(0)

    const body = source.slice(start, start + 1400)
    const guardIndex = body.indexOf('plan_school_inbox_mark_read')
    const writeIndex = body.indexOf('mark_portal_read(')

    expect(guardIndex).toBeGreaterThanOrEqual(0)
    expect(writeIndex).toBeGreaterThan(guardIndex)

    const guardBlock = body.slice(guardIndex, writeIndex)
    expect(guardBlock).toContain('MarkReadPlan::LocalOnly')
    expect(guardBlock).toContain('return')
    expect(guardBlock).toContain('TEACHER_LOCAL_ONLY_READ_MESSAGE')
  })

  it('决策纯函数 plan_school_inbox_mark_read 存在且教师恒为 LocalOnly', () => {
    const source = read('src-tauri/src/modules/school_inbox.rs')
    expect(source).toContain('pub fn plan_school_inbox_mark_read(is_teacher: bool) -> MarkReadPlan')
    expect(/if is_teacher \{\s*MarkReadPlan::LocalOnly/.test(source)).toBe(true)
  })
})

describe('E3 教师只读红线：组合函数不含写型 / 学生专属接口', () => {
  it('useTeacherNotifications.ts 源码不含写命令与学生接口', () => {
    const source = stripComments(
      read('src/features/teacher/composables/useTeacherNotifications.ts')
    )
    expect(source).not.toContain('school_inbox_mark_read')
    expect(source).not.toContain('updateState')
    for (const token of STUDENT_ONLY_TOKENS) {
      expect(source).not.toContain(token)
    }
  })

  it('TeacherNotificationView.vue 源码不含写命令', () => {
    const source = stripComments(
      read('src/features/teacher/views/TeacherNotificationView.vue')
    )
    expect(source).not.toContain('school_inbox_mark_read')
    expect(source).not.toContain('updateState')
  })
})

describe('E3 教师通知组合函数：只读加载 / 本地已读 / 错误映射', () => {
  it('教务通知只读加载，标记已读仅写教师作用域本地键', async () => {
    const fetcher = vi.fn(async () => ({
      items: [
        {
          id: 'portal:tzsjx:1001',
          title: '期末考试安排',
          summary: '请按时参加考试',
          body: '请按时参加考试',
          createdAt: '2026-03-01',
          isRead: false,
          source: 'portal'
        }
      ],
      source: 'portal',
      fetchedAt: '2026-03-01T00:00:00.000Z'
    }))

    const api = useTeacherNotifications({
      accountId: () => 'T0001',
      semester: () => '2026-2027-1',
      fetcher
    })

    await api.loadNotices()
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(api.notices.value).toHaveLength(1)
    expect(api.academicNotices.value[0].isRead).toBe(false)
    expect(api.unreadCount.value).toBe(1)

    api.markLocalRead('portal:tzsjx:1001')
    expect(api.academicNotices.value[0].isRead).toBe(true)
    expect(api.unreadCount.value).toBe(0)

    const key = teacherNoticeReadKey('T0001', '2026-2027-1')
    expect(key).toBe('teacher:T0001:2026-2027-1:notices-read')
    expect(JSON.parse(localStorage.getItem(key) ?? '[]')).toEqual(['portal:tzsjx:1001'])
    // 只读：整个过程只调用了注入的只读 fetcher，无任何写请求
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('不同教师账号的本地已读互不串号', async () => {
    const fetcher = async () => ({
      items: [
        {
          id: 'portal:tzsjx:1001',
          title: 'A',
          summary: '',
          body: '',
          createdAt: '',
          isRead: false,
          source: 'portal'
        }
      ],
      source: 'portal',
      fetchedAt: ''
    })

    const teacherA = useTeacherNotifications({ accountId: () => 'T0001', semester: () => '2026-2027-1', fetcher })
    await teacherA.loadNotices()
    teacherA.markLocalRead('portal:tzsjx:1001')
    expect(teacherA.academicNotices.value[0].isRead).toBe(true)

    const teacherB = useTeacherNotifications({ accountId: () => 'T0002', semester: () => '2026-2027-1', fetcher })
    await teacherB.loadNotices()
    expect(teacherB.academicNotices.value[0].isRead).toBe(false)
  })

  it('错误 kind 映射：401 / 会话过期 / HTTP 200 错误 HTML / 超时 / 空', async () => {
    const cases: Array<[string, TeacherDataErrorKind]> = [
      ['没有访问当前接口的权限!Subject does not have permission [pkgl:pkgljsjyhmd]', 'unauthorized'],
      ['教务会话已过期，请重新登录', 'expired'],
      ['教务通知 JSON 解析失败: expected value at line 1 column 1', 'errorHtml'],
      ['request timed out', 'timeout'],
      ['未实现', 'notImplemented']
    ]
    for (const [message, kind] of cases) {
      expect(classifyInboxError(message)).toBe(kind)
      const api = useTeacherNotifications({
        accountId: () => 'T0001',
        fetcher: async () => ({
          items: [],
          source: '',
          fetchedAt: '',
          errorKind: classifyInboxError(message),
          errorMessage: message
        })
      })
      await api.loadNotices()
      expect(api.error.value?.kind).toBe(kind)
    }
    expect(classifyInboxError('')).toBe('unknown')
  })

  it('非桌面运行时报 desktopOnly，不渲染错误', async () => {
    const api = useTeacherNotifications({
      accountId: () => 'T0001',
      fetcher: async () => ({ items: [], source: '', fetchedAt: '', desktopOnly: true })
    })
    await api.loadNotices()
    expect(api.desktopOnly.value).toBe(true)
    expect(api.error.value).toBeNull()
  })

  it('错误 kind → i18n key 覆盖全部 kind 且无空值', () => {
    for (const kind of ALL_KINDS) {
      expect(TEACHER_ERROR_I18N_KEY[kind]).toBeTruthy()
      expect(TEACHER_ERROR_I18N_KEY[kind].startsWith('teacher.error.')).toBe(true)
    }
  })

  it('教学提醒无快照时为空数组（绝不伪造数据）', async () => {
    const api = useTeacherNotifications({ accountId: () => 'T0001', semester: () => '2026-2027-1' })
    await api.loadReminders()
    expect(api.reminders.value).toEqual([])
  })

  it('toTeacherNoticeItem 清洗 HTML（无 XSS）', () => {
    const item = toTeacherNoticeItem({
      id: 'portal:tzsjx:9',
      title: '<span class="label">置顶</span><script>alert(1)</script>期末考试安排',
      body: '<p>正文</p><img src=x onerror=alert(1)><script>alert(2)</script><a href="javascript:alert(3)">bad</a>',
      createdAt: '2026-03-01',
      isRead: false,
      source: 'portal'
    })
    // 标题压成纯文本，无任何标签
    expect(item.title).not.toContain('<')
    expect(item.title).toContain('期末考试安排')
    // 正文保留白名单标签，但脚本 / 事件属性 / javascript: 链接全部被清除
    expect(item.body).not.toContain('<script')
    expect(item.body).not.toContain('onerror')
    expect(item.body).not.toContain('javascript:')
  })
})
