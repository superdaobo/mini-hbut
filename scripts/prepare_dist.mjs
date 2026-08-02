import fs from 'node:fs'
import path from 'node:path'

const cwd = process.cwd()
const distDir = path.resolve(cwd, 'dist')
const trashPrefix = '.dist-trash-'

function removeQuickly(target) {
  try {
    fs.rmSync(target, {
      recursive: true,
      force: true,
      maxRetries: 1,
      retryDelay: 100
    })
  } catch {
    // A locked Windows file may still prevent removal. Callers decide whether it is fatal.
  }
  return !fs.existsSync(target)
}

function cleanHistoricalTrash() {
  let remaining = 0
  try {
    for (const entry of fs.readdirSync(cwd, { withFileTypes: true })) {
      if (!entry.isDirectory() || !entry.name.startsWith(trashPrefix)) continue
      if (!removeQuickly(path.join(cwd, entry.name))) remaining += 1
    }
  } catch (error) {
    console.warn(`[prepare-dist] unable to scan stale trash: ${error?.message || error}`)
  }
  if (remaining > 0) {
    console.warn(`[prepare-dist] ${remaining} locked stale trash director${remaining === 1 ? 'y remains' : 'ies remain'}; build continues`)
  }
}

cleanHistoricalTrash()

if (!fs.existsSync(distDir)) process.exit(0)

if (removeQuickly(distDir)) {
  console.log('[prepare-dist] removed dist directory')
  process.exit(0)
}

const trashDir = path.resolve(cwd, `${trashPrefix}${process.pid}-${Date.now()}`)
try {
  fs.renameSync(distDir, trashDir)
  console.warn(`[prepare-dist] dist was locked; moved it to ${path.basename(trashDir)}`)
  if (!removeQuickly(trashDir)) {
    console.warn(`[prepare-dist] locked trash remains for a later best-effort cleanup: ${path.basename(trashDir)}`)
  }
} catch (error) {
  console.error(`[prepare-dist] cannot clear or move locked dist directory: ${error?.message || error}`)
  process.exitCode = 1
}
