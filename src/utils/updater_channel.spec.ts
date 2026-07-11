import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  buildUpdateDownloadUrls,
  getSkippedVersionKey,
  getUpdateChannel,
  isCurrentInstallDev,
  isDevRelease,
  normalizeCdnManifestAsRelease,
  normalizeUpdateChannel,
  setUpdateChannel,
  shouldOfferRelease
} from './updater.js'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('update channel (stable / dev)', () => {
  afterEach(() => {
    setUpdateChannel('stable')
    try {
      localStorage?.removeItem?.('hbu_update_channel')
      localStorage?.removeItem?.('hbu_skipped_version')
      localStorage?.removeItem?.('hbu_skipped_version_dev')
    } catch {
      // ignore
    }
  })

  it('defaults channel to stable and normalizes aliases', () => {
    setUpdateChannel('stable')
    expect(normalizeUpdateChannel('')).toBe('stable')
    expect(normalizeUpdateChannel('stable')).toBe('stable')
    expect(normalizeUpdateChannel('dev')).toBe('dev')
    expect(normalizeUpdateChannel('beta')).toBe('dev')
    expect(getUpdateChannel()).toBe('stable')
    expect(setUpdateChannel('dev')).toBe('dev')
    expect(getUpdateChannel()).toBe('dev')
    expect(getSkippedVersionKey('stable')).toBe('hbu_skipped_version')
    expect(getSkippedVersionKey('dev')).toBe('hbu_skipped_version_dev')
  })

  it('normalizes CDN dev-latest manifest for beta assets', () => {
    const release = normalizeCdnManifestAsRelease({
      version: '1.4.3-beta.29136065697',
      tag: 'dev-latest',
      downloadDir: 'dev-latest',
      prerelease: true,
      channel: 'dev',
      assets: {
        android_apk: 'Mini-HBUT_1.4.3-beta.29136065697_arm64.apk',
        windows_exe: 'Mini-HBUT_1.4.3-beta.29136065697_x64-setup.exe'
      }
    })
    expect(release).toBeTruthy()
    expect(release?.tag_name).toBe('dev-latest')
    expect(release?.channel).toBe('dev')
    expect(release?.prerelease).toBe(true)
    expect(release?.downloadDir).toBe('dev-latest')
    expect(isDevRelease(release)).toBe(true)
    expect(release?.assets?.[0]?.browser_download_url).toContain(
      '/releases/dev-latest/Mini-HBUT_1.4.3-beta.29136065697_arm64.apk'
    )
  })

  it('offers stable only for real stable upgrades', () => {
    const stable = {
      tag_name: 'v1.4.4',
      version: '1.4.4',
      prerelease: false,
      channel: 'main'
    }
    const beta = {
      tag_name: 'dev-latest',
      version: '1.4.3-beta.9',
      prerelease: true,
      channel: 'dev'
    }
    expect(shouldOfferRelease(stable, '1.4.3', 'stable')).toBe(true)
    expect(shouldOfferRelease(beta, '1.4.3', 'stable')).toBe(false)
    expect(shouldOfferRelease(stable, '1.4.4', 'stable')).toBe(false)
  })

  it('offers dev builds when user opts into beta channel', () => {
    const beta = {
      tag_name: 'dev-latest',
      version: '1.4.3-beta.29136065697',
      prerelease: true,
      channel: 'dev'
    }
    // 用户装正式 1.4.3，主动开 dev 时可升到同 core 的更新 beta
    expect(shouldOfferRelease(beta, '1.4.3', 'dev')).toBe(true)
    // 已是同一 beta 则不提示
    expect(shouldOfferRelease(beta, '1.4.3-beta.29136065697', 'dev')).toBe(false)
    // 当前 core 更新则不降级提示
    expect(shouldOfferRelease(beta, '1.4.4', 'dev')).toBe(false)
    // 更新的 beta 应提示
    expect(
      shouldOfferRelease(
        { ...beta, version: '1.4.3-beta.29136065698' },
        '1.4.3-beta.29136065697',
        'dev'
      )
    ).toBe(true)
  })

  it('builds download proxies for dev-latest tag', () => {
    const name = 'Mini-HBUT_1.4.3-beta.1_arm64.apk'
    const urls = buildUpdateDownloadUrls('dev-latest', name)
    expect(urls[0]).toContain('/releases/download/dev-latest/')
    expect(urls.some((u) => u.includes('github.com/superdaobo/mini-hbut/releases/download/dev-latest/'))).toBe(
      true
    )
  })

  it('detects current install identity from version string', () => {
    expect(isCurrentInstallDev('1.4.3')).toBe(false)
    expect(isCurrentInstallDev('1.4.3-beta.1')).toBe(true)
    expect(isCurrentInstallDev('v1.4.3-dev.2')).toBe(true)
    expect(isCurrentInstallDev('1.4.3-rc.1')).toBe(true)
    expect(isCurrentInstallDev('')).toBe(false)
  })

  it('prefers native package version over Vite inject in getCurrentVersion', () => {
    const updater = readSource('src/utils/updater.js')
    expect(updater).toContain('getNativeAppVersion')
    // 原生优先：先 await native，再 VITE_APP_VERSION
    const nativeIdx = updater.indexOf('const native = await getNativeAppVersion()')
    const viteIdx = updater.indexOf('import.meta.env.VITE_APP_VERSION')
    expect(nativeIdx).toBeGreaterThan(-1)
    expect(viteIdx).toBeGreaterThan(nativeIdx)
  })

  it('dev-build stamps beta marketing version before platform builds', () => {
    const workflow = readSource('.github/workflows/dev-build.yml')
    const stampScript = readSource('scripts/ci/stamp_app_version.mjs')
    expect(stampScript).toContain('stampWorkspaceFiles')
    expect(stampScript).toContain('package.json')
    expect(stampScript).toContain('tauri.conf.json')
    expect(stampScript).toContain('Cargo.toml')
    // 每个平台构建 job 都应 stamp，避免仅改文件名
    const stampMatches = workflow.match(/stamp_app_version\.mjs/g) || []
    expect(stampMatches.length).toBeGreaterThanOrEqual(5)
    expect(workflow).toContain('MARKETING_VERSION="${BETA_VERSION}"')
    expect(workflow).toContain('CFBundleShortVersionString')
  })

  it('wires UpdateDialog channel toggle and App autoCheck channel options', () => {
    const dialog = readSource('src/components/UpdateDialog.vue')
    const app = readSource('src/App.vue')
    const updater = readSource('src/utils/updater.js')

    expect(dialog).toContain('接收开发版更新（Beta）')
    expect(dialog).toContain('setUpdateChannel')
    expect(dialog).toContain('setSkippedVersion')
    expect(dialog).toContain('getUpdateChannel')
    expect(dialog).toContain('dev-latest')
    expect(dialog).toContain('handleChannelToggle')
    expect(dialog).toContain('isCurrentInstallDev')
    expect(dialog).toContain('当前安装')
    expect(dialog).toContain('currentVersionLabel')
    expect(app).toContain('checkForUpdates(currentVersion, { channel })')
    expect(app).toContain('getSkippedVersion')
    expect(updater).toContain('DEV_MANIFEST_URL')
    expect(updater).toContain('dev-latest.json')
    expect(updater).toContain('hbu_update_channel')
    expect(updater).toContain('fetchDevReleaseInfo')
    expect(updater).toContain('app.zip')
    expect(updater).toContain('preferDevZip')
    expect(updater).toContain('isCurrentInstallDev')
  })
})
