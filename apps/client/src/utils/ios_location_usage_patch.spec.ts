// #1370 iOS 定位 usage 描述（NSLocationWhenInUseUsageDescription）确定性注入脚本契约。
//
// 背景：Tauri 的 iOS 工程在 gen/apple（gitignore），CI 每次 `tauri ios init` 现场重新
// 生成 Info.plist，默认模板不含定位 usage 描述 → 缺失该 key 时 WKWebView 的定位权限框
// 不弹，定位直接失败（静默失败）。本 spec 锁住补丁脚本的转义/幂等/--check/缺工程行为，
// 并断言 ios-testflight.yml 确实调用了该脚本（且位置在 ios init 与深链注入之后），
// 防止回归时注入步骤被静默删掉。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

import {
  escapeXmlText,
  hasLocationUsage,
  LOCATION_USAGE_TEXT,
  unescapeXmlText,
  upsertLocationUsage
} from '../../scripts/patch_ios_location_usage.mjs'

const repoRoot = process.cwd()
const scriptPath = path.join(repoRoot, 'scripts', 'patch_ios_location_usage.mjs')

/** tauri ios init 产出的 Info.plist 形态（**没有** NSLocation* 键） */
const PLIST_WITHOUT_USAGE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDisplayName</key>
\t<string>Mini-HBUT</string>
\t<key>CFBundleIdentifier</key>
\t<string>com.hbut.mini</string>
\t<key>CFBundleDevelopmentRegion</key>
\t<string>en</string>
</dict>
</plist>
`

/** 已含正确 usage 描述的形态（对照：第二次写入必须是 no-op） */
const PLIST_WITH_USAGE = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleIdentifier</key>
\t<string>com.hbut.mini</string>
\t<key>NSLocationWhenInUseUsageDescription</key>
\t<string>${LOCATION_USAGE_TEXT}</string>
</dict>
</plist>
`

const tempDirs: string[] = []
const makeTempProject = (plist: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-location-'))
  tempDirs.push(dir)
  fs.mkdirSync(path.join(dir, 'src-tauri', 'gen', 'apple', 'hbut-helper_iOS'), {
    recursive: true
  })
  const plistPath = path.join(dir, 'src-tauri', 'gen', 'apple', 'hbut-helper_iOS', 'Info.plist')
  fs.writeFileSync(plistPath, plist)
  return { dir, plistPath }
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop()
    if (dir) fs.rmSync(dir, { recursive: true, force: true })
  }
})

describe('escapeXmlText / unescapeXmlText', () => {
  it('转义 & < >，且与反转义互逆（含实体嵌套场景）', () => {
    expect(escapeXmlText('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d')
    expect(unescapeXmlText(escapeXmlText('a & b < c > d &amp;'))).toBe('a & b < c > d &amp;')
  })

  it('默认文案不含 & < >，无需转义（写入即原文）', () => {
    expect(escapeXmlText(LOCATION_USAGE_TEXT)).toBe(LOCATION_USAGE_TEXT)
  })
})

describe('upsertLocationUsage：幂等且结构不变', () => {
  it('缺失时插入到根 </dict> 之前，插入后可识别', () => {
    const { xml, changed } = upsertLocationUsage(PLIST_WITHOUT_USAGE)
    expect(changed).toBe(true)
    expect(hasLocationUsage(xml)).toBe(true)
    expect(xml.trimEnd().endsWith('</plist>')).toBe(true)
    expect(xml.indexOf('<key>NSLocationWhenInUseUsageDescription</key>')).toBeLessThan(
      xml.lastIndexOf('</dict>')
    )
    // 原有键一个不少
    expect(xml).toContain('<string>com.hbut.mini</string>')
    expect(xml).toContain('<key>CFBundleDevelopmentRegion</key>')
  })

  it('已存在且值相同 → no-op（字节完全不变）', () => {
    const { xml, changed } = upsertLocationUsage(PLIST_WITH_USAGE)
    expect(changed).toBe(false)
    expect(xml).toBe(PLIST_WITH_USAGE)
  })

  it('已存在但值不同 → 更新为期望值（key 仍只有一份，其余内容不动，标签配对完整）', () => {
    const stale = PLIST_WITH_USAGE.replace(LOCATION_USAGE_TEXT, '旧的描述文案')
    const { xml, changed } = upsertLocationUsage(stale)
    expect(changed).toBe(true)
    expect(hasLocationUsage(xml)).toBe(true)
    expect(xml.match(/<key>NSLocationWhenInUseUsageDescription<\/key>/g)).toHaveLength(1)
    expect(xml).not.toContain('旧的描述文案')
    expect(xml).toContain('<string>com.hbut.mini</string>')
    // 回归防护：替换值时不能丢掉 </string>（标签必须配对）
    expect(xml.match(/<string>/g)?.length).toBe(xml.match(/<\/string>/g)?.length)
  })

  it('连续两次调用第二次不再改动（幂等）', () => {
    const first = upsertLocationUsage(PLIST_WITHOUT_USAGE)
    const second = upsertLocationUsage(first.xml)
    expect(first.changed).toBe(true)
    expect(second.changed).toBe(false)
    expect(second.xml).toBe(first.xml)
  })

  it('值含 & 等字符时按转义写入、按语义比较', () => {
    const { xml } = upsertLocationUsage(PLIST_WITHOUT_USAGE, 'a & b < c')
    expect(xml).toContain('<string>a &amp; b &lt; c</string>')
    expect(hasLocationUsage(xml, 'a & b < c')).toBe(true)
    expect(hasLocationUsage(xml, 'a &amp; b &lt; c')).toBe(false)
  })

  it('缺失根 </dict> 时抛错（fail closed，不静默产出坏 plist）', () => {
    expect(() => upsertLocationUsage('<plist><dict>')).toThrow()
  })
})

describe('脚本端到端（用临时工程模拟 macOS CI 的 gen/apple）', () => {
  it('写入模式：plist 无 key → 跑完后有 key，且 exit 0', () => {
    const { dir, plistPath } = makeTempProject(PLIST_WITHOUT_USAGE)
    const run = spawnSync(process.execPath, [scriptPath], { cwd: dir, encoding: 'utf8' })
    expect(run.status, run.stderr).toBe(0)
    expect(hasLocationUsage(fs.readFileSync(plistPath, 'utf8'))).toBe(true)
  })

  it('写入模式幂等：连跑两次，第二次 exit 0 且文件字节不变', () => {
    const { dir, plistPath } = makeTempProject(PLIST_WITHOUT_USAGE)
    expect(spawnSync(process.execPath, [scriptPath], { cwd: dir, encoding: 'utf8' }).status).toBe(
      0
    )
    const afterFirst = fs.readFileSync(plistPath)
    const second = spawnSync(process.execPath, [scriptPath], { cwd: dir, encoding: 'utf8' })
    expect(second.status, second.stderr).toBe(0)
    expect(second.stdout).toContain('幂等跳过')
    expect(fs.readFileSync(plistPath)).toEqual(afterFirst)
  })

  it('--check 模式：无 key 时 exit 1（门禁会失败，不是摆设）', () => {
    const { dir } = makeTempProject(PLIST_WITHOUT_USAGE)
    const run = spawnSync(process.execPath, [scriptPath, '--check'], { cwd: dir, encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('NSLocationWhenInUseUsageDescription')
  })

  it('--check 模式：值不对时 exit 1', () => {
    const { dir } = makeTempProject(PLIST_WITH_USAGE.replace(LOCATION_USAGE_TEXT, '另一段文案'))
    const run = spawnSync(process.execPath, [scriptPath, '--check'], { cwd: dir, encoding: 'utf8' })
    expect(run.status).toBe(1)
  })

  it('--check 模式：值正确时 exit 0', () => {
    const { dir } = makeTempProject(PLIST_WITH_USAGE)
    const run = spawnSync(process.execPath, [scriptPath, '--check'], { cwd: dir, encoding: 'utf8' })
    expect(run.status, run.stderr).toBe(0)
  })

  it('工程不存在时 exit 1 并给出 tauri ios init 指引（而不是静默通过）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-location-empty-'))
    tempDirs.push(dir)
    const run = spawnSync(process.execPath, [scriptPath], { cwd: dir, encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('tauri ios init')
  })
})

describe('ios-testflight.yml 契约：确定性注入已挂进 CI', () => {
  const readWorkflow = () => {
    const workflowPath = path.resolve(
      process.cwd(),
      '../../.github/workflows/ios-testflight.yml'
    )
    expect(fs.existsSync(workflowPath), 'ios-testflight workflow should exist').toBe(true)
    return fs.readFileSync(workflowPath, 'utf8')
  }

  it('调用了 patch_ios_location_usage.mjs 及其 --check，且位置在 ios init 与深链注入之后', () => {
    const workflow = readWorkflow()

    expect(workflow).toContain('node scripts/patch_ios_location_usage.mjs')
    expect(workflow).toContain('node scripts/patch_ios_location_usage.mjs --check')

    const initIndex = workflow.indexOf('npm exec -- tauri ios init')
    const deepLinkIndex = workflow.indexOf('node scripts/patch_ios_deep_link_scheme.mjs')
    const locationIndex = workflow.indexOf('node scripts/patch_ios_location_usage.mjs')
    expect(initIndex).toBeGreaterThanOrEqual(0)
    expect(deepLinkIndex).toBeGreaterThanOrEqual(0)
    expect(locationIndex).toBeGreaterThan(deepLinkIndex)
  })
})
