#!/usr/bin/env node
/**
 * 同步 Tauri「应用命令」的授权基线（#1169 收尾 / IPC 根治）。
 *
 * 背景：Tauri v2 默认把 `invoke_handler` 注册的应用命令开放给**所有** webview，
 * 包括承载远程内容的模块窗口/内嵌页。要收窄必须两步：
 *   1. `build.rs` 里用 `tauri_build::AppManifest::new().commands(&[...])` 声明命令清单
 *      → Tauri 自动生成 `allow-<command>` / `deny-<command>` 权限；
 *   2. `capabilities/main.json` 里为每个命令显式授权。
 * 本脚本负责把这两处按 `lib.rs` 的 `generate_handler!` **重新生成**，保持单一事实源。
 *
 * 用法：
 *   node scripts/sync_tauri_command_grants.mjs           # 写入
 *   node scripts/sync_tauri_command_grants.mjs --check   # 只校验（CI 用），有差异退出 1
 *
 * 生成规则：
 *   - 命令名取 `generate_handler![...]` 条目的**最后一段**（`a::b::cmd` → `cmd`）；
 *   - 去重 + 字典序排序，保证幂等；
 *   - build.rs 只改写 `// BEGIN APP_COMMANDS` 与 `// END APP_COMMANDS` 之间的块；
 *   - main.json 只增删「自定义应用命令」授权（`allow-<cmd>` 且 cmd 属于本次清单），
 *     保留 `core:*` / 插件权限等既有条目与它们的顺序。
 */
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP_ROOT = path.resolve(HERE, '..')
const LIB_RS = path.join(APP_ROOT, 'src-tauri', 'src', 'lib.rs')
const BUILD_RS = path.join(APP_ROOT, 'src-tauri', 'build.rs')
const CAPABILITY = path.join(APP_ROOT, 'src-tauri', 'capabilities', 'main.json')

const BEGIN = '// BEGIN APP_COMMANDS'
const END = '// END APP_COMMANDS'

/** 从 `generate_handler![ ... ]` 里抽出命令名（最后一段标识符）。 */
export const extractCommands = (source) => {
  const start = source.indexOf('generate_handler![')
  if (start < 0) throw new Error('未找到 generate_handler!')
  // 括号配对找到结尾（宏参数里不含字符串里的方括号，这里按字符扫描最稳）
  let depth = 0
  let end = -1
  for (let i = source.indexOf('[', start); i < source.length; i += 1) {
    const ch = source[i]
    if (ch === '[') depth += 1
    else if (ch === ']') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  if (end < 0) throw new Error('generate_handler! 括号未闭合')
  const body = source.slice(start, end)
  const names = new Set()
  // 逐行处理，跳过 `#[cfg(...)]` 之类的属性行
  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('//') || line.startsWith('#[') || line.startsWith('//!')) continue
    const matches = line.matchAll(/([A-Za-z_][A-Za-z0-9_:]*)\s*,?/g)
    for (const match of matches) {
      const full = match[1]
      // 过滤宏自身与路径分隔符残留
      if (!full.includes('::') && full === 'generate_handler') continue
      const name = full.split('::').pop()
      if (!name || name === 'generate_handler') continue
      names.add(name)
    }
  }
  return [...names].sort()
}

const buildRsContent = (commands) => {
  const list = commands.map((name) => `        "${name}",`).join('\n')
  return `fn main() {
    println!("cargo:rerun-if-changed=icons/icon.ico");
    // 应用命令声明：让 Tauri 为每个命令生成 allow-<command> / deny-<command> 权限。
    // 不声明的话，注册进 invoke_handler 的命令对**所有 webview**（含承载远程内容的
    // 模块窗口/内嵌页）一律可见；声明后必须由 capability 显式授权。
    // 本块由 scripts/sync_tauri_command_grants.mjs 生成，勿手改。
${BEGIN}
    let app_commands: &[&str] = &[
${list}
    ];
${END}
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(app_commands),
        ),
    )
    .expect("tauri build 失败");
}
`
}

/**
 * 命令名 → 权限名：Tauri 在 `autogenerate_command_permissions` 里把命令名做
 * `replace('_', '-')`（snake_case → kebab-case），权限标识符只允许小写 ASCII 与连字符。
 * 因此 `add_schedule_event` 对应的授权条目是 `allow-add-schedule-event`。
 */
export const commandToPermission = (name) => `allow-${name.replace(/_/g, '-')}`

/** 权限名 → 命令名（反向，供守门脚本与幂等过滤使用）。 */
export const permissionToCommand = (permission) =>
  permission.replace(/^allow-/, '').replace(/-/g, '_')

const syncCapability = (source, commands) => {
  const data = JSON.parse(source)
  const wanted = new Set(commands.map(commandToPermission))
  // 保留非「应用命令授权」的条目（core:*、插件权限，以及不属于本次清单的 allow-*）。
  // 注意要按**归一化后的命令名**判定，否则历史上写歪的大小写形态（snake_case）会残留下来。
  const commandSet = new Set(commands)
  const kept = (data.permissions || []).filter(
    (item) => !(item.startsWith('allow-') && commandSet.has(permissionToCommand(item)))
  )
  const merged = [...kept, ...wanted]
  data.permissions = merged
  return JSON.stringify(data, null, 2) + '\n'
}

const main = () => {
  const checkOnly = process.argv.includes('--check')
  const libSource = readFileSync(LIB_RS, 'utf8')
  const commands = extractCommands(libSource)
  const nextBuild = buildRsContent(commands)
  const nextCapability = syncCapability(readFileSync(CAPABILITY, 'utf8'), commands)

  const problems = []
  if (readFileSync(BUILD_RS, 'utf8') !== nextBuild) problems.push('build.rs 的 APP_COMMANDS 块与 lib.rs 不一致')
  if (readFileSync(CAPABILITY, 'utf8') !== nextCapability) problems.push('capabilities/main.json 的应用命令授权与 lib.rs 不一致')

  if (checkOnly) {
    if (problems.length) {
      console.error(`❌ 应用命令授权不同步（共 ${commands.length} 条命令）：`)
      for (const item of problems) console.error(`   - ${item}`)
      console.error('   修复：node scripts/sync_tauri_command_grants.mjs')
      process.exit(1)
    }
    console.log(`✅ 应用命令授权已同步（${commands.length} 条命令）`)
    return
  }

  if (!problems.length) {
    console.log(`✅ 无需改动（${commands.length} 条命令）`)
    return
  }
  writeFileSync(BUILD_RS, nextBuild)
  writeFileSync(CAPABILITY, nextCapability)
  console.log(`✅ 已同步 ${commands.length} 条应用命令授权到 build.rs + capabilities/main.json`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
}
