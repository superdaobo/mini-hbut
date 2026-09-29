/**
 * Material Symbols ligature 图标名扫描器。
 *
 * 背景：本仓库的图标字体 `public/fonts/material-symbols-outlined.subset.woff2` 是
 * 「按源码用到的图标名裁剪出来的子集」。子集一旦与源码脱节，界面上缺失的 ligature
 * 会被当作普通文本渲染（显示英文 icon name）或豆腐块。因此需要一份**可测、可复用**
 * 的扫描规则，供三处共用：
 *   1. 生成器 scripts/build_font_subset.mjs（决定子集收哪些字形）
 *   2. 契约测试 src/utils/icon_font_subset_contract.spec.ts（防复发）
 *   3. 排查脚本
 *
 * 关键区分（踩过的坑）：
 *   - `iconKey: 'grades'` 是**模块键**，不是 ligature 名；必须经 ThemeModuleIcon.vue
 *     的 iconMap 解析成 `school` 之后才是真正要给字体的名字。
 *   - 函数返回值里的图标名（如 `return 'restaurant'`）无法静态判定归属，只能落到
 *     weak 候选里，由调用方与「字体实际含有的名字」求交后使用。
 *
 * 结果分级：
 *   - strong  ：高置信度，确认会作为 ligature 文本渲染的图标名（可直接用于断言）
 *   - weak    ：宽口径候选（任意字符串字面量），有假阳性，必须与字体名求交
 *   - iconKeys：源码中出现的模块键，经 iconMap 解析后计入 strong
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/** 参与扫描的文件类型（.html 覆盖 src/templates 下的静态视图模板） */
export const ICON_SCAN_EXTS = ['.vue', '.ts', '.js', '.mjs', '.html', '.css']

/** 图标名（ligature）合法形态：小写字母开头，仅含小写字母/数字/下划线 */
const ICON_NAME_PATTERN = '[a-z][a-z0-9_]*'
const ICON_NAME_RE = new RegExp(`^${ICON_NAME_PATTERN}$`)

/** 过短的名字几乎都不是图标（如 'a'、'ok'），过滤噪声 */
const MIN_ICON_NAME_LENGTH = 3

/** material-symbols-outlined 类名后紧跟的字面量 ligature 文本 */
const LITERAL_LIGATURE_RE = new RegExp(
  `material-symbols-outlined[^<>]{0,240}?>\\s*(${ICON_NAME_PATTERN})\\s*<`,
  'g'
)

/** material-symbols-outlined 附近的插值块 {{ ... }}（含三元表达式） */
const INTERPOLATION_RE = /material-symbols-outlined[\s\S]{0,240}?(\{\{[\s\S]{0,400}?\}\})/g

/**
 * 三元表达式的结果分支：`? 'home' : 'receipt_long'`。
 * 只取 `?`/`:` 紧跟的字符串，避免把条件里的值（`kind === 'video'`）或函数实参
 * （`isPending(key(x, 'follow'))`）误当图标名。
 */
const TERNARY_BRANCH_RE = /(?:\?|:)\s*'([^'\n\\]{1,60})'/g

/** 图标属性：icon: 'download' / iconName = 'wb_sunny'（不含 iconKey，它是模块键） */
const ICON_PROP_RE = /(?<![\w-])(?:iconName|icon|symbolName|symbol|glyph)\s*[:=]\s*'([^'\n\\]{1,60})'/g

/** 模块键：iconKey: 'grades'（需经 iconMap 解析） */
const ICON_KEY_RE = /\biconKey\s*[:=]\s*'([^'\n\\]{1,60})'/g

/** 命名含 icon 的映射表赋值：const iconMap = { ... }（用括号配平截取，避免正则跨块污染） */
const ICON_OBJECT_HEAD_RE = /\b(?:const|let|var)\s+(\w*icon\w*)\s*=\s*\{/gi

/** 对象字面量里的键值对 */
const OBJECT_PAIR_RE = /'?([A-Za-z_$][\w$]*)'?\s*:\s*'([^'\n\\]{1,60})'/g

/** 任意字符串字面量（weak 候选来源） */
const ANY_STRING_RE = /'([^'\n\\]{1,60})'/g

/**
 * 从 `{` 处按花括号配平截取完整对象文本，避免正则非贪婪跨块吞掉无关代码。
 * @param {string} text 源文本
 * @param {number} openIndex `{` 所在下标
 * @returns {string | null}
 */
export const readBalancedObject = (text, openIndex) => {
  let depth = 0
  for (let i = openIndex; i < text.length; i += 1) {
    const ch = text[i]
    if (ch === '{') depth += 1
    else if (ch === '}') {
      depth -= 1
      if (depth === 0) return text.slice(openIndex, i + 1)
    }
  }
  return null
}

/**
 * 收集源码中「名字含 icon 的映射表」里的字符串值。
 * @param {string} content
 * @returns {Array<[string, string]>} [键, 值] 列表
 */
const collectIconObjectPairs = (content) => {
  const pairs = []
  for (const head of content.matchAll(ICON_OBJECT_HEAD_RE)) {
    const openIndex = head.index + head[0].length - 1
    const body = readBalancedObject(content, openIndex)
    if (!body) continue
    for (const pair of body.matchAll(OBJECT_PAIR_RE)) pairs.push([pair[1], pair[2]])
  }
  return pairs
}

const isIconLikeName = (value) => {
  const name = String(value || '').trim()
  // 含 '-' 的名字（fa-award 等 Font Awesome 类名）会被形态规则直接挡掉
  return name.length >= MIN_ICON_NAME_LENGTH && ICON_NAME_RE.test(name)
}

/**
 * 解析 `iconMap = { grades: 'school', ... }` 这类映射表（键 → ligature 名）。
 * @param {string} content
 * @returns {Record<string, string>}
 */
export function parseIconMapFromSource(content) {
  const map = {}
  for (const [key, value] of collectIconObjectPairs(content)) {
    if (!isIconLikeName(value)) continue
    if (!map[key]) map[key] = value
  }
  return map
}

/**
 * 从单个文件内容中提取图标名。
 * @param {string} content 文件文本
 * @param {Record<string, string>} [iconMap] 模块键 → ligature 名的映射（跨文件解析）
 */
export function extractIconNamesFromSource(content, iconMap = {}) {
  const strong = new Set()
  const weak = new Set()
  const iconKeys = new Set()
  const unresolvedIconKeys = new Set()

  // ① 模板字面量：<span class="material-symbols-outlined">chevron_right</span>
  for (const m of content.matchAll(LITERAL_LIGATURE_RE)) {
    if (isIconLikeName(m[1])) strong.add(m[1])
  }

  // ② 插值/三元：{{ tab === 'orders' ? 'home' : 'receipt_long' }}
  //    只取三元结果分支，条件值与函数实参不算图标名
  for (const m of content.matchAll(INTERPOLATION_RE)) {
    for (const s of m[1].matchAll(TERNARY_BRANCH_RE)) {
      if (isIconLikeName(s[1])) strong.add(s[1])
    }
  }

  // ③ 图标属性：icon: 'download' / iconName = 'wb_sunny'
  for (const m of content.matchAll(ICON_PROP_RE)) {
    if (isIconLikeName(m[1])) strong.add(m[1])
  }

  // ④ 命名含 icon 的映射表（iconMap / featureIcons ...）的值
  for (const [, value] of collectIconObjectPairs(content)) {
    if (isIconLikeName(value)) strong.add(value)
  }

  // ⑤ 模块键 iconKey: 'grades' → 经 iconMap 解析成真实 ligature 名
  for (const m of content.matchAll(ICON_KEY_RE)) {
    const key = m[1]
    iconKeys.add(key)
    const resolved = iconMap[key]
    if (resolved) strong.add(resolved)
    else unresolvedIconKeys.add(key)
  }

  // ⑥ 宽口径：任意字符串字面量（需调用方与字体实际字形求交后再使用）
  for (const m of content.matchAll(ANY_STRING_RE)) {
    if (isIconLikeName(m[1])) weak.add(m[1])
  }

  return {
    strong: [...strong].sort(),
    weak: [...weak].sort(),
    iconKeys: [...iconKeys].sort(),
    unresolvedIconKeys: [...unresolvedIconKeys].sort()
  }
}

const walkFiles = (dir, exts) => {
  const out = []
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of entries) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (['node_modules', 'dist', '.git'].includes(entry.name)) continue
      out.push(...walkFiles(full, exts))
      continue
    }
    // 单测/快照不参与运行时渲染，排除以免它们的断言文本污染字形集合
    if (/\.(spec|test)\.[cm]?[jt]sx?$/.test(entry.name)) continue
    if (exts.some((ext) => entry.name.endsWith(ext))) out.push(full)
  }
  return out
}

/**
 * 扫描源码目录，汇总图标名。
 *
 * @param {object} options
 * @param {string} options.cwd             项目根（通常 apps/client）
 * @param {string[]} [options.extraRoots]  额外扫描目录（绝对路径，如 website/modules-src）
 * @param {string[]} [options.exts]        参与扫描的扩展名
 * @returns {{
 *   strong: string[], weak: string[], iconKeys: string[], unresolvedIconKeys: string[],
 *   iconMap: Record<string, string>, scannedFiles: string[]
 * }}
 */
export function scanIconNames({ cwd, extraRoots = [], exts = ICON_SCAN_EXTS }) {
  const roots = [join(cwd, 'src'), ...extraRoots]
  const contents = []
  const scannedFiles = []

  // 第一遍：读入全部文件（iconMap 可能定义在与使用点不同的文件里）
  for (const root of roots) {
    for (const file of walkFiles(root, exts)) {
      let content
      try {
        content = readFileSync(file, 'utf8')
      } catch {
        continue
      }
      contents.push({ file, content })
    }
  }

  // 第二遍：先汇总全局 iconMap，再逐文件提取
  const iconMap = {}
  for (const { content } of contents) {
    for (const [key, value] of Object.entries(parseIconMapFromSource(content))) {
      if (!iconMap[key]) iconMap[key] = value
    }
  }

  const strong = new Set()
  const weak = new Set()
  const iconKeys = new Set()
  const unresolvedIconKeys = new Set()

  for (const { file, content } of contents) {
    const res = extractIconNamesFromSource(content, iconMap)
    res.strong.forEach((n) => strong.add(n))
    res.weak.forEach((n) => weak.add(n))
    res.iconKeys.forEach((n) => iconKeys.add(n))
    res.unresolvedIconKeys.forEach((n) => unresolvedIconKeys.add(n))
    if (res.strong.length || res.weak.length || res.iconKeys.length) {
      scannedFiles.push(relative(cwd, file).split('\\').join('/'))
    }
  }

  return {
    strong: [...strong].sort(),
    weak: [...weak].sort(),
    iconKeys: [...iconKeys].sort(),
    unresolvedIconKeys: [...unresolvedIconKeys].sort(),
    iconMap,
    scannedFiles: scannedFiles.sort()
  }
}
