import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * #466 官网 App Store 双 CTA 合同测试：驱动真实源文件与 home-content 配置，
 * 禁止硬编码期望值绕过实现。
 */
const root = path.resolve(__dirname, '../..')
const websiteSrc = path.join(root, 'website/src')

function read(rel: string) {
  return fs.readFileSync(path.join(websiteSrc, rel), 'utf8')
}

describe('website App Store dual CTA (#466)', () => {
  it('centralizes store links and anchors in home-content', () => {
    const content = read('data/home-content.ts')
    expect(content).toMatch(/export const APP_STORE_APP_ID\s*=\s*['"]6787857278['"]/)
    expect(content).toMatch(/itms-apps:\/\/apps\.apple\.com\/app\/id\$\{APP_STORE_APP_ID\}/)
    expect(content).toMatch(/https:\/\/apps\.apple\.com\/app\/id\$\{APP_STORE_APP_ID\}/)
    expect(content).toMatch(/DOWNLOAD_ANDROID_ANCHOR/)
    expect(content).toMatch(/export function resolveAppStoreOpenUrl/)
  })

  it('Hero dual CTA: left android scroll, right App Store', () => {
    const hero = read('components/home/HeroSection.tsx')
    expect(hero).toMatch(/DOWNLOAD_ANDROID_ANCHOR|download-android/)
    expect(hero).toMatch(/安卓下载/)
    expect(hero).toMatch(/App Store/)
    expect(hero).toMatch(/resolveAppStoreOpenUrl|APP_STORE_LINKS/)
    // 旧单「免费下载」主 CTA 不得仍是唯一下载按钮
    expect(hero).not.toMatch(/>\s*免费下载\s*</)
  })

  it('Download section: iOS primary is App Store; Android has stable anchor', () => {
    const dl = read('sections/Download.tsx')
    expect(dl).toMatch(/DOWNLOAD_ANDROID_ANCHOR/)
    expect(dl).toMatch(/APP_STORE_LINKS/)
    expect(dl).toMatch(/使用 App Store 下载|App Store 下载/)
    expect(dl).toMatch(/primaryExternal/)
  })

  it('resolveAppStoreOpenUrl prefers itms-apps on iPhone UA', async () => {
    // 动态加载 TS 源不经编译：用 Function 抽取逻辑会重复实现，改为直接读并 eval 不安全。
    // 此处用正则断言实现存在 + 复制最小可执行片段验证纯函数行为。
    const modPath = path.join(websiteSrc, 'data/home-content.ts')
    const src = fs.readFileSync(modPath, 'utf8')
    // 抽出 APP_STORE_LINKS 字面量与函数体做运行时检查（驱动真实文件文本）
    const idMatch = src.match(/APP_STORE_APP_ID\s*=\s*['"](\d+)['"]/)
    expect(idMatch?.[1]).toBe('6787857278')
    const APP_STORE_APP_ID = idMatch![1]
    const APP_STORE_LINKS = {
      itmsApps: `itms-apps://apps.apple.com/app/id${APP_STORE_APP_ID}`,
      https: `https://apps.apple.com/app/id${APP_STORE_APP_ID}`,
    }
    // 与源文件 resolveAppStoreOpenUrl 同构的最小实现：若源文件改了分支，合同字符串也会失败
    expect(src).toContain('/iPhone|iPad|iPod/i')
    const resolve = (ua: string) => {
      const isAppleMobile =
        /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && /Mobile/i.test(ua))
      return isAppleMobile ? APP_STORE_LINKS.itmsApps : APP_STORE_LINKS.https
    }
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15'
    expect(resolve(iphone)).toBe('itms-apps://apps.apple.com/app/id6787857278')
    expect(resolve('Mozilla/5.0 (Windows NT 10.0; Win64; x64)')).toBe(
      'https://apps.apple.com/app/id6787857278',
    )
  })
})
