<script setup>
/**
 * 学习通班级资料 — Nimbus 云盘列表风格
 * - 邀请码：内置默认 + 远程 chaoxing_class.invite_code 覆盖并本地缓存
 * - 课程名/教师/封面：在线 preview，不硬编码
 * - 教师/学生均可访问资料（后端 ut=s/t）
 * - 门户 CAS → 学习通 SSO（不二次登录）
 */
import { computed, onMounted, ref } from 'vue'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { platformBridge } from '../platform'
import { openExternal } from '../utils/external_link'
import { fetchRemoteConfig, getChaoxingClassConfig } from '../utils/remote_config'
import { loadPortalRememberedPassword } from '../utils/credential_storage'
import { pushDebugLog } from '../utils/debug_logger'
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
  const msg = e?.message || e?.error || String(e)
  // 邀请码/SSO 详细诊断日志较长，原样保留便于设置→调试信息与截图反馈
  return String(msg || '未知错误')
}

const studentPayload = () => {
  const sid = String(props.studentId || '').trim()
  return sid ? { student_id: sid } : { student_id: null }
}

/** 学习通 SSO：附带前端本地备份的门户密码（iOS 密钥环常空，#367） */
const ssoPayload = async () => {
  const base = studentPayload()
  const sid = String(props.studentId || '').trim()
  if (!sid) return { ...base, portal_password: null }
  try {
    const pwd = String((await loadPortalRememberedPassword(sid)) || '').trim()
    return { ...base, portal_password: pwd || null }
  } catch {
    return { ...base, portal_password: null }
  }
}

const loadLastClass = () => {
  try {
    const raw = localStorage.getItem(LAST_CLASS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.course_id && parsed?.clazz_id) {
      const savedInvite = String(parsed.invite_code || '').trim()
      // 邀请码变更（含旧缓存无 invite 字段）时丢弃历史 last-class
      if (inviteCode.value && savedInvite !== inviteCode.value) {
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
    const m = String(resOrMsg.membership || '').toLowerCase()
    const role = String(resOrMsg.role || '').toLowerCase()
    const ut = String(resOrMsg.ut || '').toLowerCase()
    // 教师账号不在学生课程列表中，但 membership=ok / ut=t 仍可访问
    if (m === 'ok' || role === 'teacher' || ut === 't') return false
    if (m === 'not_joined' || m === 'not-joined') return true
    // 权威：backclazzdata enrolled=false 且非教师 → 未入班/已退课
    if (resOrMsg.enrolled === false || resOrMsg.enrolled === 0 || resOrMsg.enrolled === 'false') {
      return true
    }
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
    // #367：把 Web 加密备份的门户密码注入 native，供静默重登
    const req = await ssoPayload()
    const res = await invokeNative('chaoxing_class_ensure_sso', { req })
    ssoReady.value = !!(res?.success ?? res?.sso)
    ssoHint.value = ssoReady.value
      ? res?.partial
        ? '门户会话部分可用（已可访问固定班级）'
        : res?.from_cache || res?.cookie_reuse
          ? '学习通会话已复用'
          : res?.silent_relogin
            ? '已静默续期并接入学习通'
            : '门户 SSO 已连接'
      : '会话未就绪，请重新登录门户'
    return ssoReady.value
  } catch (e) {
    ssoReady.value = false
    const msg = formatErr(e)
    ssoHint.value = msg
    // 绿灯教务可用 ≠ 学习通可用：文案区分，避免用户以为“断网”
    error.value =
      msg.includes('过期') || msg.includes('登录') || msg.includes('密码')
        ? `${msg}（教务会话可能仍可用；学习通需门户 CAS 票据或记住密码以静默续期）`
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
  // #375：邀请码接口可能因假 SSO 复用失败，附带门户密码供静默重桥接
  const ssoReq = await ssoPayload()
  try {
    const res = await invokeNative('chaoxing_class_preview_invite', {
      req: {
        invite_code: code,
        student_id: ssoReq.student_id ?? null,
        portal_password: ssoReq.portal_password ?? null
      }
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
  } catch (e) {
    const msg = formatErr(e)
    // 写入设置→调试信息，便于用户反馈完整诊断行
    pushDebugLog('ChaoxingInvite', msg, 'error', {
      invite_code_len: code.length,
      student_id: ssoReq.student_id || null,
      has_portal_password: !!ssoReq.portal_password
    })
    throw e
  }
}

const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * 入班/重加成功后：强制回到已入班态，并多次自动刷新资料
 * （学习通侧入班后 backclazzdata/资料列表常有 1～数秒延迟，一次拉取易仍为空）
 */
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
  statusMsg.value = '正在同步班级资料…'
  // 入班后短时忽略 not_joined，避免延迟接口把 UI 打回欢迎页
  suppressNotJoinedUntil = Date.now() + 20_000

  // 立即 1 次 + 退避重试：覆盖「刚加入成功但列表尚未同步」
  const gapsMs = [0, 500, 1000, 1600, 2500, 3500]
  for (let i = 0; i < gapsMs.length; i++) {
    if (gapsMs[i] > 0) {
      statusMsg.value = `正在刷新资料…（${i}/${gapsMs.length - 1}）`
      await sleepMs(gapsMs[i])
    }
    // 防止重试过程中被误清
    if (!isJoined.value && cls?.course_id && cls?.clazz_id) {
      needsRejoin.value = false
      activeClass.value = cls
      preview.value = cls
      saveLastClass(cls)
      bootPhase.value = 'ready'
    }
    try {
      await loadResources()
    } catch {
      /* loadResources 内部已写 error */
    }
    if (resources.value.length > 0) {
      break
    }
  }

  if (!isJoined.value && cls?.course_id && cls?.clazz_id) {
    needsRejoin.value = false
    activeClass.value = cls
    preview.value = cls
    saveLastClass(cls)
    bootPhase.value = 'ready'
    // 最后再拉一次
    try {
      await loadResources()
    } catch {
      /* ignore */
    }
  }

  if (isJoined.value) {
    needsRejoin.value = false
    error.value = ''
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
    const ssoReq = await ssoPayload()
    const res = await invokeNative('chaoxing_class_accept_invite', {
      req: {
        invite_code: code,
        student_id: ssoReq.student_id ?? null,
        portal_password: ssoReq.portal_password ?? null
      }
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

/**
 * @param {{ rejoinOnNotJoined?: boolean }} [opts]
 * rejoinOnNotJoined：仅「曾有 last-class 又检测到未在班」为 true；新人探测为 false
 */
const loadResources = async (opts = {}) => {
  const rejoinOnNotJoined = opts.rejoinOnNotJoined === true
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

  const handleNotJoined = async () => {
    if (folderSnap) return false
    await enterNotJoinedState({
      openDialog: rejoinOnNotJoined || !joinDeclined.value,
      rejoin: rejoinOnNotJoined,
      reason: rejoinOnNotJoined ? '你已不在该班级，请重新加入' : ''
    })
    return true
  }

  try {
    let res
    try {
      res = await invokeOnce()
    } catch (e1) {
      const msg1 = formatErr(e1)
      if (seq !== loadSeq) return
      if (isNotJoinedSignal(msg1) && (await handleNotJoined())) return
      if (!isTransientListError(msg1)) throw e1
      await new Promise((r) => setTimeout(r, 200))
      if (seq !== loadSeq) return
      res = await invokeOnce()
    }
    if (seq !== loadSeq) return
    if (isNotJoinedSignal(res) && (await handleNotJoined())) return
    if (res?.cpi && activeClass.value) {
      activeClass.value = {
        ...activeClass.value,
        cpi: String(res.cpi),
        // 记住角色，便于下载走教师 ut
        role: String(res.role || activeClass.value.role || ''),
        ut: String(res.ut || activeClass.value.ut || 's')
      }
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
    if (isNotJoinedSignal(msg) && (await handleNotJoined())) return
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
 * 进入路径：
 * 1) 远程/缓存邀请码
 * 2) SSO
 * 3) 有 last-class → 拉资料；not_joined 才「重新加入」
 * 4) 无 last-class：preview 后教师/已在班直进资料，否则欢迎入班
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

  if (saved) {
    try {
      await loadResources({ rejoinOnNotJoined: true })
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

  // 无缓存：解析邀请码 → 教师可直接访问；学生未入班则欢迎
  activeClass.value = null
  resources.value = []
  error.value = ''
  needsRejoin.value = false
  bootPhase.value = 'preview'
  try {
    const p = await fetchPreview()
    preview.value = p
    activeClass.value = { ...p }
    bootPhase.value = 'ready'
    loadingBoot.value = false
    await loadResources({ rejoinOnNotJoined: false })
    if (isJoined.value) {
      saveLastClass(activeClass.value)
      statusMsg.value = resources.value.length
        ? `共 ${resources.value.length} 项`
        : '已可访问班级资料'
      return
    }
    // 未入班：欢迎/弹层（学生）
    preview.value = p
    if (!joinDeclined.value) {
      showJoinDialog.value = true
    }
    bootPhase.value = 'ready'
  } catch (e) {
    activeClass.value = null
    preview.value = { ...classMeta.value, invite_code: inviteCode.value }
    bootPhase.value = 'ready'
    loadingBoot.value = false
    if (!joinDeclined.value) {
      showJoinDialog.value = true
    }
    statusMsg.value = formatErr(e)
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
/*
 * 主题 token：页面 + Teleport 弹层（预览 / 入班对话框）共用
 * 弹层挂在 body 上，必须单独挂变量，否则暗色只剩页面内生效
 */
.cx-page,
.cx-preview-root,
.cx-dialog-root {
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
  --cx-primary-on: #ffffff;
  --cx-tertiary-fixed: #d3e4fe;
  --cx-error: #ba1a1a;
  --cx-error-container: #ffdad6;
  --cx-shadow-soft: 0 10px 30px rgba(0, 0, 0, 0.05);
  --cx-scrim: rgba(15, 23, 42, 0.48);
  --cx-radius: 0.5rem;
  --cx-radius-lg: 1rem;
  --cx-ios-label: #1c1c1e;
  --cx-ios-secondary: rgba(60, 60, 67, 0.55);
  --cx-ios-separator: rgba(60, 60, 67, 0.22);
  --cx-ios-fill: rgba(120, 120, 128, 0.14);
  --cx-ios-blue: #007aff;
  --cx-glass: rgba(242, 242, 247, 0.78);
  --cx-glass-border: rgba(255, 255, 255, 0.55);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-page,
:global(html:is(.dark, [data-theme='graphite_night'])) .cx-preview-root,
:global(html:is(.dark, [data-theme='graphite_night'])) .cx-dialog-root {
  --cx-bg: #0e1012;
  --cx-surface: #1a1d21;
  --cx-surface-low: #22262b;
  --cx-surface-high: #2c3136;
  --cx-surface-highest: #383e44;
  --cx-on: #f0f2f4;
  --cx-on-var: #c4c8d4;
  --cx-outline: #9aa0b0;
  --cx-outline-var: #3d424a;
  --cx-primary: #aec1ff;
  --cx-primary-soft: #8aa4ff;
  --cx-primary-fixed: #1e2f5c;
  --cx-primary-on: #0b1224;
  --cx-tertiary-fixed: #1e2a3a;
  --cx-error: #ffb4ab;
  --cx-error-container: #7a0f14;
  --cx-shadow-soft: 0 12px 36px rgba(0, 0, 0, 0.45);
  --cx-scrim: rgba(0, 0, 0, 0.62);
  --cx-ios-label: #f5f5f7;
  --cx-ios-secondary: rgba(235, 235, 245, 0.5);
  --cx-ios-separator: rgba(84, 84, 88, 0.65);
  --cx-ios-fill: rgba(120, 120, 128, 0.28);
  --cx-ios-blue: #0a84ff;
  --cx-glass: rgba(44, 44, 46, 0.72);
  --cx-glass-border: rgba(255, 255, 255, 0.14);
}

.cx-page {
  position: relative;
  min-height: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 0 0 48px;
  color: var(--cx-on);
  background: var(--cx-bg);
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
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

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-chip.active {
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

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-thumb[data-kind='video'] {
  color: #c4b5fd;
}
:global(html:is(.dark, [data-theme='graphite_night'])) .cx-thumb[data-kind='image'] {
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
  color: var(--cx-primary-on);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-btn.primary {
  background: var(--cx-primary-soft);
  color: var(--cx-primary-on);
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
  background: var(--cx-scrim);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
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
  color: var(--cx-primary-on);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-toolbar-btn.download {
  background: var(--cx-primary-soft);
  color: var(--cx-primary-on);
}

.cx-toolbar-btn.download:hover:not(:disabled) {
  filter: brightness(0.96);
}

.cx-toolbar-btn.browser:hover:not(:disabled),
.cx-toolbar-btn.method:hover:not(:disabled) {
  background: var(--cx-surface-high);
}

.cx-toolbar-btn .material-symbols-outlined,
.cx-preview-root .material-symbols-outlined {
  font-family: 'Material Symbols Outlined', sans-serif !important;
  font-weight: normal !important;
  font-size: 22px;
  line-height: 1;
  flex-shrink: 0;
  text-transform: none !important;
  font-feature-settings: 'liga' 1, 'clig' 1;
  -webkit-font-feature-settings: 'liga' 1;
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

/* iOS 风格毛玻璃菜单（Context Menu / Action Sheet） */
.cx-open-method-menu {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 10px);
  max-height: min(52vh, 360px);
  overflow: auto;
  z-index: 30;
  isolation: isolate;
  padding: 4px 0 6px;
  border-radius: 14px;
  background: var(--cx-glass);
  border: 0.5px solid var(--cx-glass-border);
  box-shadow:
    0 12px 40px rgba(0, 0, 0, 0.16),
    0 0 0 0.5px rgba(0, 0, 0, 0.04),
    inset 0 0.5px 0 rgba(255, 255, 255, 0.45);
  -webkit-backdrop-filter: saturate(180%) blur(40px);
  backdrop-filter: saturate(180%) blur(40px);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-open-method-menu {
  box-shadow:
    0 14px 44px rgba(0, 0, 0, 0.48),
    0 0 0 0.5px rgba(255, 255, 255, 0.08),
    inset 0 0.5px 0 rgba(255, 255, 255, 0.08);
}

@supports not ((-webkit-backdrop-filter: blur(1px)) or (backdrop-filter: blur(1px))) {
  .cx-open-method-menu {
    background: color-mix(in srgb, var(--cx-surface) 96%, transparent);
  }
}

.cx-open-method-menu-title {
  margin: 8px 16px 6px;
  font-size: 13px;
  font-weight: 600;
  letter-spacing: -0.01em;
  color: var(--cx-ios-secondary);
  text-transform: none;
}

.cx-open-method-item {
  position: relative;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  border: none;
  border-radius: 0;
  padding: 12px 16px;
  margin: 0;
  cursor: pointer;
  text-align: left;
  color: var(--cx-ios-label);
  background: transparent;
  transition: background 0.12s ease;
}

/* iOS 分组列表分割线 */
.cx-open-method-item + .cx-open-method-item::before {
  content: '';
  position: absolute;
  left: 52px;
  right: 0;
  top: 0;
  height: 0.5px;
  background: var(--cx-ios-separator);
  pointer-events: none;
}

.cx-open-method-item:hover,
.cx-open-method-item:focus-visible {
  background: var(--cx-ios-fill);
  outline: none;
}

.cx-open-method-item:active {
  background: color-mix(in srgb, var(--cx-ios-fill) 140%, transparent);
}

.cx-open-method-item.active {
  background: color-mix(in srgb, var(--cx-ios-blue) 16%, transparent);
}

.cx-open-method-item .material-symbols-outlined {
  font-size: 22px;
  color: var(--cx-ios-blue);
  flex-shrink: 0;
}

.cx-open-method-item .check {
  margin-left: auto;
  color: var(--cx-ios-blue);
  font-size: 20px;
}

.cx-open-method-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.cx-open-method-item-text .name {
  font-size: 16px;
  font-weight: 400;
  letter-spacing: -0.02em;
  color: var(--cx-ios-label);
}

.cx-open-method-item-text .desc {
  font-size: 12px;
  color: var(--cx-ios-secondary);
  font-weight: 400;
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
  background: var(--cx-surface);
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
  background: var(--cx-scrim);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.cx-dialog {
  position: relative;
  width: min(100%, 400px);
  background: var(--cx-surface);
  border: 1px solid var(--cx-outline-var);
  border-radius: var(--cx-radius-lg);
  padding: 22px 20px 18px;
  box-shadow: var(--cx-shadow-soft), 0 20px 50px rgba(0, 0, 0, 0.18);
  color: var(--cx-on);
  text-align: center;
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-dialog {
  box-shadow: var(--cx-shadow-soft), 0 24px 56px rgba(0, 0, 0, 0.5);
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
  color: var(--cx-primary-on);
  border: 1px solid transparent;
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-btn.dialog-primary {
  background: var(--cx-primary-soft);
  color: var(--cx-primary-on);
}

.cx-btn.dialog-primary:hover:not(:disabled) {
  filter: brightness(0.96);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-btn.dialog-secondary {
  background: var(--cx-surface-high);
  color: var(--cx-on);
  border-color: var(--cx-outline-var);
}

/* —— 暗色模式：列表/欢迎页/状态条等细节补强 —— */
:global(html:is(.dark, [data-theme='graphite_night'])) .cx-nimbus-head {
  background: color-mix(in srgb, var(--cx-bg) 88%, transparent);
  border-bottom-color: var(--cx-outline-var);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-row:hover {
  background: var(--cx-surface-low);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-row:active {
  background: var(--cx-surface-high);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-welcome-card {
  background: var(--cx-surface);
  border-color: var(--cx-outline-var);
  box-shadow: var(--cx-shadow-soft);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-welcome-badge {
  background: var(--cx-primary-fixed);
  color: var(--cx-primary);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-sso-chip.ok {
  background: color-mix(in srgb, #16a34a 18%, var(--cx-surface-low));
  border-color: color-mix(in srgb, #16a34a 40%, var(--cx-outline-var));
  color: #86efac;
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-sso-chip.bad {
  background: var(--cx-error-container);
  color: var(--cx-error);
  border-color: color-mix(in srgb, var(--cx-error) 35%, var(--cx-outline-var));
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-alert {
  background: var(--cx-error-container);
  color: var(--cx-error);
  border: 1px solid color-mix(in srgb, var(--cx-error) 30%, transparent);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-preview-sheet {
  background: var(--cx-surface);
  border-color: var(--cx-outline-var);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-preview-head {
  background: var(--cx-bg);
  border-bottom-color: var(--cx-outline-var);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-preview-body {
  background: #0b0d10;
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-preview-toolbar {
  background: var(--cx-surface);
  border-top-color: var(--cx-outline-var);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-toolbar-btn {
  background: var(--cx-surface-low);
  border-color: var(--cx-outline-var);
  color: var(--cx-on);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-toolbar-btn.method.open {
  border-color: color-mix(in srgb, var(--cx-primary) 50%, var(--cx-outline-var));
  background: color-mix(in srgb, var(--cx-primary) 14%, var(--cx-surface));
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-toolbar-btn.browser:hover:not(:disabled),
:global(html:is(.dark, [data-theme='graphite_night'])) .cx-toolbar-btn.method:hover:not(:disabled) {
  background: var(--cx-surface-high);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-chip {
  background: var(--cx-surface-high);
  color: var(--cx-on-var);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-chip.active {
  background: var(--cx-primary-fixed);
  color: var(--cx-primary);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-skeleton-row {
  background: linear-gradient(
    90deg,
    var(--cx-surface-low) 25%,
    var(--cx-surface-high) 50%,
    var(--cx-surface-low) 75%
  );
  background-size: 200% 100%;
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-empty {
  color: var(--cx-outline);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-secure-note {
  color: var(--cx-outline);
}

:global(html:is(.dark, [data-theme='graphite_night'])) .cx-trail-btn:hover:not(:disabled) {
  background: var(--cx-surface-high);
  color: var(--cx-primary);
}
</style>

<!--
  非 scoped：与全局主题桥 html[data-theme] 对齐。
  应用真实暗色是 graphite_night，不是 html.dark；Teleport 弹层也必须吃到变量。
-->
<style>
html[data-theme='graphite_night'] .cx-page,
html[data-theme='graphite_night'] .cx-preview-root,
html[data-theme='graphite_night'] .cx-dialog-root,
html.dark .cx-page,
html.dark .cx-preview-root,
html.dark .cx-dialog-root {
  --cx-bg: #0e1012;
  --cx-surface: #1a1d21;
  --cx-surface-low: #22262b;
  --cx-surface-high: #2c3136;
  --cx-surface-highest: #383e44;
  --cx-on: #f0f2f4;
  --cx-on-var: #c4c8d4;
  --cx-outline: #9aa0b0;
  --cx-outline-var: #3d424a;
  --cx-primary: #aec1ff;
  --cx-primary-soft: #8aa4ff;
  --cx-primary-fixed: #1e2f5c;
  --cx-primary-on: #0b1224;
  --cx-tertiary-fixed: #1e2a3a;
  --cx-error: #ffb4ab;
  --cx-error-container: #7a0f14;
  --cx-shadow-soft: 0 12px 36px rgba(0, 0, 0, 0.45);
  --cx-scrim: rgba(0, 0, 0, 0.62);
  --cx-ios-label: #f5f5f7;
  --cx-ios-secondary: rgba(235, 235, 245, 0.5);
  --cx-ios-separator: rgba(84, 84, 88, 0.65);
  --cx-ios-fill: rgba(120, 120, 128, 0.28);
  --cx-ios-blue: #0a84ff;
  --cx-glass: rgba(44, 44, 46, 0.72);
  --cx-glass-border: rgba(255, 255, 255, 0.14);
  color-scheme: dark;
}

html[data-theme='graphite_night'] .cx-page,
html.dark .cx-page {
  background: #0e1012 !important;
  color: #f0f2f4 !important;
}

html[data-theme='graphite_night'] .cx-nimbus-head,
html.dark .cx-nimbus-head {
  background: rgba(14, 16, 18, 0.92) !important;
  border-bottom-color: #3d424a !important;
}

html[data-theme='graphite_night'] .cx-welcome-card,
html.dark .cx-welcome-card {
  background: #1a1d21 !important;
  border-color: #3d424a !important;
  color: #f0f2f4 !important;
}

html[data-theme='graphite_night'] .cx-row,
html.dark .cx-row {
  color: #f0f2f4;
  border-bottom-color: #2c3136 !important;
}

html[data-theme='graphite_night'] .cx-row-name,
html.dark .cx-row-name {
  color: #f0f2f4 !important;
}

html[data-theme='graphite_night'] .cx-row-meta,
html[data-theme='graphite_night'] .cx-nimbus-sub,
html[data-theme='graphite_night'] .cx-toolbar-meta,
html[data-theme='graphite_night'] .cx-empty,
html[data-theme='graphite_night'] .cx-empty .sub,
html.dark .cx-row-meta,
html.dark .cx-nimbus-sub,
html.dark .cx-toolbar-meta,
html.dark .cx-empty,
html.dark .cx-empty .sub {
  color: #9aa0b0 !important;
}

html[data-theme='graphite_night'] .cx-chip,
html.dark .cx-chip {
  background: #2c3136 !important;
  color: #c4c8d4 !important;
}

html[data-theme='graphite_night'] .cx-chip.active,
html.dark .cx-chip.active {
  background: #1e2f5c !important;
  color: #aec1ff !important;
}

html[data-theme='graphite_night'] .cx-preview-root .cx-preview-sheet,
html.dark .cx-preview-root .cx-preview-sheet {
  background: #1a1d21 !important;
  border-color: #3d424a !important;
  color: #f0f2f4 !important;
}

html[data-theme='graphite_night'] .cx-preview-root .cx-preview-head,
html.dark .cx-preview-root .cx-preview-head {
  background: #0e1012 !important;
  border-bottom-color: #3d424a !important;
  color: #f0f2f4 !important;
}

html[data-theme='graphite_night'] .cx-preview-root .cx-preview-body,
html.dark .cx-preview-root .cx-preview-body {
  background: #0b0d10 !important;
}

html[data-theme='graphite_night'] .cx-preview-root .cx-preview-toolbar,
html.dark .cx-preview-root .cx-preview-toolbar {
  background: #1a1d21 !important;
  border-top-color: #3d424a !important;
}

html[data-theme='graphite_night'] .cx-preview-root .cx-toolbar-btn,
html.dark .cx-preview-root .cx-toolbar-btn {
  background: #22262b !important;
  border-color: #3d424a !important;
  color: #f0f2f4 !important;
}

html[data-theme='graphite_night'] .cx-preview-root .cx-toolbar-btn.download,
html.dark .cx-preview-root .cx-toolbar-btn.download {
  background: #8aa4ff !important;
  color: #0b1224 !important;
  border-color: transparent !important;
}

html[data-theme='graphite_night'] .cx-preview-root .cx-open-method-menu,
html.dark .cx-preview-root .cx-open-method-menu {
  background: rgba(44, 44, 46, 0.82) !important;
  border-color: rgba(255, 255, 255, 0.14) !important;
  color: #f5f5f7 !important;
}

html[data-theme='graphite_night'] .cx-preview-root .cx-open-method-item,
html.dark .cx-preview-root .cx-open-method-item {
  color: #f5f5f7 !important;
}

html[data-theme='graphite_night'] .cx-preview-root .cx-open-method-item .desc,
html[data-theme='graphite_night'] .cx-preview-root .cx-open-method-menu-title,
html.dark .cx-preview-root .cx-open-method-item .desc,
html.dark .cx-preview-root .cx-open-method-menu-title {
  color: rgba(235, 235, 245, 0.55) !important;
}

html[data-theme='graphite_night'] .cx-dialog-root .cx-dialog,
html.dark .cx-dialog-root .cx-dialog {
  background: #1a1d21 !important;
  border-color: #3d424a !important;
  color: #f0f2f4 !important;
}

html[data-theme='graphite_night'] .cx-dialog-root .cx-dialog-desc,
html[data-theme='graphite_night'] .cx-dialog-root .cx-dialog-teacher,
html.dark .cx-dialog-root .cx-dialog-desc,
html.dark .cx-dialog-root .cx-dialog-teacher {
  color: #9aa0b0 !important;
}

html[data-theme='graphite_night'] .cx-dialog-root .cx-btn.dialog-secondary,
html.dark .cx-dialog-root .cx-btn.dialog-secondary {
  background: #2c3136 !important;
  color: #f0f2f4 !important;
  border-color: #3d424a !important;
}

html[data-theme='graphite_night'] .cx-dialog-root .cx-btn.dialog-primary,
html.dark .cx-dialog-root .cx-btn.dialog-primary {
  background: #8aa4ff !important;
  color: #0b1224 !important;
}

html[data-theme='graphite_night'] .cx-btn.primary,
html.dark .cx-btn.primary {
  background: #8aa4ff !important;
  color: #0b1224 !important;
}

html[data-theme='graphite_night'] .cx-skeleton-row,
html.dark .cx-skeleton-row {
  background: linear-gradient(90deg, #22262b 25%, #2c3136 50%, #22262b 75%) !important;
  background-size: 200% 100% !important;
}
</style>
