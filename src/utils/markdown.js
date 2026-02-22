import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { loadScriptFromCdn, loadStyleFromCdn } from './cdn_loader.js'

marked.setOptions({
  gfm: true,
  breaks: true
})

const CDN_CONFIG = {
  katexScript: [
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
    'https://unpkg.com/katex@0.16.11/dist/katex.min.js'
  ],
  katexStyle: [
    'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
    'https://unpkg.com/katex@0.16.11/dist/katex.min.css'
  ],
  markedKatexScript: [
    'https://cdn.jsdelivr.net/npm/marked-katex-extension@5.1.6/lib/index.umd.js',
    'https://unpkg.com/marked-katex-extension@5.1.6/lib/index.umd.js'
  ]
}

let markdownRuntimeReady = false
let markdownRuntimePromise = null

const enableKatexMarkdown = () => {
  if (markdownRuntimeReady) return
  const pluginFactory = window?.markedKatex
  if (typeof pluginFactory !== 'function') return
  marked.use(
    pluginFactory({
      throwOnError: false,
      output: 'html'
    })
  )
  markdownRuntimeReady = true
}

export const initMarkdownRuntime = async (timeoutMs = 8000) => {
  if (markdownRuntimeReady) return true
  if (markdownRuntimePromise) return markdownRuntimePromise

  markdownRuntimePromise = (async () => {
    try {
      await loadStyleFromCdn({
        cacheKey: 'katex-css',
        urls: CDN_CONFIG.katexStyle,
        timeoutMs
      })
      await loadScriptFromCdn({
        cacheKey: 'katex-js',
        urls: CDN_CONFIG.katexScript,
        timeoutMs,
        resolveGlobal: () => window?.katex
      })
      await loadScriptFromCdn({
        cacheKey: 'marked-katex-js',
        urls: CDN_CONFIG.markedKatexScript,
        timeoutMs,
        resolveGlobal: () => window?.markedKatex
      })
      enableKatexMarkdown()
    } catch (error) {
      console.warn('[Markdown] CDN runtime init failed, fallback plain markdown:', error)
    }
    return markdownRuntimeReady
  })()

  return markdownRuntimePromise
}

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
