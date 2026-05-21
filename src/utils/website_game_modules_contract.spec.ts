import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DEFAULT_MODULE_CENTER, buildModuleCenterCards } from './module_center'
import { resolveModuleHostPreviewSource } from './more_modules'

const repoRoot = process.cwd()
const modulesRoot = path.join(repoRoot, 'website', 'modules-src')

const readText = (filePath: string) => fs.readFileSync(filePath, 'utf8')
const readJson = <T = Record<string, unknown>>(filePath: string): T =>
  JSON.parse(readText(filePath)) as T

const listSourceModules = () =>
  fs
    .readdirSync(modulesRoot, { withFileTypes: true })
    .filter((item) => item.isDirectory())
    .map((item) => item.name)
    .filter((name) => fs.existsSync(path.join(modulesRoot, name, 'module.json')))

type SourceModule = {
  dirName: string
  id: string
  name: string
  entry_path?: string
  source_dir?: string
  disabled?: boolean
  order?: number
}

const loadSourceModules = () =>
  listSourceModules().map((dirName) => ({
    dirName,
    ...readJson<SourceModule>(path.join(modulesRoot, dirName, 'module.json'))
  }))

const enabledModules = () => loadSourceModules().filter((item) => item.disabled !== true)
const gameModuleIds = [
  'hecheng_hugongda',
  'jump_out_hbut',
  'hbut_2048',
  'clumsy_bird_hbut',
  'hbut_monopoly',
  'hbut_miner',
  'hbut_memory_match'
]
const embeddedMobileGameIds = [
  'jump_out_hbut',
  'clumsy_bird_hbut',
  'hbut_monopoly',
  'hbut_miner',
  'hbut_memory_match'
]

const modulePath = (moduleId: string, ...segments: string[]) =>
  path.join(modulesRoot, moduleId, ...segments)

describe('website 游戏模块集成契约', () => {
  it('源码模块元数据能被模块中心发现，并生成稳定 manifest 地址', () => {
    const sourceModules = enabledModules()
    const sourceIds = sourceModules.map((item) => item.id)
    const centerCards = buildModuleCenterCards({
      channel: 'main',
      catalogModules: sourceModules.map((item) => ({
        id: item.id,
        name: item.name,
        manifest_url: `https://example.com/modules/main/${item.id}/manifest.json`,
        key_required: false,
        order: item.order || 999
      }))
    })

    for (const id of gameModuleIds) {
      expect(sourceIds).toContain(id)
      const card = centerCards.find((item) => item.id === id)
      expect(card, `模块中心缺少 ${id}`).toBeTruthy()
      expect(card?.kind).toBe('remote')
      expect(card?.manifest_url).toBe(`https://example.com/modules/main/${id}/manifest.json`)
    }

    expect(DEFAULT_MODULE_CENTER.modules.map((item) => item.id)).toEqual(
      expect.arrayContaining(gameModuleIds)
    )
  })

  it('每个启用模块都有可构建入口，并使用相对资源 base 适配 Tauri/离线包', () => {
    for (const mod of enabledModules()) {
      expect(mod.dirName).toBe(mod.id)
      expect(mod.entry_path || 'index.html').toBe('index.html')
      expect(mod.source_dir || 'project').toBe('project')

      const projectRoot = modulePath(mod.id, mod.source_dir || 'project')
      const entryPath = path.join(projectRoot, mod.entry_path || 'index.html')
      const packagePath = path.join(projectRoot, 'package.json')
      const viteConfigPath = path.join(projectRoot, 'vite.config.js')

      expect(fs.existsSync(entryPath), `${mod.id} 缺少入口 HTML`).toBe(true)
      expect(fs.existsSync(packagePath), `${mod.id} 缺少 package.json`).toBe(true)
      expect(fs.existsSync(viteConfigPath), `${mod.id} 缺少 vite.config.js`).toBe(true)

      const packageJson = readJson<{ scripts?: Record<string, string> }>(packagePath)
      expect(packageJson.scripts?.build, `${mod.id} 缺少 build 脚本`).toBeTruthy()
      expect(readText(viteConfigPath), `${mod.id} 需要 base: './' 才能被 bundle/iframe 加载`).toMatch(
        /base:\s*['"]\.\/['"]/
      )
    }
  })

  it('重点竖屏游戏入口声明 iOS 安全区和不可缩放 viewport 契约', () => {
    for (const id of embeddedMobileGameIds) {
      const html = readText(modulePath(id, 'project', 'index.html'))
      const viewport = html.match(/<meta\s+name=["']viewport["']\s+content=["']([^"']+)["']/i)?.[1] || ''

      expect(viewport, `${id} 缺少 viewport meta`).toContain('width=device-width')
      expect(viewport, `${id} 需要锁定初始缩放`).toContain('initial-scale=1.0')
      expect(viewport, `${id} 需要禁用双击缩放以保证游戏触控稳定`).toMatch(/user-scalable=no/)
      expect(viewport, `${id} 需要声明 viewport-fit=cover 以适配 iOS 安全区嵌入`).toContain(
        'viewport-fit=cover'
      )
    }
  })

  it('重点竖屏游戏页面向宿主上报高度，并声明动态视口和安全区样式契约', () => {
    for (const id of embeddedMobileGameIds) {
      const mainSource = readText(modulePath(id, 'project', 'src', 'main.js'))
      const styleSource = readText(modulePath(id, 'project', 'src', 'style.css'))

      expect(mainSource, `${id} 需要向宿主上报 iframe 内容高度`).toContain(
        'mini-hbut:module-size'
      )
      expect(mainSource, `${id} 需要声明稳定模块 ID`).toContain(`MODULE_ID = '${id}'`)
      expect(mainSource, `${id} 需要携带 module_id 供宿主校验消息来源`).toContain(
        'module_id: MODULE_ID'
      )
      expect(mainSource, `${id} 需要设置动态视口变量以适配 iOS/移动端地址栏变化`).toContain(
        '--module-vh'
      )
      expect(mainSource, `${id} 需要在横竖屏变化后重新同步尺寸`).toContain(
        'orientationchange'
      )

      expect(styleSource, `${id} 根样式需要使用动态视口高度`).toContain('--module-vh')
      expect(styleSource, `${id} 需要声明 iOS 安全区变量`).toMatch(
        /env\(safe-area-inset-bottom/
      )
      expect(styleSource, `${id} 需要禁止页面级横向溢出`).toContain('overflow-x: hidden')
      expect(styleSource, `${id} 需要隔离触控滚动，保证游戏手势可用`).toContain(
        'overscroll-behavior'
      )
    }
  })

  it('宿主 iframe 使用安全嵌入约束，并能从 manifest 推导远端 open_url', () => {
    const hostSource = readText(path.join(repoRoot, 'src', 'components', 'MoreModuleHostView.vue'))
    expect(hostSource).toContain('<iframe')
    expect(hostSource).toContain('referrerpolicy="no-referrer-when-downgrade"')
    expect(hostSource).toContain('loading="eager"')
    expect(hostSource).toContain('mini-hbut:module-size')
    expect(hostSource).toContain('env(safe-area-inset-bottom)')

    const resolved = resolveModuleHostPreviewSource(
      {
        module_id: 'jump_out_hbut',
        channel: 'main',
        version: '20260521171353-local',
        entry_path: 'index.html',
        manifest_url: 'https://hbut.6661111.xyz/modules/main/jump_out_hbut/manifest.json',
        package_url:
          'https://hbut.6661111.xyz/modules/main/jump_out_hbut/20260521171353-local/bundle.zip'
      },
      { localState: null }
    )

    expect(resolved.sourceKind).toBe('remote-site')
    expect(resolved.resolvedPreviewUrl).toBe(
      'https://hbut.6661111.xyz/modules/main/jump_out_hbut/20260521171353-local/site/index.html'
    )
    expect(resolved.entryPath).toBe('index.html')
  })
})
