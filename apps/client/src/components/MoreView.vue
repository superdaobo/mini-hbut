<script setup>
import { computed, onMounted, ref } from 'vue'
import { TStatusBadge } from './templates'
import {
  canUseLocalModuleBridgePreview,
  fetchModuleCatalog,
  fetchModuleManifest,
  deleteCachedManifestSnapshot,
  deleteModuleState,
  getLocalModuleState,
  isLocalModuleBridgePreviewUrl,
  prepareModuleBundle,
  resolveModuleChannel,
  resolveModuleHostPreviewSource
} from '../utils/more_modules.js'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { fetchRemoteConfig } from '../utils/remote_config.js'
import { isViewAllowed } from '../config/app_store_policy'
import {
  resolveEffectiveGameCenterFlags
} from '../utils/game_center/flags'
import { resolveGameRankApiBase } from '../utils/game_center/api'
import { DEFAULT_GOMOKU_RELAY_API } from '../utils/game_center/base'
import { consumeGameOpen } from '../utils/game_center/pending_open'
import {
  buildModuleCenterCards,
  normalizeModuleCenterChannel as normalizeChannel
} from '../utils/module_center.js'
import { trackModuleOpen } from '../utils/usage_tracker.js'
import { useLocale } from '../utils/app_i18n'

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
const refreshing = ref(false)
const moduleError = ref('')
const moduleChannel = ref('main')
const moduleCardsSource = ref([])
const moduleStates = ref({})
const moduleBusyKey = ref('')

/**
 * #905 湖工游乐场：入口开关 + 经典游戏折叠态。
 * - flags 来自既有 remote_config 的 game_platform 块（远程改值即生效，无需发版）；
 * - 初始值即经过合规夹紧：App Store guest/demo 会话在远端配置到达前就已隐藏入口；
 * - 远端拉取失败时保持默认值，不阻塞入口、也不隐藏旧入口（零破坏）。
 */
const gameCenterFlags = ref(resolveEffectiveGameCenterFlags(null))
/** 经典游戏默认收起但功能完整可展开（issue #905 第一阶段形态要求） */
const classicExpanded = ref(false)
/** 本次启动来源标记（'classic' | 'game_center'），随 host session 传给宿主 */
const activeLaunchSurface = ref('classic')

const gameCenterEntryVisible = computed(
  () => gameCenterFlags.value.game_center_enabled && isViewAllowed('game_center')
)
const classicEntriesVisible = computed(() => gameCenterFlags.value.classic_game_entries_visible)

const safeText = (value) => String(value ?? '').trim()
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
  'hbut_match3'
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
    url.searchParams.set('student_id', safeText(profile.student_id))
    url.searchParams.set('player_name', safeText(profile.name))
    url.searchParams.set('class_name', safeText(profile.class_name))
    url.searchParams.set('major', safeText(profile.major))
    url.searchParams.set('school_name', safeText(profile.school_name))
    // #911 P1-⑤：无环境兼容的 base 时**不注入**该参数（而不是注入空值）。
    // 注入空值会被游戏侧 pickText 判为缺省 → 回落 localStorage 里的历史值，
    // 等于重新打开「已落盘的测试域」这条通道；不注入则 SDK 判定未配置 → standalone。
    const rankApiBase = resolveGameRankApi()
    if (rankApiBase) url.searchParams.set('rank_api', rankApiBase)
    if (moduleId === 'hbut_gomoku') {
      const gomokuRelayApi = resolveGomokuRelayApi()
      if (gomokuRelayApi) url.searchParams.set('gomoku_api', gomokuRelayApi)
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
      open_url: sessionPayload.open_url,
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

const resolveModuleSourceText = (value) => {
  const source = safeText(value).toLowerCase()
  if (source === 'cache') return t('more.source.cache')
  if (source === 'download') return t('more.source.download')
  if (source === 'in_app') return t('more.source.inApp')
  if (source === 'remote') return t('more.source.remote')
  return ''
}

const formatModuleChannelLabel = (value) => {
  const channel = safeText(value).toLowerCase()
  if (channel === 'latest') return t('more.channel.latest')
  if (channel === 'dev') return t('more.channel.dev')
  if (channel === 'main') return t('more.channel.main')
  return channel ? tr('more.channel.named', { name: channel }) : ''
}

const resolveModuleMetaLine = (state) => {
  const parts = []
  const channelLabel = formatModuleChannelLabel(state?.channel || moduleChannel.value)
  if (channelLabel) parts.push(channelLabel)
  if (safeText(state?.version)) parts.push(`v${safeText(state.version)}`)
  return parts.join(' · ') || t('more.channel.main')
}

const resolveModuleDetailLine = (state) => {
  const parts = []
  const sourceLabel = resolveModuleSourceText(state?.source)
  if (sourceLabel) parts.push(`${t('more.detail.sourcePrefix')}${sourceLabel}`)
  const message = safeText(state?.message)
  if (message) parts.push(message)
  return parts.join(' · ') || t('more.detail.enter')
}

const handleOpenInternalModule = (moduleItem) => {
  const targetView = safeText(moduleItem?.view)
  if (!targetView) return
  emit('navigate', targetView)
}

const handleOpenRemoteModule = async (moduleItem) => {
  const moduleId = safeText(moduleItem?.id)
  if (!moduleId) return
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

/**
 * 进入湖工游乐场（Game Center，#905）。
 * 走 App 统一导航（受 app_store_policy 的 isViewAllowed('game_center') 门禁），
 * 入口本身已按 policy + feature flag 前置隐藏。
 */
const openGameCenter = () => {
  if (!gameCenterEntryVisible.value) return
  emit('navigate', 'game_center')
}

const toggleClassicEntries = () => {
  classicExpanded.value = !classicExpanded.value
}

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
    // #905：同一份远程配置同时驱动游乐场 flags（不额外发请求）
    gameCenterFlags.value = resolveEffectiveGameCenterFlags(remoteConfig)
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

const refreshModules = async () => {
  refreshing.value = true
  await loadModuleCatalog({ silent: true })
  refreshing.value = false
}

onMounted(async () => {
  const preferredChannel = normalizeChannel(await resolveModuleChannel(), 'main')
  applyModuleCards(buildModuleCenterCards({ channel: preferredChannel }), preferredChannel)
  moduleLoading.value = false
  void ensureStudentProfile()
  void loadModuleCatalog({ silent: true })
  void consumeGameCenterIntent()
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
  classicExpanded.value = true
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
</script>

<template>
  <div class="more-view antialiased max-w-[520px] mx-auto relative min-h-screen bg-[#f0f4f8]">
    <!-- Header -->
    <header class="grid grid-cols-[44px_1fr_44px] items-center px-4 pt-4 pb-4 sticky top-0 bg-[#f0f4f8]/90 backdrop-blur z-50">
      <!-- 左侧：返回按钮 -->
      <button
        class="w-9 h-9 rounded-full bg-white flex items-center justify-center card-shadow text-gray-500 hover:text-gray-700 transition-colors"
        @click="emit('back')"
      >
        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
      </button>

      <!-- 中间：标题居中 -->
      <div class="flex items-center justify-center gap-2">
        <div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
          <span class="text-lg">🧩</span>
        </div>
        <span class="font-bold text-lg tracking-wide text-gray-800">{{ t('more.title') }}</span>
      </div>

      <!-- 右侧：刷新按钮 -->
      <button
        class="w-9 h-9 rounded-full bg-white flex items-center justify-center card-shadow text-gray-500 hover:text-blue-500 transition-colors"
        :disabled="refreshing"
        :class="{ 'animate-spin': refreshing }"
        @click="refreshModules"
      >
        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 4v6h-6" />
          <path d="M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
          <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
        </svg>
      </button>
    </header>

    <main class="px-4 space-y-5 pb-6">
      <!-- #905 湖工游乐场主入口（Game Center）：统一游戏业务层入口，远程 HTTPS-first -->
      <button
        v-if="gameCenterEntryVisible"
        class="game-center-entry"
        data-module-id="game_center"
        @click="openGameCenter"
      >
        <span class="game-center-entry__icon" aria-hidden="true">🎮</span>
        <span class="game-center-entry__body">
          <strong class="game-center-entry__title">{{ t('more.gameCenter.title') }}</strong>
          <span class="game-center-entry__desc">{{ t('more.gameCenter.subtitle') }}</span>
        </span>
        <span class="game-center-entry__cta">
          <span class="game-center-entry__badge">{{ t('more.gameCenter.badge') }}</span>
          <span aria-hidden="true">›</span>
        </span>
      </button>

      <!-- 经典游戏入口：可折叠，默认收起但功能与旧版完全一致（零破坏） -->
      <section v-if="classicEntriesVisible" class="classic-games">
        <button
          class="classic-games__toggle"
          data-module-id="classic_games"
          :aria-expanded="classicExpanded ? 'true' : 'false'"
          @click="toggleClassicEntries"
        >
          <span class="classic-games__label">
            <span aria-hidden="true">🕹️</span>
            <span>{{ t('more.classic.title') }}</span>
          </span>
          <span class="classic-games__meta">
            <span>{{ tr('more.classic.count', { n: moduleCards.length }) }}</span>
            <span class="classic-games__chevron" :class="{ 'classic-games__chevron--open': classicExpanded }" aria-hidden="true">▾</span>
          </span>
        </button>

        <!-- Module Grid（结构与旧版逐字保持一致，仅被折叠容器包裹） -->
        <div v-show="classicExpanded" class="classic-games__grid grid grid-cols-2 gap-3">
          <button
            v-for="item in moduleCards"
            :key="item.id"
            class="bg-white rounded-2xl p-3 card-shadow text-left transition-all hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
            :data-module-id="item.id"
            :disabled="moduleBusyKey === item.id"
            @click="handleModuleClick(item)"
          >
            <div class="flex justify-between items-center mb-2">
              <span class="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center text-lg">{{ item.icon || '📦' }}</span>
              <TStatusBadge
                :type="resolveModuleBadgeType(item, readModuleState(item.id))"
                :text="resolveModuleStatusText(item, readModuleState(item.id))"
              />
            </div>
            <div class="min-h-[52px]">
              <strong class="block text-sm font-bold text-gray-800">{{ item.name }}</strong>
              <p class="text-xs text-gray-500 mt-1 line-clamp-2 leading-relaxed">{{ item.description || t('more.descMissing') }}</p>
            </div>
            <div class="mt-2 pt-2 border-t border-gray-100">
              <span class="text-[11px] text-gray-400">{{ resolveModuleMetaLine(readModuleState(item.id)) }}</span>
              <small class="block text-[11px] text-gray-400 mt-0.5">{{ resolveModuleDetailLine(readModuleState(item.id)) }}</small>
            </div>
          </button>
        </div>
      </section>

      <p v-if="moduleError" class="text-red-500 font-semibold text-sm px-1">{{ moduleError }}</p>

      <!-- Loading -->
      <div v-if="moduleLoading" class="text-center py-10 text-gray-400 text-sm">{{ t('more.loading') }}</div>
    </main>
  </div>
</template>

<style scoped>
.more-view {
  padding-bottom: 80px;
  font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
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
