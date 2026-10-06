// #1002「更多」页总面板模块契约。
//
// 用户确认的形态：**与其它游戏完全一致**（静态 bundle + 远程内嵌 iframe），
// 因此 Windows / iOS / Android 三端走同一条链路，不需要平台特判。
//
// 本 spec 锁两件事：
// 1. 形态与其它模块一致（构建入口 / base / viewport / postcss 截断）；
// 2. **核心要求**：面板骨架先于任何网络请求渲染 —— 即「直接显示，而不是等加载完才显示」。
//    这条最容易被后续改动悄悄破坏（例如把整块渲染挪进 fetch 回调）。

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { DEFAULT_MODULE_CENTER } from './module_center'

const repoRoot = process.cwd()
const moduleRoot = path.join(repoRoot, '..', '..', 'website', 'modules-src', 'more_panel')
const projectRoot = path.join(moduleRoot, 'project')

const read = (rel: string) => fs.readFileSync(path.join(projectRoot, rel), 'utf8')
const readJson = <T = Record<string, unknown>>(rel: string) =>
  JSON.parse(fs.readFileSync(path.join(projectRoot, rel), 'utf8')) as T

describe('#1002 总面板模块：形态与其它游戏一致', () => {
  it('module.json 声明与其它模块同形的入口', () => {
    const manifest = readJson<{
      id: string
      entry_path: string
      source_dir: string
      disabled?: boolean
    }>(path.join('..', 'module.json'))
    expect(manifest.id).toBe('more_panel')
    expect(manifest.entry_path).toBe('index.html')
    expect(manifest.source_dir).toBe('project')
    expect(manifest.disabled).not.toBe(true)
  })

  it('vite 使用相对 base（bundle / iframe 加载的前提）', () => {
    expect(read('vite.config.js')).toMatch(/base:\s*['"]\.\/['"]/)
  })

  it('自带空 postcss 配置，阻断向上继承 website 的 tailwind 配置', () => {
    expect(read('postcss.config.js')).toContain('plugins: []')
  })

  it('viewport 锁定缩放（三端触控一致，与竖屏模块同契约）', () => {
    const html = read('index.html')
    const viewport = html.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i)?.[1] || ''
    expect(viewport).toContain('width=device-width')
    expect(viewport).toContain('initial-scale=1.0')
    expect(viewport).toMatch(/user-scalable=no/)
    expect(viewport).toContain('viewport-fit=cover')
  })

  it('不得混入经典游戏模块清单（该清单被契约锁定为恰好 11 项）', () => {
    expect(DEFAULT_MODULE_CENTER.modules.map((item) => item.id)).not.toContain('more_panel')
  })
})

describe('#1002 核心要求：骨架先于数据渲染', () => {
  it('HTML 里内联了面板骨架（不依赖 JS 才有内容）', () => {
    const html = read('index.html')
    expect(html).toContain('id="panel"')
    expect(html).toContain('tile--skeleton')
    // 骨架必须是静态标记，而不是由脚本生成后才出现
    expect(html.indexOf('tile--skeleton')).toBeLessThan(html.indexOf('<script'))
  })

  it('主流程先渲染身份/状态再异步取数（取数不得门控整块渲染）', () => {
    const source = read('src/main.js')
    const mainIndex = source.indexOf('const main = () => {')
    expect(mainIndex).toBeGreaterThan(-1)
    const mainBody = source.slice(mainIndex)
    // 渲染身份与状态在前，异步加载在后
    expect(mainBody.indexOf('renderIdentity')).toBeLessThan(mainBody.indexOf('loadPoints'))
    // 取数必须是「并发发起且不 await 阻塞首屏」
    expect(mainBody).toMatch(/void loadPoints\(/)
    expect(mainBody).toMatch(/void loadGames\(/)
  })

  it('四种数据态都有明确文案（未配置 / 未登录 / 未部署 / 失败），不留空白', () => {
    const source = read('src/main.js')
    for (const text of ['积分服务未配置', '登录后可查看积分', '积分功能暂未开放', '积分加载失败']) {
      expect(source, `缺少「${text}」态`).toContain(text)
    }
    // 后端返回 HTML 而非 JSON 时必须与网络失败区分（主域未部署 game-platform 就是这种形态）
    expect(source).toContain('not-json')
  })

  it('点击游戏时向宿主发消息，且 targetOrigin 安全（不写死 *，并处理 tauri:// 的 null）', () => {
    const source = read('src/main.js')
    expect(source).toContain("HOST_OPEN_MESSAGE_TYPE = 'mini-hbut:open-module'")
    expect(source).toContain('window.parent.postMessage')
    expect(source).toContain('resolveTargetOrigin')
    // location.origin 在 tauri:// 下是字符串 'null'，不是合法 targetOrigin → 必须显式回退
    expect(source).toContain("origin === 'null'")
  })

  it('按既定契约向宿主上报内容高度（否则宿主只能退化成固定高度）', () => {
    const source = read('src/main.js')
    expect(source).toContain("HOST_SIZE_MESSAGE_TYPE = 'mini-hbut:module-size'")
    expect(source).toContain('module_id: MODULE_ID')
    // 首帧即上报 + 内容变化/resize 后重报
    expect(source).toMatch(/scheduleSizeReport\(\)/)
    expect(source).toContain("addEventListener('resize', scheduleSizeReport)")
    expect(source).toContain('ResizeObserver')
  })

  it('移动端适配：安全区 + 触控目标下限 + 窄屏网格', () => {
    const css = read('src/style.css')
    // 安全区（刘海/小白条）
    expect(css).toContain('env(safe-area-inset-top)')
    expect(css).toContain('env(safe-area-inset-bottom)')
    // 触控目标下限
    expect(css).toMatch(/\.tile\s*\{[\s\S]*?min-height:\s*88px/)
    // 窄屏自适应网格（auto-fill + 最小宽度，不写死列数）
    expect(css).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(88px,\s*1fr\)\)/)
    // 亮/暗双色
    expect(css).toContain('prefers-color-scheme: dark')
    // 尊重减少动效偏好
    expect(css).toContain('prefers-reduced-motion: reduce')
  })
})
