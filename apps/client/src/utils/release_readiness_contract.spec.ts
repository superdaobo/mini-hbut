import { afterEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

const root = process.cwd()
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const temporaryDirectories: string[] = []
const frozenVersion = read('../../scripts/verify_release_config.mjs').match(/const expected = '([^']+)'/)?.[1]

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 })
  }
})

describe('release readiness gates', () => {
  it('publishes unified check commands and keeps all app versions synchronized', () => {
    const packageJson = JSON.parse(read('package.json'))
    const tauriConfig = JSON.parse(read('src-tauri/tauri.conf.json'))
    const cargoToml = read('src-tauri/Cargo.toml')
    const packageLock = JSON.parse(read('package-lock.json'))
    expect(frozenVersion).toMatch(/^\d+\.\d+\.\d+$/)
    expect(packageJson.version).toBe(frozenVersion)
    expect(packageLock.version).toBe(frozenVersion)
    expect(packageLock.packages[''].version).toBe(frozenVersion)
    expect(tauriConfig.version).toBe(frozenVersion)
    expect(cargoToml).toContain(`version = "${frozenVersion}"`)
    expect(packageJson.scripts['check:all']).toBe('node ../../scripts/check_all.mjs')
    expect(packageJson.scripts['check:release']).toBe(
      'node ../../scripts/check_release.mjs && node scripts/check_god_files.mjs --strict'
    )
    expect(packageJson.scripts['check:release-config']).toBe('node ../../scripts/verify_release_config.mjs')
    const releaseConfig = read('../../scripts/verify_release_config.mjs')
    expect(releaseConfig).toContain('src/utils/updater.ts')
    expect(releaseConfig).toContain("channel: 'stable'")
    expect(releaseConfig).toContain('/releases/latest.json')
    expect(releaseConfig).toContain('/releases/stable-latest.json')
    expect(releaseConfig).toContain('https://hbut.6661111.xyz')
    expect(releaseConfig).toContain('https://superdaobo.github.io/mini-hbut')
    expect(releaseConfig).not.toContain('website/public/releases/')
    const releaseScript = read('../../release.py')
    expect(releaseScript).toContain('package-lock.json')
    expect(releaseScript).toContain('src-tauri/Cargo.lock')
    expect(releaseScript).toContain('verify_release_config.mjs')
    expect(releaseScript).toContain('".reasonix"')
  })

  it('bounds dist cleanup instead of sleeping through every stale directory', () => {
    const source = read('scripts/prepare_dist.mjs')
    expect(source).not.toContain('Atomics.wait')
    expect(source).not.toContain('MAX_RETRIES = 10')
    expect(source).not.toContain('RETRY_DELAY_MS = 3000')
    expect(source).toContain('maxRetries: 1')

    const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-dist-contract-'))
    temporaryDirectories.push(temporaryRoot)
    fs.mkdirSync(path.join(temporaryRoot, 'dist'), { recursive: true })
    fs.writeFileSync(path.join(temporaryRoot, 'dist', 'index.html'), 'stale')
    for (let index = 0; index < 20; index += 1) {
      const trash = path.join(temporaryRoot, `.dist-trash-${index}`)
      fs.mkdirSync(trash)
      fs.writeFileSync(path.join(trash, 'stale.txt'), 'stale')
    }

    const startedAt = Date.now()
    const result = spawnSync(process.execPath, [path.join(root, 'scripts/prepare_dist.mjs')], {
      cwd: temporaryRoot,
      encoding: 'utf8',
      timeout: 5000,
      shell: false
    })
    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(Date.now() - startedAt).toBeLessThan(5000)
    expect(fs.existsSync(path.join(temporaryRoot, 'dist'))).toBe(false)
  })

  it('uses fail-fast cross-platform process execution and forbids Rust skipping in CI', () => {
    const runner = read('../../scripts/check_runner.mjs')
    const all = read('../../scripts/check_all.mjs')
    const release = read('../../scripts/check_release.mjs')
    expect(runner).toContain("shell: false")
    expect(runner).toContain('timeout: timeoutMs')
    expect(runner).toContain("if (skip && process.env.CI)")
    expect(all).toContain("args: ['test', '--manifest-path', 'src-tauri/Cargo.toml', '--lib']")
    expect(all).toContain('guard_sensitive_uploads.mjs')
    expect(release).toContain("['run', 'check:all']")
    expect(release).toContain("['check', '--release'")
    expect(release).toContain("['run', 'audit:dependencies']")
  })

  it('runs the full release gate in CI with read-only repository permissions', () => {
    const workflow = read('../../.github/workflows/release-readiness.yml')
    expect(workflow).toContain('contents: read')
    expect(workflow).toContain('npm run check:release')
    expect(workflow).toContain('components: rustfmt, clippy')
    expect(workflow).not.toContain('CHECK_SKIP_RUST')
    expect(workflow).not.toMatch(/create-release|softprops\/action-gh-release|tauri-action/)
  })
})
