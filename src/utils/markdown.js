import { marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import DOMPurify from 'dompurify'

marked.setOptions({
  gfm: true,
  breaks: true
})

marked.use(markedKatex({
  throwOnError: false,
  output: 'html'
}))

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
