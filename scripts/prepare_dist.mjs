import fs from 'node:fs'
import path from 'node:path'

const DIST_DIR = path.resolve(process.cwd(), 'dist')

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

let truncated = 0
for (const filePath of walkFiles(DIST_DIR)) {
  try {
    fs.truncateSync(filePath, 0)
    truncated += 1
  } catch {
    // ignore single file failure
  }
}

console.warn(`[prepare-dist] rm blocked; truncated ${truncated} stale files`)
