import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  buildUpdateDownloadUrls,
  describeUpdateDownloadSource,
  isOfficialDownloadUrl
} from './updater.js'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('update download sources', () => {
  const tag = 'v1.3.7'
  const filename = 'Mini-HBUT_1.3.7_x64-setup.exe'

  it('removes the official CDN download line while keeping proxy mirrors and GitHub source', () => {
    const urls = buildUpdateDownloadUrls(
      tag,
      filename,
      `https://hbut.6661111.xyz/releases/${tag}/${filename}`
    )

    expect(urls.some((url) => isOfficialDownloadUrl(url))).toBe(false)
    expect(urls).toEqual([
      `https://hk.gh-proxy.org/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      `https://gh-proxy.com/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      `https://ghfast.top/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      `https://ghproxy.net/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      `https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`
    ])
  })

  it('labels proxy URLs as proxies even though they contain github.com in the target URL', () => {
    const source = describeUpdateDownloadSource(
      `https://ghproxy.net/https://github.com/superdaobo/mini-hbut/releases/download/${tag}/${filename}`,
      3
    )

    expect(source).toEqual({ label: '代理下载 4', tag: 'proxy4' })
  })

  it('does not render the removed official download label in the update dialog', () => {
    const source = readSource('src/components/UpdateDialog.vue')

    expect(source).not.toContain('本站下载')
    expect(source).not.toContain('官方下载')
    expect(source).toContain('describeUpdateDownloadSource')
    expect(source).toContain('isOfficialDownloadUrl')
  })
})
