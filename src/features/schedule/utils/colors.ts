/**
 * 课表领域 - 颜色分配纯函数。
 * 原内联于 ScheduleView.vue（hashText/hexToRgb/colorDistance/主题候选评估），
 * 拆分后保持算法与行为完全一致。
 */
import { courseThemes } from '../constants'

/** 字符串哈希（FNV 风格，与原实现逐字符一致） */
export const hashText = (value: any): number => {
  let hash = 0
  const text = String(value || '')
  for (let i = 0; i < text.length; i += 1) {
    hash = text.charCodeAt(i) + ((hash << 5) - hash)
  }
  return Math.abs(hash)
}

/** hex -> RGB；非法输入返回 null */
export const hexToRgb = (hex: any): { r: number; g: number; b: number } | null => {
  const text = String(hex || '').trim().replace('#', '')
  if (!/^[0-9a-fA-F]{6}$/.test(text)) return null
  return {
    r: Number.parseInt(text.slice(0, 2), 16),
    g: Number.parseInt(text.slice(2, 4), 16),
    b: Number.parseInt(text.slice(4, 6), 16)
  }
}

/** 两色欧氏距离；任一非法返回 0 */
export const colorDistance = (aHex: any, bHex: any): number => {
  const a = hexToRgb(aHex)
  const b = hexToRgb(bHex)
  if (!a || !b) return 0
  const dr = a.r - b.r
  const dg = a.g - b.g
  const db = a.b - b.b
  return Math.sqrt(dr * dr + dg * dg + db * db)
}

/** 两个主题索引的对比度得分：边框 0.72 + 文字 0.28 */
export const getThemeContrastScore = (aIndex: number, bIndex: number): number => {
  const themeA = courseThemes[aIndex] || {}
  const themeB = courseThemes[bIndex] || {}
  const borderGap = colorDistance(themeA.border, themeB.border)
  const textGap = colorDistance(themeA.text, themeB.text)
  return borderGap * 0.72 + textGap * 0.28
}

/** 环上最短距离 */
export const getCircularOffset = (seed: number, candidate: number): number => {
  const len = courseThemes.length
  const forward = (candidate - seed + len) % len
  const backward = (seed - candidate + len) % len
  return Math.min(forward, backward)
}

/** 候选主题的评估指标：邻接/全局最小对比度 + 环偏移 */
export const evaluateThemeCandidate = (
  candidate: number,
  seed: number,
  neighborColors: number[],
  globalColors: number[]
): { candidate: number; neighborMinContrast: number; globalMinContrast: number; offset: number } => {
  const neighborMinContrast = neighborColors.length
    ? neighborColors.reduce((minGap, neighborColor) => {
      const gap = getThemeContrastScore(candidate, neighborColor)
      return gap < minGap ? gap : minGap
    }, Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY

  const globalMinContrast = globalColors.length
    ? globalColors.reduce((minGap, globalColor) => {
      const gap = getThemeContrastScore(candidate, globalColor)
      return gap < minGap ? gap : minGap
    }, Number.POSITIVE_INFINITY)
    : Number.POSITIVE_INFINITY

  return {
    candidate,
    neighborMinContrast,
    globalMinContrast,
    offset: getCircularOffset(seed, candidate)
  }
}

/**
 * 挑选最优主题候选：邻接对比度 > 全局对比度 > 环偏移。
 * 返回主题索引；无候选时返回 null。
 */
export const pickBestThemeCandidate = (
  candidates: number[],
  seed: number,
  neighborColors: number[],
  globalColors: number[]
): number | null => {
  let best: { candidate: number; neighborMinContrast: number; globalMinContrast: number; offset: number } | null = null
  for (const candidate of candidates) {
    const metrics = evaluateThemeCandidate(candidate, seed, neighborColors, globalColors)
    if (!best) {
      best = metrics
      continue
    }
    if (metrics.neighborMinContrast > best.neighborMinContrast) {
      best = metrics
      continue
    }
    if (
      metrics.neighborMinContrast === best.neighborMinContrast &&
      metrics.globalMinContrast > best.globalMinContrast
    ) {
      best = metrics
      continue
    }
    if (
      metrics.neighborMinContrast === best.neighborMinContrast &&
      metrics.globalMinContrast === best.globalMinContrast &&
      metrics.offset < best.offset
    ) {
      best = metrics
    }
  }
  return best?.candidate ?? null
}
