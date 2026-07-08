import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  CDN_ASSET_DIRS,
  resolveWebsitePagesAssetDir,
  restoreWebsiteCdnAssets
} from '../../scripts/restore_website_cdn_assets.mjs'

const tempDirs: string[] = []

const makeTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdn-restore-spec-'))
  tempDirs.push(dir)
  return dir
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe('restore_website_cdn_assets', () => {
  it('resolves asset directories from website-pages root and dist fallback', () => {
    const root = makeTempDir()
    const releasesRoot = path.join(root, 'releases')
    const modulesDist = path.join(root, 'dist', 'modules')
    fs.mkdirSync(path.join(releasesRoot, 'v1.0.0'), { recursive: true })
    fs.mkdirSync(path.join(modulesDist, 'main'), { recursive: true })

    expect(resolveWebsitePagesAssetDir(root, 'releases')).toBe(releasesRoot)
    expect(resolveWebsitePagesAssetDir(root, 'modules')).toBe(modulesDist)
    expect(resolveWebsitePagesAssetDir(root, 'missing')).toBe('')
  })

  it('merges releases/modules/app-resources into website/public without deleting unrelated files', () => {
    const checkoutRoot = makeTempDir()
    const publicRoot = makeTempDir()

    fs.mkdirSync(path.join(checkoutRoot, 'releases'), { recursive: true })
    fs.writeFileSync(
      path.join(checkoutRoot, 'releases', 'stable-latest.json'),
      '{"channel":"main"}\n'
    )
    fs.mkdirSync(path.join(checkoutRoot, 'modules', 'main', 'jump_out_hbut', 'old-version'), {
      recursive: true
    })
    fs.writeFileSync(
      path.join(checkoutRoot, 'modules', 'main', 'jump_out_hbut', 'old-version', 'bundle.zip'),
      'zip'
    )
    fs.mkdirSync(path.join(checkoutRoot, 'app-resources', 'dormitory'), { recursive: true })
    fs.writeFileSync(
      path.join(checkoutRoot, 'app-resources', 'dormitory', 'manifest.json'),
      '{"resource":"dormitory_data"}\n'
    )
    fs.mkdirSync(path.join(publicRoot, 'images'), { recursive: true })
    fs.writeFileSync(path.join(publicRoot, 'images', 'logo.txt'), 'keep')

    const restored = restoreWebsiteCdnAssets({ checkoutRoot, publicRoot, assetDirs: CDN_ASSET_DIRS })

    expect(restored).toEqual(['releases', 'modules', 'app-resources'])
    expect(fs.readFileSync(path.join(publicRoot, 'releases', 'stable-latest.json'), 'utf8')).toContain(
      '"channel":"main"'
    )
    expect(
      fs.existsSync(
        path.join(publicRoot, 'modules', 'main', 'jump_out_hbut', 'old-version', 'bundle.zip')
      )
    ).toBe(true)
    expect(fs.readFileSync(path.join(publicRoot, 'images', 'logo.txt'), 'utf8')).toBe('keep')
  })
})
