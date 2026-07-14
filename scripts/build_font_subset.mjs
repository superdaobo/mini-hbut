// Build subset Material Symbols font containing only icons used in source code.
// Requires: pip install fonttools brotli

import { execSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const WALK_EXTS = ['.vue', '.ts', '.js', '.css', '.rs']
const SRC_DIR = join(process.cwd(), 'src')
const FONT_SRC = join(process.cwd(), 'node_modules/material-symbols/material-symbols-outlined.woff2')
const OUTPUT_DIR = join(process.cwd(), 'public/fonts')
const OUTPUT_FILE = join(OUTPUT_DIR, 'material-symbols-outlined.subset.woff2')

function walk(dir, exts, out = []) {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    const fp = join(dir, e.name)
    if (e.isDirectory()) { walk(fp, exts, out) }
    else if (exts.some(x => fp.endsWith(x))) { out.push(fp) }
  }
  return out
}

function collectIcons() {
  const files = walk(SRC_DIR, WALK_EXTS)
  const icons = new Set()

  for (const f of files) {
    const content = readFileSync(f, 'utf8')
    // Hardcoded: <span class="material-symbols-outlined ...">ICON</span>（允许空白/换行）
    for (const m of content.matchAll(
      /material-symbols-outlined[^>]*>\s*([a-z][a-z0-9_]*)\s*<\/span>/g
    )) {
      if (m[1] && !m[1].startsWith('fa-')) icons.add(m[1])
    }
    // 三元表达式内图标：? 'download' : 'progress_activity'
    for (const m of content.matchAll(
      /material-symbols-outlined[\s\S]{0,120}?\?\s*'([a-z][a-z0-9_]*)'\s*:\s*'([a-z][a-z0-9_]*)'/g
    )) {
      if (m[1]) icons.add(m[1])
      if (m[2]) icons.add(m[2])
    }
    // Data-driven: icon: 'ICON'
    for (const m of content.matchAll(/icon\s*:\s*'([a-z_]+)'/g)) {
      if (m[1] && !m[1].startsWith('fa-') && m[1].length > 2) icons.add(m[1])
    }
    // Icon map values: '任意key': 'ICON_NAME'（如 StudentInfoView 的 iconMap）
    for (const m of content.matchAll(/'[^']*'\s*:\s*'([a-z][a-z0-9_]*)'/g)) {
      if (m[1] && !m[1].startsWith('fa-') && m[1].length > 2) icons.add(m[1])
    }
    // 动态 iconMap 块（ThemeModuleIcon 等）
    for (const m of content.matchAll(/iconMap\s*=\s*\{([\s\S]*?)\}/g)) {
      for (const icon of m[1].matchAll(/:\s*'([a-z][a-z0-9_]*)'/g)) {
        if (icon[1]) icons.add(icon[1])
      }
    }
  }

  // Weather icons from Rust backend
  for (const name of ['sunny', 'partly_cloudy_day', 'cloud', 'mist', 'rainy', 'thunderstorm', 'cloudy_snowing']) {
    icons.add(name)
  }

  // 学习通预览底栏等常用图标（防止子集过期漏扫）
  for (const name of [
    'swap_horiz',
    'open_in_browser',
    'progress_activity',
    'expand_less',
    'expand_more',
    'preview',
    'visibility',
    'visibility_off',
    'download',
    'close',
    'error',
    'check',
    'image',
    'movie'
  ]) {
    icons.add(name)
  }

  return [...icons].sort()
}

function run() {
  if (!statSync(FONT_SRC, { throwIfNoEntry: false })) {
    console.warn('[font-subset] material-symbols npm package not found. Run npm install first.')
    return
  }

  const icons = collectIcons()
  console.log(`[font-subset] Found ${icons.length} unique icons`)

  mkdirSync(OUTPUT_DIR, { recursive: true })

  const pyScript = join(tmpdir(), `mini-hbut-font-subset-${process.pid}.py`)
  const pySource = `
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options

font = TTFont(r'''${FONT_SRC.replace(/\\/g, '/')}''')
text = ${JSON.stringify(icons.join(''))}

options = Options()
# liga/clig/calt：Material Symbols 用图标名连字渲染（缺了会显示英文 icon name）
options.layout_features = ['rclt', 'rlig', 'liga', 'clig', 'calt', 'dlig']
options.drop_tables = ['DSIG', 'fvar', 'gvar', 'STAT', 'avar', 'MVAR']
options.notdef_outline = True
options.name_IDs = [1, 2]
options.name_legacy = True
options.recalc_bounds = True
options.recalc_timestamp = False

subsetter = Subsetter(options=options)
subsetter.populate(text=text)
subsetter.subset(font)

font.flavor = 'woff2'
font.save(r'''${OUTPUT_FILE.replace(/\\/g, '/')}''')
`

  writeFileSync(pyScript, pySource, 'utf8')
  try {
    execSync(`python "${pyScript}"`, { stdio: 'inherit' })
  } finally {
    try {
      unlinkSync(pyScript)
    } catch {
      // 临时脚本清理失败不影响子集产物。
    }
  }

  const size = statSync(OUTPUT_FILE).size
  const origSize = statSync(FONT_SRC).size
  console.log(`[font-subset] ${(origSize / 1024 / 1024).toFixed(1)} MB → ${(size / 1024).toFixed(0)} KB (${((1 - size / origSize) * 100).toFixed(0)}% reduction)`)
}

try {
  run()
} catch (e) {
  console.warn('[font-subset] Failed:', e.message)
  console.warn('[font-subset] The full Material Symbols font from npm will be used as fallback.')
}

export { collectIcons }
