const URL_PATTERN = /(https?:\/\/[^\s<>"']+)/gi

const escapeHtml = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const ALLOWED_TAGS = new Set(['A', 'BR', 'P', 'DIV', 'SPAN', 'STRONG', 'B', 'I', 'EM', 'UL', 'OL', 'LI'])

// ---- SSR（无 DOM）分支：与浏览器端同一套「白名单标签重建」策略 ----
// 浏览器端用 <template> + 节点白名单清洗；Node/SSR 下没有 DOM，
// 用轻量 tokenizer 做等价处理：只保留白名单标签与安全 https? href，
// 其余标签一律剥掉（内容保留为文本），避免脆弱正则漏掉 </script > 等变体。
const parseHtmlTag = (raw) => {
  const trimmed = raw.trim()
  const nameMatch = /^\/?([a-zA-Z][a-zA-Z0-9]*)/.exec(trimmed)
  if (!nameMatch) return null
  return {
    name: nameMatch[1].toUpperCase(),
    closing: trimmed.startsWith('/'),
    rest: trimmed.slice(nameMatch[0].length)
  }
}

const extractSafeHref = (rest) => {
  const match = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(rest)
  const rawValue = match ? (match[1] ?? match[2] ?? match[3] ?? '') : ''
  const value = rawValue
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
  return /^https?:\/\//i.test(value) ? value : ''
}

const sanitizeHtmlWithoutDom = (input) => {
  let out = ''
  let index = 0
  const len = input.length
  while (index < len) {
    const lt = input.indexOf('<', index)
    if (lt === -1) {
      out += input.slice(index)
      break
    }
    out += input.slice(index, lt)
    const gt = input.indexOf('>', lt + 1)
    if (gt === -1) {
      out += input.slice(lt)
      break
    }
    const parsed = parseHtmlTag(input.slice(lt + 1, gt))
    if (!parsed) {
      // 不是合法标签（如 "<3"、"< x"）：按普通文本输出
      out += '<'
      index = lt + 1
      continue
    }
    const { name, closing, rest } = parsed
    index = gt + 1
    if (!ALLOWED_TAGS.has(name)) continue // 注释/声明/非白名单标签整体丢弃
    if (closing) {
      out += `</${name.toLowerCase()}>`
      continue
    }
    if (name === 'A') {
      const href = extractSafeHref(rest)
      out += href
        ? `<a href="${href.replace(/"/g, '&quot;')}" target="_blank" rel="noopener noreferrer">`
        : '<a>'
      continue
    }
    out += `<${name.toLowerCase()}>`
  }
  return out
}

export const looksLikeHtml = (value) => /<[a-z][\s\S]*>/i.test(String(value || ''))

export const sanitizeSchoolInboxHtml = (raw) => {
  const input = String(raw || '').trim()
  if (!input) return ''
  if (typeof document === 'undefined') {
    return sanitizeHtmlWithoutDom(input)
  }

  const template = document.createElement('template')
  template.innerHTML = input

  const walk = (node) => {
    const children = [...node.childNodes]
    children.forEach((child) => {
      if (child.nodeType !== Node.ELEMENT_NODE) return
      const el = child
      if (!ALLOWED_TAGS.has(el.tagName)) {
        el.replaceWith(document.createTextNode(el.textContent || ''))
        return
      }

      ;[...el.attributes].forEach((attr) => {
        const name = attr.name.toLowerCase()
        if (el.tagName === 'A' && name === 'href') return
        if (name === 'class') return
        el.removeAttribute(attr.name)
      })

      if (el.tagName === 'A') {
        const href = String(el.getAttribute('href') || '').trim()
        if (!/^https?:\/\//i.test(href)) {
          el.removeAttribute('href')
        } else {
          el.setAttribute('target', '_blank')
          el.setAttribute('rel', 'noopener noreferrer')
        }
      }

      walk(el)
    })
  }

  walk(template.content)
  return template.innerHTML
}

export const linkifyPlainText = (text) => {
  const escaped = escapeHtml(text)
  return escaped
    .replace(/\n/g, '<br/>')
    .replace(URL_PATTERN, (url) => {
      const safeUrl = escapeHtml(url)
      return `<a href="${safeUrl}" target="_blank" rel="noopener noreferrer">${safeUrl}</a>`
    })
}

export const buildSchoolInboxDetailHtml = (body) => {
  const raw = String(body || '').trim()
  if (!raw) return '<p>暂无正文内容</p>'
  if (looksLikeHtml(raw)) return sanitizeSchoolInboxHtml(raw)
  return `<p>${linkifyPlainText(raw)}</p>`
}
