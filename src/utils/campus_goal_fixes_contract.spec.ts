import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * 合同测试：断言「已接线的公开 API / 路径」仍存在。
 * 行为正确性由 cargo 单元测试覆盖（swae_write_response_ok / build_one_code_pay_open_url /
 * extract_chaoxing_catalog_leaves / chaoxing_video_status_candidate_urls）。
 */
const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8')

describe('campus goal shipped wiring (#454-456)', () => {
  it('electricity pay open uses prepareOneCodeAppOpen electric path', () => {
    const view = read('src/components/ElectricityView.vue')
    expect(view).toMatch(/prepareOneCodeAppOpen\(\{\s*appCode:\s*'electric'/)
    expect(view).toContain('electricity_usage_stats')
  })

  it('broadband uses prepareOneCodeAppOpen broadband path', () => {
    const view = read('src/components/BroadbandView.vue')
    expect(view).toMatch(/prepareOneCodeAppOpen\(\{\s*appCode:\s*'broadband'/)
  })

  it('one_code prepare builds tid URLs for electric and broadband', () => {
    const rs = read('src-tauri/src/modules/one_code.rs')
    expect(rs).toContain('build_one_code_pay_open_url')
    expect(rs).toContain('swae_write_response_ok')
    expect(rs).toContain('try_swae_bind_room')
    expect(rs).toContain('mint_one_code_browser_tid')
  })

  it('chaoxing outline empty returns error path not zero shell', () => {
    const ol = read('src-tauri/src/modules/online_learning.rs')
    expect(ol).toContain('extract_chaoxing_catalog_leaves')
    expect(ol).toContain('chaoxing_video_status_candidate_urls')
    expect(ol).toContain('未解析到可展开的小节')
    // 禁止 success + empty tasks 的假成功壳
    expect(ol).not.toContain('parse_warning": "outline_empty"')
    expect(ol).not.toContain("parse_warning\": \"outline_empty\"")
  })
})
