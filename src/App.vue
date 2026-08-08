<script setup lang="ts">
import UpdateDialog from './components/UpdateDialog.vue'
import Toast from './components/Toast.vue'
import SplashScreen from './components/SplashScreen.vue'
import DemoModeBanner from './components/DemoModeBanner.vue'
import WorkspaceLayoutEditor from './components/WorkspaceLayoutEditor.vue'
import AppShell from './shell/AppShell.vue'
import { VIEW_COMPONENTS } from './app/viewRegistry'
import { useAppRuntime } from './app/useAppRuntime'

const { state, handlers, isIOSLike, isTestAccountSession } = useAppRuntime()

const {
  currentView,
  activeTab,
  currentModule,
  studentId,
  userUuid,
  isLoggedIn,
  gradeData,
  gradesOffline,
  gradesSyncTime,
  isLoading,
  showUpdateDialog,
  showForceUpdate,
  forceUpdateInfo,
  forceUpdateResolvedUrl,
  forceUpdateDisplayUrl,
  showSplash,
  splashStatus,
  splashStatusText,
  splashRef,
  viewRenderNonce,
  widgetDeeplinkDate,
  widgetDeeplinkPeriod,
  moduleHostSession,
  appShellRef,
  loginMode,
  showLoginPrompt,
  showExitDialog,
  exitingApp,
  showDailyAccessDialog,
  dailyAccessInput,
  dailyAccessError,
  jwxtMaintenanceMode,
  jwxtMaintenanceHint,
  jwxtMaintenanceDetail,
  jwxtRecoveryPhase,
  jwxtLastCheckTime,
  announcementData,
  activeAnnouncement,
  showAnnouncementModal,
  blockingAnnouncement,
  showBlockingAnnouncement,
  activeAnnouncementHtml,
  blockingAnnouncementHtml,
  showWorkspaceLayoutEditor,
  workspaceLayoutEditorTab,
  homeLayoutDebugExpanded,
  homeLayoutDebugReport,
  viewTransitionEnterActive,
  viewTransitionLeaveActive,
  viewTransitionEnterFrom,
  viewTransitionLeaveTo,
  protectedViewPromptTitle,
  configAdminIds,
  isConfigAdmin,
  aiModelOptions,
  showTabBar,
  showHomeLayoutDebug,
  homeScrollRestoring
} = state

const {
  handleNavigate,
  handleLogout,
  handleRequireLogin,
  handleRetrySessionRecovery,
  handleLoginSuccess,
  handleSwitchLoginMode,
  handleCheckUpdate,
  handleOpenOfficial,
  handleOpenFeedback,
  handleOpenConfig,
  handleOpenSettings,
  handleBackToDashboard,
  handleBackToMe,
  handleBackToMoreCenter,
  handleRefreshGrades,
  handleTabChange,
  handleSplashDismissed,
  handleForceUpdate,
  openAnnouncement,
  openWorkspaceLayoutEditor,
  closeWorkspaceLayoutEditor,
  closeAnnouncement,
  confirmBlockingAnnouncement,
  handleContentClick,
  handleExternalOpen,
  hideHomeLayoutDebug,
  copyHomeLayoutDebugReport,
  toggleHomeLayoutDebugReport,
  closeDailyAccessDialog,
  handleDailyAccessInput,
  submitDailyAccessKey,
  cancelExitDialog,
  confirmExitDialog
} = handlers

const {
  home: Dashboard,
  grades: GradeView,
  electricity: ElectricityView,
  classroom: ClassroomView,
  schedule: ScheduleView,
  qxzkb: GlobalScheduleView,
  course_selection: CourseSelectionView,
  studentinfo: StudentInfoView,
  exams: ExamView,
  ranking: RankingView,
  calendar: CalendarView,
  school_inbox: SchoolInboxView,
  academic: AcademicProgressView,
  training: TrainingPlanView,
  forum: ForumView,
  me: MeView,
  official: OfficialView,
  feedback: FeedbackView,
  notifications: NotificationView,
  config: ConfigEditor,
  settings: SettingsView,
  privacy_data: PrivacyDataView,
  export_center: ExportCenterView,
  service_stats: ServiceStatsView,
  school_website: SchoolWebsiteView,
  quick_links: QuickLinksView,
  campus_network: CampusNetworkView,
  more: MoreView,
  more_module_host: MoreModuleHostView,
  more_chaoxing_checkin: MoreChaoxingCheckinView,
  transactions: TransactionHistory,
  campus_code: CampusCodeView,
  ai: AiChatView,
  campus_map: CampusMapView,
  library: LibraryView,
  resource_share: ResourceShareView,
  chaoxing_class: ChaoxingClassView,
  chaoxing_hub: ChaoxingHubView,
  chaoxing_inbox: ChaoxingInboxView,
  teaching_eval: TeachingEvalView,
  broadband: BroadbandView,
  sports_venue: SportsVenueView,
  towergo: TowerGoView,
  smart_orientation: SmartOrientationView
} = VIEW_COMPONENTS
</script>

<template>
  <AppShell :view="currentView" :student-id="studentId" :logged-in="isLoggedIn">
  <!-- 启动画面 -->
  <SplashScreen
    v-if="showSplash"
    ref="splashRef"
    :status="splashStatus"
    :status-text="splashStatusText"
    @dismiss="handleSplashDismissed"
  />

  <main
    class="app-shell"
    :class="{
      'no-scroll': currentView === 'ai',
      'ai-full': currentView === 'ai',
      'schedule-full': currentView === 'schedule',
      'module-host-full': currentView === 'more_module_host',
      'ios-safe': isIOSLike
    }"
    ref="appShellRef"
  >
    <DemoModeBanner v-if="isLoggedIn && isTestAccountSession()" />
    <Transition
      name="module-fade"
      mode="out-in"
      :enter-active-class="viewTransitionEnterActive"
      :leave-active-class="viewTransitionLeaveActive"
      :enter-from-class="viewTransitionEnterFrom"
      :leave-to-class="viewTransitionLeaveTo"
    >
      <div
        :key="`${currentView}:${viewRenderNonce}`"
        class="view-transition-root"
        :class="{ 'home-scroll-restoring': homeScrollRestoring }"
      >
      <!-- 首页 -->
      <Dashboard 
        v-if="currentView === 'home'"
        :student-id="studentId"
        :user-uuid="userUuid"
        :is-logged-in="isLoggedIn"
        :jwxt-maintenance="jwxtMaintenanceMode"
        :jwxt-maintenance-hint="jwxtMaintenanceHint"
        :jwxt-maintenance-detail="jwxtMaintenanceDetail"
        :jwxt-recovery-phase="jwxtRecoveryPhase"
        :jwxt-last-check-time="jwxtLastCheckTime"
        :ticker-notices="announcementData.ticker"
        :pinned-notices="announcementData.pinned"
        :notice-list="announcementData.list"
        @navigate="handleNavigate"
        @logout="handleLogout"
        @require-login="handleRequireLogin"
        @retry-session-recovery="handleRetrySessionRecovery"
        @open-notice="openAnnouncement"
        @openSettings="openWorkspaceLayoutEditor('home')"
      />

      <!-- 课表（Tab） -->
      <ScheduleView 
        v-else-if="currentView === 'schedule'"
        :student-id="studentId"
        :widget-date="widgetDeeplinkDate"
        :widget-period="widgetDeeplinkPeriod"
        @back="handleBackToDashboard"
        @logout="handleLogout"
        @widget-deeplink-consumed="widgetDeeplinkDate = ''; widgetDeeplinkPeriod = 0"
      />

      <!-- 全校课表 -->
      <GlobalScheduleView
        v-else-if="currentView === 'qxzkb'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <CourseSelectionView
        v-else-if="currentView === 'course_selection'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 校园论坛（Tab） -->
      <ForumView
        v-else-if="currentView === 'forum'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @require-login="handleRequireLogin"
      />

      <!-- 个人中心（Tab） -->
      <MeView 
        v-else-if="currentView === 'me'"
        :student-id="studentId"
        :is-logged-in="isLoggedIn"
        :login-mode="loginMode"
        :config-admin-ids="configAdminIds"
        @success="handleLoginSuccess"
        @switchMode="handleSwitchLoginMode"
        @navigate="handleNavigate"
        @logout="handleLogout"
        @checkUpdate="handleCheckUpdate"
        @openOfficial="handleOpenOfficial"
        @openFeedback="handleOpenFeedback"
        @openConfig="handleOpenConfig"
        @openSettings="handleOpenSettings"
      />

      <!-- 官方发布页 -->
      <OfficialView 
        v-else-if="currentView === 'official'"
        @back="handleBackToMe"
      />

      <!-- 问题反馈页 -->
      <FeedbackView 
        v-else-if="currentView === 'feedback'"
        @back="handleBackToMe"
      />

      <ConfigEditor
        v-else-if="currentView === 'config' && isConfigAdmin"
        @back="handleBackToMe"
      />

      <SettingsView
        v-else-if="currentView === 'settings'"
        @back="handleBackToMe"
        @openWorkspaceLayout="openWorkspaceLayoutEditor"
      />

      <PrivacyDataView
        v-else-if="currentView === 'privacy_data'"
        @back="handleBackToMe"
        @logout="handleLogout"
        @cleared="handleLogout"
      />

      <ExportCenterView
        v-else-if="currentView === 'export_center'"
        :student-id="studentId"
        @back="handleBackToMe"
        @logout="handleLogout"
      />

      <ServiceStatsView
        v-else-if="currentView === 'service_stats'"
        :student-id="studentId"
        @back="handleBackToMe"
      />

      <SchoolWebsiteView
        v-else-if="currentView === 'school_website' && isLoggedIn"
        @back="handleBackToMe"
      />

      <QuickLinksView
        v-else-if="currentView === 'quick_links' && isLoggedIn"
        @back="handleBackToMe"
      />

      <CampusNetworkView
        v-else-if="currentView === 'campus_network' && isLoggedIn"
        :student-id="studentId"
        @back="handleBackToMe"
      />

      <MoreView
        v-else-if="currentView === 'more'"
        :student-id="studentId"
        @back="handleBackToMe"
        @navigate="handleNavigate"
      />

      <MoreModuleHostView
        v-else-if="currentView === 'more_module_host'"
        :session="moduleHostSession"
        @back="handleBackToMoreCenter"
      />

      <MoreChaoxingCheckinView
        v-else-if="currentView === 'more_chaoxing_checkin'"
        :student-id="studentId"
        @back="handleBackToMoreCenter"
      />

      <!-- 成绩查看 -->
      <GradeView 
        v-else-if="currentView === 'grades'"
        :grades="gradeData"
        :student-id="studentId"
        :offline="gradesOffline"
        :sync-time="gradesSyncTime"
        :refreshing="isLoading"
        @back="handleBackToDashboard"
        @logout="handleLogout"
        @refresh="handleRefreshGrades"
      />

      <!-- 电费查询 -->
      <!-- 电费查询 -->
      <ElectricityView 
        v-else-if="currentView === 'electricity'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 交易记录 -->
      <TransactionHistory 
        v-else-if="currentView === 'transactions'"
        :student-id="studentId"
        @back="handleBackToDashboard"
      />

      <CampusCodeView
        v-else-if="currentView === 'campus_code'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 通知设置 -->
      <NotificationView 
        v-else-if="currentView === 'notifications'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @openWorkspaceLayout="openWorkspaceLayoutEditor('notifications')"
      />

      <!-- 空教室查询 -->
      <ClassroomView 
        v-else-if="currentView === 'classroom'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 个人信息 -->
      <StudentInfoView 
        v-else-if="currentView === 'studentinfo'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 考试安排 -->
      <ExamView 
        v-else-if="currentView === 'exams'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 绩点排名 -->
      <RankingView 
        v-else-if="currentView === 'ranking'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 校历 -->
      <CalendarView 
        v-else-if="currentView === 'calendar'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 学校消息 -->
      <SchoolInboxView
        v-else-if="currentView === 'school_inbox'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 学业完成情况 -->
      <AcademicProgressView 
        v-else-if="currentView === 'academic'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 培养方案 -->
      <TrainingPlanView 
        v-else-if="currentView === 'training'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- AI 助手 -->
      <AiChatView 
        v-else-if="currentView === 'ai'"
        :student-id="studentId"
        :model-options="aiModelOptions"
        @back="handleBackToDashboard"
      />

      <!-- 校园地图 -->
      <CampusMapView
        v-else-if="currentView === 'campus_map'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 图书查询 -->
      <LibraryView
        v-else-if="currentView === 'library'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 资料分享 -->
      <ResourceShareView
        v-else-if="currentView === 'resource_share'"
        :student-id="studentId"
        @back="handleBackToDashboard"
      />

      <!-- 资料分享：邀请码入班 + 班级资料 -->
      <ChaoxingClassView
        v-else-if="currentView === 'chaoxing_class'"
        :student-id="studentId"
        @back="handleBackToDashboard"
      />

      <!-- 学习通：课程中心 -->
      <ChaoxingHubView
        v-else-if="currentView === 'chaoxing_hub'"
        :student-id="studentId"
        @back="handleBackToDashboard"
      />

      <!-- 学习通：收件箱 -->
      <ChaoxingInboxView
        v-else-if="currentView === 'chaoxing_inbox'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />

      <!-- 教学评教 -->
      <TeachingEvalView
        v-else-if="currentView === 'teaching_eval'"
        @back="handleBackToDashboard"
      />

      <!-- 教育网网费 -->
      <BroadbandView
        v-else-if="currentView === 'broadband'"
        @back="handleBackToDashboard"
      />

      <!-- 运动场馆 -->
      <SportsVenueView
        v-else-if="currentView === 'sports_venue'"
        @back="handleBackToDashboard"
      />


      <!-- 小塔出行 -->
      <TowerGoView
        v-else-if="currentView === 'towergo'"
        :student-id="studentId"
        @back="handleBackToDashboard"
      />

      <!-- 智慧迎新 -->
      <SmartOrientationView
        v-else-if="currentView === 'smart_orientation'"
        :student-id="studentId"
        @back="handleBackToDashboard"
        @logout="handleLogout"
      />
      
      <!-- 其他模块占位 -->
      <div v-else class="coming-soon-page">
        <div class="coming-soon-content">
          <div class="emoji">🚧</div>
          <h2>{{ currentModule }} 模块开发中</h2>
          <p>敬请期待...</p>
          <button @click="handleBackToDashboard">返回仪表盘</button>
        </div>
      </div>
      </div>
    </Transition>
  </main>

  <nav v-if="showTabBar" class="bottom-tab-bar glass-card">
      <button class="tab-item btn-ripple" :class="{ active: activeTab === 'home' }" @click="handleTabChange('home')">
        <span class="tab-icon" aria-hidden="true">
          <svg class="tab-icon-svg" viewBox="0 0 24 24" fill="none">
            <path d="M3 10.8L12 3l9 7.8V21a1 1 0 0 1-1 1h-5.3a1 1 0 0 1-1-1v-5h-3.4v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V10.8z" />
          </svg>
        </span>
        <span class="tab-label">首页</span>
      </button>
      <button class="tab-item btn-ripple" :class="{ active: activeTab === 'schedule' }" @click="handleTabChange('schedule')">
        <span class="tab-icon" aria-hidden="true">
          <svg class="tab-icon-svg" viewBox="0 0 24 24" fill="none">
            <rect x="3.2" y="4.5" width="17.6" height="16.3" rx="3.1" />
            <path d="M7 2.8v3.5M17 2.8v3.5M3.2 9.3h17.6" />
          </svg>
        </span>
        <span class="tab-label">课表</span>
      </button>
      <button class="tab-item btn-ripple" :class="{ active: activeTab === 'notifications' }" @click="handleTabChange('notifications')">
        <span class="tab-icon" aria-hidden="true">
          <svg class="tab-icon-svg" viewBox="0 0 24 24" fill="none">
            <path d="M12 3.5a5.8 5.8 0 0 0-5.8 5.8v3.2c0 .8-.2 1.6-.6 2.3L4.3 17a1.3 1.3 0 0 0 1.1 2h13.2a1.3 1.3 0 0 0 1.1-2l-1.3-2.2a4.7 4.7 0 0 1-.6-2.3V9.3A5.8 5.8 0 0 0 12 3.5z" />
            <path d="M9.3 19a2.7 2.7 0 0 0 5.4 0" />
          </svg>
        </span>
        <span class="tab-label">通知</span>
      </button>
      <button class="tab-item btn-ripple" :class="{ active: activeTab === 'me' }" @click="handleTabChange('me')">
        <span class="tab-icon" aria-hidden="true">
          <svg class="tab-icon-svg" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="8" r="4.1" />
            <path d="M4 20c1.8-3.6 4.7-5.5 8-5.5s6.2 1.9 8 5.5" />
          </svg>
        </span>
        <span class="tab-label">我的</span>
      </button>
  </nav>

  <section v-if="showHomeLayoutDebug" class="home-layout-debug-panel" aria-label="当前首页布局调试">
    <div class="home-layout-debug-head">
      <div>
        <p class="home-layout-debug-kicker">当前首页布局调试</p>
        <p class="home-layout-debug-copy">复制后发回，用于定位 iOS 安全区和底栏位置。</p>
      </div>
      <button class="home-layout-debug-close" type="button" @click="hideHomeLayoutDebug">隐藏</button>
    </div>
    <div class="home-layout-debug-actions">
      <button class="home-layout-debug-primary" type="button" @click="copyHomeLayoutDebugReport">复制调试信息</button>
      <button class="home-layout-debug-secondary" type="button" @click="toggleHomeLayoutDebugReport">
        {{ homeLayoutDebugExpanded ? '收起' : '显示' }}
      </button>
    </div>
    <textarea
      v-if="homeLayoutDebugExpanded"
      class="home-layout-debug-output"
      :value="homeLayoutDebugReport"
      readonly
      rows="12"
    />
  </section>

  <Transition name="modal-pop">
  <div v-if="showLoginPrompt" class="login-mask">
    <div class="login-mask-card modal-pop-card">请先在个人中心登录</div>
  </div>
  </Transition>

  <Transition name="modal-pop">
  <div v-if="showDailyAccessDialog" class="daily-access-overlay">
    <div class="daily-access-card modal-pop-card">
      <h3>输入今日秘钥</h3>
      <p class="daily-access-desc">
        {{ protectedViewPromptTitle }} 已启用访问门禁，请输入根据当天日期生成的秘钥后再进入。
      </p>
      <p class="daily-access-tip">详情请询问管理员。</p>
      <form class="daily-access-form" @submit.prevent="submitDailyAccessKey">
        <input
          class="daily-access-input"
          :value="dailyAccessInput"
          type="text"
          placeholder="例如 ABCDE-FGHIJ"
          autocomplete="off"
          autocapitalize="characters"
          spellcheck="false"
          maxlength="11"
          autofocus
          @input="handleDailyAccessInput"
        />
        <p v-if="dailyAccessError" class="daily-access-error">{{ dailyAccessError }}</p>
        <div class="daily-access-actions">
          <button type="button" class="btn-secondary" @click="closeDailyAccessDialog">取消</button>
          <button type="submit" class="btn-primary">验证并进入</button>
        </div>
      </form>
    </div>
  </div>
  </Transition>

  <Transition name="modal-pop">
  <div v-if="showExitDialog" class="exit-dialog-overlay">
    <div class="exit-dialog-card modal-pop-card">
      <h3>退出应用</h3>
      <p>是否退出 Mini-HBUT？</p>
      <div class="exit-dialog-actions">
        <button class="btn-secondary" :disabled="exitingApp" @click="cancelExitDialog">取消</button>
        <button class="btn-danger" :disabled="exitingApp" @click="confirmExitDialog">
          {{ exitingApp ? '退出中...' : '退出' }}
        </button>
      </div>
    </div>
  </div>
  </Transition>

  <!-- 版本更新对话框 -->
  <UpdateDialog 
    v-if="showUpdateDialog"
    @close="showUpdateDialog = false"
  />

  <!-- 强制更新覆盖层 -->
  <Transition name="modal-pop">
  <div v-if="showForceUpdate" class="force-update-overlay">
    <div class="force-update-card modal-pop-card">
      <h3>需要更新</h3>
      <p class="force-update-message">
        {{ forceUpdateInfo?.message || '当前版本过低，请更新后继续使用。' }}
      </p>
      <p class="force-update-meta">最低版本：v{{ forceUpdateInfo?.min_version }}</p>
      <div v-if="forceUpdateResolvedUrl" class="force-update-download">
        <span class="force-update-label">下载地址</span>
        <button class="force-update-link" @click="handleForceUpdate">{{ forceUpdateDisplayUrl }}</button>
      </div>
      <div class="force-update-actions">
        <button class="btn-primary force-update-btn" @click="handleForceUpdate">立即更新</button>
      </div>
    </div>
  </div>
  </Transition>

  <!-- 公告详情弹窗 -->
  <Transition name="modal-pop">
  <div v-if="showAnnouncementModal" class="notice-modal-overlay" @click.self="closeAnnouncement">
    <div class="notice-modal modal-pop-card">
      <div class="notice-modal-header">
        <h3>{{ activeAnnouncement?.title }}</h3>
        <button class="notice-close" @click="closeAnnouncement">×</button>
      </div>
      <div v-if="activeAnnouncement?.updated_at" class="notice-modal-meta">
        更新时间：{{ activeAnnouncement.updated_at }}
      </div>
      <div v-if="activeAnnouncement?.image" class="notice-modal-image">
        <img :src="activeAnnouncement.image" :alt="activeAnnouncement.title" />
      </div>
      <div class="notice-modal-content select-text" @click="handleContentClick" v-html="activeAnnouncementHtml"></div>
      <a
        v-if="activeAnnouncement?.link"
        class="notice-link"
        :href="activeAnnouncement.link"
        target="_blank"
        @click.prevent="handleExternalOpen(activeAnnouncement.link, $event)"
      >
        查看原文
      </a>
    </div>
  </div>
  </Transition>

  <!-- 确认公告弹窗 -->
  <Transition name="modal-pop">
  <div v-if="showBlockingAnnouncement" class="notice-confirm-overlay">
    <div class="notice-confirm-card modal-pop-card">
      <h3>重要公告</h3>
      <p class="notice-confirm-title">{{ blockingAnnouncement?.title }}</p>
      <div class="notice-confirm-content" v-html="blockingAnnouncementHtml"></div>
      <div class="notice-confirm-actions">
        <button class="btn-secondary" @click="openAnnouncement(blockingAnnouncement)">查看详情</button>
        <button class="btn-primary" @click="confirmBlockingAnnouncement">我已知晓</button>
      </div>
    </div>
  </div>
  </Transition>
    
  <!-- 全局提示 -->
  <WorkspaceLayoutEditor
    :visible="showWorkspaceLayoutEditor"
    :initial-tab="workspaceLayoutEditorTab"
    @close="closeWorkspaceLayoutEditor"
  />
  <Toast />
  </AppShell>
</template>

<style src="./styles/views/App.scoped.css" scoped></style>
