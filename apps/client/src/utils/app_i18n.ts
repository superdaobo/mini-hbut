/**
 * 轻量应用内多语言模块（issue #773）。
 *
 * ⚠️ 本期范围控制（刻意收敛，避免巨量 diff 与回归风险）：
 * 仅覆盖「设置中心外观页（SettingsView）+ 底部/全局公共导航（App.vue TabBar）」
 * 的固定文案；其余页面文案保持中文，后续逐步开放（设置页语言项下方有小字说明）。
 *
 * 设计要点：
 * - 不引入 vue-i18n 等第三方库，自建轻量字典 + t() 查找函数；
 * - 存储：localStorage 键 hbu_app_locale（与项目 hbu_ 前缀惯例一致），
 *   读取时校验合法性，无效/缺失/损坏 → 回落默认 zh-CN（不污染其他设置键）；
 * - 切换：setLocale 写存储 + 派发 window 自定义事件 hbu-locale-changed
 *   （detail 携带新 locale），消费方通过 useLocale() 获得响应式 locale 与 t；
 * - t() 回落链：当前 locale 字典 → zh-CN 字典 → key 本身（保证永不空白）。
 */

/** 支持的语言标识：首批 简体中文（默认）+ English */
export type Locale = 'zh-CN' | 'en'

/** 默认语言：简体中文 */
export const DEFAULT_LOCALE: Locale = 'zh-CN'

/** 语言偏好存储键（hbu_ 前缀与项目其他设置键一致） */
export const APP_LOCALE_STORAGE_KEY = 'hbu_app_locale'

/** 语言切换自定义事件名：setLocale 派发，useLocale 监听 */
export const APP_LOCALE_CHANGED_EVENT = 'hbu-locale-changed'

const LOCALE_VALUES: readonly Locale[] = ['zh-CN', 'en']

/**
 * 校验并规范化存储值：合法值原样返回，空/非法/损坏 → 默认 zh-CN。
 */
export const resolveLocale = (raw: unknown): Locale => {
  const value = String(raw ?? '').trim()
  if ((LOCALE_VALUES as readonly string[]).includes(value)) {
    return value as Locale
  }
  return DEFAULT_LOCALE
}

/**
 * 界面文案字典：语义化 key，与设置页/导航实际文案一一对应。
 * 新增文案时 zh-CN 与 en 必须同时补齐（t() 对缺失 key 会回落 zh-CN 再回落 key）。
 */
export const messages: Record<Locale, Record<string, string>> = {
  'zh-CN': {
    // —— 通用 ——
    'app.name': '校园小助手',
    // —— 底部公共导航（App.vue TabBar）——
    'tab.home': '首页',
    'tab.schedule': '课表',
    'tab.notifications': '通知',
    'tab.me': '我的',
    // —— 设置中心 header / tab 栏 ——
    'settings.title': '设置中心',
    'settings.tab.appearance': '外观',
    'settings.tab.backend': '后端',
    'settings.tab.security': '安全',
    'settings.tab.debug': '调试',
    // —— 设置中心：语言 section ——
    'settings.language.label': '语言 / Language',
    'settings.language.option.zh-CN': '简体中文',
    'settings.language.option.en': 'English',
    'settings.language.toast': '语言：简体中文',
    'settings.language.hint': '更多界面语言支持将逐步开放',
    // —— 通用（跨域共享）——
    'common.offline.prefix': '当前显示为离线数据，更新于',
    'common.yes': '是',
    'common.no': '否',
    'common.unknown': '未知',
    'common.error.network': '网络错误',
    // —— 成绩查询（GradeView）——
    'grade.title': '成绩查询',
    'grade.back': '返回',
    'grade.refresh': '刷新成绩',
    'grade.tab.grades': '成绩查询',
    'grade.tab.distribution': '给分记录',
    'grade.search.placeholder': '搜索课程名称...',
    'grade.term.all': '全部学期',
    'grade.term.unknown': '未知学期',
    'grade.filter.expand': '展开筛选',
    'grade.filter.collapse': '收起筛选',
    'grade.filter.status': '成绩状态',
    'grade.filter.all': '全部',
    'grade.filter.pass': '合格',
    'grade.filter.fail': '不合格',
    'grade.filter.makeup': '补考',
    'grade.filter.normal': '正常',
    'grade.filter.view': '展示方式',
    'grade.filter.grouped': '分组',
    'grade.filter.sort': '排序',
    'grade.sort.origin': '成绩公布先后',
    'grade.sort.desc': '成绩高到低',
    'grade.sort.asc': '成绩低到高',
    'grade.reset': '重置',
    'grade.stats.count': '筛选结果',
    'grade.stats.credits': '总学分',
    'grade.stats.failed': '挂科数',
    'grade.courseUnit': '门',
    'grade.creditUnit': '分',
    'grade.loading': '正在获取成绩数据...',
    'grade.empty': '没有找到符合条件的成绩',
    'grade.clearFilters': '清除筛选',
    'grade.updatedAt': '最新更新时间',
    'grade.notUpdated': '暂未更新',
    'grade.estimated': '估算',
    // —— 成绩详情弹窗 ——
    'grade.detail.term': '学期',
    'grade.detail.credit': '学分',
    'grade.detail.earnedCredit': '获得学分',
    'grade.detail.gradePoint': '绩点',
    'grade.detail.gpa': '学分绩点',
    'grade.detail.nature': '课程性质',
    'grade.detail.entryTeacher': '录入教师',
    'grade.detail.courseTeacher': '课程教师',
    'grade.detail.failed': '是否挂科',
    'grade.detail.makeup': '是否补考',
    'grade.detail.deferred': '是否缓考',
    'grade.detail.exempt': '是否免修',
    'grade.detail.keyStatus': '关键状态',
    'grade.detail.formulaTitle': '绩点说明',
    'grade.detail.formula1': '绩点 = 分数 / 10 - 5',
    'grade.detail.formula2': '学分绩点 = 学分 × 绩点',
    // —— 成绩状态标签（statusTags key 渲染取词）——
    'grade.tag.failed': '挂科',
    'grade.tag.makeup': '补考',
    'grade.tag.deferred': '缓考',
    'grade.tag.exempt': '免修',
    'grade.tag.exempted_exam': '免考',
    'grade.tag.absent': '缺考',
    'grade.tag.pending': '待录入',
    // —— 定性成绩等级展示（数据驱动枚举）——
    'grade.level.excellent': '优秀',
    'grade.level.good': '良好',
    'grade.level.medium': '中等',
    'grade.level.unqualified': '不合格',
    'grade.level.notPassed': '未通过',
    'grade.level.fail': '不及格',
    'grade.level.pass': '及格',
    'grade.level.qualified': '合格',
    'grade.level.passed': '通过',
    'grade.level.absent': '缺考',
    'grade.level.deferred': '缓考',
    'grade.level.exempt': '免修',
    'grade.level.exemptedExam': '免考',
    'grade.level.pending': '待录入',
    'grade.level.retake': '重修',
    // —— 课程性质代码（与 domain COURSE_NATURE_LABEL_MAP 对应）——
    'grade.nature.11': '通识必修',
    'grade.nature.12': '通识选修',
    'grade.nature.16': '限定选修',
    'grade.nature.31': '学科基础',
    'grade.nature.32': '工程基础',
    'grade.nature.40': '专业核心',
    'grade.nature.41': '专业方向组',
    'grade.nature.42': '专业任选',
    'grade.nature.43': '专业基础',
    'grade.nature.44': '专业必修',
    'grade.nature.45': '专业选修',
    'grade.nature.50': '基础实践',
    'grade.nature.51': '专业实践',
    'grade.nature.52': '综合实践',
    'grade.nature.53': '其他实践',
    'grade.nature.54': '短学期实践',
    'grade.nature.70': '辅修理论',
    'grade.nature.71': '辅修实践',
    'grade.nature.90': '必修',
    'grade.nature.98': '重修',
    'grade.nature.99': '公共选修',
    // —— 给分记录（GradeDistributionView）——
    'grade.dist.errorPrefix': '查询失败：',
    'grade.dist.back': '返回列表',
    'grade.dist.stat.max': '最高分',
    'grade.dist.stat.min': '最低分',
    'grade.dist.stat.avg': '平均分',
    'grade.dist.stat.median': '中位数',
    'grade.dist.stat.samples': '样本数',
    'grade.dist.segTitle': '分数段分布',
    'grade.dist.segSuffix': '人',
    'grade.dist.search.placeholder': '搜索教师姓名...',
    'grade.dist.retry': '重试',
    'grade.dist.loading': '查询中，请稍候…（数据较多时可能较慢）',
    'grade.dist.empty.searchHint': '请输入教师姓名搜索给分记录',
    'grade.dist.empty.none': '暂无给分记录数据',
    'grade.dist.samplesPrefix': '样本',
    'grade.dist.failRate': '挂科率',
    'grade.dist.prev': '上一页',
    'grade.dist.next': '下一页',
    // —— 学业完成情况（AcademicProgressView / AcademicTreeNode）——
    'academic.title': '学业完成情况',
    'academic.progressType': '完成度类型',
    'academic.fasz.nature': '课程性质完成度',
    'academic.fasz.curriculum': '培养方案完成度',
    'academic.fasz.teaching': '教学计划完成度',
    'academic.fasz.graduation': '毕业学分完成度',
    'academic.summary.gpa': 'GPA',
    'academic.summary.avgScore': '平均成绩',
    'academic.summary.earnedCredits': '累计获得学分',
    'academic.summary.selectedCourses': '已选课门数',
    'academic.summary.failedCourses': '不及格门数',
    'academic.summary.gpaRank': 'GPA专业排名',
    'academic.summary.degreeRank': '学位绩点排名',
    // —— 学业课程详情字段（数据驱动枚举）——
    'academic.course.kcmc': '课程名称',
    'academic.course.kcbh': '课程编号',
    'academic.course.xf': '学分',
    'academic.course.hdxf': '获得学分',
    'academic.course.xfjd': '绩点',
    'academic.course.zhcj': '最高成绩',
    'academic.course.xnxq': '成绩学年学期',
    'academic.course.cjxq': '允许修读学年学期',
    'academic.course.kcxz': '课程性质',
    'academic.course.kclb': '课程类别',
    'academic.course.kkyxmc': '开课学院',
    'academic.course.skjs': '授课教师',
    'academic.course.jxbmc': '教学班名称',
    'academic.course.jxbzc': '教学班组成',
    'academic.course.wczt': '完成状态',
    'academic.course.sfbk': '是否补考',
    'academic.course.sfsq': '是否缓考',
    'academic.course.sfmx': '是否免修',
    'academic.course.bz': '备注',
    'academic.req.minCredits': '最低学分',
    'academic.req.maxCredits': '最高学分',
    'academic.req.minCourses': '最低门数',
    'academic.req.maxCourses': '最高门数',
    'academic.status.unknown': '状态未知',
    'academic.allCourses': '全部课程',
    'academic.category.prefix': '分类',
    'academic.unit.courses': '门',
    'academic.creditPrefix': '学分',
    'academic.earnedPrefix': '已获学分',
    'academic.empty': '暂无学业情况数据',
    'academic.error.fetch': '获取学业完成情况失败',
    'academic.courseDetail.default': '课程详情',
    'academic.belongCategory': '所属分类',
    // —— 学籍（StudentInfoView）——
    'studentinfo.title': '个人信息',
    'studentinfo.refresh': '刷新',
    'studentinfo.loading': '正在加载个人信息与访问记录...',
    'studentinfo.retry': '重试',
    'studentinfo.badge.undergrad': '本科生',
    'studentinfo.tab.basic': '基本信息',
    'studentinfo.tab.login': '当前登录',
    'studentinfo.tab.access': '登录信息',
    'studentinfo.section.details': '详细信息',
    // —— 学籍字段标签（数据驱动枚举）——
    'studentinfo.field.studentId': '学号',
    'studentinfo.field.name': '姓名',
    'studentinfo.field.gender': '性别',
    'studentinfo.field.grade': '年级',
    'studentinfo.field.college': '学院',
    'studentinfo.field.major': '专业',
    'studentinfo.field.class': '班级',
    'studentinfo.field.idNumber': '身份证号',
    'studentinfo.field.ethnicity': '民族',
    'studentinfo.field.birthDate': '出生日期',
    'studentinfo.field.phone': '手机号',
    'studentinfo.field.email': '邮箱',
    'studentinfo.person.name': '姓名',
    'studentinfo.person.staffId': '工号',
    'studentinfo.person.college': '学院',
    'studentinfo.person.phone': '电话',
    'studentinfo.person.email': '邮箱',
    'studentinfo.person.office': '办公室',
    'studentinfo.person.remark': '备注',
    'studentinfo.dorm.campus': '校区',
    'studentinfo.dorm.building': '楼栋',
    'studentinfo.dorm.room': '房间',
    'studentinfo.dorm.bed': '床位',
    'studentinfo.dorm.status': '状态',
    'studentinfo.dorm.remark': '备注',
    'studentinfo.orientation.title': '学工附属信息',
    'studentinfo.orientation.syncing': '同步中',
    'studentinfo.orientation.mentor': '班导师',
    'studentinfo.orientation.counselor': '辅导员',
    'studentinfo.orientation.dorm': '宿舍信息',
    'studentinfo.orientation.empty': '暂无班导师/辅导员/宿舍信息（可能不在迎新开放时段）',
    'studentinfo.orientation.webHint': '客户端内可同步班导师/辅导员/宿舍',
    'studentinfo.contact.phone': '手机号码',
    'studentinfo.contact.email': '电子邮箱',
    'studentinfo.contact.verified': '已认证',
    'studentinfo.contact.unverified': '未认证',
    'studentinfo.login.empty': '暂无当前登录记录',
    'studentinfo.login.devices': '当前登录设备',
    'studentinfo.login.clientIp': '客户端IP',
    'studentinfo.login.ipLocation': 'IP归属地',
    'studentinfo.login.time': '登录时间',
    'studentinfo.login.browser': '浏览器',
    'studentinfo.access.empty': '暂无应用访问记录',
    'studentinfo.access.loading': '正在加载访问记录...',
    'studentinfo.access.total': '共 {{n}} 条',
    'studentinfo.access.prev': '上一页',
    'studentinfo.access.next': '下一页',
    'studentinfo.error.basic': '获取基本信息失败',
    'studentinfo.error.access': '获取登录访问信息失败',
    'studentinfo.error.all': '个人信息与登录记录均获取失败',
    'studentinfo.error.orientation': '迎新附属信息暂不可用',
    'studentinfo.error.cacheHintPrefix': '登录记录暂不可用，当前显示缓存数据（更新于',
    'studentinfo.error.cacheHintSuffix': '）',
    'studentinfo.auth.success': '成功',
    'studentinfo.auth.fail': '失败',
    'studentinfo.auth.unknown': '未知',
    // —— 培养方案（TrainingPlanView）——
    'trainingplan.title': '培养方案',
    'trainingplan.year.label': '开设学年',
    'trainingplan.term.label': '开设学期',
    'trainingplan.option.please': '请选择',
    'trainingplan.search': '搜索',
    'trainingplan.reset': '重置',
    'trainingplan.advanced.expand': '展开高级',
    'trainingplan.advanced.collapse': '收起高级',
    'trainingplan.dept.label': '开课院系',
    'trainingplan.jys.label': '开课教研室',
    'trainingplan.nature.label': '课程性质',
    'trainingplan.attribution.label': '课程归属',
    'trainingplan.code.label': '课程编号',
    'trainingplan.code.placeholder': '输入编号',
    'trainingplan.name.label': '课程名称',
    'trainingplan.name.placeholder': '输入名称',
    'trainingplan.creditPrefix': '学分',
    'trainingplan.empty': '暂无数据',
    'trainingplan.prev': '上一页',
    'trainingplan.next': '下一页',
    'trainingplan.pagePrefix': '第',
    'trainingplan.pageSuffix': '页',
    'trainingplan.error.fetch': '获取培养方案失败',
    'trainingplan.detail.default': '课程详情',
    'trainingplan.detail.code': '课程编号',
    'trainingplan.detail.nature': '课程性质',
    'trainingplan.detail.sfbx': '选/必修',
    'trainingplan.detail.attribution': '课程归属',
    'trainingplan.detail.year': '开设学年',
    'trainingplan.detail.term': '开设学期',
    'trainingplan.detail.credit': '学分',
    'trainingplan.detail.dept': '开课院系',
    'trainingplan.detail.jys': '开课教研室',
    'trainingplan.detail.examForm': '考试形式',
    'trainingplan.sfbx.compulsory': '必修',
    'trainingplan.sfbx.elective': '选修'
  },
  en: {
    // —— Common ——
    'app.name': 'Campus Assistant',
    // —— Bottom tab bar (App.vue) ——
    'tab.home': 'Home',
    'tab.schedule': 'Schedule',
    'tab.notifications': 'Alerts',
    'tab.me': 'Me',
    // —— Settings header / tab bar ——
    'settings.title': 'Settings',
    'settings.tab.appearance': 'Appearance',
    'settings.tab.backend': 'Backend',
    'settings.tab.security': 'Security',
    'settings.tab.debug': 'Debug',
    // —— Settings: language section ——
    'settings.language.label': 'Language / 语言',
    'settings.language.option.zh-CN': '简体中文',
    'settings.language.option.en': 'English',
    'settings.language.toast': 'Language: English',
    'settings.language.hint': 'More interface languages coming soon',
    // —— Common (shared across domains) ——
    'common.offline.prefix': 'Currently showing offline data, updated',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.unknown': 'Unknown',
    'common.error.network': 'Network error',
    // —— Grades (GradeView) ——
    'grade.title': 'Grades',
    'grade.back': 'Back',
    'grade.refresh': 'Refresh grades',
    'grade.tab.grades': 'Grades',
    'grade.tab.distribution': 'Grade Records',
    'grade.search.placeholder': 'Search course name...',
    'grade.term.all': 'All terms',
    'grade.term.unknown': 'Unknown term',
    'grade.filter.expand': 'Expand filters',
    'grade.filter.collapse': 'Collapse filters',
    'grade.filter.status': 'Grade status',
    'grade.filter.all': 'All',
    'grade.filter.pass': 'Passed',
    'grade.filter.fail': 'Failed',
    'grade.filter.makeup': 'Retake',
    'grade.filter.normal': 'Normal',
    'grade.filter.view': 'View mode',
    'grade.filter.grouped': 'Grouped',
    'grade.filter.sort': 'Sort',
    'grade.sort.origin': 'Release order',
    'grade.sort.desc': 'Highest first',
    'grade.sort.asc': 'Lowest first',
    'grade.reset': 'Reset',
    'grade.stats.count': 'Results',
    'grade.stats.credits': 'Total credits',
    'grade.stats.failed': 'Failed courses',
    'grade.courseUnit': 'courses',
    'grade.creditUnit': 'cr',
    'grade.loading': 'Loading grade data...',
    'grade.empty': 'No grades match the filters',
    'grade.clearFilters': 'Clear filters',
    'grade.updatedAt': 'Last updated',
    'grade.notUpdated': 'Not updated yet',
    'grade.estimated': 'Est.',
    // —— Grade detail modal ——
    'grade.detail.term': 'Term',
    'grade.detail.credit': 'Credits',
    'grade.detail.earnedCredit': 'Earned credits',
    'grade.detail.gradePoint': 'Grade point',
    'grade.detail.gpa': 'GPA',
    'grade.detail.nature': 'Course nature',
    'grade.detail.entryTeacher': 'Entered by',
    'grade.detail.courseTeacher': 'Course teacher',
    'grade.detail.failed': 'Failed',
    'grade.detail.makeup': 'Retake',
    'grade.detail.deferred': 'Deferred exam',
    'grade.detail.exempt': 'Exempted',
    'grade.detail.keyStatus': 'Key status',
    'grade.detail.formulaTitle': 'GPA formula',
    'grade.detail.formula1': 'Grade point = Score / 10 - 5',
    'grade.detail.formula2': 'GPA = Credits × Grade point',
    // —— Grade status tags (rendered by key) ——
    'grade.tag.failed': 'Failed',
    'grade.tag.makeup': 'Retake',
    'grade.tag.deferred': 'Deferred',
    'grade.tag.exempt': 'Exempt',
    'grade.tag.exempted_exam': 'Exam exempt',
    'grade.tag.absent': 'Absent',
    'grade.tag.pending': 'Pending',
    // —— Qualitative grade levels (data-driven enum) ——
    'grade.level.excellent': 'Excellent',
    'grade.level.good': 'Good',
    'grade.level.medium': 'Medium',
    'grade.level.unqualified': 'Unqualified',
    'grade.level.notPassed': 'Not passed',
    'grade.level.fail': 'Fail',
    'grade.level.pass': 'Pass',
    'grade.level.qualified': 'Qualified',
    'grade.level.passed': 'Passed',
    'grade.level.absent': 'Absent',
    'grade.level.deferred': 'Deferred',
    'grade.level.exempt': 'Exempt',
    'grade.level.exemptedExam': 'Exam exempt',
    'grade.level.pending': 'Pending',
    'grade.level.retake': 'Retake',
    // —— Course nature codes (aligned with domain COURSE_NATURE_LABEL_MAP) ——
    'grade.nature.11': 'General Compulsory',
    'grade.nature.12': 'General Elective',
    'grade.nature.16': 'Restricted Elective',
    'grade.nature.31': 'Discipline Foundation',
    'grade.nature.32': 'Engineering Foundation',
    'grade.nature.40': 'Major Core',
    'grade.nature.41': 'Major Track Elective',
    'grade.nature.42': 'Major Free Elective',
    'grade.nature.43': 'Major Foundation',
    'grade.nature.44': 'Major Compulsory',
    'grade.nature.45': 'Major Elective',
    'grade.nature.50': 'Foundation Practice',
    'grade.nature.51': 'Professional Practice',
    'grade.nature.52': 'Comprehensive Practice',
    'grade.nature.53': 'Other Practice',
    'grade.nature.54': 'Short-term Practice',
    'grade.nature.70': 'Minor Theory',
    'grade.nature.71': 'Minor Practice',
    'grade.nature.90': 'Compulsory',
    'grade.nature.98': 'Retake',
    'grade.nature.99': 'Public Elective',
    // —— Grade records (GradeDistributionView) ——
    'grade.dist.errorPrefix': 'Query failed: ',
    'grade.dist.back': 'Back to list',
    'grade.dist.stat.max': 'Max',
    'grade.dist.stat.min': 'Min',
    'grade.dist.stat.avg': 'Average',
    'grade.dist.stat.median': 'Median',
    'grade.dist.stat.samples': 'Samples',
    'grade.dist.segTitle': 'Score Distribution',
    'grade.dist.segSuffix': ' students',
    'grade.dist.search.placeholder': 'Search teacher name...',
    'grade.dist.retry': 'Retry',
    'grade.dist.loading': 'Querying, please wait... (may be slow for large data)',
    'grade.dist.empty.searchHint': 'Enter a teacher name to search grade records',
    'grade.dist.empty.none': 'No grade records yet',
    'grade.dist.samplesPrefix': 'Samples',
    'grade.dist.failRate': 'Fail rate',
    'grade.dist.prev': '‹ Prev',
    'grade.dist.next': 'Next ›',
    // —— Academic progress (AcademicProgressView / AcademicTreeNode) ——
    'academic.title': 'Academic Progress',
    'academic.progressType': 'Progress type',
    'academic.fasz.nature': 'Course nature progress',
    'academic.fasz.curriculum': 'Training curriculum progress',
    'academic.fasz.teaching': 'Teaching plan progress',
    'academic.fasz.graduation': 'Graduation credits progress',
    'academic.summary.gpa': 'GPA',
    'academic.summary.avgScore': 'Average score',
    'academic.summary.earnedCredits': 'Credits earned',
    'academic.summary.selectedCourses': 'Courses selected',
    'academic.summary.failedCourses': 'Failed courses',
    'academic.summary.gpaRank': 'GPA major rank',
    'academic.summary.degreeRank': 'Degree GPA rank',
    // —— Academic course detail fields (data-driven enum) ——
    'academic.course.kcmc': 'Course name',
    'academic.course.kcbh': 'Course code',
    'academic.course.xf': 'Credits',
    'academic.course.hdxf': 'Credits earned',
    'academic.course.xfjd': 'Grade point',
    'academic.course.zhcj': 'Best score',
    'academic.course.xnxq': 'Score term',
    'academic.course.cjxq': 'Allowed term',
    'academic.course.kcxz': 'Course nature',
    'academic.course.kclb': 'Course category',
    'academic.course.kkyxmc': 'Offering school',
    'academic.course.skjs': 'Instructor',
    'academic.course.jxbmc': 'Class section',
    'academic.course.jxbzc': 'Class composition',
    'academic.course.wczt': 'Completion',
    'academic.course.sfbk': 'Retake',
    'academic.course.sfsq': 'Deferred exam',
    'academic.course.sfmx': 'Exempted',
    'academic.course.bz': 'Remarks',
    'academic.req.minCredits': 'Min credits',
    'academic.req.maxCredits': 'Max credits',
    'academic.req.minCourses': 'Min courses',
    'academic.req.maxCourses': 'Max courses',
    'academic.status.unknown': 'Status unknown',
    'academic.allCourses': 'All courses',
    'academic.category.prefix': 'Category',
    'academic.unit.courses': ' courses',
    'academic.creditPrefix': 'Credits',
    'academic.earnedPrefix': 'Credits earned',
    'academic.empty': 'No academic data yet',
    'academic.error.fetch': 'Failed to load academic progress',
    'academic.courseDetail.default': 'Course detail',
    'academic.belongCategory': 'Category',
    // —— Student records (StudentInfoView) ——
    'studentinfo.title': 'Student Records',
    'studentinfo.refresh': 'Refresh',
    'studentinfo.loading': 'Loading student records and access logs...',
    'studentinfo.retry': 'Retry',
    'studentinfo.badge.undergrad': 'Undergraduate',
    'studentinfo.tab.basic': 'Basic',
    'studentinfo.tab.login': 'Sessions',
    'studentinfo.tab.access': 'Access',
    'studentinfo.section.details': 'Details',
    // —— Student record field labels (data-driven enum) ——
    'studentinfo.field.studentId': 'Student ID',
    'studentinfo.field.name': 'Name',
    'studentinfo.field.gender': 'Gender',
    'studentinfo.field.grade': 'Cohort',
    'studentinfo.field.college': 'School',
    'studentinfo.field.major': 'Major',
    'studentinfo.field.class': 'Class',
    'studentinfo.field.idNumber': 'ID number',
    'studentinfo.field.ethnicity': 'Ethnicity',
    'studentinfo.field.birthDate': 'Date of birth',
    'studentinfo.field.phone': 'Mobile',
    'studentinfo.field.email': 'Email',
    'studentinfo.person.name': 'Name',
    'studentinfo.person.staffId': 'Staff ID',
    'studentinfo.person.college': 'School',
    'studentinfo.person.phone': 'Phone',
    'studentinfo.person.email': 'Email',
    'studentinfo.person.office': 'Office',
    'studentinfo.person.remark': 'Remarks',
    'studentinfo.dorm.campus': 'Campus',
    'studentinfo.dorm.building': 'Building',
    'studentinfo.dorm.room': 'Room',
    'studentinfo.dorm.bed': 'Bed',
    'studentinfo.dorm.status': 'Status',
    'studentinfo.dorm.remark': 'Remarks',
    'studentinfo.orientation.title': 'Student Affairs Info',
    'studentinfo.orientation.syncing': 'Syncing',
    'studentinfo.orientation.mentor': 'Class Mentor',
    'studentinfo.orientation.counselor': 'Counselor',
    'studentinfo.orientation.dorm': 'Housing',
    'studentinfo.orientation.empty': 'No class mentor/counselor/housing info yet (may be outside the orientation window)',
    'studentinfo.orientation.webHint': 'Mentor/counselor/housing sync is available in the desktop client',
    'studentinfo.contact.phone': 'Mobile number',
    'studentinfo.contact.email': 'Email',
    'studentinfo.contact.verified': 'Verified',
    'studentinfo.contact.unverified': 'Unverified',
    'studentinfo.login.empty': 'No active sessions yet',
    'studentinfo.login.devices': 'Active devices',
    'studentinfo.login.clientIp': 'Client IP',
    'studentinfo.login.ipLocation': 'IP location',
    'studentinfo.login.time': 'Login time',
    'studentinfo.login.browser': 'Browser',
    'studentinfo.access.empty': 'No app access records yet',
    'studentinfo.access.loading': 'Loading access records...',
    'studentinfo.access.total': '{{n}} records',
    'studentinfo.access.prev': 'Prev',
    'studentinfo.access.next': 'Next',
    'studentinfo.error.basic': 'Failed to load basic info',
    'studentinfo.error.access': 'Failed to load login access info',
    'studentinfo.error.all': 'Failed to load both student info and login records',
    'studentinfo.error.orientation': 'Orientation info temporarily unavailable',
    'studentinfo.error.cacheHintPrefix': 'Login records unavailable, showing cached data (updated',
    'studentinfo.error.cacheHintSuffix': ')',
    'studentinfo.auth.success': 'Success',
    'studentinfo.auth.fail': 'Fail',
    'studentinfo.auth.unknown': 'Unknown',
    // —— Training curriculum (TrainingPlanView) ——
    'trainingplan.title': 'Training Curriculum',
    'trainingplan.year.label': 'Academic year',
    'trainingplan.term.label': 'Semester',
    'trainingplan.option.please': 'Select',
    'trainingplan.search': 'Search',
    'trainingplan.reset': 'Reset',
    'trainingplan.advanced.expand': 'Advanced',
    'trainingplan.advanced.collapse': 'Collapse',
    'trainingplan.dept.label': 'School',
    'trainingplan.jys.label': 'Teaching section',
    'trainingplan.nature.label': 'Course nature',
    'trainingplan.attribution.label': 'Attribution',
    'trainingplan.code.label': 'Course code',
    'trainingplan.code.placeholder': 'Enter code',
    'trainingplan.name.label': 'Course name',
    'trainingplan.name.placeholder': 'Enter name',
    'trainingplan.creditPrefix': 'Credits',
    'trainingplan.empty': 'No data',
    'trainingplan.prev': 'Prev',
    'trainingplan.next': 'Next',
    'trainingplan.pagePrefix': 'Page',
    'trainingplan.pageSuffix': '',
    'trainingplan.error.fetch': 'Failed to load training curriculum',
    'trainingplan.detail.default': 'Course detail',
    'trainingplan.detail.code': 'Course code',
    'trainingplan.detail.nature': 'Course nature',
    'trainingplan.detail.sfbx': 'Type',
    'trainingplan.detail.attribution': 'Attribution',
    'trainingplan.detail.year': 'Academic year',
    'trainingplan.detail.term': 'Semester',
    'trainingplan.detail.credit': 'Credits',
    'trainingplan.detail.dept': 'School',
    'trainingplan.detail.jys': 'Teaching section',
    'trainingplan.detail.examForm': 'Exam form',
    'trainingplan.sfbx.compulsory': 'Compulsory',
    'trainingplan.sfbx.elective': 'Elective'
  }
}

/** 模块级当前语言（resolveLocale 保证始终合法） */
let currentLocale: Locale = DEFAULT_LOCALE

/** 读取当前语言（模块加载时已从存储初始化） */
export const getLocale = (): Locale => currentLocale

/**
 * 切换语言：写 localStorage + 更新模块状态 + 派发 hbu-locale-changed 事件。
 * 存储不可用时仅同步内存状态（与 night_mode 等模块的兜底策略一致）。
 */
export const setLocale = (locale: Locale): void => {
  const next = resolveLocale(locale)
  currentLocale = next
  try {
    localStorage.setItem(APP_LOCALE_STORAGE_KEY, next)
  } catch {
    // localStorage 不可用时仅同步内存状态
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(APP_LOCALE_CHANGED_EVENT, { detail: { locale: next } })
    )
  }
}

/**
 * 翻译查找：当前 locale 字典 → zh-CN 字典 → key 本身（永不空白）。
 */
export const t = (key: string): string => {
  const dict = messages[currentLocale]
  if (dict && Object.prototype.hasOwnProperty.call(dict, key)) {
    return dict[key]
  }
  const fallback = messages[DEFAULT_LOCALE]
  if (fallback && Object.prototype.hasOwnProperty.call(fallback, key)) {
    return fallback[key]
  }
  return key
}

import { ref } from 'vue'

/**
 * Vue 组合函数：返回响应式 locale 与 t。
 * - locale 为 ref，监听 hbu-locale-changed 事件跟随变化（设置页切换即时生效）；
 * - 可选监听 storage 事件，实现跨标签页同步（Tauri 单窗口场景为兜底）。
 * 注意：t() 内部读模块级 currentLocale，事件先行同步再更新 ref，
 * 因此模板重渲染时 t() 已按新语言取词。
 */
export const useLocale = () => {
  const locale = ref<Locale>(currentLocale)

  const syncLocale = (event: Event) => {
    const detail = (event as CustomEvent<{ locale?: Locale }>).detail
    const next = resolveLocale(detail?.locale ?? currentLocale)
    currentLocale = next
    locale.value = next
  }

  // 跨标签页同步（可选兜底）：storage 事件在其他标签写入时触发
  const onStorage = (event: StorageEvent) => {
    if (event.key === APP_LOCALE_STORAGE_KEY) {
      currentLocale = resolveLocale(event.newValue)
      locale.value = currentLocale
    }
  }

  if (typeof window !== 'undefined') {
    window.addEventListener(APP_LOCALE_CHANGED_EVENT, syncLocale)
    window.addEventListener('storage', onStorage)
  }

  return { locale, t }
}

// 模块加载时从存储初始化（缺失/非法/损坏一律回落 zh-CN）
try {
  currentLocale = resolveLocale(localStorage.getItem(APP_LOCALE_STORAGE_KEY))
} catch {
  // localStorage 不可用时保持默认 zh-CN
}
