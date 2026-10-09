import { describe, expect, it } from 'vitest'
import { REMOTE_CONFIG_URLS } from './remote_config_defaults'

describe('#1016：生产远程配置源必须优先走 GitCode API v5 raw', () => {
  it('新提交的 JSON 可通过匿名 v5 接口拉取，不能把已知 403 的预览域放在首位', () => {
    const primary = new URL(REMOTE_CONFIG_URLS[0])
    expect(primary.origin).toBe('https://api.gitcode.com')
    expect(primary.pathname).toBe('/api/v5/repos/superdaobo/mini-hbut-config/raw/remote_config.json')
    expect(primary.searchParams.get('ref')).toBe('main')
    expect(REMOTE_CONFIG_URLS.some((url) => url.includes('raw.gitcode.com'))).toBe(true)
  })
})
