/**
 * 「账号安全概览」样例模块的解析层（#1169 T08）。
 *
 * 设计原则：
 * - **纯函数**：输入是上游 JSON 字符串，输出是结构化的行；不碰 DOM、不发请求，
 *   因此可以单独测试、单独更新（改解析不动宿主、不动 Rust、不发安装包）。
 * - **防御式解析**：教务/门户接口的字段命名并不稳定，这里按「候选键表」取值，
 *   取不到就退化为通用键值行，并把 `unknownShape` 标出来 —— 页面据此显示原文。
 */

/** 候选键（按优先级）→ 统一列名。 */
const FIELD_CANDIDATES = {
  device: ['deviceName', 'device', 'device_name', 'terminalName', 'clientName', 'dlmc'],
  ip: ['ip', 'loginIp', 'ipAddress', 'clientIp', 'ipdz'],
  place: ['address', 'location', 'loginAddress', 'place', 'dldz'],
  loginTime: ['loginTime', 'lastLoginTime', 'time', 'createTime', 'dlsj'],
  system: ['system', 'os', 'osName', 'browserName', 'operatingSystem']
}

const pick = (source, keys) => {
  for (const key of keys) {
    const value = source?.[key]
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim()
    }
  }
  return ''
}

/** 从常见包装里取出数组：`{data:{list:[...]}}` / `{rows:[...]}` / 数组本体。 */
export const extractRows = (payload) => {
  if (Array.isArray(payload)) return payload
  if (!payload || typeof payload !== 'object') return []
  for (const key of ['list', 'rows', 'data', 'records', 'items', 'result']) {
    const value = payload[key]
    if (Array.isArray(value)) return value
    if (value && typeof value === 'object') {
      const nested = extractRows(value)
      if (nested.length) return nested
    }
  }
  return []
}

/** 是否存在业务失败标记（各接口风格不一，宁可显示"无数据"也不假装成功）。 */
export const isFailurePayload = (payload) => {
  if (!payload || typeof payload !== 'object') return false
  const code = payload.code ?? payload.status ?? payload.errcode
  if (code === undefined || code === null) return false
  const text = String(code).trim().toLowerCase()
  return !(text === '0' || text === '200' || text === 'ok' || text === 'success')
}

const normalizeRow = (row) => ({
  device: pick(row, FIELD_CANDIDATES.device),
  ip: pick(row, FIELD_CANDIDATES.ip),
  place: pick(row, FIELD_CANDIDATES.place),
  loginTime: pick(row, FIELD_CANDIDATES.loginTime),
  system: pick(row, FIELD_CANDIDATES.system)
})

/** 通用退化：把对象拍平成 key/value 行（最多 20 行，避免长列表刷屏）。 */
export const flattenUnknown = (payload, limit = 20) => {
  const out = []
  const walk = (value, prefix) => {
    if (out.length >= limit) return
    if (value === null || value === undefined) return
    if (Array.isArray(value)) {
      if (value.length && typeof value[0] === 'object') {
        walk(value[0], prefix)
      } else if (value.length) {
        out.push({ label: prefix || 'list', value: value.map(String).join(', ') })
      }
      return
    }
    if (typeof value === 'object') {
      for (const [key, child] of Object.entries(value)) {
        walk(child, prefix ? `${prefix}.${key}` : key)
      }
      return
    }
    out.push({ label: prefix || 'value', value: String(value).slice(0, 200) })
  }
  walk(payload, '')
  return out
}

/**
 * 解析一次受控请求的响应。
 *
 * @param {string} body 上游响应体（可能是 JSON，也可能不是）
 * @param {'online'|'logs'} kind
 * @returns {{ ok: boolean, kind: string, rows: Array<object>, flat: Array<{label:string,value:string}>, unknownShape: boolean, message: string }}
 */
export const parseModulePayload = (body, kind) => {
  const text = String(body ?? '').trim()
  if (!text) {
    return { ok: false, kind, rows: [], flat: [], unknownShape: false, message: '响应为空' }
  }
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    return {
      ok: false,
      kind,
      rows: [],
      flat: flattenUnknown(text.slice(0, 400)),
      unknownShape: true,
      message: '响应不是 JSON'
    }
  }
  if (isFailurePayload(payload)) {
    return {
      ok: false,
      kind,
      rows: [],
      flat: flattenUnknown(payload),
      unknownShape: false,
      message: '接口返回失败状态'
    }
  }

  const rawRows = extractRows(payload)
  const rows = rawRows.map(normalizeRow).filter((row) => Object.values(row).some(Boolean))
  if (rows.length > 0) {
    return { ok: true, kind, rows, flat: [], unknownShape: false, message: '' }
  }

  // 结构认识了但没数据 → 明确「暂无记录」，不显示成错误
  if (rawRows.length === 0 && extractRows(payload).length === 0) {
    const knownEmpty = ['list', 'rows', 'records', 'items'].some((key) => Array.isArray(payload?.[key]))
    if (knownEmpty) {
      return { ok: true, kind, rows: [], flat: [], unknownShape: false, message: '' }
    }
  }

  return {
    ok: true,
    kind,
    rows: [],
    flat: flattenUnknown(payload),
    unknownShape: true,
    message: ''
  }
}
