/** 选课页面的常量、归一化与展示纯函数。 */

export const API_BASE = import.meta.env.VITE_API_BASE || '/api'
export const DEFAULT_FROM = 'ggxxk'
export const KKLX_FROM_MAP = Object.freeze({
  '1': 'jhxk',
  '2': 'ggxxk',
  '3': 'fjjx',
  '5': 'cxxk',
  '6': 'jhxk',
  '7': 'jhxk',
  '8': 'jhxk',
  '16': 'ggxxk',
  '18': 'cxxk',
  '22': 'jhxk'
})
export const ENTRY_MODE_MENU = 'menu'
export const ENTRY_MODE_SELECTION = 'selection'
export const ENTRY_MODE_INFO = 'info'

export const KCXZ_LABEL_MAP = Object.freeze({
  '11': '通识必修',
  '12': '通识选修',
  '16': '限定选修',
  '31': '学科基础',
  '32': '工程基础',
  '40': '专业核心',
  '41': '专业方向组',
  '42': '专业任选',
  '43': '专业基础',
  '44': '专业必修',
  '45': '专业选修',
  '50': '基础实践',
  '51': '专业实践',
  '52': '综合实践',
  '53': '其他实践',
  '54': '短学期实践',
  '70': '辅修理论',
  '71': '辅修实践',
  '90': '必修',
  '98': '重修',
  '99': '公共选修'
})

export const KCLX_LABEL_MAP = Object.freeze({
  ...KCXZ_LABEL_MAP,
  '1': '理论',
  '2': '实验',
  '3': '上机',
  '4': '实践',
  '5': '环节',
  '6': '公选',
  '7': '自修',
  '9': '分级',
  '10': '其他',
  '15': '辅修'
})

export const EMPTY_LIST_FILTERS = Object.freeze({
  kcmc: '',
  kcxz: '',
  kcgs: '',
  jxms: '',
  teacher: '',
  kkxq: '',
  kclb: '',
  kclx: ''
})

export const safeText = (value) => String(value ?? '').trim()

export const resolveCourseTypeLabel = (value, fallback = '') => {
  const code = safeText(value)
  const fallbackText = safeText(fallback)
  if (code && KCLX_LABEL_MAP[code]) return KCLX_LABEL_MAP[code]
  if (fallbackText && KCLX_LABEL_MAP[fallbackText]) return KCLX_LABEL_MAP[fallbackText]
  return fallbackText || code
}

export const isEnabledValue = (value) => {
  const text = safeText(value).toLowerCase()
  return text === '1' || text === 'true' || text === 'yes' || text === 'y'
}

export const isPickedValue = (value) => {
  const text = safeText(value)
  if (!text) return false
  if (isEnabledValue(text)) return true
  if (text.includes('已选') || text.includes('已修') || text.includes('已报名')) return true
  const num = Number(text)
  return Number.isFinite(num) && num > 0
}

export const resolveTabFrom = (tab) => {
  const kklx = safeText(tab?.kklx)
  return KKLX_FROM_MAP[kklx] || DEFAULT_FROM
}

export const stripHtml = (value) => {
  const raw = safeText(value)
  if (!raw) return ''
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  return safeText(doc.body?.textContent || raw)
}

export const looksLikeEncodedSchedule = (value) => {
  const text = safeText(value)
  if (!text) return false
  return /^\d+(,\d+)+$/.test(text) || /^\d{4,}$/.test(text)
}

export const normalizeScheduleText = (item) => {
  const sksjdd = stripHtml(item.sksjdd)
  if (sksjdd && !looksLikeEncodedSchedule(sksjdd)) return sksjdd
  const sksjddstr = stripHtml(item.sksjddstr)
  if (sksjddstr && !looksLikeEncodedSchedule(sksjddstr)) return sksjddstr
  return ''
}

export const compactTeachingClassName = (value) => {
  let text = stripHtml(value)
  if (!text) return ''
  text = text
    .replace(/([\-—_]?)(?:理论|实践|实验|混合|线上|线下)?\s*\d{3,}\s*$/u, '$1')
    .replace(/[\-—_]\s*$/u, '')
    .trim()
  return text || stripHtml(value)
}

export const hasConflictHint = (value) => {
  const text = stripHtml(value)
  if (!text) return false
  return /(冲突课程|冲突上课时间地点|conflictingCourse|冲突状态|冲突课程编号|冲突课程名称)/i.test(text)
}

export const looksLikeCodeLine = (line) => {
  const text = safeText(line)
  if (!text) return false
  const lower = text.toLowerCase()
  if (/^(\/\/|\/\*|\*\/)/.test(lower)) return true
  if (/^(var|let|const|function|if|else|for|while|try|catch|return)\b/.test(lower)) return true
  if (/^(\$\(.*\)|document\.|window\.)/.test(lower)) return true
  if (/[{};$<>]/.test(text) && /(ajax|validform|jquery|document|window|ready|tiptype|cssctl|openDialog|submit|callback)/i.test(text)) return true
  if (/^\s*[\w$]+\s*=/.test(text) && /[;{}()]/.test(text)) return true
  return false
}

export const normalizeDetailIntro = (value, options = {}) => {
  const allowConflictText = options.allowConflictText === true
  const raw = safeText(value)
  if (!raw) return ''
  const doc = new DOMParser().parseFromString(raw, 'text/html')
  doc.querySelectorAll('script,style,noscript,iframe,svg,canvas').forEach((node) => node.remove())
  const text = safeText((doc.body?.innerText || doc.body?.textContent || raw).replace(/\u00a0/g, ' '))
  if (!text) return ''
  const lines = text
    .split(/\r?\n+/)
    .map((line) => safeText(line.replace(/^[\s*•-]+/, '')))
    .filter(Boolean)
  const filtered = lines.filter((line) => {
    if (looksLikeCodeLine(line)) return false
    if (!allowConflictText && /(冲突课程|冲突上课时间地点|冲突状态|conflictingCourse|detailsForm)/i.test(line)) {
      return false
    }
    return true
  })
  const source = filtered.length >= 2 ? filtered : lines
  const merged = []
  source.forEach((line) => {
    if (!line) return
    if (merged[merged.length - 1] === line) return
    merged.push(line)
  })
  return merged.join('\n')
}

export const cleanMessage = (value) => {
  const text = safeText(value)
  const normalized = text.toLowerCase()
  if (!text) return ''
  if (normalized === 'success' || normalized === 'ok' || text === '获取成功') return ''
  return text
}

export const resolveErrorMessage = (error, fallback = '请求失败') => {
  const responseData = error?.response?.data
  const messageCandidates = [
    responseData?.error,
    responseData?.message,
    responseData?.msg,
    responseData?.data?.msg,
    responseData?.data?.message,
    error?.message
  ]
  const matched = messageCandidates.map((item) => safeText(item)).find(Boolean)
  return matched || fallback
}

export const normalizeOptionList = (source, placeholder = '全部') => {
  const options = [{ value: '', label: placeholder }]
  const pushOption = (value, label) => {
    const nextValue = safeText(value)
    const nextLabel = safeText(label || value)
    if (!nextLabel) return
    if (options.some((item) => item.value === nextValue && item.label === nextLabel)) return
    options.push({ value: nextValue, label: nextLabel })
  }

  if (Array.isArray(source)) {
    source.forEach((item) => {
      if (item && typeof item === 'object') {
        pushOption(
          item.value ?? item.dm ?? item.code ?? item.id ?? item.key ?? item.mc,
          item.label ?? item.mc ?? item.name ?? item.text ?? item.value ?? item.dm
        )
      } else {
        pushOption(item, item)
      }
    })
  } else if (source && typeof source === 'object') {
    Object.entries(source).forEach(([key, value]) => {
      if (value && typeof value === 'object') {
        pushOption(value.value ?? value.dm ?? value.id ?? key, value.label ?? value.mc ?? value.name ?? key)
      } else {
        pushOption(key, value)
      }
    })
  }

  return options
}

export const findOptionLabel = (options, value, fallback = '') => {
  const matched = (options || []).find((item) => safeText(item.value) === safeText(value))
  return matched?.label || safeText(fallback || value)
}

export const formatRatioText = (value) => {
  const num = Number.parseFloat(safeText(value))
  if (!Number.isFinite(num)) return '--'
  return `${Math.max(0, Math.min(100, num)).toFixed(num % 1 === 0 ? 0 : 1)}%`
}

export const parseCapacityInfo = (raw, ratioText) => {
  const text = safeText(raw)
  const ratio = Number.parseFloat(safeText(ratioText))
  const normalizedRatio = Number.isFinite(ratio) ? ratio : null
  let selected = null
  let total = null

  const slashMatch = text.match(/(\d+)\s*[\/／]\s*(\d+)/)
  if (slashMatch) {
    selected = Number.parseInt(slashMatch[1], 10)
    total = Number.parseInt(slashMatch[2], 10)
  } else {
    const numberMatch = text.match(/\d+/g)
    if (numberMatch?.length >= 2) {
      selected = Number.parseInt(numberMatch[0], 10)
      total = Number.parseInt(numberMatch[1], 10)
    } else if (numberMatch?.length === 1 && normalizedRatio === 0) {
      total = Number.parseInt(numberMatch[0], 10)
      selected = total
    }
  }

  const isFullByText = /已满|满额/.test(text)
  const isFullByRatio = normalizedRatio !== null && normalizedRatio <= 0
  const isFullByCount = Number.isFinite(selected) && Number.isFinite(total) && total > 0 && selected >= total
  const display = text || (normalizedRatio !== null ? `容量开放率 ${formatRatioText(ratioText)}` : '--')

  return {
    display,
    selected,
    total,
    ratio: normalizedRatio,
    isFull: isFullByText || isFullByRatio || isFullByCount
  }
}

export const normalizeTeacherContent = (content) => {
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (item && typeof item === 'object') {
          return stripHtml(item.jsxm || item.teacher || item.name || item.jsmc || item.content || JSON.stringify(item))
        }
        return stripHtml(item)
      })
      .filter(Boolean)
  }
  if (content && typeof content === 'object') {
    if (Array.isArray(content.list)) return normalizeTeacherContent(content.list)
    if (Array.isArray(content.data)) return normalizeTeacherContent(content.data)
    return Object.values(content)
      .map((item) => {
        if (item && typeof item === 'object') {
          return stripHtml(item.jsxm || item.teacher || item.name || item.jsmc || item.content || JSON.stringify(item))
        }
        return stripHtml(item)
      })
      .filter(Boolean)
  }
  const text = stripHtml(content)
  if (!text) return []
  return text.split(/[\n,，、]/).map((item) => safeText(item)).filter(Boolean)
}
