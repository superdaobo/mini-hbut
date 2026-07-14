<script setup>
/**
 * 学习通班级资料 — Nimbus 云盘列表风格
 * - 邀请码/课程由远程配置 chaoxing_class 覆盖（#360），缺省兼容历史固定班
 * - 首次进入未入班 / 退课后：询问是否加入
 * - 门户 CAS → 学习通 SSO（不二次登录）
 * - 文件夹进入 + 官方签名预览内嵌
 */
import { computed, onMounted, ref } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { platformBridge } from '../platform'
import { openExternal } from '../utils/external_link'
import { fetchRemoteConfig, getChaoxingClassConfig } from '../utils/remote_config'
import { showToast } from '../utils/toast'
import { TPageHeader } from './templates'

const LAST_CLASS_KEY = 'hbu_chaoxing_class_last_v1'
const JOIN_DECLINED_KEY = 'hbu_chaoxing_class_declined_v1'

/** 当前生效的远程/默认班级配置（#360） */
const classConfig = ref(getChaoxingClassConfig())

const inviteCode = computed(() => String(classConfig.value?.invite_code || '').trim())

/** 与远程配置一致：邀请码 → 课程/班级元数据（预填展示） */
const classMeta = computed(() => {
  const c = classConfig.value || {}
  return {
    invite_code: String(c.invite_code || '').trim(),
    course_id: String(c.course_id || '').trim(),
    clazz_id: String(c.clazz_id || '').trim(),
    course_name: String(c.course_name || '').trim(),
    teacher_name: String(c.teacher_name || '').trim(),
    cover_url: '',
    cpi: String(c.cpi || '0').trim() || '0'
  }
})

const defaultCpi = () => classMeta.value.cpi || '0'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back'])

const loadingSso = ref(false)
const loadingBoot = ref(true)
const loadingJoin = ref(false)
const loadingResources = ref(false)
const actingId = ref('')
const ssoReady = ref(false)
const ssoHint = ref('')
const error = ref('')
const statusMsg = ref('')
const preview = ref(null)
const resources = ref([])
const activeClass = ref(null)
const showJoinDialog = ref(false)
const joinDeclined = ref(false)
/**
 * 仅当「本地曾有入班记录 + 检测到已不在班」为 true。
 * 新人首次进入永远走欢迎入班页，不展示「重新加入」文案。
 */
const needsRejoin = ref(false)
const bootPhase = ref('init') // init | sso | preview | ready | error
/** 文件夹导航栈：{ name, parent_data_id, folder_kind, data_name, parent_chain } */
const folderStack = ref([])
const showPreviewModal = ref(false)
const previewModalTitle = ref('')
const previewModalUrl = ref('')
const previewModalLoading = ref(false)
const previewModalError = ref('')
const previewModalOfficial = ref(false)
const previewDownloadUrl = ref('')
/** image | iframe | video */
const previewModalMode = ref('iframe')
const previewCandidates = ref([])
const previewCandidateIdx = ref(0)
/** 当前资料项（下载/切换方式用） */
const previewItem = ref(null)
/** 官方签名预览页 URL（objectshowpreview 等） */
const previewOfficialUrl = ref('')
/**
 * 打开方式列表（对齐学习通「切换打开方式」）
 * { id, label, desc, icon, kind: 'embed'|'browser'|'download', mode?, url }
 */
const previewOpenMethods = ref([])
const previewMethodId = ref('')
const showOpenMethodMenu = ref(false)
const previewDownloading = ref(false)
/** 列表筛选：all | folder | image | video | doc */
const filterChip = ref('all')
/** 缩略图加载失败的 key 集合 */
const thumbFailed = ref({})
/** 目录导航请求序号：只应用最新一次结果，避免快速进出时陈旧失败覆盖 */
let loadSeq = 0
/** 入班成功后短时忽略 not_joined，避免学习通侧延迟导致刚加入又被清缓存 */
let suppressNotJoinedUntil = 0

const hasTauri = isTauriRuntime()

const courseTitle = computed(() => {
  const p = activeClass.value || preview.value
  return String(p?.course_name || p?.courseName || '班级资料').trim()
})

const teacherName = computed(() => {
  const p = activeClass.value || preview.value
  return String(p?.teacher_name || p?.teacherName || '').trim()
})

const coverUrl = computed(() => {
  const p = activeClass.value || preview.value
  const raw = String(p?.cover_url || p?.coverUrl || '').trim()
  if (!raw) return ''
  if (raw.startsWith('//')) return `https:${raw}`
  if (raw.startsWith('http://')) return `https://${raw.slice(7)}`
  return raw
})

const resourceCount = computed(() => resources.value.length)

const isJoined = computed(() => !!(activeClass.value?.course_id && activeClass.value?.clazz_id))

const formatErr = (e) => {
  if (!e) return '未知错误'
  if (typeof e === 'string') return e
  return e?.message || e?.error || String(e)
}

const studentPayload = () => {
  const sid = String(props.studentId || '').trim()
  return sid ? { student_id: sid } : { student_id: null }
}

const loadLastClass = () => {
  try {
    const raw = localStorage.getItem(LAST_CLASS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.course_id && parsed?.clazz_id) {
      const savedInvite = String(parsed.invite_code || '').trim()
      // 远程 invite 变更后旧缓存失效（#360）
      if (savedInvite && inviteCode.value && savedInvite !== inviteCode.value) {
        clearLastClassStorageOnly()
        return null
      }
      activeClass.value = {
        invite_code: savedInvite || inviteCode.value,
        course_id: String(parsed.course_id),
        clazz_id: String(parsed.clazz_id),
        course_name: String(parsed.course_name || ''),
        teacher_name: String(parsed.teacher_name || ''),
        cover_url: String(parsed.cover_url || ''),
        cpi: String(parsed.cpi || defaultCpi())
      }
      return activeClass.value
    }
  } catch {
    /* ignore */
  }
  return null
}

const clearLastClassStorageOnly = () => {
  try {
    localStorage.removeItem(LAST_CLASS_KEY)
  } catch {
    /* ignore */
  }
}

const clearLastClass = () => {
  clearLastClassStorageOnly()
  activeClass.value = null
  resources.value = []
  folderStack.value = []
}

const saveLastClass = (cls) => {
  try {
    localStorage.setItem(LAST_CLASS_KEY, JSON.stringify(cls))
    localStorage.removeItem(JOIN_DECLINED_KEY)
  } catch {
    /* ignore */
  }
}

const loadDeclined = () => {
  try {
    joinDeclined.value = localStorage.getItem(JOIN_DECLINED_KEY) === inviteCode.value
  } catch {
    joinDeclined.value = false
  }
}

const markDeclined = () => {
  joinDeclined.value = true
  showJoinDialog.value = false
  try {
    localStorage.setItem(JOIN_DECLINED_KEY, inviteCode.value)
  } catch {
    /* ignore */
  }
}

/**
 * 进入未入班欢迎页。
 * @param {{ openDialog?: boolean, reason?: string, rejoin?: boolean }} opts
 * rejoin=true 仅用于「曾有 last-class 且识别到已退班」
 */
const enterNotJoinedState = async ({ openDialog = false, reason = '', rejoin = false } = {}) => {
  clearLastClass()
  needsRejoin.value = !!rejoin
  error.value = ''
  statusMsg.value = rejoin ? reason || '你已不在该班级，请重新加入' : ''
  preview.value = { ...classMeta.value }
  bootPhase.value = 'ready'
  loadingBoot.value = false
  if (openDialog && !joinDeclined.value) {
    try {
      void fetchPreview().catch(() => {})
      showJoinDialog.value = true
    } catch {
      showJoinDialog.value = true
    }
  }
}

const isNotJoinedSignal = (resOrMsg) => {
  // 刚入班成功：忽略短暂 not_joined，防止 UI 又退回「已退出」
  if (Date.now() < suppressNotJoinedUntil) return false
  if (resOrMsg && typeof resOrMsg === 'object') {
    // 权威：backclazzdata 返回 enrolled=false（退课后资料页仍可能是空壳）
    if (resOrMsg.enrolled === false || resOrMsg.enrolled === 0 || resOrMsg.enrolled === 'false') {
      return true
    }
    const m = String(resOrMsg.membership || '').toLowerCase()
    if (m === 'not_joined' || m === 'not-joined') return true
  }
  const msg = typeof resOrMsg === 'string' ? resOrMsg : formatErr(resOrMsg)
  return /未加入|不在该班|无权限|请先加入|不是该班|未选课|已退课|退班|无权访问/.test(String(msg || ''))
}

const ensureSso = async () => {
  loadingSso.value = true
  // 已有班级壳时不要把整页打回 sso 全屏，只更新顶栏提示
  if (bootPhase.value === 'init' || bootPhase.value === 'sso') {
    bootPhase.value = 'sso'
  }
  ssoHint.value = '正在通过门户会话接入学习通…'
  try {
    if (!hasTauri) {
      throw new Error('请在客户端内使用本功能')
    }
    const res = await invokeNative('chaoxing_class_ensure_sso', {
      req: studentPayload()
    })
    ssoReady.value = !!(res?.success ?? res?.sso)
    ssoHint.value = ssoReady.value
      ? res?.partial
        ? '门户会话部分可用（已可访问固定班级）'
        : res?.from_cache || res?.cookie_reuse
          ? '学习通会话已复用'
          : '门户 SSO 已连接'
      : '会话未就绪，请重新登录门户'
    return ssoReady.value
  } catch (e) {
    ssoReady.value = false
    const msg = formatErr(e)
    ssoHint.value = msg
    error.value =
      msg.includes('过期') || msg.includes('登录')
        ? `${msg}（接口可达，属于会话失效，不是客户端断网）`
        : msg
    return false
  } finally {
    loadingSso.value = false
  }
}

const fetchPreview = async () => {
  bootPhase.value = 'preview'
  const code = inviteCode.value
  if (!code) throw new Error('未配置学习通邀请码')
  const res = await invokeNative('chaoxing_class_preview_invite', {
    req: { invite_code: code, ...studentPayload() }
  })
  preview.value = {
    invite_code: code,
    course_id: String(res.course_id || classMeta.value.course_id || ''),
    clazz_id: String(res.clazz_id || classMeta.value.clazz_id || ''),
    course_name: String(res.course_name || classMeta.value.course_name || '班级'),
    teacher_name: String(res.teacher_name || classMeta.value.teacher_name || ''),
    cover_url: String(res.cover_url || ''),
    cpi: String(res.cpi || defaultCpi())
  }
  return preview.value
}

/** 入班/重加成功后刷新资料页状态（避免仍停在「已退班」欢迎态） */
const refreshAfterJoin = async (cls, statusText = '加入成功') => {
  joinDeclined.value = false
  needsRejoin.value = false
  showJoinDialog.value = false
  folderStack.value = []
  resources.value = []
  filterChip.value = 'all'
  error.value = ''
  preview.value = cls
  activeClass.value = cls
  saveLastClass(cls)
  bootPhase.value = 'ready'
  loadingBoot.value = false
  statusMsg.value = statusText
  // 学习通侧入班后资料页偶发仍短暂提示未加入，短时忽略以免立刻退回欢迎页
  suppressNotJoinedUntil = Date.now() + 12_000
  await loadResources()
  // 若仍被误判清缓存，强制恢复已入班态再拉一次
  if (!isJoined.value && cls?.course_id && cls?.clazz_id) {
    needsRejoin.value = false
    activeClass.value = cls
    preview.value = cls
    saveLastClass(cls)
    bootPhase.value = 'ready'
    statusMsg.value = statusText
    suppressNotJoinedUntil = Date.now() + 12_000
    await loadResources()
  }
  if (isJoined.value && !error.value) {
    needsRejoin.value = false
    statusMsg.value = resources.value.length
      ? `共 ${resources.value.length} 项`
      : statusText || '已在班级'
  }
}

const handleJoinConfirm = async () => {
  loadingJoin.value = true
  error.value = ''
  statusMsg.value = ''
  try {
    const code = inviteCode.value
    if (!code) throw new Error('未配置学习通邀请码')
    const res = await invokeNative('chaoxing_class_accept_invite', {
      req: { invite_code: code, ...studentPayload() }
    })
    const p = res?.preview || preview.value || {}
    const cls = {
      invite_code: code,
      course_id: String(p.course_id || preview.value?.course_id || classMeta.value.course_id || ''),
      clazz_id: String(p.clazz_id || preview.value?.clazz_id || classMeta.value.clazz_id || ''),
      course_name: String(p.course_name || preview.value?.course_name || classMeta.value.course_name || ''),
      teacher_name: String(
        p.teacher_name || preview.value?.teacher_name || classMeta.value.teacher_name || ''
      ),
      cover_url: String(p.cover_url || preview.value?.cover_url || ''),
      cpi: String(p.cpi || preview.value?.cpi || defaultCpi())
    }
    if (!cls.course_id || !cls.clazz_id) {
      throw new Error('入班成功但未返回课程信息')
    }
    await refreshAfterJoin(cls, res?.already_joined ? '你已在该班级' : '加入成功')
  } catch (e) {
    const msg = formatErr(e)
    if (msg.includes('已') && (msg.includes('加入') || msg.includes('在'))) {
      const fallback = preview.value?.course_id
        ? {
            ...preview.value,
            invite_code: inviteCode.value,
            cpi: String(preview.value.cpi || defaultCpi())
          }
        : classMeta.value.course_id
          ? { ...classMeta.value }
          : null
      if (fallback?.course_id && fallback?.clazz_id) {
        await refreshAfterJoin(fallback, '你已在该班级')
        return
      }
    }
    error.value = msg
  } finally {
    loadingJoin.value = false
  }
}

const reopenJoinDialog = async () => {
  error.value = ''
  joinDeclined.value = false
  try {
    localStorage.removeItem(JOIN_DECLINED_KEY)
  } catch {
    /* ignore */
  }
  // 主动重加：清本地已入班缓存，避免脏 course 锁死
  clearLastClass()
  preview.value = { ...classMeta.value }
  try {
    if (!preview.value?.course_id) await fetchPreview()
    showJoinDialog.value = true
  } catch (e) {
    preview.value = { ...classMeta.value }
    showJoinDialog.value = true
    error.value = formatErr(e)
  }
}

const currentFolder = computed(() =>
  folderStack.value.length ? folderStack.value[folderStack.value.length - 1] : null
)

const breadcrumbLabels = computed(() => {
  const base = ['班级资料']
  return base.concat(folderStack.value.map((f) => f.name || '文件夹'))
})

const mapResourceItem = (item) => {
  const name = String(item.name || '未命名')
  const file_type = String(item.file_type || item.fileType || '')
  const object_id = String(item.object_id || item.objectId || '')
  let thumbnail_url = String(item.thumbnail_url || item.thumbnailUrl || '')
  // 后端未给缩略图时，图片类本地拼 star3（对齐网页）
  if (!thumbnail_url && object_id) {
    const t = `${file_type} ${name}`.toLowerCase()
    if (/\b(jpg|jpeg|png|gif|webp|bmp|heic)\b/.test(t)) {
      thumbnail_url = `https://p.ananas.chaoxing.com/star3/150_150c/${object_id}`
    }
  }
  return {
    data_id: String(item.data_id || item.dataId || ''),
    name,
    file_type,
    object_id,
    size_label: String(item.size_label || item.sizeLabel || '-'),
    creator: String(item.creator || ''),
    created_at: String(item.created_at || item.createdAt || ''),
    is_folder: !!(item.is_folder ?? item.isFolder),
    folder_kind: String(item.folder_kind || item.folderKind || ''),
    download_url: String(item.download_url || item.downloadUrl || ''),
    preview_cdn_url: String(item.preview_cdn_url || item.previewCdnUrl || ''),
    thumbnail_url,
    is_downloadable: !!(item.is_downloadable ?? item.isDownloadable ?? true)
  }
}

const thumbKey = (item) => item.data_id || item.object_id || item.name

const onThumbError = (item) => {
  thumbFailed.value = { ...thumbFailed.value, [thumbKey(item)]: true }
}

const showThumb = (item) =>
  !!(item.thumbnail_url && !thumbFailed.value[thumbKey(item)] && fileKind(item) === 'image')

const isTransientListError = (msg) => {
  const m = String(msg || '')
  return (
    m.includes('网络失败') ||
    m.includes('连接') ||
    m.includes('超时') ||
    m.includes('error sending') ||
    m.includes('timed out') ||
    m.includes('connection')
  )
}

const loadResources = async () => {
  const cls = activeClass.value || preview.value
  if (!cls?.course_id || !cls?.clazz_id) {
    error.value = '尚未加入班级'
    return
  }
  const seq = ++loadSeq
  const folderSnap = currentFolder.value
    ? { ...currentFolder.value }
    : null
  loadingResources.value = true
  // 导航导航时不清掉旧列表，避免闪空；仅清错误
  error.value = ''
  const invokeOnce = () =>
    invokeNative('chaoxing_class_list_resources', {
      req: {
        course_id: cls.course_id,
        clazz_id: cls.clazz_id,
        cpi: cls.cpi || defaultCpi(),
        parent_data_id: folderSnap?.parent_data_id || null,
        data_name: folderSnap?.data_name || null,
        parent_chain: folderSnap?.parent_chain || null,
        folder_kind: folderSnap?.folder_kind || null,
        ...studentPayload()
      }
    })

  try {
    let res
    try {
      res = await invokeOnce()
    } catch (e1) {
      // 前端再补一次：后端已重试，这里覆盖排队竞态/偶发失败
      const msg1 = formatErr(e1)
      if (seq !== loadSeq) return
      if (isNotJoinedSignal(msg1) && !folderSnap) {
        // 仅「曾经有 activeClass 缓存」才视为退课后重加
        await enterNotJoinedState({
          openDialog: true,
          rejoin: true,
          reason: '你已不在该班级，请重新加入'
        })
        return
      }
      if (!isTransientListError(msg1)) throw e1
      await new Promise((r) => setTimeout(r, 200))
      if (seq !== loadSeq) return
      res = await invokeOnce()
    }
    if (seq !== loadSeq) return
    // 后端 membership 信号：仅在已有本地入班上下文时走「重新加入」
    if (isNotJoinedSignal(res) && !folderSnap) {
      await enterNotJoinedState({
        openDialog: true,
        rejoin: true,
        reason: '你已不在该班级，请重新加入'
      })
      return
    }
    if (res?.cpi && activeClass.value) {
      activeClass.value = { ...activeClass.value, cpi: String(res.cpi) }
      saveLastClass(activeClass.value)
    }
    const list = Array.isArray(res?.resources) ? res.resources : []
    resources.value = list.map(mapResourceItem)
    bootPhase.value = 'ready'
    statusMsg.value = resources.value.length ? `共 ${resources.value.length} 项` : '暂无资料'
    error.value = ''
  } catch (e) {
    if (seq !== loadSeq) return
    const msg = formatErr(e)
    if (isNotJoinedSignal(msg) && !folderSnap) {
      await enterNotJoinedState({
        openDialog: true,
        rejoin: true,
        reason: '你已不在该班级，请重新加入'
      })
      return
    }
    error.value = isTransientListError(msg)
      ? `${msg}（快速进出目录时可能瞬时失败，可点重试）`
      : msg
  } finally {
    if (seq === loadSeq) {
      loadingResources.value = false
    }
  }
}

const openUrl = async (url) => {
  const href = String(url || '').trim()
  if (!href) {
    error.value = '链接为空'
    return
  }
  // downloadData 依赖学习通 cookie，系统浏览器会 403（#358）
  if (/coursedata\/downloadData/i.test(href) || /mooc1\.chaoxing\.com\/coursedata\/download/i.test(href)) {
    throw new Error('该下载链接需登录会话，请使用应用内「下载」而非浏览器打开')
  }
  await openExternal(href)
}

const resolveAccess = async (item) => {
  const cls = activeClass.value || preview.value
  if (!cls) throw new Error('尚未加入班级')
  return invokeNative('chaoxing_class_resolve_resource', {
    req: {
      course_id: cls.course_id,
      clazz_id: cls.clazz_id,
      data_id: item.data_id,
      object_id: item.object_id || null,
      cpi: cls.cpi || defaultCpi(),
      file_name: item.name || null,
      file_type: item.file_type || null,
      ...studentPayload()
    }
  })
}

const isMobileClient = () => {
  if (typeof navigator === 'undefined') return false
  if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '')) return true
  try {
    // Capacitor WebView
    return !!(window.Capacitor?.isNativePlatform?.() || window.Capacitor?.getPlatform?.())
  } catch {
    return false
  }
}

/** 应用内鉴权下载（重试/续传在 Rust）；移动端成功后弹系统分享（#359 方案 A） */
const downloadWithSession = async (item, { retries = 2 } = {}) => {
  const cls = activeClass.value || preview.value
  if (!cls) throw new Error('尚未加入班级')
  if (!hasTauri) {
    throw new Error('请在客户端内下载（浏览器环境无法携带学习通会话）')
  }

  let lastErr = null
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await invokeNative('chaoxing_class_download_resource', {
        req: {
          course_id: cls.course_id,
          clazz_id: cls.clazz_id,
          data_id: item.data_id,
          object_id: item.object_id || null,
          cpi: cls.cpi || defaultCpi(),
          file_name: item.name || null,
          ...studentPayload()
        }
      })
      const path = String(res?.path || '').trim()
      const fileUri = String(res?.file_uri || '').trim()
      const name = String(res?.file_name || item.name || '文件').trim()
      if (!path) throw new Error('下载完成但未返回保存路径')

      const mobile = !!(res?.mobile_share || isMobileClient())
      if (mobile) {
        showToast('下载完成，请选择保存位置或分享…', 'success', 2400)
        const shareTarget = fileUri || path
        try {
          const ok = await platformBridge.shareLinkOrFile(
            shareTarget,
            `保存或分享：${name}`
          )
          if (!ok) {
            showToast(`已保存，可到文件管理中查看：${name}`, 'info', 4000)
          }
        } catch (shareErr) {
          console.warn('[chaoxing] share failed:', shareErr)
          showToast(`已下载：${name}（分享面板打开失败时可到文件中查找）`, 'warning', 4200)
        }
      } else {
        showToast(`已保存：${name}`, 'success', 3600)
      }
      return res
    } catch (e) {
      lastErr = e
      const msg = formatErr(e)
      // 可恢复错误：前端再点一次；这里自动多试
      if (i < retries) {
        showToast(`下载失败，正在重试（${i + 1}/${retries}）…`, 'warning', 2000)
        await new Promise((r) => setTimeout(r, 600 * (i + 1)))
        continue
      }
      throw new Error(msg || '下载失败')
    }
  }
  throw lastErr || new Error('下载失败')
}

const closePreviewModal = () => {
  showPreviewModal.value = false
  previewModalUrl.value = ''
  previewModalError.value = ''
  previewModalTitle.value = ''
  previewDownloadUrl.value = ''
  previewModalMode.value = 'iframe'
  previewCandidates.value = []
  previewCandidateIdx.value = 0
  previewItem.value = null
  previewOfficialUrl.value = ''
  previewOpenMethods.value = []
  previewMethodId.value = ''
  showOpenMethodMenu.value = false
  previewDownloading.value = false
}

const isOfficialPreviewPage = (url) => {
  const u = String(url || '').toLowerCase()
  return (
    u.includes('objectshowpreview') ||
    u.includes('mooc2-resource-index') ||
    u.includes('ananas/modules') ||
    u.includes('preview/v2')
  )
}

const isLikelyDirectMedia = (url) => {
  const u = String(url || '').toLowerCase()
  if (!u || isOfficialPreviewPage(u)) return false
  if (u.startsWith('data:image/')) return true
  return (
    u.includes('.jpg') ||
    u.includes('.jpeg') ||
    u.includes('.png') ||
    u.includes('.gif') ||
    u.includes('.webp') ||
    u.includes('/star3/') ||
    u.includes('.mp4') ||
    u.includes('.webm') ||
    u.includes('.m4v')
  )
}

const applyPreviewCandidate = (idx) => {
  const list = previewCandidates.value
  if (!list.length) return
  const i = Math.max(0, Math.min(idx, list.length - 1))
  previewCandidateIdx.value = i
  previewModalUrl.value = list[i]
}

const onPreviewImageError = () => {
  const next = previewCandidateIdx.value + 1
  if (next < previewCandidates.value.length) {
    applyPreviewCandidate(next)
    return
  }
  previewModalError.value =
    previewModalError.value || '图片无法加载。可切换打开方式或下载。'
}

const currentOpenMethod = computed(
  () => previewOpenMethods.value.find((m) => m.id === previewMethodId.value) || null
)

const buildOpenMethods = ({ item, mode, cands, officialUrl, downloadUrl }) => {
  const kind = fileKind(item)
  const methods = []
  const mediaUrls = cands.filter((u) => isLikelyDirectMedia(u))
  const official =
    officialUrl ||
    cands.find((u) => isOfficialPreviewPage(u)) ||
    (mode === 'iframe' ? cands[0] : '') ||
    ''

  if (kind === 'image' && mediaUrls.length) {
    methods.push({
      id: 'embed-image',
      label: '内嵌图片预览',
      desc: '在应用内直接查看图片',
      icon: 'image',
      kind: 'embed',
      mode: 'image',
      url: mediaUrls[0]
    })
  }
  if (kind === 'video' && mediaUrls.length) {
    methods.push({
      id: 'embed-video',
      label: '内嵌视频播放',
      desc: '在应用内播放视频',
      icon: 'movie',
      kind: 'embed',
      mode: 'video',
      url: mediaUrls[0]
    })
  }
  if (official) {
    methods.push({
      id: 'embed-official',
      label: '官方在线预览',
      desc: '学习通官方预览页（内嵌）',
      icon: 'preview',
      kind: 'embed',
      mode: 'iframe',
      url: official
    })
  } else if (cands[0] && kind !== 'image' && kind !== 'video') {
    methods.push({
      id: 'embed-default',
      label: '内嵌预览',
      desc: '应用内打开',
      icon: 'visibility',
      kind: 'embed',
      mode: 'iframe',
      url: cands[0]
    })
  }

  const browserTarget = official || mediaUrls[0] || cands[0] || ''
  if (browserTarget && !String(browserTarget).startsWith('data:')) {
    methods.push({
      id: 'browser-preview',
      label: '浏览器打开',
      desc: '用系统浏览器打开预览',
      icon: 'open_in_browser',
      kind: 'browser',
      url: browserTarget
    })
  }
  if (downloadUrl) {
    methods.push({
      id: 'download',
      label: '下载',
      desc: '下载到本地查看',
      icon: 'download',
      kind: 'download',
      url: downloadUrl
    })
  }
  return methods
}

const applyOpenMethod = async (method, { externalOnly = false } = {}) => {
  if (!method) return
  showOpenMethodMenu.value = false
  previewMethodId.value = method.id
  previewModalError.value = ''

  if (method.kind === 'download') {
    previewDownloading.value = true
    try {
      const item = previewItem.value || {
        data_id: previewItem.value?.data_id,
        object_id: previewItem.value?.object_id,
        name: previewModalTitle.value
      }
      if (!previewItem.value?.data_id) {
        // 仅有 URL 时仍禁止外置打开 downloadData
        const url = method.url || previewDownloadUrl.value
        if (url && !/downloadData/i.test(url)) {
          await openUrl(url)
          return
        }
        throw new Error('缺少资料信息，无法鉴权下载')
      }
      await downloadWithSession(previewItem.value)
    } catch (e) {
      previewModalError.value = formatErr(e)
    } finally {
      previewDownloading.value = false
    }
    return
  }

  if (method.kind === 'browser' || externalOnly) {
    const url = method.url || previewModalUrl.value
    if (!url || String(url).startsWith('data:')) {
      previewModalError.value = '当前预览无法用浏览器打开，请改用下载'
      return
    }
    await openUrl(url)
    return
  }

  // embed
  if (method.mode) previewModalMode.value = method.mode
  if (method.url) {
    previewModalUrl.value = method.url
    // 图片：同步候选链，便于 onerror 切换
    if (method.mode === 'image') {
      const rest = previewCandidates.value.filter((u) => u !== method.url)
      previewCandidates.value = [method.url, ...rest]
      previewCandidateIdx.value = 0
    }
  }
}

const toggleOpenMethodMenu = () => {
  if (previewModalLoading.value) return
  showOpenMethodMenu.value = !showOpenMethodMenu.value
}

const handlePreviewDownload = async () => {
  if (!previewItem.value?.data_id) {
    previewModalError.value = '暂无下载资料'
    return
  }
  previewDownloading.value = true
  try {
    await downloadWithSession(previewItem.value)
  } catch (e) {
    previewModalError.value = formatErr(e)
  } finally {
    previewDownloading.value = false
  }
}

const handleBrowserOpenCurrent = async () => {
  const m =
    previewOpenMethods.value.find((x) => x.kind === 'browser') ||
    previewOpenMethods.value.find((x) => x.kind === 'embed' && x.url && !String(x.url).startsWith('data:'))
  if (m) {
    await applyOpenMethod({ ...m, kind: 'browser' })
    return
  }
  if (previewModalUrl.value && !String(previewModalUrl.value).startsWith('data:')) {
    await openUrl(previewModalUrl.value)
  } else {
    previewModalError.value = '当前无可在浏览器打开的链接'
  }
}

const handleOpenFolder = async (item) => {
  if (!item?.is_folder) return
  const kind =
    item.folder_kind || (item.file_type === 'tch-courseware' ? 'tch-courseware' : 'afolder')
  // 教师课件虚拟根无 data_id → 0；子目录必须带真实 data_id
  folderStack.value = [
    ...folderStack.value,
    {
      name: item.name || '文件夹',
      parent_data_id: item.data_id || '0',
      folder_kind: kind,
      data_name: item.name || '',
      parent_chain: folderStack.value
        .map((f) => f.parent_data_id)
        .filter((id) => id && id !== '0')
        .join(',')
    }
  ]
  filterChip.value = 'all'
  await loadResources()
}

const handleBreadcrumb = async (index) => {
  if (index <= 0) {
    folderStack.value = []
  } else {
    folderStack.value = folderStack.value.slice(0, index)
  }
  filterChip.value = 'all'
  await loadResources()
}

const handlePreviewResource = async (item) => {
  if (item.is_folder) {
    await handleOpenFolder(item)
    return
  }
  error.value = ''
  actingId.value = `p-${item.data_id}`
  previewItem.value = item
  previewModalTitle.value = item.name
  previewModalLoading.value = true
  previewModalError.value = ''
  previewModalUrl.value = ''
  previewModalOfficial.value = false
  previewModalMode.value = fileKind(item) === 'image' ? 'image' : 'iframe'
  previewCandidates.value = []
  previewCandidateIdx.value = 0
  previewDownloadUrl.value = item.download_url || ''
  previewOfficialUrl.value = ''
  previewOpenMethods.value = []
  previewMethodId.value = ''
  showOpenMethodMenu.value = false
  showPreviewModal.value = true
  try {
    const res = await resolveAccess(item)
    const url = String(res?.preview_url || '').trim()
    const official = !!(res?.official_preview ?? res?.embeddable)
    const mode = String(res?.preview_mode || previewModalMode.value || 'iframe').toLowerCase()
    const cands = Array.isArray(res?.preview_candidates)
      ? res.preview_candidates.map((u) => String(u || '').trim()).filter(Boolean)
      : []
    if (url && !cands.includes(url)) cands.unshift(url)
    // 前端再补缩略图/origin 兜底（图片）
    if ((mode === 'image' || fileKind(item) === 'image') && item.object_id) {
      for (const u of [
        item.thumbnail_url,
        `https://p.ananas.chaoxing.com/star3/400_400c/${item.object_id}`,
        `https://p.ananas.chaoxing.com/star3/origin/${item.object_id}`
      ]) {
        const s = String(u || '').trim()
        if (s && !cands.includes(s)) cands.push(s)
      }
    }
    const dl = String(res?.download_url || item.download_url || '')
    previewDownloadUrl.value = dl
    previewModalOfficial.value = official
    previewModalMode.value = mode === 'image' || mode === 'video' ? mode : 'iframe'
    previewCandidates.value = cands

    // 官方预览页：优先候选中的 objectshowpreview / 后端返回且像官方页的 url
    const officialFromCands = cands.find((u) => isOfficialPreviewPage(u)) || ''
    previewOfficialUrl.value =
      officialFromCands || (isOfficialPreviewPage(url) ? url : '') || ''

    const methods = buildOpenMethods({
      item,
      mode: previewModalMode.value,
      cands,
      officialUrl: previewOfficialUrl.value,
      downloadUrl: dl
    })
    previewOpenMethods.value = methods

    if (!cands.length && !url && !dl) throw new Error('未获取到预览或下载地址')

    // 默认内嵌方式
    const defaultEmbed =
      methods.find((m) => m.kind === 'embed') || methods.find((m) => m.kind === 'download')
    if (defaultEmbed?.kind === 'embed') {
      await applyOpenMethod(defaultEmbed)
    } else if (cands.length) {
      applyPreviewCandidate(0)
      previewMethodId.value = methods[0]?.id || ''
    } else if (dl) {
      previewMethodId.value = methods.find((m) => m.kind === 'download')?.id || ''
      previewModalError.value = '暂无法内嵌预览，请下载或切换打开方式'
    }

    if (previewModalUrl.value.includes('star3/origin') && mode !== 'image') {
      previewModalError.value =
        '未拿到签名预览，CDN 直链可能无权限。可切换打开方式或下载。'
    }
  } catch (e) {
    previewModalError.value = formatErr(e)
    // 失败时仍尽量提供下载
    if (previewDownloadUrl.value || item.download_url) {
      previewOpenMethods.value = buildOpenMethods({
        item,
        mode: 'iframe',
        cands: [],
        officialUrl: '',
        downloadUrl: previewDownloadUrl.value || item.download_url
      })
    }
  } finally {
    previewModalLoading.value = false
    actingId.value = ''
  }
}

const handleDownloadResource = async (item) => {
  error.value = ''
  actingId.value = `d-${item.data_id}`
  try {
    await downloadWithSession(item)
  } catch (e) {
    error.value = formatErr(e)
  } finally {
    actingId.value = ''
  }
}

const handleRowClick = async (item) => {
  if (item.is_folder) {
    await handleOpenFolder(item)
  } else {
    await handlePreviewResource(item)
  }
}

const fileKind = (item) => {
  if (item.is_folder || item.folder_kind === 'tch-courseware' || item.folder_kind === 'afolder') {
    return item.folder_kind === 'tch-courseware' ? 'courseware' : 'folder'
  }
  const t = `${item.file_type} ${item.name}`.toLowerCase()
  if (/\b(mp4|mov|avi|mkv|webm)\b/.test(t) || t.endsWith('.mp4')) return 'video'
  if (/\b(jpg|jpeg|png|gif|webp|bmp)\b/.test(t)) return 'image'
  if (/\bpdf\b/.test(t)) return 'pdf'
  if (/\b(ppt|pptx)\b/.test(t)) return 'ppt'
  if (/\b(doc|docx)\b/.test(t)) return 'doc'
  if (/\b(xls|xlsx)\b/.test(t)) return 'xls'
  if (/\b(zip|rar|7z)\b/.test(t)) return 'zip'
  return 'file'
}

const kindMeta = {
  folder: { icon: 'folder', label: '文件夹', chip: 'folder' },
  courseware: { icon: 'folder_special', label: '教师课件', chip: 'folder' },
  video: { icon: 'movie', label: '视频', chip: 'video' },
  image: { icon: 'image', label: '图片', chip: 'image' },
  pdf: { icon: 'picture_as_pdf', label: 'PDF', chip: 'doc' },
  ppt: { icon: 'slideshow', label: '演示', chip: 'doc' },
  doc: { icon: 'description', label: '文档', chip: 'doc' },
  xls: { icon: 'table_chart', label: '表格', chip: 'doc' },
  zip: { icon: 'folder_zip', label: '压缩包', chip: 'all' },
  file: { icon: 'draft', label: '文件', chip: 'all' }
}

const filterChips = [
  { id: 'all', label: '全部' },
  { id: 'folder', label: '文件夹' },
  { id: 'image', label: '图片' },
  { id: 'video', label: '视频' },
  { id: 'doc', label: '文档' }
]

const filteredResources = computed(() => {
  const list = resources.value
  const chip = filterChip.value
  if (chip === 'all') return list
  return list.filter((item) => {
    const k = fileKind(item)
    const meta = kindMeta[k] || kindMeta.file
    return meta.chip === chip
  })
})

const metaLine = (item) => {
  const parts = []
  if (item.created_at) parts.push(item.created_at)
  if (item.size_label && item.size_label !== '-') parts.push(item.size_label)
  return parts.join(' · ')
}

/**
 * #326 / #360 进入路径：
 * 1) 拉取远程 chaoxing_class 配置
 * 2) SSO
 * 3) 有本地 last-class → 拉资料；若 not_joined 才进入「重新加入」
 * 4) 新人（无 last-class）→ 永远欢迎入班页，不直连资料库、不展示重加文案
 */
const boot = async () => {
  loadingBoot.value = true
  error.value = ''
  needsRejoin.value = false
  try {
    const remote = await fetchRemoteConfig({ force: false }).catch(() => null)
    classConfig.value = getChaoxingClassConfig(remote || undefined)
  } catch {
    classConfig.value = getChaoxingClassConfig()
  }
  loadDeclined()
  const saved = loadLastClass()

  // #351：有本地班级缓存时先露出资料页壳，SSO 在后台完成
  bootPhase.value = 'sso'
  ssoHint.value = '正在连接学习通会话…'
  if (saved) {
    activeClass.value = saved
    bootPhase.value = 'ready'
    loadingBoot.value = false
  }

  const ssoOk = await ensureSso()
  if (!ssoOk) {
    bootPhase.value = 'error'
    loadingBoot.value = false
    return
  }

  // 有历史入班记录：拉资料；退课则 needsRejoin
  if (saved) {
    try {
      await loadResources()
    } catch (e) {
      const msg = formatErr(e)
      if (isNotJoinedSignal(msg)) {
        await enterNotJoinedState({
          openDialog: true,
          rejoin: true,
          reason: '你已不在该班级，请重新加入'
        })
      } else {
        error.value = msg
      }
    }
    return
  }

  // 新人：固定欢迎页 + 入班确认，绝不静默当「已入班」
  activeClass.value = null
  resources.value = []
  error.value = ''
  needsRejoin.value = false
  preview.value = { ...classMeta.value }
  bootPhase.value = 'ready'
  loadingBoot.value = false

  if (joinDeclined.value) {
    statusMsg.value = ''
    return
  }

  try {
    void fetchPreview().catch(() => {})
    showJoinDialog.value = true
  } catch (e) {
    error.value = formatErr(e)
    bootPhase.value = 'error'
  }
}

onMounted(() => {
  void boot()
})
</script>

<template>
  <div class="cx-page">
    <TPageHeader title="学习通" icon="menu_book" @back="emit('back')">
      <template v-if="isJoined" #actions>
        <button
          type="button"
          class="cx-icon-btn"
          :disabled="loadingResources"
          title="刷新资料"
          @click="loadResources"
        >
          <span class="material-symbols-outlined" :class="{ spin: loadingResources }">refresh</span>
        </button>
      </template>
    </TPageHeader>

    <!-- 启动中 -->
    <div v-if="loadingBoot" class="cx-boot">
      <div class="cx-spinner" />
      <p class="cx-boot-text">
        {{
          bootPhase === 'sso'
            ? '正在连接学习通…'
            : bootPhase === 'preview'
              ? '正在获取班级信息…'
              : '加载中…'
        }}
      </p>
      <p class="cx-boot-sub">通过校园门户 SSO 接入，无需学习通密码</p>
    </div>

    <template v-else>
      <!-- SSO 状态条（仅异常时强调） -->
      <div
        v-if="!ssoReady || ssoHint"
        class="cx-sso-chip"
        :class="{ ok: ssoReady, bad: !ssoReady }"
        role="status"
      >
        <span class="cx-sso-dot" />
        <span class="cx-sso-label">{{ ssoReady ? ssoHint || '门户已连接' : ssoHint || '会话异常' }}</span>
        <button v-if="!ssoReady" type="button" class="cx-link-btn" @click="boot">重试</button>
        <button v-if="!ssoReady" type="button" class="cx-link-btn" @click="emit('back')">去登录</button>
      </div>

      <div v-if="error" class="cx-alert" role="alert">
        <p class="cx-alert-text">{{ error }}</p>
        <button
          v-if="isJoined"
          type="button"
          class="cx-btn secondary sm"
          :disabled="loadingResources"
          @click="loadResources"
        >
          重试加载
        </button>
      </div>

      <!-- 已入班：Nimbus 资料列表 -->
      <template v-if="isJoined">
        <header class="cx-nimbus-head">
          <div class="cx-nimbus-title-row">
            <div class="cx-nimbus-titles">
              <h2 class="cx-nimbus-course">
                {{ courseTitle }}
                <span class="material-symbols-outlined cx-drop">arrow_drop_down</span>
              </h2>
              <p v-if="teacherName" class="cx-nimbus-sub">
                {{ teacherName }} · {{ statusMsg || `${resourceCount} 项` }}
              </p>
            </div>
          </div>

          <!-- 筛选 chips -->
          <div class="cx-chips" role="tablist" aria-label="资料筛选">
            <button
              v-for="chip in filterChips"
              :key="chip.id"
              type="button"
              role="tab"
              class="cx-chip"
              :class="{ active: filterChip === chip.id }"
              :aria-selected="filterChip === chip.id"
              @click="filterChip = chip.id"
            >
              {{ chip.label }}
            </button>
          </div>

          <div class="cx-toolbar">
            <span class="cx-toolbar-label">
              {{ currentFolder?.name || '智能排序' }}
              <span class="material-symbols-outlined">expand_more</span>
            </span>
            <span class="cx-toolbar-meta">{{ filteredResources.length }} 项</span>
          </div>

          <!-- 面包屑 -->
          <nav v-if="folderStack.length" class="cx-breadcrumb" aria-label="资料路径">
            <button
              v-for="(label, idx) in breadcrumbLabels"
              :key="`${idx}-${label}`"
              type="button"
              class="cx-crumb"
              :class="{ current: idx === breadcrumbLabels.length - 1 }"
              :disabled="idx === breadcrumbLabels.length - 1 || loadingResources"
              @click="handleBreadcrumb(idx)"
            >
              {{ label }}
              <span
                v-if="idx < breadcrumbLabels.length - 1"
                class="material-symbols-outlined cx-crumb-chev"
                aria-hidden="true"
                >chevron_right</span
              >
            </button>
          </nav>
        </header>

        <main class="cx-list">
          <div v-if="loadingResources" class="cx-skeleton-list">
            <div v-for="n in 5" :key="n" class="cx-skeleton-row" />
          </div>

          <div v-else-if="!filteredResources.length" class="cx-empty">
            <span class="material-symbols-outlined">folder_off</span>
            <p>暂无资料</p>
            <p class="sub">
              {{
                filterChip !== 'all'
                  ? '当前筛选下没有内容'
                  : currentFolder
                    ? '此文件夹为空'
                    : '教师上传后将显示在这里'
              }}
            </p>
            <button
              v-if="folderStack.length"
              type="button"
              class="cx-btn secondary"
              @click="handleBreadcrumb(folderStack.length - 1)"
            >
              返回上级
            </button>
          </div>

          <template v-else>
            <article
              v-for="item in filteredResources"
              :key="item.data_id || item.name + item.folder_kind"
              class="cx-row"
              :class="{ folder: item.is_folder }"
              role="button"
              tabindex="0"
              @click="handleRowClick(item)"
              @keydown.enter.prevent="handleRowClick(item)"
            >
              <div class="cx-thumb" :data-kind="fileKind(item)">
                <img
                  v-if="showThumb(item)"
                  class="cx-thumb-img"
                  :src="item.thumbnail_url"
                  :alt="item.name"
                  loading="lazy"
                  referrerpolicy="no-referrer"
                  @error="onThumbError(item)"
                />
                <span v-else class="material-symbols-outlined fill">{{
                  kindMeta[fileKind(item)].icon
                }}</span>
              </div>
              <div class="cx-row-main">
                <h3 class="cx-row-name" :title="item.name">{{ item.name }}</h3>
                <p v-if="metaLine(item)" class="cx-row-meta">
                  <span
                    v-if="fileKind(item) === 'image' || fileKind(item) === 'video'"
                    class="cx-last-tag"
                    >{{ kindMeta[fileKind(item)].label }}</span
                  >
                  {{ metaLine(item) }}
                </p>
                <p v-else-if="item.is_folder" class="cx-row-meta">
                  {{ kindMeta[fileKind(item)].label }}
                </p>
              </div>
              <div class="cx-row-trail" @click.stop>
                <template v-if="item.is_folder">
                  <span class="material-symbols-outlined cx-chev">chevron_right</span>
                </template>
                <template v-else>
                  <button
                    type="button"
                    class="cx-trail-btn"
                    :disabled="!!actingId"
                    title="下载"
                    @click="handleDownloadResource(item)"
                  >
                    <span class="material-symbols-outlined">
                      {{ actingId === `d-${item.data_id}` ? 'progress_activity' : 'download' }}
                    </span>
                  </button>
                </template>
              </div>
            </article>
          </template>

          <p class="cx-secure-note">
            <span class="material-symbols-outlined">verified_user</span>
            学习通资料经门户 SSO 安全访问
          </p>
        </main>
      </template>

      <!-- 未入班 -->
      <template v-else>
        <section class="cx-welcome">
          <div class="cx-welcome-card">
            <div class="cx-welcome-badge">班级资料库</div>
            <div v-if="coverUrl" class="cx-welcome-cover">
              <img :src="coverUrl" alt="" />
            </div>
            <div v-else class="cx-welcome-icon">
              <span class="material-symbols-outlined fill">cloud</span>
            </div>
            <h2>{{ courseTitle || '学习通班级' }}</h2>
            <p v-if="teacherName" class="cx-welcome-teacher">任课教师 · {{ teacherName }}</p>
            <p class="cx-welcome-desc">
              本模块提供班级课件与资料的预览、下载。邀请码由管理员远程配置，加入时无需手填。
            </p>
            <div class="cx-welcome-actions">
              <button type="button" class="cx-btn primary lg" @click="reopenJoinDialog">
                {{ needsRejoin ? '重新加入班级' : '加入班级并查看资料' }}
              </button>
            </div>
            <p v-if="needsRejoin" class="cx-welcome-note">
              {{ statusMsg || '检测到你已不在该班级，可重新加入后查看资料。' }}
            </p>
            <p v-else-if="joinDeclined" class="cx-welcome-note">你之前选择了暂不加入，可随时再次加入。</p>
          </div>
        </section>
      </template>
    </template>

    <!-- 官方预览弹层（对齐学习通：切换打开方式 + 下载） -->
    <Teleport to="body">
      <div
        v-if="showPreviewModal"
        class="cx-preview-root"
        role="dialog"
        aria-modal="true"
        :aria-label="previewModalTitle || '资料预览'"
      >
        <div class="cx-preview-backdrop" @click="closePreviewModal" />
        <div class="cx-preview-sheet">
          <header class="cx-preview-head">
            <div class="cx-preview-titles">
              <p class="cx-preview-kicker">
                {{ previewModalOfficial ? '学习通官方预览' : '资料预览' }}
              </p>
              <h3 class="cx-preview-title">{{ previewModalTitle }}</h3>
              <p v-if="currentOpenMethod" class="cx-preview-method-hint">
                当前：{{ currentOpenMethod.label }}
              </p>
            </div>
            <div class="cx-preview-head-actions">
              <button
                type="button"
                class="cx-icon-btn"
                aria-label="关闭"
                @click="closePreviewModal"
              >
                <span class="material-symbols-outlined">close</span>
              </button>
            </div>
          </header>

          <div class="cx-preview-body" @click="showOpenMethodMenu = false">
            <div v-if="previewModalLoading" class="cx-preview-state">
              <div class="cx-spinner" />
              <p>正在获取预览…</p>
            </div>
            <div v-else-if="previewModalError && !previewModalUrl" class="cx-preview-state err">
              <span class="material-symbols-outlined">error</span>
              <p>{{ previewModalError }}</p>
              <div class="cx-preview-state-actions">
                <button
                  type="button"
                  class="cx-btn secondary"
                  @click.stop="toggleOpenMethodMenu"
                >
                  切换打开方式
                </button>
                <button
                  v-if="previewDownloadUrl || previewOpenMethods.some((m) => m.kind === 'download')"
                  type="button"
                  class="cx-btn primary"
                  :disabled="previewDownloading"
                  @click.stop="handlePreviewDownload"
                >
                  {{ previewDownloading ? '下载中…' : '下载' }}
                </button>
              </div>
            </div>
            <template v-else>
              <p v-if="previewModalError" class="cx-preview-warn">{{ previewModalError }}</p>
              <!-- 图片：用 img 直出，避免 iframe 黑屏（WebView 不共享 Rust cookie） -->
              <div
                v-if="previewModalMode === 'image' && previewModalUrl"
                class="cx-preview-image-wrap"
              >
                <img
                  class="cx-preview-image"
                  :src="previewModalUrl"
                  :alt="previewModalTitle"
                  referrerpolicy="no-referrer"
                  @error="onPreviewImageError"
                />
              </div>
              <video
                v-else-if="previewModalMode === 'video' && previewModalUrl"
                class="cx-preview-video"
                :src="previewModalUrl"
                controls
                playsinline
              />
              <iframe
                v-else-if="previewModalUrl"
                class="cx-preview-frame"
                :src="previewModalUrl"
                title="资料预览"
                allow="fullscreen; autoplay"
                referrerpolicy="no-referrer-when-downgrade"
              />
              <div v-else class="cx-preview-state">
                <span class="material-symbols-outlined">visibility_off</span>
                <p>暂无内嵌预览内容</p>
                <p class="sub">请使用下方「切换打开方式」或「下载」</p>
              </div>
            </template>
          </div>

          <!-- 底栏：切换打开方式 + 下载（对齐学习通） -->
          <footer class="cx-preview-toolbar" v-if="!previewModalLoading">
            <div class="cx-preview-toolbar-inner">
              <div class="cx-open-method-wrap">
                <button
                  type="button"
                  class="cx-toolbar-btn method"
                  :class="{ open: showOpenMethodMenu }"
                  :disabled="!previewOpenMethods.length"
                  @click.stop="toggleOpenMethodMenu"
                >
                  <span class="material-symbols-outlined">swap_horiz</span>
                  <span class="cx-toolbar-btn-text">
                    <span class="cx-toolbar-btn-label">切换打开方式</span>
                    <span class="cx-toolbar-btn-sub">{{
                      currentOpenMethod?.label || '选择方式'
                    }}</span>
                  </span>
                  <span class="material-symbols-outlined cx-chev-sm">{{
                    showOpenMethodMenu ? 'expand_less' : 'expand_more'
                  }}</span>
                </button>

                <div
                  v-if="showOpenMethodMenu"
                  class="cx-open-method-menu"
                  role="menu"
                  @click.stop
                >
                  <p class="cx-open-method-menu-title">选择打开方式</p>
                  <button
                    v-for="m in previewOpenMethods"
                    :key="m.id"
                    type="button"
                    class="cx-open-method-item"
                    :class="{ active: m.id === previewMethodId }"
                    role="menuitem"
                    @click="applyOpenMethod(m)"
                  >
                    <span class="material-symbols-outlined">{{ m.icon }}</span>
                    <span class="cx-open-method-item-text">
                      <span class="name">{{ m.label }}</span>
                      <span class="desc">{{ m.desc }}</span>
                    </span>
                    <span
                      v-if="m.id === previewMethodId"
                      class="material-symbols-outlined check"
                      >check</span
                    >
                  </button>
                </div>
              </div>

              <button
                type="button"
                class="cx-toolbar-btn browser"
                :disabled="previewModalLoading"
                title="浏览器打开"
                @click="handleBrowserOpenCurrent"
              >
                <span class="material-symbols-outlined">open_in_browser</span>
                <span class="cx-toolbar-btn-label only">浏览器</span>
              </button>

              <button
                type="button"
                class="cx-toolbar-btn download"
                :disabled="previewDownloading || (!previewDownloadUrl && !previewItem)"
                @click="handlePreviewDownload"
              >
                <span class="material-symbols-outlined">
                  {{ previewDownloading ? 'progress_activity' : 'download' }}
                </span>
                <span class="cx-toolbar-btn-label only">{{
                  previewDownloading ? '下载中' : '下载'
                }}</span>
              </button>
            </div>
          </footer>
        </div>
      </div>
    </Teleport>

    <!-- 首次入班确认 -->
    <Teleport to="body">
      <div
        v-if="showJoinDialog"
        class="cx-dialog-root"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cx-join-title"
      >
        <div class="cx-dialog-backdrop" @click="markDeclined" />
        <div class="cx-dialog">
          <div class="cx-dialog-cover" :class="{ empty: !coverUrl }">
            <img v-if="coverUrl" :src="coverUrl" alt="" />
            <span v-else class="material-symbols-outlined fill">menu_book</span>
          </div>
          <p class="cx-dialog-kicker">{{ needsRejoin ? '重新加入' : '加入班级' }}</p>
          <h3 id="cx-join-title">是否加入班级？</h3>
          <p class="cx-dialog-course">{{ courseTitle || '班级' }}</p>
          <p v-if="teacherName" class="cx-dialog-teacher">教师 {{ teacherName }}</p>
          <p class="cx-dialog-desc">
            加入后可浏览与下载本班资料。认证仅使用校园门户登录态，不会要求学习通密码。
          </p>
          <div class="cx-dialog-actions">
            <button
              type="button"
              class="cx-btn dialog-secondary"
              :disabled="loadingJoin"
              @click="markDeclined"
            >
              暂不加入
            </button>
            <button
              type="button"
              class="cx-btn dialog-primary"
              :disabled="loadingJoin"
              @click="handleJoinConfirm"
            >
              {{ loadingJoin ? '加入中…' : '加入班级' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
/* Nimbus / Lumina Cloud Storage tokens */
.cx-page {
  --cx-bg: #f7f9fb;
  --cx-surface: #ffffff;
  --cx-surface-low: #f2f4f6;
  --cx-surface-high: #e6e8ea;
  --cx-surface-highest: #e0e3e5;
  --cx-on: #191c1e;
  --cx-on-var: #434655;
  --cx-outline: #737686;
  --cx-outline-var: #c3c6d7;
  --cx-primary: #004ac6;
  --cx-primary-soft: #2563eb;
  --cx-primary-fixed: #dbe1ff;
  --cx-tertiary-fixed: #d3e4fe;
  --cx-error: #ba1a1a;
  --cx-error-container: #ffdad6;
  --cx-shadow-soft: 0 10px 30px rgba(0, 0, 0, 0.05);
  --cx-radius: 0.5rem;
  --cx-radius-lg: 1rem;
  position: relative;
  min-height: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 0 0 48px;
  color: var(--cx-on);
  background: var(--cx-bg);
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
}

:global(html.dark) .cx-page {
  --cx-bg: #121416;
  --cx-surface: #1c1f22;
  --cx-surface-low: #23272a;
  --cx-surface-high: #2d3133;
  --cx-surface-highest: #363a3d;
  --cx-on: #eff1f3;
  --cx-on-var: #c3c6d7;
  --cx-outline: #8d90a0;
  --cx-outline-var: #434655;
  --cx-primary: #b4c5ff;
  --cx-primary-soft: #8aa4ff;
  --cx-primary-fixed: #1a2f66;
  --cx-tertiary-fixed: #243246;
  --cx-error: #ffb4ab;
  --cx-error-container: #93000a;
  --cx-shadow-soft: 0 10px 30px rgba(0, 0, 0, 0.35);
}

.cx-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--cx-on-var);
  cursor: pointer;
}

.cx-icon-btn:hover:not(:disabled) {
  background: var(--cx-surface-high);
  color: var(--cx-on);
}

.cx-icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.spin {
  animation: cx-spin 0.9s linear infinite;
}

@keyframes cx-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Boot */
.cx-boot {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 42vh;
  padding: 32px 20px;
  text-align: center;
}

.cx-boot-text {
  margin: 8px 0 0;
  font-weight: 600;
  font-size: 16px;
}

.cx-boot-sub {
  margin: 0;
  font-size: 13px;
  color: var(--cx-outline);
}

.cx-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid var(--cx-outline-var);
  border-top-color: var(--cx-primary);
  border-radius: 50%;
  animation: cx-spin 0.8s linear infinite;
}

/* SSO chip */
.cx-sso-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 16px 0;
  padding: 8px 12px;
  border-radius: var(--cx-radius);
  background: var(--cx-surface-low);
  border: 1px solid var(--cx-outline-var);
  font-size: 12px;
  color: var(--cx-on-var);
}

.cx-sso-chip.ok {
  border-color: color-mix(in srgb, #16a34a 30%, var(--cx-outline-var));
}

.cx-sso-chip.bad {
  background: var(--cx-error-container);
  color: var(--cx-error);
  border-color: transparent;
}

.cx-sso-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--cx-outline);
  flex-shrink: 0;
}

.cx-sso-chip.ok .cx-sso-dot {
  background: #16a34a;
}

.cx-sso-chip.bad .cx-sso-dot {
  background: var(--cx-error);
}

.cx-sso-label {
  flex: 1;
  min-width: 0;
}

.cx-link-btn {
  border: none;
  background: transparent;
  color: var(--cx-primary);
  font-weight: 600;
  font-size: 12px;
  cursor: pointer;
  padding: 0 4px;
}

.cx-alert {
  margin: 10px 16px 0;
  padding: 10px 12px;
  border-radius: var(--cx-radius);
  background: var(--cx-error-container);
  color: var(--cx-error);
  font-size: 13px;
  line-height: 1.45;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.cx-alert-text {
  margin: 0;
  flex: 1 1 200px;
  min-width: 0;
}

/* Sticky nimbus header */
.cx-nimbus-head {
  position: sticky;
  top: 0;
  z-index: 5;
  padding: 12px 16px 8px;
  background: color-mix(in srgb, var(--cx-bg) 92%, transparent);
  backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--cx-outline-var);
}

.cx-nimbus-title-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.cx-nimbus-course {
  margin: 0;
  font-family: Manrope, Inter, system-ui, sans-serif;
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.01em;
  line-height: 1.25;
  display: flex;
  align-items: center;
  gap: 2px;
  color: var(--cx-on);
}

.cx-drop {
  font-size: 20px;
  color: var(--cx-on-var);
}

.cx-nimbus-sub {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--cx-outline);
  letter-spacing: 0.02em;
}

/* Chips */
.cx-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 10px;
  scrollbar-width: none;
}

.cx-chips::-webkit-scrollbar {
  display: none;
}

.cx-chip {
  flex-shrink: 0;
  border: none;
  border-radius: 999px;
  padding: 6px 16px;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  background: var(--cx-surface-high);
  color: var(--cx-on-var);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.cx-chip.active {
  background: var(--cx-on);
  color: var(--cx-bg);
}

:global(html.dark) .cx-chip.active {
  background: var(--cx-primary-fixed);
  color: var(--cx-primary);
}

.cx-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--cx-on-var);
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.04em;
  padding: 2px 0 6px;
}

.cx-toolbar-label {
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.cx-toolbar-label .material-symbols-outlined {
  font-size: 16px;
}

.cx-toolbar-meta {
  color: var(--cx-outline);
}

/* Breadcrumb */
.cx-breadcrumb {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0;
  padding: 4px 0 2px;
  font-size: 12px;
}

.cx-crumb {
  display: inline-flex;
  align-items: center;
  border: none;
  background: transparent;
  color: var(--cx-primary);
  font-weight: 500;
  font-size: 12px;
  letter-spacing: 0.03em;
  padding: 2px 0;
  cursor: pointer;
}

.cx-crumb.current {
  color: var(--cx-outline);
  cursor: default;
}

.cx-crumb:disabled {
  opacity: 1;
}

.cx-crumb-chev {
  font-size: 14px;
  color: var(--cx-outline);
  margin: 0 2px;
}

/* List */
.cx-list {
  padding: 4px 16px 24px;
}

.cx-row {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 12px 0;
  border-bottom: 1px solid var(--cx-surface-high);
  cursor: pointer;
  transition: background 0.12s ease;
  border-radius: 4px;
  outline: none;
}

.cx-row:hover,
.cx-row:focus-visible {
  background: var(--cx-surface-low);
}

.cx-row:active {
  background: var(--cx-surface-high);
}

.cx-thumb {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-right: 14px;
  background: var(--cx-tertiary-fixed);
  color: var(--cx-primary);
  overflow: hidden;
}

.cx-thumb .material-symbols-outlined {
  font-size: 26px;
}

.cx-thumb .fill {
  font-variation-settings: 'FILL' 1;
}

.cx-thumb-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.cx-thumb[data-kind='video'] {
  background: color-mix(in srgb, #8b5cf6 18%, var(--cx-tertiary-fixed));
  color: #6d28d9;
}

.cx-thumb[data-kind='image'] {
  background: color-mix(in srgb, #0ea5e9 16%, var(--cx-tertiary-fixed));
  color: #0369a1;
}

.cx-thumb[data-kind='pdf'],
.cx-thumb[data-kind='doc'],
.cx-thumb[data-kind='ppt'],
.cx-thumb[data-kind='xls'] {
  background: color-mix(in srgb, var(--cx-primary) 12%, var(--cx-tertiary-fixed));
}

:global(html.dark) .cx-thumb[data-kind='video'] {
  color: #c4b5fd;
}
:global(html.dark) .cx-thumb[data-kind='image'] {
  color: #7dd3fc;
}

.cx-row-main {
  flex: 1;
  min-width: 0;
}

.cx-row-name {
  margin: 0;
  font-size: 16px;
  font-weight: 500;
  line-height: 1.35;
  color: var(--cx-on);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cx-row-meta {
  margin: 3px 0 0;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.03em;
  color: var(--cx-outline);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.cx-last-tag {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--cx-tertiary-fixed);
  color: var(--cx-primary);
}

.cx-row-trail {
  flex-shrink: 0;
  margin-left: 8px;
  display: flex;
  align-items: center;
}

.cx-chev {
  color: var(--cx-outline-var);
  font-size: 22px;
}

.cx-trail-btn {
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 999px;
  background: transparent;
  color: var(--cx-on-var);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.cx-trail-btn:hover:not(:disabled) {
  background: var(--cx-surface-high);
  color: var(--cx-primary);
}

.cx-trail-btn:disabled {
  opacity: 0.5;
}

.cx-secure-note {
  margin: 28px 0 8px;
  text-align: center;
  font-size: 12px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--cx-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.cx-secure-note .material-symbols-outlined {
  font-size: 16px;
}

/* Skeleton / empty */
.cx-skeleton-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.cx-skeleton-row {
  height: 72px;
  border-bottom: 1px solid var(--cx-surface-high);
  background: linear-gradient(
    90deg,
    var(--cx-surface-low) 25%,
    var(--cx-surface-high) 50%,
    var(--cx-surface-low) 75%
  );
  background-size: 200% 100%;
  animation: cx-shimmer 1.2s ease infinite;
  border-radius: 4px;
  margin: 4px 0;
}

@keyframes cx-shimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.cx-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 48px 16px;
  text-align: center;
  color: var(--cx-outline);
}

.cx-empty .material-symbols-outlined {
  font-size: 40px;
  opacity: 0.7;
}

.cx-empty p {
  margin: 0;
  font-weight: 600;
  color: var(--cx-on-var);
}

.cx-empty .sub {
  font-weight: 400;
  font-size: 13px;
  color: var(--cx-outline);
}

/* Buttons */
.cx-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: none;
  border-radius: var(--cx-radius);
  padding: 10px 16px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s ease, opacity 0.15s ease;
}

.cx-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.cx-btn.primary {
  background: var(--cx-primary);
  color: #fff;
}

:global(html.dark) .cx-btn.primary {
  background: var(--cx-primary-soft);
  color: #0b1c3a;
}

.cx-btn.primary:hover:not(:disabled) {
  filter: brightness(0.95);
}

.cx-btn.secondary {
  background: transparent;
  color: var(--cx-on-var);
  border: 1px solid var(--cx-outline-var);
}

.cx-btn.secondary:hover:not(:disabled) {
  background: var(--cx-surface-low);
}

.cx-btn.ghost {
  background: transparent;
  color: var(--cx-on-var);
}

.cx-btn.lg {
  padding: 12px 20px;
  font-size: 15px;
  border-radius: 10px;
}

.cx-btn.sm {
  padding: 6px 10px;
  font-size: 12px;
}

/* Welcome */
.cx-welcome {
  padding: 28px 16px;
}

.cx-welcome-card {
  background: var(--cx-surface);
  border: 1px solid var(--cx-outline-var);
  border-radius: var(--cx-radius-lg);
  padding: 28px 22px;
  text-align: center;
  box-shadow: var(--cx-shadow-soft);
}

.cx-welcome-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--cx-primary);
  background: var(--cx-primary-fixed);
  padding: 4px 10px;
  border-radius: 999px;
  margin-bottom: 16px;
}

.cx-welcome-cover {
  width: 88px;
  height: 88px;
  margin: 0 auto 14px;
  border-radius: 16px;
  overflow: hidden;
}

.cx-welcome-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cx-welcome-icon {
  width: 72px;
  height: 72px;
  margin: 0 auto 14px;
  border-radius: 18px;
  background: var(--cx-tertiary-fixed);
  color: var(--cx-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cx-welcome-icon .material-symbols-outlined {
  font-size: 36px;
}

.cx-welcome-card h2 {
  margin: 0 0 6px;
  font-family: Manrope, Inter, system-ui, sans-serif;
  font-size: 22px;
  font-weight: 700;
}

.cx-welcome-teacher {
  margin: 0 0 10px;
  font-size: 13px;
  color: var(--cx-outline);
}

.cx-welcome-desc {
  margin: 0 0 20px;
  font-size: 14px;
  line-height: 1.55;
  color: var(--cx-on-var);
}

.cx-welcome-actions {
  display: flex;
  justify-content: center;
}

.cx-welcome-note {
  margin: 14px 0 0;
  font-size: 12px;
  color: var(--cx-outline);
}

/* Preview modal */
.cx-preview-root {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

@media (min-width: 720px) {
  .cx-preview-root {
    align-items: center;
    padding: 24px;
  }
}

.cx-preview-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(12px);
}

.cx-preview-sheet {
  position: relative;
  width: min(100%, 920px);
  height: min(92vh, 860px);
  display: flex;
  flex-direction: column;
  border-radius: 20px 20px 0 0;
  background: var(--cx-surface);
  border: 1px solid var(--cx-outline-var);
  box-shadow: var(--cx-shadow-soft);
  overflow: hidden;
  color: var(--cx-on);
}

@media (min-width: 720px) {
  .cx-preview-sheet {
    border-radius: 16px;
    height: min(88vh, 800px);
  }
}

.cx-preview-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--cx-outline-var);
  background: var(--cx-bg);
}

.cx-preview-kicker {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--cx-primary);
}

.cx-preview-title {
  margin: 4px 0 0;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.3;
  word-break: break-word;
}

.cx-preview-method-hint {
  margin: 4px 0 0;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--cx-outline);
}

.cx-preview-head-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  flex-shrink: 0;
}

.cx-preview-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--cx-surface-low);
}

.cx-preview-state .sub {
  margin: 0;
  font-size: 12px;
  color: var(--cx-outline);
  font-weight: 400;
}

.cx-preview-state-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  margin-top: 4px;
}

/* 底栏：切换打开方式 + 浏览器 + 下载 */
.cx-preview-toolbar {
  position: relative;
  z-index: 2;
  flex-shrink: 0;
  padding: 10px 12px calc(10px + env(safe-area-inset-bottom, 0px));
  border-top: 1px solid var(--cx-outline-var);
  background: var(--cx-surface);
}

.cx-preview-toolbar-inner {
  display: flex;
  align-items: stretch;
  gap: 8px;
}

.cx-open-method-wrap {
  position: relative;
  flex: 1;
  min-width: 0;
}

.cx-toolbar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid var(--cx-outline-var);
  border-radius: 10px;
  background: var(--cx-surface-low);
  color: var(--cx-on);
  padding: 10px 12px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  min-height: 48px;
  transition: background 0.12s ease, border-color 0.12s ease;
}

.cx-toolbar-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.cx-toolbar-btn.method {
  width: 100%;
  justify-content: flex-start;
  text-align: left;
}

.cx-toolbar-btn.method.open {
  border-color: color-mix(in srgb, var(--cx-primary) 45%, var(--cx-outline-var));
  background: color-mix(in srgb, var(--cx-primary) 8%, var(--cx-surface));
}

.cx-toolbar-btn.browser {
  flex-direction: column;
  gap: 2px;
  min-width: 64px;
  padding: 8px 10px;
  color: var(--cx-on-var);
}

.cx-toolbar-btn.download {
  flex-direction: column;
  gap: 2px;
  min-width: 68px;
  padding: 8px 12px;
  border: none;
  background: var(--cx-primary);
  color: #fff;
}

:global(html.dark) .cx-toolbar-btn.download {
  background: var(--cx-primary-soft);
  color: #0b1c3a;
}

.cx-toolbar-btn.download:hover:not(:disabled) {
  filter: brightness(0.96);
}

.cx-toolbar-btn.browser:hover:not(:disabled),
.cx-toolbar-btn.method:hover:not(:disabled) {
  background: var(--cx-surface-high);
}

.cx-toolbar-btn .material-symbols-outlined {
  font-size: 22px;
  flex-shrink: 0;
}

.cx-toolbar-btn-text {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
  flex: 1;
}

.cx-toolbar-btn-label {
  font-size: 13px;
  font-weight: 700;
  line-height: 1.2;
}

.cx-toolbar-btn-label.only {
  font-size: 11px;
  font-weight: 600;
}

.cx-toolbar-btn-sub {
  font-size: 11px;
  font-weight: 500;
  color: var(--cx-outline);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cx-chev-sm {
  font-size: 20px !important;
  color: var(--cx-outline);
  margin-left: auto;
}

.cx-open-method-menu {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 8px);
  max-height: min(52vh, 360px);
  overflow: auto;
  background: var(--cx-surface);
  border: 1px solid var(--cx-outline-var);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16);
  padding: 8px;
  z-index: 5;
}

.cx-open-method-menu-title {
  margin: 0 8px 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: var(--cx-outline);
  text-transform: uppercase;
}

.cx-open-method-item {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  border: none;
  background: transparent;
  border-radius: 10px;
  padding: 10px 10px;
  cursor: pointer;
  text-align: left;
  color: var(--cx-on);
}

.cx-open-method-item:hover {
  background: var(--cx-surface-low);
}

.cx-open-method-item.active {
  background: color-mix(in srgb, var(--cx-primary) 10%, var(--cx-surface-low));
}

.cx-open-method-item .material-symbols-outlined {
  font-size: 22px;
  color: var(--cx-primary);
  flex-shrink: 0;
}

.cx-open-method-item .check {
  margin-left: auto;
  color: var(--cx-primary);
  font-size: 20px;
}

.cx-open-method-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cx-open-method-item-text .name {
  font-size: 14px;
  font-weight: 650;
}

.cx-open-method-item-text .desc {
  font-size: 11px;
  color: var(--cx-outline);
  font-weight: 500;
}

.cx-preview-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  text-align: center;
  color: var(--cx-on-var);
}

.cx-preview-state.err {
  color: var(--cx-error);
}

.cx-preview-warn {
  margin: 0;
  padding: 8px 12px;
  font-size: 12px;
  background: var(--cx-error-container);
  color: var(--cx-error);
}

.cx-preview-frame {
  flex: 1;
  width: 100%;
  border: none;
  background: var(--cx-surface-low);
  min-height: 0;
}

.cx-preview-image-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 12px;
  background: var(--cx-surface-low);
  overflow: auto;
}

.cx-preview-image {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
  border-radius: 8px;
  box-shadow: var(--cx-shadow-soft);
  background: #fff;
}

.cx-preview-video {
  flex: 1;
  width: 100%;
  min-height: 0;
  background: #000;
  outline: none;
}

/* Join dialog */
.cx-dialog-root {
  position: fixed;
  inset: 0;
  z-index: 10000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.cx-dialog-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(12px);
}

.cx-dialog {
  position: relative;
  width: min(100%, 400px);
  background: var(--cx-surface);
  border: 1px solid var(--cx-outline-var);
  border-radius: var(--cx-radius-lg);
  padding: 22px 20px 18px;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.18);
  color: var(--cx-on);
  text-align: center;
}

.cx-dialog-cover {
  width: 72px;
  height: 72px;
  margin: 0 auto 12px;
  border-radius: 16px;
  overflow: hidden;
  background: var(--cx-tertiary-fixed);
  color: var(--cx-primary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.cx-dialog-cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.cx-dialog-cover.empty .material-symbols-outlined {
  font-size: 32px;
}

.cx-dialog-kicker {
  margin: 0;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  color: var(--cx-primary);
  text-transform: uppercase;
}

.cx-dialog h3 {
  margin: 6px 0 4px;
  font-family: Manrope, Inter, system-ui, sans-serif;
  font-size: 20px;
  font-weight: 700;
}

.cx-dialog-course {
  margin: 0;
  font-weight: 600;
  font-size: 15px;
}

.cx-dialog-teacher {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--cx-outline);
}

.cx-dialog-desc {
  margin: 12px 0 18px;
  font-size: 13px;
  line-height: 1.55;
  color: var(--cx-on-var);
}

.cx-dialog-actions {
  display: flex;
  gap: 10px;
  justify-content: stretch;
}

.cx-dialog-actions .cx-btn {
  flex: 1;
  min-height: 44px;
  border-radius: 10px;
  font-weight: 700;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
}

/* 弹层双按钮：实心底，避免透明「悬浮」难认成按钮 */
.cx-btn.dialog-secondary {
  background: var(--cx-surface-high);
  color: var(--cx-on);
  border: 1px solid var(--cx-outline-var);
}

.cx-btn.dialog-secondary:hover:not(:disabled) {
  background: var(--cx-surface-highest);
}

.cx-btn.dialog-primary {
  background: var(--cx-primary);
  color: #fff;
  border: 1px solid transparent;
}

:global(html.dark) .cx-btn.dialog-primary {
  background: var(--cx-primary-soft);
  color: #0b1c3a;
}

.cx-btn.dialog-primary:hover:not(:disabled) {
  filter: brightness(0.96);
}

:global(html.dark) .cx-btn.dialog-secondary {
  background: var(--cx-surface-high);
  color: var(--cx-on);
  border-color: var(--cx-outline-var);
}
</style>
