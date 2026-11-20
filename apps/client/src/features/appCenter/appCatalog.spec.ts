// src/features/appCenter/appCatalog.spec.ts
//
// Epic #1243（G2-04 / mini-hbut#1253）契约测试：应用目录的客户端数据层。
//
// 守的契约：
//   1. **不信任服务端/中间层**：归一化时丢弃缺 client_id 的条目、丢弃非法 origin、
//      **丢弃未知字段**（`client_secret` 之类绝不留在内存里）；
//   2. **只有 active 才能学号 SSO**；
//   3. **空 allowed_origins 语义是「不允许内嵌」**，不是「不限制」；
//   4. 内嵌判定要求 origin **精确匹配**且必须是裸 https origin；
//   5. `loadAppCatalog` **永不抛**：失败 → `source='error'`；空目录 → `source='empty'`
//      （两者 UI 文案必须可区分：服务挂了 ≠ 没上架应用）。

import { describe, expect, it, vi } from 'vitest'

import {
  canEmbed,
  canSso,
  findApp,
  isBareHttpsOrigin,
  loadAppCatalog,
  normalizeCatalog
} from './appCatalog'

const SECRET_MARKER = 'SHOULD-NEVER-LEAK-9f3a'
const ORIGIN = 'https://hbut.6661111.xyz'

const rawEntry = (overrides: Record<string, unknown> = {}) => ({
  client_id: 'mini-hbut-app',
  label: 'Mini-HBUT 主 App',
  owner: 'fdl-users/ops',
  status: 'active',
  data_domains: { grades: ['read'] },
  allowed_origins: [ORIGIN],
  privacy_url: 'https://hbut.6661111.xyz/privacy',
  review_version: 2,
  ...overrides
})

describe('appCatalog', () => {
  it('归一化：合法条目 → camelCase 模型', () => {
    const apps = normalizeCatalog({ manifest_version: 3, apps: [rawEntry()] })
    expect(apps).toHaveLength(1)
    expect(apps[0]).toMatchObject({
      clientId: 'mini-hbut-app',
      label: 'Mini-HBUT 主 App',
      owner: 'fdl-users/ops',
      status: 'active',
      dataDomains: { grades: ['read'] },
      allowedOrigins: [ORIGIN],
      privacyUrl: 'https://hbut.6661111.xyz/privacy',
      reviewVersion: 2
    })
  })

  it('归一化：丢弃缺 client_id 的条目', () => {
    const apps = normalizeCatalog({
      apps: [{ label: 'no id' }, rawEntry(), { client_id: '   ' }]
    })
    expect(apps.map((a) => a.clientId)).toEqual(['mini-hbut-app'])
  })

  it('归一化：丢弃未知字段（client_secret 不留在内存里）', () => {
    const apps = normalizeCatalog({
      apps: [rawEntry({ client_secret: SECRET_MARKER, token: SECRET_MARKER })]
    })
    const dumped = JSON.stringify(apps)
    expect(dumped).not.toContain(SECRET_MARKER)
    expect(Object.keys(apps[0])).not.toContain('client_secret')
  })

  it('归一化：非对象 / 缺 apps / apps 非数组 → 空数组（fail closed）', () => {
    expect(normalizeCatalog(null)).toEqual([])
    expect(normalizeCatalog('nope')).toEqual([])
    expect(normalizeCatalog({})).toEqual([])
    expect(normalizeCatalog({ apps: 'nope' })).toEqual([])
  })

  it('归一化：非法 origin 被丢弃（http / 通配 / 带 path / 大写 host）', () => {
    const apps = normalizeCatalog({
      apps: [
        rawEntry({
          allowed_origins: [
            'http://example.com',
            'https://*.example.com',
            'https://example.com/path',
            'https://EXAMPLE.com',
            ORIGIN
          ]
        })
      ]
    })
    expect(apps[0].allowedOrigins).toEqual([ORIGIN])
  })

  it('归一化：review_version 非法时退回 1', () => {
    for (const bad of [0, -3, 'x', null]) {
      const apps = normalizeCatalog({ apps: [rawEntry({ review_version: bad })] })
      expect(apps[0].reviewVersion).toBe(1)
    }
  })

  it('canSso：只有 active 允许', () => {
    const [active] = normalizeCatalog({ apps: [rawEntry()] })
    const [disabled] = normalizeCatalog({ apps: [rawEntry({ status: 'disabled' })] })
    expect(canSso(active)).toBe(true)
    expect(canSso(disabled)).toBe(false)
    expect(canSso(null)).toBe(false)
  })

  it('canEmbed：active + origin 精确匹配 → 允许', () => {
    const [app] = normalizeCatalog({ apps: [rawEntry()] })
    expect(canEmbed(app, ORIGIN)).toEqual({ ok: true, reason: '' })
  })

  it('canEmbed：空 allowed_origins 表示「不允许内嵌」，不是「不限制」', () => {
    const [app] = normalizeCatalog({ apps: [rawEntry({ allowed_origins: [] })] })
    expect(canEmbed(app, ORIGIN)).toEqual({ ok: false, reason: 'no_origin_configured' })
  })

  it('canEmbed：origin 不在白名单 → origin_not_allowed', () => {
    const [app] = normalizeCatalog({ apps: [rawEntry()] })
    expect(canEmbed(app, 'https://evil.example.com')).toEqual({
      ok: false,
      reason: 'origin_not_allowed'
    })
  })

  it('canEmbed：disabled 应用一律不能内嵌', () => {
    const [app] = normalizeCatalog({ apps: [rawEntry({ status: 'disabled' })] })
    expect(canEmbed(app, ORIGIN)).toEqual({ ok: false, reason: 'app_not_active' })
  })

  it('canEmbed：目标 origin 非法（http / 带 path）→ origin_invalid', () => {
    const [app] = normalizeCatalog({ apps: [rawEntry()] })
    expect(canEmbed(app, 'http://hbut.6661111.xyz').reason).toBe('origin_invalid')
    expect(canEmbed(app, 'https://hbut.6661111.xyz/path').reason).toBe('origin_invalid')
    expect(canEmbed(app, '').reason).toBe('origin_invalid')
  })

  it('findApp：按 clientId 精确查找；空/未命中 → null', () => {
    const apps = normalizeCatalog({ apps: [rawEntry(), rawEntry({ client_id: 'fdl-forum' })] })
    expect(findApp(apps, 'fdl-forum')?.clientId).toBe('fdl-forum')
    expect(findApp(apps, 'nope')).toBeNull()
    expect(findApp(apps, '')).toBeNull()
  })

  it('isBareHttpsOrigin：只接受裸 https origin', () => {
    expect(isBareHttpsOrigin('https://a.example.com')).toBe(true)
    expect(isBareHttpsOrigin('https://a.example.com:8443')).toBe(true)
    expect(isBareHttpsOrigin('http://a.example.com')).toBe(false)
    expect(isBareHttpsOrigin('https://a.example.com/x')).toBe(false)
    expect(isBareHttpsOrigin('https://u:p@a.example.com')).toBe(false)
    expect(isBareHttpsOrigin('https://*')).toBe(false)
  })

  it('loadAppCatalog：成功 → source=remote + 归一化后的应用', async () => {
    const fetchJson = vi.fn(async () => ({ manifest_version: 5, apps: [rawEntry()] }))
    const snap = await loadAppCatalog({ fetchJson, now: () => 1_760_000_000_000 })
    expect(snap.source).toBe('remote')
    expect(snap.manifestVersion).toBe(5)
    expect(snap.apps).toHaveLength(1)
    expect(snap.fetchedAt).toBe(1_760_000_000_000)
  })

  it('loadAppCatalog：空目录 → source=empty（与 error 可区分）', async () => {
    const snap = await loadAppCatalog({ fetchJson: async () => ({ apps: [] }) })
    expect(snap.source).toBe('empty')
    expect(snap.apps).toEqual([])
  })

  it('loadAppCatalog：拉取失败 → source=error 且**不抛**', async () => {
    const snap = await loadAppCatalog({
      fetchJson: async () => {
        throw new Error('network down')
      }
    })
    expect(snap.source).toBe('error')
    expect(snap.apps).toEqual([])
  })

  it('loadAppCatalog：脏数据（非对象）→ 不抛，按空目录处理', async () => {
    const snap = await loadAppCatalog({ fetchJson: async () => 'not-an-object' })
    expect(snap.apps).toEqual([])
    expect(snap.source).toBe('empty')
  })
})
