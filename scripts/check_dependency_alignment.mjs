import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 以脚本自身位置解析仓库根，保证从仓库根或 apps/client 调用结果一致（#642）
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const clientRoot = path.join(repoRoot, 'apps/client')
const root = clientRoot
const fail = (message) => {
  throw new Error(`[dependency-alignment] ${message}`)
}
// 支持绝对路径（website/modules 锁文件位于仓库根下，不在 clientRoot 内）
const readJson = (target) =>
  JSON.parse(fs.readFileSync(path.isAbsolute(target) ? target : path.join(root, target), 'utf8'))
const parseVersion = (value) => {
  const match = String(value || '').match(/(\d+)\.(\d+)\.(\d+)/)
  if (!match) fail(`invalid semantic version: ${value}`)
  return match.slice(1).map(Number)
}
const compare = (left, right) => {
  const a = parseVersion(left)
  const b = parseVersion(right)
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index]
  }
  return 0
}
const assertAtLeast = (value, minimum, label) => {
  if (compare(value, minimum) < 0) fail(`${label} ${value} is below ${minimum}`)
}
const packageVersions = (lock, packageName) => {
  const suffix = `node_modules/${packageName}`
  return Object.entries(lock.packages || {})
    .filter(([key, value]) => value?.version && (key === suffix || key.endsWith(`/${suffix}`)))
    .map(([, value]) => value.version)
}
const assertLocked = (lock, packageName, expected, label) => {
  const versions = packageVersions(lock, packageName)
  if (!versions.includes(expected)) {
    fail(`${label} expects ${packageName}@${expected}, lock has ${versions.join(', ') || 'none'}`)
  }
}
const assertSafeBraceExpansion = (version, label) => {
  const [major] = parseVersion(version)
  const minimum = major === 1 ? '1.1.17' : major === 2 ? '2.1.3' : major >= 4 ? '5.0.8' : null
  if (minimum) assertAtLeast(version, minimum, label)
}
const assertNpmLockSafe = (relativePath, options = {}) => {
  const lock = readJson(relativePath)
  for (const version of packageVersions(lock, 'postcss')) {
    assertAtLeast(version, '8.5.18', `${relativePath} postcss`)
  }
  for (const version of packageVersions(lock, 'brace-expansion')) {
    assertSafeBraceExpansion(version, `${relativePath} brace-expansion`)
  }
  for (const version of packageVersions(lock, 'picomatch').filter((value) => parseVersion(value)[0] === 4)) {
    assertAtLeast(version, '4.0.4', `${relativePath} picomatch`)
  }
  if (options.website) {
    for (const version of packageVersions(lock, 'sharp')) {
      assertAtLeast(version, '0.35.0', `${relativePath} sharp`)
    }
  }
  return lock
}

const rootPackage = readJson('package.json')
const rootLock = assertNpmLockSafe('package-lock.json')
const capacitorPackages = ['@capacitor/core', '@capacitor/android', '@capacitor/ios']
for (const name of capacitorPackages) {
  if (rootPackage.dependencies?.[name] !== '6.2.1') fail(`${name} must be pinned to 6.2.1`)
  assertLocked(rootLock, name, '6.2.1', 'root')
}
if (rootPackage.devDependencies?.['@capacitor/cli'] !== '6.2.1') fail('@capacitor/cli must match runtime 6.2.1')
assertLocked(rootLock, '@capacitor/cli', '6.2.1', 'root')
if (rootPackage.overrides?.['@capacitor/cli']?.tar !== '7.5.22') fail('Capacitor 6 CLI must override tar to patched 7.5.22')
assertLocked(rootLock, 'tar', '7.5.22', 'root')
if (rootPackage.dependencies?.['@tauri-apps/api'] !== '2.11.1') fail('@tauri-apps/api must be pinned to 2.11.1')
if (rootPackage.devDependencies?.['@tauri-apps/cli'] !== '2.11.4') fail('@tauri-apps/cli must be pinned to 2.11.4')
assertLocked(rootLock, '@tauri-apps/api', '2.11.1', 'root')
assertLocked(rootLock, '@tauri-apps/cli', '2.11.4', 'root')
for (const version of packageVersions(rootLock, 'vite')) assertAtLeast(version, '6.4.3', 'root vite')
for (const version of packageVersions(rootLock, 'rollup')) assertAtLeast(version, '4.59.0', 'root rollup')

assertNpmLockSafe(path.join(repoRoot, 'website/package-lock.json'), { website: true })
const moduleLocks = fs.readdirSync(path.join(repoRoot, 'website/modules-src'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(repoRoot, `website/modules-src/${entry.name}/project/package-lock.json`))
  .filter((absolutePath) => fs.existsSync(absolutePath))
for (const absolutePath of moduleLocks) assertNpmLockSafe(absolutePath)

// 客户端 Rust 锁文件（apps/client/src-tauri/Cargo.lock）
const cargoLock = fs.readFileSync(path.join(root, 'src-tauri/Cargo.lock'), 'utf8')
if (!/name = "rqrr"\s+version = "0\.10\.1"/s.test(cargoLock)) fail('Cargo.lock must use rqrr 0.10.1')
if (!/name = "lru"\s+version = "0\.16\.[3-9]"/s.test(cargoLock)) fail('Cargo.lock must use patched lru >=0.16.3')
if (/name = "rand"\s+version = "0\.9\.2"/s.test(cargoLock)) fail('Cargo.lock still contains vulnerable rand 0.9.2')
if (!/name = "rand"\s+version = "0\.9\.3"/s.test(cargoLock)) fail('Cargo.lock must contain rand 0.9.3')

console.log(`[dependency-alignment] passed: root, website, ${moduleLocks.length} module locks, Cargo.lock`)
