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
    gamePlatformApi: read('game_platform_api') || read('game_platform_api_base'),
    runtime: read('runtime')
  }
}

/**
 * 从自身 URL 推导同 channel 的 catalog 地址。
 * 本模块发布在 `<base>/modules/<channel>/more_panel/<version>/site/index.html`，
 * catalog 在同 channel 根：`<base>/modules/<channel>/catalog.json`。
 */
const resolveCatalogUrl = () => {
  const match = window.location.pathname.match(/^(.*\/modules\/[^/]+\/)/)
  return match ? `${match[1]}catalog.json` : ''
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
  const target = ctx.hostOrigin || '*'
  try {
    window.parent.postMessage({ type: 'mini-hbut:open-module', moduleId }, target)
  } catch (error) {
    console.warn('[more-panel] 请求打开模块失败', moduleId, error)
  }
  setHint('games-hint', '正在打开…')
}

const loadGames = async () => {
  const url = resolveCatalogUrl()
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
    .filter((item) => item && item.disabled !== true && item.id !== 'more_panel')
    .sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
    .map((item) => ({ id: item.id, name: item.name, icon: item.icon }))
  renderGames(entries)
  setHint('games-hint', entries.length ? '' : '暂无可打开的游戏')
}

const main = () => {
  const ctx = readContext()
  renderIdentity(ctx)
  setState(ctx.studentId ? STATE.ready : STATE.guest)

  // 并发发起，互不阻塞；任一失败只影响自己的区块
  void loadPoints(ctx)
  void loadGames()
}

main()
