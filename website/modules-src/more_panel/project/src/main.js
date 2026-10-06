/**
 * 湖工游乐场总面板（#1002）。
 *
 * ## 形态
 * 与其它游戏模块完全一致：静态 bundle + 远程内嵌（宿主用 iframe 打开，注入一次性
 * ticket / 身份 / 环境参数）。因此 Windows / iOS / Android 三端走的是同一条链路，
 * 不需要任何平台特判。
 *
 * ## 核心要求（决定了下面的渲染顺序）
 * 「**直接显示在更多页里，而不是等它加载完之后才显示**」——
 * 所以：先渲染骨架（HTML 里已内联）→ 再异步取数据 → 用状态而非「有无节点」表达
 * 加载中 / 未登录 / 失败 / 空。任何一步失败都不会让面板整块消失。
 *
 * ## 数据来源
 * - 身份与环境：宿主注入的 URL query（`student_id` / `class_name` / `app_version` 等），
 *   与其它模块同一套注入层（`MoreView.appendModuleContextQuery`）。
 * - 积分：Game Platform V2 `/me/wallet`、`/me/daily-tasks`。**注意**：主域
 *   `mini.hbut.site` 目前未部署 `/api/game-platform/v1/*`，未实现时按「暂未开放」呈现
 *   （见 docs/architecture/production-backend-gaps.md），绝不假装有数据。
 * - 游戏清单：与本模块同源发布的 `catalog.json`（同 CDN、同 channel 目录）。
 */

const STATE = {
  booting: 'booting',
  ready: 'ready',
  guest: 'guest',
  unavailable: 'unavailable',
  failed: 'failed'
}

const MODULE_ID = 'more_panel'
/** 模块 → 宿主的高度上报协议（与其它模块同一套：宿主据此设置 iframe 高度） */
const HOST_SIZE_MESSAGE_TYPE = 'mini-hbut:module-size'
/** 模块 → 宿主的「打开另一个模块」协议（#1002：面板宫格点击） */
const HOST_OPEN_MESSAGE_TYPE = 'mini-hbut:open-module'

const $ = (id) => document.getElementById(id)

/** 从宿主注入的 query 读取上下文（缺失一律空串，调用方自行决定降级） */
const readContext = () => {
  const params = new URLSearchParams(window.location.search)
  const read = (key) => String(params.get(key) || '').trim()
  return {
    studentId: read('student_id'),
    playerName: read('player_name'),
    className: read('class_name'),
    appVersion: read('app_version'),
    hostOrigin: read('host_origin'),
    // 游戏平台基址：宿主可能用 `game_platform_api` 或 `api_base` 两个名字之一注入
    gamePlatformApi:
      read('game_platform_api') || read('game_platform_api_base') || read('api_base'),
    // 宿主注入的目录地址与主题：
    // - `game_list`：宿主直接注入的游戏清单（首选）。面板由 Rust bridge 提供、
    //   而 catalog 在 CDN 上 → 面板自行 fetch 属**跨域**会被 CORS 拦下，且还要等网络；
    //   注入后首帧即可渲染游戏。
    // - `catalog_url`：无注入清单时的回退地址（同源部署时可用）。
    // - `theme`：iframe 看不到宿主的 html.dark，而 prefers-color-scheme 是系统偏好。
    gameList: read('game_list'),
    catalogUrl: read('catalog_url'),
    theme: read('theme'),
    runtime: read('runtime')
  }
}

/** 解析宿主注入的游戏清单（JSON）；不可用时返回 null 交给回退路径 */
const parseInjectedGameList = (ctx) => {
  const raw = String(ctx.gameList || '').trim()
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    const entries = parsed
      .filter((item) => item && typeof item === 'object' && String(item.id || '').trim())
      .map((item) => ({
        id: String(item.id).trim(),
        name: String(item.name || item.id).trim(),
        icon: String(item.icon || '🎮').trim()
      }))
      .filter((item) => item.id !== MODULE_ID)
    return entries
  } catch {
    return null
  }
}

/**
 * 从自身 URL 推导**模块构建版本**。
 *
 * ⚠️ 必须与宿主的 `moduleVersion` 一致，否则宿主会因版本不匹配**丢弃**高度上报
 * （`MoreModuleHostView` 的 `module-size` 分支按 module_id + version 双重校验）。
 * 曾误用 `app_version`（App 版本）→ 上报被静默丢弃 → 宿主一直显示加载提示并压在面板标题上。
 *
 * 两种形态都要覆盖：CDN 直链 `/modules/<channel>/<id>/<version>/`，
 * 以及宿主下载后由 Rust bridge 预览的 `/module_bundle/content/<channel>/<id>/<version>/`。
 */
const resolveModuleVersionFromUrl = () => {
  const source = `${window.location.href} ${window.location.pathname}`
  const patterns = [
    /\/module_bundle\/content\/[^/]+\/[^/]+\/([^/]+)\//i,
    /\/modules\/[^/]+\/[^/]+\/([^/]+)\//i
  ]
  for (const pattern of patterns) {
    const matched = source.match(pattern)
    if (matched && matched[1]) return matched[1]
  }
  return ''
}

/**
 * 解析游戏清单（catalog.json）地址。
 *
 * 优先用宿主注入的 `catalog_url`：面板常以 bridge 预览形态加载
 * （`/module_bundle/content/...`），此时自身 URL 推导出的地址**不是**目录所在位置。
 * 注入缺失时才回退到按路径推导。
 */
const resolveCatalogUrl = (ctx) => {
  const injected = String(ctx.catalogUrl || '').trim()
  if (injected) return injected
  const pathname = String(window.location.pathname || '')
  const bridgeMatch = pathname.match(/^(.*\/module_bundle\/content\/[^/]+\/)/)
  if (bridgeMatch) return `${bridgeMatch[1]}catalog.json`
  const cdnMatch = pathname.match(/^(.*\/modules\/[^/]+\/)/)
  if (cdnMatch) return `${cdnMatch[1]}catalog.json`
  return ''
}

/**
 * 应用宿主注入的主题。
 *
 * iframe 拿不到宿主的 `html.dark`，而 `prefers-color-scheme` 反映的是**系统**偏好 ——
 * App 内可独立切主题，两者会不一致。宿主注入 `theme` 时以它为准（见 style.css 的
 * `[data-theme]` 覆盖规则）。
 */
const applyTheme = (ctx) => {
  const theme = String(ctx.theme || '').toLowerCase()
  if (theme !== 'light' && theme !== 'dark') return
  document.documentElement.dataset.theme = theme
}

/**
 * postMessage 的 targetOrigin。
 *
 * ⚠️ `location.origin` 在 tauri:// 等特殊 scheme 下是字符串 `'null'`，而 `'null'`
 * **不是合法的 targetOrigin**（postMessage 会直接不投递）。所以这里显式回退到 `'*'`，
 * 接收侧（宿主）仍会校验 event.origin 白名单，安全性不受影响。
 */
const resolveTargetOrigin = (ctx) => {
  const origin = String(ctx.hostOrigin || '').trim()
  return !origin || origin === 'null' ? '*' : origin
}

/**
 * 向宿主上报内容高度（其它模块的既定契约；缺了它宿主只能退化成固定高度，
 * 内容可能被裁切或留大片空白）。
 */
const reportModuleSize = () => {
  const ctx = readContext()
  const panel = $('panel')
  const height = Math.max(
    1,
    Math.ceil(
      Math.max(
        Number(panel?.scrollHeight || 0),
        Number(panel?.offsetHeight || 0),
        Number(document.documentElement?.scrollHeight || 0),
        Number(document.body?.scrollHeight || 0)
      )
    )
  )
  try {
    window.parent.postMessage(
      {
        type: HOST_SIZE_MESSAGE_TYPE,
        moduleId: MODULE_ID,
        module_id: MODULE_ID,
        // 必须是**模块构建版本**（与宿主 session 里的 version 一致），
        // 发 app_version 会被宿主的版本校验丢弃
        version: resolveModuleVersionFromUrl(),
        height
      },
      resolveTargetOrigin(ctx)
    )
  } catch (error) {
    console.warn('[more-panel] 上报模块高度失败', error)
  }
}

/** 内容变化后重新上报（rAF 合并，避免连续渲染时抖动） */
let sizeReportScheduled = false
const scheduleSizeReport = () => {
  if (sizeReportScheduled) return
  sizeReportScheduled = true
  const flush = () => {
    sizeReportScheduled = false
    reportModuleSize()
  }
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(flush)
  else setTimeout(flush, 16)
}

/**
 * 启动期重复上报。
 *
 * 单次上报会输给宿主的「加载提示」定时器：iframe 首帧的 rAF 不一定在宿主计时窗口内落地，
 * 宿主就会一直显示加载提示并压在面板标题上（本机实测）。这里在启动后的一小段时间内
 * 重复上报几次（幂等、开销可忽略），把这类时序竞态压掉；之后由 resize / ResizeObserver 接管。
 */
const SIZE_REPORT_BURST_MS = [0, 300, 800, 1500, 3000, 5000]
const startSizeReportBurst = () => {
  for (const delay of SIZE_REPORT_BURST_MS) {
    if (delay === 0) {
      scheduleSizeReport()
      continue
    }
    setTimeout(scheduleSizeReport, delay)
  }
}

const setState = (state) => {
  document.getElementById('panel').dataset.state = state
}

const setHint = (id, text) => {
  const node = $(id)
  if (node) node.textContent = text || ''
}

/** 渲染身份行：拿不到就明确说「未注入身份」，而不是留空让人猜 */
const renderIdentity = (ctx) => {
  const node = $('identity')
  if (!node) return
  const parts = []
  if (ctx.studentId) parts.push(ctx.studentId)
  if (ctx.className) parts.push(ctx.className)
  node.textContent = parts.length ? parts.join(' · ') : '未注入身份信息（游客态）'
}

/** 以「状态」渲染积分摘要：未实现 / 未登录 / 失败 都必须有明确文案 */
const renderPointsUnavailable = (text) => {
  $('level').textContent = '—'
  $('coins').textContent = '—'
  $('tasks').textContent = '—'
  setHint('points-hint', text)
  scheduleSizeReport()
}

const renderPoints = (wallet, tasks) => {
  $('level').textContent = wallet?.level != null ? String(wallet.level) : '—'
  $('coins').textContent = wallet?.coins != null ? String(wallet.coins) : '—'
  if (tasks && typeof tasks.completed === 'number' && typeof tasks.total === 'number') {
    $('tasks').textContent = `${tasks.completed}/${tasks.total}`
  } else {
    $('tasks').textContent = '—'
  }
  setHint('points-hint', '')
  scheduleSizeReport()
}

const fetchJson = async (url, timeoutMs = 8000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { signal: controller.signal, credentials: 'omit' })
    if (!response.ok) return { ok: false, status: response.status }
    const text = await response.text()
    try {
      return { ok: true, data: JSON.parse(text) }
    } catch {
      // 端点返回 HTML（例如后端未在服务 / 未部署）—— 必须与「网络失败」区分开
      return { ok: false, status: response.status, reason: 'not-json' }
    }
  } catch (error) {
    return { ok: false, reason: 'network', message: String((error && error.message) || error) }
  } finally {
    clearTimeout(timer)
  }
}

const loadPoints = async (ctx) => {
  const base = String(ctx.gamePlatformApi || '').replace(/\/+$/, '')
  if (!base) {
    renderPointsUnavailable('积分服务未配置，暂不可用')
    return
  }
  if (!ctx.studentId) {
    renderPointsUnavailable('登录后可查看积分')
    return
  }

  const [wallet, tasks] = await Promise.all([
    fetchJson(`${base}/me/wallet`),
    fetchJson(`${base}/me/daily-tasks`)
  ])

  if (wallet.ok) {
    renderPoints(wallet.data, tasks.ok ? tasks.data : null)
    return
  }
  if (wallet.status === 401 || wallet.status === 403) {
    renderPointsUnavailable('登录状态已失效，请重新登录')
    return
  }
  if (wallet.status === 404) {
    // 后端未部署该端点（主域现状）：明确说「暂未开放」，不要伪装成网络错误
    renderPointsUnavailable('积分功能暂未开放')
    return
  }
  renderPointsUnavailable(
    wallet.reason === 'not-json' ? '积分服务返回异常（后端可能未部署）' : '积分加载失败，请稍后重试'
  )
}

/** 游戏宫格：先骨架、后填充；点击把意图交给宿主（宿主负责真正打开与门禁） */
const renderGames = (entries) => {
  const grid = $('games-grid')
  if (!grid) return
  grid.textContent = ''
  if (!entries.length) {
    grid.innerHTML = '<p class="grid__empty">暂无可打开的游戏</p>'
    scheduleSizeReport()
    return
  }
  for (const entry of entries) {
    const tile = document.createElement('button')
    tile.type = 'button'
    tile.className = 'tile'
    tile.dataset.moduleId = entry.id
    tile.innerHTML = `<span class="tile__icon" aria-hidden="true">${entry.icon || '🎮'}</span><span class="tile__name"></span>`
    tile.querySelector('.tile__name').textContent = entry.name || entry.id
    tile.addEventListener('click', () => requestOpen(entry.id))
    grid.appendChild(tile)
  }
  scheduleSizeReport()
}

/**
 * 请求宿主打开某个模块。
 *
 * 消息协议：`{ type: 'mini-hbut:open-module', moduleId }`，`targetOrigin` 取宿主注入的
 * `host_origin`（**必须校验**，与其它模块的 postMessage 同规矩）。
 *
 * ⚠️ 宿主侧需要实现该消息类型的处理（见 issue #1002 的接入清单）；
 * 未实现时这里只记录，不假装已打开。
 */
const requestOpen = (moduleId) => {
  const ctx = readContext()
  try {
    window.parent.postMessage(
      { type: HOST_OPEN_MESSAGE_TYPE, moduleId, module_id: moduleId },
      resolveTargetOrigin(ctx)
    )
  } catch (error) {
    console.warn('[more-panel] 请求打开模块失败', moduleId, error)
  }
  setHint('games-hint', '正在打开…')
}

const loadGames = async (ctx) => {
  // 回退路径：无注入清单时自行拉取 catalog（要求与面板同源，否则会被 CORS 拦）
  const url = resolveCatalogUrl(ctx)
  if (!url) {
    setHint('games-hint', '游戏清单地址无法推导')
    return
  }
  const result = await fetchJson(url)
  if (!result.ok || !Array.isArray(result.data?.modules)) {
    setHint('games-hint', '游戏清单加载失败，请稍后重试')
    return
  }
  const entries = result.data.modules
    .filter((item) => item && item.disabled !== true && item.id !== MODULE_ID)
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((item) => ({ id: item.id, name: item.name, icon: item.icon }))
  renderGames(entries)
  setHint('games-hint', entries.length ? '' : '暂无可打开的游戏')
}

const main = () => {
  const ctx = readContext()
  applyTheme(ctx)
  renderIdentity(ctx)
  setState(ctx.studentId ? STATE.ready : STATE.guest)
  // 首帧即上报高度：宿主据此设置 iframe 尺寸，避免退化成固定高度
  startSizeReportBurst()

  // 游戏清单优先用宿主注入值 → **同步**渲染，首帧就有游戏（无需等网络，也不受跨域限制）
  const injectedGames = parseInjectedGameList(ctx)
  if (injectedGames) {
    renderGames(injectedGames)
    setHint('games-hint', injectedGames.length ? '' : '暂无可打开的游戏')
  } else {
    void loadGames(ctx)
  }

  // 积分必须走网络，异步填充；失败只影响该区块
  void loadPoints(ctx)

  if (typeof window.addEventListener === 'function') {
    window.addEventListener('resize', scheduleSizeReport)
    window.addEventListener('orientationchange', scheduleSizeReport)
  }
  // 内容异步变化（字体/图片/数据）后重新上报；不支持则退回 resize 监听
  if (typeof ResizeObserver === 'function' && document.body) {
    try {
      new ResizeObserver(scheduleSizeReport).observe(document.body)
    } catch (error) {
      console.warn('[more-panel] ResizeObserver 不可用', error)
    }
  }
}

main()
