import { marked } from 'marked'
import DOMPurify from 'dompurify'

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
