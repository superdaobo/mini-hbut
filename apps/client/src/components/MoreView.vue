<script setup>
import { computed, onMounted, ref } from 'vue'

import {
  canUseLocalModuleBridgePreview,
  fetchModuleCatalog,
  fetchModuleManifest,
  deleteCachedManifestSnapshot,
  deleteModuleState,
  getLocalModuleState,
  getModuleCdnBase,
  isLocalModuleBridgePreviewUrl,
  prepareModuleBundle,
  resolveModuleChannel,
  resolveModuleHostPreviewSource
} from '../utils/more_modules.js'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { fetchRemoteConfig } from '../utils/remote_config.js'
import { resolveGamePlatformApiBase, resolveGameRankApiBase } from '../utils/game_center/api'
import { appendIdentityQueryParams } from '../utils/game_center/profile'
import {
  appendModuleEnvQueryParams,
  resolveBuildAppVersion
} from '../utils/game_center/module_context'
import { DEFAULT_GOMOKU_RELAY_API } from '../utils/game_center/base'
import { consumeGameOpen, peekGameOpen } from '../utils/game_center/pending_open'
import {
  buildModuleCenterCards,
  normalizeModuleCenterChannel as normalizeChannel
} from '../utils/module_center.js'
import { trackModuleOpen } from '../utils/usage_tracker.js'
import { useLocale } from '../utils/app_i18n'
import { useAuthStore } from '../stores'
import { reconcileGameIdentityOnBoot } from '../utils/api.js'

const { t } = useLocale()

/**
 * i18n 占位符插值：将 key 字典中的 {name} 占位替换为实际值。
 */
const tr = (key, params = {}) => {
  let text = t(key)
  for (const [name, value] of Object.entries(params)) {
    text = text.split(`{${name}}`).join(String(value))
  }
  return text
}

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'navigate'])

const STUDENT_PROFILE_STORAGE_PREFIX = 'hbu_more_module_student_profile:'

const moduleLoading = ref(true)

const moduleError = ref('')
const moduleChannel = ref('main')
const moduleCardsSource = ref([])
const moduleStates = ref({})
const moduleBusyKey = ref('')

/**
 * 本次启动来源标记（'classic' | 'game_center'），随 host session 传给宿主。
 *
 * #1002：原先的「游乐场主入口 / 快捷入口 / 可折叠经典宫格」及其 flags 门控状态
 * 已随「更多页 = 总面板」一并移除 —— 游戏清单改由面板（远程模块）承载，
 * 本页只负责转发与消费一次性开局意图。
 */
const activeLaunchSurface = ref('classic')

const safeText = (value) => String(value ?? '').trim()

/**
 * 契约 D（身份收紧与游客态）：游戏模块身份注入以「会话是否已确认（verified）」为唯一前提。
 * 事实源是认证状态层的 `sessionVerified`（见 stores/auth.ts），**不得**用 `studentId` 非空
 * 代替 —— 离线冷启时它可能只是 #355 的离线缓存身份（上一用户落盘）。
 */
const authStore = useAuthStore()
const sessionVerified = computed(() => authStore.sessionVerified === true)
const safeParseJson = (raw, fallback = null) => {
  try {
    return JSON.parse(raw || '')
  } catch {
    return fallback
  }
}
const safeNumber = (value, fallback = 0) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : fallback
}

// #905：DEFAULT_GAME_RANK_API 与解析逻辑已收敛到 utils/game_center/api（单一默认源，避免两处漂移）
// #911 P1-⑤：五子棋 relay base 同步收敛到 utils/game_center/base 的环境派生默认源
// （原硬编码生产域会让非 release 构建的 relay 与 V2 跨环境，席位凭证验签必失败）

const CONTEXT_AWARE_GAME_MODULE_IDS = new Set([
  'hecheng_hugongda',
  'jump_out_hbut',
  'hbut_2048',
  'clumsy_bird_hbut',
  'hbut_monopoly',
  'hbut_miner',
  'hbut_memory_match',
  'hbut_gomoku',
  'hbut_stack',
  'hbut_parking',
  'hbut_match3',
  // #1002：总面板虽是「面板」而非游戏，但同样需要宿主上下文 ——
  // 缺 host_origin 就只能用 '*' 作 targetOrigin；缺 theme 会与 App 主题割裂；
  // 缺 catalog_url 时面板经 bridge 预览无法推导游戏清单地址。
  'more_panel'
])

const buildStudentProfileStorageKey = (studentId) => {
  const sid = safeText(studentId || props.studentId)
  return sid ? `${STUDENT_PROFILE_STORAGE_PREFIX}${sid}` : ''
}

const buildEmptyStudentProfile = (studentId = '') => ({
  student_id: safeText(studentId || props.studentId),
  name: '',
  class_name: '',
  major: '',
  school_name: '湖北工业大学'
})

const extractStudentProfilePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return {}
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload
}

const normalizeStudentProfile = (payload, fallbackStudentId = '') => {
  const source = extractStudentProfilePayload(payload)
  return {
    student_id: safeText(
      source?.student_id ||
        source?.studentId ||
        source?.xh ||
        source?.XH ||
        fallbackStudentId ||
        props.studentId
    ),
    name: safeText(
      source?.name || source?.student_name || source?.studentName || source?.xm || source?.XM
    ),
    class_name: safeText(
      source?.class_name ||
        source?.className ||
        source?.class ||
        source?.bjmc ||
        source?.BJMC
    ),
    major: safeText(source?.major || source?.major_name || source?.majorName || source?.zymc),
    school_name: safeText(source?.school_name || source?.schoolName) || '湖北工业大学'
  }
}

const mergeStudentProfiles = (...profiles) => {
  const merged = buildEmptyStudentProfile()
  for (const item of profiles) {
    const profile = normalizeStudentProfile(item, merged.student_id || props.studentId)
    if (!profile.student_id && !profile.name && !profile.class_name && !profile.major) continue
    merged.student_id = merged.student_id || profile.student_id
    merged.name = merged.name || profile.name
    merged.class_name = merged.class_name || profile.class_name
    merged.major = merged.major || profile.major
    merged.school_name = merged.school_name || profile.school_name || '湖北工业大学'
  }
  return merged
}

const persistStudentProfile = (profile) => {
  const normalized = normalizeStudentProfile(profile, props.studentId)
  const sid = safeText(normalized.student_id || props.studentId)
  if (!sid) return normalized
  const storageKey = buildStudentProfileStorageKey(sid)
  if (storageKey) {
    localStorage.setItem(storageKey, JSON.stringify(normalized))
  }
  return normalized
}

const unwrapCachedStudentProfilePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return payload
  return payload?.data && typeof payload.data === 'object' ? payload.data : payload
}

const readCachedStudentProfile = () => {
  const sid = safeText(props.studentId)
  const empty = buildEmptyStudentProfile(sid)
  const storageKey = buildStudentProfileStorageKey(sid)
  const custom = storageKey ? safeParseJson(localStorage.getItem(storageKey), null) : null
  if (!sid) return mergeStudentProfiles(empty, custom)
  // setCachedData 会把学生信息写成 { data, timestamp } 包装结构，这里需要先拆包。
  const direct = unwrapCachedStudentProfilePayload(
    safeParseJson(localStorage.getItem(`cache:studentinfo:${sid}`), null)
  )
  const legacy = unwrapCachedStudentProfilePayload(
    safeParseJson(localStorage.getItem(`cache:student_info:${sid}`), null)
  )
  return mergeStudentProfiles(empty, custom, direct, legacy)
}

const ensureStudentProfile = async () => {
  const cached = readCachedStudentProfile()
  if (cached.student_id && cached.class_name) return cached
  if (!isTauriRuntime()) return cached
  try {
    const payload = await invokeNative('fetch_student_info')
    const merged = mergeStudentProfiles(cached, payload)
    return persistStudentProfile(merged)
  } catch {
    return cached
  }
}

const resolveGameRankApi = () => {
  // 统一走 utils/game_center/api 的解析（云同步同源派生 → 默认源），保证与游乐场一致
  return resolveGameRankApiBase()
}

const resolveGomokuRelayApi = () => DEFAULT_GOMOKU_RELAY_API

const compareModuleVersion = (left, right) => {
  const a = safeText(left)
  const b = safeText(right)
  if (!a && !b) return 0
  if (!a) return -1
  if (!b) return 1
  return a.localeCompare(b, undefined, {
    numeric: true,
    sensitivity: 'base'
  })
}

const isManifestVersionCompatible = (manifest, minVersion = '') => {
  const currentVersion = safeText(manifest?.version)
  const requiredVersion = safeText(minVersion || manifest?.min_compatible_version)
  if (!requiredVersion) return true
  if (!currentVersion) return false
  return compareModuleVersion(currentVersion, requiredVersion) >= 0
}

const INCOMPATIBLE_CACHE_MESSAGE_KEY = 'more.msg.incompatibleCache'

const appendModuleContextQuery = (
  moduleId,
  rawUrl,
  profile = readCachedStudentProfile(),
  runtimeTag = 'module-host'
) => {
  const previewUrl = safeText(rawUrl)
  if (!previewUrl || !CONTEXT_AWARE_GAME_MODULE_IDS.has(moduleId)) return previewUrl

  try {
    const url = new URL(previewUrl, window.location.origin)
    url.searchParams.set('from', 'mini_hbut')
    url.searchParams.set('runtime', safeText(runtimeTag) || 'module-host')
    // P0：身份字段**非空才注入**（实现见 utils/game_center/profile.appendIdentityQueryParams）——
    // 未登录 / 字段缺失时宿主不再输出任何上一用户字段，也不输出空值形态的身份参数。
    // 契约 D：会话未确认（离线冷启 / 恢复中）⇒ 一律不注入身份，即使缓存里仍有上一用户的
    // 学号 / 姓名 / 班级（`studentId` 的缓存身份不得用于游戏身份）。
    appendIdentityQueryParams(url, profile, sessionVerified.value)
    // #911 P1-⑤：无环境兼容的 base 时**不注入**该参数（而不是注入空值）。
    // 注入空值会被游戏侧 pickText 判为缺省 → 回落 localStorage 里的历史值，
    // 等于重新打开「已落盘的测试域」这条通道；不注入则 SDK 判定未配置 → standalone。
    const rankApiBase = resolveGameRankApi()
    if (rankApiBase) url.searchParams.set('rank_api', rankApiBase)
    if (moduleId === 'hbut_gomoku') {
      const gomokuRelayApi = resolveGomokuRelayApi()
      if (gomokuRelayApi) url.searchParams.set('gomoku_api', gomokuRelayApi)
    }
    // P1-A：构建版本必须**始终注入**（灰度 deny 名单按版本串匹配；缺失 → 服务端永远匹配不到）。
    // P1-B 契约 C：宿主显式声明自身 origin —— SDK 只接受显式来源，无此参数即 fail closed
    //（不握手、零 V2 请求）。两者都不是身份，与登录态无关（游客态同样注入，见 module_context.ts）。
    appendModuleEnvQueryParams(url, {
      appVersion: resolveBuildAppVersion(),
      hostOrigin: window.location.origin,
      // G10 兜底：非特殊 scheme（tauri: / capacitor:）下 location.origin === 'null'，
      // 必须把 location 对象一并交给注入层，才能退化为 `${protocol}//${host}`（而不是空）。
      hostLocation: window.location
    })
    // #1002：总面板专用上下文 ——
    // ① `game_list`：**由宿主直接注入游戏清单**。面板在宿主侧是由 Rust bridge 提供的
    //    （origin 是 127.0.0.1:4399），而 catalog 在 CDN 上 → 面板自己去 fetch 属**跨域**，
    //    会被 CORS 拦下（本机实测「游戏清单加载失败」就是这个原因）。宿主本来就持有卡片清单，
    //    直接注入既避开跨域，又让面板首帧就能渲染游戏（符合「不要等加载完才显示」）。
    // ② `theme`：iframe 看不到宿主的 html.dark，而 prefers-color-scheme 反映的是系统偏好 ——
    //    不注入就会出现「App 亮色 + 面板暗色」的割裂（本机实测确实如此）。
    if (moduleId === 'more_panel') {
      // ③ `game_platform_api`：面板的「我的积分」需要游戏平台基址。面板自己解析不出
      //    （它只拿到 bridge 预览地址），必须由宿主注入 —— 否则永远显示「积分服务未配置」。
      const platformApi = safeText(resolveGamePlatformApiBase()).replace(/\/+$/, '')
      if (platformApi) url.searchParams.set('game_platform_api', platformApi)
      const gameList = moduleCards.value
        .filter((item) => safeText(item?.id) && safeText(item.id) !== 'more_panel')
        .map((item) => ({
          id: safeText(item.id),
          name: safeText(item.name) || safeText(item.id),
          icon: safeText(item.icon) || '🎮'
        }))
      if (gameList.length) {
        try {
          url.searchParams.set('game_list', JSON.stringify(gameList))
        } catch {
          // 序列化失败（异常字段）时跳过注入，面板会回退到自行拉取清单
        }
      }
      const isDark =
        typeof document !== 'undefined' &&
        Boolean(document.documentElement?.classList?.contains('dark'))
      url.searchParams.set('theme', isDark ? 'dark' : 'light')
    }
    return url.toString()
  } catch {
    return previewUrl
  }
}

const buildCachedManifestSnapshot = (moduleItem) => {
  const local = getLocalModuleState(moduleItem?.id)
  if (!local || typeof local !== 'object') return null
  const version = safeText(local?.version)
  const packageUrl = safeText(local?.package_url)
  const entryPath = safeText(local?.requested_entry_path || local?.entry_path || 'index.html')
  if (!version || !packageUrl || !entryPath) return null
  return {
    module_id: safeText(moduleItem?.id),
    module_name: safeText(local?.module_name || moduleItem?.name || moduleItem?.module_name || moduleItem?.id),
    version,
    package_url: packageUrl,
    package_urls: Array.isArray(local?.package_urls) ? local.package_urls : [],
    package_sha256: safeText(local?.package_sha256),
    entry_path: entryPath,
    min_compatible_version: safeText(local?.min_compatible_version || moduleItem?.min_compatible_version),
    channel: safeText(local?.channel || moduleItem?.channel),
    open_url: safeText(local?.open_url || '')
  }
}

const emitPreparedModuleNavigate = (moduleItem, prepared, manifest, sessionMeta = {}) => {
  const moduleId = safeText(prepared?.module_id || moduleItem?.id)
  const sessionPayload = {
    module_id: moduleId,
    module_name: safeText(prepared?.module_name || moduleItem?.name || manifest?.module_name || moduleId),
    preview_url: safeText(prepared?.preview_url || manifest?.open_url),
    version: safeText(prepared?.version || manifest?.version),
    min_compatible_version: safeText(prepared?.min_compatible_version || manifest?.min_compatible_version),
    channel: safeText(prepared?.channel || moduleChannel.value),
    local_ready: prepared?.local_ready !== false,
    source: safeText(prepared?.source || ''),
    preview_mode: safeText(prepared?.preview_mode || prepared?.previewMode || ''),
    open_url: safeText(prepared?.open_url || manifest?.open_url),
    package_url: safeText(prepared?.package_url || manifest?.package_url),
    package_urls: Array.isArray(prepared?.package_urls)
      ? prepared.package_urls
      : Array.isArray(manifest?.package_urls)
        ? manifest.package_urls
        : [],
    entry_path: safeText(prepared?.requested_entry_path || prepared?.entry_path || manifest?.entry_path || 'index.html'),
    resolved_entry_path: safeText(prepared?.resolved_entry_path || ''),
    local_preview_url: safeText(prepared?.local_preview_url || ''),
    site_root_path: safeText(prepared?.site_root_path || ''),
    bundle_zip_path: safeText(prepared?.bundle_zip_path || ''),
    cache_dir: safeText(prepared?.cache_dir || ''),
    bundle_path: safeText(prepared?.bundle_path || ''),
    manifest_url: safeText(sessionMeta?.manifest_url || manifest?.url || moduleItem?.manifest_url),
    manifest_checked_at: safeText(sessionMeta?.manifest_checked_at || '')
  }
  const resolvedSource = resolveModuleHostPreviewSource(sessionPayload)
  const resolvedPreviewUrl = safeText(resolvedSource.resolvedPreviewUrl)
  const previewMode = safeText(
    resolvedSource.sourceKind && resolvedSource.sourceKind !== 'invalid' ? resolvedSource.sourceKind : ''
  )
  const runtimeTag =
    previewMode === 'capacitor-local'
      ? 'capacitor-local'
      : previewMode === 'tauri-local'
        ? 'tauri-local'
        : previewMode === 'remote-site'
          ? 'remote-site'
          : 'module-host'
  const previewUrl = appendModuleContextQuery(
    moduleId,
    safeText(
      (() => {
        const fallback = canUseLocalModuleBridgePreview() ? sessionPayload.preview_url || manifest?.open_url : ''
        const candidate = resolvedPreviewUrl || fallback
        if (!canUseLocalModuleBridgePreview() && isLocalModuleBridgePreviewUrl(candidate)) return ''
        return candidate
      })()
    ),
    sessionMeta?.preview_profile || readCachedStudentProfile(),
    runtimeTag
  )
  // 与 preview_url 同源的 open_url（带同一套注入参数）——见下方 sessionPayload.open_url 的注释
  const openUrlWithContext =
    appendModuleContextQuery(
      moduleId,
      safeText(sessionPayload.open_url),
      sessionMeta?.preview_profile || readCachedStudentProfile(),
      runtimeTag
    ) || safeText(sessionPayload.open_url)

  const invalidReason = safeText(
    sessionPayload.invalid_reason ||
      sessionMeta?.invalid_reason ||
      (!previewUrl && !canUseLocalModuleBridgePreview() && safeText(sessionPayload.preview_mode) === 'tauri-local'
        ? 'tauri-bridge-blocked'
        : '')
  )
  void trackModuleOpen({
    moduleId,
    loadMode: previewMode || sessionPayload.preview_mode || 'remote-site',
    launchMode: safeText(prepared?.launch_mode || prepared?.source || ''),
    moduleVersion: sessionPayload.version,
    channel: sessionPayload.channel
  })
  emit('navigate', {
    view: 'more_module_host',
    payload: {
      module_id: moduleId,
      module_name: sessionPayload.module_name,
      preview_url: previewUrl,
      version: sessionPayload.version,
      min_compatible_version: sessionPayload.min_compatible_version,
      channel: sessionPayload.channel,
      local_ready: sessionPayload.local_ready,
      source: sessionPayload.source,
      preview_mode: previewMode,
      invalid_reason: invalidReason,
      // #1002 回归修复：宿主对「游乐场发起」的对局会走 HTTPS-first ——
      // `launch_surface==='game_center'` 时 `resolveGameCenterLaunchUrl` 会返回远端
      // `open_url` 原文并**整体丢弃**挂在 `preview_url` 上的注入参数（身份 / rank_api）。
      // 结果是游戏内排行榜报「当前没有登录信息，无法读取排行榜」。
      // 因此 open_url 必须携带**同一套**上下文，否则「最终加载哪个 URL」决定了身份在不在。
      open_url: openUrlWithContext,
      package_url: sessionPayload.package_url,
      package_urls: sessionPayload.package_urls,
      entry_path: sessionPayload.entry_path,
      resolved_entry_path: safeText(sessionPayload.resolved_entry_path || resolvedSource.resolvedEntryPath),
      local_preview_url: safeText(sessionPayload.local_preview_url || resolvedSource.localPreviewUrl),
      site_root_path: safeText(sessionPayload.site_root_path || resolvedSource.siteRootPath),
      bundle_zip_path: safeText(sessionPayload.bundle_zip_path || resolvedSource.bundleZipPath),
      cache_dir: sessionPayload.cache_dir,
      bundle_path: sessionPayload.bundle_path,
      manifest_url: sessionPayload.manifest_url,
      manifest_checked_at: sessionPayload.manifest_checked_at,
      // #905：标记本次启动来自湖工游乐场（宿主据此走远端 HTTPS 优先 + origin 白名单）
      launch_surface: safeText(sessionMeta?.launch_surface || activeLaunchSurface.value) || 'classic'
    }
  })
}

const applyModuleCards = (items, channel) => {
  moduleChannel.value = normalizeChannel(channel)
  moduleCardsSource.value = Array.isArray(items) ? items.filter(Boolean) : []
  bootstrapModuleState()
}

const moduleCards = computed(() => {
  return [...moduleCardsSource.value]
    .filter((item) => item && safeText(item.id))
    .sort((a, b) => safeNumber(a.order, 999) - safeNumber(b.order, 999))
})

const readModuleState = (moduleId) => {
  const map = moduleStates.value || {}
  return map[moduleId] && typeof map[moduleId] === 'object'
    ? map[moduleId]
    : { status: 'not_downloaded', message: '' }
}

const setModuleState = (moduleId, patch) => {
  moduleStates.value = {
    ...moduleStates.value,
    [moduleId]: {
      ...(readModuleState(moduleId) || {}),
      ...(patch && typeof patch === 'object' ? patch : {})
    }
  }
}

const bootstrapModuleState = () => {
  for (const item of moduleCards.value) {
    const current = readModuleState(item.id)
    if (current.status && current.status !== 'not_downloaded') continue

    if (item.kind !== 'remote') {
      setModuleState(item.id, { status: 'ready', message: t('more.state.enterModule') })
      continue
    }

    const local = getLocalModuleState(item.id)
    if (safeText(local?.version)) {
      setModuleState(item.id, {
        status: 'ready',
        channel: safeText(local?.channel || moduleChannel.value),
        version: safeText(local.version),
        source: safeText(local?.source || 'cache'),
        message: t('more.state.cacheReady')
      })
    } else {
      setModuleState(item.id, {
        status: 'not_downloaded',
        channel: moduleChannel.value,
        message: t('more.state.needDownload')
      })
    }
  }
}

const resolveModuleBadgeType = (_moduleItem, state) => {
  const status = safeText(state?.status)
  if (status === 'ready') return 'success'
  if (status === 'checking' || status === 'downloading') return 'info'
  if (status === 'failed') return 'danger'
  if (status === 'locked') return 'warning'
  return 'muted'
}

const resolveModuleStatusText = (_moduleItem, state) => {
  const status = safeText(state?.status)
  if (status === 'checking') return t('more.status.checking')
  if (status === 'downloading') return t('more.status.downloading')
  if (status === 'ready') return t('more.status.ready')
  if (status === 'failed') return t('more.status.failed')
  if (status === 'locked') return t('more.status.locked')
  return t('more.status.notDownloaded')
}

const handleOpenInternalModule = (moduleItem) => {
  const targetView = safeText(moduleItem?.view)
  if (!targetView) return
  emit('navigate', targetView)
}

const handleOpenRemoteModule = async (moduleItem) => {
  const moduleId = safeText(moduleItem?.id)
  if (!moduleId) return
  // 契约 D：会话未确认 ⇒ 游客态。游戏模块会从 localStorage 回落读取设备级身份快照
  // （`<gameId>_rank_context_v1`，含上一用户学号 + rank_api）；打开前按启动收口**同一路径**
  // 清理（幂等：有确认会话零动作、无身份键零删除），保证「模块侧拿不到任何学号 →
  // game_rank.js / SDK 判定不可提交、零 fetch」。本地游玩不受影响（不阻断打开）。
  if (!sessionVerified.value) reconcileGameIdentityOnBoot(false)
  const profile = moduleId === 'hecheng_hugongda' ? await ensureStudentProfile() : readCachedStudentProfile()

  if (!safeText(moduleItem?.manifest_url)) {
    setModuleState(moduleId, {
      status: 'failed',
      channel: moduleChannel.value,
      message: t('more.msg.manifestMissing')
    })
    return
  }

  moduleBusyKey.value = moduleId
  const openPreparedModule = async (manifest, initialMessageKey, initialMessageParams = {}, sessionMeta = {}) => {
    setModuleState(moduleId, {
      status: 'checking',
      channel: moduleChannel.value,
      message: tr(initialMessageKey, initialMessageParams)
    })
    const prepared = await prepareModuleBundle({
      channel: moduleChannel.value,
      moduleInfo: moduleItem,
      manifest
    })
    setModuleState(moduleId, {
      status: 'ready',
      channel: safeText(prepared.channel || moduleChannel.value),
      source: safeText(prepared.source || ''),
      message:
        prepared.launch_mode === 'cache'
          ? t('more.msg.cacheHit')
          : t('more.msg.updatedAndOpened'),
      version: safeText(prepared.version || manifest.version)
    })
    emitPreparedModuleNavigate(moduleItem, prepared, manifest, {
      ...sessionMeta,
      preview_profile: profile
    })
  }

  try {
    const cachedManifest = buildCachedManifestSnapshot(moduleItem)
    let remoteManifest = null
    let remoteManifestError = null

    setModuleState(moduleId, {
      status: 'checking',
      channel: moduleChannel.value,
      message: cachedManifest ? t('more.msg.checkingRemote') : t('more.msg.fetchingManifest')
    })

    try {
      remoteManifest = await fetchModuleManifest(moduleItem.manifest_url)
    } catch (error) {
      remoteManifestError = error
    }

    if (remoteManifest) {
      const cachedVersion = safeText(cachedManifest?.version)
      const remoteVersion = safeText(remoteManifest.version)
      const cachedSha = safeText(cachedManifest?.package_sha256)
      const remoteSha = safeText(remoteManifest.package_sha256)
      const cachedMinCompatible = safeText(cachedManifest?.min_compatible_version)
      const remoteMinCompatible = safeText(remoteManifest.min_compatible_version)
      const canUseCache =
        cachedManifest &&
        cachedVersion &&
        cachedVersion === remoteVersion &&
        isManifestVersionCompatible(cachedManifest, remoteManifest.min_compatible_version) &&
        cachedMinCompatible === remoteMinCompatible &&
        (!remoteSha || !cachedSha || cachedSha === remoteSha)

      if (canUseCache) {
        try {
          await openPreparedModule(cachedManifest, 'more.msg.verifyingCache', {}, {
            manifest_url: safeText(remoteManifest.url || moduleItem.manifest_url),
            manifest_checked_at: new Date().toISOString()
          })
          return
        } catch {
          setModuleState(moduleId, {
            status: 'checking',
            channel: moduleChannel.value,
            message: t('more.msg.cacheInvalidReprepare')
          })
        }
      }

      setModuleState(moduleId, {
        status: 'downloading',
        channel: moduleChannel.value,
        source: cachedManifest ? 'download' : '',
        message: cachedManifest ? t('more.msg.newVersionUpdating') : t('more.msg.downloadingPrepare'),
        version: remoteVersion
      })
      await openPreparedModule(
        remoteManifest,
        cachedManifest ? 'more.msg.newVersionUpdating' : 'more.msg.downloadingPrepare',
        {},
        {
          manifest_url: safeText(remoteManifest.url || moduleItem.manifest_url),
          manifest_checked_at: new Date().toISOString()
        }
      )
      return
    }

    if (cachedManifest) {
      if (!isManifestVersionCompatible(cachedManifest, moduleItem?.min_compatible_version)) {
        throw new Error(t(INCOMPATIBLE_CACHE_MESSAGE_KEY))
      }
      try {
        await openPreparedModule(cachedManifest, 'more.msg.remoteFailFallbackCache')
        return
      } catch (cachedError) {
        if (cachedError?.code !== 'MODULE_REMOTE_UNAVAILABLE') throw cachedError

        // #883：旧 manifest 指向已裁剪版本时，先清理持久化模块状态与 manifest 缓存，
        // 再强制绕过缓存拉一次当前 manifest。避免把 CDN 404 页面直接交给 iframe。
        deleteModuleState(moduleId)
        deleteCachedManifestSnapshot(moduleItem.manifest_url)
        setModuleState(moduleId, {
          status: 'checking',
          channel: moduleChannel.value,
          message: t('more.msg.fetchingManifest')
        })
        const refreshedManifest = await fetchModuleManifest(moduleItem.manifest_url, { allowCache: false })
        await openPreparedModule(refreshedManifest, 'more.msg.downloadingPrepare', {}, {
          manifest_url: safeText(refreshedManifest.url || moduleItem.manifest_url),
          manifest_checked_at: new Date().toISOString()
        })
        return
      }
    }

    throw remoteManifestError || new Error(t('more.msg.manifestFetchFailed'))
  } catch (err) {
    setModuleState(moduleId, {
      status: 'failed',
      channel: moduleChannel.value,
      message: safeText(err?.message || err) || t('more.msg.openFailed')
    })
  } finally {
    moduleBusyKey.value = ''
  }
}

const handleModuleClick = async (moduleItem) => {
  if (!moduleItem) return
  if (moduleItem.kind === 'internal') {
    handleOpenInternalModule(moduleItem)
    return
  }
  await handleOpenRemoteModule(moduleItem)
}

/** 加载模块目录（内置清单 + 远程 catalog 合并）。`silent=true` 时不显示加载态。 */
const loadModuleCatalog = async ({ silent = false } = {}) => {
  if (!silent) moduleLoading.value = true
  moduleError.value = ''

  const preferredChannel = normalizeChannel(await resolveModuleChannel(), 'main')
  if (!moduleCardsSource.value.length) {
    applyModuleCards(buildModuleCenterCards({ channel: preferredChannel }), preferredChannel)
  }
  let targetChannel = preferredChannel
  let configuredModules = []
  let catalogModules = []

  try {
    const remoteConfig = await fetchRemoteConfig({ force: false })
    const configChannel = normalizeChannel(remoteConfig?.module_center?.channel, preferredChannel)
    targetChannel = configChannel
    const rawModules = Array.isArray(remoteConfig?.module_center?.modules)
      ? remoteConfig.module_center.modules
      : []
    configuredModules = rawModules
  } catch {
    // 远程配置失败时继续走 catalog 兜底
  }

  try {
    const catalogPayload = await fetchModuleCatalog(targetChannel)
    moduleChannel.value = normalizeChannel(targetChannel, preferredChannel)
    catalogModules = Array.isArray(catalogPayload?.catalog?.modules) ? catalogPayload.catalog.modules : []
  } catch (err) {
    moduleError.value = ''
    moduleChannel.value = normalizeChannel(targetChannel, preferredChannel)
    catalogModules = []
  }

  const resolvedChannel = normalizeChannel(moduleChannel.value || targetChannel, preferredChannel)
  const merged = buildModuleCenterCards({
    channel: resolvedChannel,
    configuredModules,
    catalogModules
  })
  applyModuleCards(merged, resolvedChannel)

  if (!silent) moduleLoading.value = false
}

/** 远程目录加载中的 Promise（面板入口需要等它：面板只在远程 catalog 里） */
let catalogLoadPromise = null

onMounted(async () => {
  const preferredChannel = normalizeChannel(await resolveModuleChannel(), 'main')
  applyModuleCards(buildModuleCenterCards({ channel: preferredChannel }), preferredChannel)
  moduleLoading.value = false
  void ensureStudentProfile()
  catalogLoadPromise = loadModuleCatalog({ silent: true })

  // ① 先消费「打开某个游戏」的一次性意图（总面板宫格点击 → 宿主回退到本页）：
  //    必须优先于自动进面板，否则会立刻把用户弹回面板、永远进不去游戏。
  if (peekGameOpen()) {
    await ensureModuleCardsReady()
    await consumeGameCenterIntent()
    return
  }

  // ② 否则直接进入总面板（#1002：点「更多」= 直接看到面板）
  await launchPanel()
})

/**
 * #905：消费从湖工游乐场「游戏」Tab 传来的开局意图。
 * 必须等卡片数据就绪后再打开，否则 moduleItem 可能尚未合并远程 catalog 字段。
 */
const consumeGameCenterIntent = async () => {
  const pendingModuleId = consumeGameOpen()
  if (!pendingModuleId) return
  await ensureModuleCardsReady()
  const target = moduleCards.value.find((item) => item.id === pendingModuleId)
  if (!target) return
  activeLaunchSurface.value = 'game_center'
  try {
    await handleModuleClick(target)
  } finally {
    activeLaunchSurface.value = 'classic'
  }
}

/** 等待首轮卡片数据可用（最多 3 秒），避免远程 catalog 未回来就丢弃意图 */
const ensureModuleCardsReady = async () => {
  if (moduleCards.value.length) return
  for (let attempt = 0; attempt < 15; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200))
    if (moduleCards.value.length) return
  }
}

/**
 * #1002：进入湖工游乐场总面板。
 *
 * 「更多」页现在就是面板的入口页 —— 经典游戏**全部并入面板**，本页不再分类展示。
 * 面板与其它游戏同形态（远程模块），因此这里复用**同一条**打开链路
 * （`handleOpenRemoteModule`：解析清单 → 准备 bundle → 交给 App 的模块宿主），
 * 不复制任何状态机。
 *
 * 为什么要等目录：面板**只存在于远程 catalog**（内置清单是被契约冻结的 11 个经典游戏，
 * 不能混入非游戏项）。所以目录没回来就找不到面板；超时按「清单缺失」处理并给出重试，
 * 而不是无限转圈。
 */
/**
 * 转发骨架的文案。
 *
 * 本页有两种转发目的地：**打开某个游戏**（面板宫格点击 → 宿主回退到本页）与
 * **打开总面板**（用户直接点「更多」）。两者文案必须区分 —— 否则点游戏时显示
 * 「正在打开游乐场面板…」，用户会以为点错了（真机反馈）。
 *
 * ⚠️ 必须在 setup 期**同步**初始化：首帧渲染早于 `onMounted`，若等到 onMounted 再赋值，
 * 首帧会先闪一下「正在打开游乐场面板…」，等于把同一个问题换个形式又暴露一次。
 */
const forwardingHint = ref(
  peekGameOpen() ? t('more.panel.openingGame') : t('more.panel.loading')
)

const PANEL_MODULE_ID = 'more_panel'
const PANEL_CATALOG_WAIT_MS = 5000
const panelForwardFailed = ref(false)

const launchPanel = async () => {
  panelForwardFailed.value = false
  moduleError.value = ''
  try {
    if (catalogLoadPromise) {
      await Promise.race([
        catalogLoadPromise.catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, PANEL_CATALOG_WAIT_MS))
      ])
    }
    const target = moduleCards.value.find((item) => item.id === PANEL_MODULE_ID)
    if (!target) {
      panelForwardFailed.value = true
      moduleError.value = t('more.panel.missing')
      return
    }
    activeLaunchSurface.value = 'classic'
    await handleModuleClick(target)
    // 打开失败时 handleOpenRemoteModule 只写模块状态、不抛错：这里读回来给出明确提示
    const state = readModuleState(PANEL_MODULE_ID)
    if (safeText(state?.status) === 'failed') {
      panelForwardFailed.value = true
      moduleError.value = safeText(state?.message)
    }
  } catch (error) {
    panelForwardFailed.value = true
    moduleError.value = String((error && error.message) || error || '')
  }
}
</script>

<template>
  <div class="more-view antialiased max-w-[520px] mx-auto relative min-h-screen bg-[#f0f4f8]">
    <!--
      #1002：本页 = 湖工游乐场总面板的入口页。
      经典游戏已**全部并入面板**（不再在 App 内分类展示：原先的「游乐场主入口 + 快捷入口 +
      可折叠经典游戏宫格」已移除），点「更多」即直接进入面板。

      为什么这里只放转发骨架：面板是远程模块（与其它游戏同形态：静态 bundle + iframe +
      一次性 ticket + 上下文注入），需要先解析清单再下载 bundle。先渲染**稳定的骨架**
      （而不是空白），失败时给明确文案与重试，避免「先没有、后出现」的跳版观感。
    -->
    <header class="grid grid-cols-[44px_1fr_44px] items-center px-4 pt-4 pb-4 sticky top-0 bg-[#f0f4f8]/90 backdrop-blur z-50">
      <!-- 返回：转发中/失败时用户仍可退出本页 -->
      <button
        class="w-9 h-9 rounded-full bg-white flex items-center justify-center card-shadow text-gray-500 hover:text-gray-700 transition-colors"
        @click="emit('back')"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
      </button>

      <span class="text-center font-bold text-base tracking-wide text-gray-800">
        {{ t('more.panel.title') }}
      </span>

      <span aria-hidden="true"></span>
    </header>

    <main class="px-4 pb-6">
      <section class="panel-forward" aria-live="polite">
        <span v-if="!panelForwardFailed" class="panel-forward__spinner" aria-hidden="true"></span>
        <span v-else class="panel-forward__icon" aria-hidden="true">⚠️</span>
        <p class="panel-forward__text">
          {{ panelForwardFailed ? t('more.panel.failed') : (forwardingHint || t('more.panel.loading')) }}
        </p>
        <button
          v-if="panelForwardFailed"
          type="button"
          class="panel-forward__retry"
          @click="launchPanel"
        >
          {{ t('common.retry') }}
        </button>
        <p v-if="moduleError" class="panel-forward__detail">{{ moduleError }}</p>
      </section>
    </main>
  </div>
</template>

<style scoped>
.more-view {
  padding-bottom: 80px;
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
}

/* #1002：面板转发骨架。居中且高度稳定（不因有无内容跳版）；失败态给明确文案与重试。 */
.panel-forward {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  min-height: 55vh;
  text-align: center;
}

.panel-forward__spinner {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 3px solid rgba(37, 99, 235, 0.18);
  border-top-color: #2563eb;
  animation: panel-forward-spin 0.9s linear infinite;
}

@keyframes panel-forward-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .panel-forward__spinner {
    animation: none;
  }
}

.panel-forward__icon {
  font-size: 26px;
  line-height: 1;
}

.panel-forward__text {
  margin: 0;
  font-size: 14px;
  color: #6b7280;
}

.panel-forward__retry {
  /* 触控目标下限 40px（与面板内 tile 同规格） */
  min-height: 40px;
  padding: 8px 18px;
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.panel-forward__detail {
  max-width: 260px;
  margin: 0;
  font-size: 12px;
  color: #9ca3af;
  word-break: break-word;
}

.card-shadow {
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
}

/* #905 湖工游乐场主入口 */
.game-center-entry {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 0;
  border-radius: 18px;
  text-align: left;
  cursor: pointer;
  color: #fff;
  background: linear-gradient(135deg, #3b82f6 0%, #6366f1 55%, #8b5cf6 100%);
  box-shadow: 0 10px 24px rgba(59, 130, 246, 0.28);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.game-center-entry:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(59, 130, 246, 0.34);
}

.game-center-entry__icon {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 22px;
  background: rgba(255, 255, 255, 0.22);
  flex: 0 0 auto;
}

.game-center-entry__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.game-center-entry__title {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.game-center-entry__desc {
  font-size: 12px;
  opacity: 0.88;
}

.game-center-entry__cta {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 18px;
  flex: 0 0 auto;
}

.game-center-entry__badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.24);
}

/* 经典游戏折叠区：默认收起，展开后与旧版宫格完全一致 */
.classic-games {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.classic-games__toggle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px 14px;
  border: 0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 4px 15px rgba(0, 0, 0, 0.03);
  color: #334155;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.classic-games__label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

.classic-games__meta {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 500;
  color: #94a3b8;
}

.classic-games__chevron {
  display: inline-block;
  transition: transform 0.18s ease;
}

.classic-games__chevron--open {
  transform: rotate(180deg);
}

.classic-games__grid {
  padding-bottom: 4px;
}

.dialog-error {
  margin-top: 8px;
  color: #ef4444;
  font-size: 12px;
}

.dialog-actions {
  margin-top: 14px;
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.dialog-btn {
  min-width: 88px;
  height: 36px;
  border-radius: 10px;
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 600;
}

.dialog-btn.ghost {
  background: transparent;
  border-color: rgba(148, 163, 184, 0.3);
  color: #64748b;
}

.dialog-btn.primary {
  background: #3b82f6;
  color: #fff;
}
</style>
