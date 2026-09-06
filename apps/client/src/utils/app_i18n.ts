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
    // —— 首页域（issue #786：Dashboard / QuickLinks / DemoModeBanner）——
    // 问候语
    'home.greeting.dawn': '早上好',
    'home.greeting.morning': '上午好',
    'home.greeting.noon': '中午好',
    'home.greeting.afternoon': '下午好',
    'home.greeting.dusk': '傍晚好',
    'home.greeting.evening': '晚上好',
    'home.greeting.night': '夜深了',
    'home.greet.sub': '新的一天，元气满满！',
    // 用户资料卡
    'home.profile.notLoggedIn': '未登录',
    'home.profile.undergraduate': '本科生',
    // 校名等专名保留中文（en 侧同值，见翻译口径）
    'home.profile.university': '湖北工业大学',
    'home.profile.collegeGrade': '{college} • {grade}级',
    // 会话状态点（aria/title）
    'home.session.connected': '会话已连接',
    'home.session.reconnecting': '正在重连会话，点击查看详情',
    'home.session.offline': '会话异常或未连接，点击查看详情',
    // 维护/恢复卡片
    'home.maint.title.cachedOffline': '本地身份已恢复，教务在线会话未恢复',
    'home.maint.title.recovering': '正在后台恢复登录',
    'home.maint.title.needLogin': '需要重新登录',
    'home.maint.title.failed': '会话恢复未成功',
    'home.maint.title.maintenance': '教务系统正在维护',
    'home.maint.phase.cachedOffline': '展示缓存数据',
    'home.maint.phase.recovering': '后台自动登录中',
    'home.maint.phase.needLogin': '请手动登录',
    'home.maint.phase.failed': '将定时重试',
    'home.maint.phase.maintenance': '教务暂不可用',
    'home.maint.phase.unknown': '状态未知',
    'home.maint.hint.cachedOffline': '已恢复本地身份，教务在线会话未恢复，正在后台尝试恢复；成绩与课表缓存可正常查看，无需重新登录。',
    'home.maint.hint.recovering': '正在后台恢复登录会话，请稍候…',
    'home.maint.hint.generic': '当前可能无法同步最新教务数据，可查看下方详情或重试。',
    'home.maint.collapse': '收起',
    'home.maint.detailLabel': '详情：',
    'home.maint.lastCheckPrefix': '最近检查：',
    'home.maint.relatedNotices': '相关通知',
    'home.maint.retrying': '正在恢复…',
    'home.maint.retryNow': '立即重试',
    'home.maint.goLogin': '去登录',
    // 今日安排
    'home.today.panelTitle': '今日安排',
    'home.today.blockTitle': '今日课程',
    'home.today.blockOngoing': '正在进行',
    'home.today.blockNext': '即将开始',
    'home.today.viewAll': '查看全部',
    'home.today.loginRequired': '登录后可查看今日课程',
    'home.today.loading': '正在加载今日课程...',
    'home.today.empty': '今日无课程安排 🎉',
    'home.today.loadFailed': '今日课程加载失败',
    'home.today.goToClass': '去上课',
    'home.today.lessonsSuffix': '节',
    'home.today.completed': '已完成',
    'home.today.remaining': '剩余课程',
    // 课程状态
    'home.status.finished': '已结束',
    'home.status.ongoing': '进行中',
    'home.status.next': '下一节',
    'home.status.upcoming': '未开始',
    'home.status.startingSoon': '即将开始',
    // 课程倒计时
    'home.course.remaining': '剩余 {n} 分钟',
    'home.course.startsInMinutes': '距开始 {n} 分钟',
    'home.course.startsInPrefix': '距开始 ',
    // 快捷入口
    'home.quick.title': '快捷入口',
    'home.quick.editorTitle': '编辑快捷入口',
    'home.quick.editorHint': '选择 5 个模块作为快捷入口（已选 {n}/5）',
    'home.quick.pickFive': '请选择 5 个可用模块',
    'home.quick.updated': '快捷入口已更新',
    // 所有功能
    'home.features.title': '所有功能',
    'home.features.tabsAria': '功能分类',
    // 功能分组（学习通/一码通为专名，保留中文）
    'home.cat.academic': '教务服务',
    'home.cat.chaoxing': '学习通',
    'home.cat.yimatong': '一码通',
    'home.cat.resource': '资源',
    // 搜索
    'home.search.placeholder': '搜索服务/课程/资讯',
    'home.search.modalPlaceholder': '搜索服务、课程、资讯',
    'home.search.aria': '搜索服务',
    'home.search.frequent': '常用',
    'home.search.noResults': '没有匹配结果',
    'home.search.subtitleSchedule': '本周课表与课程安排',
    'home.search.subtitleService': '常用服务',
    // 天气
    'home.weather.district': '洪山区',
    'home.weather.hourly': '逐时预报',
    'home.weather.daily': '未来天气',
    'home.weather.loading': '加载中',
    'home.weather.now': '现在',
    // 公告
    'home.notice.viewDetail': '点击查看详情',
    // 分享
    'home.share.copied': '链接已复制！',
    // 通用动作/提示
    'home.common.cancel': '取消',
    'home.common.save': '保存',
    'home.common.featureUnavailable': '当前版本不可用该功能',
    'home.common.unavailable': '暂不可用',
    // 首页布局编辑
    'home.layout.saved': '首页布局已保存。',
    'home.layout.reset': '首页布局已恢复默认。',
    // 模块名（home.module.*）与描述（home.module.*.desc）
    'home.module.grades': '成绩查询',
    'home.module.grades.desc': '查看所有学期成绩',
    'home.module.classroom': '空教室',
    'home.module.classroom.desc': '查询空闲教室',
    'home.module.electricity': '电费查询',
    'home.module.electricity.desc': '宿舍电费余额',
    'home.module.transactions': '交易记录',
    'home.module.transactions.desc': '一码通消费记录',
    'home.module.exams': '考试安排',
    'home.module.exams.desc': '查询考试时间地点',
    'home.module.ranking': '绩点排名',
    'home.module.ranking.desc': '专业班级排名',
    'home.module.campus_code': '校园码',
    'home.module.campus_code.desc': '在线/高能模式二维码',
    'home.module.calendar': '校历',
    'home.module.calendar.desc': '查看学期校历',
    'home.module.school_inbox': '学校消息',
    'home.module.school_inbox.desc': '教务与学习通消息',
    'home.module.academic': '学业情况',
    'home.module.academic.desc': '学业完成度与课程进度',
    'home.module.qxzkb': '全校课表',
    'home.module.qxzkb.desc': '查询全校课程与排课',
    'home.module.course_selection': '选课中心',
    'home.module.course_selection.desc': '通识选课与退课',
    'home.module.training': '培养方案',
    'home.module.training.desc': '培养方案与课程设置',
    'home.module.teaching_eval': '教学评教',
    'home.module.teaching_eval.desc': '待评课程与一键满分提交',
    'home.module.chaoxing_hub': '课程中心',
    'home.module.chaoxing_hub.desc': '学习通课程、作业与进度',
    'home.module.chaoxing_inbox': '收件箱',
    'home.module.chaoxing_inbox.desc': '学习通通知与消息',
    'home.module.chaoxing_class': '资料分享',
    'home.module.chaoxing_class.desc': '邀请码入班与班级资料',
    'home.module.broadband': '教育网网费',
    'home.module.broadband.desc': '校园网费用查询与缴纳入口',
    'home.module.sports_venue': '运动场馆',
    'home.module.sports_venue.desc': '场馆预约需校园网（暂不可用）',
    'home.module.library': '图书查询',
    'home.module.library.desc': '馆藏检索与定位',
    'home.module.campus_map': '校园地图',
    'home.module.campus_map.desc': '校园地图查看',
    'home.module.resource_share': '资源网盘',
    'home.module.resource_share.desc': 'WebDAV 资料浏览与下载',
    'home.module.towergo': '小塔出行',
    'home.module.towergo.desc': '校园电单车与骑行服务',
    'home.module.ai': '校园助手',
    'home.module.ai.desc': '暂不可用',
    'home.module.schedule': '课表',
    'home.module.more': '更多',
    // 演示模式横幅（DemoModeBanner）
    'home.demo.title': '演示模式',
    'home.demo.close': '关闭',
    // 快捷链接子页（QuickLinksView）
    'home.quick_links.back': '返回',
    'home.quick_links.kicker': '我的',
    'home.quick_links.title': '快捷链接',
    'home.quick_links.intro': '常用校园系统入口，点击后在系统浏览器中打开。',
    'home.quick_links.listAria': '快捷链接列表',
    'home.quick_links.openFailed': '无法打开「{name}」，请稍后重试',
    // 门户名等专名保留中文（en 侧同值）
    'home.quick_links.portal.title': '新融合门户',
    'home.quick_links.portal.subtitle': '湖北工业大学统一身份认证与办事入口',
    'home.quick_links.chaoxing.title': '学习通',
    'home.quick_links.chaoxing.subtitle': '超星学习通网页版'
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
    // —— Home domain (issue #786: Dashboard / QuickLinks / DemoModeBanner) ——
    'home.greeting.dawn': 'Good morning',
    'home.greeting.morning': 'Good morning',
    'home.greeting.noon': 'Good noon',
    'home.greeting.afternoon': 'Good afternoon',
    'home.greeting.dusk': 'Good evening',
    'home.greeting.evening': 'Good evening',
    'home.greeting.night': 'Late night',
    'home.greet.sub': 'A fresh new day — make it count!',
    'home.profile.notLoggedIn': 'Not signed in',
    'home.profile.undergraduate': 'Undergraduate',
    'home.profile.university': '湖北工业大学',
    'home.profile.collegeGrade': '{college} • Class of {grade}',
    'home.session.connected': 'Session connected',
    'home.session.reconnecting': 'Reconnecting session, tap for details',
    'home.session.offline': 'Session offline or not connected, tap for details',
    'home.maint.title.cachedOffline': 'Local identity restored, online session not restored',
    'home.maint.title.recovering': 'Restoring sign-in in background',
    'home.maint.title.needLogin': 'Sign-in required',
    'home.maint.title.failed': 'Session restore failed',
    'home.maint.title.maintenance': 'Academic system under maintenance',
    'home.maint.phase.cachedOffline': 'Cached data shown',
    'home.maint.phase.recovering': 'Auto sign-in in background',
    'home.maint.phase.needLogin': 'Please sign in manually',
    'home.maint.phase.failed': 'Will retry periodically',
    'home.maint.phase.maintenance': 'Academic system unavailable',
    'home.maint.phase.unknown': 'Status unknown',
    'home.maint.hint.cachedOffline': 'Local identity restored, but the online session is not restored yet; recovery continues in the background. Cached grades and timetable remain available — no need to sign in again.',
    'home.maint.hint.recovering': 'Restoring your session in the background, please wait…',
    'home.maint.hint.generic': 'Latest academic data may be unavailable right now. Check the details below or retry.',
    'home.maint.collapse': 'Collapse',
    'home.maint.detailLabel': 'Details: ',
    'home.maint.lastCheckPrefix': 'Last checked: ',
    'home.maint.relatedNotices': 'Related notices',
    'home.maint.retrying': 'Restoring…',
    'home.maint.retryNow': 'Retry now',
    'home.maint.goLogin': 'Sign in',
    'home.today.panelTitle': 'Today',
    'home.today.blockTitle': "Today's classes",
    'home.today.blockOngoing': 'Happening now',
    'home.today.blockNext': 'Coming up',
    'home.today.viewAll': 'View all',
    'home.today.loginRequired': 'Sign in to view today\'s classes',
    'home.today.loading': 'Loading today\'s classes...',
    'home.today.empty': 'No classes today 🎉',
    'home.today.loadFailed': 'Failed to load today\'s classes',
    'home.today.goToClass': 'Go to class',
    'home.today.lessonsSuffix': '',
    'home.today.completed': 'Completed',
    'home.today.remaining': 'Remaining',
    'home.status.finished': 'Finished',
    'home.status.ongoing': 'In progress',
    'home.status.next': 'Next',
    'home.status.upcoming': 'Upcoming',
    'home.status.startingSoon': 'Starting soon',
    'home.course.remaining': '{n} min left',
    'home.course.startsInMinutes': 'Starts in {n} min',
    'home.course.startsInPrefix': 'Starts in ',
    'home.quick.title': 'Quick Access',
    'home.quick.editorTitle': 'Edit Quick Access',
    'home.quick.editorHint': 'Pick 5 modules as quick entries ({n}/5 selected)',
    'home.quick.pickFive': 'Please select 5 available modules',
    'home.quick.updated': 'Quick entries updated',
    'home.features.title': 'All Features',
    'home.features.tabsAria': 'Feature categories',
    'home.cat.academic': 'Academics',
    'home.cat.chaoxing': 'Chaoxing',
    'home.cat.yimatong': 'Campus Pass',
    'home.cat.resource': 'Resources',
    'home.search.placeholder': 'Search services / courses / news',
    'home.search.modalPlaceholder': 'Search services, courses, news',
    'home.search.aria': 'Search services',
    'home.search.frequent': 'Frequent',
    'home.search.noResults': 'No matching results',
    'home.search.subtitleSchedule': 'This week\'s timetable and courses',
    'home.search.subtitleService': 'Popular services',
    'home.weather.district': 'Hongshan District',
    'home.weather.hourly': 'Hourly forecast',
    'home.weather.daily': 'Coming days',
    'home.weather.loading': 'Loading',
    'home.weather.now': 'Now',
    'home.notice.viewDetail': 'Tap to view details',
    'home.share.copied': 'Link copied!',
    'home.common.cancel': 'Cancel',
    'home.common.save': 'Save',
    'home.common.featureUnavailable': 'This feature is unavailable in the current version',
    'home.common.unavailable': 'Unavailable',
    'home.layout.saved': 'Home layout saved.',
    'home.layout.reset': 'Home layout reset to defaults.',
    'home.module.grades': 'Grades',
    'home.module.grades.desc': 'View grades for all semesters',
    'home.module.classroom': 'Free Classrooms',
    'home.module.classroom.desc': 'Find available classrooms',
    'home.module.electricity': 'Electricity',
    'home.module.electricity.desc': 'Dorm electricity balance',
    'home.module.transactions': 'Transactions',
    'home.module.transactions.desc': 'Campus card spending records',
    'home.module.exams': 'Exam Schedule',
    'home.module.exams.desc': 'Exam dates and venues',
    'home.module.ranking': 'GPA Ranking',
    'home.module.ranking.desc': 'Major and class rankings',
    'home.module.campus_code': 'Campus Code',
    'home.module.campus_code.desc': 'Online / high-energy mode QR codes',
    'home.module.calendar': 'Academic Calendar',
    'home.module.calendar.desc': 'View the semester calendar',
    'home.module.school_inbox': 'School Messages',
    'home.module.school_inbox.desc': 'Academic and Chaoxing messages',
    'home.module.academic': 'Academic Progress',
    'home.module.academic.desc': 'Completion and course progress',
    'home.module.qxzkb': 'All Timetables',
    'home.module.qxzkb.desc': 'Search courses across the university',
    'home.module.course_selection': 'Course Registration',
    'home.module.course_selection.desc': 'General electives and dropping',
    'home.module.training': 'Study Plan',
    'home.module.training.desc': 'Program requirements and course setup',
    'home.module.teaching_eval': 'Course Evaluation',
    'home.module.teaching_eval.desc': 'Pending evaluations and one-tap full scores',
    'home.module.chaoxing_hub': 'Course Hub',
    'home.module.chaoxing_hub.desc': 'Chaoxing courses, homework and progress',
    'home.module.chaoxing_inbox': 'Inbox',
    'home.module.chaoxing_inbox.desc': 'Chaoxing notifications and messages',
    'home.module.chaoxing_class': 'File Sharing',
    'home.module.chaoxing_class.desc': 'Join classes by invite code and share files',
    'home.module.broadband': 'Campus Network Plan',
    'home.module.broadband.desc': 'Campus network billing and top-up',
    'home.module.sports_venue': 'Sports Venues',
    'home.module.sports_venue.desc': 'Booking requires campus network (unavailable)',
    'home.module.library': 'Library Search',
    'home.module.library.desc': 'Search and locate library holdings',
    'home.module.campus_map': 'Campus Map',
    'home.module.campus_map.desc': 'View the campus map',
    'home.module.resource_share': 'File Drive',
    'home.module.resource_share.desc': 'Browse and download via WebDAV',
    'home.module.towergo': 'TowerGo Rides',
    'home.module.towergo.desc': 'Campus e-bike and riding service',
    'home.module.ai': 'AI Assistant',
    'home.module.ai.desc': 'Unavailable',
    'home.module.schedule': 'Timetable',
    'home.module.more': 'More',
    'home.demo.title': 'Demo Mode',
    'home.demo.close': 'Close',
    'home.quick_links.back': 'Back',
    'home.quick_links.kicker': 'Me',
    'home.quick_links.title': 'Quick Links',
    'home.quick_links.intro': 'Common campus portals that open in your system browser.',
    'home.quick_links.listAria': 'Quick links list',
    'home.quick_links.openFailed': 'Failed to open "{name}". Please try again later',
    'home.quick_links.portal.title': '新融合门户',
    'home.quick_links.portal.subtitle': '湖北工业大学统一身份认证与办事入口',
    'home.quick_links.chaoxing.title': '学习通',
    'home.quick_links.chaoxing.subtitle': '超星学习通网页版'
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
