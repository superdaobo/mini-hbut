import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 以脚本自身位置解析仓库根；客户端文件统一加 apps/client 前缀（#642）。
// 从 apps/client 的 npm run check:release-config 或仓库根直调均得到一致结果。
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const clientRoot = path.join(repoRoot, 'apps/client')
const readText = (relativePath) => fs.readFileSync(path.join(clientRoot, relativePath), 'utf8')
const readJson = (relativePath) => JSON.parse(readText(relativePath))
const fail = (message) => { throw new Error(`[release-config] ${message}`) }

const packageJson = readJson('package.json')
const tauriConfig = readJson('src-tauri/tauri.conf.json')
const cargoToml = readText('src-tauri/Cargo.toml')
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1]

const expected = '1.4.8'
for (const [label, version] of [
  ['package.json', packageJson.version],
  ['tauri.conf.json', tauriConfig.version],
  ['Cargo.toml', cargoVersion]
]) {
  if (version !== expected) fail(`${label} version ${version || 'missing'} does not match frozen ${expected}`)
}

if (process.env.npm_package_version && process.env.npm_package_version !== expected) {
  fail(`npm package version ${process.env.npm_package_version} does not match ${expected}`)
}

const updaterSource = readText('src/utils/updater.ts') + '\n' + readText('src/utils/updater_sources.ts')
const requiredUpdaterContracts = [
  ["official GitHub repository", "const GITHUB_REPO = 'superdaobo/mini-hbut'"],
  ["EdgeOne HTTPS endpoint", "const EDGEONE_CDN_BASE = 'https://hbut.6661111.xyz'"],
  ["GitHub Pages HTTPS endpoint", "const GITHUB_PAGES_CDN_BASE = 'https://superdaobo.github.io/mini-hbut'"],
  ["stable latest manifest", '`${base}/releases/latest.json`'],
  ["stable fallback manifest", '`${base}/releases/stable-latest.json`'],
  ["stable default channel", "channel: 'stable'"],
  ["stable release channel guard", "channel !== 'main' && channel !== 'stable' && channel !== 'release'"]
]
for (const [label, snippet] of requiredUpdaterContracts) {
  if (!updaterSource.includes(snippet)) fail(`tracked updater is missing ${label}`)
}

console.log(`[release-config] version remains ${expected}; tracked updater defaults and HTTPS stable endpoints are intact; no release mutation requested`)
