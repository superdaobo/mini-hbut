import { afterEach, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readAppContractSources } from './contract_source_test'
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

  it('does not offer a same-core stable release to a rolling beta install', () => {
    const stable145 = {
      tag_name: 'v1.4.5',
      version: '1.4.5',
      prerelease: false,
      channel: 'main'
    }
    const stable146 = { ...stable145, tag_name: 'v1.4.6', version: '1.4.6' }

    expect(shouldOfferRelease(stable145, '1.4.5-beta.363', 'stable')).toBe(false)
    expect(shouldOfferRelease(stable146, '1.4.5-beta.363', 'stable')).toBe(true)
    expect(shouldOfferRelease(stable145, '1.4.4-beta.999', 'stable')).toBe(true)
    expect(shouldOfferRelease(stable146, '1.4.5', 'stable')).toBe(true)
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

  it('numbers dev betas as latest-stable patch+1 and still offers safe upgrades (#683)', () => {
    const beta147 = {
      tag_name: 'dev-latest',
      version: '1.4.7-beta.1',
      prerelease: true,
      channel: 'dev'
    }
    const stable147 = { tag_name: 'v1.4.7', version: '1.4.7', prerelease: false, channel: 'main' }

    // 正式版 1.4.6 存续期，测试版编号为 1.4.7-beta.N（patch+1）：正式用户开 dev 可直升
    expect(shouldOfferRelease(beta147, '1.4.6', 'dev')).toBe(true)
    // stable 频道不受影响：1.4.6 → 1.4.7 正常提示
    expect(shouldOfferRelease(stable147, '1.4.6', 'stable')).toBe(true)
    // 同核心保守规则保留：1.4.7-beta.N 不被 1.4.7 正式拉回（决策点②）
    expect(shouldOfferRelease(stable147, '1.4.7-beta.10', 'stable')).toBe(false)
    // 防「降级」：更高 core 的装机不被低 core 的正式/beta 提示
    expect(shouldOfferRelease(stable147, '1.4.8-beta.1', 'stable')).toBe(false)
    expect(
      shouldOfferRelease({ ...beta147, version: '1.4.7-beta.9' }, '1.4.8-beta.1', 'dev')
    ).toBe(false)
    // 同核心 beta 号递增提示、回退不提示
    expect(
      shouldOfferRelease({ ...beta147, version: '1.4.7-beta.11' }, '1.4.7-beta.10', 'dev')
    ).toBe(true)
    expect(shouldOfferRelease(beta147, '1.4.7-beta.2', 'dev')).toBe(false)
    // 存量旧编号 1.4.6-beta.* 可自然迁移到新编号 1.4.7-beta.*
    expect(shouldOfferRelease(beta147, '1.4.6-beta.358', 'dev')).toBe(true)
  })

  it('dev-build workflow derives beta base version as patch+1 (#683)', () => {
    const workflow = readSource('../../.github/workflows/dev-build.yml')
    expect(workflow).toContain('def bump_patch')
    expect(workflow).toContain('print(bump_patch(base_version or current_version')
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
    const updater = readSource('src/utils/updater.ts')
    expect(updater).toContain('getNativeAppVersion')
    // 原生优先：先 await native，再 VITE_APP_VERSION
    const nativeIdx = updater.indexOf('const native = await getNativeAppVersion()')
    const viteIdx = updater.indexOf('import.meta.env.VITE_APP_VERSION')
    expect(nativeIdx).toBeGreaterThan(-1)
    expect(viteIdx).toBeGreaterThan(nativeIdx)
  })

  it('dev-build stamps beta marketing version before platform builds', () => {
    const workflow = readSource('../../.github/workflows/dev-build.yml')
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
    const app = readAppContractSources()
    const updater = readSource('src/utils/updater.ts') + '\n' + readSource('src/utils/updater_sources.ts')

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
    // 正式版优先 latest.json（短缓存），再回落 stable-latest，并带 cache-bust
    expect(updater).toContain('/releases/latest.json')
    expect(updater).toContain('/releases/stable-latest.json')
    expect(updater).toContain('withManifestCacheBust')
    expect(updater).toContain('hbu_update_channel')
    expect(updater).toContain('fetchDevReleaseInfo')
    expect(updater).toContain('app.zip')
    expect(updater).toContain('preferDevZip')
    expect(updater).toContain('isCurrentInstallDev')
  })
})
