import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// 以脚本自身位置解析仓库根，保证从仓库根或 apps/client 调用结果一致（#642）
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cargo = process.platform === 'win32' ? 'cargo.exe' : 'cargo'
const result = spawnSync(cargo, [
  'metadata',
  '--manifest-path',
  path.join(root, 'apps/client/src-tauri', 'Cargo.toml'),
  '--format-version',
  '1',
  '--all-features',
  '--locked'
], {
  cwd: root,
  encoding: 'utf8',
  shell: false,
  timeout: 120_000,
  maxBuffer: 64 * 1024 * 1024,
  windowsHide: true
})

if (result.error) throw result.error
if (result.status !== 0) {
  throw new Error(`[rustsec-acceptance] cargo metadata failed (${result.status})\n${result.stdout}\n${result.stderr}`)
}

const metadata = JSON.parse(result.stdout)
const packagesById = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]))
const packageKey = (pkg) => `${pkg.name}@${pkg.version}`
const fail = (message) => { throw new Error(`[rustsec-acceptance] ${message}`) }

function findPackage(name, version) {
  return metadata.packages.find((pkg) => pkg.name === name && pkg.version === version)
}

function requirePackage(name, version, reason) {
  const pkg = findPackage(name, version)
  if (!pkg) fail(`${reason}: expected ${name}@${version}`)
  return pkg
}

function forbidPackage(name, version, reason) {
  if (findPackage(name, version)) fail(`${reason}: forbidden ${name}@${version} is still resolved`)
}

function immediateParents(childId) {
  const parents = []
  for (const node of metadata.resolve.nodes) {
    for (const dep of node.deps) {
      if (dep.pkg !== childId) continue
      const parent = packagesById.get(node.id)
      const kinds = dep.dep_kinds.map((item) => item.kind || 'normal')
      parents.push({ key: packageKey(parent), kinds })
    }
  }
  return parents.sort((a, b) => a.key.localeCompare(b.key))
}

function assertParents(pkg, expected) {
  const actual = immediateParents(pkg.id)
  const actualKeys = actual.map((entry) => entry.key)
  const expectedKeys = Object.keys(expected).sort()
  if (JSON.stringify(actualKeys) !== JSON.stringify(expectedKeys)) {
    fail(`${packageKey(pkg)} parent scope changed: expected ${expectedKeys.join(', ')}, got ${actualKeys.join(', ') || 'none'}`)
  }
  for (const entry of actual) {
    const expectedKinds = [...expected[entry.key]].sort()
    const actualKinds = [...new Set(entry.kinds)].sort()
    if (JSON.stringify(actualKinds) !== JSON.stringify(expectedKinds)) {
      fail(`${packageKey(pkg)} edge from ${entry.key} changed kind: expected ${expectedKinds.join(', ')}, got ${actualKinds.join(', ')}`)
    }
  }
}

// Patched minimums selected during Phase 2A. Exact lock versions make drift reviewable.
requirePackage('crossbeam-epoch', '0.9.20', 'RUSTSEC-2026-0204 patch')
requirePackage('anyhow', '1.0.103', 'RUSTSEC-2026-0190 patch')
requirePackage('event-listener', '5.4.2', 'RUSTSEC-2026-0221 patch')
requirePackage('memmap2', '0.9.11', 'RUSTSEC-2026-0186 patch')
requirePackage('plist', '1.10.0', 'quick-xml parser patch through plist')
requirePackage('wayland-scanner', '0.31.11', 'quick-xml parser patch through wayland-scanner')
requirePackage('quick-xml', '0.41.0', 'patched quick-xml parser')
forbidPackage('quick-xml', '0.38.4', 'runtime/build parser must use quick-xml 0.41')

// RUSTSEC-2026-0194/0195: accepted only for two reviewed, non-parser-runtime scopes.
const xcbQuickXml = requirePackage('quick-xml', '0.30.0', 'xcb build-only acceptance')
assertParents(xcbQuickXml, { 'xcb@1.7.0': ['build'] })

const notificationQuickXml = requirePackage('quick-xml', '0.37.5', 'Windows notification escape-only acceptance')
assertParents(notificationQuickXml, { 'tauri-winrt-notification@0.7.2': ['normal'] })

// Existing upstream-constrained acceptances remain pinned to reviewed versions and entry chains.
const legacyRand = requirePackage('rand', '0.7.3', 'RUSTSEC-2026-0097 build-time acceptance')
assertParents(legacyRand, { 'phf_generator@0.8.0': ['normal'] })

requirePackage('glib', '0.18.5', 'RUSTSEC-2024-0429 Linux GTK acceptance')
requirePackage('webkit2gtk', '2.0.2', 'RUSTSEC-2024-0429 reviewed Tauri Linux chain')

for (const acceptedId of [
  'RUSTSEC-2024-0429',
  'RUSTSEC-2026-0097',
  'RUSTSEC-2026-0194',
  'RUSTSEC-2026-0195'
]) {
  console.log(`[rustsec-acceptance] scoped acceptance active: ${acceptedId}`)
}
console.log('[rustsec-acceptance] patched versions and reviewed parent scopes verified')
