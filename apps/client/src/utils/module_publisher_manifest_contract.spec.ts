/**
 * 发布侧清单契约（`scripts/build_website_modules.mjs` ↔ 运行期 `ModuleManifest`）。
 *
 * 2026-11-06 真机回归发现：发布脚本只写 `published_channel`，而运行期把 `channel` 当**必填**
 * 字段 → 「直接拿发布产物调 `/module_bundle/prepare`」报
 * `MODULE_MANIFEST_INVALID: missing field channel`（App 端是靠 URL 路径把 channel 补进清单
 * 才绕过的，属于隐式耦合）。本 spec 锁住「发布必须写 channel」。
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

const buildScript = () =>
  readFileSync(path.resolve(__dirname, '../../../../scripts/build_website_modules.mjs'), 'utf8')

describe('发布侧清单契约', () => {
  it('manifest 必须写运行期必填字段 channel', () => {
    const source = buildScript()
    expect(source).toContain('channel: publishChannel')
    // 保留 published_channel 供站点侧消费（向后兼容）
    expect(source).toContain('published_channel: publishChannel')
  })

  it('manifest 覆盖运行期会消费的分发字段', () => {
    const source = buildScript()
    for (const field of ['package_url', 'package_sha256', 'package_size', 'entry_path', 'open_url', 'schema_version']) {
      expect(source).toContain(`${field}:`)
    }
  })
})
