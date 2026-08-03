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
  // UA 正则字面量：/...iphone|ipad|ipod|android.../flags
  const UA_REGEX_LITERAL = /\/[^/\n]*(?:iphone|ipad|ipod|android)[^/\n]*\/[a-z]*/i
  // 同一行内同时出现 UA 来源与品牌关键字（userAgent.includes('iPhone') 等字符串判断）
  const UA_SOURCE = /\b(?:navigator\.userAgent|userAgentData)\b/
  const UA_BRAND = /\b(?:iphone|ipad|ipod|android)\b/i

  const targets = [
    ...walkFiles(join(repoRoot, 'src/components'), ['.vue']),
    ...walkFiles(join(repoRoot, 'src/composables'), ['.ts', '.js'])
  ]
  const hits = []
  for (const file of targets) {
    const lines = readFileSync(file, 'utf8').split('\n')
    for (let i = 0; i < lines.length; i++) {
      const code = lines[i].split('//')[0] // 剔除行注释，避免误报文档性说明
      if (UA_REGEX_LITERAL.test(code) || (UA_SOURCE.test(code) && UA_BRAND.test(code))) {
        hits.push(`${rel(file)}:${i + 1}: ${lines[i].trim()}`)
      }
    }
  }
  if (hits.length > 0) {
    fail(
      `组件/composables 内发现 ${hits.length} 处直接 UA 品牌判断（应收敛到 src/platform/runtime.ts；Mobile/HarmonyOS 业务特定判断不受限）：`
    )
    for (const h of hits) console.error(`    ${h}`)
  } else {
    pass('组件/composables 无新增 iphone/ipad/ipod/android UA 直接判断')
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
    ['src-tauri/src/lib.rs', read('src-tauri/src/lib.rs')],
    ['src-tauri/src/http_server.rs', read('src-tauri/src/http_server.rs')]
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
    } else {
      pass(`${label} sync_grades handler 构造并调用 grade::service::GradeService`)
    }
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
    ['src-tauri/src/lib.rs', read('src-tauri/src/lib.rs')],
    ['src-tauri/src/http_server.rs', read('src-tauri/src/http_server.rs')]
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
