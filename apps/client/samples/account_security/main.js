// 「账号安全概览」样例模块（#1169 T08）
//
// 关键约束：
// - 模块**不持有会话**：所有数据都通过 `hbu-module-fetch` 消息请宿主代取；
// - 模块**只给参数值**：能力 id 与参数由能力登记表约束，模块无法指定 URL/头/Cookie；
// - 解析层独立成 `parse.js`：改页面/改解析只需换模块包，不用发安装包。
import { parseModulePayload } from './parse.js'

const REQUEST_TYPE = 'hbu-module-fetch'
const RESPONSE_TYPE = 'hbu-module-fetch-result'
const TIMEOUT_MS = 12_000

const pending = new Map()
let seq = 0

const nextRequestId = () => {
  seq += 1
  return `req_${Date.now().toString(36)}_${seq}`
}

/** 请求宿主代取一次数据（超时即放弃，避免页面永远转圈）。 */
const requestThroughHost = (capability, query) =>
  new Promise((resolve, reject) => {
    const requestId = nextRequestId()
    const timer = setTimeout(() => {
      pending.delete(requestId)
      reject(new Error('MODULE_REQUEST_TIMEOUT: 宿主未在时限内返回'))
    }, TIMEOUT_MS)
    pending.set(requestId, { resolve, reject, timer })
    window.parent.postMessage(
      { type: REQUEST_TYPE, request_id: requestId, capability, query, timeout_ms: TIMEOUT_MS },
      '*'
    )
  })

window.addEventListener('message', (event) => {
  if (event.source !== window.parent) return
  const payload = event.data
  if (!payload || payload.type !== RESPONSE_TYPE) return
  const entry = pending.get(payload.request_id)
  if (!entry) return
  pending.delete(payload.request_id)
  clearTimeout(entry.timer)
  if (payload.ok) entry.resolve(payload)
  else entry.reject(new Error(payload.error?.message || payload.error?.code || '请求失败'))
})

const badge = (el, text, tone) => {
  el.textContent = text
  el.className = `badge${tone ? ` ${tone}` : ''}`
}

const renderRows = (container, rows) => {
  container.innerHTML = ''
  for (const row of rows) {
    const line = document.createElement('div')
    line.className = 'row'
    for (const [key, value] of Object.entries(row)) {
      if (!value) continue
      const cell = document.createElement('div')
      cell.className = key === 'device' || key === 'loginTime' ? 'k' : 'v'
      cell.textContent = `${key === 'device' ? '设备' : key === 'ip' ? 'IP' : key === 'place' ? '地点' : key === 'loginTime' ? '时间' : '系统'}：${value}`
      line.appendChild(cell)
    }
    container.appendChild(line)
  }
  if (!rows.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.textContent = '暂无记录'
    container.appendChild(empty)
  }
}

const renderFlat = (container, flat, note) => {
  container.innerHTML = ''
  if (note) {
    const tip = document.createElement('div')
    tip.className = 'empty'
    tip.textContent = note
    container.appendChild(tip)
  }
  for (const item of flat) {
    const line = document.createElement('div')
    line.className = 'row'
    const k = document.createElement('div')
    k.className = 'k'
    k.textContent = item.label
    const v = document.createElement('div')
    v.className = 'v'
    v.textContent = item.value
    line.append(k, v)
    container.appendChild(line)
  }
}

const load = async (capability, kind, bodyEl, badgeEl) => {
  badge(badgeEl, '加载中', '')
  bodyEl.innerHTML = ''
  try {
    const response = await requestThroughHost(capability, { t: String(Math.floor(Date.now() / 1000)) })
    const parsed = parseModulePayload(response.body, kind)
    if (!parsed.ok) {
      badge(badgeEl, '不可用', 'err')
      renderFlat(bodyEl, parsed.flat, parsed.message)
      return
    }
    if (parsed.unknownShape) {
      badge(badgeEl, '结构未知', 'warn')
      renderFlat(bodyEl, parsed.flat, '接口返回结构与预期不同，以下为原始字段')
      return
    }
    badge(badgeEl, parsed.rows.length ? `${parsed.rows.length} 条` : '无记录', parsed.rows.length ? 'ok' : '')
    renderRows(bodyEl, parsed.rows)
  } catch (error) {
    badge(badgeEl, '失败', 'err')
    const message = String(error?.message || error)
    renderFlat(bodyEl, [], message)
    document.getElementById('hint').textContent = message
  }
}

const refresh = async () => {
  const button = document.getElementById('refresh')
  button.disabled = true
  document.getElementById('hint').textContent = ''
  await Promise.all([
    load('school.portal_client_ip', 'online', document.getElementById('online-body'), document.getElementById('online-badge')),
    load('school.portal_page_view', 'logs', document.getElementById('logs-body'), document.getElementById('logs-badge'))
  ])
  button.disabled = false
}

document.getElementById('refresh').addEventListener('click', refresh)
void refresh()
