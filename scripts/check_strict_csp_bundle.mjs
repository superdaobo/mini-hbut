import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.argv[2] || 'dist')
if (!fs.existsSync(root)) {
  throw new Error(`production bundle directory not found: ${root}`)
}

const forbidden = [
  { label: 'dynamic Function constructor', pattern: /\bnew\s+Function\s*\(/ },
  { label: 'direct eval call', pattern: /(?:^|[^\w$.])eval\s*\(/ },
  { label: 'Ajv runtime compiler', pattern: /node_modules[\\/]ajv|ajv\/dist\/compile|CodeGen\.code/ },
  { label: 'unsafe-eval CSP token', pattern: /['"]unsafe-eval['"]/ },
]

const violations = []
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(fullPath)
    else if (entry.isFile() && /\.(?:m?js|html)$/i.test(entry.name)) {
      const source = fs.readFileSync(fullPath, 'utf8')
      for (const rule of forbidden) {
        const match = rule.pattern.exec(source)
        if (match) {
          violations.push({
            file: path.relative(process.cwd(), fullPath).replace(/\\/g, '/'),
            rule: rule.label,
            index: match.index,
          })
        }
      }
    }
  }
}
walk(root)

if (violations.length > 0) {
  console.error('[strict-csp-bundle] forbidden runtime code generation found:')
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.rule} at byte ${violation.index}`)
  }
  process.exit(1)
}

console.log(`[strict-csp-bundle] passed: ${root}`)
