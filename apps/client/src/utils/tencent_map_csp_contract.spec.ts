import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * #1300 契约：生产 CSP 必须放行腾讯地图 GL JS，且加载器要有超时/重试兜底。
 * 线上故障根因就是 `script-src` 不含 map.qq.com —— 这里把它钉死。
 */
const readSource = (path: string) => {
  const resolved = resolve(process.cwd(), path)
  return existsSync(resolved) ? readFileSync(resolved, 'utf8') : ''
}

const cspDirective = (csp: string, name: string) => {
  const part = String(csp)
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${name} `))
  return part || ''
}

describe('tencent map CSP + loader contract (#1300)', () => {
  const config = JSON.parse(readSource('src-tauri/tauri.conf.json') || '{}')
  const csp = String(config?.app?.security?.csp || '')
  const loader = readSource('src/utils/tencent_map_loader.ts')
  const towerGo = readSource('src/components/TowerGoView.vue')

  it('生产 CSP 的 script-src 放行 map.qq.com（不加 https: 通配）', () => {
    const scriptSrc = cspDirective(csp, 'script-src')
    expect(scriptSrc).toContain('https://map.qq.com')
    expect(scriptSrc).not.toMatch(/\shttps:(\s|$)/)
  })

  it('加载器对 CSP 拦截/网络挂起有超时兜底，并清理失败脚本', () => {
    expect(loader).toContain('TENCENT_MAP_LOAD_TIMEOUT_MS')
    expect(loader).toContain('腾讯地图脚本加载超时')
    expect(loader).toContain('script.remove()')
    expect(loader).toContain('export const resetTencentMapLoader')
    expect(loader).toContain('inflightLoad')
  })

  it('小塔出行在失败态暴露可点击的重试入口', () => {
    expect(towerGo).toContain('resetTencentMapLoader')
    expect(towerGo).toContain('const retryMap = async')
    expect(towerGo).toContain('map-fallback__retry')
    expect(towerGo).toContain('重试加载地图')
    // 失败原因与车辆数据错误分开，避免被后续刷新覆盖成「地图加载中…」
    expect(towerGo).toContain('mapScriptError')
    expect(towerGo).toContain('{{ mapScriptError || mapErrors[0]')
  })

  it('重试按钮在 overlay（pointer-events:none）里可点击', () => {
    const css = readSource('src/styles/views/TowerGoView.scoped.css')
    const block = css.slice(css.indexOf('.map-fallback__retry'))
    expect(block).toContain('pointer-events: auto')
  })
})
