import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  STATISTICS_ENVIRONMENT,
  STATISTICS_SERVICE_BASE_URL,
  isProductionStatisticsEnvironment,
  isStatisticsServiceUrlCompatible,
  resolveStatisticsEnvironment
} from './statistics_environment'

describe('后端环境：所有构建档位统一走生产（2026-10-06 决策）', () => {
  it('任何构建档位都解析为 production', () => {
    expect(resolveStatisticsEnvironment('release')).toBe('production')
    expect(resolveStatisticsEnvironment('dev-fast')).toBe('production')
    expect(resolveStatisticsEnvironment('standard')).toBe('production')
    expect(resolveStatisticsEnvironment('')).toBe('production')
    expect(resolveStatisticsEnvironment(undefined)).toBe('production')
  })

  it('主域恒为 mini.hbut.site，且恒判定为生产后端', () => {
    expect(STATISTICS_ENVIRONMENT).toBe('production')
    expect(isProductionStatisticsEnvironment()).toBe(true)
    expect(STATISTICS_SERVICE_BASE_URL).toBe('https://mini.hbut.site')
  })

  it('已下线的测试域（testocr1）在任何档位都被拒绝', () => {
    // 该 Space 已 PAUSED；存量落盘配置若仍指向它，会带来「返回 HTML 而非 JSON」的静默失败
    expect(isStatisticsServiceUrlCompatible('https://mini-hbut-testocr1.hf.space/api/cloud-sync')).toBe(false)
    // 编码点 / 全角句点的变形经 WHATWG URL 规范化后是同一个域，不得绕过
    expect(isStatisticsServiceUrlCompatible('https://mini-hbut-testocr1%2ehf.space/api/cloud-sync')).toBe(false)
    expect(isStatisticsServiceUrlCompatible('https://mini-hbut-testocr1。hf.space/api/cloud-sync')).toBe(false)
    // 主域与唯一兜底域放行
    expect(isStatisticsServiceUrlCompatible('https://mini.hbut.site/api/cloud-sync')).toBe(true)
    expect(isStatisticsServiceUrlCompatible('https://mini-hbut-ocr-service.hf.space/api/cloud-sync')).toBe(true)
  })

  it('#968b：localhost:port 识别为本地地址（不误拒）', () => {
    // 此前 `localhost:3000/...` 被 WHATWG URL 当作 opaque scheme（hostname ''）→ 误判不兼容，
    // 落盘清理器会把本地联调 base 误删；收口后回落 https 前缀解析出真实 hostname
    expect(isStatisticsServiceUrlCompatible('localhost:3000/api/game-rank')).toBe(true)
    expect(isStatisticsServiceUrlCompatible('http://localhost:8080/api/game-rank')).toBe(true)
  })

  it('#968b：相对路径 base 判为不可解析（fail closed → 落盘清理）', () => {
    // 此前 `/api/game-rank` 经 https:// 前缀拼出假主机名 `api` → 误判"自定义域"兼容 →
    // 清理器保留一个不可提交的死值；收口后明确判不兼容（/ 开头必为相对路径，不可能是 host）
    expect(isStatisticsServiceUrlCompatible('/api/game-rank')).toBe(false)
    // 自定义域放行语义不受影响（对照）
    expect(isStatisticsServiceUrlCompatible('https://games.example.com/api/game-rank')).toBe(true)
  })
})

describe('环境判定唯一权威（防止「三处各写一遍」回归）', () => {
  const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8')

  it('云同步与游戏候选必须消费 isProductionStatisticsEnvironment()，不得自行读构建档位', () => {
    const cloudSync = read('src/utils/cloud_sync_config.ts')
    const gameBase = read('src/utils/game_center/base.ts')

    expect(cloudSync).toContain('isProductionStatisticsEnvironment()')
    // 只禁止「真的去读构建档位」，注释里提及变量名不算违规
    expect(cloudSync).not.toContain('import.meta.env.VITE_BUILD_PROFILE')

    expect(gameBase).toContain('DEFAULT_BACKEND_GROUPS')
    expect(gameBase).not.toContain('import.meta.env.VITE_BUILD_PROFILE')
  })

  it('环境权威文件本身也不得再按档位选后端（恒 production）', () => {
    const source = read('src/utils/statistics_environment.ts')
    expect(source).toContain("resolveStatisticsEnvironment = (_profile?: unknown): StatisticsEnvironment => 'production'")
    // 不得再出现「按 release 分流」的写法
    expect(source).not.toMatch(/=== 'release'/)
  })
})
