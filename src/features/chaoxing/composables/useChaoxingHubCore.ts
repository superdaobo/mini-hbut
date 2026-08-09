// 学习通课程中心核心上下文（组合壳与领域 composables 共享）
// 描述：导航栈、页面级状态、invoke 基础设施、媒体资源释放与卸载守卫。
import { computed, nextTick, ref } from 'vue'
import type { ComputedRef, Ref } from 'vue'
import { invokeNative, isTauriRuntime } from '../../../platform/native'
import { isIOSLike } from '../../../platform/runtime'
import { pieGradientOf, scoreSlicesOf } from '../utils/normalize'
import type { ChaoxingStackFrame, ScoreSlice } from '../types'

export interface ChaoxingHubProps {
  studentId: string
}

/** 跨领域共享的可变状态（非响应式，避免泄漏进渲染） */
export interface ChaoxingHubMutable {
  disposed: boolean
  progressiveRenderRaf: number
  lastCourseAutoLoadAt: number
  loadMoreObserver: IntersectionObserver | null
  loadMoreObserverTarget: Element | null
}

export interface ChaoxingHubCore {
  mutable: ChaoxingHubMutable
  stack: Ref<ChaoxingStackFrame[]>
  current: ComputedRef<ChaoxingStackFrame>
  breadcrumbs: ComputedRef<Array<{ key: string; label: string }>>
  pageTitle: ComputedRef<string>
  loading: Ref<boolean>
  refreshing: Ref<boolean>
  pageLoading: Ref<boolean>
  error: Ref<string>
  videoError: Ref<string>
  videoSrcIndex: Ref<number>
  activeVideoSrc: ComputedRef<string>
  scoreSlices: ComputedRef<ScoreSlice[]>
  pieGradient: ComputedRef<string>
  // 常量与平台标志
  isIOSLikeDevice: boolean
  shouldRenderRemoteCourseCovers: boolean
  // 基础设施
  cxInvoke: (cmd: string, body?: Record<string, unknown>) => Promise<any>
  scrollModuleToTop: () => void
  push: (frame: ChaoxingStackFrame) => void
  pop: () => void
  jumpTo: (index: number) => void
  releaseMediaForFrames: (frames: ChaoxingStackFrame[]) => void
  dispose: () => void
}

// 课程列表分批渲染（所有平台）：先渲染 INITIAL_COURSE_BATCH 门，滚动到底自动扩展
export const INITIAL_COURSE_BATCH = 20
export const COURSE_LOAD_MORE_STEP = 20
// iOS 渐进首帧：再分小批 rAF 递增，平滑「列表加载完成瞬间」的渲染峰值
export const IOS_PROGRESSIVE_FIRST_BATCH = 6
// 课程列表上限：防止异常超大数据一次性 normalize/渲染导致 iOS 内存暴涨
export const MAX_COURSE_LIST_SIZE = 500

export const createChaoxingHubCore = (props: ChaoxingHubProps, emit: (event: 'back') => void): ChaoxingHubCore => {
  // iOS 判断收敛到 src/platform/runtime.ts（与 App.vue 同一来源）
  const isIOSLikeDevice = isIOSLike()

  const loading = ref(true)
  const refreshing = ref(false)
  const pageLoading = ref(false)
  const error = ref('')
  const videoError = ref('')
  const videoSrcIndex = ref(0)

  // 卸载守卫：仅在组件卸载时置位（导航栈 pop/jumpTo 不置位），
  // 防止卸载后仍在途的异步回调继续写入响应式状态
  const mutable: ChaoxingHubMutable = {
    disposed: false,
    progressiveRenderRaf: 0,
    lastCourseAutoLoadAt: 0,
    loadMoreObserver: null,
    loadMoreObserverTarget: null
  }

  /** 导航栈：list → course → section → knowledge → video | document | score */
  const stack = ref<ChaoxingStackFrame[]>([{ level: 'list' }])

  const current = computed(() => stack.value[stack.value.length - 1] || { level: 'list' })

  const breadcrumbs = computed(() => {
    const items: Array<{ key: string; label: string }> = []
    for (const frame of stack.value) {
      if (frame.level === 'list') items.push({ key: 'list', label: '课程' })
      else if (frame.level === 'course')
        items.push({ key: 'course', label: frame.course?.title || '课程' })
      else if (frame.level === 'section')
        items.push({ key: 'section', label: frame.section?.title || '章' })
      else if (frame.level === 'knowledge')
        items.push({ key: 'knowledge', label: frame.knowledge?.title || '小节' })
      else if (frame.level === 'score') items.push({ key: 'score', label: '成绩' })
      else if (frame.level === 'video')
        items.push({ key: 'video', label: frame.task?.title || '视频' })
      else if (frame.level === 'document')
        items.push({ key: 'document', label: frame.task?.title || '文档' })
    }
    return items
  })

  const pageTitle = computed(() => {
    const c = current.value
    if (c.level === 'list') return '课程中心'
    if (c.level === 'course') return c.course?.title || '课程'
    if (c.level === 'section') return c.section?.title || '章节'
    if (c.level === 'knowledge') return c.knowledge?.title || '任务'
    if (c.level === 'score') return '成绩组成'
    if (c.level === 'video') return c.task?.title || '视频'
    if (c.level === 'document') return c.task?.title || '文档'
    return '课程中心'
  })

  const activeVideoSrc = computed(() => {
    const urls = current.value?.playUrls || []
    if (!urls.length) return current.value?.src || ''
    return urls[Math.min(videoSrcIndex.value, urls.length - 1)] || ''
  })

  const scoreSlices = computed(() => scoreSlicesOf(current.value?.score as Record<string, unknown> | undefined))
  const pieGradient = computed(() => pieGradientOf(scoreSlices.value))

  /**
   * 统一 invoke：只传 snake_case 字段。
   * 切勿同时传 clazz_id + clazzId：Rust #[serde(alias)] 会报 duplicate field。
   */
  const cxInvoke = async (cmd: string, body: Record<string, unknown> = {}) => {
    if (!isTauriRuntime()) throw new Error('请在客户端内使用')
    const raw: Record<string, unknown> = { student_id: props.studentId || '', ...body }
    // 规范化：camelCase → snake_case，并删除 camel 别名，避免重复键
    const map: Array<[string, string]> = [
      ['courseId', 'course_id'],
      ['clazzId', 'clazz_id'],
      ['classId', 'clazz_id'],
      ['knowledgeId', 'knowledge_id'],
      ['objectId', 'object_id'],
      ['courseUrl', 'course_url'],
      ['studentId', 'student_id']
    ]
    for (const [camel, snake] of map) {
      if (raw[camel] != null && (raw[snake] == null || raw[snake] === '')) {
        raw[snake] = raw[camel]
      }
      delete raw[camel]
    }
    return invokeNative(cmd, { req: raw })
  }

  /** 模块内翻页：滚到顶部，不跟首页滚动位置同步 */
  const scrollModuleToTop = () => {
    nextTick(() => {
      try {
        const shell = document.querySelector('.app-shell')
        if (shell) shell.scrollTop = 0
        window.scrollTo(0, 0)
        document.documentElement.scrollTop = 0
        document.body.scrollTop = 0
        // 本组件根节点若可滚也归零
        const root = document.querySelector('.cx-hub')
        if (root) root.scrollTop = 0
      } catch {
        // ignore
      }
    })
  }

  const push = (frame: ChaoxingStackFrame) => {
    stack.value = [...stack.value, frame]
    scrollModuleToTop()
  }

  /**
   * 释放被移出栈帧关联的媒体资源（iOS 内存缓解）：
   * video 清空 src 并 load()，文档/播放器 iframe 跳转空白页，
   * 促使 WKWebView 尽快回收解码器与渲染内存
   */
  const releaseMediaForFrames = (frames: ChaoxingStackFrame[] = []) => {
    const needRelease = frames.some((f) => f?.level === 'video' || f?.level === 'document')
    if (!needRelease) return
    try {
      document.querySelectorAll('.cx-hub video.video-el').forEach((v) => {
        try {
          ;(v as HTMLVideoElement).pause()
          ;(v as HTMLVideoElement).src = ''
          ;(v as HTMLVideoElement).load()
        } catch {
          // 静默失败
        }
      })
      document.querySelectorAll('.cx-hub iframe.doc-frame').forEach((f) => {
        try {
          ;(f as HTMLIFrameElement).src = 'about:blank'
        } catch {
          // 静默失败
        }
      })
    } catch {
      // 静默失败
    }
  }

  const pop = () => {
    if (stack.value.length <= 1) {
      emit('back')
      return
    }
    // 先释放即将被移出层级的媒体资源，再更新栈
    releaseMediaForFrames([stack.value[stack.value.length - 1]])
    stack.value = stack.value.slice(0, -1)
    videoError.value = ''
    videoSrcIndex.value = 0
    scrollModuleToTop()
  }

  /** 点面包屑跳到某一层 */
  const jumpTo = (index: number) => {
    if (index < 0 || index >= stack.value.length) return
    // 先释放被移出层级（video/document）的媒体资源，再更新栈
    releaseMediaForFrames(stack.value.slice(index + 1))
    stack.value = stack.value.slice(0, index + 1)
    videoError.value = ''
    videoSrcIndex.value = 0
    scrollModuleToTop()
  }

  /** 组件卸载清理：置位守卫、取消 rAF、断开滚动观察器 */
  const dispose = () => {
    mutable.disposed = true
    if (mutable.progressiveRenderRaf) {
      cancelAnimationFrame(mutable.progressiveRenderRaf)
      mutable.progressiveRenderRaf = 0
    }
    if (mutable.loadMoreObserver) {
      mutable.loadMoreObserver.disconnect()
      mutable.loadMoreObserver = null
      mutable.loadMoreObserverTarget = null
    }
  }

  return {
    mutable,
    stack,
    current,
    breadcrumbs,
    pageTitle,
    loading,
    refreshing,
    pageLoading,
    error,
    videoError,
    videoSrcIndex,
    activeVideoSrc,
    scoreSlices,
    pieGradient,
    isIOSLikeDevice,
    shouldRenderRemoteCourseCovers: !isIOSLikeDevice,
    cxInvoke,
    scrollModuleToTop,
    push,
    pop,
    jumpTo,
    releaseMediaForFrames,
    dispose
  }
}
