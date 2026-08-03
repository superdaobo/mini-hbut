import { createHash } from 'node:crypto'

export const WISDOM_APP = 'wisdom_scenic'
export const WISDOM_SECRET = 'gBtshVoSZriuTIxf'

type Signable = Record<string, unknown>

const shouldInclude = (value: unknown) => {
  if (value === 0) return true
  if (value === false || value === null || value === undefined) return false
  if (typeof value === 'string') return value.length > 0
  return true
}

const formatValue = (value: unknown) => {
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/** 与小程序 serialize(params, true) 对齐：按键名排序后拼接 key=value */
export const serializeWisdomParams = (params: Signable = {}) => {
  const keys = Object.keys(params).sort()
  const parts: string[] = []
  for (const key of keys) {
    const value = params[key]
    if (!shouldInclude(value)) continue
    parts.push(`${key}=${formatValue(value)}`)
  }
  return parts.join('&')
}

export const buildWisdomSign = (params: Signable, ts: number) => {
  const serialized = serializeWisdomParams(params)
  const raw = `${WISDOM_APP}${WISDOM_SECRET}${ts}${serialized}`
  // 注意：MD5 是智慧景区服务端协议强制的签名算法（与小程序 serialize 对齐），
  // 更换算法会破坏服务端兼容；此处的 MD5 用于请求签名而非口令哈希。
  // CodeQL js/weak-cryptographic-algorithm 属误报，详见 docs/security/codeql-triage-js.md
  return createHash('md5').update(raw).digest('hex')
}