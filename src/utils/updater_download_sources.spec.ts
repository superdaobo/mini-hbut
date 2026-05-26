import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildDownloadOpenUrls,
  buildUpdateDownloadUrls,
  describeUpdateDownloadSource,
  isOfficialDownloadUrl
} from './updater.js'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('update download sources', () => {
  const tag = 'v1.3.7'
  const filename = 'Mini-HBUT_1.3.7_x64-setup.exe'

  it('orders download lines as ghfast, hk proxy, gh-proxy, then GitHub source', () => {
    const urls = buildUpdateDownloadUrls(
      tag,
      filename,
      `https://hbut.6661111.xyz/releases/${tag}/${filename}`
    )

    expect(urls.some((url) => isOfficialDownloadUrl(url))).toBe(false)
    expect(urls).toEqual([
      `https://ghfast.top/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      `https://hk.gh-proxy.org/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      `https://gh-proxy.com/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      `https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`
    ])
  })

  it('labels proxy URLs as proxies even though they contain github.com in the target URL', () => {
    const ghfast = describeUpdateDownloadSource(
      `https://ghfast.top/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      0
    )
    const hk = describeUpdateDownloadSource(
      `https://hk.gh-proxy.org/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      1
    )
    const ghProxy = describeUpdateDownloadSource(
      `https://gh-proxy.com/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      2
    )
    const github = describeUpdateDownloadSource(
      `https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      3
    )

    expect(ghfast).toEqual({ label: '代理下载 1', tag: 'proxy1' })
    expect(hk).toEqual({ label: '代理下载 2', tag: 'proxy2' })
    expect(ghProxy).toEqual({ label: '代理下载 3', tag: 'proxy3' })
    expect(github).toEqual({ label: 'GitHub 源站', tag: 'github' })
  })

  it('keeps the selected download line instead of rewriting it to the hk proxy', () => {
    const ghfastUrl = `https://ghfast.top/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`

    expect(buildDownloadOpenUrls([ghfastUrl])).toEqual([ghfastUrl])
  })

  it('does not render the removed official download label in the update dialog', () => {
    const source = readSource('src/components/UpdateDialog.vue')

    expect(source).not.toContain('本站下载')
    expect(source).not.toContain('官方下载')
    expect(source).toContain('describeUpdateDownloadSource')
    expect(source).toContain('isOfficialDownloadUrl')
  })

  it('renders the current version on the left and the target version on the right', () => {
    const source = readSource('src/components/UpdateDialog.vue')

    expect(source).toContain('<div class="version-badge current">当前 v{{ currentVersion }}</div>')
    expect(source).toContain('<span class="arrow">→</span>')
    expect(source).toContain('<div class="version-badge new">新版本 v{{ updateInfo.latestVersion }}</div>')
    expect(source).not.toContain('<div class="version-badge new">v{{ updateInfo.latestVersion }}</div>')
  })
})
