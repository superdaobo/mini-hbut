import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const readJson = (relativePath) => JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8'))
const fail = (message) => { throw new Error(`[release-config] ${message}`) }

const packageJson = readJson('package.json')
const tauriConfig = readJson('src-tauri/tauri.conf.json')
const cargoToml = fs.readFileSync(path.join(root, 'src-tauri/Cargo.toml'), 'utf8')
const cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1]

const expected = '1.4.4'
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

const prereleasePattern = /(^|[-._])(alpha|beta|rc|dev|nightly)([-._]|$)/i
const stableManifests = [
  'website/public/releases/stable-latest.json',
  'website/public/releases/latest.json',
  'website/public/releases/active.json'
]
for (const relativePath of stableManifests) {
  const manifest = readJson(relativePath)
  const tag = String(manifest.tag || manifest.version || '').trim()
  if (String(manifest.channel || '').trim().toLowerCase() !== 'main') {
    fail(`${relativePath} must remain on the main channel`)
  }
  if (manifest.prerelease === true || prereleasePattern.test(tag) || tag.toLowerCase() === 'dev-latest') {
    fail(`${relativePath} points to prerelease tag ${tag || 'missing'}`)
  }
}

const channels = readJson('website/public/releases/channels.json')
if (String(channels.activeChannel || '').trim().toLowerCase() !== 'main') {
  fail('channels.json activeChannel must remain main')
}
if (String(channels.latest?.channel || '').trim().toLowerCase() !== 'main') {
  fail('channels.json latest manifest must remain on the main channel')
}

console.log(`[release-config] version remains ${expected}; stable aliases remain on main; no release mutation requested`)
