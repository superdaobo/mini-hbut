import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

describe('bundled markdown runtime contract', () => {
  it('bundles compatible KaTeX dependencies instead of executing CDN blobs', () => {
    const packageJson = JSON.parse(read('package.json'))
    const markdownSource = read('src/utils/markdown.js')

    expect(packageJson.dependencies.katex).toBe('0.16.47')
    expect(packageJson.dependencies['marked-katex-extension']).toBe('5.1.10')
    expect(markdownSource).toContain("import markedKatex from 'marked-katex-extension'")
    expect(markdownSource).toContain("import 'katex/dist/katex.min.css'")
    expect(markdownSource).not.toContain('cdn_loader')
    expect(markdownSource).not.toMatch(/createObjectURL|new\s+Blob|blob:|loadScriptFromCdn|loadStyleFromCdn/)
  })

  it('keeps the synchronous renderer and legacy async initialization API', () => {
    const markdownSource = read('src/utils/markdown.js')
    expect(markdownSource).toContain('export const initMarkdownRuntime = async')
    expect(markdownSource).toContain('enableKatexMarkdown()')
    expect(markdownSource).toContain('export function renderMarkdown')
    expect(markdownSource).toContain('DOMPurify.sanitize(marked.parse')
  })
})
