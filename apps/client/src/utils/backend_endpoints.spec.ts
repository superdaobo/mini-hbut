/**
 * backend_endpoints 纯函数层单测。
 * 覆盖契约 docs/architecture/backend-endpoints-contract.md §11 的解析类验收项。
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_BACKEND_CHANNEL_PATHS,
  DEFAULT_BACKEND_FAILOVER,
  DEFAULT_BACKEND_GROUPS,
  FALLBACK_BACKEND_ORIGIN,
  PRIMARY_BACKEND_ORIGIN,
  buildChannelEndpointList,
  deriveChannelUrl,
  isSecureBackendUrl,
  normalizeBackendBase,
  normalizeBackendConfig,
  normalizeBackendFailover,
  normalizeBackendGroups,
  normalizeBackendPaths,
  normalizeChannelPath
} from './backend_endpoints'

describe('内置默认（契约 §9/§10）', () => {
  it('生产域白名单只有两个业务域，主 + 唯一兜底', () => {
    expect(PRIMARY_BACKEND_ORIGIN).toBe('https://mini.hbut.site')
    expect(FALLBACK_BACKEND_ORIGIN).toBe('https://mini-hbut-ocr-service.hf.space')
    expect(DEFAULT_BACKEND_GROUPS.map((group) => group.base)).toEqual([
      'https://mini.hbut.site',
      'https://mini-hbut-ocr-service.hf.space'
    ])
  })

  it('不包含历史域名（superdaobo / 1.94.167.18）', () => {
    const serialized = JSON.stringify({
      groups: DEFAULT_BACKEND_GROUPS,
      paths: DEFAULT_BACKEND_CHANNEL_PATHS
    })
    expect(serialized).not.toContain('superdaobo')
    expect(serialized).not.toContain('1.94.167.18')
  })

  it('内置默认路径与契约一致', () => {
    expect(DEFAULT_BACKEND_CHANNEL_PATHS).toEqual({
      cloud_sync: '/api/cloud-sync',
      game_rank: '/api/game-rank',
      game_platform: '/api/game-platform/v1',
      ocr: '/api/ocr/recognize',
      temp_upload: '/api/temp/upload',
      forum: '/api/forum'
    })
  })
})

describe('isSecureBackendUrl / normalizeBackendBase', () => {
  it('接受 HTTPS', () => {
    expect(isSecureBackendUrl('https://mini.hbut.site')).toBe(true)
    expect(isSecureBackendUrl('https://mini.hbut.site/api/cloud-sync')).toBe(true)
  })

  it('仅对 loopback 放行明文 http', () => {
    expect(isSecureBackendUrl('http://127.0.0.1:5080')).toBe(true)
    expect(isSecureBackendUrl('http://localhost:3000')).toBe(true)
    expect(isSecureBackendUrl('http://[::1]:8080')).toBe(true)
    expect(isSecureBackendUrl('http://1.94.167.18:5080')).toBe(false)
    expect(isSecureBackendUrl('http://example.com')).toBe(false)
  })

  it('拒绝非 http(s) 协议与空值', () => {
    expect(isSecureBackendUrl('')).toBe(false)
    expect(isSecureBackendUrl('ftp://example.com')).toBe(false)
    expect(isSecureBackendUrl('javascript:alert(1)')).toBe(false)
    expect(isSecureBackendUrl(null)).toBe(false)
  })

  it('无协议自动补 https，并去尾斜杠', () => {
    expect(normalizeBackendBase('mini.hbut.site')).toBe('https://mini.hbut.site')
    expect(normalizeBackendBase('https://mini.hbut.site/')).toBe('https://mini.hbut.site')
    expect(normalizeBackendBase('https://mini.hbut.site/backend///')).toBe('https://mini.hbut.site/backend')
  })

  it('非法基址返回空串（调用方丢弃）', () => {
    expect(normalizeBackendBase('http://1.94.167.18:5080')).toBe('')
    expect(normalizeBackendBase('not a url')).toBe('')
    expect(normalizeBackendBase('')).toBe('')
  })
})

describe('normalizeChannelPath', () => {
  it('缺省与空值回落 fallback', () => {
    expect(normalizeChannelPath('', '/api/x')).toBe('/api/x')
    expect(normalizeChannelPath(null, '/api/x')).toBe('/api/x')
  })

  it('自动补前导斜杠、去尾斜杠', () => {
    expect(normalizeChannelPath('api/x', '/api/y')).toBe('/api/x')
    expect(normalizeChannelPath('/api/x/', '/api/y')).toBe('/api/x')
  })

  it('根路径保留', () => {
    expect(normalizeChannelPath('/', '/api/x')).toBe('/')
  })
})

describe('normalizeBackendGroups', () => {
  it('顺序保留并归一化基址', () => {
    const { groups, dropped } = normalizeBackendGroups([
      { id: 'mini', base: 'mini.hbut.site' },
      { id: 'hf', base: 'https://mini-hbut-ocr-service.hf.space/' }
    ])
    expect(dropped).toBe(0)
    expect(groups).toEqual([
      { id: 'mini', base: 'https://mini.hbut.site', enabled: true, paths: {} },
      { id: 'hf', base: 'https://mini-hbut-ocr-service.hf.space', enabled: true, paths: {} }
    ])
  })

  it('id 重复只保留首个并计入 dropped', () => {
    const { groups, dropped } = normalizeBackendGroups([
      { id: 'a', base: 'https://a.example.com' },
      { id: 'a', base: 'https://b.example.com' }
    ])
    expect(groups.map((group) => group.base)).toEqual(['https://a.example.com'])
    expect(dropped).toBe(1)
  })

  it('非法项丢弃（缺 base / 非安全协议 / 非法 id / 非对象）', () => {
    const { groups, dropped } = normalizeBackendGroups([
      { id: 'ok', base: 'https://ok.example.com' },
      { id: 'no-base' },
      { id: 'plain-http', base: 'http://evil.example.com' },
      { id: 'BAD ID!', base: 'https://bad.example.com' },
      'not-an-object',
      null
    ])
    expect(groups.map((group) => group.id)).toEqual(['ok'])
    expect(dropped).toBe(5)
  })

  it('enabled:false 保留但标记（非删除）', () => {
    const { groups } = normalizeBackendGroups([
      { id: 'off', base: 'https://off.example.com', enabled: false }
    ])
    expect(groups).toEqual([
      { id: 'off', base: 'https://off.example.com', enabled: false, paths: {} }
    ])
  })

  it('组内路径覆盖被归一化保留', () => {
    const { groups } = normalizeBackendGroups([
      { id: 'custom', base: 'https://c.example.com', paths: { cloud_sync: 'sync', ocr: '/o/' } }
    ])
    expect(groups[0].paths).toEqual({ cloud_sync: '/sync', ocr: '/o' })
  })

  it('非数组输入返回空结果', () => {
    expect(normalizeBackendGroups(undefined).groups).toEqual([])
    expect(normalizeBackendGroups('x').groups).toEqual([])
  })
})

describe('normalizeBackendPaths / normalizeBackendFailover / normalizeBackendConfig', () => {
  it('路径表缺省回落默认、非法回落默认', () => {
    const paths = normalizeBackendPaths({ cloud_sync: '/cs', game_platform: '' })
    expect(paths.cloud_sync).toBe('/cs')
    expect(paths.game_platform).toBe(DEFAULT_BACKEND_CHANNEL_PATHS.game_platform)
    expect(paths.forum).toBe(DEFAULT_BACKEND_CHANNEL_PATHS.forum)
  })

  it('failover 参数钳制到契约区间', () => {
    const failover = normalizeBackendFailover({
      failure_ttl_seconds: 5,
      max_attempts_per_request: 99,
      probe_timeout_ms: 99999
    })
    expect(failover.failureTtlSeconds).toBe(30)
    expect(failover.maxAttemptsPerRequest).toBe(8)
    expect(failover.probeTimeoutMs).toBe(10000)
  })

  it('failover 缺省使用内置默认，enabled 仅显式 false 才关闭', () => {
    expect(normalizeBackendFailover({})).toEqual({ ...DEFAULT_BACKEND_FAILOVER })
    expect(normalizeBackendFailover({ enabled: false }).enabled).toBe(false)
    expect(normalizeBackendFailover({ enabled: 'false' }).enabled).toBe(true)
  })

  it('完整配置块归一化', () => {
    const config = normalizeBackendConfig({
      groups: [{ id: 'mini', base: 'https://mini.hbut.site' }],
      paths: { forum: '/f' },
      failover: { enabled: false }
    })
    expect(config.groups).toHaveLength(1)
    expect(config.paths.forum).toBe('/f')
    expect(config.failover.enabled).toBe(false)
  })
})

describe('deriveChannelUrl', () => {
  it('base + 全局路径', () => {
    expect(deriveChannelUrl({ base: 'https://mini.hbut.site', paths: {} }, 'cloud_sync')).toBe(
      'https://mini.hbut.site/api/cloud-sync'
    )
    expect(deriveChannelUrl({ base: 'https://mini.hbut.site', paths: {} }, 'game_rank')).toBe(
      'https://mini.hbut.site/api/game-rank'
    )
  })

  it('组内路径优先于全局路径', () => {
    const url = deriveChannelUrl(
      { base: 'https://mini.hbut.site', paths: { cloud_sync: '/custom/sync' } },
      'cloud_sync',
      { ...DEFAULT_BACKEND_CHANNEL_PATHS, cloud_sync: '/global/sync' }
    )
    expect(url).toBe('https://mini.hbut.site/custom/sync')
  })

  it('base 带子路径时正确拼接', () => {
    expect(deriveChannelUrl({ base: 'https://x.example.com/backend', paths: {} }, 'ocr')).toBe(
      'https://x.example.com/backend/api/ocr/recognize'
    )
  })

  it('非法 base 返回空串', () => {
    expect(deriveChannelUrl({ base: '', paths: {} }, 'ocr')).toBe('')
    expect(deriveChannelUrl(null, 'ocr')).toBe('')
  })
})

describe('buildChannelEndpointList（契约 §4 优先级）', () => {
  const urls = (result: { endpoints: Array<{ url: string }> }): string[] =>
    result.endpoints.map((item) => item.url)
  const groupIds = (result: { endpoints: Array<{ groupId: string }> }): string[] =>
    result.endpoints.map((item) => item.groupId)

  it('① 通道级覆盖优先于组模型（单值 + fallback 列表）', () => {
    const result = buildChannelEndpointList({
      channel: 'cloud_sync',
      override: 'https://override.example.com/api/cloud-sync',
      overrideFallbacks: ['https://fallback.example.com/api/cloud-sync'],
      backend: { groups: [{ id: 'mini', base: 'https://mini.hbut.site' }] }
    })
    expect(result.source).toBe('override')
    expect(urls(result)).toEqual([
      'https://override.example.com/api/cloud-sync',
      'https://fallback.example.com/api/cloud-sync'
    ])
    expect(groupIds(result)).toEqual(['override', 'override'])
  })

  it('① 覆盖为数组时（OCR 形态）合并去重', () => {
    const result = buildChannelEndpointList({
      channel: 'ocr',
      override: ['https://a.example.com/api/ocr/recognize', 'https://b.example.com/api/ocr/recognize'],
      overrideFallbacks: ['https://b.example.com/api/ocr/recognize'],
      normalizeUrl: (value) => String(value || '').trim()
    })
    expect(result.source).toBe('override')
    expect(urls(result)).toEqual([
      'https://a.example.com/api/ocr/recognize',
      'https://b.example.com/api/ocr/recognize'
    ])
  })

  it('② 无覆盖时按组顺序产出主 + 兜底，且携带 groupId', () => {
    const result = buildChannelEndpointList({
      channel: 'game_platform',
      backend: {
        groups: [
          { id: 'mini', base: 'https://mini.hbut.site' },
          { id: 'hf', base: 'https://mini-hbut-ocr-service.hf.space' }
        ]
      }
    })
    expect(result.source).toBe('groups')
    expect(urls(result)).toEqual([
      'https://mini.hbut.site/api/game-platform/v1',
      'https://mini-hbut-ocr-service.hf.space/api/game-platform/v1'
    ])
    expect(groupIds(result)).toEqual(['mini', 'hf'])
  })

  it('② enabled:false 的组被跳过', () => {
    const result = buildChannelEndpointList({
      channel: 'forum',
      backend: {
        groups: [
          { id: 'off', base: 'https://off.example.com', enabled: false },
          { id: 'on', base: 'https://on.example.com' }
        ]
      }
    })
    expect(urls(result)).toEqual(['https://on.example.com/api/forum'])
  })

  it('② includeGroups=false（useRemoteConfig 关闭）时跳过组模型', () => {
    const result = buildChannelEndpointList({
      channel: 'cloud_sync',
      backend: { groups: [{ id: 'mini', base: 'https://mini.hbut.site' }] },
      includeGroups: false
    })
    expect(result.source).toBe('default')
    expect(result.endpoints[0].url).toBe('https://mini.hbut.site/api/cloud-sync')
  })

  it('③ 组全非法时回落内置默认（两域，携带 groupId）', () => {
    const result = buildChannelEndpointList({
      channel: 'ocr',
      backend: { groups: [{ id: 'bad', base: 'http://evil.example.com' }] }
    })
    expect(result.source).toBe('default')
    expect(urls(result)).toEqual([
      'https://mini.hbut.site/api/ocr/recognize',
      'https://mini-hbut-ocr-service.hf.space/api/ocr/recognize'
    ])
    expect(groupIds(result)).toEqual(['mini', 'hf-prod'])
  })

  it('相同 URL 去重（多组指向同一地址时只保留首个）', () => {
    const result = buildChannelEndpointList({
      channel: 'cloud_sync',
      backend: {
        groups: [
          { id: 'a', base: 'https://same.example.com' },
          { id: 'b', base: 'https://same.example.com' }
        ]
      }
    })
    expect(urls(result)).toEqual(['https://same.example.com/api/cloud-sync'])
    expect(groupIds(result)).toEqual(['a'])
  })

  it('组内路径覆盖生效，且全局 paths 生效', () => {
    const result = buildChannelEndpointList({
      channel: 'cloud_sync',
      backend: {
        groups: [
          { id: 'mini', base: 'https://mini.hbut.site', paths: { cloud_sync: '/custom' } },
          { id: 'hf', base: 'https://hf.example.com' }
        ],
        paths: { cloud_sync: '/global-sync' }
      }
    })
    expect(urls(result)).toEqual([
      'https://mini.hbut.site/custom',
      'https://hf.example.com/global-sync'
    ])
  })

  it('自定义 normalizeUrl 影响覆盖项但不影响组派生', () => {
    const normalizeUrl = (value: unknown): string => {
      const text = String(value || '').trim()
      if (!text) return ''
      return text.includes('/api/ocr/recognize') ? text : `${text.replace(/\/+$/, '')}/api/ocr/recognize`
    }
    const result = buildChannelEndpointList({
      channel: 'ocr',
      override: 'https://ocr.example.com',
      normalizeUrl
    })
    expect(urls(result)).toEqual(['https://ocr.example.com/api/ocr/recognize'])
  })
})
