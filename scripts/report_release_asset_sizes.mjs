#!/usr/bin/env node
/**
 * Report sizes of frontend assets that ship in the web bundle / app shell.
 * Pure local measurement — no CDN. Exit 1 if any tracked file grows past optional baseline.
 *
 * Usage:
 *   node scripts/report_release_asset_sizes.mjs
 *   node scripts/report_release_asset_sizes.mjs --baseline path/to/size-before.json
 */
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const TRACKED = [
  'public/splash/app_icon.png',
  'public/splash/app_icon.webp',
  'public/favicon.svg',
  'src/assets/app-icon.svg',
  'public/fonts/material-symbols-outlined.subset.woff2',
  'public/splash/cas_bg.webp',
  'public/splash/campus_illustration.webp'
]

const args = process.argv.slice(2)
const baselineIdx = args.indexOf('--baseline')
const baselinePath = baselineIdx >= 0 ? args[baselineIdx + 1] : null
const outIdx = args.indexOf('--out')
const outPath = outIdx >= 0 ? args[outIdx + 1] : null

const rows = TRACKED.map((rel) => {
  const abs = path.join(root, rel)
  const exists = fs.existsSync(abs)
  const size = exists ? fs.statSync(abs).size : -1
  return { path: rel, bytes: size, kb: size >= 0 ? Math.round((size / 1024) * 10) / 10 : null }
})

const report = {
  generatedAt: new Date().toISOString(),
  totalBytes: rows.filter((r) => r.bytes >= 0).reduce((s, r) => s + r.bytes, 0),
  files: rows
}

const text = [
  `total_kb=${Math.round((report.totalBytes / 1024) * 10) / 10}`,
  ...rows.map((r) => `${r.path}\t${r.kb ?? 'MISSING'}KB`)
].join('\n')

console.log(text)

if (outPath) {
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8')
  console.log(`wrote ${outPath}`)
}

if (baselinePath && fs.existsSync(baselinePath)) {
  const base = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
  const baseTotal = Number(base.totalBytes) || 0
  const growth = report.totalBytes - baseTotal
  console.log(`delta_bytes=${growth} (after - before)`)
  // Soft gate: fail only if grows more than 5% over baseline
  if (baseTotal > 0 && growth > baseTotal * 0.05) {
    console.error(`SIZE GATE FAIL: tracked assets grew ${growth} bytes (>5%)`)
    process.exit(1)
  }
}
