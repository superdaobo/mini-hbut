import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

export const CDN_ASSET_DIRS = Object.freeze(['releases', 'modules', 'app-resources'])

const DEFAULT_REPO = 'superdaobo/mini-hbut'
const DEFAULT_BRANCH = 'website-pages'
const DEFAULT_PUBLIC_ROOT = 'website/public'

const safeText = (value) => String(value ?? '').trim()

const ensureDir = (dir) => {
  fs.mkdirSync(dir, { recursive: true })
}

const copyDirContents = (sourceDir, targetDir) => {
  ensureDir(targetDir)
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name)
    const targetPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      copyDirContents(sourcePath, targetPath)
      continue
    }
    if (entry.isFile()) {
      ensureDir(path.dirname(targetPath))
      fs.copyFileSync(sourcePath, targetPath)
    }
  }
}

export const resolveWebsitePagesAssetDir = (checkoutRoot, assetDir) => {
  const normalizedRoot = path.resolve(checkoutRoot)
  const normalizedAsset = safeText(assetDir)
  if (!normalizedAsset) return ''

  const candidates = [
    path.join(normalizedRoot, normalizedAsset),
    path.join(normalizedRoot, 'dist', normalizedAsset)
  ]
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) || ''
}

export const restoreWebsiteCdnAssets = ({
  checkoutRoot,
  publicRoot = DEFAULT_PUBLIC_ROOT,
  assetDirs = CDN_ASSET_DIRS
} = {}) => {
  const resolvedPublicRoot = path.resolve(publicRoot)
  const restored = []

  for (const assetDir of assetDirs) {
    const sourceDir = resolveWebsitePagesAssetDir(checkoutRoot, assetDir)
    if (!sourceDir) {
      console.log(`[cdn-restore] skip missing asset dir: ${assetDir}`)
      continue
    }
    const targetDir = path.join(resolvedPublicRoot, assetDir)
    copyDirContents(sourceDir, targetDir)
    restored.push(assetDir)
    console.log(`[cdn-restore] restored ${assetDir} from ${sourceDir} -> ${targetDir}`)
  }

  return restored
}

const cloneWebsitePages = ({
  repo = process.env.GITHUB_REPOSITORY || DEFAULT_REPO,
  branch = process.env.WEBSITE_PAGES_BRANCH || DEFAULT_BRANCH,
  cloneUrl = process.env.WEBSITE_PAGES_CLONE_URL || ''
} = {}) => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mini-hbut-website-pages-'))
  const remote = safeText(cloneUrl) || `https://github.com/${safeText(repo) || DEFAULT_REPO}.git`
  const targetBranch = safeText(branch) || DEFAULT_BRANCH

  console.log(`[cdn-restore] cloning ${remote}#${targetBranch}`)
  execFileSync('git', ['clone', '--depth', '1', '--branch', targetBranch, remote, tempDir], {
    stdio: 'inherit'
  })
  return tempDir
}

const main = () => {
  const publicRoot = path.resolve(process.env.WEBSITE_PUBLIC_ROOT || DEFAULT_PUBLIC_ROOT)
  const checkoutRoot = safeText(process.env.WEBSITE_PAGES_CHECKOUT_ROOT)

  if (checkoutRoot) {
    restoreWebsiteCdnAssets({ checkoutRoot, publicRoot })
    return
  }

  const tempDir = cloneWebsitePages()
  try {
    restoreWebsiteCdnAssets({ checkoutRoot: tempDir, publicRoot })
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main()
}
