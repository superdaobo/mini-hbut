#!/usr/bin/env node
/**
 * Mini-HBUT Windows Deep Link Smoke（#628 L4：Tauri/Desktop Integration）。
 *
 * 真实“系统 scheme 注册 → 唤起 App → 单实例转发”的验证不能只靠 unit test
 * （#628 第 7 节），但也不能在无头 CI 里自动完成。本脚本拆成两半：
 *
 * 1) `--check`（默认）：自动化静态 contract 检查——tauri.conf.json / Cargo.toml /
 *    capabilities / lib.rs 插件顺序 / 前端统一 parser，全部可本地与 CI 执行；
 *    另在 Windows 上探测注册表 `HKEY_CLASSES_ROOT\minihbut`（dev 模式 register_all()
 *    的副作用；未注册只警告不失败，因为生产安装器会在安装时注册）。
 * 2) `--steps`：输出 7 步人工 smoke 清单（app 关闭→深链冷启动→已启动热深链→
 *    单实例→最小化恢复→invalid link 不崩溃），带验证标准与预期结果，
 *    供 L8 real-device checklist 与 runbook 引用；`--json` 输出机器可读版本。
 *
 * 用法（主仓库根目录执行）：
 *   node scripts/identity_deep_link_smoke.mjs            # 静态 contract 检查
 *   node scripts/identity_deep_link_smoke.mjs --steps    # 打印人工 smoke 步骤
 *   node scripts/identity_deep_link_smoke.mjs --self-test# 内嵌逻辑自测
 *
 * 退出码：0=通过（--steps 恒 0）；1=任一 contract 失败。
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { spawnSync } from 'node:child_process'

const repoRoot = process.cwd()
const results = []

function ok(message) {
  results.push({ level: 'ok', message })
  console.log(`[deep-link-smoke] ✓ ${message}`)
}
function warn(message) {
  results.push({ level: 'warn', message })
  console.warn(`[deep-link-smoke] ⚠ ${message}`)
}
function fail(message) {
  results.push({ level: 'fail', message })
  console.error(`[deep-link-smoke] ✗ ${message}`)
}

/** 只读 JSON（缺失返回 null） */
function readJson(relPath) {
  const full = path.join(repoRoot, relPath)
  if (!fs.existsSync(full)) return null
  try {
    return JSON.parse(fs.readFileSync(full, 'utf8'))
  } catch (err) {
    fail(`无法解析 ${relPath}：${err.message}`)
    return null
  }
}

/** 静态 contract 检查（可与 mobile scheme guard 互补，桌面侧） */
function checkStaticContract() {
  console.log('\n== 静态 contract 检查 ==')

  const tauriConf = readJson('src-tauri/tauri.conf.json')
  if (tauriConf) {
    const deepLink = tauriConf.plugins?.deepLink ?? tauriConf.plugins?.['deep-link']
    const schemes = deepLink?.desktop?.schemes ?? []
    if (Array.isArray(schemes) && schemes.includes('minihbut')) {
      ok('tauri.conf.json desktop schemes 包含 minihbut（统一 source）')
    } else {
      fail(`tauri.conf.json desktop schemes 缺少 minihbut：${JSON.stringify(schemes)}`)
    }
  }

  const capability = fs.existsSync('src-tauri/capabilities/main.json')
    ? fs.readFileSync('src-tauri/capabilities/main.json', 'utf8')
    : ''
  if (capability.includes('deep-link:default')) {
    ok('capabilities/main.json 含 deep-link:default（JS API 最小权限）')
  } else {
    fail('capabilities/main.json 缺少 deep-link:default')
  }

  const lib = fs.existsSync('src-tauri/src/lib.rs') ? fs.readFileSync('src-tauri/src/lib.rs', 'utf8') : ''
  const siPos = lib.indexOf('tauri_plugin_single_instance::init')
  const dlPos = lib.indexOf('tauri_plugin_deep_link::init')
  if (siPos >= 0 && dlPos >= 0 && siPos < dlPos) {
    ok('lib.rs：single-instance 先于 deep-link 注册（第二实例深链转发契约）')
  } else {
    fail('lib.rs 插件顺序异常（single_instance 必须在 deep-link 之前）')
  }
  if (lib.includes('register_all')) {
    ok('lib.rs 含 register_all()（Windows debug / Linux 注册 scheme）')
  } else {
    fail('lib.rs 缺少 register_all()')
  }
  // 单实例回调必须聚焦主窗口且不打印 argv（argv 含 handoff secret）
  if (/unminimize\(\)/.test(lib) && /set_focus\(\)/.test(lib)) {
    ok('single-instance 回调恢复最小化窗口并聚焦（unminimize/show/set_focus）')
  } else {
    fail('single-instance 回调未恢复/聚焦主窗口')
  }
  if (lib.includes('_argv') && !/println!.{0,80}argv/s.test(lib)) {
    ok('single-instance 回调不打印 argv（深链含 handoff，禁止入日志）')
  } else {
    fail('single-instance 回调疑似打印 argv（会泄露 handoff）')
  }

  const deepLinkTs = fs.existsSync('src/platform/deep_link.ts')
    ? fs.readFileSync('src/platform/deep_link.ts', 'utf8')
    : ''
  for (const symbol of ['parseMiniHbutDeepLink', 'installMiniHbutDeepLinkListeners']) {
    if (deepLinkTs.includes(symbol)) ok(`src/platform/deep_link.ts 导出 ${symbol}`)
    else fail(`src/platform/deep_link.ts 缺少导出 ${symbol}`)
  }
  // parser 契约：identity host、request_id/handoff 参数、禁止 userinfo
  if (deepLinkTs.includes("'identity'") || deepLinkTs.includes('"identity"')) {
    ok('deep_link.ts 识别 hostname=identity 分支')
  } else {
    fail('deep_link.ts 未识别 identity host 分支')
  }
}

/** Windows 注册表探测（dev 模式 register_all 的副作用；失败只警告） */
function probeWindowsRegistry() {
  if (process.platform !== 'win32') {
    warn(`非 Windows 平台（${process.platform}），跳过注册表探测`)
    return
  }
  const probe = spawnSync(
    'reg',
    ['query', 'HKEY_CLASSES_ROOT\\minihbut', '/ve'],
    { encoding: 'utf8', windowsHide: true },
  )
  if (probe.status === 0) {
    ok('Windows 注册表 HKEY_CLASSES_ROOT\\minihbut 已注册（dev 或安装器注册）')
  } else {
    warn(
      'Windows 注册表未发现 minihbut 协议。dev 模式下启动一次 App（触发 register_all）后' +
        '再检查；生产包由安装器注册。此警告不阻塞 CI。',
    )
  }
}

/** 7 步人工 smoke 清单（L8 / runbook 引用） */
const MANUAL_STEPS = [
  {
    step: 1,
    name: '冷启动深链（App 关闭）',
    how: '完全退出 Mini-HBUT（确认进程树无残留），在浏览器/运行框打开：' +
      'minihbut://identity?request_id=req_smoke_cold&handoff=ho_smoke_cold_demo_only',
    expect: 'App 全新启动，Identity Approval Overlay 出现并显示该 request 的状态；' +
      '启动 URL 被 getCurrent() 读到并送入 IdentityCoordinator（#621 cold start）。',
  },
  {
    step: 2,
    name: '热深链（App 已运行）',
    how: 'App 打开状态下再次打开同一深链（可换 request_id）。',
    expect: '不启动第二个进程；onOpenUrl 事件触发，Overlay 切换到新 request；' +
      '窗口恢复并聚焦（如果最小化/被遮挡）。',
  },
  {
    step: 3,
    name: '单实例（唯一主进程）',
    how: '连续快速触发 3 次深链，检查任务管理器中 Mini-HBUT 进程数。',
    expect: '始终只有 1 个主实例；single-instance 回调把 argv 转发给已运行实例。',
  },
  {
    step: 4,
    name: '最小化恢复',
    how: '最小化窗口后触发深链。',
    expect: '窗口 unminimize + show + set_focus，无需手动点击任务栏。',
  },
  {
    step: 5,
    name: 'Invalid deep link 不崩溃',
    how: '打开 minihbut://identity（缺 request_id/handoff）、minihbut://unknown-host、' +
      'minihbut://identity?request_id=..%2F..%2Fetc 等畸形链接。',
    expect: 'App 不崩溃；无效链接只显示通用错误或静默忽略；错误信息不回显 handoff/URL。',
  },
  {
    step: 6,
    name: '日志无 handoff 泄漏',
    how: '完成 1-5 后检查终端 stdout（dev）、App 日志目录。',
    expect: '任何日志/崩溃报告中都不出现 handoff 值；完整深链 URL 不打印（#621 要求）。',
  },
  {
    step: 7,
    name: '回归：小组件深链',
    how: '触发 minihbut://schedule、minihbut://electricity、minihbut://exam。',
    expect: '原有小组件跳转行为不变（#621 统一 parser 不破坏 legacy 路径）。',
  },
]

/** --steps：输出人工 smoke 清单 */
function printSteps(json) {
  if (json) {
    console.log(JSON.stringify(MANUAL_STEPS, null, 2))
    return
  }
  console.log('\n== Windows Deep Link 人工 Smoke 清单（7 步） ==')
  console.log('fixture 深链仅用于 smoke，不携带真实 secret；每次执行后更新状态到 runbook。\n')
  for (const s of MANUAL_STEPS) {
    console.log(`【步骤 ${s.step}】${s.name}`)
    console.log(`  操作：${s.how}`)
    console.log(`  预期：${s.expect}`)
    console.log('')
  }
}

/** 内嵌自测：验证步骤清单结构等纯逻辑 */
function selfTest() {
  console.log('\n== 内嵌自测 ==')
  const ids = MANUAL_STEPS.map((s) => s.step)
  if (ids.join(',') === '1,2,3,4,5,6,7') ok('步骤清单 1..7 完整')
  else fail(`步骤清单异常：${ids.join(',')}`)
  const allFields = MANUAL_STEPS.every((s) => s.name && s.how && s.expect)
  if (allFields) ok('每步含 操作/预期 字段')
  else fail('存在缺字段的步骤')
}

function main() {
  const args = process.argv.slice(2)
  if (args.includes('--self-test')) {
    selfTest()
    const failed = results.filter((r) => r.level === 'fail').length
    console.log(`\n[deep-link-smoke] 自测完成：${results.length - failed} 通过 / ${failed} 失败`)
    process.exit(failed === 0 ? 0 : 1)
  }
  if (args.includes('--steps')) {
    printSteps(args.includes('--json'))
    process.exit(0)
  }
  checkStaticContract()
  probeWindowsRegistry()
  const failed = results.filter((r) => r.level === 'fail').length
  console.log(
    `\n[deep-link-smoke] 结果：${results.filter((r) => r.level === 'ok').length} 通过 / ${failed} 失败` +
      ` / ${results.filter((r) => r.level === 'warn').length} 警告`,
  )
  process.exit(failed === 0 ? 0 : 1)
}

main()
