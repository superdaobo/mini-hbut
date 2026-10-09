import { describe, expect, it } from 'vitest'
import {
  MAIN_TAB_VIEW_IDS,
  TEACHER_ALLOWED_VIEW_IDS,
  TEACHER_SHARED_VIEW_IDS,
  TEACHER_VIEW_IDS,
  TEACHER_VISIBLE_MODULE_IDS,
  filterModulesForRole,
  isModuleVisibleForRole,
  isTeacherRole,
  isViewAllowedForRole
} from './role_capabilities.js'

/** 首页真实模块清单（与 Dashboard.vue 的 baseModules id 对齐）。 */
const ALL_MODULE_IDS = [
  'grades',
  'classroom',
  'electricity',
  'transactions',
  'exams',
  'ranking',
  'campus_code',
  'calendar',
  'school_inbox',
  'academic',
  'qxzkb',
  'course_selection',
  'training',
  'teaching_eval',
  'chaoxing_hub',
  'chaoxing_inbox',
  'chaoxing_class',
  'broadband',
  'sports_venue',
  'library',
  'campus_map',
  'resource_share',
  'towergo',
  'ai'
]

describe('role_capabilities（身份能力表）', () => {
  it('学生身份对所有模块可见（学生端行为完全不变）', () => {
    for (const id of ALL_MODULE_IDS) {
      expect(isModuleVisibleForRole(id, 'student')).toBe(true)
    }
    // 未知/空角色按学生处理
    expect(isModuleVisibleForRole('grades', '')).toBe(true)
    expect(isModuleVisibleForRole('grades', undefined)).toBe(true)
    expect(isModuleVisibleForRole('grades', null)).toBe(true)
  })

  it('教师身份隐藏全部学生专属功能（成绩 / 考试 / 学习通等）', () => {
    const studentOnly = [
      'grades',
      'exams',
      'ranking',
      'academic',
      'course_selection',
      'training',
      'teaching_eval',
      'classroom',
      'chaoxing_hub',
      'chaoxing_inbox',
      'chaoxing_class',
      'electricity',
      'transactions',
      'campus_code',
      'broadband',
      'sports_venue'
    ]
    for (const id of studentOnly) {
      expect(isModuleVisibleForRole(id, 'teacher')).toBe(false)
    }
  })

  it('教师身份保留身份无关能力（校历 / 学校消息 / 图书馆等）', () => {
    for (const id of TEACHER_VISIBLE_MODULE_IDS) {
      expect(isModuleVisibleForRole(id, 'teacher')).toBe(true)
    }
    expect(isModuleVisibleForRole('calendar', 'teacher')).toBe(true)
    expect(isModuleVisibleForRole('school_inbox', 'teacher')).toBe(true)
  })

  it('白名单是默认拒绝：未登记的新模块对教师不可见', () => {
    expect(isModuleVisibleForRole('some_brand_new_module', 'teacher')).toBe(false)
    expect(isModuleVisibleForRole('', 'teacher')).toBe(false)
    expect(isModuleVisibleForRole(undefined, 'teacher')).toBe(false)
  })

  it('filterModulesForRole：学生原样返回，教师按白名单过滤', () => {
    const modules = ALL_MODULE_IDS.map((id) => ({ id, name: id }))

    const forStudent = filterModulesForRole(modules, 'student')
    expect(forStudent).toHaveLength(ALL_MODULE_IDS.length)

    const forTeacher = filterModulesForRole(modules, 'teacher')
    expect(forTeacher.map((m) => m.id).sort()).toEqual([...TEACHER_VISIBLE_MODULE_IDS].sort())
    expect(forTeacher.every((m) => TEACHER_VISIBLE_MODULE_IDS.has(m.id))).toBe(true)
    // 不得含任何学生专属模块
    expect(forTeacher.some((m) => m.id === 'grades')).toBe(false)
    expect(forTeacher.some((m) => m.id === 'exams')).toBe(false)
    expect(forTeacher.some((m) => m.id.startsWith('chaoxing'))).toBe(false)
  })

  it('filterModulesForRole 对非法入参安全降级', () => {
    expect(filterModulesForRole(null, 'teacher')).toEqual([])
    expect(filterModulesForRole(undefined, 'student')).toEqual([])
  })

  it('isTeacherRole 只认 teacher（大小写/空白容忍）', () => {
    expect(isTeacherRole('teacher')).toBe(true)
    expect(isTeacherRole('  TEACHER ')).toBe(true)
    expect(isTeacherRole('student')).toBe(false)
    expect(isTeacherRole('js')).toBe(false)
    expect(isTeacherRole(undefined)).toBe(false)
  })
})

describe('role_capabilities · 路由级角色门禁（#1019）', () => {
  it('非教师身份一律放行（学生端零回归）', () => {
    for (const id of [...ALL_MODULE_IDS, 'teacherteaching', 'teacherprofile']) {
      expect(isViewAllowedForRole(id, 'student')).toBe(true)
    }
    expect(isViewAllowedForRole('grades', '')).toBe(true)
    expect(isViewAllowedForRole('grades', undefined)).toBe(true)
    expect(isViewAllowedForRole('grades', null)).toBe(true)
  })

  it('教师身份放行 4 个主 Tab', () => {
    for (const tab of MAIN_TAB_VIEW_IDS) {
      expect(isViewAllowedForRole(tab, 'teacher')).toBe(true)
    }
    expect(isViewAllowedForRole('home', 'teacher')).toBe(true)
    expect(isViewAllowedForRole('schedule', 'teacher')).toBe(true)
    expect(isViewAllowedForRole('notifications', 'teacher')).toBe(true)
    expect(isViewAllowedForRole('me', 'teacher')).toBe(true)
  })

  it('教师身份放行全部预注册教师视图', () => {
    for (const viewId of TEACHER_VIEW_IDS) {
      expect(isViewAllowedForRole(viewId, 'teacher')).toBe(true)
    }
    for (const viewId of [
      'teacherprofile',
      'teacherteaching',
      'teacherexams',
      'teachernotifications',
      'teacherworkflow'
    ]) {
      expect(TEACHER_VIEW_IDS.has(viewId)).toBe(true)
      expect(isViewAllowedForRole(viewId, 'teacher')).toBe(true)
    }
  })

  it('教师身份拦截学生专属路由（含深链直达）', () => {
    for (const id of [
      'grades',
      'exams',
      'ranking',
      'academic',
      'course_selection',
      'training',
      'teaching_eval',
      'studentinfo',
      'chaoxing_hub',
      'chaoxing_inbox',
      'chaoxing_class',
      'electricity',
      'transactions',
      'campus_code',
      'broadband',
      'sports_venue',
      'export_center',
      'game_center'
    ]) {
      expect(isViewAllowedForRole(id, 'teacher')).toBe(false)
    }
  })

  it('教师身份保留 8 项白名单模块 + E4 共享适配视图', () => {
    for (const id of TEACHER_VISIBLE_MODULE_IDS) {
      expect(isViewAllowedForRole(id, 'teacher')).toBe(true)
    }
    for (const id of TEACHER_SHARED_VIEW_IDS) {
      expect(isViewAllowedForRole(id, 'teacher')).toBe(true)
    }
    // 空教室（classroom）由 E4 适配后对教师开放，但**不在**首页模块白名单里（宫格仍隐藏）
    expect(isViewAllowedForRole('classroom', 'teacher')).toBe(true)
    expect(TEACHER_VISIBLE_MODULE_IDS.has('classroom')).toBe(false)
  })

  it('教师身份保留身份无关的通用应用界面（设置/反馈/隐私等，零回归）', () => {
    for (const id of [
      'settings',
      'official',
      'feedback',
      'privacy_data',
      'identity_auth_history',
      'school_website',
      'quick_links',
      'campus_network'
    ]) {
      expect(TEACHER_SHARED_VIEW_IDS.has(id)).toBe(true)
      expect(isViewAllowedForRole(id, 'teacher')).toBe(true)
    }
  })

  it('默认拒绝：未登记的新视图 / 空值对教师一律不可访问', () => {
    expect(isViewAllowedForRole('brand_new_teacher_view', 'teacher')).toBe(false)
    expect(isViewAllowedForRole('', 'teacher')).toBe(false)
    expect(isViewAllowedForRole(undefined, 'teacher')).toBe(false)
    expect(isViewAllowedForRole(null, 'teacher')).toBe(false)
  })

  it('TEACHER_ALLOWED_VIEW_IDS 是白名单超集（主Tab ∪ 模块 ∪ 教师视图 ∪ 共享视图）', () => {
    for (const set of [
      MAIN_TAB_VIEW_IDS,
      TEACHER_VISIBLE_MODULE_IDS,
      TEACHER_VIEW_IDS,
      TEACHER_SHARED_VIEW_IDS
    ]) {
      for (const id of set) {
        expect(TEACHER_ALLOWED_VIEW_IDS.has(id)).toBe(true)
      }
    }
  })
})
