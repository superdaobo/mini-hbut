import fs from 'node:fs'
import path from 'node:path'

const DIST_DIR = path.resolve(process.cwd(), 'dist')
const TRASH_DIR = path.resolve(process.cwd(), `.dist-trash-${Date.now()}`)

const walkFiles = (dir, out = []) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkFiles(fullPath, out)
      continue
    }
    out.push(fullPath)
  }
  return out
}

if (!fs.existsSync(DIST_DIR)) {
  process.exit(0)
}

try {
  fs.rmSync(DIST_DIR, { recursive: true, force: true })
} catch {
  // ignore remove failure and fallback below
}

if (!fs.existsSync(DIST_DIR)) {
  console.log('[prepare-dist] removed dist directory')
  process.exit(0)
}

try {
  fs.renameSync(DIST_DIR, TRASH_DIR)
  try {
    fs.rmSync(TRASH_DIR, { recursive: true, force: true })
  } catch {
    // ignore best-effort trash cleanup failure
  }
  console.warn(`[prepare-dist] rm blocked; moved stale dist to ${path.basename(TRASH_DIR)}`)
  process.exit(0)
} catch {
  // continue to per-entry cleanup
}

const entries = fs.readdirSync(DIST_DIR, { withFileTypes: true })
let removed = 0
let truncated = 0

for (const entry of entries) {
  const targetPath = path.join(DIST_DIR, entry.name)
  try {
    fs.rmSync(targetPath, { recursive: true, force: true })
  } catch {
    // fallback below
  }

  if (!fs.existsSync(targetPath)) {
    removed += 1
    continue
  }

  if (entry.isDirectory()) {
    for (const filePath of walkFiles(targetPath)) {
      try {
        fs.truncateSync(filePath, 0)
        truncated += 1
      } catch {
        // ignore single file failure
      }
    }
    try {
      fs.rmSync(targetPath, { recursive: true, force: true })
    } catch {
      // keep last-resort leftover for visibility
    }
  } else {
    try {
      fs.truncateSync(targetPath, 0)
      truncated += 1
    } catch {
      // ignore single file failure
    }
    try {
      fs.rmSync(targetPath, { force: true })
    } catch {
      // keep last-resort leftover for visibility
    }
  }

  if (!fs.existsSync(targetPath)) {
    removed += 1
  }
}

const remaining = fs.readdirSync(DIST_DIR)
console.warn(`[prepare-dist] rm blocked; removed ${removed} entries, truncated ${truncated} stale files, remaining ${remaining.length}`)
