/**
 * 自动学习 composable — 超星学习通 & 雨课堂 共享核心逻辑
 * 封装速度模式、任务队列、进度追踪、心跳上报
 */
import { computed, reactive, ref } from 'vue'
import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_BASE || '/api'

/* ────── 速度模式定义 ────── */
export const SPEED_MODES = {
  rush:   { label: '极速', desc: '3秒/批次，高风险可能触发检测', delay: 3000, risk: 'high',   icon: '⚡', multiplier: 0 },
  fast:   { label: '快速', desc: '10~15秒/批次，2倍速，推荐日常', delay: 12000, risk: 'medium', icon: '🚀', multiplier: 2 },
  normal: { label: '常规', desc: '30秒/批次，1倍速，最安全',     delay: 30000, risk: 'low',    icon: '🐢', multiplier: 1 }
}

/* ────── 随机抖动 ────── */
const jitter = (base, factor = 0.2) => {
  const low = base * (1 - factor)
  const high = base * (1 + factor)
  return Math.round(low + Math.random() * (high - low))
}

const asArray = (value) => Array.isArray(value) ? value : []

const pickText = (...values) => {
  for (const value of values) {
    const text = String(value ?? '').trim()
    if (text) return text
  }
  return ''
}

const pickNumber = (...values) => {
  for (const value of values) {
    const num = Number(value)
    if (Number.isFinite(num)) return num
  }
  return 0
}

const clampPercent = (value, fallback = 0) => {
  const num = Number(value)
  if (!Number.isFinite(num)) return fallback
  return Math.max(0, Math.min(100, Math.round(num)))
}

const isTruthy = (value) => {
  if (value === true) return true
  if (typeof value === 'number') return value !== 0
  return /^(true|1|yes)$/i.test(String(value ?? '').trim())
}

const readQueryParam = (url, key) => {
  const raw = String(url ?? '').trim()
  if (!raw) return ''
  try {
    return new URL(raw).searchParams.get(key) || ''
  } catch {
    return ''
  }
}

const extractChaoxingOutlineNodes = (payload) => {
  if (asArray(payload?.nodes).length) return payload.nodes
  if (asArray(payload?.sections).length) return payload.sections
  if (asArray(payload?.outline).length) return payload.outline
  return asArray(payload)
}

/* ────── 自动学习状态机 ────── */
export function useAutoLearning(platform) {
  // 运行状态
  const running = ref(false)
  const paused = ref(false)
  const cancelling = ref(false)
  let cancelToken = null

  // 配置参数
  const config = reactive({
    speedMode: 'fast',
    allCourses: false,            // 是否刷全部课程
    selectedCourseIds: [],        // 手动选择的课程 ID
    // 超星专用
    cx_reportInterval: 60,        // 秒
    cx_jitterFactor: 0.2,
    // 雨课堂专用
    yk_heartbeatInterval: 5,      // 秒
    yk_batchSize: 6
  })

  // 进度追踪
  const progress = reactive({
    phase: '',                    // 'preparing' | 'running' | 'done' | 'error'
    totalCourses: 0,
    currentCourseIndex: 0,
    currentCourseName: '',
    totalVideos: 0,
    currentVideoIndex: 0,
    currentVideoName: '',
    currentVideoProgress: 0,      // 0~100
    overallProgress: 0,           // 0~100
    startTime: null,
    logs: []                      // { time, level, message }
  })

  // 统计
  const stats = reactive({
    videosCompleted: 0,
    videosFailed: 0,
    coursesCompleted: 0,
    totalTime: 0
  })

  /* ── 延时 (可取消) ── */
  const delay = (ms) => new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    cancelToken = () => {
      clearTimeout(timer)
      reject(new Error('cancelled'))
    }
  })

  /* ── 计算当前延时 ── */
  const getDelay = () => {
    const mode = SPEED_MODES[config.speedMode] || SPEED_MODES.fast
    return jitter(mode.delay, config.cx_jitterFactor)
  }

  /* ── 总进度计算 ── */
  const overallPercent = computed(() => {
    if (!progress.totalVideos) return 0
    const base = ((progress.currentVideoIndex) / progress.totalVideos) * 100
    const videoContrib = (progress.currentVideoProgress / progress.totalVideos)
    return Math.min(100, Math.round(base + videoContrib))
  })

  const captureLogProgress = () => {
    const totalCourses = Math.max(0, pickNumber(progress.totalCourses))
    const totalVideos = Math.max(0, pickNumber(progress.totalVideos))
    const courseIndex = totalCourses
      ? Math.min(Math.max(0, pickNumber(progress.currentCourseIndex)), totalCourses)
      : Math.max(0, pickNumber(progress.currentCourseIndex))
    const videoIndex = totalVideos
      ? Math.min(Math.max(0, pickNumber(progress.currentVideoIndex)), totalVideos)
      : Math.max(0, pickNumber(progress.currentVideoIndex))
    const videoPercent = clampPercent(progress.currentVideoProgress)
    const overall = totalVideos ? clampPercent(overallPercent.value) : videoPercent

    return {
      phase: pickText(progress.phase),
      courseName: pickText(progress.currentCourseName),
      courseIndex,
      totalCourses,
      videoName: pickText(progress.currentVideoName),
      videoIndex,
      totalVideos,
      videoPercent,
      overallPercent: overall,
      showBar: totalVideos > 0 || totalCourses > 0 || videoPercent > 0 || overall > 0 || pickText(progress.phase) === 'running'
    }
  }

  /* ── 日志 ── */
  const addLog = (message, level = 'info') => {
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false })
    progress.logs.unshift({
      time,
      level,
      message,
      ...captureLogProgress()
    })
    if (progress.logs.length > 200) progress.logs.length = 200
  }

  /* ── API 调用封装 ── */
  const apiCall = async (endpoint, data = {}) => {
    const res = await axios.post(`${API_BASE}${endpoint}`, data)
    const payload = res?.data || {}
    if (payload?.success === false) {
      throw new Error(payload?.error || `API 调用失败: ${endpoint}`)
    }
    return payload?.data || payload
  }

  /* ══════════════════════════════════════════
     超星学习通 — 自动刷课核心
     ══════════════════════════════════════════ */
  const runChaoxingAuto = async (studentId, courses) => {
    running.value = true
    paused.value = false
    progress.phase = 'preparing'
    progress.startTime = Date.now()
    stats.videosCompleted = 0
    stats.videosFailed = 0
    stats.coursesCompleted = 0
    progress.logs = []
    addLog('🚀 超星学习通自动刷课启动')

    const targetCourses = config.allCourses
      ? courses
      : courses.filter(c => config.selectedCourseIds.includes(c.id))

    if (!targetCourses.length) {
      addLog('⚠️ 没有选择任何课程', 'warn')
      progress.phase = 'done'
      running.value = false
      return
    }

    progress.totalCourses = targetCourses.length
    progress.phase = 'running'
    addLog(`📚 共 ${targetCourses.length} 门课程待处理`)

    try {
      for (let ci = 0; ci < targetCourses.length; ci++) {
        if (!running.value) break
        const course = targetCourses[ci]
        const courseId = pickText(course.courseId, course.course_id, course.raw?.course_id, course.raw?.courseId)
        const clazzId = pickText(course.clazzId, course.clazz_id, course.raw?.clazz_id, course.raw?.clazzId)
        const cpi = pickText(course.cpi, course.raw?.cpi, readQueryParam(course.courseUrl, 'cpi'))
        const courseUrl = pickText(course.courseUrl, course.course_url, course.raw?.course_url)
        const autoSupported = course.raw?.auto_supported !== false && !/teacher/i.test(pickText(course.raw?.role_label))
        progress.currentCourseIndex = ci + 1
        progress.currentCourseName = course.title || course.name || '未知课程'
        addLog(`📖 开始处理: ${progress.currentCourseName}`)

        if (!courseId || !clazzId) {
          addLog(`⚠️ 缺少课程标识，跳过 ${progress.currentCourseName}`, 'warn')
          continue
        }
        if (!autoSupported) {
          addLog(`⏭️ ${progress.currentCourseName} 为教师视角课程，跳过自动刷课`, 'warn')
          continue
        }
        if (!cpi) {
          addLog(`⚠️ ${progress.currentCourseName} 缺少 cpi，无法提取视频任务`, 'warn')
          continue
        }

        // 获取课程章节，再逐章节提取知识卡片中的视频任务
        let outlineNodes = []
        try {
          const outlineRes = await apiCall('/v2/chaoxing/course_outline', {
            student_id: studentId,
            course_id: courseId,
            clazz_id: clazzId,
            cpi,
            course_url: courseUrl
          })
          outlineNodes = extractChaoxingOutlineNodes(outlineRes)
        } catch (e) {
          addLog(`⚠️ 获取课程章节失败: ${e.message}`, 'warn')
          continue
        }

        const chapterNodes = outlineNodes.filter((node) => pickText(node?.knowledge_id, node?.knowledgeId, node?.id))
        const videoTasks = []

        for (const node of chapterNodes) {
          if (!running.value) break
          const knowledgeId = pickText(node.knowledge_id, node.knowledgeId, node.id)
          if (!knowledgeId) continue

          try {
            const cardsRes = await apiCall('/v2/chaoxing/knowledge_cards', {
              student_id: studentId,
              clazz_id: clazzId,
              course_id: courseId,
              knowledge_id: knowledgeId,
              cpi
            })
            const videos = asArray(cardsRes?.videos)
            const reportUrl = pickText(cardsRes?.reportUrl, cardsRes?.report_url)
            const userid = pickText(cardsRes?.userid, cardsRes?.userId)
            const videoFid = pickText(cardsRes?.fid, cardsRes?.raw_defaults?.fid)
            const taskClazzId = pickText(cardsRes?.clazzId, cardsRes?.clazz_id, clazzId)

            for (const video of videos) {
              const objectId = pickText(video.objectId, video.object_id, video.property?.objectid)
              const jobId = pickText(video.jobid, video.job_id, video.property?.jobid)
              if (!objectId || !jobId) continue
              videoTasks.push({
                ...video,
                chapterName: pickText(node.title, node.name, '未命名章节'),
                courseId,
                clazzId: taskClazzId,
                knowledgeId,
                jobId,
                objectId,
                reportUrl,
                userid,
                fid: videoFid,
                attDuration: pickText(video.attDuration, video.att_duration, '0'),
                attDurationEnc: pickText(video.attDurationEnc, video.att_duration_enc),
                videoFaceCaptureEnc: pickText(video.videoFaceCaptureEnc, video.video_face_capture_enc),
                otherInfo: pickText(video.otherInfo, video.other_info),
                duration: 0,
                playingTime: 0,
                isPassed: isTruthy(video.isPassed || video.is_passed || video.passed)
              })
            }
          } catch (e) {
            addLog(`⚠️ 章节 ${pickText(node.title, node.name, knowledgeId)} 卡片解析失败: ${e.message}`, 'warn')
          }
        }

        const pendingVideos = videoTasks.filter(v => !v.isPassed)
        progress.totalVideos = pendingVideos.length
        progress.currentVideoIndex = 0
        addLog(`🎬 ${progress.currentCourseName}: ${pendingVideos.length}/${videoTasks.length} 个视频待完成`)

        if (!pendingVideos.length) {
          addLog(`✅ ${progress.currentCourseName}: 已全部完成`)
          stats.coursesCompleted++
          continue
        }

        for (let vi = 0; vi < pendingVideos.length; vi++) {
          if (!running.value) break
          while (paused.value) {
            await delay(1000)
          }

          const video = pendingVideos[vi]
          progress.currentVideoIndex = vi + 1
          progress.currentVideoName = video.name || video.title || video.property?.name || '未知视频'
          progress.currentVideoProgress = 0
          addLog(`▶️ [${vi + 1}/${pendingVideos.length}] ${progress.currentVideoName}`)

          try {
            if (!video.fid || !video.reportUrl || !video.userid) {
              addLog(`⚠️ ${progress.currentVideoName} 缺少上报必需参数，跳过`, 'warn')
              stats.videosFailed++
              continue
            }

            // 获取视频状态（时长、已播放时间）
            const statusRes = await apiCall('/v2/chaoxing/video_status', {
              student_id: studentId,
              object_id: video.objectId,
              fid: video.fid
            })
            video.duration = pickNumber(statusRes?.duration, statusRes?.dtoken_duration)
            video.playingTime = pickNumber(statusRes?.playingTime, statusRes?.playing_time)
            const dtoken = pickText(statusRes?.dtoken)

            if (video.duration <= 0 || !dtoken) {
              addLog(`⚠️ 无法获取视频时长，跳过`, 'warn')
              stats.videosFailed++
              continue
            }

            // 模拟播放：按 reportInterval 递增上报
            const interval = config.cx_reportInterval
            let currentTime = video.playingTime

            while (currentTime < video.duration) {
              if (!running.value) break
              while (paused.value) {
                await delay(1000)
              }

              currentTime = Math.min(currentTime + interval, video.duration)
              progress.currentVideoProgress = Math.round((currentTime / video.duration) * 100)
              progress.overallProgress = overallPercent.value

              // 上报进度
              try {
                await apiCall('/v2/chaoxing/report_progress', {
                  student_id: studentId,
                  report_url: video.reportUrl,
                  dtoken,
                  clazz_id: video.clazzId,
                  object_id: video.objectId,
                  jobid: video.jobId,
                  userid: video.userid,
                  other_info: video.otherInfo,
                  playing_time: currentTime,
                  duration: video.duration,
                  video_face_capture_enc: video.videoFaceCaptureEnc || '',
                  att_duration: video.attDuration || '0',
                  att_duration_enc: video.attDurationEnc || ''
                })
              } catch (e) {
                addLog(`⚠️ 进度上报失败: ${e.message}`, 'warn')
              }

              // 等待
              await delay(getDelay())
            }

            if (running.value) {
              addLog(`✅ ${progress.currentVideoName} 完成`)
              stats.videosCompleted++
            }
          } catch (e) {
            if (e.message === 'cancelled') break
            addLog(`❌ ${progress.currentVideoName} 失败: ${e.message}`, 'error')
            stats.videosFailed++
          }
        }

        if (running.value) {
          stats.coursesCompleted++
          addLog(`📗 ${progress.currentCourseName} 处理完毕`)
        }
      }
    } catch (e) {
      if (e.message !== 'cancelled') {
        addLog(`❌ 意外错误: ${e.message}`, 'error')
        progress.phase = 'error'
      }
    } finally {
      stats.totalTime = Date.now() - (progress.startTime || Date.now())
      if (progress.phase !== 'error') progress.phase = 'done'
      running.value = false
      addLog(`🏁 刷课结束 — 完成 ${stats.videosCompleted} 个视频，失败 ${stats.videosFailed} 个`)
    }
  }

  /* ══════════════════════════════════════════
     雨课堂 — 自动刷课核心
     ══════════════════════════════════════════ */
  const runYuketangAuto = async (studentId, courses) => {
    running.value = true
    paused.value = false
    progress.phase = 'preparing'
    progress.startTime = Date.now()
    stats.videosCompleted = 0
    stats.videosFailed = 0
    stats.coursesCompleted = 0
    progress.logs = []
    addLog('🚀 雨课堂自动刷课启动')

    const targetCourses = config.allCourses
      ? courses
      : courses.filter(c => config.selectedCourseIds.includes(c.id))

    if (!targetCourses.length) {
      addLog('⚠️ 没有选择任何课程', 'warn')
      progress.phase = 'done'
      running.value = false
      return
    }

    progress.totalCourses = targetCourses.length
    progress.phase = 'running'
    addLog(`📚 共 ${targetCourses.length} 门课程待处理`)

    try {
      for (let ci = 0; ci < targetCourses.length; ci++) {
        if (!running.value) break
        const course = targetCourses[ci]
        progress.currentCourseIndex = ci + 1
        progress.currentCourseName = course.title || course.name || '未知课程'
        addLog(`📖 开始处理: ${progress.currentCourseName}`)

        // 获取课程章节
        let chapters = []
        try {
          const chRes = await apiCall('/v2/yuketang/course_chapters', {
            student_id: studentId,
            classroom_id: course.classroomId || course.classroom_id || course.id,
            sign: course.sign || ''
          })
          chapters = Array.isArray(chRes?.chapters) ? chRes.chapters
            : Array.isArray(chRes) ? chRes : []
        } catch (e) {
          addLog(`⚠️ 获取章节失败: ${e.message}`, 'warn')
          continue
        }

        // 提取视频叶子节点
        const videoLeaves = []
        for (const ch of chapters) {
          const leaves = Array.isArray(ch.leaves) ? ch.leaves
            : Array.isArray(ch.leaf_list) ? ch.leaf_list
            : Array.isArray(ch.children) ? ch.children : []
          for (const leaf of leaves) {
            if (leaf.leaf_type === 0 || leaf.type === 'video' || /(video|视频)/i.test(leaf.name || '')) {
              videoLeaves.push({
                ...leaf,
                chapterName: ch.name || ch.title || '',
                classroomId: course.classroomId || course.classroom_id || course.id,
                courseId: course.id,
                leafId: leaf.id || leaf.leaf_id || '',
                skuId: course.sku_id || course.skuId || '',
                duration: 0,
                watchProgress: 0
              })
            }
          }
        }

        // 获取每个视频的详情
        const pendingVideos = []
        for (const vl of videoLeaves) {
          try {
            const info = await apiCall('/v2/yuketang/leaf_info', {
              student_id: studentId,
              classroom_id: vl.classroomId,
              leaf_id: vl.leafId
            })
            vl.duration = info?.duration || info?.content?.media?.duration || 0
            vl.watchProgress = info?.watch_progress || info?.learn_progress || 0
            vl.videoId = info?.video_id || info?.content?.media?.id || ''
            if (vl.watchProgress < 100) {
              pendingVideos.push(vl)
            }
          } catch (e) {
            addLog(`⚠️ 获取视频详情失败 (${vl.leafId}): ${e.message}`, 'warn')
          }
        }

        progress.totalVideos = pendingVideos.length
        progress.currentVideoIndex = 0
        addLog(`🎬 ${progress.currentCourseName}: ${pendingVideos.length}/${videoLeaves.length} 个视频待完成`)

        if (!pendingVideos.length) {
          addLog(`✅ ${progress.currentCourseName}: 已全部完成`)
          stats.coursesCompleted++
          continue
        }

        for (let vi = 0; vi < pendingVideos.length; vi++) {
          if (!running.value) break
          while (paused.value) {
            await delay(1000)
          }

          const video = pendingVideos[vi]
          progress.currentVideoIndex = vi + 1
          progress.currentVideoName = video.name || video.title || '未知视频'
          progress.currentVideoProgress = video.watchProgress || 0
          addLog(`▶️ [${vi + 1}/${pendingVideos.length}] ${progress.currentVideoName}`)

          if (video.duration <= 0) {
            addLog(`⚠️ 视频时长为0，跳过`, 'warn')
            stats.videosFailed++
            continue
          }

          try {
            // 心跳上报：每 interval 秒发送一批
            const batchSize = config.yk_batchSize
            const heartbeatInterval = config.yk_heartbeatInterval
            const totalDuration = video.duration
            let elapsedSec = Math.round(totalDuration * (video.watchProgress / 100))

            while (elapsedSec < totalDuration) {
              if (!running.value) break
              while (paused.value) {
                await delay(1000)
              }

              // 构建心跳批次
              const beats = []
              for (let b = 0; b < batchSize && elapsedSec < totalDuration; b++) {
                elapsedSec = Math.min(elapsedSec + heartbeatInterval, totalDuration)
                beats.push({
                  i: batchSize > 1 ? b + 1 : 5,
                  et: 'loadeddata',
                  p: 'web',
                  n: 'PC',
                  lob: 'cloud4',
                  cp: elapsedSec,
                  fp: 0,
                  tp: totalDuration,
                  sp: SPEED_MODES[config.speedMode]?.multiplier || 1
                })
              }

              progress.currentVideoProgress = Math.round((elapsedSec / totalDuration) * 100)
              progress.overallProgress = overallPercent.value

              try {
                await apiCall('/v2/yuketang/heartbeat', {
                  student_id: studentId,
                  classroom_id: video.classroomId,
                  video_id: video.videoId || video.leafId,
                  beats
                })
              } catch (e) {
                addLog(`⚠️ 心跳上报失败: ${e.message}`, 'warn')
              }

              await delay(getDelay())
            }

            if (running.value) {
              addLog(`✅ ${progress.currentVideoName} 完成`)
              stats.videosCompleted++
            }
          } catch (e) {
            if (e.message === 'cancelled') break
            addLog(`❌ ${progress.currentVideoName} 失败: ${e.message}`, 'error')
            stats.videosFailed++
          }
        }

        if (running.value) {
          stats.coursesCompleted++
          addLog(`📗 ${progress.currentCourseName} 处理完毕`)
        }
      }
    } catch (e) {
      if (e.message !== 'cancelled') {
        addLog(`❌ 意外错误: ${e.message}`, 'error')
        progress.phase = 'error'
      }
    } finally {
      stats.totalTime = Date.now() - (progress.startTime || Date.now())
      if (progress.phase !== 'error') progress.phase = 'done'
      running.value = false
      addLog(`🏁 刷课结束 — 完成 ${stats.videosCompleted} 个视频，失败 ${stats.videosFailed} 个`)
    }
  }

  /* ── 控制方法 ── */
  const stopAuto = () => {
    running.value = false
    if (cancelToken) {
      cancelToken()
      cancelToken = null
    }
    addLog('⏹️ 用户手动停止')
  }

  const togglePause = () => {
    paused.value = !paused.value
    addLog(paused.value ? '⏸️ 已暂停' : '▶️ 已恢复')
  }

  const resetState = () => {
    running.value = false
    paused.value = false
    progress.phase = ''
    progress.totalCourses = 0
    progress.currentCourseIndex = 0
    progress.currentCourseName = ''
    progress.totalVideos = 0
    progress.currentVideoIndex = 0
    progress.currentVideoName = ''
    progress.currentVideoProgress = 0
    progress.overallProgress = 0
    progress.startTime = null
    progress.logs = []
    stats.videosCompleted = 0
    stats.videosFailed = 0
    stats.coursesCompleted = 0
    stats.totalTime = 0
  }

  /* ── 格式化时间 ── */
  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000)
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return m > 0 ? `${m}分${s}秒` : `${s}秒`
  }

  return {
    // 状态
    running,
    paused,
    cancelling,
    config,
    progress,
    stats,
    overallPercent,
    // 方法
    runChaoxingAuto,
    runYuketangAuto,
    stopAuto,
    togglePause,
    resetState,
    addLog,
    formatDuration,
    // 常量
    SPEED_MODES
  }
}
