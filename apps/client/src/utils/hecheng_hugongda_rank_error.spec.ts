// #998 合成湖工大 排行榜失败原因透出契约。
//
// 背景：修复前「排行榜加载失败，请稍后重试」是恒定串 —— 服务端 400（如
// 「学校排行榜缺少 school_name」）、5xx、响应非 JSON、SDK 的「未连接排行榜服务（本地游玩）」
// 在界面上完全长一个样，用户与排障都拿不到原因。本 spec 锁住「真实原因必须透出」这一行为。

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  LEADERBOARD_ERROR_DETAIL_MAX_LENGTH,
  appendLeaderboardErrorDetail
} from '../../../../website/modules-src/hecheng_hugongda/project/src/utils/leaderboard_error.js'

const FALLBACK = '排行榜加载失败，请稍后重试'

describe('appendLeaderboardErrorDetail 行为', () => {
  it('带 HTTP 状态码时以「HTTP <code>：原因」呈现（可区分服务端拒绝与网络失败）', () => {
    const text = appendLeaderboardErrorDetail(FALLBACK, {
      message: '学校排行榜缺少 school_name',
      status: 400
    })
    expect(text).toBe('排行榜加载失败，请稍后重试（HTTP 400：学校排行榜缺少 school_name）')
  })

  it('无状态码时只追加原因本体', () => {
    expect(appendLeaderboardErrorDetail(FALLBACK, { message: 'Failed to fetch' })).toBe(
      '排行榜加载失败，请稍后重试（Failed to fetch）'
    )
  })

  it('无原因 / 原因与抬头重复时不追加，避免「…失败（…失败）」噪音', () => {
    expect(appendLeaderboardErrorDetail(FALLBACK, { message: '' })).toBe(FALLBACK)
    expect(appendLeaderboardErrorDetail(FALLBACK, {})).toBe(FALLBACK)
    expect(appendLeaderboardErrorDetail(FALLBACK, null)).toBe(FALLBACK)
    expect(appendLeaderboardErrorDetail(FALLBACK, { message: FALLBACK })).toBe(FALLBACK)
    expect(appendLeaderboardErrorDetail(FALLBACK, { message: '排行榜加载失败' })).toBe(FALLBACK)
  })

  it('超长原因截断到上限并保留省略号（避免撑破榜单面板）', () => {
    const long = 'x'.repeat(200)
    const text = appendLeaderboardErrorDetail(FALLBACK, { message: long })
    const detail = text.slice(text.indexOf('（') + 1, -1)
    expect(detail).toHaveLength(LEADERBOARD_ERROR_DETAIL_MAX_LENGTH + 1) // +1 为省略号
    expect(detail.endsWith('…')).toBe(true)
  })

  it('缺省抬头时回落到内置兜底串（防御性）', () => {
    expect(appendLeaderboardErrorDetail('', { message: 'boom' })).toBe(
      '排行榜加载失败，请稍后重试（boom）'
    )
  })
})

describe('App.vue 接线契约（防止修复被静默移除）', () => {
  const appSource = () =>
    fs.readFileSync(
      path.join(
        process.cwd(),
        '../../website/modules-src/hecheng_hugongda/project/src/App.vue'
      ),
      'utf8'
    )

  it('兜底分支必须经 appendLeaderboardErrorDetail 透出原因', () => {
    const source = appSource()
    expect(source).toContain(
      "return appendLeaderboardErrorDetail('排行榜加载失败，请稍后重试', error)"
    )
    // 回归护栏：不得再出现「直接 return 恒定串」的写法
    expect(source).not.toContain("      return '排行榜加载失败，请稍后重试'\n")
  })

  it('失败分支要把 SDK 归一化错误（含 status）传给文案构造', () => {
    const source = appSource()
    expect(source).toContain('data.error && typeof data.error === \'object\'')
    expect(source).toContain('this.buildLeaderboardErrorMessage(failure, resolvedScope)')
  })
})
