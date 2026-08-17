import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(process.cwd(), '../..')
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n?/g, '\n')

describe('codeql layering', () => {
  const workflow = read('.github/workflows/codeql.yml')

  it('keeps the full 3-language analysis with stable display names', () => {
    expect(workflow).toContain('analyze-javascript-typescript:')
    expect(workflow).toContain('analyze-rust:')
    expect(workflow).toContain('analyze-actions:')
    expect(workflow).toContain('name: Analyze (javascript-typescript)')
    expect(workflow).toContain('name: Analyze (rust)')
    expect(workflow).toContain('name: Analyze (actions)')
    expect(workflow).toContain('schedule:')
    expect(workflow).toContain('workflow_dispatch:')
    expect(workflow).toContain('languages: javascript-typescript')
    expect(workflow).toContain('languages: rust')
    expect(workflow).toContain('languages: actions')
  })

  it('limits pull_request analysis to javascript-typescript only (#598 Layer 3)', () => {
    // rust / actions 仅在非 PR 事件（push main / schedule / manual）运行
    expect(workflow).toMatch(/analyze-rust:\s*\n\s+name: Analyze \(rust\)\s*\n\s+if: github.event_name != 'pull_request'/)
    expect(workflow).toMatch(/analyze-actions:\s*\n\s+name: Analyze \(actions\)\s*\n\s+if: github.event_name != 'pull_request'/)
  })
})
