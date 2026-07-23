import { describe, expect, it } from 'vitest'
import {
  APP_STORE_APP_ID,
  APP_STORE_LINKS,
  DOWNLOAD_ANDROID_ANCHOR,
  DOWNLOAD_IOS_ANCHOR,
  resolveAppStoreOpenUrl,
} from './home-content'

describe('App Store download links (#466)', () => {
  it('centralizes App Store id and official URLs', () => {
    expect(APP_STORE_APP_ID).toBe('6787857278')
    expect(APP_STORE_LINKS.itmsApps).toBe('itms-apps://apps.apple.com/app/id6787857278')
    expect(APP_STORE_LINKS.https).toBe('https://apps.apple.com/app/id6787857278')
    expect(APP_STORE_LINKS.testFlight).toContain(APP_STORE_APP_ID)
    expect(DOWNLOAD_ANDROID_ANCHOR).toBe('download-android')
    expect(DOWNLOAD_IOS_ANCHOR).toBe('download-ios')
  })

  it('prefers itms-apps on iPhone Safari UA and https elsewhere', () => {
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    const desktop =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    expect(resolveAppStoreOpenUrl(iphone)).toBe(APP_STORE_LINKS.itmsApps)
    expect(resolveAppStoreOpenUrl(desktop)).toBe(APP_STORE_LINKS.https)
    expect(resolveAppStoreOpenUrl('')).toBe(APP_STORE_LINKS.https)
  })

  it('Hero dual-CTA source files wire left android anchor and right App Store', async () => {
    const fs = await import('node:fs')
    const path = await import('node:path')
    const root = path.resolve(__dirname, '..')
    const hero = fs.readFileSync(path.join(root, 'components/home/HeroSection.tsx'), 'utf8')
    const download = fs.readFileSync(path.join(root, 'sections/Download.tsx'), 'utf8')
    expect(hero).toMatch(/download-android|DOWNLOAD_ANDROID_ANCHOR/)
    expect(hero).toMatch(/App Store|APP_STORE_LINKS|resolveAppStoreOpenUrl/)
    expect(hero).toMatch(/安卓下载/)
    expect(download).toMatch(/id=\"download-android\"|DOWNLOAD_ANDROID_ANCHOR/)
    expect(download).toMatch(/APP_STORE_LINKS|apps\.apple\.com/)
  })
})
