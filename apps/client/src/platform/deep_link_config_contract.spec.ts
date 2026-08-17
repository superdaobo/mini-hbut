// src/platform/deep_link_config_contract.spec.ts
//
// #621 Build 验收守卫（Lifecycle 第 7 项：Android/iOS generated config contract 的 source 侧断言）：
// 强制单一 minihbut:// 协议入口在 source-controlled tauri.conf.json 中统一配置，
// 生成工程（src-tauri/gen）由 CI 在生成后检查 scheme 存在，本守卫保证 source 不漂移。

import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const readConfig = () =>
  JSON.parse(
    fs.readFileSync(
      path.join(process.cwd(), 'src-tauri', 'tauri.conf.json'),
      'utf8'
    )
  ) as {
    plugins?: {
      'deep-link'?: {
        desktop?: { schemes?: string[] }
        mobile?: Array<{ scheme?: string | string[]; appLink?: boolean }>
      }
    }
  }

describe('tauri.conf.json: 统一 minihbut:// 深链 source 配置', () => {
  it('desktop 注册 minihbut scheme', () => {
    const deepLink = readConfig().plugins?.['deep-link']
    expect(deepLink?.desktop?.schemes).toContain('minihbut')
  })

  it('mobile 注册 minihbut scheme（数组或字符串形式均可，且必须存在）', () => {
    const deepLink = readConfig().plugins?.['deep-link']
    const mobile = deepLink?.mobile ?? []
    expect(mobile.length).toBeGreaterThan(0)
    const schemes = mobile.flatMap((item) =>
      Array.isArray(item.scheme) ? item.scheme : [item.scheme]
    )
    expect(schemes).toContain('minihbut')
  })

  it('不注册任何其他自定义 scheme（强制单一协议入口）', () => {
    const deepLink = readConfig().plugins?.['deep-link']
    const desktopSchemes = deepLink?.desktop?.schemes ?? []
    const mobileSchemes = (deepLink?.mobile ?? []).flatMap((item) =>
      Array.isArray(item.scheme) ? item.scheme : [item.scheme]
    )
    expect(desktopSchemes).toEqual(['minihbut'])
    for (const scheme of mobileSchemes) {
      expect(scheme).toBe('minihbut')
    }
  })
})
