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

  it('空教室按会话角色分派到 getZyKjs，并应用真实时间维度筛选（#1062）', () => {
    const source = read(SCHEDULE_RS)
    expect(source).toContain('fn classroom_query_path_for_role')
    expect(source).toContain('teacher_readonly::PATH_FREE_CLASSROOMS')
    expect(source).toContain('fetch_teacher_classrooms_query')
    expect(source).toContain('user.role.is_teacher()')
    // #1062：学校确实支持时间维度筛选（recon 09 §2 实测），教师分支发送
    // zcStr/xqStr/jcStr/type=1，并在校验通过后才标记 filters_applied。
    expect(source).toContain('"zcStr"')
    expect(source).toContain('"xqStr"')
    expect(source).toContain('"jcStr"')
    expect(source).toContain('"filter_mode": "teacher_period_query"')
    expect(source).toContain('let filters_applied = true;')
    // 旧「保守查询」语义必须消失（它正是把筛选失效固化成契约的来源）
    expect(source).not.toContain('"filter_mode": "teacher_all"')
  })

  it('教师空教室必须走已登记的纯查询 POST，且禁止硬编码「可用」', () => {
    const source = read(SCHEDULE_RS)
    const readonly = read('src-tauri/src/http_client/academic/teacher/readonly.rs')
    // 学校页面自身以 POST 调用 getZyKjs（recon 09 §1）→ 必须登记为纯查询 POST
    expect(readonly).toContain('is_teacher_query_post_allowed')
    expect(source).toContain('is_teacher_query_post_allowed(path)')
    // #1063：不得用 `jyzt`/`sfqy` 推断逐时段占用（实测 `jyzt` 在资源目录里恒为 "1"，
    // 属「能否借用」类资源属性，不是占用证据），也不得硬编码「可用/已占用」。
    // 注：字段名可以出现在 `queryFields` 请求清单与注释里，但不得被读取。
    expect(source).not.toContain('get("jyzt")')
    expect(source).not.toContain('get("sfqy")')
    expect(source).not.toContain('"已占用"')
    expect(source).not.toContain('"status": "可用"')
    // 可用性只由 meta.availability 表达
    expect(source).toContain('"availability": availability.as_str()')
    expect(source).toContain('classify_availability(')
  })

  it('教师空教室不得回退到学生楼栋路径或静态兜底列表（#1063）', () => {
    const source = read(SCHEDULE_RS)
    // 教师楼栋候选来自同一资源域（getZyKjs 返回教室去重）
    expect(source).toContain('derive_building_candidates(&page.results)')
    // 角色分派：学生走 queryForXsd 解析 + 内置兜底；教师不得复用
    expect(source).toContain('fn fetch_student_classroom_buildings')
    expect(source).toContain('fn fetch_teacher_classroom_buildings')
    expect(source).toContain('self.fetch_teacher_classroom_buildings().await')
    expect(source).toContain('self.fetch_student_classroom_buildings().await')
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
