import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildDownloadOpenUrls,
  buildUpdateDownloadUrls,
  describeUpdateDownloadSource,
  isOfficialDownloadUrl,
  mergeCdnReleaseWithApiNotes,
  normalizeCdnManifestAsRelease
} from './updater.js'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('update download sources', () => {
  const tag = 'v1.3.7'
  const filename = 'Mini-HBUT_1.3.7_x64-setup.exe'

  it('orders download lines as ghfast, v4 gh-proxy, gh-proxy, cdn gh-proxy, then GitHub source', () => {
    const urls = buildUpdateDownloadUrls(
      tag,
      filename,
      `https://hbut.6661111.xyz/releases/${tag}/${filename}`
    )

    expect(urls.some((url) => isOfficialDownloadUrl(url))).toBe(false)
    expect(urls).toEqual([
      `https://ghfast.top/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      `https://v4.gh-proxy.org/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      `https://gh-proxy.org/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      `https://cdn.gh-proxy.org/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      `https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`
    ])
  })

  it('labels proxy URLs as proxies even though they contain github.com in the target URL', () => {
    const ghfast = describeUpdateDownloadSource(
      `https://ghfast.top/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      0
    )
    const v4 = describeUpdateDownloadSource(
      `https://v4.gh-proxy.org/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      1
    )
    const ghProxy = describeUpdateDownloadSource(
      `https://gh-proxy.org/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      2
    )
    const cdnGhProxy = describeUpdateDownloadSource(
      `https://cdn.gh-proxy.org/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      3
    )
    const github = describeUpdateDownloadSource(
      `https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      4
    )

    expect(ghfast).toEqual({ label: '代理下载 1', tag: 'proxy1' })
    expect(v4).toEqual({ label: '代理下载 2', tag: 'proxy2' })
    expect(ghProxy).toEqual({ label: '代理下载 3', tag: 'proxy3' })
    expect(cdnGhProxy).toEqual({ label: '代理下载 4', tag: 'proxy4' })
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

  it('makes the immediate update action visually larger than skipping the version', () => {
    const source = readSource('src/components/UpdateDialog.vue')

    expect(source).toContain('update-action-secondary')
    expect(source).toContain('update-action-primary')
    expect(source).toMatch(/\.dialog-actions\s+\.update-action-secondary\s*{[\s\S]*?flex:\s*0\s+0\s+34%/)
    expect(source).toMatch(/\.dialog-actions\s+\.update-action-primary\s*{[\s\S]*?flex:\s*1\.35/)
  })

  it('rejects stale CDN release notes that belong to an older version', () => {
    const release = normalizeCdnManifestAsRelease({
      version: '1.4.0',
      tag: 'v1.4.0',
      channel: 'main',
      assets: {
        windows_exe: 'Mini-HBUT_1.4.0_x64-setup.exe'
      },
      release_notes: '# Mini-HBUT v1.3.6 更新说明\n\n旧版本日志'
    })

    expect(release?.body).toBe('')
  })

  it('keeps CDN assets while replacing stale release notes with same-version API notes', () => {
    const cdnRelease = normalizeCdnManifestAsRelease({
      version: '1.4.0',
      tag: 'v1.4.0',
      channel: 'main',
      assets: {
        windows_exe: 'Mini-HBUT_1.4.0_x64-setup.exe'
      },
      release_notes: '# Mini-HBUT v1.3.6 更新说明\n\n旧版本日志'
    })
    const merged = mergeCdnReleaseWithApiNotes(cdnRelease, {
      tag_name: 'v1.4.0',
      name: 'v1.4.0',
      body: '# Mini-HBUT v1.4.0 更新说明\n\n新版本日志',
      html_url: 'https://github.com/superdaobo/mini-hbut/releases/tag/v1.4.0',
      published_at: '2026-05-25T00:00:00Z',
      assets: []
    })

    expect(merged.assets[0].browser_download_url).toContain('hbut.6661111.xyz/releases/v1.4.0/')
    expect(merged.body).toContain('v1.4.0')
    expect(merged.body).not.toContain('v1.3.6')
  })

  it('builds version-specific release notes before falling back to release.md', () => {
    const source = readSource('scripts/build_release_manifests.mjs')

    expect(source).toContain('readReleaseNotes(version, tag)')
    expect(source).toContain('RELEASE_v${normalizedVersion}.md')
    expect(source).toContain('release.md')
  })
})
