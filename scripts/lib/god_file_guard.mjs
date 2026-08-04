import fs from 'node:fs'
import path from 'node:path'

export const LIMITS = Object.freeze({
  'src/App.vue': 800,
  'src-tauri/src/lib.rs': 1200,
  'src-tauri/src/http_server.rs': 1200,
  'src-tauri/src/db.rs': 1000,
  vue: 1500,
  rust: 1800,
  script: 1000,
})

const SOURCE_ROOTS = ['src', 'src-tauri/src']
const SPECIFIC_LIMITS = new Map(Object.entries(LIMITS).filter(([key]) => key.includes('/')))
const TEST_FILE_RE = /(?:^|\/)(?:__tests__|fixtures?)(?:\/|$)|(?:\.spec|\.test)\.[cm]?[jt]sx?$|\.d\.ts$|_fixtures?\.[cm]?[jt]s$/i
const RUNTIME_FILE_RE = /\.runtime\.js$/i
const RUNTIME_IMPORT_RE = /(?:from\s*['"][^'"]*\.runtime\.js['"]|import\s*\(\s*['"][^'"]*\.runtime\.js['"]\s*\)|require\s*\(\s*['"][^'"]*\.runtime\.js['"]\s*\))/i

const normalizePath = (value) => value.split(path.sep).join('/')
const countLines = (content) => content.length === 0 ? 0 : content.split(/\r?\n/).length

const walkFiles = (root) => {
  if (!fs.existsSync(root)) return []
  const output = []
  const stack = [root]
  while (stack.length > 0) {
    const current = stack.pop()
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(absolute)
      else if (entry.isFile()) output.push(absolute)
    }
  }
  return output
}

const classifyLimit = (relativePath) => {
  if (SPECIFIC_LIMITS.has(relativePath)) {
    return { kind: 'size', limit: SPECIFIC_LIMITS.get(relativePath), scope: 'specific' }
  }
  if (TEST_FILE_RE.test(relativePath)) return null
  const extension = path.extname(relativePath).toLowerCase()
  if (extension === '.vue') return { kind: 'size', limit: LIMITS.vue, scope: 'vue' }
  if (extension === '.rs') return { kind: 'size', limit: LIMITS.rust, scope: 'rust' }
  if (extension === '.ts' || extension === '.js' || extension === '.mts' || extension === '.mjs') {
    return { kind: 'size', limit: LIMITS.script, scope: 'script' }
  }
  return null
}

export const scanGodFileViolations = (repoRoot) => {
  const violations = []
  const metrics = []
  for (const sourceRoot of SOURCE_ROOTS) {
    const absoluteRoot = path.join(repoRoot, sourceRoot)
    for (const absolutePath of walkFiles(absoluteRoot)) {
      const relativePath = normalizePath(path.relative(repoRoot, absolutePath))
      const extension = path.extname(relativePath).toLowerCase()
      if (!['.vue', '.rs', '.ts', '.js', '.mts', '.mjs'].includes(extension)) continue
      const content = fs.readFileSync(absolutePath, 'utf8')
      const lines = countLines(content)
      metrics.push({ path: relativePath, lines })

      const limit = classifyLimit(relativePath)
      if (limit && lines > limit.limit) {
        violations.push({
          key: `size:${relativePath}`,
          kind: 'size',
          path: relativePath,
          lines,
          limit: limit.limit,
          scope: limit.scope,
          message: `${relativePath} 有 ${lines} 行，超过 ${limit.limit} 行上限`,
        })
      }

      if (RUNTIME_FILE_RE.test(relativePath)) {
        violations.push({
          key: `runtime-file:${relativePath}`,
          kind: 'runtime-file',
          path: relativePath,
          message: `禁止保留 JavaScript runtime 桥接文件：${relativePath}`,
        })
      }

      if (!RUNTIME_FILE_RE.test(relativePath) && !TEST_FILE_RE.test(relativePath) && RUNTIME_IMPORT_RE.test(content)) {
        violations.push({
          key: `runtime-import:${relativePath}`,
          kind: 'runtime-import',
          path: relativePath,
          message: `生产代码仍依赖 .runtime.js：${relativePath}`,
        })
      }
    }
  }
  violations.sort((a, b) => a.key.localeCompare(b.key))
  metrics.sort((a, b) => b.lines - a.lines || a.path.localeCompare(b.path))
  return { violations, metrics }
}

export const loadDebtEntries = (debtPath) => {
  if (!fs.existsSync(debtPath)) return []
  const parsed = JSON.parse(fs.readFileSync(debtPath, 'utf8'))
  if (!Array.isArray(parsed)) throw new Error('god-file debt 文件必须是数组')
  const seen = new Set()
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') throw new Error('god-file debt 条目必须是对象')
    for (const field of ['key', 'issue', 'owner', 'deadline']) {
      if (!String(entry[field] || '').trim()) throw new Error(`god-file debt 缺少字段 ${field}`)
    }
    if (!/^#\d+$/.test(String(entry.issue))) throw new Error(`god-file debt issue 格式错误：${entry.issue}`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(entry.deadline))) throw new Error(`god-file debt deadline 格式错误：${entry.deadline}`)
    if (seen.has(entry.key)) throw new Error(`god-file debt key 重复：${entry.key}`)
    seen.add(entry.key)
  }
  return parsed
}

export const evaluateGodFileGuard = ({ repoRoot, debtPath, strict = false }) => {
  const { violations, metrics } = scanGodFileViolations(repoRoot)
  const debtEntries = loadDebtEntries(debtPath)
  const debtByKey = new Map(debtEntries.map((entry) => [entry.key, entry]))
  const unregistered = violations.filter((violation) => !debtByKey.has(violation.key))
  const violationKeys = new Set(violations.map((violation) => violation.key))
  const staleDebt = debtEntries.filter((entry) => !violationKeys.has(entry.key))
  const expiredDebt = debtEntries.filter((entry) => Date.parse(`${entry.deadline}T23:59:59Z`) < Date.now())
  const errors = []
  if (unregistered.length > 0) errors.push(...unregistered.map((item) => item.message))
  if (staleDebt.length > 0) errors.push(...staleDebt.map((item) => `已完成或失效的 debt 必须删除：${item.key}`))
  if (expiredDebt.length > 0) errors.push(...expiredDebt.map((item) => `debt 已过期：${item.key} (${item.deadline})`))
  if (strict && debtEntries.length > 0) errors.push(`严格模式不允许任何 debt，当前仍有 ${debtEntries.length} 项`)
  return {
    ok: errors.length === 0,
    strict,
    errors,
    violations,
    registeredDebt: debtEntries,
    metrics,
  }
}
