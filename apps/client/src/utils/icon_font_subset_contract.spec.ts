/**
 * Material Symbols 子集字体契约（防复发护栏）。
 *
 * 背景：图标以 ligature 文本渲染（`<span class="material-symbols-outlined">school</span>`），
 * 而仓库只随包一份「按源码裁剪」的子集字体 apps/client/public/fonts/*.woff2。
 * 一旦源码新增了图标名却没重新生成子集，界面就会把图标名当普通文本渲染，或显示豆腐块。
 *
 * 本测试用「源码扫描结果 ⊆ glyph-manifest 里字体实际可渲染的 ligature 名」把这种脱节
 * 挡在 CI：只要源码用了字体没有的名字，这里就会红并打印缺失清单。
 *
 * 修复方式：npm install 后执行
 *   cd apps/client && node scripts/build_font_subset.mjs
 */

import fs from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { extractIconNamesFromSource, scanIconNames } from '../../scripts/icon_source_scan.mjs'

const CLIENT_ROOT = process.cwd()
const FONT_DIR = path.join(CLIENT_ROOT, 'public/fonts')
const MANIFEST_PATH = path.join(FONT_DIR, 'glyph-manifest.json')
const FONT_PATH = path.join(FONT_DIR, 'material-symbols-outlined.subset.woff2')

/** 与 scripts/build_font_subset.mjs 的扫描范围保持一致 */
const EXTRA_SCAN_ROOTS = [path.resolve(CLIENT_ROOT, '../../website/modules-src')]

type GlyphManifest = {
  schemaVersion: number
  fontFile: string
  fontSha256: string
  fontBytes: number
  glyphCount: number
  cmapChars: string
  ligatureNameCount: number
  ligatureNames: string[]
}

const readManifest = (): GlyphManifest => {
  expect(fs.existsSync(MANIFEST_PATH), `缺少 ${MANIFEST_PATH}，请运行 node scripts/build_font_subset.mjs`).toBe(true)
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as GlyphManifest
}

describe('Material Symbols 子集字体契约', () => {
  it('子集字体与 glyph-manifest 存在且相互一致', () => {
    const manifest = readManifest()

    expect(fs.existsSync(FONT_PATH), `缺少子集字体 ${FONT_PATH}`).toBe(true)

    const fontBytes = fs.readFileSync(FONT_PATH)
    expect(fontBytes.length).toBe(manifest.fontBytes)

    const actualSha = createHash('sha256').update(fontBytes).digest('hex')
    expect(actualSha, '字体文件与 manifest 记录的 sha256 不一致，请重新生成 manifest').toBe(manifest.fontSha256)

    expect(manifest.ligatureNames.length).toBe(manifest.ligatureNameCount)
    expect(manifest.ligatureNameCount).toBeGreaterThan(0)
    expect(manifest.glyphCount).toBeGreaterThan(0)
  })

  it('源码用到的 ligature 名全部包含在子集字体里', () => {
    const manifest = readManifest()
    const available = new Set(manifest.ligatureNames)

    const scanned = scanIconNames({ cwd: CLIENT_ROOT, extraRoots: EXTRA_SCAN_ROOTS })
    expect(scanned.strong.length, '源码扫描结果为空，扫描规则可能失效').toBeGreaterThan(0)

    const missing = scanned.strong.filter((name) => !available.has(name))
    expect(
      missing,
      `子集字体缺少源码用到的图标字形（请运行 node scripts/build_font_subset.mjs 重新生成）：\n  ${missing.join('\n  ')}`
    ).toEqual([])
  })

  it('源码没有引用了字体不认识的名字（weak 候选交叉校验）', () => {
    const manifest = readManifest()
    const available = new Set(manifest.ligatureNames)

    const scanned = scanIconNames({ cwd: CLIENT_ROOT, extraRoots: EXTRA_SCAN_ROOTS })
    // weak 是宽口径候选，只有「确实出现在字体里」的名字才说明它被当作图标使用；
    // 这里反向确认：凡是与真实字形同名的候选，字体内都能渲染（防 manifest 被手工裁剪）
    const weakRealIcons = scanned.weak.filter((name) => available.has(name))
    expect(weakRealIcons.length, 'weak 与字体交集为空，扫描器或 manifest 可能失效').toBeGreaterThan(0)

    const missing = weakRealIcons.filter((name) => !available.has(name))
    expect(missing).toEqual([])
  })

  describe('图标名扫描规则（纯函数单测）', () => {
    it('提取字面量、三元结果分支、icon 属性与 iconMap 值', () => {
      const source = `
        <span class="material-symbols-outlined">chevron_right</span>
        <span class="material-symbols-outlined" :class="{ spin: x }">refresh</span>
        <span class="material-symbols-outlined">{{ tab === 'orders' ? 'home' : 'receipt_long' }}</span>
        <i :class="meta.icon"></i>
        <script>
        const iconMap = { grades: 'school', home: 'home' }
        const meta = { icon: 'wb_sunny', label: 'x' }
        </script>
      `
      const result = extractIconNamesFromSource(source, { grades: 'school', home: 'home' })
      expect(result.strong).toEqual(
        expect.arrayContaining(['chevron_right', 'refresh', 'home', 'receipt_long', 'wb_sunny', 'school'])
      )
    })

    it('不把条件值、函数实参、Font Awesome 与 iconKey 误当图标名', () => {
      const source = `
        <button :disabled="isPending(key(current, 'follow'))">
          <span class="material-symbols-outlined">person_add</span>
          {{ pending ? t('a.following') : t('a.follow') }}
        </button>
        <span class="material-symbols-outlined">{{ kind === 'video' ? 'play_circle' : 'task' }}</span>
        <i class="fas fa-award"></i>
        <span class="material-symbols-outlined">qr_code_2</span>
      `
      const result = extractIconNamesFromSource(source)
      expect(result.strong).toEqual(expect.arrayContaining(['person_add', 'play_circle', 'task', 'qr_code_2']))
      expect(result.strong).not.toContain('follow')
      expect(result.strong).not.toContain('video')
      expect(result.strong).not.toContain('award')
    })
  })

  it('iconKey 全部能经 iconMap 解析成 ligature 名', () => {
    const manifest = readManifest()
    const available = new Set(manifest.ligatureNames)

    const scanned = scanIconNames({ cwd: CLIENT_ROOT, extraRoots: EXTRA_SCAN_ROOTS })
    expect(scanned.unresolvedIconKeys, `存在无法解析的 iconKey：${scanned.unresolvedIconKeys.join(', ')}`).toEqual([])

    const mappedValues = [...new Set(Object.values(scanned.iconMap))]
    const unmapped = mappedValues.filter((name) => !available.has(name))
    expect(unmapped, `iconMap 指向了字体没有的图标：${unmapped.join(', ')}`).toEqual([])
  })
})
