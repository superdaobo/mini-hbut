import fs from 'node:fs'
import path from 'node:path'

const distDir = path.resolve(process.cwd(), process.env.DIST_DIR || 'dist')
const allowedTopLevelEntries = new Set([
  'assets',
  'favicon.svg',
  'index.html',
  'pdf-preview-lab.html',
  'remote_config.json',
  'remote_config.sample.json',
  'splash'
])
const forbiddenSegments = ['modules', 'website', 'app-resources']

if (!fs.existsSync(distDir)) {
  console.warn(`[dist-check] dist 目录不存在，跳过：${distDir}`)
  process.exit(0)
}

const entries = fs.readdirSync(distDir)
const unexpected = entries.filter((entry) => !allowedTopLevelEntries.has(entry))
if (unexpected.length > 0) {
  console.error('[dist-check] 发现不允许进入桌面安装包的顶层产物：')
  for (const entry of unexpected) {
    console.error(`- ${entry}`)
  }
  process.exit(1)
}

const walk = (dir, out = []) => {
  const items = fs.readdirSync(dir, { withFileTypes: true })
  for (const item of items) {
    const fullPath = path.join(dir, item.name)
    if (item.isDirectory()) {
      walk(fullPath, out)
      continue
    }
    out.push(fullPath)
  }
  return out
}

const violations = []
for (const filePath of walk(distDir)) {
  const normalized = filePath.replace(/\\/g, '/').toLowerCase()
  const hit = forbiddenSegments.find((segment) => normalized.includes(`/${segment.toLowerCase()}/`))
  if (hit) {
    violations.push({ filePath, hit })
  }
}

if (violations.length > 0) {
  console.error('[dist-check] dist 内出现禁止目录片段：')
  for (const item of violations) {
    console.error(`- ${item.filePath} (hit: ${item.hit})`)
  }
  process.exit(1)
}

console.log(`[dist-check] 通过，桌面 dist 白名单校验完成：${distDir}`)
