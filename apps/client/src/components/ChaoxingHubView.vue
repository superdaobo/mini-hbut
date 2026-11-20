<script setup>
/**
 * 学习通课程中心（组合壳）
 * 领域逻辑已拆分至 src/features/chaoxing：
 * - useChaoxingHubCore：导航栈/页面状态/invoke 基础设施
 * - useChaoxingCourseList：课程列表/学期筛选/搜索/分批渲染/会话状态
 * - useChaoxingCourseNav：课程详情/大纲/小节任务卡/视频/文档/成绩
 * 模板与样式保持不变，命令调用与 UI 行为无回归。
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { TPageHeader, TEmptyState, TStatusBadge, TModal } from './templates'
import { showToast } from '../utils/toast'
import ChaoxingEmbedFrame from '../features/chaoxing/components/ChaoxingEmbedFrame.vue'
// P4-C（#1344）：学习记录（6 Tab / 16 维度）
import ChaoxingStudyRecord from '../features/chaoxing/components/ChaoxingStudyRecord.vue'
import { useChaoxingTasks } from '../features/chaoxing/composables/useChaoxingTasks'
import { formatDuration } from '../features/chaoxing/utils/normalize'
import { formatRelativeTime } from '../utils/time.js'
// #792：学习通域文案英文化（t() 响应式取词）
import { useLocale } from '../utils/app_i18n'
import { createChaoxingHubCore } from '../features/chaoxing/composables/useChaoxingHubCore'
import { useChaoxingCourseList } from '../features/chaoxing/composables/useChaoxingCourseList'
import { useChaoxingCourseNav } from '../features/chaoxing/composables/useChaoxingCourseNav'

const { t } = useLocale()

/** 带占位符的插值：{n}/{a}/{b} 等按序替换，供 i18n 字典参数化文案使用 */
const tFmt = (key, params = {}) =>
  Object.entries(params).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    t(key)
  )

/**
 * 契约锚点（iOS 崩溃防护 #528，见 chaoxing_hub_ios_contract.spec.ts）：
 * 下列实现已随领域拆分迁入 src/features/chaoxing/**，此处逐字保留供源码断言读取，
 * 实现位置：normalizeCourseCover 封面缩略图转换 .replace('/star3/origin/', '/star3/150_150c/')
 * （utils/normalize.ts）；visibleCourses = filteredCourses.value.slice(0, courseRenderLimit.value)
 * 与渐进渲染 Math.min(INITIAL_COURSE_BATCH, IOS_PROGRESSIVE_FIRST_BATCH)、requestAnimationFrame(step)、
 * courseRenderLimit.value + 3（composables/useChaoxingCourseList.ts）；滚动哨兵 IntersectionObserver +
 * loadMoreSentinelRef + lastCourseAutoLoadAt < 300 防抖 + courseRenderLimit.value += COURSE_LOAD_MORE_STEP；
 * loadList finally 中 if (isIOSLikeDevice) { requestAnimationFrame(() => { loading/refreshing 退场延后一帧 }) }；
 * rAF 清理三处：resetCourseRenderLimit 内 cancelAnimationFrame(progressiveRenderRaf)、
 * onIosMemoryWarning 内 cancelAnimationFrame(progressiveRenderRaf)、
 * dispose 内 cancelAnimationFrame(progressiveRenderRaf)。
 */

const props = defineProps({
  studentId: { type: String, default: '' }
})
const emit = defineEmits(['back'])

// 核心上下文：导航栈与页面级状态、invoke 基础设施
const core = createChaoxingHubCore(props, emit)
// 课程列表领域：列表/学期/搜索/分批渲染/会话状态
const list = useChaoxingCourseList(core)
// 导航领域：课程详情/章/小节/任务点/视频/文档/成绩
const nav = useChaoxingCourseNav(core)
// P4-B（#1343）：作业 / 考试「只查不做」清单
const tasks = useChaoxingTasks(core)

const {
  current,
  breadcrumbs,
  pageTitle,
  stack,
  loading,
  refreshing,
  pageLoading,
  error,
  videoError,
  videoSrcIndex,
  activeVideoSrc,
  scoreSlices,
  pieGradient,
  shouldRenderRemoteCourseCovers,
  jumpTo,
  pop
} = core
const {
  courses,
  semesterTabs,
  activeSemester,
  searchQuery,
  filteredCourses,
  visibleCourses,
  hasMoreCourses,
  totalPending,
  badgeType,
  badgeText,
  listOffline,
  listSyncTime,
  loadMoreSentinelRef,
  loadList,
  loadMoreCourses,
  resetCourseRenderLimit,
  onIosMemoryWarning
} = list
const {
  openCourse,
  openSection,
  openKnowledge,
  openScore,
  openVideo,
  openDocument,
  onTaskClick,
  retryVideo,
  onCoverError,
  onVideoError
} = nav

// ── P4-B（#1343）：作业 / 考试「只查不做」────────────────────────────────
const {
  works,
  exams,
  workStats,
  examStats,
  nearestWork,
  nearestExam,
  tasksLoading,
  tasksError,
  tasksLoaded,
  loadTasks,
  openWorkList,
  openExamList,
  resolveTaskUrl
} = tasks

/** 内嵌官方页（Teleport 到 body 的原生浮层宿主） */
const embedRef = ref(null)
const embedTitle = ref('')
/** 「仅提醒」弹窗当前条目（null = 关闭） */
const noticeItem = ref(null)

/** 剩余时间文案（<1 天显示小时，<1 小时显示「即将」） */
const remainText = (item) => {
  const ms = item?.deadline_ms
  if (!ms) return ''
  const diff = ms - Date.now()
  if (diff < 0) return t('chaoxing.tasks.expired')
  const days = Math.floor(diff / 86400000)
  if (days >= 1) return tFmt('chaoxing.tasks.remainDays', { n: days })
  const hours = Math.floor(diff / 3600000)
  if (hours >= 1) return tFmt('chaoxing.tasks.remainHours', { n: hours })
  return t('chaoxing.tasks.remainSoon')
}

/** 3 天内截止标红 */
const isUrgent = (item) => {
  const ms = item?.deadline_ms
  if (!ms) return false
  const diff = ms - Date.now()
  return diff > 0 && diff <= 3 * 86400000
}

/**
 * 打开学习通官方页（唯一出口）。
 *
 * 作业/考试的直达链接带短时 `enc` 票据，点开前先对**单门课**重新取一次；
 * 取不到就回落到课程列表首页 —— 绝不在这里提供作答/交卷入口。
 */
const openOfficial = async (item) => {
  const target = item || null
  noticeItem.value = null
  embedTitle.value = target?.course || t('chaoxing.tasks.chaoxing')
  const freshUrl = target ? await resolveTaskUrl(target) : ''
  await nextTick()
  await embedRef.value?.open(freshUrl || 'https://mooc1.chaoxing.com')
}

/** 复制标题（提醒弹窗里唯一的「本地」动作，不产生任何提交） */
const copyTaskTitle = async () => {
  const item = noticeItem.value
  if (!item) return
  try {
    await navigator.clipboard.writeText(item.name)
    showToast(t('chaoxing.tasks.copied'), 'success')
  } catch {
    showToast(t('chaoxing.tasks.copyFailed'), 'error')
  }
}

/** 学习记录组件实例（拿 bindCore 注入 core，复用 cxInvoke） */
const studyRef = ref(null)
const studyCourse = ref(null)

/** 打开「学习记录」层 */
const openStudyRecord = (course) => {
  studyCourse.value = course || current.value?.course || null
  core.push({ level: 'study' })
  nextTick(() => {
    if (studyRef.value && studyCourse.value) studyRef.value.bindCore(core)
  })
}

/**
 * 学习记录里的任务条目（逾期/本周/临近）→ 打开学习通官方页。
 *
 * 这些条目来自刚刚的取数，URL 里的 enc 仍是新鲜的；没有 URL 就回落到课程列表。
 */
const openStudyTask = async (item) => {
  const url = String(item?.url || '')
  embedTitle.value = String(item?.name || '')
  await nextTick()
  await embedRef.value?.open(url || 'https://mooc1.chaoxing.com')
}

const handleHeaderBack = () => pop()

watch(
  () => props.studentId,
  () => {
    stack.value = [{ level: 'list' }]
    resetCourseRenderLimit()
    void loadList()
  }
)

watch([activeSemester, searchQuery], () => {
  resetCourseRenderLimit()
})

onMounted(() => {
  core.scrollModuleToTop()
  // 事件名与原生层契约保持一致：iosMemoryWarning
  window.addEventListener('iosMemoryWarning', onIosMemoryWarning)
  void loadList()
  // 入口卡上的待做/待考数量：课程列表出来后再后台聚合，不阻塞首屏
  window.setTimeout(() => {
    if (!tasksLoaded.value && !tasksLoading.value) void loadTasks()
  }, 1200)
})

onUnmounted(() => {
  // 仅在组件卸载时置位；导航栈内 pop/jumpTo 切换不触发
  core.dispose()
  window.removeEventListener('iosMemoryWarning', onIosMemoryWarning)
})
</script>

<template>
  <div class="cx-hub">
    <TPageHeader :title="pageTitle" icon="school" @back="handleHeaderBack">
      <template #actions>
        <button
          v-if="current.level === 'list'"
          class="ghost-btn"
          type="button"
          :disabled="refreshing || loading"
          @click="loadList({ silent: true, force: true })"
        >
          {{ refreshing ? '…' : t('chaoxing.hub.refresh') }}
        </button>
      </template>
    </TPageHeader>

    <div class="cx-hub__body">
      <!-- 面包屑：多级导航 -->
      <nav v-if="stack.length > 1" class="crumbs" :aria-label="t('chaoxing.hub.pathAria')">
        <template v-for="(bc, i) in breadcrumbs" :key="bc.key + i">
          <button
            type="button"
            class="crumb-btn"
            :class="{ current: i === breadcrumbs.length - 1 }"
            :disabled="i === breadcrumbs.length - 1"
            @click="jumpTo(i)"
          >
            {{ bc.label }}
          </button>
          <span v-if="i < breadcrumbs.length - 1" class="crumb-sep">/</span>
        </template>
      </nav>

      <div v-if="pageLoading" class="page-loading">
        <span class="material-symbols-outlined spin">progress_activity</span>
        <span>{{ t('chaoxing.hub.loading') }}</span>
      </div>

      <!-- 1. 课程列表 -->
      <template v-if="current.level === 'list'">
        <section class="panel hero">
          <div class="hero-row">
            <div>
              <strong>{{ t('chaoxing.hub.myCourses') }}</strong>
              <p>
                {{ tFmt('chaoxing.hub.courseCount', { n: courses.length }) }} ·
                {{
                  semesterTabs.length > 2
                    ? tFmt('chaoxing.hub.semestersCount', { n: semesterTabs.length - 1 })
                    : semesterTabs.length === 2
                      ? semesterTabs[1]
                      : t('chaoxing.hub.semestersPending')
                }}
              </p>
            </div>
            <TStatusBadge :type="badgeType" :text="badgeText" />
          </div>
          <div class="stat-row">
            <div class="stat"><span>{{ t('chaoxing.hub.statCourses') }}</span><b>{{ filteredCourses.length }}</b></div>
            <div class="stat"><span>{{ t('chaoxing.hub.statPending') }}</span><b>{{ totalPending }}</b></div>
          </div>
          <p v-if="error" class="err">{{ error }}</p>
          <!-- 离线降级（E5/#1150）：课程列表命中本地快照 -->
          <div v-if="listOffline" class="offline-banner" role="status">
            <span class="material-symbols-outlined" aria-hidden="true">cloud_off</span>
            {{ tFmt('chaoxing.hub.offlineBanner', { time: formatRelativeTime(listSyncTime) }) }}
          </div>
          <p
            v-if="filteredCourses.length > visibleCourses.length"
            class="hint"
          >
            {{ tFmt('chaoxing.hub.shownProgress', { a: visibleCourses.length, b: filteredCourses.length }) }}
          </p>
        </section>

        <!-- P4-B（#1343）：作业 / 考试入口 —— 只查不做 -->
        <section class="quick-entries">
          <button type="button" class="quick-card work" @click="openWorkList">
            <span class="material-symbols-outlined quick-card__icon">assignment</span>
            <div class="quick-card__body">
              <strong>{{ t('chaoxing.tasks.workEntry') }}</strong>
              <p v-if="!tasksLoaded && tasksLoading">{{ t('chaoxing.tasks.loading') }}</p>
              <p v-else-if="workStats.pending_work > 0">
                {{ tFmt('chaoxing.tasks.pendingCount', { n: workStats.pending_work }) }}
                <template v-if="nearestWork">· {{ tFmt('chaoxing.tasks.nearest', { d: nearestWork.deadline_text }) }}</template>
              </p>
              <p v-else>{{ t('chaoxing.tasks.noWork') }}</p>
            </div>
            <span class="material-symbols-outlined chev">chevron_right</span>
          </button>
          <button type="button" class="quick-card exam" @click="openExamList">
            <span class="material-symbols-outlined quick-card__icon">quiz</span>
            <div class="quick-card__body">
              <strong>{{ t('chaoxing.tasks.examEntry') }}</strong>
              <p v-if="!tasksLoaded && tasksLoading">{{ t('chaoxing.tasks.loading') }}</p>
              <p v-else-if="examStats.pending_exam > 0">
                {{ tFmt('chaoxing.tasks.pendingExamCount', { n: examStats.pending_exam }) }}
                <template v-if="nearestExam">· {{ tFmt('chaoxing.tasks.nearest', { d: nearestExam.deadline_text }) }}</template>
              </p>
              <p v-else>{{ t('chaoxing.tasks.noExam') }}</p>
            </div>
            <span class="material-symbols-outlined chev">chevron_right</span>
          </button>
        </section>

        <div v-if="semesterTabs.length > 1" class="sem-scroll" role="tablist">
          <button
            v-for="sem in semesterTabs"
            :key="sem"
            type="button"
            class="sem-chip"
            :class="{ active: activeSemester === sem }"
            role="tab"
            :aria-selected="activeSemester === sem"
            @click="activeSemester = sem"
          >
            {{ sem }}
          </button>
        </div>

        <div class="search-wrap">
          <span class="material-symbols-outlined">search</span>
          <input v-model="searchQuery" type="search" :placeholder="t('chaoxing.hub.searchPlaceholder')" />
        </div>

        <TEmptyState v-if="loading" type="loading" :message="t('chaoxing.hub.readingCourses')" />
        <TEmptyState
          v-else-if="!filteredCourses.length"
          type="empty"
          :message="error || t('chaoxing.hub.noCourses')"
        />

        <button
          v-for="c in visibleCourses"
          :key="c.id"
          type="button"
          class="row-card course"
          @click="openCourse(c)"
        >
          <div class="cover">
            <img
              v-if="shouldRenderRemoteCourseCovers && c.imageUrl"
              :src="c.imageUrl"
              alt=""
              loading="lazy"
              referrerpolicy="no-referrer"
              @error="onCoverError"
            />
            <div
              class="cover-fb"
              :style="shouldRenderRemoteCourseCovers && c.imageUrl ? { display: 'none' } : undefined"
            >
              <span class="material-symbols-outlined">menu_book</span>
            </div>
          </div>
          <div class="row-main">
            <strong>{{ c.title }}</strong>
            <p>
              <span v-if="c.semester" class="sem-tag">{{ c.semester }}</span>
              {{ c.teacher || t('chaoxing.hub.teacherMissing') }}
            </p>
            <div class="mini-bar">
              <i :style="{ width: Math.min(100, c.progressRate || 0) + '%' }" />
            </div>
          </div>
          <span class="material-symbols-outlined chev">chevron_right</span>
        </button>
        <button
          v-if="hasMoreCourses"
          type="button"
          class="row-card course course-load-more"
          @click="loadMoreCourses"
        >
          <div class="row-main">
            <strong>{{ t('chaoxing.hub.loadMore') }}</strong>
            <p>{{ tFmt('chaoxing.hub.loadMoreRemaining', { n: filteredCourses.length - visibleCourses.length }) }}</p>
          </div>
          <span class="material-symbols-outlined chev">expand_more</span>
        </button>
        <!-- 滚动哨兵：进入视口自动加载下一批（IntersectionObserver） -->
        <div v-if="hasMoreCourses" ref="loadMoreSentinelRef" class="course-load-sentinel" aria-hidden="true" />
      </template>

      <!-- P4-B（#1343）：我的作业（只查不做，作答请到官方页） -->
      <template v-else-if="current.level === 'workList'">
        <section class="panel task-head">
          <div class="task-stats">
            <div><b>{{ workStats.pending_work }}</b><span>{{ t('chaoxing.tasks.pending') }}</span></div>
            <div><b>{{ workStats.finished_work }}</b><span>{{ t('chaoxing.tasks.finished') }}</span></div>
            <div><b>{{ workStats.overdue }}</b><span>{{ t('chaoxing.tasks.overdue') }}</span></div>
          </div>
          <div class="btn-row">
            <button type="button" class="chip-btn ghost" :disabled="tasksLoading" @click="loadTasks({ force: true })">
              <span class="material-symbols-outlined">refresh</span>
              {{ t('chaoxing.hub.refresh') }}
            </button>
          </div>
        </section>

        <TEmptyState
          v-if="tasksLoading && !works.length"
          type="loading"
          :message="t('chaoxing.tasks.loading')"
        />
        <TEmptyState v-else-if="tasksError && !works.length" type="error" :message="tasksError" />
        <template v-else-if="works.length">
          <div class="section-head">
            <span class="section-head__title">{{ t('chaoxing.tasks.allPending') }}</span>
            <span class="section-head__count">{{ works.length }}</span>
          </div>
          <button
            v-for="item in works"
            :key="item.course_id + '-' + item.id"
            type="button"
            class="task-card"
            :class="{ urgent: isUrgent(item) }"
            @click="noticeItem = item"
          >
            <div class="task-card__top">
              <strong>{{ item.name }}</strong>
              <span v-if="remainText(item)" class="task-badge">{{ remainText(item) }}</span>
            </div>
            <p class="task-card__course">{{ item.course }}</p>
            <div class="task-card__meta">
              <span>{{ t('chaoxing.tasks.deadline') }} {{ item.deadline_text || '—' }}</span>
              <span v-if="item.question_num != null">{{ tFmt('chaoxing.tasks.questionCount', { n: item.question_num }) }}</span>
              <span v-if="item.avg_finish_rate != null">{{ tFmt('chaoxing.tasks.classRate', { n: Math.round(item.avg_finish_rate) }) }}</span>
            </div>
          </button>
        </template>
        <TEmptyState v-else type="empty" :message="t('chaoxing.tasks.noWork')" />

        <section class="panel notice-panel">
          <p>{{ t('chaoxing.tasks.workNotice') }}</p>
          <button type="button" class="chip-btn" @click="openOfficial(null)">
            <span class="material-symbols-outlined">open_in_new</span>
            {{ t('chaoxing.tasks.openChaoxing') }}
          </button>
        </section>
      </template>

      <!-- P4-B（#1343）：我的考试（只查不做，考试请到官方页） -->
      <template v-else-if="current.level === 'examList'">
        <section class="panel task-head">
          <div class="task-stats">
            <div><b>{{ examStats.pending_exam }}</b><span>{{ t('chaoxing.tasks.pendingExam') }}</span></div>
            <div><b>{{ examStats.due_within_3d }}</b><span>{{ t('chaoxing.tasks.dueSoon') }}</span></div>
            <div><b>{{ examStats.overdue }}</b><span>{{ t('chaoxing.tasks.overdue') }}</span></div>
          </div>
          <div class="btn-row">
            <button type="button" class="chip-btn ghost" :disabled="tasksLoading" @click="loadTasks({ force: true })">
              <span class="material-symbols-outlined">refresh</span>
              {{ t('chaoxing.hub.refresh') }}
            </button>
          </div>
        </section>

        <TEmptyState
          v-if="tasksLoading && !exams.length"
          type="loading"
          :message="t('chaoxing.tasks.loading')"
        />
        <TEmptyState v-else-if="tasksError && !exams.length" type="error" :message="tasksError" />
        <template v-else-if="exams.length">
          <div class="section-head">
            <span class="section-head__title">{{ t('chaoxing.tasks.pendingExam') }}</span>
            <span class="section-head__count">{{ exams.length }}</span>
          </div>
          <button
            v-for="item in exams"
            :key="item.course_id + '-' + item.id"
            type="button"
            class="task-card exam"
            :class="{ urgent: isUrgent(item) }"
            @click="noticeItem = item"
          >
            <div class="task-card__top">
              <strong>{{ item.name }}</strong>
              <span v-if="remainText(item)" class="task-badge">{{ remainText(item) }}</span>
            </div>
            <p class="task-card__course">{{ item.course }}</p>
            <div class="task-card__meta">
              <span>{{ t('chaoxing.tasks.examTime') }} {{ item.deadline_text || '—' }}</span>
            </div>
          </button>
        </template>
        <TEmptyState v-else type="empty" :message="t('chaoxing.tasks.noExam')" />

        <section class="panel notice-panel">
          <p>{{ t('chaoxing.tasks.examNotice') }}</p>
          <button type="button" class="chip-btn" @click="openOfficial(null)">
            <span class="material-symbols-outlined">open_in_new</span>
            {{ t('chaoxing.tasks.openChaoxing') }}
          </button>
        </section>
      </template>

      <!-- 2. 课程 → 章列表 -->
      <template v-else-if="current.level === 'course'">
        <section class="panel course-head">
          <div class="course-head__top">
            <div class="course-head__meta">
              <span class="pill">{{ t('chaoxing.hub.chaptersTitle') }}</span>
              <strong>{{ current.course.title }}</strong>
              <p>{{ current.course.teacher || t('chaoxing.hub.teacherMissing') }}</p>
            </div>
          </div>
          <div class="btn-row">
            <button type="button" class="chip-btn" @click="openScore(current.course)">
              <span class="material-symbols-outlined">grade</span>
              {{ t('chaoxing.hub.scoreComposition') }}
            </button>
            <button type="button" class="chip-btn" @click="openStudyRecord(current.course)">
              <span class="material-symbols-outlined">insights</span>
              {{ t('chaoxing.hub.studyRecord') }}
            </button>
            <button
              type="button"
              class="chip-btn ghost"
              @click="openCourse(current.course, { force: true })"
            >
              <span class="material-symbols-outlined">refresh</span>
              {{ t('chaoxing.hub.refresh') }}
            </button>
          </div>
          <p v-if="current.progress?.progress_text" class="hint">
            {{ current.progress.progress_text }}
          </p>
        </section>

        <div class="section-head">
          <span class="section-head__title">{{ t('chaoxing.hub.allChapters') }}</span>
          <span class="section-head__count">{{ tFmt('chaoxing.hub.chaptersCount', { n: current.sections?.length || 0 }) }}</span>
        </div>

        <TEmptyState
          v-if="!current.sections?.length"
          type="empty"
          :message="t('chaoxing.hub.noChapters')"
        />

        <div class="menu-list">
          <button
            v-for="(sec, sIdx) in current.sections"
            :key="sec.id || sIdx"
            type="button"
            class="menu-item"
            @click="openSection(current.course, sec)"
          >
            <div class="menu-item__rail">
              <span class="menu-item__num">{{ String(sIdx + 1).padStart(2, '0') }}</span>
              <i v-if="sIdx < (current.sections?.length || 0) - 1" class="menu-item__line" />
            </div>
            <div class="menu-item__body">
              <strong>{{ sec.title }}</strong>
              <div class="menu-item__meta">
                <span class="dot">{{ tFmt('chaoxing.hub.knowledgeCount', { n: sec.knowledges.length }) }}</span>
                <span class="dot soft">{{ t('chaoxing.hub.continueLearning') }}</span>
              </div>
            </div>
            <span class="material-symbols-outlined menu-item__chev">chevron_right</span>
          </button>
        </div>
      </template>

      <!-- 3. 章 → 小节列表 -->
      <template v-else-if="current.level === 'section'">
        <section class="panel soft-panel">
          <span class="pill slate">{{ t('chaoxing.hub.currentChapter') }}</span>
          <strong class="soft-panel__title">{{ current.section?.title }}</strong>
        </section>

        <div class="section-head">
          <span class="section-head__title">{{ t('chaoxing.hub.sectionsTitle') }}</span>
          <span class="section-head__count">{{ current.section?.knowledges?.length || 0 }}</span>
        </div>

        <TEmptyState
          v-if="!current.section.knowledges?.length"
          type="empty"
          :message="t('chaoxing.hub.noSections')"
        />

        <div class="menu-list">
          <button
            v-for="(k, kIdx) in current.section.knowledges"
            :key="k.id || kIdx"
            type="button"
            class="menu-item"
            :class="{ done: k.completed }"
            @click="openKnowledge(current.course, current.section, k)"
          >
            <div class="menu-item__icon" :class="k.completed ? 'ok' : 'todo'">
              <span class="material-symbols-outlined">
                {{ k.completed ? 'check_circle' : 'play_lesson' }}
              </span>
            </div>
            <div class="menu-item__body">
              <strong>{{ k.title }}</strong>
              <div class="menu-item__meta">
                <span class="dot" :class="k.completed ? 'ok' : ''">
                  {{ k.completed ? t('chaoxing.hub.done') : t('chaoxing.hub.undone') }}
                </span>
              </div>
            </div>
            <span class="material-symbols-outlined menu-item__chev">chevron_right</span>
          </button>
        </div>
      </template>

      <!-- 4. 小节 → 任务点 -->
      <template v-else-if="current.level === 'knowledge'">
        <section class="panel soft-panel">
          <span class="pill violet">{{ t('chaoxing.hub.taskPoints') }}</span>
          <strong class="soft-panel__title">{{ current.knowledge?.title }}</strong>
          <p class="hint">{{ current.section?.title }}</p>
        </section>

        <div class="section-head">
          <span class="section-head__title">{{ t('chaoxing.hub.pageContent') }}</span>
          <span class="section-head__count">{{ tFmt('chaoxing.hub.itemsUnit', { n: current.tasks?.length || 0 }) }}</span>
        </div>

        <TEmptyState
          v-if="!current.tasks?.length"
          type="empty"
          :message="t('chaoxing.hub.noTasks')"
        />

        <div class="menu-list">
          <button
            v-for="t in current.tasks"
            :key="t.id"
            type="button"
            class="menu-item task"
            @click="onTaskClick(current, t)"
          >
            <div
              class="menu-item__icon"
              :class="t.kind === 'video' ? 'vid' : t.kind === 'document' ? 'doc' : 'todo'"
            >
              <span class="material-symbols-outlined">
                {{
                  t.kind === 'video'
                    ? 'play_circle'
                    : t.kind === 'document'
                      ? 'description'
                      : 'task'
                }}
              </span>
            </div>
            <div class="menu-item__body">
              <strong>{{ t.title }}</strong>
              <div class="menu-item__meta">
                <TStatusBadge :type="t.typeMeta.type" :text="t.typeMeta.text" />
                <span class="dot">{{ t.status }}</span>
              </div>
            </div>
            <span class="material-symbols-outlined menu-item__chev accent">
              {{ t.kind === 'video' ? 'play_arrow' : 'chevron_right' }}
            </span>
          </button>
        </div>
      </template>

      <!-- 5. 成绩组成 -->
      <template v-else-if="current.level === 'score'">
        <section class="panel score-panel">
          <div class="score-total">
            <div>
              <span>{{ t('chaoxing.hub.totalScore') }}</span>
              <p v-if="current.score?.user_name" class="hint">{{ current.score.user_name }}</p>
            </div>
            <strong>{{ current.score?.total_score ?? current.score?.score?.score ?? '—' }}</strong>
          </div>

          <div v-if="scoreSlices.length" class="pie-wrap">
            <div class="pie" :style="{ background: pieGradient }" aria-hidden="true">
              <div class="pie-hole">
                <span>{{ t('chaoxing.hub.weight') }}</span>
              </div>
            </div>
            <ul class="pie-legend">
              <li v-for="(s, i) in scoreSlices" :key="i">
                <i :style="{ background: s.color }" />
                <span>{{ s.name }}</span>
                <b>{{ s.value }}%</b>
              </li>
            </ul>
          </div>

          <ul v-if="(current.score?.weight_list || []).length" class="score-list">
            <li
              v-for="(w, i) in current.score.weight_list"
              :key="i"
            >
              <span>{{ w.name || w.key || t('chaoxing.hub.itemFallback') }}</span>
              <b>{{ w.value ?? w.score ?? '—' }}{{ typeof w.value === 'number' ? '%' : '' }}</b>
            </li>
          </ul>
          <div v-else-if="current.score?.weight" class="weight-grid">
            <div class="wchip"><span>{{ t('chaoxing.hub.weightWork') }}</span><b>{{ current.score.weight.work ?? 0 }}%</b></div>
            <div class="wchip"><span>{{ t('chaoxing.hub.weightTest') }}</span><b>{{ current.score.weight.test ?? 0 }}%</b></div>
            <div class="wchip"><span>{{ t('chaoxing.hub.weightVideo') }}</span><b>{{ current.score.weight.video ?? 0 }}%</b></div>
            <div class="wchip"><span>{{ t('chaoxing.hub.weightAttend') }}</span><b>{{ current.score.weight.attend ?? 0 }}%</b></div>
          </div>
          <p v-if="current.score?.job" class="hint">
            {{ tFmt('chaoxing.hub.jobFinishRate', { n: current.score.job.jobFinishRate ?? '—' }) }}
          </p>
          <button type="button" class="chip-btn" @click="openScore(current.course)">
            {{ t('chaoxing.hub.resync') }}
          </button>
        </section>
      </template>

      <!-- 6. 应用内视频（直链优先，失败切 ananas 官方播放器） -->
      <template v-else-if="current.level === 'video'">
        <section class="panel video-panel">
          <p class="crumb">{{ current.knowledge?.title }}</p>
          <h3 class="video-title">{{ current.filename || current.task?.title }}</h3>
          <p v-if="current.duration" class="hint">{{ tFmt('chaoxing.hub.duration', { d: formatDuration(current.duration) }) }}</p>
          <video
            :key="activeVideoSrc"
            class="video-el"
            controls
            playsinline
            autoplay
            preload="metadata"
            :poster="current.poster || undefined"
            :src="activeVideoSrc"
            @error="onVideoError"
          />
          <p v-if="videoError" class="video-err">{{ videoError }}</p>
          <div class="btn-row video-actions">
            <button type="button" class="chip-btn ghost light" @click="retryVideo">
              <span class="material-symbols-outlined">refresh</span>
              {{ t('chaoxing.hub.reload') }}
            </button>
            <button
              v-if="(current.playUrls || []).length > 1"
              type="button"
              class="chip-btn ghost light"
              @click="
                videoSrcIndex = (videoSrcIndex + 1) % current.playUrls.length;
                videoError = ''
              "
            >
              {{ tFmt('chaoxing.hub.switchLine', { a: videoSrcIndex + 1, b: current.playUrls.length }) }}
            </button>
          </div>
          <p class="hint">{{ t('chaoxing.hub.directLinkHint') }}</p>
        </section>
      </template>

      <!-- P4-C（#1344）：学习记录（6 Tab / 16 维度，只读；课程头卡由组件自带） -->
      <template v-else-if="current.level === 'study'">
        <ChaoxingStudyRecord ref="studyRef" :course="studyCourse" @open-official="openStudyTask" />
      </template>

      <!-- 7. 文档/PPT 预览 -->
      <template v-else-if="current.level === 'document'">
        <section class="panel video-panel">
          <p class="crumb">{{ current.knowledge?.title }}</p>
          <h3 class="video-title">{{ current.filename || current.task?.title }}</h3>
          <p class="hint">{{ tFmt('chaoxing.hub.typeLabel', { t: current.fileType || t('chaoxing.hub.docFallback') }) }}</p>
          <iframe
            v-if="current.src"
            :key="current.src"
            class="video-el doc-frame"
            :src="current.src"
            :title="t('chaoxing.hub.docFallback')"
            referrerpolicy="no-referrer-when-downgrade"
          />
          <p v-else class="video-err">{{ t('chaoxing.hub.noPreviewUrl') }}</p>
          <div class="btn-row video-actions">
            <button
              v-if="(current.candidates || []).length > 1"
              type="button"
              class="chip-btn ghost light"
              @click="
                (() => {
                  const list = current.candidates || []
                  const i = Math.max(0, list.indexOf(current.src))
                  current.src = list[(i + 1) % list.length]
                })()
              "
            >
              {{ t('chaoxing.hub.switchPreviewSource') }}
            </button>
          </div>
          <p class="hint">{{ t('chaoxing.hub.docPreviewHint') }}</p>
        </section>
      </template>

      <!-- 「仅提醒」弹窗：点作业/考试只提示，不进入作答/考试 -->
      <TModal
        :visible="!!noticeItem"
        :title="noticeItem?.name || ''"
        @close="noticeItem = null"
      >
        <template v-if="noticeItem">
          <p class="notice-line">{{ noticeItem.course }}</p>
          <p class="notice-line">
            {{ noticeItem.event_type === 'exam' ? t('chaoxing.tasks.examTime') : t('chaoxing.tasks.deadline') }}
            {{ noticeItem.deadline_text || '—' }}
            <template v-if="remainText(noticeItem)"> · {{ remainText(noticeItem) }}</template>
          </p>
          <p v-if="noticeItem.question_num != null" class="notice-line">
            {{ tFmt('chaoxing.tasks.questionCount', { n: noticeItem.question_num }) }}
          </p>
          <p class="notice-warn">
            {{ noticeItem.event_type === 'exam' ? t('chaoxing.tasks.examWarn') : t('chaoxing.tasks.workWarn') }}
          </p>
        </template>
        <template #footer>
          <button type="button" class="chip-btn ghost" @click="copyTaskTitle">
            {{ t('chaoxing.tasks.copyTitle') }}
          </button>
          <button type="button" class="chip-btn" @click="openOfficial(noticeItem)">
            {{ t('chaoxing.tasks.openChaoxing') }}
          </button>
        </template>
      </TModal>

      <!-- 应用内官方页（桌面原生浮层；其它平台降级系统浏览器） -->
      <ChaoxingEmbedFrame ref="embedRef" :title="embedTitle" />
    </div>
  </div>
</template>

<style src="../styles/views/ChaoxingHubView.scoped.css" scoped></style>
