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
import { isMobileLike } from '../platform/runtime'
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
  // 平台判断统一收敛到 src/platform/runtime.ts（单一来源）
  if (isMobileLike()) return true
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
 * 进入路径（#351）：
 * 1) 远程/缓存邀请码
 * 2) 有 last-class → 立刻出壳 + 并行拉资料（list_resources 内 ensure）；SSO hint 不阻塞首屏
 * 3) 无 last-class → SSO → preview → 资料；冷路径展示明确 loading 文案
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

  // 热路径：本地已有班级缓存 → 秒开壳层，资料与 SSO 并行
  if (saved) {
    activeClass.value = saved
    bootPhase.value = 'ready'
    loadingBoot.value = false
    ssoHint.value = '正在连接学习通会话…'
    statusMsg.value = '正在加载资料…'
    // list_resources 后端已 ensure_chaoxing_sso；前端 ensure 只更新顶栏 hint
    const ssoPromise = ensureSso()
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
    const ssoOk = await ssoPromise
    // 列表与 SSO 均失败：升级错误态（有资料则仍可浏览缓存结果）
    if (!ssoOk && resources.value.length === 0) {
      bootPhase.value = 'error'
      if (!error.value && ssoHint.value) {
        error.value = ssoHint.value
      }
    }
    return
  }

  // 冷路径：无 last-class，需先 SSO 再解析邀请码
  bootPhase.value = 'sso'
  ssoHint.value = '正在连接学习通会话…'
  const ssoOk = await ensureSso()
  if (!ssoOk) {
    bootPhase.value = 'error'
    loadingBoot.value = false
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

<template src="../templates/views/ChaoxingClassView.html"></template>

<style src="../styles/views/ChaoxingClassView.scoped.css" scoped></style>

<!--
  非 scoped：与全局主题桥 html[data-theme] 对齐。
  应用真实暗色是 graphite_night，不是 html.dark；Teleport 弹层也必须吃到变量。
-->
<style src="../styles/views/ChaoxingClassView.2.global.css"></style>
