#!/usr/bin/env node
/**
 * Stamp package / Tauri / Cargo marketing version for CI builds.
 *
 * Dev / PRO builds must write prerelease versions (e.g. 1.4.3-beta.123)
 * into the sources that end up in the installed app identity:
 * - package.json → Vite VITE_APP_VERSION
 * - src-tauri/tauri.conf.json → Tauri getVersion / native marketing version
 * - src-tauri/Cargo.toml → crate package.version (keep in sync)
 *
 * Usage:
 *   node scripts/ci/stamp_app_version.mjs 1.4.3-beta.29143832544
 *   APP_VERSION=1.4.3-beta.1 node scripts/ci/stamp_app_version.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')

const VERSION_RE = /^[0-9]+(?:\.[0-9]+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/

export function normalizeAppVersion(raw) {
  const text = String(raw || '')
    .trim()
    .replace(/^v/i, '')
  if (!text) {
    throw new Error('version is required (arg or APP_VERSION / BETA_VERSION env)')
  }
  if (!VERSION_RE.test(text)) {
    throw new Error(`invalid app version: ${text}`)
  }
  return text
}

export function stampPackageJson(content, version) {
  const data = JSON.parse(content)
  data.version = version
  return `${JSON.stringify(data, null, 2)}\n`
}

export function stampTauriConf(content, version) {
  const data = JSON.parse(content)
  data.version = version
  return `${JSON.stringify(data, null, 2)}\n`
}

export function stampCargoToml(content, version) {
  const text = String(content)
  // Only rewrite the root package version in [package], not dependency versions.
  const packageHeader = text.match(/^\[package\]\s*$/m)
  if (!packageHeader || packageHeader.index == null) {
    throw new Error('Cargo.toml missing [package] section')
  }
  const start = packageHeader.index
  const rest = text.slice(start + packageHeader[0].length)
  const nextHeader = rest.search(/\n\[/)
  const packageBody = nextHeader === -1 ? rest : rest.slice(0, nextHeader)
  const after = nextHeader === -1 ? '' : rest.slice(nextHeader)

  if (!/^\s*version\s*=\s*"[^"]*"/m.test(packageBody)) {
    throw new Error('Cargo.toml [package] missing version field')
  }

  const stampedBody = packageBody.replace(
    /^(\s*version\s*=\s*")[^"]*(")/m,
    `$1${version}$2`
  )
  return `${text.slice(0, start)}${packageHeader[0]}${stampedBody}${after}`
}

export function stampWorkspaceFiles(rootDir, version) {
  const v = normalizeAppVersion(version)
  const targets = [
    {
      rel: 'package.json',
      stamp: stampPackageJson
    },
    {
      rel: path.join('src-tauri', 'tauri.conf.json'),
      stamp: stampTauriConf
    },
    {
      rel: path.join('src-tauri', 'Cargo.toml'),
      stamp: stampCargoToml
    }
  ]

  const written = []
  for (const target of targets) {
    const full = path.join(rootDir, target.rel)
    if (!fs.existsSync(full)) {
      throw new Error(`missing file: ${target.rel}`)
    }
    const before = fs.readFileSync(full, 'utf8')
    const after = target.stamp(before, v)
    if (before !== after) {
      fs.writeFileSync(full, after, 'utf8')
    }
    written.push(target.rel)
  }
  return { version: v, files: written }
}

function resolveCliVersion(argv = process.argv.slice(2), env = process.env) {
  const fromArg = argv.find((item) => item && !item.startsWith('-'))
  return fromArg || env.APP_VERSION || env.BETA_VERSION || env.VERSION || ''
}

function main() {
  const version = resolveCliVersion()
  const result = stampWorkspaceFiles(ROOT, version)
  console.log(
    JSON.stringify(
      {
        ok: true,
        version: result.version,
        files: result.files
      },
      null,
      2
    )
  )
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)

if (isDirectRun) {
  try {
    main()
  } catch (error) {
    console.error(`[stamp_app_version] ${error instanceof Error ? error.message : error}`)
    process.exit(1)
  }
}
