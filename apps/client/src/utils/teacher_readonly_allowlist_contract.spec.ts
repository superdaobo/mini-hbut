/**
 * Teacher Portal V2（#1019）：教师只读安全契约测试（E0 安全验收核心）。
 *
 * 机械断言（不依赖人工审查）：
 *   1. Rust 教师相关教务路径**不含任何写动词**（对照 data/teacher-api-recon/07 的接入规则）；
 *   2. `teacher/` 下实际使用的路径都已登记在 `readonly.rs` 的 allowlist（fail-closed）；
 *   3. 教师模块不得引用学生专属教务路径（`/admin/xsd/`）；
 *   4. `modules/school_inbox.rs` 的 `updateState` 只允许出现在显式 mark-* 写型辅助函数内，
 *      且 portal 只读拉取路径（`fetch_portal_inbox`）不得触发 `updateState`；
 *   5. `features/teacher/**` 前端代码不得出现学生专属接口
 *      （`xskp` / `/v2/student_info` / `/v2/quick_fetch`）。
 *
 * ⚠️ 该测试是 Epic #1018「所有教师教务新增访问只有经过审核的只读操作」的机械门禁，
 * 任何 Agent 新增教师接口时都必须让本测试保持通过。
 */
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath: string) => readFileSync(path.join(root, relativePath), 'utf8')

const TEACHER_MODULE_DIR = 'src-tauri/src/http_client/academic/teacher'
const TEACHER_ENTRY = 'src-tauri/src/http_client/academic/teacher.rs'
const TEACHER_RUST_FILES = [
  'src-tauri/src/application/teacher.rs',
  'src-tauri/src/transport/tauri/teacher.rs',
  'src-tauri/src/http_server/routes/teacher.rs'
]

/** 写动词词根（与 data/teacher-api-recon/07-write-endpoints-denylist.md 的接入规则一致）。 */
const WRITE_VERB_PATTERN =
  /save|add|create|update|delete|remove|submit|confirm|import|insert|upload|export|print|report|reset|change|send|batch|collect|chehui|topping/i

/** 剥离 Rust 注释（红线条目常在注释里被引用，不应视为真实调用）。 */
const stripRustComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => {
      const index = line.indexOf('//')
      return index >= 0 ? line.slice(0, index) : line
    })
    .join('\n')

/** 从源码中提取 `/admin/...` 形式的教务路径字面量（含 `{}` 占位段与查询串）。 */
const extractAdminPaths = (source: string): string[] => {
  const matches = stripRustComments(source).match(/\/admin\/[A-Za-z0-9_/?=&.\-{}]+/g) || []
  return [...new Set(matches)]
}

/**
 * 读取 `readonly.rs` 的 allowlist 声明（仅 `pub const PATH_*` 的字符串字面量）。
 *
 * 刻意不扫描 readonly.rs 的测试模块：其中包含**必须被拒绝**的负向 fixture
 * （如 `/admin/system/tzsjx/updateState`），它们不是被使用的路径。
 */
const ALLOWLIST_CONST_RE = /pub const PATH_[A-Z0-9_]+:\s*&str\s*=\s*"([^"]+)"/g
const readAllowlistPaths = (): string[] => {
  const source = read(`${TEACHER_MODULE_DIR}/readonly.rs`)
  const out: string[] = []
  for (const match of source.matchAll(ALLOWLIST_CONST_RE)) out.push(match[1])
  return out
}

/** 教师模块（入口 + 业务文件）中实际出现的 `/admin/` 路径。 */
const readUsedPaths = (): string[] => {
  const relatives = [
    TEACHER_ENTRY,
    ...TEACHER_RUST_FILES,
    ...collectFiles(TEACHER_MODULE_DIR, ['.rs'])
      .map((file) => path.relative(root, file).split(path.sep).join('/'))
      .filter((relative) => !relative.endsWith('readonly.rs'))
  ]
  const used = new Set<string>()
  for (const relative of relatives) {
    for (const adminPath of extractAdminPaths(read(relative))) used.add(adminPath)
  }
  used.delete('/admin/') // 仅出现基础前缀、无具体路径时不参与校验
  return [...used]
}

const collectFiles = (dir: string, extensions: string[]): string[] => {
  const absolute = path.join(root, dir)
  const out: string[] = []
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) out.push(full)
    }
  }
  walk(absolute)
  return out.sort()
}

/** 返回给定下标之前最近的函数名（用于把一段代码归属到其所在函数）。 */
const functionNameBefore = (source: string, index: number): string => {
  const before = source.slice(0, index)
  const matches = [...before.matchAll(/\n\s*(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z0-9_]+)\s*\(/g)]
  return matches.length > 0 ? matches[matches.length - 1][1] : ''
}

describe('teacher readonly contract（Rust 只读边界）', () => {
  it('teacher/ 下所有教务路径都不含写动词词根', () => {
    const allowlist = readAllowlistPaths()
    expect(allowlist.length).toBeGreaterThan(0)

    const violations: string[] = []
    for (const adminPath of [...allowlist, ...readUsedPaths()]) {
      if (WRITE_VERB_PATTERN.test(adminPath)) violations.push(adminPath)
    }
    expect(violations).toEqual([])
  })

  it('teacher.rs 入口与教师业务文件使用的路径都已登记在 readonly allowlist', () => {
    const allowlist = readAllowlistPaths()
    expect(allowlist.length).toBeGreaterThan(0)

    const isRegistered = (candidate: string): boolean =>
      allowlist.some((entry) => {
        if (entry === candidate) return true
        const brace = entry.indexOf('{')
        return brace > 0 && candidate.startsWith(entry.slice(0, brace))
      })

    const unregistered = readUsedPaths().filter((candidate) => !isRegistered(candidate))
    expect(unregistered).toEqual([])
  })

  it('教师模块不得引用学生专属教务路径 /admin/xsd/', () => {
    const relatives = [
      TEACHER_ENTRY,
      ...TEACHER_RUST_FILES,
      ...collectFiles(TEACHER_MODULE_DIR, ['.rs']).map((file) =>
        path.relative(root, file).split(path.sep).join('/')
      )
    ]
    const violations: string[] = []
    for (const relative of relatives) {
      for (const adminPath of extractAdminPaths(read(relative))) {
        if (adminPath.startsWith('/admin/xsd/')) violations.push(`${relative}: ${adminPath}`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe('teacher readonly contract（school_inbox 教师只读红线）', () => {
  const inboxPath = 'src-tauri/src/modules/school_inbox.rs'

  it('portal 只读拉取路径 fetch_portal_inbox 不得触发 updateState', () => {
    const source = read(inboxPath)
    const start = source.indexOf('async fn fetch_portal_inbox')
    expect(start).toBeGreaterThanOrEqual(0)
    const rest = source.slice(start)
    const next = rest.search(/\nasync fn /)
    const body = next < 0 ? rest : rest.slice(0, next)
    expect(body).not.toContain('updateState')
  })

  it('updateState 只允许出现在显式 mark-* 写型辅助函数内', () => {
    const source = read(inboxPath)
    const violations: string[] = []
    for (const match of source.matchAll(/updateState/g)) {
      const owner = functionNameBefore(source, match.index ?? 0)
      if (!owner.startsWith('mark_')) {
        violations.push(`updateState 出现在非 mark-* 函数: ${owner || '<unknown>'}`)
      }
    }
    expect(violations).toEqual([])
  })
})

describe('teacher readonly contract（前端不得误用学生接口）', () => {
  it('features/teacher/** 不含 xskp / /v2/student_info / /v2/quick_fetch', () => {
    const files = collectFiles('src/features/teacher', ['.ts', '.vue', '.js'])
    expect(files.length).toBeGreaterThan(0)

    const forbidden = ['xskp', '/v2/student_info', '/v2/quick_fetch']
    const violations: string[] = []
    for (const file of files) {
      const rel = path.relative(root, file).split(path.sep).join('/')
      const source = readFileSync(file, 'utf8')
      for (const token of forbidden) {
        if (source.includes(token)) violations.push(`${rel}: ${token}`)
      }
    }
    expect(violations).toEqual([])
  })
})
