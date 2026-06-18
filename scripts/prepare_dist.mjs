import fs from 'node:fs'
import path from 'node:path'

const DIST_DIR = path.resolve(process.cwd(), 'dist')
const TRASH_PREFIX = '.dist-trash-'
const MAX_RETRIES = 10
const RETRY_DELAY_MS = 3000

const cwd = process.cwd()

function cleanTrashDirs() {
  try {
    const rootEntries = fs.readdirSync(cwd, { withFileTypes: true })
    for (const entry of rootEntries) {
      if (entry.isDirectory() && entry.name.startsWith(TRASH_PREFIX)) {
        forceRemove(path.join(cwd, entry.name))
      }
    }
  } catch { /* ignore */ }
}

function forceRemove(target) {
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      fs.rmSync(target, { recursive: true, force: true })
      if (!fs.existsSync(target)) return true
    } catch { /* ignore */ }
    if (i < MAX_RETRIES - 1) {
      const delay = RETRY_DELAY_MS + i * 1000
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay)
    }
  }
  return !fs.existsSync(target)
}

cleanTrashDirs()

if (!fs.existsSync(DIST_DIR)) {
  process.exit(0)
}

if (forceRemove(DIST_DIR)) {
  console.log('[prepare-dist] removed dist directory')
  process.exit(0)
}

const TRASH_DIR = path.resolve(cwd, `${TRASH_PREFIX}${Date.now()}`)
try {
  fs.renameSync(DIST_DIR, TRASH_DIR)
  console.warn(`[prepare-dist] rm blocked; moved stale dist to ${path.basename(TRASH_DIR)}, cleaning async`)
  ;(async () => {
    for (let i = 0; i < MAX_RETRIES; i++) {
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS + i * 1000))
      try {
        fs.rmSync(TRASH_DIR, { recursive: true, force: true })
        if (!fs.existsSync(TRASH_DIR)) {
          console.log(`[prepare-dist] async cleanup done: ${path.basename(TRASH_DIR)}`)
          return
        }
      } catch { /* retry */ }
    }
    console.warn(`[prepare-dist] async cleanup failed after ${MAX_RETRIES} retries: ${path.basename(TRASH_DIR)} remains`)
  })()
  process.exit(0)
} catch {
  // continue to per-entry cleanup
}

const entries = fs.readdirSync(DIST_DIR, { withFileTypes: true })
let removed = 0
let truncated = 0

function walkFiles(dir) {
  const results = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) results.push(...walkFiles(full))
    else results.push(full)
  }
  return results
}

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
