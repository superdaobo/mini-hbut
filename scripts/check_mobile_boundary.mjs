#!/usr/bin/env node
// 移动端发布构建反向守卫（Issue #595 验收 7/8）
// - 隐藏模块不得重新进入发布包：dist/assets 不得出现预期排除的 chunk（ForumView/MoreShuake/OnlineLearning 等）
// - 保留能力不得被精简误删：dist 必须包含 ChaoxingHubView 课程中心 chunk，且 Rust 命令注册保留
// 用法：
//   node scripts/check_mobile_boundary.mjs \
//     --dist dist \
//     --expect-excluded ForumView,MoreShuake,OnlineLearning \
//     --expect-kept ChaoxingHubView
// 退出码：0=全部通过；1=任一守卫失败（机械失败，供 CI 门禁）。
import fs from 'node:fs'
import path from 'node:path'

const parseArgs = () => {
  const args = process.argv.slice(2)
  const get = (key) => {
    const index = args.indexOf(key)
    return index >= 0 ? args[index + 1] : ''
  }
  return {
    distDir: path.resolve(process.cwd(), get('--dist') || 'dist'),
    expectExcluded: (get('--expect-excluded') || '').split(',').map((s) => s.trim()).filter(Boolean),
    expectKept: (get('--expect-kept') || '').split(',').map((s) => s.trim()).filter(Boolean),
    checkRustRegistry: args.includes('--check-rust-registry')
  }
}

const walkFiles = (dir, out = []) => {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(full, out)
    else out.push(full)
  }
  return out
}

const main = () => {
  const options = parseArgs()
  const failures = []
  const assetFiles = walkFiles(options.distDir).map((file) => path.basename(file))

  // 守卫 1：隐藏模块 chunk 不得出现在发布包
  for (const name of options.expectExcluded) {
    const matched = assetFiles.filter((file) => file.includes(name))
    if (matched.length > 0) {
      failures.push(`隐藏模块 ${name} 重新进入 dist：${matched.join(', ')}`)
    } else {
      console.log(`[mobile-boundary] ✓ 隐藏模块 ${name} 未出现在 dist`)
    }
  }

  // 守卫 2：保留能力 chunk 必须存在
  for (const name of options.expectKept) {
    const matched = assetFiles.filter((file) => file.includes(name))
    if (matched.length === 0) {
      failures.push(`保留能力 ${name} 的 chunk 缺失（可能被误精简）`)
    } else {
      console.log(`[mobile-boundary] ✓ 保留能力 ${name} chunk 存在：${matched.join(', ')}`)
    }
  }

  // 守卫 3（可选）：Rust 命令注册保留（ChaoxingHub 课程能力源码级检查）
  if (options.checkRustRegistry) {
    const libPath = path.resolve(process.cwd(), 'src-tauri/src/lib.rs')
    const libSource = fs.readFileSync(libPath, 'utf8')
    const requiredCommands = [
      'chaoxing_fetch_courses',
      'chaoxing_get_knowledge_cards',
      'chaoxing_get_video_status'
    ]
    for (const command of requiredCommands) {
      if (!libSource.includes(command)) {
        failures.push(`Rust 注册表缺失保留命令 ${command}`)
      } else {
        console.log(`[mobile-boundary] ✓ Rust 保留命令 ${command} 已注册`)
      }
    }
  }

  if (failures.length > 0) {
    console.error('[mobile-boundary] 守卫失败：')
    for (const failure of failures) console.error(`  - ${failure}`)
    process.exitCode = 1
  } else {
    console.log('[mobile-boundary] 移动端发布边界守卫全部通过')
  }
}

main()
