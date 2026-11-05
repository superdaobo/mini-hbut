/**
 * #1168 T07 收口契约：SDK 与宿主两侧的协议版本必须同时 fail-closed，
 * 且实例在「导航 / 重载 / 地址变化」时作废。
 *
 * 为什么用源码契约：SDK 跑在游戏 iframe 里，app 的 vitest 环境无法加载它；
 * 而这两条都属于「改回去就静默失效」的安全不变量，必须被 CI 盯住。
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => {
  const full = path.join(process.cwd(), relativePath)
  return readFileSync(full, 'utf8')
}

const SDK_BRIDGE = '../../website/modules-src/_sdk/src/host-bridge.js'
const HOST_BRIDGE = 'src/utils/game_center/host_bridge.ts'
const HOST_VIEW = 'src/components/MoreModuleHostView.vue'

describe('#1168 T07 收口契约', () => {
  it('SDK 侧协议版本缺失/非整数必须拒绝（不得跳过协商）', () => {
    const source = read(SDK_BRIDGE)
    const start = source.indexOf('#1168 T07：宿主**必须**显式声明协议版本')
    expect(start).toBeGreaterThan(0)
    const body = source.slice(start, start + 600)
    expect(body).toContain('!Number.isInteger(protocolVersion)')
    expect(body).toContain('protocol_version_unsupported')
    // 旧写法（只在是整数时才比较范围）不得残留
    expect(body).not.toContain('Number.isInteger(protocolVersion) && (')
  })

  it('宿主与 SDK 的版本判定方向一致（都要求显式整数）', () => {
    const host = read(HOST_BRIDGE)
    const sdk = read(SDK_BRIDGE)
    expect(host).toContain('!Number.isInteger(protocolVersion)')
    expect(sdk).toContain('!Number.isInteger(protocolVersion)')
  })

  it('重载/导航会先注销旧实例再登记新实例', () => {
    const view = read(HOST_VIEW)
    const reload = view.indexOf('const reloadFrame = () => {')
    expect(reload).toBeGreaterThan(0)
    const reloadBody = view.slice(reload, reload + 400)
    expect(reloadBody).toContain('unregisterModuleInstance()')

    const load = view.indexOf('const handleLoad = () => {')
    const loadBody = view.slice(load, load + 600)
    expect(loadBody).toContain('registerModuleInstance()')

    // 地址变化（换模块）也必须注销旧实例
    const watchStart = view.indexOf('() => previewUrl.value')
    const watchBody = view.slice(watchStart, watchStart + 500)
    expect(watchBody).toContain('unregisterModuleInstance()')
  })

  it('平台降级：无 Bridge 平台只能走远端白名单地址', () => {
    const core = read('src/utils/more_modules/core.js')
    // 本机内容预览只在 Tauri 且非 Android 可用
    expect(core).toContain('canUseLocalModuleBridgePreview')
    const moreModules = read('src/utils/more_modules.js')
    expect(moreModules).toContain('isTrustedRemoteModuleUrl')
    // Android/iOS 走 Capacitor 分支时同样不嵌入任意远端地址
    const capacitorStart = moreModules.indexOf('isCapacitorRuntime() &&')
    expect(capacitorStart).toBeGreaterThan(0)
  })
})
