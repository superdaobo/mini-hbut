/**
 * 异步视图注册表（Phase 5：#574）
 *
 * 从 App.vue 迁出全部视图组件 loader / async component 注册，
 * AppViewHost 与 NavigationCoordinator（prefetch）共同取用。
 * 保持 view → 组件路径映射不变（行为兼容）。
 */
import { defineAsyncComponent, type Component } from 'vue'

type Loader = () => Promise<any>

// 移动端发布构建排除产品隐藏视图（#591）：
// 默认全功能；仅当 VITE_EXCLUDE_HIDDEN_VIEWS=1（Android release / iOS TestFlight 发布构建注入）时，
// forum 等产品隐藏视图从 Vite 依赖图与 prefetch 中退出，源码保留。导航/深链由策略层收敛回 home。
const excludeHiddenViews = import.meta.env.VITE_EXCLUDE_HIDDEN_VIEWS === '1'
const noopLoader: Loader = () => Promise.resolve()

const createAsyncPage = (loader: Loader): Component =>
  defineAsyncComponent({ loader: loader as () => Promise<Component>, delay: 0, suspensible: false })

const loadDashboardView: Loader = () => import('../components/Dashboard.vue')
const loadGradeView: Loader = () => import('../components/GradeView.vue')
const loadElectricityView: Loader = () => import('../components/ElectricityView.vue')
const loadClassroomView: Loader = () => import('../components/ClassroomView.vue')
const loadScheduleView: Loader = () => import('../components/ScheduleView.vue')
const loadGlobalScheduleView: Loader = () => import('../components/GlobalScheduleView.vue')
const loadCourseSelectionView: Loader = () => import('../components/CourseSelectionView.vue')
const loadStudentInfoView: Loader = () => import('../components/StudentInfoView.vue')
const loadExamView: Loader = () => import('../components/ExamView.vue')
const loadRankingView: Loader = () => import('../components/RankingView.vue')
const loadCalendarView: Loader = () => import('../components/CalendarView.vue')
const loadSchoolInboxView: Loader = () => import('../components/SchoolInboxView.vue')
const loadAcademicProgressView: Loader = () => import('../components/AcademicProgressView.vue')
const loadTrainingPlanView: Loader = () => import('../components/TrainingPlanView.vue')
const loadForumView: Loader = excludeHiddenViews
  ? () => Promise.reject(new Error('forum: view excluded in mobile release build (#591)'))
  : () => import('../components/ForumView.vue')
const loadMeView: Loader = () => import('../components/MeView.vue')
const loadOfficialView: Loader = () => import('../components/OfficialView.vue')
const loadFeedbackView: Loader = () => import('../components/FeedbackView.vue')
const loadNotificationView: Loader = () => import('../components/NotificationView.vue')
const loadConfigEditorView: Loader = () => import('../components/ConfigEditor.vue')
const loadSettingsView: Loader = () => import('../components/SettingsView.vue')
const loadPrivacyDataView: Loader = () => import('../components/PrivacyDataView.vue')
const loadExportCenterView: Loader = () => import('../components/ExportCenterView.vue')
const loadServiceStatsView: Loader = () => import('../components/ServiceStatsView.vue')
const loadSchoolWebsiteView: Loader = () => import('../components/SchoolWebsiteView.vue')
const loadQuickLinksView: Loader = () => import('../components/QuickLinksView.vue')
const loadCampusNetworkView: Loader = () => import('../components/CampusNetworkView.vue')
const loadMoreView: Loader = () => import('../components/MoreView.vue')
const loadMoreModuleHostView: Loader = () => import('../components/MoreModuleHostView.vue')
const loadMoreChaoxingCheckinView: Loader = () => import('../components/MoreChaoxingCheckinView.vue')
const loadTransactionHistoryView: Loader = () => import('../components/TransactionHistory.vue')
const loadCampusCodeView: Loader = () => import('../components/CampusCodeView.vue')
const loadAiChatView: Loader = () => import('../components/AiChatView.vue')
const loadCampusMapView: Loader = async () => {
  const { readCampusGuideMode } = await import('../features/campus-guide/config.ts')
  return readCampusGuideMode() === 'tencent'
    ? import('../features/campus-guide/views/CampusGuideShell.vue')
    : import('../components/CampusMapView.vue')
}
const loadLibraryView: Loader = () => import('../components/LibraryView.vue')
const loadResourceShareView: Loader = () => import('../components/ResourceShareView.vue')
const loadChaoxingClassView: Loader = () => import('../components/ChaoxingClassView.vue')
const loadChaoxingHubView: Loader = () => import('../components/ChaoxingHubView.vue')
const loadChaoxingInboxView: Loader = () => import('../components/ChaoxingInboxView.vue')
const loadTeachingEvalView: Loader = () => import('../components/TeachingEvalView.vue')
const loadBroadbandView: Loader = () => import('../components/BroadbandView.vue')
const loadSportsVenueView: Loader = () => import('../components/SportsVenueView.vue')
const loadTowerGoView: Loader = () => import('../components/TowerGoView.vue')
const loadSmartOrientationView: Loader = () => import('../components/SmartOrientationView.vue')
const loadIdentityAuthHistoryView: Loader = () => import('../features/identity/views/IdentityAuthHistoryView.vue')

/** view key → 异步组件（AppViewHost 模板 v-if 分支使用） */
export const VIEW_COMPONENTS: Record<string, Component> = {
  home: createAsyncPage(loadDashboardView),
  grades: createAsyncPage(loadGradeView),
  electricity: createAsyncPage(loadElectricityView),
  classroom: createAsyncPage(loadClassroomView),
  schedule: createAsyncPage(loadScheduleView),
  qxzkb: createAsyncPage(loadGlobalScheduleView),
  course_selection: createAsyncPage(loadCourseSelectionView),
  studentinfo: createAsyncPage(loadStudentInfoView),
  exams: createAsyncPage(loadExamView),
  ranking: createAsyncPage(loadRankingView),
  calendar: createAsyncPage(loadCalendarView),
  school_inbox: createAsyncPage(loadSchoolInboxView),
  academic: createAsyncPage(loadAcademicProgressView),
  training: createAsyncPage(loadTrainingPlanView),
  forum: createAsyncPage(loadForumView),
  me: createAsyncPage(loadMeView),
  official: createAsyncPage(loadOfficialView),
  feedback: createAsyncPage(loadFeedbackView),
  notifications: createAsyncPage(loadNotificationView),
  config: createAsyncPage(loadConfigEditorView),
  settings: createAsyncPage(loadSettingsView),
  privacy_data: createAsyncPage(loadPrivacyDataView),
  export_center: createAsyncPage(loadExportCenterView),
  service_stats: createAsyncPage(loadServiceStatsView),
  school_website: createAsyncPage(loadSchoolWebsiteView),
  quick_links: createAsyncPage(loadQuickLinksView),
  campus_network: createAsyncPage(loadCampusNetworkView),
  more: createAsyncPage(loadMoreView),
  more_module_host: createAsyncPage(loadMoreModuleHostView),
  more_chaoxing_checkin: createAsyncPage(loadMoreChaoxingCheckinView),
  transactions: createAsyncPage(loadTransactionHistoryView),
  campus_code: createAsyncPage(loadCampusCodeView),
  ai: createAsyncPage(loadAiChatView),
  campus_map: createAsyncPage(loadCampusMapView),
  library: createAsyncPage(loadLibraryView),
  resource_share: createAsyncPage(loadResourceShareView),
  chaoxing_class: createAsyncPage(loadChaoxingClassView),
  chaoxing_hub: createAsyncPage(loadChaoxingHubView),
  chaoxing_inbox: createAsyncPage(loadChaoxingInboxView),
  teaching_eval: createAsyncPage(loadTeachingEvalView),
  broadband: createAsyncPage(loadBroadbandView),
  sports_venue: createAsyncPage(loadSportsVenueView),
  towergo: createAsyncPage(loadTowerGoView),
  smart_orientation: createAsyncPage(loadSmartOrientationView),
  identity_auth_history: createAsyncPage(loadIdentityAuthHistoryView)
}

/** view key → loader（prefetch 使用） */
export const VIEW_PREFETCHERS: Record<string, Loader> = {
  home: loadDashboardView,
  schedule: loadScheduleView,
  qxzkb: loadGlobalScheduleView,
  course_selection: loadCourseSelectionView,
  me: loadMeView,
  official: loadOfficialView,
  feedback: loadFeedbackView,
  config: loadConfigEditorView,
  settings: loadSettingsView,
  privacy_data: loadPrivacyDataView,
  export_center: loadExportCenterView,
  service_stats: loadServiceStatsView,
  school_website: loadSchoolWebsiteView,
  quick_links: loadQuickLinksView,
  campus_network: loadCampusNetworkView,
  more: loadMoreView,
  more_module_host: loadMoreModuleHostView,
  more_chaoxing_checkin: loadMoreChaoxingCheckinView,
  grades: loadGradeView,
  electricity: loadElectricityView,
  transactions: loadTransactionHistoryView,
  campus_code: loadCampusCodeView,
  notifications: loadNotificationView,
  classroom: loadClassroomView,
  studentinfo: loadStudentInfoView,
  exams: loadExamView,
  ranking: loadRankingView,
  calendar: loadCalendarView,
  school_inbox: loadSchoolInboxView,
  academic: loadAcademicProgressView,
  training: loadTrainingPlanView,
  forum: excludeHiddenViews ? noopLoader : loadForumView,
  ai: loadAiChatView,
  campus_map: loadCampusMapView,
  library: loadLibraryView,
  resource_share: loadResourceShareView,
  chaoxing_class: loadChaoxingClassView,
  chaoxing_hub: loadChaoxingHubView,
  chaoxing_inbox: loadChaoxingInboxView,
  teaching_eval: loadTeachingEvalView,
  broadband: loadBroadbandView,
  sports_venue: loadSportsVenueView,
  towergo: loadTowerGoView,
  smart_orientation: loadSmartOrientationView,
  identity_auth_history: loadIdentityAuthHistoryView
}
