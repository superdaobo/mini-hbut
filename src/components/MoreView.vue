<script setup>
import { computed, onMounted, ref } from 'vue'
import { TEmptyState, TPageHeader, TStatusBadge } from './templates'
import {
  hasDailyAccessGrant,
  markDailyAccessGranted,
  sanitizeDailyAccessInput,
  verifyDailyAccessKey
} from '../utils/daily_access_key.js'
import {
  fetchModuleCatalog,
  fetchModuleManifest,
  getLocalModuleState,
  getModuleCdnBase,
  prepareModuleBundle,
  resolveModuleChannel
} from '../utils/more_modules.js'
import { invokeNative, isTauriRuntime } from '../platform/native'
import { getCloudSyncRuntimeConfig } from '../utils/cloud_sync.js'
import { fetchRemoteConfig } from '../utils/remote_config.js'

const props = defineProps({
  studentId: { type: String, default: '' }
})

const emit = defineEmits(['back', 'navigate'])

const STUDENT_PROFILE_STORAGE_PREFIX = 'hbu_more_module_student_profile:'
const DEFAULT_MODULES = Object.freeze([
  {
    id: 'shuake',
    name: '学习记录',
    icon: '🔐',
    description: '在线学习入口、数据同步与同步记录',
    key_required: true,
    kind: 'internal',
    view: 'more_shuake',
    order: 1
  },
  {
    id: 'hecheng_hugongda',
    name: '合成湖工大',
    icon: '🎮',
    description: '下载最新游戏包并打开',
    key_required: false,
    kind: 'remote',
    order: 2
  },
  {
    id: 'hugongda_escape',
    name: '湖工大逃生',
    icon: '🧭',
    description: '下载最新逃生包并打开',
    key_required: false,
    kind: 'remote',
    order: 3
  }
])

const moduleLoading = ref(true)
const refreshing = ref(false)
const moduleError = ref('')
const moduleChannel = ref('main')
const moduleCatalogMap = ref(new Map())
const moduleCardsSource = ref([])
const moduleStates = ref({})
const moduleBusyKey = ref('')

const brushUnlocked = ref(hasDailyAccessGrant())
const showBrushKeyDialog = ref(false)
const brushKeyInput = ref('')
const brushKeyError = ref('')

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
const toBool = (value) => value === true || value === 1 || value === '1'
const normalizeChannel = (value, fallback = 'main') => {
  const normalized = safeText(value).toLowerCase()
  if (normalized === 'latest') return 'latest'
  if (normalized === 'dev') return 'dev'
  if (normalized === 'main') return 'main'
  if (fallback === 'dev') return 'dev'
  return 'main'
}
const resolveBrushModule = (moduleItem) => {
  const id = safeText(moduleItem?.id)
  const view = safeText(moduleItem?.view)
  return id === 'shuake' || view === 'more_shuake'
}
const buildDefaultManifestUrl = (_channel, moduleId) => {
  const normalizedChannel = normalizeChannel(_channel, 'main')
  const id = safeText(moduleId)
  if (!id) return ''
  return `${getModuleCdnBase()}/${normalizedChannel}/${id}/manifest.json`
}

const DEFAULT_GAME_RANK_API = 'https://mini-hbut-testocr1.hf.space/api/game-rank'

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

const readCachedStudentProfile = () => {
  const sid = safeText(props.studentId)
  const empty = buildEmptyStudentProfile(sid)
  const storageKey = buildStudentProfileStorageKey(sid)
  const custom = storageKey ? safeParseJson(localStorage.getItem(storageKey), null) : null
  if (!sid) return mergeStudentProfiles(empty, custom)
  const direct = safeParseJson(localStorage.getItem(`cache:studentinfo:${sid}`), null)
  const legacy = safeParseJson(localStorage.getItem(`cache:student_info:${sid}`), null)
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
  try {
    const runtime = getCloudSyncRuntimeConfig()
    const endpoint = safeText(runtime?.proxyEndpoint || runtime?.endpoint)
    if (endpoint) {
      return endpoint.replace(/\/cloud-sync$/i, '/game-rank')
    }
  } catch {
    // ignore runtime config failure
  }
  return DEFAULT_GAME_RANK_API
}

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

const INCOMPATIBLE_CACHE_MESSAGE = '当前缓存版本存在已知布局问题，请联网更新后再打开。'

const appendModuleContextQuery = (moduleId, rawUrl, profile = readCachedStudentProfile()) => {
  const previewUrl = safeText(rawUrl)
  if (!previewUrl || moduleId !== 'hecheng_hugongda') return previewUrl

  try {
    const url = new URL(previewUrl, window.location.origin)
    url.searchParams.set('from', 'mini_hbut')
    url.searchParams.set('runtime', 'tauri-host')
    url.searchParams.set('student_id', safeText(profile.student_id))
    url.searchParams.set('player_name', safeText(profile.name))
    url.searchParams.set('class_name', safeText(profile.class_name))
    url.searchParams.set('major', safeText(profile.major))
    url.searchParams.set('school_name', safeText(profile.school_name))
    url.searchParams.set('rank_api', resolveGameRankApi())
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
  const entryPath = safeText(local?.entry_path || 'index.html')
  if (!version || !packageUrl || !entryPath) return null
  return {
    module_id: safeText(moduleItem?.id),
    module_name: safeText(local?.module_name || moduleItem?.name || moduleItem?.module_name || moduleItem?.id),
    version,
    package_url: packageUrl,
    package_sha256: safeText(local?.package_sha256),
    entry_path: entryPath,
    min_compatible_version: safeText(local?.min_compatible_version || moduleItem?.min_compatible_version),
    open_url: safeText(local?.preview_url || local?.open_url)
  }
}

const emitPreparedModuleNavigate = (moduleItem, prepared, manifest, sessionMeta = {}) => {
  const moduleId = safeText(prepared?.module_id || moduleItem?.id)
  const previewUrl = appendModuleContextQuery(
    moduleId,
    safeText(prepared?.preview_url || manifest?.open_url),
    sessionMeta?.preview_profile || readCachedStudentProfile()
  )
  emit('navigate', {
    view: 'more_module_host',
    payload: {
      module_id: moduleId,
      module_name: safeText(prepared?.module_name || moduleItem?.name || manifest?.module_name || moduleId),
      preview_url: previewUrl,
      version: safeText(prepared?.version || manifest?.version),
      min_compatible_version: safeText(prepared?.min_compatible_version || manifest?.min_compatible_version),
      channel: safeText(prepared?.channel || moduleChannel.value),
      local_ready: prepared?.local_ready !== false,
      source: safeText(prepared?.source || ''),
      cache_dir: safeText(prepared?.cache_dir || ''),
      bundle_path: safeText(prepared?.bundle_path || ''),
      manifest_url: safeText(sessionMeta?.manifest_url || manifest?.url || moduleItem?.manifest_url),
      manifest_checked_at: safeText(sessionMeta?.manifest_checked_at || '')
    }
  })
}

const buildDefaultModules = (channel = 'main') => {
  return DEFAULT_MODULES.map((item, index) =>
    normalizeConfiguredModule(item, index, channel)
  ).filter(Boolean)
}

const normalizeConfiguredModule = (item, index = 0, channel = 'main') => {
  const raw = item && typeof item === 'object' ? item : {}
  const id = safeText(raw.id || raw.module_id)
  if (!id) return null

  const kindText = safeText(raw.kind || raw.type).toLowerCase()
  const isBrush = id === 'shuake'
  const kind = kindText === 'internal' || isBrush ? 'internal' : 'remote'
  const order = safeNumber(raw.order, index + 1)
  const view = safeText(raw.view || raw.route || (isBrush ? 'more_shuake' : ''))
  const icon = safeText(raw.icon || (isBrush ? '🔐' : kind === 'remote' ? '📦' : '🧩'))
  return {
    id,
    name: safeText(raw.name || raw.module_name || raw.title || id),
    icon,
    description: safeText(raw.description || raw.desc || ''),
    key_required: isBrush || toBool(raw.key_required || raw.keyRequired),
    kind,
    view,
    order,
    min_compatible_version: safeText(raw.min_compatible_version || raw.minCompatibleVersion),
    manifest_url: kind === 'remote' ? buildDefaultManifestUrl(channel, id) : ''
  }
}

const mergeWithCatalog = (item, catalogMap = moduleCatalogMap.value) => {
  if (!item || item.kind !== 'remote') return item
  const catalogItem = catalogMap.get(item.id)
  if (!catalogItem) return item
  return {
    ...catalogItem,
    ...item,
    kind: 'remote',
    manifest_url: safeText(
      catalogItem.manifest_url ||
        item.manifest_url ||
        buildDefaultManifestUrl(moduleChannel.value || 'main', item.id)
    )
  }
}

const applyModuleCards = (items, channel, catalogModules = []) => {
  moduleChannel.value = normalizeChannel(channel)
  moduleCatalogMap.value = new Map((catalogModules || []).map((item) => [item.id, item]))
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

    if (resolveBrushModule(item)) {
      setModuleState(item.id, {
        status: brushUnlocked.value ? 'ready' : 'locked',
        message: brushUnlocked.value ? '今日已解锁' : '点击输入今日秘钥'
      })
      continue
    }

    if (item.kind !== 'remote') {
      setModuleState(item.id, { status: 'ready', message: '点击进入模块' })
      continue
    }

    const local = getLocalModuleState(item.id)
    if (safeText(local?.version)) {
      setModuleState(item.id, {
        status: 'ready',
        channel: safeText(local?.channel || moduleChannel.value),
        version: safeText(local.version),
        source: safeText(local?.source || 'cache'),
        message: '本地缓存可用'
      })
    } else {
      setModuleState(item.id, {
        status: 'not_downloaded',
        channel: moduleChannel.value,
        message: '首次使用需下载'
      })
    }
  }
}

const resolveModuleBadgeType = (moduleItem, state) => {
  if (resolveBrushModule(moduleItem)) return brushUnlocked.value ? 'success' : 'warning'
  const status = safeText(state?.status)
  if (status === 'ready') return 'success'
  if (status === 'checking' || status === 'downloading') return 'info'
  if (status === 'failed') return 'danger'
  if (status === 'locked') return 'warning'
  return 'muted'
}

const resolveModuleStatusText = (moduleItem, state) => {
  if (resolveBrushModule(moduleItem)) return brushUnlocked.value ? '已解锁' : '需秘钥'
  const status = safeText(state?.status)
  if (status === 'checking') return '检查更新'
  if (status === 'downloading') return '下载中'
  if (status === 'ready') return '已就绪'
  if (status === 'failed') return '打开失败'
  if (status === 'locked') return '未解锁'
  return '未下载'
}

const resolveModuleSourceText = (value) => {
  const source = safeText(value).toLowerCase()
  if (source === 'cache') return '缓存'
  if (source === 'download') return '下载'
  if (source === 'in_app') return '内嵌'
  if (source === 'remote') return '官网'
  return ''
}

const formatModuleChannelLabel = (value) => {
  const channel = safeText(value).toLowerCase()
  if (channel === 'latest') return '最新包'
  if (channel === 'dev') return '测试渠道'
  if (channel === 'main') return '正式渠道'
  return channel ? `渠道 ${channel}` : ''
}

const resolveModuleMetaLine = (state) => {
  const parts = []
  const channelLabel = formatModuleChannelLabel(state?.channel || moduleChannel.value)
  if (channelLabel) parts.push(channelLabel)
  if (safeText(state?.version)) parts.push(`v${safeText(state.version)}`)
  return parts.join(' · ') || '正式渠道'
}

const resolveModuleDetailLine = (state) => {
  const parts = []
  const sourceLabel = resolveModuleSourceText(state?.source)
  if (sourceLabel) parts.push(`来源 ${sourceLabel}`)
  const message = safeText(state?.message)
  if (message) parts.push(message)
  return parts.join(' · ') || '点击进入'
}

const setBrushModulesState = (status, message) => {
  for (const item of moduleCards.value) {
    if (!resolveBrushModule(item)) continue
    setModuleState(item.id, { status, message })
  }
}

const openBrushKeyDialog = () => {
  showBrushKeyDialog.value = true
  brushKeyInput.value = ''
  brushKeyError.value = ''
}

const closeBrushKeyDialog = () => {
  showBrushKeyDialog.value = false
  brushKeyInput.value = ''
  brushKeyError.value = ''
}

const submitBrushKey = () => {
  const normalized = sanitizeDailyAccessInput(brushKeyInput.value)
  brushKeyInput.value = normalized
  if (!verifyDailyAccessKey(normalized)) {
    brushKeyError.value = '秘钥无效，请输入当天秘钥'
    return
  }
  markDailyAccessGranted()
  brushUnlocked.value = true
  setBrushModulesState('ready', '今日已解锁')
  closeBrushKeyDialog()
  emit('navigate', 'more_shuake')
}

const handleOpenBrushModule = (moduleItem) => {
  const moduleId = safeText(moduleItem?.id || 'shuake')
  brushUnlocked.value = hasDailyAccessGrant()
  if (!brushUnlocked.value) {
    setModuleState(moduleId, { status: 'locked', message: '点击输入今日秘钥' })
    openBrushKeyDialog()
    return
  }
  setModuleState(moduleId, { status: 'ready', message: '今日已解锁' })
  emit('navigate', 'more_shuake')
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
      message: '模块清单未发布'
    })
    return
  }

  moduleBusyKey.value = moduleId
  const openPreparedModule = async (manifest, initialMessage = '检查更新中', sessionMeta = {}) => {
    setModuleState(moduleId, {
      status: 'checking',
      channel: moduleChannel.value,
      message: initialMessage
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
          ? '已命中本地缓存'
          : '已更新并内嵌打开',
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
      message: cachedManifest ? '检查线上版本中' : '获取模块清单中'
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
          await openPreparedModule(cachedManifest, '命中最新缓存中', {
            manifest_url: safeText(remoteManifest.url || moduleItem.manifest_url),
            manifest_checked_at: new Date().toISOString()
          })
          return
        } catch {
          setModuleState(moduleId, {
            status: 'checking',
            channel: moduleChannel.value,
            message: '本地缓存失效，重新准备最新版本'
          })
        }
      }

      setModuleState(moduleId, {
        status: 'downloading',
        channel: moduleChannel.value,
        source: cachedManifest ? 'download' : '',
        message: cachedManifest ? '发现新版本，更新本地包' : '下载并准备本地包',
        version: remoteVersion
      })
      await openPreparedModule(
        remoteManifest,
        cachedManifest ? '发现新版本，更新本地包' : '下载并准备本地包',
        {
          manifest_url: safeText(remoteManifest.url || moduleItem.manifest_url),
          manifest_checked_at: new Date().toISOString()
        }
      )
      return
    }

    if (cachedManifest) {
      if (!isManifestVersionCompatible(cachedManifest, moduleItem?.min_compatible_version)) {
        throw new Error(INCOMPATIBLE_CACHE_MESSAGE)
      }
      await openPreparedModule(cachedManifest, '线上检查失败，回退本地缓存')
      return
    }

    throw remoteManifestError || new Error('模块清单获取失败')
  } catch (err) {
    setModuleState(moduleId, {
      status: 'failed',
      channel: moduleChannel.value,
      message: safeText(err?.message || err) || '模块打开失败'
    })
  } finally {
    moduleBusyKey.value = ''
  }
}

const handleModuleClick = async (moduleItem) => {
  if (!moduleItem) return
  if (resolveBrushModule(moduleItem)) {
    handleOpenBrushModule(moduleItem)
    return
  }
  if (moduleItem.kind === 'internal') {
    handleOpenInternalModule(moduleItem)
    return
  }
  await handleOpenRemoteModule(moduleItem)
}

const loadModuleCatalog = async ({ silent = false } = {}) => {
  if (!silent) moduleLoading.value = true
  moduleError.value = ''

  const preferredChannel = normalizeChannel(await resolveModuleChannel(), 'main')
  if (!moduleCardsSource.value.length) {
    applyModuleCards(buildDefaultModules(preferredChannel), preferredChannel)
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
      .map((item, index) => normalizeConfiguredModule(item, index, targetChannel))
      .filter(Boolean)
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
  const nextCatalogMap = new Map(catalogModules.map((item) => [item.id, item]))

  let merged = []
  if (configuredModules.length > 0) {
    merged = configuredModules.map((item) => mergeWithCatalog(item, nextCatalogMap))
  } else if (catalogModules.length > 0) {
    merged = catalogModules
      .map((item, index) => normalizeConfiguredModule(item, index, moduleChannel.value))
      .filter(Boolean)
  }

  if (merged.length === 0) {
    merged = DEFAULT_MODULES.map((item, index) =>
      normalizeConfiguredModule(item, index, moduleChannel.value)
    ).filter(Boolean)
  }

  if (!merged.some((item) => resolveBrushModule(item))) {
    const brush = normalizeConfiguredModule(DEFAULT_MODULES[0], 0, moduleChannel.value)
    if (brush) merged.unshift(brush)
  }

  applyModuleCards(
    merged.length > 0 ? merged : buildDefaultModules(targetChannel),
    moduleChannel.value || targetChannel,
    catalogModules
  )

  if (!silent) moduleLoading.value = false
}

const refreshModules = async () => {
  refreshing.value = true
  await loadModuleCatalog({ silent: true })
  refreshing.value = false
}

onMounted(async () => {
  const preferredChannel = normalizeChannel(await resolveModuleChannel(), 'main')
  applyModuleCards(buildDefaultModules(preferredChannel), preferredChannel)
  moduleLoading.value = false
  void ensureStudentProfile()
  void loadModuleCatalog({ silent: true })
})
</script>

<template>
  <div class="more-view">
    <TPageHeader title="更多" @back="emit('back')">
      <template #actions>
        <button class="icon-btn" :disabled="refreshing" @click="refreshModules">↻</button>
      </template>
    </TPageHeader>

    <div class="more-view__body">
      <section class="menu-section">
        <div class="section-title">
          <span class="section-icon">🧩</span>
          <span>模块中心</span>
          <span class="section-subtitle">每行 2 个</span>
        </div>
        <div class="more-module-grid">
          <button
            v-for="item in moduleCards"
            :key="item.id"
            class="more-module-card"
            :data-module-id="item.id"
            :disabled="moduleBusyKey === item.id"
            @click="handleModuleClick(item)"
          >
            <div class="more-module-card__head">
              <span class="more-module-card__icon">{{ item.icon || '📦' }}</span>
              <TStatusBadge
                :type="resolveModuleBadgeType(item, readModuleState(item.id))"
                :text="resolveModuleStatusText(item, readModuleState(item.id))"
              />
            </div>
            <div class="more-module-card__body">
              <strong>{{ item.name }}</strong>
              <p>{{ item.description || '模块说明缺失' }}</p>
            </div>
            <div class="more-module-card__foot">
              <span>{{ resolveModuleMetaLine(readModuleState(item.id)) }}</span>
              <small>{{ resolveModuleDetailLine(readModuleState(item.id)) }}</small>
            </div>
          </button>
        </div>
        <p v-if="moduleError" class="error-text">{{ moduleError }}</p>
      </section>

      <TEmptyState v-if="moduleLoading" type="loading" message="正在加载模块中心..." />
    </div>

    <div v-if="showBrushKeyDialog" class="daily-key-overlay" @click.self="closeBrushKeyDialog">
      <div class="daily-key-dialog">
        <h3>学习记录模块秘钥</h3>
        <p>请输入今日秘钥后进入学习记录。</p>
        <input
          v-model="brushKeyInput"
          type="text"
          maxlength="11"
          inputmode="latin"
          autocomplete="off"
          placeholder="例如 ABCDE-12345"
          @input="brushKeyInput = sanitizeDailyAccessInput(brushKeyInput)"
          @keyup.enter="submitBrushKey"
        />
        <p v-if="brushKeyError" class="dialog-error">{{ brushKeyError }}</p>
        <div class="dialog-actions">
          <button type="button" class="dialog-btn ghost" @click="closeBrushKeyDialog">取消</button>
          <button type="button" class="dialog-btn primary" @click="submitBrushKey">确认</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.more-view {
  min-height: 100vh;
  background: var(--ui-bg-gradient);
}

.more-view__body {
  padding: 16px 16px calc(96px + env(safe-area-inset-bottom));
}

.menu-section {
  margin-bottom: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 4px 10px;
  font-weight: 700;
  font-size: calc(14px * var(--ui-font-scale));
  color: var(--ui-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.section-icon {
  font-size: 16px;
}

.section-subtitle {
  margin-left: auto;
  font-size: calc(11px * var(--ui-font-scale));
  font-weight: 700;
  color: color-mix(in oklab, var(--ui-primary) 80%, white 20%);
}

.more-module-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.more-module-card {
  border: 1px solid rgba(148, 163, 184, 0.2);
  border-radius: calc(18px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 74%, #fff 10%);
  backdrop-filter: blur(16px);
  padding: 12px;
  min-height: 150px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  text-align: left;
  transition: transform 0.15s ease, border-color 0.15s ease;
}

.more-module-card:not(:disabled):hover {
  transform: translateY(-1px);
  border-color: color-mix(in oklab, var(--ui-primary) 36%, transparent);
}

.more-module-card:disabled {
  opacity: 0.7;
}

.more-module-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.more-module-card__icon {
  width: 34px;
  height: 34px;
  border-radius: calc(10px * var(--ui-radius-scale));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  background: color-mix(in oklab, var(--ui-primary) 10%, var(--ui-surface) 90%);
}

.more-module-card__body {
  flex: 1;
}

.more-module-card__body strong {
  display: block;
  color: var(--ui-text);
  font-size: calc(15px * var(--ui-font-scale));
}

.more-module-card__body p {
  margin: 5px 0 0;
  color: var(--ui-muted);
  font-size: calc(12px * var(--ui-font-scale));
  line-height: 1.35;
}

.more-module-card__foot {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.more-module-card__foot > span {
  font-size: calc(11px * var(--ui-font-scale));
  color: var(--ui-muted);
}

.more-module-card__foot > small {
  color: var(--ui-text-secondary, var(--ui-muted));
  font-size: calc(11px * var(--ui-font-scale));
  line-height: 1.25;
}

.error-text {
  margin: 10px 0 0;
  color: var(--ui-danger);
  font-weight: 600;
  font-size: calc(13px * var(--ui-font-scale));
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: color-mix(in oklab, var(--ui-surface) 92%, #fff 8%);
  color: var(--ui-text);
  font-size: 16px;
  cursor: pointer;
  transition: transform 0.18s ease;
}

.icon-btn:hover {
  transform: translateY(-1px);
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.daily-key-overlay {
  position: fixed;
  inset: 0;
  z-index: 1300;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(10, 15, 24, 0.44);
  backdrop-filter: blur(3px);
}

.daily-key-dialog {
  width: min(420px, 100%);
  background: var(--ui-surface);
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: calc(18px * var(--ui-radius-scale));
  box-shadow: 0 20px 44px rgba(0, 0, 0, 0.22);
  padding: 18px;
}

.daily-key-dialog h3 {
  margin: 0;
  font-size: calc(17px * var(--ui-font-scale));
  color: var(--ui-text);
}

.daily-key-dialog p {
  margin: 8px 0 0;
  color: var(--ui-muted);
  font-size: calc(13px * var(--ui-font-scale));
  line-height: 1.45;
}

.daily-key-dialog input {
  width: 100%;
  margin-top: 12px;
  height: 42px;
  border-radius: calc(12px * var(--ui-radius-scale));
  border: 1px solid rgba(148, 163, 184, 0.3);
  background: color-mix(in oklab, var(--ui-surface) 95%, #fff 5%);
  color: var(--ui-text);
  padding: 0 12px;
  font-size: calc(14px * var(--ui-font-scale));
  letter-spacing: 1px;
}

.dialog-error {
  margin-top: 8px;
  color: var(--ui-danger);
  font-size: calc(12px * var(--ui-font-scale));
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
  border-radius: calc(10px * var(--ui-radius-scale));
  border: 1px solid transparent;
  cursor: pointer;
  font-weight: 600;
}

.dialog-btn.ghost {
  background: transparent;
  border-color: rgba(148, 163, 184, 0.3);
  color: var(--ui-muted);
}

.dialog-btn.primary {
  background: color-mix(in oklab, var(--ui-primary) 90%, white 10%);
  color: #fff;
}

@media (max-width: 760px) {
  .more-module-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .more-module-card {
    min-height: 142px;
    padding: 10px;
  }
}
</style>
