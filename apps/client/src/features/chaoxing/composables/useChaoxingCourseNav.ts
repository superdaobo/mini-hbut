// 学习通课程中心导航领域（课程详情/章/小节/任务点/视频/文档/成绩）
// 描述：多级导航动作：打开课程大纲、小节任务卡、视频状态、文档预览、成绩组成。
import { showToast } from '../../../utils/toast'
import { isTauriRuntime } from '../../../platform/native'
import {
  collectDocUrls,
  collectPlayUrls,
  mediaErrorMessage,
  normalizeSection,
  normalizeTaskItem,
  preferHttps,
  safeNumber,
  safeText,
  toVideoProxyUrl
} from '../utils/normalize'
import type { ChaoxingCourse, ChaoxingKnowledge, ChaoxingSection, ChaoxingStackFrame, ChaoxingTask } from '../types'
import type { ChaoxingHubCore } from './useChaoxingHubCore'

export interface ChaoxingCourseNav {
  openCourse: (course: ChaoxingCourse, options?: { force?: boolean }) => Promise<void>
  openSection: (course: ChaoxingCourse, section: ChaoxingSection) => void
  openKnowledge: (course: ChaoxingCourse, section: ChaoxingSection, knowledge: ChaoxingKnowledge) => Promise<void>
  openScore: (course: ChaoxingCourse) => Promise<void>
  openVideo: (course: ChaoxingCourse, section: ChaoxingSection, knowledge: ChaoxingKnowledge, task: ChaoxingTask, meta: Record<string, unknown>) => Promise<void>
  openDocument: (course: ChaoxingCourse, section: ChaoxingSection, knowledge: ChaoxingKnowledge, task: ChaoxingTask, meta: Record<string, unknown>) => Promise<void>
  onTaskClick: (frame: ChaoxingStackFrame, task: ChaoxingTask) => void
  retryVideo: () => void
  onCoverError: (event: Event) => void
  onVideoError: (event: Event) => void
}

export const useChaoxingCourseNav = (core: ChaoxingHubCore): ChaoxingCourseNav => {
  const openCourse = async (course: ChaoxingCourse, { force = false } = {}) => {
    core.pageLoading.value = true
    try {
      // 默认走缓存；仅点「刷新章节」时 force
      const outlineRes = await core.cxInvoke('chaoxing_fetch_course_outline', {
        course_id: course.courseId,
        clazz_id: course.clazzId,
        cpi: course.cpi || '',
        course_url: course.courseUrl || '',
        force: !!force
      })
      if (core.mutable.disposed) return
      if (outlineRes?.success === false) throw new Error(outlineRes?.error || '大纲失败')

      let sectionList: Array<Record<string, unknown>> = Array.isArray(outlineRes?.sections)
        ? outlineRes.sections
        : []
      if (!sectionList.length && Array.isArray(outlineRes?.nodes)) {
        sectionList = [{ id: 'all', title: '全部章节', tasks: outlineRes.nodes }]
      }
      const sections = sectionList.map(normalizeSection).filter((s) => s.knowledges.length || s.title)

      const frame: ChaoxingStackFrame = {
        level: 'course',
        course,
        sections,
        progress: {}
      }
      // 刷新时替换当前课程层，避免栈叠加
      if (core.current.value.level === 'course') {
        const base = core.stack.value.slice(0, -1)
        core.stack.value = [...base, frame]
      } else {
        core.push(frame)
      }

      // 进度后台拉取，不阻塞进入章列表
      void core
        .cxInvoke('chaoxing_fetch_course_progress', {
          course_id: course.courseId,
          clazz_id: course.clazzId,
          cpi: course.cpi || '',
          course_url: course.courseUrl || '',
          force: false
        })
        .then((progressRes) => {
          // 组件已卸载则放弃后台进度回填
          if (core.mutable.disposed) return
          const top = core.stack.value[core.stack.value.length - 1]
          if (top?.level === 'course' && top.course?.courseId === course.courseId) {
            top.progress = progressRes || {}
            core.stack.value = [...core.stack.value.slice(0, -1), { ...top }]
          }
        })
        .catch(() => {})
    } catch (e) {
      if (core.mutable.disposed) return
      showToast(safeText((e as Error)?.message || e) || '打开课程失败')
    } finally {
      if (!core.mutable.disposed) core.pageLoading.value = false
    }
  }

  const openSection = (course: ChaoxingCourse, section: ChaoxingSection) => {
    core.push({ level: 'section', course, section })
  }

  const openKnowledge = async (course: ChaoxingCourse, section: ChaoxingSection, knowledge: ChaoxingKnowledge) => {
    core.pageLoading.value = true
    try {
      // 优先用小节自带 course/clazz（大纲解析结果更准）
      const courseId = knowledge.courseId || course.courseId
      const clazzId = knowledge.clazzId || course.clazzId
      const cpi = knowledge.cpi || course.cpi || ''
      const kid = knowledge.knowledgeId || knowledge.id
      const res = await core.cxInvoke('chaoxing_get_knowledge_cards', {
        course_id: courseId,
        clazz_id: clazzId,
        knowledge_id: kid,
        cpi
      })
      if (core.mutable.disposed) return
      if (res?.success === false) throw new Error(res?.error || '任务点加载失败')
      const list = Array.isArray(res?.tasks)
        ? res.tasks
        : Array.isArray(res?.attachments)
          ? res.attachments
          : Array.isArray(res?.videos)
            ? res.videos
            : []
      // 过滤纯占位提示，若仅有占位则仍展示
      const mapped = list.map(normalizeTaskItem)
      const real = mapped.filter((t: ChaoxingTask) => !t.empty_hint && (t.objectId || t.kind !== 'task'))
      core.push({
        level: 'knowledge',
        course,
        section,
        knowledge,
        tasks: real.length ? real : mapped,
        meta: {
          fid: safeText(res?.fid || ''),
          reportUrl: safeText(res?.reportUrl || res?.report_url || ''),
          userid: safeText(res?.userid || '')
        }
      })
    } catch (e) {
      if (core.mutable.disposed) return
      showToast(safeText((e as Error)?.message || e) || '打开小节失败')
    } finally {
      if (!core.mutable.disposed) core.pageLoading.value = false
    }
  }

  const openScore = async (course: ChaoxingCourse) => {
    core.pageLoading.value = true
    try {
      const res = await core.cxInvoke('chaoxing_fetch_course_score', {
        course_id: course.courseId,
        clazz_id: course.clazzId,
        cpi: course.cpi || ''
      })
      if (core.mutable.disposed) return
      if (res?.success === false) throw new Error(res?.error || res?.message || '成绩加载失败')
      // 若已在成绩页则替换，避免栈叠加
      if (core.current.value.level === 'score') {
        const base = core.stack.value.slice(0, -1)
        core.stack.value = [...base, { level: 'score', course, score: res }]
      } else {
        core.push({ level: 'score', course, score: res })
      }
    } catch (e) {
      if (core.mutable.disposed) return
      const msg = safeText((e as Error)?.message || e) || '成绩加载失败'
      if (msg.includes('Unknown POST endpoint')) {
        showToast('成绩接口未就绪，请完全退出应用后重新打开')
      } else if (msg.includes('duplicate field')) {
        showToast('参数冲突已修复，请完全重启应用后再试')
      } else {
        showToast(msg)
      }
    } finally {
      if (!core.mutable.disposed) core.pageLoading.value = false
    }
  }

  const openVideo = async (
    course: ChaoxingCourse,
    section: ChaoxingSection,
    knowledge: ChaoxingKnowledge,
    task: ChaoxingTask,
    meta: Record<string, unknown>
  ) => {
    if (!task.objectId) {
      showToast('该任务没有可播放资源')
      return
    }
    core.pageLoading.value = true
    core.videoError.value = ''
    core.videoSrcIndex.value = 0
    try {
      const res = await core.cxInvoke('chaoxing_get_video_status', {
        object_id: task.objectId,
        fid: safeText(meta?.fid || '0')
      })
      if (core.mutable.disposed) return
      if (res?.success === false) throw new Error(res?.error || '视频状态失败')
      const st = res?.data && typeof res.data === 'object' ? res.data : res
      // 直链经本地代理播放（绕过 cldisk Referer 防盗链）；官方 ananas 播放器
      // 带参 URL 已被学习通新版前端废弃（会永久卡「正在为您加载文件」），不再兜底
      const playUrls = collectPlayUrls(st, res || {}).map((u) => toVideoProxyUrl(u, isTauriRuntime()))
      if (!playUrls.length) {
        throw new Error(
          st.status && st.status !== 'success'
            ? `视频不可用（${st.status}）`
            : '未返回播放地址，请确认学习通会话有效'
        )
      }
      core.push({
        level: 'video',
        course,
        section,
        knowledge,
        task,
        src: playUrls[0] || '',
        playUrls,
        poster: preferHttps(safeText(st.screenshot || st.thumb || '')),
        filename: safeText(st.filename || task.title),
        duration: safeNumber(st.duration)
      })
    } catch (e) {
      if (core.mutable.disposed) return
      showToast(safeText((e as Error)?.message || e) || '视频打开失败')
    } finally {
      if (!core.mutable.disposed) core.pageLoading.value = false
    }
  }

  /** 文档/PPT：走 ananas status 取直链或官方预览页，禁止 openVideo */
  const openDocument = async (
    course: ChaoxingCourse,
    section: ChaoxingSection,
    knowledge: ChaoxingKnowledge,
    task: ChaoxingTask,
    meta: Record<string, unknown>
  ) => {
    if (!task.objectId) {
      showToast(`文档「${task.title}」无可预览资源（缺少 objectId）`)
      return
    }
    core.pageLoading.value = true
    try {
      const res = await core.cxInvoke('chaoxing_get_video_status', {
        object_id: task.objectId,
        fid: safeText(meta?.fid || '0')
      })
      if (core.mutable.disposed) return
      if (res?.success === false) throw new Error(res?.error || '文档状态失败')
      const st = res?.data && typeof res.data === 'object' ? res.data : res
      const docUrls = collectDocUrls(st, res || {})
      const filename = safeText(st.filename || task.title)
      // 官方 PDF/文档模块页（无签名时仍可能依赖会话 cookie）
      const officialPreview = preferHttps(
        `https://mooc1.chaoxing.com/ananas/modules/pdf/index.html?objectid=${encodeURIComponent(task.objectId)}&fid=${encodeURIComponent(safeText(meta?.fid || '0'))}`
      )
      const previewUrl = docUrls[0] || officialPreview
      if (!previewUrl) {
        showToast(`文档「${filename || task.title}」暂无预览地址，请在学习通网页端打开`)
        return
      }
      core.push({
        level: 'document',
        course,
        section,
        knowledge,
        task,
        src: previewUrl,
        candidates: docUrls.length ? docUrls : [officialPreview],
        filename,
        fileType: safeText(st.fileType || st.filetype || task.typeMeta?.text || '文档')
      })
    } catch (e) {
      if (core.mutable.disposed) return
      const msg = safeText((e as Error)?.message || e) || '文档打开失败'
      showToast(`文档预览失败：${msg}`)
    } finally {
      if (!core.mutable.disposed) core.pageLoading.value = false
    }
  }

  const onVideoError = (event: Event) => {
    const frame = core.current.value
    const urls = frame?.playUrls || []
    if (core.videoSrcIndex.value + 1 < urls.length) {
      core.videoSrcIndex.value += 1
      core.videoError.value = `线路 ${core.videoSrcIndex.value + 1}/${urls.length} 失败，切换备用地址…`
      return
    }
    // 直链全部失败：官方 ananas 播放器带参 URL 已被学习通废弃（永久卡「正在为您加载文件」），
    // 不再切换，直接给出可操作提示
    const detail = mediaErrorMessage(event)
    core.videoError.value = detail
      ? `视频播放失败：${detail}。请重试、切换线路或重新登录学习通`
      : '视频播放失败：无法解析播放地址或被 CDN 拒绝。请重试，或重新登录学习通后再打开'
  }

  const retryVideo = () => {
    const frame = core.current.value
    if (frame?.level !== 'video' || !frame.task) return
    const task = frame.task
    const course = frame.course as ChaoxingCourse
    const section = frame.section as ChaoxingSection
    const knowledge = frame.knowledge as ChaoxingKnowledge
    const knowFrame = [...core.stack.value].reverse().find((f) => f.level === 'knowledge')
    const meta = knowFrame?.meta || { fid: '0' }
    // 先退出视频层再重新打开，避免栈叠加
    if (core.stack.value.length > 1 && core.current.value.level === 'video') {
      core.stack.value = core.stack.value.slice(0, -1)
    }
    core.videoError.value = ''
    core.videoSrcIndex.value = 0
    void openVideo(course, section, knowledge, task, meta)
  }

  const onTaskClick = (frame: ChaoxingStackFrame, task: ChaoxingTask) => {
    if (task.empty_hint) {
      showToast('该小节暂无任务点')
      return
    }
    // 严格按 kind 分流：禁止 objectId 一律当视频
    if (task.kind === 'video') {
      void openVideo(frame.course as ChaoxingCourse, frame.section as ChaoxingSection, frame.knowledge as ChaoxingKnowledge, task, frame.meta || {})
      return
    }
    if (task.kind === 'document') {
      void openDocument(frame.course as ChaoxingCourse, frame.section as ChaoxingSection, frame.knowledge as ChaoxingKnowledge, task, frame.meta || {})
      return
    }
    if (task.kind === 'work') {
      showToast(`作业「${task.title}」请在学习通网页端完成`)
      return
    }
    if (task.kind === 'unknown' && task.objectId) {
      showToast(`未知类型任务「${task.title}」，暂不按视频打开`)
      return
    }
    showToast(`${task.typeMeta?.text || '任务'}：${task.title}`)
  }

  const onCoverError = (event: Event) => {
    const target = event.target as HTMLElement | null
    if (target) {
      target.style.display = 'none'
      const fallback = target.nextElementSibling as HTMLElement | null
      if (fallback) fallback.style.display = 'flex'
    }
  }

  return {
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
  }
}
