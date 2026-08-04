import { marked } from 'marked'
import DOMPurify from 'dompurify'
import markedKatex from 'marked-katex-extension'
import 'katex/dist/katex.min.css'

marked.setOptions({
  gfm: true,
  breaks: true
})

let markdownRuntimeReady = false

const enableKatexMarkdown = () => {
  if (markdownRuntimeReady) return true
  marked.use(
    markedKatex({
      throwOnError: false,
      output: 'html'
    })
  )
  markdownRuntimeReady = true
  return true
}

/**
 * Keep the legacy async API for callers while using a bundled, offline runtime.
 * No remote script, blob URL, inline style element, or dynamic code evaluation
 * is required, so this path remains compatible with the desktop strict CSP.
 */
export const initMarkdownRuntime = async (_timeoutMs = 8000) => enableKatexMarkdown()

// Register once when the markdown chunk is loaded so synchronous render calls
// continue to support formulas without waiting for a CDN bootstrap.
enableKatexMarkdown()

export function renderMarkdown(content = '') {
  return DOMPurify.sanitize(marked.parse(content || ''))
}

export function stripMarkdown(content = '') {
  if (!content) return ''
  return content
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/[#>*_~\-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
