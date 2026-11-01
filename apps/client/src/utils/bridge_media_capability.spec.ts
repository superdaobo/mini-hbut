import { beforeAll, describe, expect, it, vi } from 'vitest'

const getBridgeSessionTokenMock = vi.fn()

vi.mock('./bridge_auth', () => ({
  getBridgeSessionToken: () => getBridgeSessionTokenMock()
}))

// 参考向量由 Node crypto（RFC 2104 标准 HMAC-SHA256）独立算出，
// 用于确认 TS 侧派生与 Rust 侧 `media_capability` 的算法一致。
const REFERENCE_VECTOR = 'ucvtQnQy8ov1EEVita6kMooZhnY_aeBMuD9Am30VvNw'
const TARGET = 'https://v3.cldisk.com/x/1.mp4'
const EXP = 4000000000

describe('媒体能力串（#1163 T02 契约 R4）', () => {
  let mod: typeof import('./bridge_media_capability')

  beforeAll(async () => {
    mod = await import('./bridge_media_capability')
  })

  it('与标准 HMAC-SHA256 逐字节一致（与 Rust 侧同算法）', async () => {
    const cap = await mod.computeMediaCapability('bridge-session-token', TARGET, EXP)
    expect(cap).toBe(REFERENCE_VECTOR)
  })

  it('生成带 exp/cap 的代理地址，url 参数被正确编码', async () => {
    getBridgeSessionTokenMock.mockResolvedValue('bridge-session-token')
    const url = await mod.buildMediaCapabilityUrl(TARGET, { now: EXP - 100, ttlSeconds: 100 })

    expect(url.startsWith('http://127.0.0.1:4399/proxy/video?url=')).toBe(true)
    expect(url).toContain(`exp=${EXP}`)
    expect(url).toContain(`cap=${REFERENCE_VECTOR}`)
    expect(url).toContain(encodeURIComponent(TARGET))
    // 主令牌绝不能出现在 URL 中
    expect(url).not.toContain('bridge-session-token')
  })

  it('无令牌时退回直链（不生成无凭据的代理地址）', async () => {
    getBridgeSessionTokenMock.mockResolvedValue(null)
    expect(await mod.buildMediaCapabilityUrl(TARGET)).toBe(TARGET)
  })

  it('TTL 默认 30 分钟', () => {
    expect(mod.MEDIA_CAPABILITY_TTL_SECONDS).toBe(1800)
  })
})
