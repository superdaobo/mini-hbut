// 隔离探针模块（goal-8 真机验证用，不随产品发布）
//
// 它以**模块身份**运行：内容从 http://127.0.0.1:4398 提供、包在带 sandbox 的 iframe 里。
// 因此它做的每一次越权尝试，都是对真实模块沙箱的检验。
const REQUEST_TYPE = 'hbu-module-fetch'
const RESPONSE_TYPE = 'hbu-module-fetch-result'
const RESULT_TYPE = 'hbu-isolation-probe-result'
const BRIDGE = 'http://127.0.0.1:4399'

const results = []
const record = (id, patch) => {
  results.push({ id, status: null, error: '', detail: '', ...patch })
}

const safeSnippet = (text) => String(text ?? '').slice(0, 160)

/**
 * 给任意 Promise 加超时（真机教训 2026-11-06）：模块里的
 * `window.__TAURI_INTERNALS__.invoke(...)` 在 CSP `connect-src 'self'` 下**永不 settle**
 * （Tauri 的 IPC 走 `http://ipc.localhost` 被 CSP 拦），不加超时会把整个探针卡死。
 */
const withTimeout = (promise, ms, label) =>
  Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(new Error(`${label}_timeout`)), ms))
  ])

/** 带超时的 fetch，返回 { status, error, detail }。 */
const probeFetch = async (id, url, init = {}, timeoutMs = 4000) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    let detail = ''
    try {
      const text = await response.text()
      detail = `body:${safeSnippet(text)}`
    } catch {
      detail = 'body:unreadable'
    }
    record(id, { status: response.status, detail })
  } catch (error) {
    record(id, { error: String(error?.name || error), detail: safeSnippet(error?.message) })
  } finally {
    clearTimeout(timer)
  }
}

const runChecks = async () => {
  // 1. 直接打桥的受保护接口（模块不该拿到任何数据）
  await probeFetch('bridge_protected_fetch', `${BRIDGE}/sync_grades`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  })

  // 2. 公开只读导出接口（验证 CORS 是否回显模块 origin）
  await probeFetch('bridge_public_export_fetch', `${BRIDGE}/exports/__probe_missing__.ics`)

  // 3. 健康检查对照：区分「整体不可达」与「策略拒绝」
  await probeFetch('bridge_health_fetch', `${BRIDGE}/health`)

  // 4. 原生能力探测
  const internals = typeof window.__TAURI_INTERNALS__
  const globalTauri = typeof window.__TAURI__
  record('tauri_internals_type', { detail: String(internals) })
  record('tauri_global_type', { detail: String(globalTauri) })
  if (window.__TAURI_INTERNALS__ && typeof window.__TAURI_INTERNALS__.invoke === 'function') {
    try {
      const token = await withTimeout(
        window.__TAURI_INTERNALS__.invoke('bridge_session_token'),
        5000,
        'invoke'
      )
      if (token instanceof Error) {
        record('invoke_bridge_session_token', { error: 'hang', detail: '调用未在 5s 内返回（IPC 通道不可用）' })
      } else {
        record('invoke_bridge_session_token', { detail: `ACCESSIBLE:${safeSnippet(token)}` })
      }
    } catch (error) {
      record('invoke_bridge_session_token', { error: String(error?.name || 'Error'), detail: safeSnippet(error?.message || error) })
    }
  } else {
    record('invoke_bridge_session_token', { error: 'not_available', detail: '没有 IPC 对象' })
  }

  // 5. 读父页面
  try {
    const doc = parent.document
    record('read_parent_document', { detail: `ACCESSIBLE:${!!doc}` })
  } catch (error) {
    record('read_parent_document', { error: String(error?.name || error) })
  }
  try {
    const href = parent.location.href
    record('read_parent_location', { detail: `ACCESSIBLE:${safeSnippet(href)}` })
  } catch (error) {
    record('read_parent_location', { error: String(error?.name || error) })
  }

  // 6. 自身环境
  record('self_origin', { detail: location.origin })
  record('self_cookie_len', { detail: String(document.cookie.length) })
  record('self_secure_context', { detail: String(window.isSecureContext) })

  // 7. 受控能力正向调用（走宿主 → Rust）
  record(
    'controlled_fetch_portal_client_ip',
    await requestThroughHost('school.portal_client_ip', {}, 'controlled_fetch_portal_client_ip')
  )
  record(
    'controlled_fetch_portal_page_view',
    await requestThroughHost(
      'school.portal_page_view',
      {
        _t: String(Math.floor(Date.now() / 1000)),
        pageCode: '',
        originalUrl: 'https%3A%2F%2Fe.hbut.edu.cn%2Fstu%2Findex.html',
        lang: 'zh_CN'
      },
      'controlled_fetch_portal_page_view'
    )
  )

  // 8. Game SDK 握手（仅在宿主以 launch_surface='game_center' 打开时才有 game bridge）：
  //    发 hello，等 welcome。用来验证「协议版本闸门」在真机上确实 fail closed / 正常回 welcome。
  record('game_handshake_welcome', await probeGameHandshake())

  render()
  window.parent.postMessage({ type: RESULT_TYPE, origin: location.origin, results }, '*')
  const failed = results.filter((item) => item.error).length
  document.title = `PROBE_DONE:${results.length - failed}/${results.length}`
}

/**
 * 走宿主代取一次受控请求。
 *
 * @param {string} capability 能力 id
 * @param {Record<string,string>} query 允许的 query 参数
 * @param {string} id 结果行 id
 */
const requestThroughHost = (capability, query, id) =>
  new Promise((resolve) => {
    const requestId = `probe_${Math.random().toString(36).slice(2, 10)}`
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve({ id, status: null, error: 'host_timeout', detail: '' })
    }, 14000)
    const onMessage = (event) => {
      const payload = event.data
      if (!payload || payload.type !== RESPONSE_TYPE || payload.request_id !== requestId) return
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      if (payload.ok) {
        resolve({
          id,
          status: Number(payload.status) || 0,
          error: '',
          detail: `body:${safeSnippet(payload.body)}`
        })
      } else {
        resolve({
          id,
          status: null,
          error: String(payload.error?.code || 'error'),
          detail: safeSnippet(payload.error?.message)
        })
      }
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage(
      {
        type: REQUEST_TYPE,
        request_id: requestId,
        capability,
        query,
        timeout_ms: 12000
      },
      '*'
    )
  })

/** 发一次 Game SDK hello 并等待 welcome（8s 超时 → `no_welcome`）。 */
const probeGameHandshake = () =>
  new Promise((resolve) => {
    const requestId = `hello_${Math.random().toString(36).slice(2, 10)}`
    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage)
      resolve({
        id: 'game_handshake_welcome',
        status: null,
        error: 'no_welcome',
        detail: '宿主未回 welcome（未启用 game bridge，或协议版本被拒）'
      })
    }, 8000)
    const onMessage = (event) => {
      const payload = event.data
      if (!payload || payload.type !== 'mini-hbut:game-sdk:welcome') return
      if (payload.request_id !== requestId) return
      clearTimeout(timer)
      window.removeEventListener('message', onMessage)
      resolve({
        id: 'game_handshake_welcome',
        status: 200,
        error: '',
        detail: `protocol_version:${payload.protocol_version} game_id:${String(payload.game_id || '')}`
      })
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage(
      {
        type: 'mini-hbut:game-sdk:hello',
        request_id: requestId,
        game_id: 'isolation_probe',
        protocol_version: 1
      },
      '*'
    )
  })

const render = () => {
  const tbody = document.getElementById('rows')
  const summary = document.getElementById('summary')
  tbody.innerHTML = ''
  for (const item of results) {
    const tr = document.createElement('tr')
    const tone = item.error ? (item.detail?.startsWith('ACCESSIBLE') ? 'bad' : 'warn') : 'ok'
    tr.className = tone
    tr.innerHTML = `<td>${item.id}</td><td>${item.status ?? '-'}</td><td>${item.error || '-'}</td><td>${(item.detail || '').replace(/</g, '&lt;')}</td>`
    tbody.appendChild(tr)
  }
  const blocked = results.filter((item) => item.error || item.status === 401 || item.status === 403).length
  summary.textContent = `共 ${results.length} 项；被拒/失败 ${blocked} 项（origin=${location.origin}）`
}

runChecks().catch((error) => {
  record('probe_fatal', { error: String(error?.name || 'Error'), detail: safeSnippet(error?.message) })
  render()
  window.parent.postMessage({ type: RESULT_TYPE, origin: location.origin, results }, '*')
})
