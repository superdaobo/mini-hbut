/**
 * #911 P1-⑤：游戏服务目标必须由**唯一环境权威**决定（结构性护栏）。
 *
 * 背景：`resolveGameRankApiBase()` / 五子棋 relay 都曾被硬编码为生产域，
 * 而同一构建的 V2 base 由 `statistics_environment` 按构建档位推导 ——
 * 非 release 构建因此出现「V2 在测试环境、relay 在生产环境」的跨环境组合：
 * 席位绑定凭证（`grb1.*`）由测试 V2 用测试密钥签发，生产 relay 用生产密钥验签 → 必然 403，
 * 五子棋联机不可用；同时测试期数据会落进生产库。
 *
 * 本护栏守两件事：
 * 1. **同源**：三个默认 base 全部由 `STATISTICS_SERVICE_BASE_URL` 派生（不允许第二默认值）；
 * 2. **不再硬编码**：游戏平台面源码里不得出现 `hf.space` 字面量。
 *    护栏自带「扫描面非空」断言，避免匹配不到文件时静默通过。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_GAME_PLATFORM_API_BASE,
  DEFAULT_GAME_RANK_API,
  DEFAULT_GAME_SERVICE_ORIGIN,
  DEFAULT_GOMOKU_RELAY_API
} from './game_center/base'
import { pickEnvironmentCompatibleBase, resolveGamePlatformApiBase, resolveGameRankApiBase } from './game_center/api'
import { STATISTICS_SERVICE_BASE_URL, isStatisticsServiceUrlCompatible } from './statistics_environment'

const originOf = (value: string): string => new URL(value).origin

/** 另一端环境的服务域（当前构建下应被判为**不兼容**） */
const foreignBase = (suffix = '/api/game-platform/v1') => {
  const candidates = [
    `https://mini-hbut-testocr1.hf.space${suffix}`,
    `https://mini-hbut-ocr-service.hf.space${suffix}`
  ]
  const found = candidates.find((candidate) => !isStatisticsServiceUrlCompatible(candidate))
  if (!found) throw new Error('两个候选域都被判为环境兼容，测试前提不成立')
  return found
}

describe('游戏服务目标的环境权威', () => {
  it('默认服务源直接取构建档位（与 statistics_environment 单一权威一致）', () => {
    expect(DEFAULT_GAME_SERVICE_ORIGIN).toBe(STATISTICS_SERVICE_BASE_URL)
  })

  it('三个默认 base 全部与默认服务源同源（不得出现第二默认值）', () => {
    expect(DEFAULT_GAME_PLATFORM_API_BASE).toBe(`${DEFAULT_GAME_SERVICE_ORIGIN}/api/game-platform/v1`)
    expect(DEFAULT_GAME_RANK_API).toBe(`${DEFAULT_GAME_SERVICE_ORIGIN}/api/game-rank`)
    expect(DEFAULT_GOMOKU_RELAY_API).toBe(`${DEFAULT_GAME_SERVICE_ORIGIN}/api/gomoku-relay`)
  })

  it('五子棋 relay 与 V2 同 origin（跨环境会让席位凭证验签必失败）', () => {
    expect(originOf(DEFAULT_GOMOKU_RELAY_API)).toBe(originOf(DEFAULT_GAME_PLATFORM_API_BASE))
    expect(originOf(DEFAULT_GOMOKU_RELAY_API)).toBe(DEFAULT_GAME_SERVICE_ORIGIN)
  })

  it('游戏平台面源码里不再出现硬编码服务域（结构性护栏）', () => {
    const gameCenterDir = resolve(process.cwd(), 'src/utils/game_center')
    const walkTs = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walkTs(resolve(dir, entry.name))
          : entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts')
            ? [resolve(dir, entry.name)]
            : []
      )
    const files = [...walkTs(gameCenterDir), resolve(process.cwd(), 'src/components/MoreView.vue')]
    // 扫描面非空：护栏本身不得因为「一个文件都没扫到」而静默通过
    expect(files.length).toBeGreaterThan(5)
    expect(files).toContain(resolve(process.cwd(), 'src/components/MoreView.vue'))
    for (const file of files) {
      expect(readFileSync(file, 'utf8'), `${file} 不得硬编码服务域`).not.toContain('hf.space')
    }
  })
})

describe('运行期跨环境护栏（pickEnvironmentCompatibleBase）', () => {
  it('无候选 / 空串 / 纯空白 → 未配置（返回空串）', () => {
    expect(pickEnvironmentCompatibleBase([])).toBe('')
    expect(pickEnvironmentCompatibleBase(['', '   ', null, undefined])).toBe('')
  })

  it('另一端环境的域 → 一律拒绝（正向与反向都不放过）', () => {
    expect(pickEnvironmentCompatibleBase([foreignBase()])).toBe('')
  })

  it('明文非 loopback → 拒绝（沿用 HTTPS 优先铁律）', () => {
    expect(pickEnvironmentCompatibleBase(['http://games.example.com/api/game-platform/v1'])).toBe('')
    expect(pickEnvironmentCompatibleBase(['javascript:alert(1)'])).toBe('')
  })

  it('loopback 与自定义域 → 两端环境都放行（不误杀本地联调）', () => {
    expect(pickEnvironmentCompatibleBase(['http://127.0.0.1:8000/api/game-rank'])).toBe(
      'http://127.0.0.1:8000/api/game-rank'
    )
    expect(pickEnvironmentCompatibleBase(['https://games.example.com/api/game-rank'])).toBe(
      'https://games.example.com/api/game-rank'
    )
  })

  it('按顺序取第一个合格候选，且归一化去掉尾斜杠', () => {
    expect(pickEnvironmentCompatibleBase([foreignBase(), `${STATISTICS_SERVICE_BASE_URL}/api/game-rank/`])).toBe(
      `${STATISTICS_SERVICE_BASE_URL}/api/game-rank`
    )
  })
})

describe('解析结果绝不跨环境（运行期兜底）', () => {
  it('V2：显式覆盖为另一端环境 → 不采用，回落本环境默认源', () => {
    const resolved = resolveGamePlatformApiBase(foreignBase())
    expect(resolved).toBe(DEFAULT_GAME_PLATFORM_API_BASE)
    expect(isStatisticsServiceUrlCompatible(resolved)).toBe(true)
  })

  it('Legacy：无论运行时配置如何，解析结果都落在本环境', () => {
    const resolved = resolveGameRankApiBase()
    expect(resolved).not.toBe('')
    expect(originOf(resolved)).toBe(DEFAULT_GAME_SERVICE_ORIGIN)
    expect(isStatisticsServiceUrlCompatible(resolved)).toBe(true)
  })
})
