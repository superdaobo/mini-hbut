/**
 * Teacher Portal V2（E4 / #1024）：教务共用查询（校历 / 全校课表 / 空教室）师生分流契约。
 *
 * 机械断言：
 *   1. 三处请求在 **Rust 侧按真实会话角色** 分派（`user.role.is_teacher()`），
 *      且教师分支引用 `readonly.rs` 已登记的教师路径常量；
 *   2. 教师分支不复制学生路径（选择器两分支返回不同路径）；
 *   3. `GlobalScheduleView` 教师身份**绕开**学生个人学籍接口 `/v2/student_info`；
 *   4. 校历 / 空教室视图本身不含 `/v2/student_info`。
 *
 * ⚠️ 这些是源码级门禁，配合 Rust 单测（路径选择器）与集成运行共同保证「教师走教师接口」。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8')

const CALENDAR_RS = 'src-tauri/src/http_client/academic/calendar.rs'
const QXZKB_RS = 'src-tauri/src/http_client/qxzkb.rs'
const SCHEDULE_RS = 'src-tauri/src/http_client/academic/schedule.rs'

describe('teacher academic query contract（Rust 角色分派）', () => {
  it('校历按会话角色分派到教师路径，且引用 readonly 常量', () => {
    const source = read(CALENDAR_RS)
    expect(source).toContain('fn calendar_data_path_for_role')
    expect(source).toContain('teacher_readonly::PATH_CALENDAR_DATA')
    expect(source).toContain('fetch_teacher_calendar_raw_for_semester')
    expect(source).toContain('user.role.is_teacher()')
    // 教师路径与学生路径必须不同（不复制）
    expect(source).toContain('STUDENT_CALENDAR_DATA_PATH')
  })

  it('全校课表按会话角色分派到 queryQxkbPage', () => {
    const source = read(QXZKB_RS)
    expect(source).toContain('fn qxzkb_list_path_for_role')
    expect(source).toContain('teacher_readonly::PATH_QXZKB_QUERY')
    expect(source).toContain('fetch_qxzkb_list_teacher')
    expect(source).toContain('user.role.is_teacher()')
    expect(source).toContain('STUDENT_QXZKB_LIST_PATH')
  })

  it('空教室按会话角色分派到 getZyKjs 且为保守查询', () => {
    const source = read(SCHEDULE_RS)
    expect(source).toContain('fn classroom_query_path_for_role')
    expect(source).toContain('teacher_readonly::PATH_FREE_CLASSROOMS')
    expect(source).toContain('fetch_teacher_classrooms_query')
    expect(source).toContain('user.role.is_teacher()')
    // 保守查询：明确标记未应用筛选，不伪造结果
    expect(source).toContain('"filters_applied": false')
    expect(source).toContain('"filter_mode": "teacher_all"')
  })

  it('教师路径常量都已在 readonly allowlist 登记且无写动词', () => {
    const readonly = read('src-tauri/src/http_client/academic/teacher/readonly.rs')
    for (const constant of [
      'PATH_CALENDAR_DATA',
      'PATH_QXZKB_QUERY',
      'PATH_FREE_CLASSROOMS'
    ]) {
      expect(readonly).toContain(`pub const ${constant}`)
    }
  })
})

describe('teacher academic query contract（前端不得用学生个人资料接口）', () => {
  const source = () => read('src/components/GlobalScheduleView.vue')

  it('GlobalScheduleView 的 fetchUserProfile 在教师身份下提前返回', () => {
    const vue = source()
    expect(vue).toContain("import { useAuthStore } from '../stores/auth'")
    expect(vue).toContain('const authStore = useAuthStore()')

    const block =
      vue.match(/const fetchUserProfile = async \(\) => \{[\s\S]*?\n\}/)?.[0] || ''
    expect(block).not.toBe('')
    // 教师守卫必须出现在 /v2/student_info 之前
    const guardIndex = block.indexOf('authStore.isTeacher')
    const studentInfoIndex = block.indexOf('/v2/student_info')
    expect(guardIndex).toBeGreaterThanOrEqual(0)
    expect(studentInfoIndex).toBeGreaterThan(guardIndex)
    expect(block).toContain('return')
  })

  it('校历 / 空教室视图不含学生个人学籍接口', () => {
    expect(read('src/components/CalendarView.vue')).not.toContain('/v2/student_info')
    expect(read('src/components/ClassroomView.vue')).not.toContain('/v2/student_info')
  })
})
