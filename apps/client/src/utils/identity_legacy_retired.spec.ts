// src/utils/identity_legacy_retired.spec.ts
// 【检查 6】R4 契约测试：身份引导（identity bootstrap）**整体退役**。
//
// 背景：ocr-service P3-1 已删除 /identity/bootstrap 端点（能力消失）。
// 客户端不得保留任何调用路径（含"默认关闭"的开关路径）—— 否则远端开关
// 误开即 404。本测试是回归门禁：
// 1. identity_bootstrap 模块与其 spec 文件不再存在；
// 2. 客户端 src 源码里 `IDENTITY_BOOTSTRAP_PATH` 与 `/identity/bootstrap`
//    0 命中（本 spec 文件自身含这两个字面量，需从扫描中排除）；
// 3. normalizeRemoteConfig 不再输出 `identity_bootstrap` 键（远端 payload
//    即使携带该键也不得进入归一化结果）。
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizeRemoteConfig } from './remote_config'

const SRC_ROOT = path.join(process.cwd(), 'src')
const SELF_NAME = 'identity_legacy_retired.spec.ts'

/** 递归收集 src 下的源码文件（ts/tsx/vue/js/mjs；排除本 spec 自身） */
const collectSourceFiles = (dir: string): string[] => {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...collectSourceFiles(full))
    } else if (/\.(ts|tsx|vue|js|mjs)$/.test(entry.name) && entry.name !== SELF_NAME) {
      out.push(full)
    }
  }
  return out
}

describe('检查 6 R4 契约：identity bootstrap 整体退役（/identity/bootstrap 端点已不存在）', () => {
  it('identity_bootstrap 模块与其 spec 文件不再存在', () => {
    expect(existsSync(path.join(process.cwd(), 'src/utils/identity_bootstrap.ts'))).toBe(false)
    expect(existsSync(path.join(process.cwd(), 'src/utils/identity_bootstrap.spec.ts'))).toBe(false)
  })

  it('IDENTITY_BOOTSTRAP_PATH 与 /identity/bootstrap 在客户端 src 全源码 0 命中（本文件除外）', () => {
    const hits = collectSourceFiles(SRC_ROOT).filter((file) => {
      const text = readFileSync(file, 'utf8')
      return text.includes('IDENTITY_BOOTSTRAP_PATH') || text.includes('/identity/bootstrap')
    })
    expect(hits.map((file) => path.relative(SRC_ROOT, file))).toEqual([])
  })

  it('normalizeRemoteConfig 不再输出 identity_bootstrap 键（远端 payload 携带也不复制）', () => {
    const config = normalizeRemoteConfig({
      identity_bootstrap: { enabled: true, base_url: 'https://api.example.com' }
    })
    expect('identity_bootstrap' in config).toBe(false)
  })
})
