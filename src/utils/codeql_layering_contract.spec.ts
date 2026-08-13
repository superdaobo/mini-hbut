import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8').replace(/\r\n?/g, '\n')

describe('codeql layering', () => {
  const workflow = read('.github/workflows/codeql.yml')

  it('keeps the full 3-language matrix on push, schedule and manual runs', () => {
    expect(workflow).toContain('language: [javascript-typescript, rust, actions]')
    expect(workflow).toContain('schedule:')
    expect(workflow).toContain('workflow_dispatch:')
  })

  it('limits pull_request analysis to javascript-typescript only (#598 Layer 3)', () => {
    expect(workflow).toContain("if: github.event_name != 'pull_request' || matrix.language == 'javascript-typescript'")
  })
})
