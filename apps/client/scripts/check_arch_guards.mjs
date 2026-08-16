#!/usr/bin/env node
/**
 * 阶段3架构收敛守卫（check:architecture）
 *
 * 1. src/utils/api.ts 与 api.js 不得同时存在（api.ts 已重命名为 server_api.ts）
 * 2. 组件 / composables 内禁止新增 iphone/ipad/ipod/android UA 判断：
 *    - 平台判断唯一来源是 src/platform/runtime.ts（isIOSLike / isAndroidLike ...）
 *    - 明确业务特定的 Mobile / HarmonyOS 关键字不受限（如 ScheduleView 兜底）
 * 3. lib.rs 与 http_server.rs 的 sync_grades handler 都必须构造/调用 grade::service::GradeService
 * 4. src-tauri/src/modules/grades.rs 不得存在（成绩域已收敛到 grade/ 模块）
 * 5. 四个 ICS 函数只定义于 utils/ics.rs，两传输文件（lib.rs / http_server.rs）只 import 复用
 *
 * 任一断言失败：输出清晰错误并以非零码退出。
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const rel = (p) => relative(repoRoot, p)
const failures = []

const fail = (msg) => {
  failures.push(msg)
  console.error(`❌ ${msg}`)
}
const pass = (msg) => console.log(`✅ ${msg}`)

function read(relativePath) {
  const file = join(repoRoot, relativePath)
  if (!existsSync(file)) return null
  return readFileSync(file, 'utf8')
}

function walkFiles(dir, extensions) {
  const results = []
  let entries = []
  try {
    entries = readdirSync(dir)
  } catch {
    return results // 目录不存在则视为空
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.git') continue
    const full = join(dir, entry)
    try {
      const stat = statSync(full)
      if (stat.isDirectory()) {
        results.push(...walkFiles(full, extensions))
      } else if (extensions.some((ext) => full.endsWith(ext))) {
        results.push(full)
      }
    } catch {
      /* 跳过不可访问项 */
    }
  }
  return results
}

// ---------------------------------------------------------------- 1. api 双文件
{
  const apiTs = join(repoRoot, 'src/utils/api.ts')
  const apiJs = join(repoRoot, 'src/utils/api.js')
  const both = existsSync(apiTs) && existsSync(apiJs)
  if (both) {
    fail(
      'src/utils/api.ts 与 src/utils/api.js 同时存在：api.ts 应已重命名为 server_api.ts（允许保留 server_api.ts）'
    )
  } else {
    pass('src/utils/api.ts 与 api.js 未同时存在（server_api.ts 可保留）')
  }
}

// ------------------------------------------------- 2. 组件/composables UA 判断守卫
{
  const stripComments = (source) =>
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')

  const UA_ACCESS = String.raw`(?:navigator\s*(?:\.\s*userAgent|\[\s*['"]userAgent['"]\s*\])|navigator\s*\.\s*userAgentData|userAgentData)`
  const BRAND = String.raw`(?:iphone|ipad|ipod|android)`

  const detectUaBrandChecks = (source) => {
    const code = stripComments(source)
    const hits = []
    const variables = new Set()
    const assignment = new RegExp(
      String.raw`\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*${UA_ACCESS}[^;\n]*`,
      'gi'
    )
    for (const match of code.matchAll(assignment)) variables.add(match[1])

    const patterns = [
      new RegExp(
        String.raw`${UA_ACCESS}[^;\n]{0,240}(?:includes|startsWith|endsWith|match|search)\s*\([^;\n]{0,120}${BRAND}`,
        'gi'
      ),
      new RegExp(String.raw`\/${BRAND}[^/\n]*\/[a-z]*\s*\.\s*test\s*\(\s*${UA_ACCESS}`, 'gi')
    ]
    for (const variable of variables) {
      const escaped = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      patterns.push(
        new RegExp(
          String.raw`\b${escaped}\s*\.\s*(?:includes|startsWith|endsWith|match|search)\s*\([^;\n]{0,120}${BRAND}`,
          'gi'
        ),
        new RegExp(String.raw`\/${BRAND}[^/\n]*\/[a-z]*\s*\.\s*test\s*\(\s*${escaped}\b`, 'gi')
      )
    }
    for (const pattern of patterns) {
      for (const match of code.matchAll(pattern)) {
        const line = code.slice(0, match.index).split('\n').length
        hits.push({ line, snippet: match[0].replace(/\s+/g, ' ').slice(0, 180) })
      }
    }
    return hits
  }

  const fixtures = [
    {
      code: "const ua = navigator.userAgent.toLowerCase()\nif (ua.includes('android')) {}",
      detected: true
    },
    {
      code: "const ua = navigator['userAgent']\nif (/iphone/.test(ua)) {}",
      detected: true
    },
    {
      code: "if (navigator.userAgent.toLowerCase().includes('ipad')) {}",
      detected: true
    },
    { code: "// navigator.userAgent includes android\nconst note = 'android docs'", detected: false },
    { code: "const url = 'https://android.example/path'", detected: false }
  ]
  for (const fixture of fixtures) {
    const actual = detectUaBrandChecks(fixture.code).length > 0
    if (actual !== fixture.detected) {
      fail(`UA 守卫自测失败：${JSON.stringify(fixture.code)}`)
    }
  }

  const targets = [
    ...walkFiles(join(repoRoot, 'src/components'), ['.vue']),
    ...walkFiles(join(repoRoot, 'src/composables'), ['.ts', '.js'])
  ]
  const hits = []
  for (const file of targets) {
    for (const hit of detectUaBrandChecks(readFileSync(file, 'utf8'))) {
      hits.push(`${rel(file)}:${hit.line}: ${hit.snippet}`)
    }
  }
  if (hits.length > 0) {
    fail(
      `组件/composables 内发现 ${hits.length} 处直接 UA 品牌判断（应收敛到 src/platform/runtime.ts）：`
    )
    for (const hit of hits) console.error(`    ${hit}`)
  } else {
    pass('UA 守卫自测通过，组件/composables 无 iphone/ipad/ipod/android 直接判断')
  }
}

// ------------------------------------------------- 3. sync_grades 必须走 GradeService
{
  const extractHandler = (src, name) => {
    const start = src.indexOf(`async fn ${name}(`)
    if (start < 0) return null
    const rest = src.slice(start)
    const next = rest.search(/\nasync fn /)
    return next < 0 ? rest : rest.slice(0, next)
  }
  const transports = [
    [
      'src-tauri/src/transport/tauri/grades.rs',
      read('src-tauri/src/transport/tauri/grades.rs')
    ],
    [
      'src-tauri/src/http_server/routes/academic.rs',
      read('src-tauri/src/http_server/routes/academic.rs')
    ]
  ]
  for (const [label, src] of transports) {
    const body = extractHandler(src, 'sync_grades')
    if (body === null) {
      fail(`${label} 未找到 async fn sync_grades handler`)
      continue
    }
    const hasCtor = /GradeService::new/.test(body)
    const hasCall = /\.sync_grades\(/.test(body)
    if (!hasCtor || !hasCall) {
      fail(
        `${label} 的 sync_grades handler 未构造/调用 grade::service::GradeService` +
          (hasCtor ? '' : '（缺少 GradeService::new）') +
          (hasCall ? '' : '（缺少 .sync_grades( 调用）')
      )
      continue
    }
    if (label.endsWith('http_server/routes/academic.rs')) {
      const forwardsCurrentOnly = /req\.current_only\.or\(req\.teacher_current_only\)/.test(body) &&
        /\.sync_grades\(uid\.as_deref\(\),\s*current_only\)/s.test(body)
      const hardcodesFalse = /\.sync_grades\(uid\.as_deref\(\),\s*false\)/s.test(body)
      if (!forwardsCurrentOnly || hardcodesFalse) {
        fail(`${label} 的 sync_grades 未透传 current_only/teacher_current_only，或仍硬编码 false`)
        continue
      }
    }
    pass(`${label} sync_grades handler 构造并调用 GradeService，参数语义一致`)
  }
}

// ------------------------------------------------- 4. modules/grades.rs 不得存在
{
  if (existsSync(join(repoRoot, 'src-tauri/src/modules/grades.rs'))) {
    fail('src-tauri/src/modules/grades.rs 不应存在：成绩域已收敛到 src-tauri/src/grade/')
  } else {
    pass('src-tauri/src/modules/grades.rs 不存在（成绩域已收敛到 grade/）')
  }
}

// ------------------------------------------------- 5. ICS 函数唯一定义于 utils/ics.rs
{
  const ICS_FNS = ['sanitize_filename_part', 'escape_ics_text', 'fold_ics_line', 'parse_ics_datetime']
  const icsSrc = read('src-tauri/src/utils/ics.rs')
  if (icsSrc === null) {
    fail('src-tauri/src/utils/ics.rs 不存在：ICS 共享模块缺失')
  } else {
    for (const fn of ICS_FNS) {
      if (!new RegExp(`pub fn ${fn}\\b`).test(icsSrc)) {
        fail(`utils/ics.rs 未定义 pub fn ${fn}`)
      }
    }
    if (ICS_FNS.every((fn) => new RegExp(`pub fn ${fn}\\b`).test(icsSrc))) {
      pass('四个 ICS 函数均定义于 utils/ics.rs')
    }
  }
  for (const [label, src] of [
    [
      'src-tauri/src/transport/tauri/schedule.rs',
      read('src-tauri/src/transport/tauri/schedule.rs')
    ],
    [
      'src-tauri/src/http_server/routes/schedule.rs',
      read('src-tauri/src/http_server/routes/schedule.rs')
    ]
  ]) {
    let ok = true
    for (const fn of ICS_FNS) {
      if (new RegExp(`fn ${fn}\\b`).test(src)) {
        fail(`${label} 仍直接定义 ${fn}：应只从 utils::ics import 复用`)
        ok = false
      }
    }
    if (!/utils::ics/.test(src)) {
      fail(`${label} 未 import utils::ics（ICS 共享函数应只 import 复用）`)
      ok = false
    }
    if (ok) pass(`${label} 仅 import 复用 utils::ics 的四个 ICS 函数（无本地定义）`)
  }
}

console.log('')
if (failures.length > 0) {
  console.error(`架构守卫失败：${failures.length} 项违规`)
  process.exit(1)
}
console.log('架构守卫全部通过（check:architecture）')
