import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { appendIdentityQueryParams } from './game_center/profile'
import {
  appendModuleEnvQueryParams,
  resolveBuildAppVersion,
  resolveHostOrigin
} from './game_center/module_context'

/**
 * G10 兜底（PRR#3 P1-2）：宿主 origin 在**非特殊 scheme** 下必须仍能注入。
 *
 * 事实依据（node 实测，见本文件 ⑥）：`new URL('tauri://localhost').origin === 'null'`，
 * `new URL('capacitor://localhost').origin === 'null'`（WHATWG：非特殊 scheme 的 origin 是
 * opaque → 字符串 `"null"`）。于是 `resolveHostOrigin(window.location.origin)` 归一为空
 * → 宿主不注入 `host_origin` → SDK fail closed（`origin_unverifiable`，零 V2 请求）
 * → **该端 verified 全链路不可用**（可用性回归；安全侧不放松）。
 *
 * 本文件是**行为级**测试（驱动真实注入函数，不做行为替身）：
 * ① `location.origin` 可用（含 Windows Tauri 的 `http://tauri.localhost`）→ 注入同值，且
 *    带 / 不带兜底来源的结果**逐字等价**（正常路径零漂移）；
 * ② `location.origin === 'null'` + `protocol`/`host` 可得 → 注入 `${protocol}//${host}`
 *    （且该串**必须再经既有 `normalizeGameOrigin` 归一**，不是裸拼接）；
 * ③ 两者都不可得（无 host / location 缺失）→ **不注入**（仍然 fail closed，不伪造 `null`）；
 * ④ 既有语义逐条保留：`*` / `null` / 非法字符串在无兜底来源时一律不注入，显式值优先；
 * ⑤ 接线护栏：两个宿主注入点必须把 `window.location` 一并传入（否则兜底永不生效）。
 *
 * 说明：`event.origin` 与 `location.origin` 在自定义 scheme 下的**实际形态需真机确认**；
 * 本兜底产出的 `${protocol}//${host}` 与既有 `normalizeGameOrigin`（及 SDK 侧
 * `normalizeHostOrigin`）对自定义 scheme 的归一规则**同构**，因此两端可匹配。
 */

const MODULE_URL = 'https://hbut.6661111.xyz/modules/main/hbut_stack/site/index.html'
const CACHED_SID = '20240001'
const CACHED_NAME = '上一位用户'

/** 与 `window.location` 结构兼容的最小子集（生产调用点传入的就是 `window.location` 本体） */
interface HostLocation {
  origin?: unknown
  protocol?: unknown
  host?: unknown
}

/** 模拟宿主真实链路：from/runtime → 身份（契约 D）→ 环境参数（本修复的作用点） */
const buildHostModuleUrl = (options: {
  appVersion?: unknown
  hostOrigin?: unknown
  hostLocation?: HostLocation | null
  sessionVerified?: boolean
}) => {
  const url = new URL(MODULE_URL)
  url.searchParams.set('from', 'mini_hbut')
  url.searchParams.set('runtime', 'remote-site')
  appendIdentityQueryParams(
    url,
    { student_id: CACHED_SID, name: CACHED_NAME },
    options.sessionVerified === true
  )
  const applied = appendModuleEnvQueryParams(url, {
    appVersion: options.appVersion,
    hostOrigin: options.hostOrigin,
    hostLocation: options.hostLocation
  })
  return { url, applied }
}

describe('G10 宿主 origin 兜底：非特殊 scheme 下 location.origin === "null" 仍须注入', () => {
  it('① 正常路径：location.origin 可用 → 注入同值，且与无兜底来源时逐字等价', () => {
    // Windows 上的 Tauri（v2）：WebView 走 `http://tauri.localhost`（特殊 scheme，origin 可用）
    const windowsTauri: HostLocation = {
      origin: 'http://tauri.localhost',
      protocol: 'http:',
      host: 'tauri.localhost'
    }
    expect(resolveHostOrigin('http://tauri.localhost', windowsTauri)).toBe('http://tauri.localhost')
    // 等价性：显式值可用时，兜底来源不得改变任何结果
    expect(resolveHostOrigin('http://tauri.localhost', windowsTauri)).toBe(
      resolveHostOrigin('http://tauri.localhost')
    )
    const { url, applied } = buildHostModuleUrl({
      appVersion: '1.4.11',
      hostOrigin: 'http://tauri.localhost',
      hostLocation: windowsTauri
    })
    expect(applied).toEqual(['app_version', 'host_origin'])
    expect(url.searchParams.get('app_version')).toBe('1.4.11')
    expect(url.searchParams.get('host_origin')).toBe('http://tauri.localhost')

    // 普通 https 宿主同理（回归等价）
    const web: HostLocation = { origin: 'https://app.example', protocol: 'https:', host: 'app.example' }
    expect(resolveHostOrigin('https://app.example/more', web)).toBe('https://app.example')
    expect(resolveHostOrigin('https://app.example/more', web)).toBe(
      resolveHostOrigin('https://app.example/more')
    )
  })

  it('② 非特殊 scheme：location.origin === "null" → 退化为 protocol//host 并注入', () => {
    const tauri: HostLocation = { origin: 'null', protocol: 'tauri:', host: 'localhost' }
    expect(resolveHostOrigin('null', tauri)).toBe('tauri://localhost')
    const { url, applied } = buildHostModuleUrl({
      appVersion: '1.4.11',
      hostOrigin: 'null',
      hostLocation: tauri
    })
    expect(applied).toEqual(['app_version', 'host_origin'])
    expect(url.searchParams.get('host_origin')).toBe('tauri://localhost')

    // iOS Capacitor：capacitor://localhost，同样 origin === 'null'
    const capacitor: HostLocation = { origin: 'null', protocol: 'capacitor:', host: 'localhost' }
    expect(resolveHostOrigin('null', capacitor)).toBe('capacitor://localhost')
    // 与既有「显式自定义 scheme 归一」同规则（同构）：两个来源必须得到同一值，SDK 才能匹配
    expect(resolveHostOrigin('null', capacitor)).toBe(
      resolveHostOrigin('capacitor://localhost/site/index.html')
    )

    // 兜底串**必须再经 normalizeGameOrigin**（裸拼接会保留大小写，归一化会产出 URL 规范形态）
    expect(
      resolveHostOrigin('null', { origin: 'null', protocol: 'HTTPS:', host: 'App.Example' })
    ).toBe('https://app.example')
  })

  it('③ 两者都不可得 → 不注入（仍然 fail closed，不得伪造 "null" 或其他值）', () => {
    const cases: Array<[string, HostLocation | null]> = [
      ['host 为空（无宿主可自证）', { origin: 'null', protocol: 'tauri:', host: '' }],
      ['protocol / host 都为空', { origin: '', protocol: '', host: '' }],
      ['只有不可用的 origin（opaque）', { origin: 'null' }],
      ['location 整体缺失（未传兜底来源）', null]
    ]
    for (const [name, hostLocation] of cases) {
      const { url, applied } = buildHostModuleUrl({
        appVersion: '1.4.11',
        hostOrigin: 'null',
        hostLocation
      })
      expect(applied, `不可得场景（${name}）只能注入版本`).toEqual(['app_version'])
      expect(url.searchParams.has('host_origin'), `host origin 不可得（${name}）不得注入`).toBe(false)
    }
    // 残缺串（只有 protocol 没有 host）绝不进归一化
    expect(resolveHostOrigin('null', { origin: 'null', protocol: 'tauri:', host: '   ' })).toBe('')
  })

  it('④ 既有语义逐条保留：非法 / 通配 / 空值在无兜底来源时一律不注入；显式值优先', () => {
    for (const bad of ['', '   ', '*', 'null', 'javascript:alert(1)', 'not a url', null, undefined]) {
      expect(resolveHostOrigin(bad), `非法 origin=${String(bad)} 必须为空串`).toBe('')
      const { url } = buildHostModuleUrl({ appVersion: '1.4.11', hostOrigin: bad })
      expect(url.searchParams.has('host_origin'), `非法 origin=${String(bad)} 不得注入`).toBe(false)
    }
    expect(resolveHostOrigin('https://app.example/more')).toBe('https://app.example')
    expect(resolveHostOrigin('capacitor://localhost/site/index.html')).toBe('capacitor://localhost')
    // 显式值优先：可用时不得被兜底来源覆盖（解析优先级不变）
    const other: HostLocation = { origin: 'https://other.example', protocol: 'https:', host: 'other.example' }
    expect(resolveHostOrigin('https://app.example', other)).toBe('https://app.example')
  })

  it('⑤ 接线护栏：两个宿主注入点都必须把 window.location 作为兜底来源传入', () => {
    for (const file of ['src/components/MoreView.vue', 'src/components/MoreModuleHostView.vue']) {
      const src = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(src, `${file} 必须仍以自身 origin 作为 host_origin`).toContain(
        'hostOrigin: window.location.origin'
      )
      expect(src, `${file} 必须把 window.location 传入以启用 G10 兜底`).toContain(
        'hostLocation: window.location'
      )
    }
  })

  it('⑥ 事实基线（防止规则漂移）：非特殊 scheme 的 URL.origin 就是字符串 "null"', () => {
    expect(new URL('tauri://localhost').origin).toBe('null')
    expect(new URL('capacitor://localhost').origin).toBe('null')
    expect(new URL('http://tauri.localhost').origin).toBe('http://tauri.localhost')
    // 版本注入与本兜底互不干扰（本兜底不引入任何新参数）
    expect(resolveBuildAppVersion('1.4.11')).toBe('1.4.11')
  })
})
