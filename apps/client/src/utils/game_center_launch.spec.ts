/**
 * #905 启动链路（HTTPS-first + origin 白名单 + 一次性开局意图）契约测试。
 */
import { describe, expect, it } from 'vitest'
import {
  GAME_CENTER_GAME_IDS,
  extractUrlOrigin,
  isGameFrameOriginAllowed,
  isLocalBridgePreviewUrl,
  isRemoteHttpsUrl,
  resolveGameCenterLaunchUrl,
  resolveGameFrameAllowedOrigins
} from './game_center/launch'
import { consumeGameOpen, peekGameOpen, requestGameOpen } from './game_center/pending_open'
import { DEFAULT_MODULE_CENTER } from './module_center.js'

describe('game center launch（#905）', () => {
  it('游戏清单与内置模块中心严格一致（零破坏）', () => {
    expect([...GAME_CENTER_GAME_IDS]).toEqual(DEFAULT_MODULE_CENTER.modules.map((item) => item.id))
  })

  it('HTTPS-first：优先远端 HTTPS 站点，本地桥/本地包作为兼容降级', () => {
    const session = {
      resolvedPreviewUrl: 'http://127.0.0.1:52100/module_bundle/content/hbut_stack/index.html',
      localPreviewUrl: 'http://127.0.0.1:52100/module_bundle/content/hbut_stack/index.html',
      open_url: 'https://hbut.6661111.xyz/modules/main/hbut_stack/2026/site/index.html',
      candidateUrls: ['https://hbut.6661111.xyz/modules/main/hbut_stack/2026/site/index.html']
    }
    expect(resolveGameCenterLaunchUrl(session)).toBe(
      'https://hbut.6661111.xyz/modules/main/hbut_stack/2026/site/index.html'
    )

    // 没有远端地址时退回既有解析结果（本地桥仍可用，不删除）
    const offline = {
      resolvedPreviewUrl: 'http://127.0.0.1:52100/module_bundle/content/hbut_stack/index.html'
    }
    expect(resolveGameCenterLaunchUrl(offline)).toBe(offline.resolvedPreviewUrl)
    expect(resolveGameCenterLaunchUrl(offline, { requireHttps: true })).toBe('')
  })

  it('远端地址判定排除本地桥，且只认 https', () => {
    expect(isRemoteHttpsUrl('https://hbut.6661111.xyz/x/index.html')).toBe(true)
    expect(isRemoteHttpsUrl('http://hbut.6661111.xyz/x/index.html')).toBe(false)
    expect(isRemoteHttpsUrl('https://127.0.0.1/module_bundle/content/a/index.html')).toBe(false)
    expect(isLocalBridgePreviewUrl('http://localhost:52100/module_bundle/content/a/index.html')).toBe(true)
    expect(isLocalBridgePreviewUrl('https://hbut.6661111.xyz/a/index.html')).toBe(false)
  })

  it('origin 白名单由实际 URL 推导，绝不包含 *', () => {
    const origins = resolveGameFrameAllowedOrigins({
      frameUrl: 'https://hbut.6661111.xyz/modules/main/hbut_stack/2026/site/index.html',
      fallbackUrl: 'http://127.0.0.1:52100/module_bundle/content/hbut_stack/index.html',
      extraOrigins: ['*', 'https://extra.example.com/path', 'http://insecure.example.com', 'null']
    })
    expect(origins).toEqual(['https://hbut.6661111.xyz', 'http://127.0.0.1:52100', 'https://extra.example.com'])
    expect(origins).not.toContain('*')
  })

  it('无 URL 时白名单为空（一律拒绝）；opaque origin 必须显式 opt-in', () => {
    expect(resolveGameFrameAllowedOrigins({})).toEqual([])
    expect(resolveGameFrameAllowedOrigins({ allowOpaqueOrigin: true })).toEqual(['null'])
  })

  it('原生外壳自定义 scheme（capacitor:// / tauri://）必须可推导 origin 且被放行', () => {
    // Capacitor iOS 本地包：new URL(...).origin === 'null'，但 WebView 上报 capacitor://localhost
    const capacitorLocal = resolveGameFrameAllowedOrigins({
      frameUrl: 'capacitor://localhost/_capacitor_file_/data/modules/hbut_stack/index.html',
      allowOpaqueOrigin: true
    })
    expect(capacitorLocal).toContain('capacitor://localhost')
    // opaque origin 兜底（部分 WebView 上报 'null'）
    expect(capacitorLocal).toContain('null')
    // 本地包模式的真实消息必须能通过校验（防止 height 上报被误拒的回归）
    expect(isGameFrameOriginAllowed('capacitor://localhost', capacitorLocal)).toBe(true)
    expect(isGameFrameOriginAllowed('null', capacitorLocal)).toBe(true)

    const tauriLocal = resolveGameFrameAllowedOrigins({
      frameUrl: 'tauri://localhost/module_bundle/content/hbut_stack/index.html',
      allowOpaqueOrigin: true
    })
    expect(isGameFrameOriginAllowed('tauri://localhost', tauriLocal)).toBe(true)
  })

  it('远端 HTTPS 站点模式不放行 opaque origin（主路径保持严格）', () => {
    const remoteOrigins = resolveGameFrameAllowedOrigins({
      frameUrl: 'https://hbut.6661111.xyz/modules/main/hbut_stack/2026/site/index.html',
      allowOpaqueOrigin: false
    })
    expect(remoteOrigins).toEqual(['https://hbut.6661111.xyz'])
    expect(isGameFrameOriginAllowed('null', remoteOrigins)).toBe(false)
    expect(isGameFrameOriginAllowed('capacitor://localhost', remoteOrigins)).toBe(false)
  })

  it('origin 比较为严格相等，空白名单/含 * 的白名单一律拒绝', () => {
    expect(isGameFrameOriginAllowed('https://a.example.com', ['https://a.example.com'])).toBe(true)
    expect(isGameFrameOriginAllowed('https://a.example.com.evil.com', ['https://a.example.com'])).toBe(false)
    expect(isGameFrameOriginAllowed('https://a.example.com', [])).toBe(false)
    expect(isGameFrameOriginAllowed('https://a.example.com', ['*'])).toBe(false)
    expect(isGameFrameOriginAllowed('', ['https://a.example.com'])).toBe(false)
  })

  it('extractUrlOrigin 容错：非法输入返回空串', () => {
    expect(extractUrlOrigin('not a url')).toBe('')
    expect(extractUrlOrigin('')).toBe('')
    expect(extractUrlOrigin('https://a.example.com/x?y=1#z')).toBe('https://a.example.com')
    expect(extractUrlOrigin('data:text/html,<b>x</b>')).toBe('')
    expect(extractUrlOrigin('javascript:alert(1)')).toBe('')
    expect(extractUrlOrigin('null')).toBe('')
    expect(extractUrlOrigin('*')).toBe('')
  })

  it('开局意图是一次性的进程内通道', () => {
    expect(peekGameOpen()).toBe('')
    expect(requestGameOpen('')).toBe(false)
    expect(requestGameOpen('hbut_stack')).toBe(true)
    expect(peekGameOpen()).toBe('hbut_stack')
    expect(consumeGameOpen()).toBe('hbut_stack')
    expect(consumeGameOpen()).toBe('')
  })
})
