import { describe, expect, it } from 'vitest'

import {
  isStatisticsServiceUrlCompatibleForEnvironment,
  resolveStatisticsEnvironment
} from './statistics_environment'

describe('Statistics V2 environment boundary', () => {
  it('maps only release builds to production statistics', () => {
    expect(resolveStatisticsEnvironment('release')).toBe('production')
    expect(resolveStatisticsEnvironment('dev-fast')).toBe('test')
    expect(resolveStatisticsEnvironment('standard')).toBe('test')
    expect(resolveStatisticsEnvironment('')).toBe('test')
  })

  it('prevents known production and test Space endpoints from crossing environments', () => {
    const production = 'https://mini-hbut-ocr-service.hf.space/api/cloud-sync'
    const test = 'https://mini-hbut-testocr1.hf.space/api/cloud-sync'

    expect(isStatisticsServiceUrlCompatibleForEnvironment(production, 'production')).toBe(true)
    expect(isStatisticsServiceUrlCompatibleForEnvironment(test, 'production')).toBe(false)
    expect(isStatisticsServiceUrlCompatibleForEnvironment(test, 'test')).toBe(true)
    expect(isStatisticsServiceUrlCompatibleForEnvironment(production, 'test')).toBe(false)
  })

  it('#968b：localhost:port 识别为本地地址（loopback 语义，两端环境都不误拒）', () => {
    // 此前 `localhost:3000/...` 被 WHATWG URL 当作 opaque scheme（hostname ''）→ 误判不兼容，
    // 落盘清理器会把本地联调 base 误删；收口后回落 https 前缀解析出真实 hostname
    expect(isStatisticsServiceUrlCompatibleForEnvironment('localhost:3000/api/game-rank', 'test')).toBe(true)
    expect(isStatisticsServiceUrlCompatibleForEnvironment('localhost:3000/api/game-rank', 'production')).toBe(true)
    expect(isStatisticsServiceUrlCompatibleForEnvironment('http://localhost:8080/api/game-rank', 'test')).toBe(true)
  })

  it('#968b：相对路径 base 判为不可解析（fail closed → 落盘清理）', () => {
    // 此前 `/api/game-rank` 经 https:// 前缀拼出假主机名 `api` → 误判"自定义域"兼容 →
    // 清理器保留一个不可提交的死值；收口后明确判不兼容（/ 开头必为相对路径，不可能是 host）
    expect(isStatisticsServiceUrlCompatibleForEnvironment('/api/game-rank', 'test')).toBe(false)
    expect(isStatisticsServiceUrlCompatibleForEnvironment('/api/game-rank', 'production')).toBe(false)
    // 自定义域放行语义不受影响（对照）
    expect(isStatisticsServiceUrlCompatibleForEnvironment('https://games.example.com/api/game-rank', 'test')).toBe(true)
  })
})
