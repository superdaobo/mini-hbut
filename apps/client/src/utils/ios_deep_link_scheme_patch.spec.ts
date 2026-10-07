// #1000 iOS 深链 scheme 确定性注入脚本契约。
//
// 背景：iOS 的 minihbut scheme 只由 tauri-plugin-deep-link 的 build.rs 在 cargo 构建期注入
// gen/apple 的 Info.plist，而该注入有两个静默失败点（env 缺失即 no-op；暖缓存跳过 build.rs
// 而 plist 每次被 tauri ios init 重新生成）→ 表现为 iOS 上点「打开 Mini-HBUT App」毫无反应。
// 本 spec 锁住补丁脚本的行为，保证「plist 里一定有 scheme」这件事不再依赖缓存与时序。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { afterEach, describe, expect, it } from 'vitest'

import {
  buildUrlTypesBlock,
  isSchemeRegistered,
  resolveIosSchemes,
  upsertUrlTypes
} from '../../scripts/patch_ios_deep_link_scheme.mjs'

const repoRoot = process.cwd()
const scriptPath = path.join(repoRoot, 'scripts', 'patch_ios_deep_link_scheme.mjs')

/** tauri ios init 产出的 Info.plist 形态（**没有** CFBundleURLTypes） */
const PLIST_WITHOUT_SCHEME = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
\t<key>CFBundleDisplayName</key>
\t<string>Mini-HBUT</string>
\t<key>CFBundleIdentifier</key>
\t<string>com.hbut.mini</string>
\t<key>UIApplicationSceneManifest</key>
\t<dict>
\t\t<key>UIApplicationSupportsMultipleScenes</key>
\t\t<false/>
\t</dict>
</dict>
</plist>
`

/** 插件 build.rs 注入后的形态（对照：我们的写入必须与它语义等价） */
const PLIST_WITH_SCHEME = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
\t<key>CFBundleIdentifier</key>
\t<string>com.hbut.mini</string>
\t<key>CFBundleURLTypes</key>
\t<array>
\t\t<dict>
\t\t\t<key>CFBundleURLSchemes</key>
\t\t\t<array>
\t\t\t\t<string>minihbut</string>
\t\t\t</array>
\t\t\t<key>CFBundleURLName</key>
\t\t\t<string>minihbut</string>
\t\t</dict>
\t</array>
</dict>
</plist>
`

const tempDirs: string[] = []
const makeTempProject = (plist: string) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-deeplink-'))
  tempDirs.push(dir)
  fs.mkdirSync(path.join(dir, 'src-tauri', 'gen', 'apple', 'hbut-helper_iOS'), { recursive: true })
  fs.copyFileSync(
    path.join(repoRoot, 'src-tauri', 'tauri.conf.json'),
    path.join(dir, 'src-tauri', 'tauri.conf.json')
  )
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

describe('resolveIosSchemes：与插件 build.rs 同规则', () => {
  it('取非 appLink 条目并剔除 http/https（那类属于 Universal Link）', () => {
    expect(
      resolveIosSchemes({
        plugins: {
          'deep-link': {
            mobile: [
              { scheme: ['minihbut'], appLink: false },
              { scheme: ['https', 'hbut.example.com'], appLink: true }
            ]
          }
        }
      })
    ).toEqual(['minihbut'])
  })

  it('去重、忽略空值、对畸形输入安全返回空数组', () => {
    expect(
      resolveIosSchemes({
        plugins: {
          'deep-link': {
            mobile: [{ scheme: ['minihbut', 'minihbut', '', '  '] }, { scheme: 'not-an-array' }]
          }
        }
      })
    ).toEqual(['minihbut'])
    expect(resolveIosSchemes({})).toEqual([])
    expect(resolveIosSchemes(null)).toEqual([])
    expect(resolveIosSchemes({ plugins: { 'deep-link': { mobile: 'nope' } } })).toEqual([])
  })
})

describe('upsertUrlTypes：幂等且与插件结构一致', () => {
  it('缺失时插入，且插入后可被识别为已注册', () => {
    const { xml, changed } = upsertUrlTypes(PLIST_WITHOUT_SCHEME, ['minihbut'])
    expect(changed).toBe(true)
    expect(isSchemeRegistered(xml, ['minihbut'])).toBe(true)
    // 根 </dict> 必须仍在最后（插入位置正确）
    expect(xml.trimEnd().endsWith('</plist>')).toBe(true)
    expect(xml.indexOf('<key>CFBundleURLTypes</key>')).toBeLessThan(xml.lastIndexOf('</dict>'))
    // 结构必须与插件一致：CFBundleURLSchemes + CFBundleURLName
    expect(xml).toContain('<key>CFBundleURLSchemes</key>')
    expect(xml).toContain('<key>CFBundleURLName</key>')
  })

  it('已存在时替换而非追加（不产生第二份 CFBundleURLTypes）', () => {
    const { xml } = upsertUrlTypes(PLIST_WITH_SCHEME, ['minihbut'])
    // 不要求与插件产物字节相同（插件用 plist::to_writer_xml 重排），
    // 但必须语义等价且**只有一份** CFBundleURLTypes
    expect(isSchemeRegistered(xml, ['minihbut'])).toBe(true)
    expect(xml.match(/<key>CFBundleURLTypes<\/key>/g)).toHaveLength(1)
    expect(xml).toContain('<string>com.hbut.mini</string>')
  })

  it('连续两次调用第二次不再改动（幂等）', () => {
    const first = upsertUrlTypes(PLIST_WITHOUT_SCHEME, ['minihbut'])
    const second = upsertUrlTypes(first.xml, ['minihbut'])
    expect(second.changed).toBe(false)
    expect(second.xml.match(/<key>CFBundleURLTypes<\/key>/g)).toHaveLength(1)
  })

  it('缺失根 </dict> 时抛错（fail closed，不静默产出坏 plist）', () => {
    expect(() => upsertUrlTypes('<plist><dict>', ['minihbut'])).toThrow()
  })

  it('嵌套 array 场景下仍能正确定位（深度计数，不被内层 </array> 提前截断）', () => {
    const nested = PLIST_WITHOUT_SCHEME.replace(
      '<key>CFBundleIdentifier</key>',
      '<key>OtherList</key>\n\t<array>\n\t\t<array>\n\t\t\t<string>x</string>\n\t\t</array>\n\t</array>\n\t<key>CFBundleIdentifier</key>'
    )
    const { xml } = upsertUrlTypes(nested, ['minihbut'])
    expect(isSchemeRegistered(xml, ['minihbut'])).toBe(true)
    expect(xml).toContain('<key>OtherList</key>')
    expect(xml).toContain('<string>x</string>')
  })

  it('buildUrlTypesBlock 输出含全部 scheme', () => {
    const block = buildUrlTypesBlock(['minihbut', 'hbut'])
    expect(block.match(/<string>minihbut<\/string>/g)).toHaveLength(2) // schemes + name
    expect(block).toContain('<string>hbut</string>')
  })
})

describe('脚本端到端（用临时工程模拟 macOS CI 的 gen/apple）', () => {
  it('写入模式：plist 无 scheme → 跑完后有 scheme，且 exit 0', () => {
    const { dir, plistPath } = makeTempProject(PLIST_WITHOUT_SCHEME)
    const run = spawnSync(process.execPath, [scriptPath], { cwd: dir, encoding: 'utf8' })
    expect(run.status, run.stderr).toBe(0)
    expect(isSchemeRegistered(fs.readFileSync(plistPath, 'utf8'), ['minihbut'])).toBe(true)
  })

  it('--check 模式：无 scheme 时 exit 1（门禁会失败，不是摆设）', () => {
    const { dir } = makeTempProject(PLIST_WITHOUT_SCHEME)
    const run = spawnSync(process.execPath, [scriptPath, '--check'], { cwd: dir, encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('未注册 scheme')
  })

  it('--check 模式：有 scheme 时 exit 0', () => {
    const { dir } = makeTempProject(PLIST_WITH_SCHEME)
    const run = spawnSync(process.execPath, [scriptPath, '--check'], { cwd: dir, encoding: 'utf8' })
    expect(run.status, run.stderr).toBe(0)
  })

  it('工程不存在时 exit 1 并给出可执行指引（而不是静默通过）', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ios-deeplink-empty-'))
    tempDirs.push(dir)
    fs.mkdirSync(path.join(dir, 'src-tauri'), { recursive: true })
    fs.copyFileSync(
      path.join(repoRoot, 'src-tauri', 'tauri.conf.json'),
      path.join(dir, 'src-tauri', 'tauri.conf.json')
    )
    const run = spawnSync(process.execPath, [scriptPath], { cwd: dir, encoding: 'utf8' })
    expect(run.status).toBe(1)
    expect(run.stderr).toContain('tauri ios init')
  })
})
