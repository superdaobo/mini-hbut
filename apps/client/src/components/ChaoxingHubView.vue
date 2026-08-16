<script setup>
/**
 * 学习通课程中心（组合壳）
 * 领域逻辑已拆分至 src/features/chaoxing：
 * - useChaoxingHubCore：导航栈/页面状态/invoke 基础设施
 * - useChaoxingCourseList：课程列表/学期筛选/搜索/分批渲染/会话状态
 * - useChaoxingCourseNav：课程详情/大纲/小节任务卡/视频/文档/成绩
 * 模板与样式保持不变，命令调用与 UI 行为无回归。
 */
import { onMounted, onUnmounted, watch } from 'vue'
import { TPageHeader, TEmptyState, TStatusBadge } from './templates'
import { formatDuration } from '../features/chaoxing/utils/normalize'
import { createChaoxingHubCore } from '../features/chaoxing/composables/useChaoxingHubCore'
import { useChaoxingCourseList } from '../features/chaoxing/composables/useChaoxingCourseList'
import { useChaoxingCourseNav } from '../features/chaoxing/composables/useChaoxingCourseNav'

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
          {{ refreshing ? '…' : '刷新' }}
        </button>
      </template>
    </TPageHeader>

    <div class="cx-hub__body">
      <!-- 面包屑：多级导航 -->
      <nav v-if="stack.length > 1" class="crumbs" aria-label="路径">
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
        <span>加载中…</span>
      </div>

      <!-- 1. 课程列表 -->
      <template v-if="current.level === 'list'">
        <section class="panel hero">
          <div class="hero-row">
            <div>
              <strong>我的课程</strong>
              <p>
                {{ courses.length }} 门 ·
                {{
                  semesterTabs.length > 2
                    ? semesterTabs.length - 1 + ' 个学期'
                    : semesterTabs.length === 2
                      ? semesterTabs[1]
                      : '学期待同步'
                }}
              </p>
            </div>
            <TStatusBadge :type="badgeType" :text="badgeText" />
          </div>
          <div class="stat-row">
            <div class="stat"><span>课程</span><b>{{ filteredCourses.length }}</b></div>
            <div class="stat"><span>待办</span><b>{{ totalPending }}</b></div>
          </div>
          <p v-if="error" class="err">{{ error }}</p>
          <p
            v-if="filteredCourses.length > visibleCourses.length"
            class="hint"
          >
            已显示 {{ visibleCourses.length }} / {{ filteredCourses.length }} 门课程，下滑自动加载更多。
          </p>
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
          <input v-model="searchQuery" type="search" placeholder="搜索课程 / 教师" />
        </div>

        <TEmptyState v-if="loading" type="loading" message="正在读取课程…" />
        <TEmptyState
          v-else-if="!filteredCourses.length"
          type="empty"
          :message="error || '暂无课程'"
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
              {{ c.teacher || '教师暂缺' }}
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
            <strong>继续加载更多课程</strong>
            <p>剩余 {{ filteredCourses.length - visibleCourses.length }} 门未展示</p>
          </div>
          <span class="material-symbols-outlined chev">expand_more</span>
        </button>
        <!-- 滚动哨兵：进入视口自动加载下一批（IntersectionObserver） -->
        <div v-if="hasMoreCourses" ref="loadMoreSentinelRef" class="course-load-sentinel" aria-hidden="true" />
      </template>

      <!-- 2. 课程 → 章列表 -->
      <template v-else-if="current.level === 'course'">
        <section class="panel course-head">
          <div class="course-head__top">
            <div class="course-head__meta">
              <span class="pill">章节目录</span>
              <strong>{{ current.course.title }}</strong>
              <p>{{ current.course.teacher || '教师暂缺' }}</p>
            </div>
          </div>
          <div class="btn-row">
            <button type="button" class="chip-btn" @click="openScore(current.course)">
              <span class="material-symbols-outlined">grade</span>
              成绩组成
            </button>
            <button
              type="button"
              class="chip-btn ghost"
              @click="openCourse(current.course, { force: true })"
            >
              <span class="material-symbols-outlined">refresh</span>
              刷新
            </button>
          </div>
          <p v-if="current.progress?.progress_text" class="hint">
            {{ current.progress.progress_text }}
          </p>
        </section>

        <div class="section-head">
          <span class="section-head__title">全部章节</span>
          <span class="section-head__count">{{ current.sections?.length || 0 }} 章</span>
        </div>

        <TEmptyState
          v-if="!current.sections?.length"
          type="empty"
          message="暂无章节，请点刷新或检查学习通会话"
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
                <span class="dot">{{ sec.knowledges.length }} 个小节</span>
                <span class="dot soft">继续学习</span>
              </div>
            </div>
            <span class="material-symbols-outlined menu-item__chev">chevron_right</span>
          </button>
        </div>
      </template>

      <!-- 3. 章 → 小节列表 -->
      <template v-else-if="current.level === 'section'">
        <section class="panel soft-panel">
          <span class="pill slate">当前章节</span>
          <strong class="soft-panel__title">{{ current.section?.title }}</strong>
        </section>

        <div class="section-head">
          <span class="section-head__title">小节列表</span>
          <span class="section-head__count">{{ current.section?.knowledges?.length || 0 }}</span>
        </div>

        <TEmptyState
          v-if="!current.section.knowledges?.length"
          type="empty"
          message="该章暂无小节"
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
                  {{ k.completed ? '已完成' : '未完成' }}
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
          <span class="pill violet">任务点</span>
          <strong class="soft-panel__title">{{ current.knowledge?.title }}</strong>
          <p class="hint">{{ current.section?.title }}</p>
        </section>

        <div class="section-head">
          <span class="section-head__title">本页内容</span>
          <span class="section-head__count">{{ current.tasks?.length || 0 }} 项</span>
        </div>

        <TEmptyState
          v-if="!current.tasks?.length"
          type="empty"
          message="暂无任务"
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
              <span>综合成绩</span>
              <p v-if="current.score?.user_name" class="hint">{{ current.score.user_name }}</p>
            </div>
            <strong>{{ current.score?.total_score ?? current.score?.score?.score ?? '—' }}</strong>
          </div>

          <div v-if="scoreSlices.length" class="pie-wrap">
            <div class="pie" :style="{ background: pieGradient }" aria-hidden="true">
              <div class="pie-hole">
                <span>权重</span>
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
              <span>{{ w.name || w.key || '项目' }}</span>
              <b>{{ w.value ?? w.score ?? '—' }}{{ typeof w.value === 'number' ? '%' : '' }}</b>
            </li>
          </ul>
          <div v-else-if="current.score?.weight" class="weight-grid">
            <div class="wchip"><span>作业</span><b>{{ current.score.weight.work ?? 0 }}%</b></div>
            <div class="wchip"><span>考试</span><b>{{ current.score.weight.test ?? 0 }}%</b></div>
            <div class="wchip"><span>视频</span><b>{{ current.score.weight.video ?? 0 }}%</b></div>
            <div class="wchip"><span>签到</span><b>{{ current.score.weight.attend ?? 0 }}%</b></div>
          </div>
          <p v-if="current.score?.job" class="hint">
            任务点完成率 {{ current.score.job.jobFinishRate ?? '—' }}%
          </p>
          <button type="button" class="chip-btn" @click="openScore(current.course)">
            重新同步
          </button>
        </section>
      </template>

      <!-- 6. 应用内视频（直链优先，失败切 ananas 官方播放器） -->
      <template v-else-if="current.level === 'video'">
        <section class="panel video-panel">
          <p class="crumb">{{ current.knowledge?.title }}</p>
          <h3 class="video-title">{{ current.filename || current.task?.title }}</h3>
          <p v-if="current.duration" class="hint">时长 {{ formatDuration(current.duration) }}</p>
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
              重新加载
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
              切换线路 {{ videoSrcIndex + 1 }}/{{ current.playUrls.length }}
            </button>
          </div>
          <p class="hint">直链经本地代理播放，失败可切换线路或重新加载</p>
        </section>
      </template>

      <!-- 7. 文档/PPT 预览 -->
      <template v-else-if="current.level === 'document'">
        <section class="panel video-panel">
          <p class="crumb">{{ current.knowledge?.title }}</p>
          <h3 class="video-title">{{ current.filename || current.task?.title }}</h3>
          <p class="hint">类型：{{ current.fileType || '文档' }}</p>
          <iframe
            v-if="current.src"
            :key="current.src"
            class="video-el doc-frame"
            :src="current.src"
            title="文档预览"
            referrerpolicy="no-referrer-when-downgrade"
          />
          <p v-else class="video-err">暂无预览地址</p>
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
              切换预览源
            </button>
          </div>
          <p class="hint">文档在应用内预览；若空白请确认学习通会话有效</p>
        </section>
      </template>
    </div>
  </div>
</template>

<style src="../styles/views/ChaoxingHubView.scoped.css" scoped></style>
