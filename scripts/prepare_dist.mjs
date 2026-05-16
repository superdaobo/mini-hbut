import fs from 'node:fs'
import path from 'node:path'

const DIST_DIR = path.resolve(process.cwd(), 'dist')
const TRASH_PREFIX = '.dist-trash-'

// 清理之前残留的 .dist-trash-* 文件夹
const cwd = process.cwd()
try {
  const rootEntries = fs.readdirSync(cwd, { withFileTypes: true })
  for (const entry of rootEntries) {
    if (entry.isDirectory() && entry.name.startsWith(TRASH_PREFIX)) {
      try {
        fs.rmSync(path.join(cwd, entry.name), { recursive: true, force: true })
      } catch { /* ignore */ }
    }
  }
} catch { /* ignore */ }

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

// Fallback: rename then delete
const TRASH_DIR = path.resolve(cwd, `${TRASH_PREFIX}${Date.now()}`)
try {
  fs.renameSync(DIST_DIR, TRASH_DIR)
  try {
    fs.rmSync(TRASH_DIR, { recursive: true, force: true })
  } catch {
    // 异步延迟删除（Windows 文件锁释放后）
    setTimeout(() => {
      try { fs.rmSync(TRASH_DIR, { recursive: true, force: true }) } catch { /* give up */ }
    }, 2000)
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
