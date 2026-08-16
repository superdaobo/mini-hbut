import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('phase 4 application cache contract', () => {
  it('keeps successful network responses non-fatal when cache persistence fails', () => {
    const source = readSource('src-tauri/src/application/academic.rs')

    // #578：缓存写失败统一经 warn_cache_write_error 处理（eprintln 告警 + 降级返回网络结果），
    // 不阻断成功网络响应、不传播为 storage 错误。断言语义与 phase4 契约一致，形态随重构演进。
    expect((source.match(/db::save_cache/g) || []).length).toBeGreaterThanOrEqual(3)
    expect(source).not.toContain('ApplicationError::storage(error.to_string())')
  })
})
