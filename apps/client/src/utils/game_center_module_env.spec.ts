import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { appendIdentityQueryParams } from './game_center/profile'

/**
 * P1-A（复验修复）：宿主必须把**可被服务端匹配的版本串**注入模块 URL。
 *
 * 复验实测事实：`MoreView.appendModuleContextQuery` 只注入 `from/runtime/身份/rank_api/gomoku_api`，
 * 没有 `app_version` → SDK `resolveClientVersion` 回落 `unknown`、五子棋 `clientVersion` 默认 `''`
 * → 服务端灰度 deny 名单在生产**永远匹配不到**（跨仓阻塞）。
 *
 * 本文件用**真实注入函数**驱动（不做行为替身）：
 * 1. `appendModuleEnvQueryParams`（MoreView / MoreModuleHostView 共用的注入实现）——
 *    `app_version` / `host_origin` 非空才注入，且**与登录态无关**（版本与宿主来源都不是身份）；
 * 2. 与真实身份注入函数 `appendIdentityQueryParams`（契约 D）叠加：游客态版本照注入、身份零注入；
 * 3. 接线护栏：两个宿主注入点都必须读取构建期版本 `import.meta.env.VITE_APP_VERSION`
 *    （vite.config.ts 注入 `pkg.version`）与自身 `window.location.origin`。
 *
 * 写法说明（与 `hbut_gomoku_relay_rebind_contract.spec.ts` 同一范式）：`game_center/module_context`
 * 是本次新增模块，静态 import 会让修复前的测试文件加载失败；因此对新模块用动态 import + 存在性
 * 断言，让修复前的测试文件仍能加载并逐条断言失败。
 */

const GOMOKU_URL = 'https://hbut.6661111.xyz/modules/main/hbut_gomoku/site/index.html'
const RANK_API_BASE = 'https://rank.example/api/game-rank'
const CACHED_SID = '20240001'
const CACHED_NAME = '上一位用户'

const readSource = (relativePath: string) =>
  readFileSync(resolve(process.cwd(), relativePath), 'utf8')

interface ModuleContextApi {
  appendModuleEnvQueryParams: (url: URL, options?: { appVersion?: unknown; hostOrigin?: unknown }) => string[]
  normalizeAppVersion: (value: unknown) => string
  resolveBuildAppVersion: (override?: unknown) => string
  resolveHostOrigin: (value: unknown) => string
}

/** 动态取新增模块（修复前不存在 → 断言失败而不是加载失败） */
const requireModuleContextApi = async (): Promise<ModuleContextApi> => {
  let mod: Record<string, unknown> | null = null
  try {
    mod = (await import('./game_center/module_context')) as unknown as Record<string, unknown>
  } catch {
    mod = null
  }
  expect(mod, 'P1-A 修复未接入：game_center/module_context 模块必须存在').toBeTruthy()
  for (const name of [
    'appendModuleEnvQueryParams',
    'normalizeAppVersion',
    'resolveBuildAppVersion',
    'resolveHostOrigin'
  ]) {
    expect(typeof mod![name], `${name} 必须是可用的真实函数（P1-A）`).toBe('function')
  }
  return mod as unknown as ModuleContextApi
}

/** 模拟宿主打开模块时的真实 URL 组装顺序：from/runtime → 身份（契约 D）→ rank_api → 环境参数 */
const buildHostModuleUrl = async (
  options: {
    appVersion?: unknown
    hostOrigin?: unknown
    sessionVerified?: boolean
    profile?: Record<string, unknown>
  } = {}
) => {
  const { appendModuleEnvQueryParams } = await requireModuleContextApi()
  const url = new URL(GOMOKU_URL)
  url.searchParams.set('from', 'mini_hbut')
  url.searchParams.set('runtime', 'remote-site')
  url.searchParams.set('rank_api', RANK_API_BASE)
  appendIdentityQueryParams(
    url,
    options.profile || { student_id: CACHED_SID, name: CACHED_NAME },
    options.sessionVerified === true
  )
  const applied = appendModuleEnvQueryParams(url, {
    appVersion: options.appVersion,
    hostOrigin: options.hostOrigin
  })
  return { url, applied }
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('P1-A 宿主模块 URL：版本串与宿主 origin 必须始终注入', () => {
  it('构建期版本（VITE_APP_VERSION）→ URL 含 app_version；宿主 origin → URL 含 host_origin', async () => {
    const { resolveBuildAppVersion } = await requireModuleContextApi()
    // 真实版本源：vite.config.ts 的 define 会把 pkg.version 注入 VITE_APP_VERSION。
    // 这里用相同环境变量名 stub（vitest 同步到 import.meta.env），验证解析链本身。
    vi.stubEnv('VITE_APP_VERSION', '1.4.11')
    expect(resolveBuildAppVersion()).toBe('1.4.11')

    const { url, applied } = await buildHostModuleUrl({
      appVersion: resolveBuildAppVersion(),
      hostOrigin: 'tauri://localhost'
    })
    expect(applied).toEqual(['app_version', 'host_origin'])
    expect(url.searchParams.get('app_version')).toBe('1.4.11')
    // 自定义 scheme（Tauri/Capacitor 宿主）按 `${protocol}//${host}` 归一，不得丢成 "null"
    expect(url.searchParams.get('host_origin')).toBe('tauri://localhost')
  })

  it('版本不是身份：游客态（缓存身份非空）仍注入版本/origin，但零身份注入', async () => {
    const { resolveBuildAppVersion } = await requireModuleContextApi()
    vi.stubEnv('VITE_APP_VERSION', '1.4.11')
    const { url, applied } = await buildHostModuleUrl({
      appVersion: resolveBuildAppVersion(),
      hostOrigin: 'https://app.example',
      sessionVerified: false
    })
    expect(applied).toEqual(['app_version', 'host_origin'])
    expect(url.searchParams.get('app_version')).toBe('1.4.11')
    expect(url.searchParams.get('host_origin')).toBe('https://app.example')
    // 契约 D 不得被本修复放松：未确认会话 → 身份字段一个都不能出现
    for (const key of ['student_id', 'player_name', 'class_name', 'major', 'school_name']) {
      expect(url.searchParams.has(key), `游客态不得注入身份参数 ${key}`).toBe(false)
    }
    expect(url.toString()).not.toContain(CACHED_SID)
    expect(url.toString()).not.toContain(CACHED_NAME)
  })

  it('非空才注入：版本缺失 / 非法、origin 非法（含 * / null）→ 一律不注入空值', async () => {
    const { normalizeAppVersion, resolveHostOrigin } = await requireModuleContextApi()
    for (const bad of ['', '   ', 'v1.4.11 with space', null, undefined]) {
      const { url, applied } = await buildHostModuleUrl({ appVersion: bad, hostOrigin: '' })
      expect(applied).toEqual([])
      expect(url.searchParams.has('app_version')).toBe(false)
      expect(url.searchParams.has('host_origin')).toBe(false)
    }
    for (const badOrigin of ['*', 'null', 'javascript:alert(1)', 'not a url']) {
      const { url } = await buildHostModuleUrl({ appVersion: '1.4.11', hostOrigin: badOrigin })
      expect(url.searchParams.has('host_origin'), `非法 origin=${badOrigin} 不得注入`).toBe(false)
      expect(url.searchParams.get('app_version')).toBe('1.4.11')
    }
    // 版本与 origin 的归一化保持同一口径
    expect(normalizeAppVersion('1.4.11')).toBe('1.4.11')
    expect(resolveHostOrigin('https://app.example/more')).toBe('https://app.example')
    expect(resolveHostOrigin('capacitor://localhost/site/index.html')).toBe('capacitor://localhost')
  })

  it('接线护栏：两个宿主注入点都读取构建期版本与自身 origin', () => {
    for (const file of ['src/components/MoreView.vue', 'src/components/MoreModuleHostView.vue']) {
      const src = readSource(file)
      expect(src, `${file} 必须调用 appendModuleEnvQueryParams`).toContain('appendModuleEnvQueryParams(')
      expect(src, `${file} 必须读取 resolveBuildAppVersion()`).toContain('resolveBuildAppVersion()')
      expect(src, `${file} 必须以自身 origin 作为 host_origin`).toContain('hostOrigin: window.location.origin')
    }
    // 版本取值必须来自构建期注入（不得手写字符串版本）
    const moduleContext = readSource('src/utils/game_center/module_context.ts')
    expect(moduleContext).toContain('import.meta.env?.VITE_APP_VERSION')
    // MoreView 里 payload 的 preview_url 是注入后的 URL（不是原始 URL）
    const moreView = readSource('src/components/MoreView.vue')
    expect(moreView).toContain('preview_url: previewUrl')
  })
})
