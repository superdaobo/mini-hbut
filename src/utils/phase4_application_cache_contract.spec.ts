import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('phase 4 application cache contract', () => {
  it('keeps successful network responses non-fatal when cache persistence fails', () => {
    const source = readSource('src-tauri/src/application/academic.rs')

    expect(source.match(/let _ =\s*db::save_cache/g)).toHaveLength(3)
    expect(source).not.toContain('ApplicationError::storage(error.to_string())?')
  })
})
