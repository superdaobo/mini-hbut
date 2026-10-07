<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { TEmptyState, TPageHeader } from './templates'
import { canUseLocalModuleBridgePreview, isLocalModuleBridgePreviewUrl, resolveModuleHostPreviewSource } from '../utils/more_modules.js'
import { openExternal } from '../utils/external_link'
import { pushDebugLog } from '../utils/debug_logger'
import { isIOSLike } from '../platform/runtime'
import {
  GAME_CENTER_GAME_IDS,
  isGameFrameOriginAllowed,
  resolveGameCenterLaunchUrl,
  resolveGameFrameAllowedOrigins
} from '../utils/game_center/launch'
import { createModuleHostBridge } from '../utils/game_center/host_bridge'
import { fetchGameLaunchTicket } from '../utils/game_center/api'
import { createGatedTicketRequest, resolveGameTrustPolicy } from '../utils/game_center/origin_policy'
import { DEFAULT_GAME_CENTER_FLAGS, resolveEffectiveGameCenterFlags } from '../utils/game_center/flags'
import { requestGameOpen } from '../utils/game_center/pending_open'
import { fetchRemoteConfig } from '../utils/remote_config.js'
import { useAuthStore } from '../stores/auth'
import {
  appendModuleEnvQueryParams,
  resolveBuildAppVersion
} from '../utils/game_center/module_context'

const props = defineProps({
  session: {
    type: Object,
    default: () => ({})
  }
})

const emit = defineEmits(['back'])

const frameKey = ref(0)
const frameRef = ref(null)
const frameContentHeight = ref(0)
const loading = ref(true)
const loadError = ref('')
const externalOpenUrl = ref('')
const loadHint = ref('')
const usedCapacitorLocalFallback = ref(false)
const usedRemoteFirst = ref(false)
/** 游戏上报的运行模式（SDK notifyMode）：verified / compatibility / standalone */
const gameRuntimeMode = ref('')
/** 宿主桥拒绝记录（诊断用；不含任何 payload） */

let loadingGuardTimer = null
let frameSizeHintTimer = null
let capacitorFallbackTimer = null
let hostBridge = null
/** 游乐场能力开关（远程配置驱动；必须是响应式，origin 白名单与桥都要随其更新）/ */
const hostFlags = ref({ ...DEFAULT_GAME_CENTER_FLAGS })
/** 会话恢复时由宿主重新签发的 Launch Ticket（只驻留内存，绝不落盘/入日志） */
const launchTicketOverride = ref('')

/** 认证状态层（契约 C 前提③「会话已确认」的事实源；只读，不修改） */
const authStore = useAuthStore()
/**
 * ③ 会话已确认：契约 D 的**单一事实源**（`stores/auth.ts` 的 `sessionVerified`，
 * 仅判 `onlineSessionState === 'online'`）。identity-guest 任务（#950）已交付统一，
 * 这里不再保留第二实现（此前多合取的 `isLoggedIn` 与单一事实源存在漂移风险）。
 *
 * 等价性说明：登录/恢复成功的 `online` 写入点都伴随 studentId 非空；登出收口
 *（AuthCoordinator.handleLogout）同步清空 studentId 并把 onlineSessionState 置回
 * `unknown`，不存在「online 且 studentId 为空」的稳定态 —— 因此旧公式的额外
 * `isLoggedIn` 合取项是冗余条件，读取 store 导出即语义一致（契约 D，#963）。
 */
const sessionVerified = computed(() => authStore.sessionVerified)

/** 加载游乐场能力开关（远程配置；失败时用安全默认值，不影响既有模块行为） */
const loadHostFlags = async () => {
  try {
    hostFlags.value = resolveEffectiveGameCenterFlags(await fetchRemoteConfig({ force: false }))
  } catch {
    hostFlags.value = resolveEffectiveGameCenterFlags(null)
  }
  rebuildHostBridge()
}

const safeText = (value) => String(value ?? '').trim()

const moduleName = computed(() => safeText(props.session?.module_name) || '远程模块')
const moduleId = computed(() => safeText(props.session?.module_id))
const moduleVersion = computed(() => safeText(props.session?.version))
const minCompatibleVersion = computed(() => safeText(props.session?.min_compatible_version))
const moduleChannel = computed(() => safeText(props.session?.channel) || 'main')
const invalidReason = computed(() => safeText(props.session?.invalid_reason || props.session?.invalidReason))
const resolvedPreviewSource = computed(() => resolveModuleHostPreviewSource(props.session || {}))

/** 是否属于「湖工游乐场」发起的对局（HTTPS-first 只作用于游戏业务层） */
const launchedFromGameCenter = computed(
  () => safeText(props.session?.launch_surface) === 'game_center' && GAME_CENTER_GAME_IDS.includes(moduleId.value)
)
const previewMode = computed(() => {
  const resolvedKind = safeText(resolvedPreviewSource.value?.sourceKind)
  if (resolvedKind && resolvedKind !== 'invalid') {
    return resolvedKind
  }
  const fallbackMode = safeText(props.session?.preview_mode || props.session?.previewMode)
  if (!canUseLocalModuleBridgePreview() && fallbackMode === 'tauri-local') {
    return ''
  }
  return fallbackMode
})
const previewUrl = computed(() => {
  const resolvedUrl = safeText(resolvedPreviewSource.value?.resolvedPreviewUrl)
  const raw = resolvedUrl || (canUseLocalModuleBridgePreview() ? safeText(props.session?.preview_url) : '')
  if (isLocalModuleBridgePreviewUrl(raw) && !canUseLocalModuleBridgePreview()) {
    return ''
  }
  return raw
})
/**
 * #905 远程 HTTPS-first：游乐场发起的对局优先远端 HTTPS 站点。
 * 本地桥地址**不删除**，通过「兼容模式打开」按钮继续可用
 * （学校网页代理、模块预览、离线缓存这些非游戏业务路径完全不受影响）。
 * 仅当确实解析出远端 HTTPS 地址且与既有解析结果不同才切换，否则保持既有行为（零回归）。
 */
const remoteFirstUrl = computed(() => {
  if (!launchedFromGameCenter.value) return ''
  const remote = resolveGameCenterLaunchUrl({
    resolvedPreviewUrl: resolvedPreviewSource.value?.resolvedPreviewUrl,
    preview_url: safeText(props.session?.preview_url),
    open_url: safeText(props.session?.open_url),
    candidateUrls: resolvedPreviewSource.value?.candidateUrls
  })
  if (!remote || isLocalModuleBridgePreviewUrl(remote)) return ''
  return remote === previewUrl.value ? '' : remote
})
/** 是否仍以远端 HTTPS 地址为准（失败后可由 tryClassicFallback 关闭） */
const remoteFirstActive = ref(true)
const activePreviewUrl = computed(() => {
  if (usedCapacitorLocalFallback.value) {
    const localUrl = safeText(resolvedPreviewSource.value?.localPreviewUrl || props.session?.local_preview_url)
    if (localUrl && !isLocalModuleBridgePreviewUrl(localUrl)) return localUrl
  }
  if (remoteFirstActive.value && remoteFirstUrl.value) return remoteFirstUrl.value
  return previewUrl.value
})
const capacitorLocalFallbackUrl = computed(() => {
  if (usedCapacitorLocalFallback.value) return ''
  const localUrl = safeText(resolvedPreviewSource.value?.localPreviewUrl || props.session?.local_preview_url)
  if (!localUrl || localUrl === activePreviewUrl.value) return ''
  if (isLocalModuleBridgePreviewUrl(localUrl)) return ''
  return localUrl
})
/** 兼容降级目标：远端 HTTPS 失败时切回既有解析结果（本地桥 / 本地包） */
const classicFallbackUrl = computed(() => {
  if (!remoteFirstActive.value || !remoteFirstUrl.value) return ''
  return previewUrl.value && previewUrl.value !== activePreviewUrl.value ? previewUrl.value : ''
})
const ready = computed(() => !!previewUrl.value)
const emptyStateMessage = computed(() => {
  if (invalidReason.value === 'local-cache-missing' || previewMode.value === 'capacitor-local') {
    return '本地模块缓存缺失或入口失效，请返回更多页重新下载模块。'
  }
  if (
    invalidReason.value === 'tauri-bridge-blocked' ||
    isLocalModuleBridgePreviewUrl(safeText(props.session?.preview_url))
  ) {
    return '当前运行时已禁止桌面本地桥地址，请返回更多页重新进入模块。'
  }
  return '模块预览地址缺失，请返回更多页重新进入。'
})

/**
 * iframe 允许来源白名单（#905 硬要求）：
 * 由「实际加载 URL」+「兼容降级 URL」+「远程配置显式 origin」共同推导，**绝不含 '*'**。
 *
 * opaque origin（`'null'`）只在**本地包 / 本地桥**模式下放行：
 * Capacitor iOS 的 `capacitor://localhost`、Tauri 的 `tauri://localhost` 等自定义 scheme
 * 文档在部分 WebView 里上报 `event.origin === 'null'`，严格拒绝会让本地包 iframe 的
 * 高度上报与 SDK 握手全部失效。远端 HTTPS 站点（游乐场主路径）始终严格校验 origin。
 */
const frameAllowedOrigins = computed(() => {
  const allowOpaque = previewMode.value !== 'remote-site'
  return resolveGameFrameAllowedOrigins({
    frameUrl: activePreviewUrl.value || previewUrl.value,
    fallbackUrl: capacitorLocalFallbackUrl.value || classicFallbackUrl.value,
    extraOrigins: hostFlags.value.allowed_game_origins || [],
    allowOpaqueOrigin: allowOpaque
  })
})

const withFrameCacheBust = (url, keyParts = []) => {
  const text = safeText(url)
  if (!text) return ''
  const [basePart, hashPart = ''] = text.split('#', 2)
  if (!basePart) return text
  const token = keyParts
    .map((item) => safeText(item))
    .filter(Boolean)
    .join('-')
  const params = new URLSearchParams()
  params.set('_host_frame_v', token || `${Date.now()}`)
  const joiner = basePart.includes('?') ? '&' : '?'
  const nextUrl = `${basePart}${joiner}${params.toString()}`
  return hashPart ? `${nextUrl}#${hashPart}` : nextUrl
}

/** 会话恢复策略 A：把宿主新签发的 ticket 注入 iframe URL（渲染期拼接，不修改 session 对象） */
const withLaunchTicket = (url) => {
  const text = safeText(url)
  const ticket = safeText(launchTicketOverride.value)
  if (!text || !ticket) return text
  try {
    const parsed = new URL(text, window.location.origin)
    parsed.searchParams.set('gpt', ticket)
    return parsed.toString()
  } catch {
    return text
  }
}

/**
 * P1-A / P1-B：托管页的宿主上下文注入（additive，渲染期拼接）。
 * - `app_version`：构建版本（灰度 deny 名单匹配用，必须始终注入）；
 * - `host_origin`：宿主自身 origin —— SDK 只接受显式来源（配置 > 本参数），
 *   无此参数即 fail closed（不握手、零 V2 请求）。两者都不是身份，与登录态无关。
 */
const withHostContextParams = (url) => {
  const text = safeText(url)
  if (!text) return text
  try {
    const parsed = new URL(text, window.location.origin)
    appendModuleEnvQueryParams(parsed, {
      appVersion: resolveBuildAppVersion(),
      hostOrigin: window.location.origin,
      // G10 兜底：非特殊 scheme（tauri: / capacitor:）下 location.origin === 'null'；
      // 传入 location 对象后由注入层退化为 `${protocol}//${host}`（仍然 fail closed）。
      hostLocation: window.location
    })
    return parsed.toString()
  } catch {
    return text
  }
}

const frameSrc = computed(() =>
  withFrameCacheBust(
    withLaunchTicket(withHostContextParams(activePreviewUrl.value)),
    [moduleChannel.value || 'main', moduleVersion.value || 'unknown', String(frameKey.value)]
  )
)

const hasEmbeddedFrameHeight = computed(() => frameContentHeight.value > 0)

const clearLoadingGuardTimer = () => {
  if (loadingGuardTimer) {
    clearTimeout(loadingGuardTimer)
    loadingGuardTimer = null
  }
}

const clearFrameSizeHintTimer = () => {
  if (frameSizeHintTimer) {
    clearTimeout(frameSizeHintTimer)
    frameSizeHintTimer = null
  }
}

const clearCapacitorFallbackTimer = () => {
  if (capacitorFallbackTimer) {
    clearTimeout(capacitorFallbackTimer)
    capacitorFallbackTimer = null
  }
}

const scheduleFrameSizeFallback = () => {
  // iOS WKWebView 有时不会发送 mini-hbut:module-size 消息，
  // 超时后设置一个默认高度让 iframe 可见，避免黑屏
  clearFrameSizeHintTimer()
  frameSizeHintTimer = window.setTimeout(() => {
    if (frameContentHeight.value > 0 || loadError.value) return
    // 默认设为 800px 以保证内容可见，后续收到真实高度再调整
    frameContentHeight.value = 800
    loading.value = false
    loadHint.value = '模块页面已加载，使用默认显示高度。'
    pushDebugLog('ModuleHost', `使用默认高度 800px（模块未上报尺寸）`, 'info')
    // iOS 额外检测：如果 iframe 内容实际为空（白屏），10 秒后提供外部打开选项
    // 平台判断统一收敛到 src/platform/runtime.ts（单一来源）
    const isIos = isIOSLike()
    if (isIos) {
      window.setTimeout(() => {
        if (frameContentHeight.value === 800 && !loadError.value) {
          const src = frameSrc.value
          if (src && src.startsWith('http')) {
            externalOpenUrl.value = src
            loadHint.value = 'iOS 设备可能无法嵌入显示，可尝试在浏览器中打开。'
            pushDebugLog('ModuleHost', `iOS 白屏检测触发，提供外部打开`, 'warn', { src: src?.slice(0, 100) })
          }
        }
      }, 6000)
    }
  }, 3500)
}

const tryCapacitorLocalFallback = () => {
  const fallbackUrl = capacitorLocalFallbackUrl.value
  if (!fallbackUrl) return false
  usedCapacitorLocalFallback.value = true
  frameKey.value += 1
  resetFrameState()
  return true
}

// Android 连接拒绝重试：检测到 127.0.0.1 连接失败时自动切换远程 URL
const scheduleConnectionRefusedRetry = () => {
  capacitorFallbackTimer = window.setTimeout(() => {
    if (frameContentHeight.value > 0) return
    if (usedCapacitorLocalFallback.value) return
    const currentSrc = frameSrc.value
    if (!currentSrc || !currentSrc.includes('127.0.0.1')) return
    if (tryCapacitorLocalFallback()) {
      loadHint.value = '本地桥接连接超时，切换到备用地址...'
    }
  }, 3000)
}

const scheduleFrameSizeHint = () => {
  clearFrameSizeHintTimer()
  frameSizeHintTimer = window.setTimeout(() => {
    if (frameContentHeight.value > 0 || loadError.value) return
    loadHint.value = '模块页面已加载，正在等待模块上报真实高度。'
  }, 1200)
}

const resetFrameState = () => {
  clearLoadingGuardTimer()
  clearFrameSizeHintTimer()
  clearCapacitorFallbackTimer()
  frameContentHeight.value = 0
  loading.value = ready.value
  loadError.value = ''
  loadHint.value = ''
  externalOpenUrl.value = ''
  pushDebugLog('ModuleHost', `iframe 开始加载`, 'info', {
    src: frameSrc.value?.slice(0, 150),
    previewMode: previewMode.value,
    ua: String(globalThis?.navigator?.userAgent || '').slice(0, 80)
  })
  if (!ready.value) return
  // WebView 某些场景下 iframe load 事件可能延迟，超时后先给出明确状态。
  loadingGuardTimer = window.setTimeout(() => {
    if (!loading.value) return
    loading.value = false
    loadHint.value = '模块页面已开始渲染，正在等待模块上报真实高度。'
    pushDebugLog('ModuleHost', `加载超时（4.5s），iframe 未触发 load 事件`, 'warn', {
      src: frameSrc.value?.slice(0, 120),
      previewMode: previewMode.value
    })
    // 同时启动连接拒绝兜底（Android 场景）
    scheduleConnectionRefusedRetry()
  }, 4500)
}

const handleFrameSizeMessage = (event) => {
  const frameWindow = frameRef.value?.contentWindow
  const payload = event?.data
  if (!frameWindow || event.source !== frameWindow) return
  // #905 硬要求：**必须校验 event.origin**（旧实现只看 event.source，可被同窗口其它 iframe 冒充）
  if (!isGameFrameOriginAllowed(event.origin, frameAllowedOrigins.value)) {
    pushDebugLog('ModuleHost', '拒绝来源不在白名单的模块消息', 'warn', {
      origin: safeText(event.origin),
      allowList: frameAllowedOrigins.value.join(',')
    })
    return
  }
  if (!payload || payload.type !== 'mini-hbut:module-size') return

  const nextModuleId = safeText(payload.module_id || payload.moduleId)
  const nextVersion = safeText(payload.version)
  if (moduleId.value && nextModuleId && nextModuleId !== moduleId.value) return
  if (moduleVersion.value && nextVersion && nextVersion !== moduleVersion.value) return

  const nextHeight = Math.ceil(Number(payload.height) || 0)
  if (nextHeight <= 0) return

  clearLoadingGuardTimer()
  clearFrameSizeHintTimer()
  frameContentHeight.value = nextHeight
  loading.value = false
  loadHint.value = ''
}

/**
 * 处理 Game SDK 握手消息（hello / request-ticket / mode）。
 * 桥自身已完成 source + origin + request_id + game_id + protocol_version 校验；
 * 这里只负责把「取票」接线到 Identity AT 换 ticket 的真实链路。
 */
const handleHostBridgeMessage = (event) => {
  hostBridge?.handleMessage(event)
}

/**
 * #1002：处理「打开另一个模块」请求（总面板里的游戏宫格点击后由模块侧发出）。
 *
 * 安全：与 `mini-hbut:module-size` 同规矩 —— 必须校验 `event.source` 与
 * `event.origin` 白名单，否则同窗口的其它 iframe 可以冒充模块要求打开任意模块。
 *
 * 行为：只写入一次性开局意图并回退到「更多」，由 `MoreView` 消费后打开目标游戏 ——
 * 复用既有 `pending_open` 通道，**不在本组件复制模块打开状态机**（否则会与
 * MoreView 的清单/bundle 解析逻辑漂移）。
 */
const handleOpenModuleMessage = (event) => {
  const frameWindow = frameRef.value?.contentWindow
  const payload = event?.data
  if (!frameWindow || event.source !== frameWindow) return
  if (!payload || payload.type !== 'mini-hbut:open-module') return
  if (!isGameFrameOriginAllowed(event.origin, frameAllowedOrigins.value)) {
    pushDebugLog('ModuleHost', '拒绝来源不在白名单的 open-module 请求', 'warn', {
      origin: safeText(event.origin),
      allowList: frameAllowedOrigins.value.join(',')
    })
    return
  }
  const targetModuleId = safeText(payload.moduleId || payload.module_id)
  // 空值不处理；也不允许面板要求「打开自己」（会形成自嵌套）
  if (!targetModuleId || targetModuleId === moduleId.value) return
  if (!requestGameOpen(targetModuleId)) return
  emit('back')
}

/**
 * 契约 C「单一前置判定」：是否允许进入 verified（向游戏声明 verified 能力 / 下发 ticket）。
 *
 * 三前提在此**唯一**收敛（不得在别处各写一遍）：
 *   ① 有可信 Host 握手（桥拿到 frameWindow 且来源白名单非空）；
 *   ② 实际加载地址的 origin 落在**显式白名单**（远程配置 `allowed_game_origins`）内；
 *   ③ 会话已确认（游客态 / 仅缓存身份 → false）。
 * 另含既有前提：产品开关打开 + 取票渠道已接线。
 *
 * 判定不通过 → 对游戏声明保守能力、**零请求**不下发 ticket；游戏仍可玩
 *（SDK 降级 compatibility/standalone，本地成绩保留）。
 */
const evaluateGameTrustPolicy = () =>
  resolveGameTrustPolicy({
    handshakeTrusted: Boolean(frameRef.value?.contentWindow) && frameAllowedOrigins.value.length > 0,
    origin: activePreviewUrl.value || previewUrl.value,
    allowedOrigins: hostFlags.value.allowed_game_origins || [],
    sessionVerified: sessionVerified.value,
    verifiedFeatureEnabled: hostFlags.value.game_verified_session_enabled === true,
    // 取票渠道在本组件内固定接线（真实失败仍由 fetchGameLaunchTicket 自身降级为空 ticket）
    ticketSourceAvailable: true,
    baseFeatures: {
      game_center_enabled: hostFlags.value.game_center_enabled === true,
      game_verified_session_enabled: hostFlags.value.game_verified_session_enabled === true,
      game_economy_enabled: hostFlags.value.game_economy_enabled === true,
      drift_bottle_enabled: hostFlags.value.drift_bottle_enabled === true
    }
  })

/**
 * 真实取票实现（唯一调用点）。
 * 必须先经 `createGatedTicketRequest` 判定；判定不通过时本函数**不会被调用**（零请求）。
 */
const requestLaunchTicket = async () => {
  const result = await fetchGameLaunchTicket({
    gameId: moduleId.value,
    apiBase: hostFlags.value.api_base,
    idempotencyKey: ''
  })
  if (!result.ticket) return null
  return { ticket: result.ticket, expiresAt: result.expiresAt }
}

/** 创建（或重建）宿主桥：iframe remount / origin 白名单变化时必须整体替换 */
const rebuildHostBridge = () => {
  hostBridge?.dispose()
  const policy = evaluateGameTrustPolicy()
  hostBridge = createModuleHostBridge({
    moduleId: moduleId.value,
    frameWindow: frameRef.value?.contentWindow || null,
    allowedOrigins: frameAllowedOrigins.value,
    // 契约 C：判定不通过 → 声明的 verified / economy / drift 能力一律保守 false，
    // 游戏侧据此前置隐藏入口（不得「先发请求再吞 403」）。
    features: policy.features,
    // 取票唯一入口：判定不通过时零请求直接返回 null（不发 /tickets）；
    // 判定通过才落到真实取票（失败仍按协议 §6.2.3 降级 compatibility/standalone）。
    requestTicket: createGatedTicketRequest({
      resolvePolicy: evaluateGameTrustPolicy,
      requestTicket: requestLaunchTicket
    }),
    onMode: (mode) => {
      gameRuntimeMode.value = mode
    }
  })
}

/** 兼容降级：从远端 HTTPS 切回既有解析地址（本地桥 / 本地包），并 remount iframe */
const tryClassicFallback = () => {
  if (usedCapacitorLocalFallback.value) return false
  if (classicFallbackUrl.value) {
    remoteFirstActive.value = false
    frameKey.value += 1
    resetFrameState()
    return true
  }
  return tryCapacitorLocalFallback()
}

const reloadFrame = () => {
  if (!ready.value) return
  frameKey.value += 1
  resetFrameState()
}

const handleLoad = () => {
  clearLoadingGuardTimer()
  clearCapacitorFallbackTimer()
  loading.value = false
  loadError.value = ''
  // iframe 完成加载后 contentWindow 才可用：在此重建宿主桥（来源白名单同步刷新）
  rebuildHostBridge()
  pushDebugLog('ModuleHost', `iframe onload 触发`, 'info', {
    src: frameSrc.value?.slice(0, 120),
    hasHeight: frameContentHeight.value > 0
  })
  if (!frameContentHeight.value) {
    scheduleFrameSizeHint()
    scheduleFrameSizeFallback()
  }
}

const handleError = () => {
  clearLoadingGuardTimer()
  clearFrameSizeHintTimer()
  clearCapacitorFallbackTimer()
  clearFrameSizeHintTimer()
  pushDebugLog('ModuleHost', `iframe onerror 触发`, 'error', {
    src: frameSrc.value?.slice(0, 120),
    previewMode: previewMode.value
  })
  // #905：游乐场 HTTPS-first 失败时，先降级回既有解析地址（兼容模式）
  if (classicFallbackUrl.value && tryClassicFallback()) return
  // 连接拒绝检测：本地桥接失败时尝试降级
  const currentSrc = frameSrc.value
  if (currentSrc && currentSrc.includes('127.0.0.1')) {
    if (tryCapacitorLocalFallback()) return
  }
  // 远端加载失败时尝试降级到本地 Capacitor 缓存
  if (tryCapacitorLocalFallback()) return
  loading.value = false
  frameContentHeight.value = 0
  // iOS 特殊处理：提供外部浏览器打开选项（平台判断收敛到 runtime.ts）
  const isIos = isIOSLike()
  if (isIos && currentSrc && currentSrc.startsWith('http')) {
    loadError.value = '当前设备不支持嵌入加载，请点击下方按钮在浏览器中打开。'
    externalOpenUrl.value = currentSrc
  } else {
    loadError.value =
      previewMode.value === 'capacitor-local'
        ? '本地模块页面加载失败，请返回更多页重新下载后再试。'
        : '模块页面加载失败，请返回更多页后重试。'
  }
  loadHint.value = ''
}

watch(
  () => previewUrl.value,
  () => {
    remoteFirstActive.value = true
    frameKey.value += 1
    resetFrameState()
  },
  { immediate: true }
)

/**
 * 契约 C：会话确认状态可能在 iframe 加载**之后**才落定（冷启动恢复 / 自动重登）。
 * 落定时重建宿主桥，保证下一次 hello 拿到的能力声明与当前判定一致
 *（未确认期间一律保守：不声明 verified、不下发 ticket）。
 */
watch(sessionVerified, () => {
  rebuildHostBridge()
})

/**
 * 会话恢复策略 A（协议 §6.2.3）：resume 前由**宿主重新申请 ticket**并更新 iframe URL，
 * 游戏重新兑换；旧 ticket 是否已兑换都不阻塞（策略 B 的 exchange 幂等仍由服务端保证）。
 * 契约 C：单一前置判定不通过（未登录 / origin 不在白名单 / 开关关闭）→ **零请求**保持既有 remount。
 */
const refreshLaunchTicketForResume = async () => {
  const policy = evaluateGameTrustPolicy()
  if (!policy.verifiedEligible || !policy.launchTicketAllowed) return
  const result = await fetchGameLaunchTicket({
    gameId: moduleId.value,
    apiBase: hostFlags.value.api_base
  })
  if (result.ticket) launchTicketOverride.value = result.ticket
}

const handleAppEmbedResumeEvent = async (event) => {
  const view = String(event?.detail?.view || '')
  if (view && view !== 'more_module_host') return

  const detail = event?.detail || {}
  const usesLoopback = isLocalModuleBridgePreviewUrl(safeText(previewUrl.value))
  let bridgeOk = detail.bridgeOk !== false

  // #453：loopback 模块在 resume 时先 ensure bridge，再 remount
  if (usesLoopback && canUseLocalModuleBridgePreview()) {
    try {
      const { recoverSchoolWebsiteBridgeOnResume } = await import('../utils/school_website_embed')
      bridgeOk = await recoverSchoolWebsiteBridgeOnResume()
    } catch {
      bridgeOk = false
    }
  }

  loadError.value = ''
  loadHint.value = ''
  externalOpenUrl.value = ''
  usedCapacitorLocalFallback.value = false
  remoteFirstActive.value = true

  if (usesLoopback && !bridgeOk) {
    // Bridge 仍死：优先 Capacitor 本地降级，否则可操作错误（重试/外开/回更多）
    if (tryCapacitorLocalFallback()) {
      return
    }
    loading.value = false
    loadError.value =
      '模块本地服务暂时不可用。可点右上角重试；或返回更多页重新进入/下载模块。'
    const raw = safeText(props.session?.open_url || props.session?.preview_url)
    if (raw && raw.startsWith('http') && !isLocalModuleBridgePreviewUrl(raw)) {
      externalOpenUrl.value = raw
    }
    return
  }

  // #905 恢复策略 A：先换新 ticket 再 remount（失败不阻塞，仍按策略 B 幂等重放）
  try {
    await refreshLaunchTicketForResume()
  } catch {
    // 取票失败：保持既有 URL remount，由 SDK 走 compatibility/standalone 降级
  }

  // 后台恢复：强制换 key remount iframe
  reloadFrame()
}

onMounted(() => {
  window.addEventListener('message', handleFrameSizeMessage)
  window.addEventListener('message', handleHostBridgeMessage)
  window.addEventListener('message', handleOpenModuleMessage)
  window.addEventListener('hbu-embed-resume', handleAppEmbedResumeEvent)
  void loadHostFlags()
})

onBeforeUnmount(() => {
  clearLoadingGuardTimer()
  clearFrameSizeHintTimer()
  clearCapacitorFallbackTimer()
  hostBridge?.dispose()
  hostBridge = null
  window.removeEventListener('message', handleFrameSizeMessage)
  window.removeEventListener('message', handleHostBridgeMessage)
  window.removeEventListener('message', handleOpenModuleMessage)
  window.removeEventListener('hbu-embed-resume', handleAppEmbedResumeEvent)
})
</script>

<template>
  <div class="more-module-host-view">
    <TPageHeader :title="moduleName" @back="emit('back')">
      <template #actions>
        <button class="icon-btn" :disabled="!ready" @click="reloadFrame">↻</button>
      </template>
    </TPageHeader>

    <div class="more-module-host-view__body">
      <div v-if="!ready" class="module-empty-card">
        <TEmptyState type="empty" :message="emptyStateMessage" />
      </div>

      <div
        v-else
        class="module-frame-shell"
        :class="{ 'module-frame-shell--content': hasEmbeddedFrameHeight }"
      >
        <div v-if="loading" class="module-loading-overlay">
          <TEmptyState type="loading" message="正在加载模块页面..." />
        </div>
        <div v-if="loadError" class="module-frame-error">
          {{ loadError }}
          <button class="external-open-btn" @click="reloadFrame">重试</button>
          <!-- #905：远端 HTTPS 加载失败时允许切回既有解析地址（兼容模式），不是死路 -->
          <button v-if="classicFallbackUrl || capacitorLocalFallbackUrl" class="external-open-btn" @click="tryClassicFallback">
            以兼容模式打开
          </button>
          <button v-if="externalOpenUrl" class="external-open-btn" @click="openExternal(externalOpenUrl)">
            在浏览器中打开
          </button>
        </div>
        <div v-else-if="loadHint" class="module-frame-hint">
          {{ loadHint }}
          <button v-if="externalOpenUrl" class="external-open-btn" @click="openExternal(externalOpenUrl)">
            在浏览器中打开
          </button>
        </div>
        <iframe
          :key="frameKey"
          ref="frameRef"
          class="module-frame"
          :class="{ 'module-frame--content': hasEmbeddedFrameHeight }"
          :src="frameSrc"
          allowfullscreen
          allow="cross-origin-isolated; clipboard-write"
          referrerpolicy="no-referrer-when-downgrade"
          loading="eager"
          @load="handleLoad"
          @error="handleError"
        ></iframe>
      </div>
    </div>
  </div>
</template>

<style scoped>
.more-module-host-view {
  min-height: calc(var(--app-vh, 1vh) * 100);
  min-height: 100dvh;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--ui-bg-gradient);
  overflow: hidden;
}

.more-module-host-view__body {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 8px;
  padding: 8px 0 0;
  overflow: hidden;
}

.module-empty-card {
  border: 1px solid rgba(148, 163, 184, 0.24);
  border-radius: calc(18px * var(--ui-radius-scale));
  background: color-mix(in oklab, var(--ui-surface) 88%, #fff 12%);
  backdrop-filter: blur(14px);
  box-shadow: var(--ui-shadow-soft);
}

.module-empty-card {
  padding: 18px;
}

.module-frame-shell {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  min-width: 0;
  overflow: hidden;
  isolation: isolate;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
  padding: 0;
}

.module-frame-shell--content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.module-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.9), rgba(255, 255, 255, 0.78));
  backdrop-filter: blur(6px);
}

.module-frame {
  display: block;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  border: 0;
  background: transparent;
}

.module-frame--content {
  flex: 1;
  min-height: 0;
}

.module-frame-error,
.module-frame-hint {
  position: absolute;
  top: 14px;
  left: 14px;
  right: 14px;
  z-index: 2;
  padding: 10px 12px;
  border-radius: calc(12px * var(--ui-radius-scale));
  font-size: calc(12px * var(--ui-font-scale));
  font-weight: 600;
}

.module-frame-error {
  background: rgba(239, 68, 68, 0.12);
  color: var(--ui-danger);
}

.module-frame-hint {
  background: rgba(59, 130, 246, 0.12);
  color: color-mix(in oklab, var(--ui-primary) 78%, #1d4ed8 22%);
}

.external-open-btn {
  display: block;
  margin: 10px auto 0;
  padding: 8px 20px;
  background: var(--ui-primary);
  color: #fff;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.external-open-btn:active {
  transform: scale(0.96);
  opacity: 0.8;
}

.icon-btn {
  width: 36px;
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid rgba(148, 163, 184, 0.24);
  background: color-mix(in oklab, var(--ui-surface) 92%, white 8%);
  color: var(--ui-text);
  cursor: pointer;
}

.icon-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 760px) {
  .more-module-host-view__body {
    padding: 8px 0 0;
  }
}
</style>
