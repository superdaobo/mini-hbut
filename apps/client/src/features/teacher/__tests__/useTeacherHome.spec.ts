/**
 * Teacher Portal V2（E1 #1021）：教师首页语义契约测试。
 *
 * 覆盖：
 *  - 「所有功能」只呈现教务系统 / 资源两个一级分类（空分类不显示，不新增第三类）；
 *  - 未验证教师权限的模块（校园卡 / 学习通 / 游戏等）不出现；
 *  - 教师默认快捷入口固定 5 格、全部可达且可解析出图标/文案；
 *  - 「今日授课」文案不出现「去上课」式学生行动文案；
 *  - 学生身份不产出任何教师分类 / 快捷入口（学生端零污染）。
 *
 * 纯前端契约测试，不发网络请求、不触达教务。
 */
import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import {
  STUDENT_TODAY_I18N,
  TEACHER_QUICK_ENTRY_META,
  TEACHER_QUICK_ENTRY_SLOTS,
  TEACHER_TODAY_I18N,
  buildTeacherDefaultShortcutIds,
  buildTeacherHomeCategories,
  buildTeacherHomeModules,
  useTeacherHome
} from '../composables/useTeacherHome'
import {
  TEACHER_DEFAULT_SHORTCUT_IDS,
  TEACHER_FEATURE_CATEGORIES,
  TEACHER_FEATURE_CATALOG
} from '../../../config/teacher_feature_catalog'
import { QUICK_ENTRY_META } from '../../../config/dashboard_modules'
import { TEACHER_ALLOWED_VIEW_IDS, TEACHER_VISIBLE_MODULE_IDS } from '../../../config/role_capabilities.js'
import { messages } from '../../../utils/app_i18n'
import { readVueContractSource } from '../../../utils/contract_source_test'

/** 学生专属 / 未验证教师权限的模块，教师首页绝不能出现。 */
const FORBIDDEN_TEACHER_VIEW_IDS = [
  'grades',
  'exams',
  'ranking',
  'academic',
  'course_selection',
  'training',
  'teaching_eval',
  'campus_code',
  'electricity',
  'transactions',
  'chaoxing_hub',
  'chaoxing_inbox',
  'chaoxing_class',
  'broadband',
  'sports_venue',
  'game_center',
  'export_center'
]

describe('useTeacherHome · 教师首页两分类（#1021）', () => {
  it('教师「所有功能」只有教务系统 / 资源两个一级分类', () => {
    const categories = buildTeacherHomeCategories('teacher')

    expect(categories.map((category) => category.title)).toEqual(
      TEACHER_FEATURE_CATEGORIES.map((category) => category.labelKey)
    )
    expect(categories).toHaveLength(2)
    // 目录本身只声明这两个分类（不新增第三类）
    expect(TEACHER_FEATURE_CATEGORIES.map((category) => category.id)).toEqual(['academic', 'resource'])
  })

  it('空分类不显示：返回的每个分类都至少有一个入口', () => {
    for (const role of ['teacher', 'student', '']) {
      for (const category of buildTeacherHomeCategories(role)) {
        expect(category.modules.length).toBeGreaterThan(0)
      }
    }
  })

  it('教师分类只包含路由级放行的入口，未验证权限模块不出现', () => {
    const modules = buildTeacherHomeModules('teacher')
    expect(modules.length).toBeGreaterThan(0)

    for (const module of modules) {
      expect(TEACHER_ALLOWED_VIEW_IDS.has(module.id)).toBe(true)
      expect(FORBIDDEN_TEACHER_VIEW_IDS).not.toContain(module.id)
      // 名称必须走 teacher. 前缀 i18n key，且目标视图默认可用
      expect(module.name.startsWith('teacher.home.item.')).toBe(true)
      expect(module.available).toBe(true)
      expect(module.requiresLogin).toBe(true)
    }
    // 教师专属视图在目录内
    expect(modules.map((module) => module.id)).toEqual(
      expect.arrayContaining(['teacherteaching', 'teacherexams', 'teachernotifications'])
    )
  })

  it('教师入口不越出目录声明范围（不凭空新增入口）', () => {
    const catalogViewIds = TEACHER_FEATURE_CATALOG.map((entry) => entry.viewId).sort()
    const moduleIds = buildTeacherHomeModules('teacher').map((module) => module.id).sort()

    expect(moduleIds).toEqual(catalogViewIds)
  })

  it('学生身份不产出教师分类 / 教师模块（学生端零污染）', () => {
    expect(buildTeacherHomeCategories('student')).toEqual([])
    expect(buildTeacherHomeModules('student')).toEqual([])
    expect(buildTeacherHomeCategories('')).toEqual([])
    expect(buildTeacherHomeCategories(undefined)).toEqual([])
  })
})

describe('useTeacherHome · 教师默认快捷入口（#1021）', () => {
  it('固定 5 格：先目录默认顺序，再按目录声明顺序补足，全部可达且不重复', () => {
    const ids = buildTeacherDefaultShortcutIds('teacher')

    expect(ids).toHaveLength(TEACHER_QUICK_ENTRY_SLOTS)
    expect(new Set(ids).size).toBe(ids.length)

    const defaultViewIds = TEACHER_DEFAULT_SHORTCUT_IDS.map(
      (entryId) => TEACHER_FEATURE_CATALOG.find((entry) => entry.id === entryId)?.viewId
    )
    expect(ids.slice(0, defaultViewIds.length)).toEqual(defaultViewIds)
    for (const id of ids) expect(TEACHER_ALLOWED_VIEW_IDS.has(id)).toBe(true)
    // 补足项必须是目录内声明的入口
    for (const id of ids) {
      expect(TEACHER_FEATURE_CATALOG.some((entry) => entry.viewId === id)).toBe(true)
    }
  })

  it('每个默认快捷入口都能解析出图标与文案（不会渲染出空壳入口）', () => {
    for (const id of buildTeacherDefaultShortcutIds('teacher')) {
      const meta = TEACHER_QUICK_ENTRY_META[id] || QUICK_ENTRY_META[id]
      expect(meta, `缺少快捷入口元数据: ${id}`).toBeTruthy()
      expect(String(meta?.name || '').startsWith('teacher.') || String(meta?.name || '').startsWith('home.')).toBe(true)
    }
  })

  it('学生身份不产出教师快捷入口', () => {
    expect(buildTeacherDefaultShortcutIds('student')).toEqual([])
    expect(buildTeacherDefaultShortcutIds('')).toEqual([])
  })

  it('教师专属快捷入口元数据只在教师身份下叠加', () => {
    const teacher = useTeacherHome({ role: ref('teacher') })
    const student = useTeacherHome({ role: ref('student') })

    expect(Object.keys(teacher.quickEntryMeta.value)).toEqual(
      expect.arrayContaining(['teacherteaching', 'teacherexams', 'teachernotifications'])
    )
    expect(student.quickEntryMeta.value).toEqual({})
    // 学生侧元数据表本身不含教师视图（抽取零变化）
    expect(Object.keys(QUICK_ENTRY_META)).not.toContain('teacherteaching')
    expect(Object.keys(TEACHER_QUICK_ENTRY_META).every((id) => !(id in QUICK_ENTRY_META))).toBe(true)
  })

  it('教师宫格图标覆盖教师专属入口，学生侧不叠加', () => {
    const teacher = useTeacherHome({ role: ref('teacher') })
    const student = useTeacherHome({ role: ref('student') })

    for (const id of ['teacherteaching', 'teacherexams', 'teachernotifications']) {
      expect(teacher.featureIcons.value[id]).toBeTruthy()
      expect(teacher.featureIconColors.value[id]).toBeTruthy()
      expect(student.featureIcons.value[id]).toBeUndefined()
      expect(student.featureIconColors.value[id]).toBeUndefined()
    }
  })

  it('身份响应式切换时教师分类与快捷入口同步跟随', () => {
    const role = ref('student')
    const home = useTeacherHome({ role })

    expect(home.isTeacher.value).toBe(false)
    expect(home.featureCategories.value).toEqual([])

    role.value = 'teacher'
    expect(home.isTeacher.value).toBe(true)
    expect(home.featureCategories.value).toHaveLength(2)
    expect(home.defaultShortcutIds.value).toHaveLength(TEACHER_QUICK_ENTRY_SLOTS)

    role.value = 'student'
    expect(home.featureCategories.value).toEqual([])
    expect(home.defaultShortcutIds.value).toEqual([])
  })
})

describe('useTeacherHome · 今日授课语义（#1021）', () => {
  it('教师今日安排是「今日授课」，不出现「去上课」式学生行动文案', () => {
    expect(TEACHER_TODAY_I18N.panelTitle).toBe('teacher.home.today.panelTitle')
    expect(TEACHER_TODAY_I18N.goToClass).toBe('teacher.home.today.viewSchedule')
    expect(TEACHER_TODAY_I18N.viewSchedule).toBe('teacher.home.today.viewSchedule')
    // 教师侧任何今日文案都不得落到学生行动文案 key
    for (const key of Object.values(TEACHER_TODAY_I18N)) {
      expect(key.startsWith('teacher.home.today.')).toBe(true)
      expect(key).not.toBe('home.today.goToClass')
    }
    // 学生侧文案 key 保持原样（零回归）
    expect(STUDENT_TODAY_I18N.panelTitle).toBe('home.today.panelTitle')
    expect(STUDENT_TODAY_I18N.goToClass).toBe('home.today.goToClass')
  })

  it('教师今日文案 key 在字典中全部存在（防拼写漂移）', () => {
    const zh = messages['zh-CN']
    for (const key of Object.values(TEACHER_TODAY_I18N)) {
      expect(zh[key], `字典缺少 key: ${key}`).toBeTruthy()
    }
    for (const meta of Object.values(TEACHER_QUICK_ENTRY_META)) {
      expect(zh[meta.name], `字典缺少 key: ${meta.name}`).toBeTruthy()
    }
    for (const entry of TEACHER_FEATURE_CATALOG) {
      expect(zh[entry.nameKey], `字典缺少 key: ${entry.nameKey}`).toBeTruthy()
    }
    for (const category of TEACHER_FEATURE_CATEGORIES) {
      expect(zh[category.labelKey], `字典缺少 key: ${category.labelKey}`).toBeTruthy()
    }
  })

  it('教师今日文案与学生今日文案不共用 key（角色切换不串文案）', () => {
    const teacherKeys = new Set(Object.values(TEACHER_TODAY_I18N))
    const studentKeys = new Set(Object.values(STUDENT_TODAY_I18N))
    for (const key of studentKeys) {
      expect(teacherKeys.has(key)).toBe(false)
    }
    expect(useTeacherHome({ role: ref('teacher') }).todayI18n.value).toEqual(TEACHER_TODAY_I18N)
    expect(useTeacherHome({ role: ref('student') }).todayI18n.value).toEqual(STUDENT_TODAY_I18N)
  })
})

describe('useTeacherHome · 教师首页模块不越过教师模块白名单语义', () => {
  it('身份无关模块白名单是教师首页可用能力的子集来源', () => {
    // 目录内 qxzkb / calendar / library / campus_map / resource_share 同时属于
    // E0 的「身份无关能力」白名单；教师专属视图不在白名单内（由路由级门禁放行）
    const ids = buildTeacherHomeModules('teacher').map((module) => module.id)
    for (const id of ['qxzkb', 'calendar', 'library', 'campus_map', 'resource_share']) {
      expect(ids).toContain(id)
      expect(TEACHER_VISIBLE_MODULE_IDS.has(id)).toBe(true)
    }
    for (const id of ['teacherteaching', 'teacherexams', 'teachernotifications']) {
      expect(TEACHER_VISIBLE_MODULE_IDS.has(id)).toBe(false)
    }
  })
})

describe('Dashboard 接线契约（#1021）', () => {
  const dashboard = () => readVueContractSource('src/components/Dashboard.vue')

  it('消费抽出的配置模块，且不再内联学生模块表 / 分类表 / 快捷入口元数据', () => {
    const source = dashboard()

    expect(source).toContain('buildModuleCategories')
    expect(source).toContain('BASE_MODULES')
    expect(source).toContain('QUICK_ENTRY_META')
    expect(source).toContain('useTeacherHome')
    expect(source).toContain('TeacherTodayCard')
    // 抽取后的 Dashboard 不再自带这些表（god-file 净减行数的结构性保证）
    expect(source).not.toContain("{ id: 'towergo', name: 'home.module.towergo'")
    expect(source).not.toContain('title: \'home.cat.chaoxing\'')
    expect(source).not.toContain("qxzkb: { name: 'home.module.qxzkb'")
  })

  it('教师身份走教师目录，学生身份仍走学生模块表', () => {
    const source = dashboard()

    expect(source).toContain('if (isTeacherRole(currentRole.value)) return teacherHome.homeModules.value')
    expect(source).toContain('? teacherHome.featureCategories.value')
    expect(source).toContain(': buildModuleCategories(modules.value)')
    // 学生分类过滤语义（空分类不渲染）保持不变
    expect(source).toContain('return cats.filter((c) => Array.isArray(c.modules) && c.modules.length > 0)')
  })

  it('教师默认快捷入口来自教师目录，且偏好按身份分开存储', () => {
    const source = dashboard()

    expect(source).toContain('teacherHome.defaultShortcutIds.value')
    expect(source).toContain('`${QUICK_ENTRY_KEY}_teacher`')
    // 教师专属快捷入口元数据按身份叠加
    expect(source).toContain('{ ...QUICK_ENTRY_META, ...teacherHome.quickEntryMeta.value }')
  })

  it('今日安排按角色取文案，且教师不出现「去上课」行动文案', () => {
    const source = dashboard()

    expect(source).toContain('const todayI18n = computed(() => teacherHome.todayI18n.value)')
    expect(source).toContain('t(todayI18n.panelTitle)')
    expect(source).toContain("(course.isEvent || isTeacherHome) ? t(todayI18n.viewSchedule) : t(todayI18n.goToClass)")
    // 学生端原有硬编码 key 已全部改由 todayI18n 提供（教师侧映射到 teacher.* key）
    expect(source).not.toContain("t('home.today.panelTitle')")
    expect(source).not.toContain("t('home.today.empty')")
    expect(source).not.toContain("t('home.today.loadFailed')")
  })

  it('教师「今日授课」条目展示教学班 / 人数 / 教室，学生端保留原教室行', () => {
    const source = dashboard()

    expect(source).toContain('<TeacherTodayCard v-if="isTeacherHome" :course="course" variant="active" />')
    expect(source).toContain('<TeacherTodayCard v-if="isTeacherHome" :course="course" variant="muted" />')
    expect(source).toContain('v-else-if="course.room"')
    expect(source).toContain('className: String(current.class_name || \'\').trim()')
    expect(source).toContain('classSize: String(current.class_size || \'\').trim()')
  })

  it('切换账号 / 身份时清空今日授课，避免残留上一教师数据', () => {
    const source = dashboard()

    expect(source).toContain('isTeacherRole(currentRole.value) ? `${currentRole.value}:${String(props.studentId || \'\').trim()}` : \'\'')
    expect(source).toContain('todayCourses.value = []')
    expect(source).toContain('homeSearchCourses.value = []')
  })
})
