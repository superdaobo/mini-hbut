/**
 * #911 P1-⑤：游戏服务目标必须由**唯一环境权威**决定（结构性护栏）。
 *
 * 背景：`resolveGameRankApiBase()` / 五子棋 relay 都曾被硬编码为生产域，
 * 而同一构建的 V2 base 由 `statistics_environment` 按构建档位推导 ——
 * 非 release 构建因此出现「V2 在测试环境、relay 在生产环境」的跨环境组合：
 * 席位绑定凭证（`grb1.*`）由测试 V2 用测试密钥签发，生产 relay 用生产密钥验签 → 必然 403，
 * 五子棋联机不可用；同时测试期数据会落进生产库。
 *
 * 本护栏守四件事：
 * 1. **同源**：三个默认 base 全部由 `STATISTICS_SERVICE_BASE_URL` 派生（不允许第二默认值）；
 * 2. **不再硬编码**：游戏平台面源码里不得出现 `hf.space` 字面量（自带"扫描面非空"断言）；
 * 3. **运行期跨环境护栏真的关得住**，包括**编码 / Unicode 变体**（`%2e`、U+3002）——
 *    这类写法经 URL 规范化后就是另一端环境的域，但不含字面子串，故环境判定必须按
 *    **hostname** 比较（子串匹配会被绕过，已实测）；
 * 4. **同源派生的路径正确**：`…/api/cloud-sync` 必须派生出 `…/api/game-rank`，
 *    而不是 `…/api/api/game-rank`（后者在服务端不存在，会让经典榜与 iframe 注入全部 404）。
 */
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_GAME_PLATFORM_API_BASE,
  DEFAULT_GAME_RANK_API,
  DEFAULT_GAME_SERVICE_ORIGIN,
  DEFAULT_GOMOKU_RELAY_API
} from './game_center/base'
import {
  deriveLegacyRankBaseFromCloudSync,
  pickEnvironmentCompatibleBase,
  resolveGamePlatformApiBase,
  resolveGameRankApiBase
} from './game_center/api'
import { STATISTICS_SERVICE_BASE_URL, isStatisticsServiceUrlCompatible } from './statistics_environment'

/** 云同步运行时配置（mock 掉 I/O 依赖，使"派生"断言在 CI 里真的会失败） */
const cloudSync = vi.hoisted(() => ({ proxyEndpoint: '' }))

vi.mock('./cloud_sync.js', () => ({
  getCloudSyncRuntimeConfig: () => ({ proxyEndpoint: cloudSync.proxyEndpoint })
}))

const originOf = (value: string): string => new URL(value).origin

/** 另一端环境的**主机名**（当前构建下应被判为不兼容） */
const foreignHost = () => {
  const candidates = ['mini-hbut-testocr1.hf.space', 'mini-hbut-ocr-service.hf.space']
  const found = candidates.find((host) => !isStatisticsServiceUrlCompatible(`https://${host}/api/x`))
  if (!found) throw new Error('两个候选域都被判为环境兼容，测试前提不成立')
  return found
}

/** 另一端环境主机名的等价写法：字面 / 百分号编码点 / U+3002 全角句点 */
const foreignHostVariants = () => {
  const host = foreignHost()
  return [host, host.replace('.', '%2e'), host.replace('.', '。')]
}

const foreignBase = (suffix = '/api/game-platform/v1') => `https://${foreignHost()}${suffix}`

beforeEach(() => {
  cloudSync.proxyEndpoint = `${STATISTICS_SERVICE_BASE_URL}/api/cloud-sync`
})

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
    // #969：扫描面必须覆盖**全部**游戏平台消费面 —— 不只 utils 层，还包括
    // 游乐场视图（GameCenterView + 其各 tab 组件）与托管页宿主（MoreModuleHostView），
    // 否则「测试域字面量」可以在未覆盖的 .vue 里静默回归（文档宣称的护栏强度 = 实际覆盖）。
    const componentsDir = resolve(process.cwd(), 'src/components')
    const gameCenterComponentsDir = resolve(componentsDir, 'game-center')
    const walkVue = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? entry.name === '__tests__'
            ? []
            : walkVue(resolve(dir, entry.name))
          : entry.name.endsWith('.vue')
            ? [resolve(dir, entry.name)]
            : []
      )
    const files = [
      ...walkTs(gameCenterDir),
      resolve(process.cwd(), 'src/components/MoreView.vue'),
      resolve(componentsDir, 'GameCenterView.vue'),
      resolve(componentsDir, 'MoreModuleHostView.vue'),
      ...walkVue(gameCenterComponentsDir)
    ]
    // 扫描面非空：护栏本身不得因为「一个文件都没扫到」而静默通过
    expect(files.length).toBeGreaterThan(5)
    expect(files).toContain(resolve(process.cwd(), 'src/components/MoreView.vue'))
    // 覆盖面锁定（#969）：这三处此前不在扫描面内，属护栏宣称 > 实际覆盖
    expect(files).toContain(resolve(componentsDir, 'GameCenterView.vue'))
    expect(files).toContain(resolve(componentsDir, 'MoreModuleHostView.vue'))
    expect(files.some((file) => file.startsWith(gameCenterComponentsDir))).toBe(true)
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

  it('⚠ 编码 / Unicode 变体的另一端环境域同样拒绝（环境判定必须按 hostname，不能子串匹配）', () => {
    for (const variant of foreignHostVariants()) {
      expect(isStatisticsServiceUrlCompatible(`https://${variant}/api/x`), variant).toBe(false)
      expect(pickEnvironmentCompatibleBase([`https://${variant}/api/game-rank`]), variant).toBe('')
    }
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

describe('Legacy base 的同源派生（防双 /api 与跨环境）', () => {
  it('派生函数对三种端点形态都给出规范路径（不得出现 /api/api）', () => {
    expect(deriveLegacyRankBaseFromCloudSync('https://h.example.com/api/cloud-sync')).toBe(
      'https://h.example.com/api/game-rank'
    )
    expect(deriveLegacyRankBaseFromCloudSync('https://h.example.com/cloud-sync')).toBe(
      'https://h.example.com/api/game-rank'
    )
    expect(deriveLegacyRankBaseFromCloudSync('https://h.example.com/api/cloud-sync/')).toBe(
      'https://h.example.com/api/game-rank'
    )
    expect(deriveLegacyRankBaseFromCloudSync('')).toBe('')
  })

  it('默认云同步端点 → 解析结果就是规范默认源（回归：旧实现给 …/api/api/game-rank）', () => {
    expect(resolveGameRankApiBase()).toBe(DEFAULT_GAME_RANK_API)
    expect(resolveGameRankApiBase()).not.toContain('/api/api/')
  })

  it('保留部署子路径（…/sub/api/cloud-sync → …/sub/api/game-rank）', () => {
    cloudSync.proxyEndpoint = `${STATISTICS_SERVICE_BASE_URL}/sub/api/cloud-sync`
    expect(resolveGameRankApiBase()).toBe(`${STATISTICS_SERVICE_BASE_URL}/sub/api/game-rank`)
  })

  it('云同步端点为另一端环境 → 不采用，回落本环境默认源', () => {
    for (const variant of foreignHostVariants()) {
      cloudSync.proxyEndpoint = `https://${variant}/api/cloud-sync`
      expect(resolveGameRankApiBase(), variant).toBe(DEFAULT_GAME_RANK_API)
    }
  })
})

describe('解析结果绝不跨环境（运行期兜底）', () => {
  it('V2：显式覆盖为另一端环境 → 不采用，回落本环境默认源（含编码变体）', () => {
    for (const variant of foreignHostVariants()) {
      const resolved = resolveGamePlatformApiBase(`https://${variant}/api/game-platform/v1`)
      expect(resolved, variant).toBe(DEFAULT_GAME_PLATFORM_API_BASE)
      expect(isStatisticsServiceUrlCompatible(resolved), variant).toBe(true)
    }
  })

  it('Legacy：无论运行时配置如何，解析结果都落在本环境', () => {
    for (const endpoint of [
      `${STATISTICS_SERVICE_BASE_URL}/api/cloud-sync`,
      `${foreignBase('')}/api/cloud-sync`,
      ''
    ]) {
      cloudSync.proxyEndpoint = endpoint
      const resolved = resolveGameRankApiBase()
      expect(resolved, endpoint).not.toBe('')
      expect(originOf(resolved), endpoint).toBe(DEFAULT_GAME_SERVICE_ORIGIN)
      expect(isStatisticsServiceUrlCompatible(resolved), endpoint).toBe(true)
    }
  })
})
