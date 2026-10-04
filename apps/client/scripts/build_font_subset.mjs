// 生成 Material Symbols 图标子集字体（只保留源码真正用到的 ligature 字形）。
//
// 用法：
//   node scripts/build_font_subset.mjs                  重新扫描源码并生成子集 + manifest
//   node scripts/build_font_subset.mjs --manifest-only  只根据现有 woff2 刷新 glyph-manifest.json（不改字体）
//   node scripts/build_font_subset.mjs --check          只校验「源码用到的图标名 ⊆ 字体可渲染名」，缺失则退出码 1
//
// 依赖：pip install fonttools brotli（Python 解释器优先取 MINI_HBUT_PYTHON，其次
// python3 / python / py -3.13）。
//
// 字形集合来自 icon_source_scan.mjs 的源码扫描（strong + weak 宽口径），不再维护任何
// 硬编码名单：硬编码名单正是历史上子集与源码脱节的根因。

import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { scanIconNames } from './icon_source_scan.mjs'
import { PYTHON_HELPER_NAME, resolvePythonCommand } from './font_subset_python.mjs'

const PROJECT_ROOT = process.cwd()
const SRC_FONT = join(PROJECT_ROOT, 'node_modules/material-symbols/material-symbols-outlined.woff2')
const OUTPUT_DIR = join(PROJECT_ROOT, 'public/fonts')
const OUTPUT_FONT = join(OUTPUT_DIR, 'material-symbols-outlined.subset.woff2')
// #973：manifest 是开发/审计元数据（运行时零消费者），放 scripts/fonts/ 避免被 Vite
// 从 public/ 原样复制进 dist 随安装包发布；生成器与契约测试共用这一路径。
const MANIFEST_PATH = join(PROJECT_ROOT, 'scripts', 'fonts', 'glyph-manifest.json')
const PY_HELPER = join(PROJECT_ROOT, 'scripts', PYTHON_HELPER_NAME)

/** 与仓库根 website/modules-src 对齐（Worktree 布局下 apps/client 深度固定） */
const EXTRA_SCAN_ROOTS = [resolve(PROJECT_ROOT, '../../website/modules-src')]

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

/** 收集本次要交给子集器的图标名：strong 全要，weak 由 Python 侧按源字体过滤 */
export const collectIconNames = ({ cwd = PROJECT_ROOT } = {}) => {
  const scanned = scanIconNames({ cwd, extraRoots: EXTRA_SCAN_ROOTS })
  const requested = new Set([...scanned.strong, ...scanned.weak])
  return {
    requested: [...requested].sort(),
    strong: scanned.strong,
    weak: scanned.weak,
    iconKeys: scanned.iconKeys,
    unresolvedIconKeys: scanned.unresolvedIconKeys
  }
}

const runPython = (args, pythonCommand) => {
  const [executable, ...prefixArgs] = pythonCommand
  execFileSync(executable, [...prefixArgs, PY_HELPER, ...args], { stdio: 'inherit', cwd: PROJECT_ROOT })
}

const readManifest = () => {
  if (!existsSync(MANIFEST_PATH)) return null
  try {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  } catch {
    return null
  }
}

/** 只校验缺口：源码 strong ⊆ manifest.ligatureNames */
const checkOnly = () => {
  const manifest = readManifest()
  if (!manifest) {
    console.error('[font-subset] glyph-manifest.json 不存在，先运行 node scripts/build_font_subset.mjs')
    return 1
  }
  const { strong } = collectIconNames()
  const available = new Set(manifest.ligatureNames || [])
  const missing = strong.filter((name) => !available.has(name))
  console.log(`[font-subset] 源码用到 ${strong.length} 个图标名，字体可渲染 ${available.size} 个`)
  if (missing.length) {
    console.error(`[font-subset] 缺失 ${missing.length} 个字形：${missing.join(', ')}`)
    return 1
  }
  console.log('[font-subset] 缺口为零')
  return 0
}

/** 只刷新 manifest：解析现有字体，不重新生成 */
const manifestOnly = (pythonCommand) => {
  if (!existsSync(OUTPUT_FONT)) {
    console.error(`[font-subset] 字体不存在：${OUTPUT_FONT}`)
    return 1
  }
  const tmp = mkdtempSync(join(tmpdir(), 'mini-hbut-font-manifest-'))
  const dumpPath = join(tmp, 'font-facts.json')
  try {
    runPython(['dump-names', '--font', OUTPUT_FONT, '--output', dumpPath], pythonCommand)
    const facts = JSON.parse(readFileSync(dumpPath, 'utf8'))
    const manifest = {
      schemaVersion: 1,
      fontFile: 'material-symbols-outlined.subset.woff2',
      fontSha256: sha256(OUTPUT_FONT),
      fontBytes: statSync(OUTPUT_FONT).size,
      glyphCount: facts.glyphCount,
      cmapChars: facts.cmapChars,
      ligatureNameCount: facts.ligatureNameCount,
      ligatureNames: facts.ligatureNames
    }
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    console.log(
      `[font-subset] manifest 已刷新：${manifest.ligatureNameCount} 个 ligature，` +
        `${manifest.glyphCount} 个字形，sha256=${manifest.fontSha256.slice(0, 12)}…`
    )
    return 0
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

/** 重新生成子集字体与 manifest */
const regenerate = (pythonCommand) => {
  if (!existsSync(SRC_FONT)) {
    console.warn('[font-subset] 未找到 material-symbols 源字体，先执行 npm install')
    return 1
  }

  const { requested, strong, weak } = collectIconNames()
  console.log(`[font-subset] 源码扫描：strong=${strong.length} weak=${weak.length} 合计=${requested.length}`)

  const tmp = mkdtempSync(join(tmpdir(), 'mini-hbut-font-subset-'))
  const namesPath = join(tmp, 'icon-names.json')
  const manifestPath = join(tmp, 'font-facts.json')
  try {
    writeFileSync(namesPath, JSON.stringify(requested), 'utf8')
    runPython(
      [
        'subset',
        '--source', SRC_FONT,
        '--output', OUTPUT_FONT,
        '--names', namesPath,
        '--manifest', manifestPath
      ],
      pythonCommand
    )

    const facts = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const manifest = {
      schemaVersion: 1,
      fontFile: 'material-symbols-outlined.subset.woff2',
      fontSha256: sha256(OUTPUT_FONT),
      fontBytes: statSync(OUTPUT_FONT).size,
      glyphCount: facts.glyphCount,
      cmapChars: facts.cmapChars,
      ligatureNameCount: facts.ligatureNames.length,
      ligatureNames: facts.ligatureNames,
      requestedNameCount: facts.requestedNameCount,
      missingFromSourceFont: facts.missingFromSourceFont,
      // #974：变体轴清单（由 Python 产物回读产出），契约测试据此断言 FILL 轴在场
      variationAxes: facts.variationAxes
    }
    writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

    const srcSize = statSync(SRC_FONT).size
    console.log(
      `[font-subset] ${(srcSize / 1024 / 1024).toFixed(1)} MB → ${(manifest.fontBytes / 1024).toFixed(0)} KB ` +
        `(${manifest.ligatureNameCount} 个 ligature)`
    )

    const available = new Set(manifest.ligatureNames)
    const missingStrong = strong.filter((name) => !available.has(name))
    if (missingStrong.length) {
      console.error(`[font-subset] 生成后仍缺失 ${missingStrong.length} 个源码图标名：${missingStrong.join(', ')}`)
      return 1
    }
    return 0
  } finally {
    rmSync(tmp, { recursive: true, force: true })
  }
}

const main = () => {
  const args = process.argv.slice(2)
  if (args.includes('--check')) return checkOnly()

  const pythonCommand = resolvePythonCommand()
  if (!pythonCommand) {
    console.warn('[font-subset] 未找到可用的 Python + fontTools，跳过字体处理')
    return 1
  }

  if (args.includes('--manifest-only')) return manifestOnly(pythonCommand)
  return regenerate(pythonCommand)
}

// 作为脚本执行时才跑 main；被 import 时只导出纯函数，方便单测
const isDirectRun = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/build_font_subset.mjs')
if (isDirectRun) {
  try {
    process.exitCode = main()
  } catch (error) {
    console.error('[font-subset] 失败：', error?.message || error)
    process.exitCode = 1
  }
}
