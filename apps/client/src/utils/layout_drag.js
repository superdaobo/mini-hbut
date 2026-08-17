const toFiniteNumber = (value) => {
  const num = Number(value)
  return Number.isFinite(num) ? num : 0
}

const getRectGap = (value, start, end) => {
  if (value < start) return start - value
  if (value > end) return value - end
  return 0
}

const getLayoutCandidates = (root, section, activeId) => {
  const scope = root instanceof Element ? root : document
  return Array.from(scope.querySelectorAll(`[data-layout-section="${section}"]`))
    .map((element) => {
      const id = String(element.getAttribute('data-layout-id') || '').trim()
      if (!id || id === activeId) return null
      const rect = element.getBoundingClientRect()
      return {
        id,
        rect,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2
      }
    })
    .filter(Boolean)
}

export const resolveLayoutDragTarget = ({ root, section, activeId, point, edgeBuffer = 84 }) => {
  if (!point || !section) return ''
  const x = toFiniteNumber(point.x)
  const y = toFiniteNumber(point.y)
  const selector = `[data-layout-section="${section}"]`
  const hit = document.elementFromPoint(x, y)?.closest?.(selector)
  const hitId = String(hit?.getAttribute?.('data-layout-id') || '').trim()
  if (hitId && hitId !== activeId) {
    return hitId
  }

  const candidates = getLayoutCandidates(root, section, activeId)
  if (!candidates.length) return ''

  const rootRect = root?.getBoundingClientRect?.()
  if (rootRect) {
    const outsideBufferedRoot =
      x < rootRect.left - edgeBuffer ||
      x > rootRect.right + edgeBuffer ||
      y < rootRect.top - edgeBuffer ||
      y > rootRect.bottom + edgeBuffer
    if (outsideBufferedRoot) {
      return ''
    }
  }

  let bestId = ''
  let bestScore = Number.POSITIVE_INFINITY
  for (const item of candidates) {
    const gapX = getRectGap(x, item.rect.left, item.rect.right)
    const gapY = getRectGap(y, item.rect.top, item.rect.bottom)
    const edgeScore = gapX * gapX + gapY * gapY
    const centerDx = x - item.centerX
    const centerDy = y - item.centerY
    const centerScore = centerDx * centerDx + centerDy * centerDy
    const score = edgeScore * 0.72 + centerScore * 0.28
    if (score < bestScore) {
      bestScore = score
      bestId = item.id
    }
  }
  return bestId
}

export const captureLayoutSlotAnchors = (root, section) => {
  const scope = root instanceof Element ? root : document
  return Array.from(scope.querySelectorAll(`[data-layout-section="${section}"]`))
    .map((element, index) => {
      const id = String(element.getAttribute('data-layout-id') || '').trim()
      if (!id) return null
      const rect = element.getBoundingClientRect()
      return {
        id,
        index,
        rect,
        centerX: rect.left + rect.width / 2,
        centerY: rect.top + rect.height / 2
      }
    })
    .filter(Boolean)
}

export const resolveLayoutSlotTarget = (anchors, point) => {
  if (!Array.isArray(anchors) || !anchors.length || !point) return null
  const x = toFiniteNumber(point.x)
  const y = toFiniteNumber(point.y)
  let best = null
  let bestScore = Number.POSITIVE_INFINITY
  for (const item of anchors) {
    const gapX = getRectGap(x, item.rect.left, item.rect.right)
    const gapY = getRectGap(y, item.rect.top, item.rect.bottom)
    const edgeScore = gapX * gapX + gapY * gapY
    const dx = x - item.centerX
    const dy = y - item.centerY
    const centerScore = dx * dx + dy * dy
    const score = edgeScore * 0.72 + centerScore * 0.28
    if (score < bestScore) {
      bestScore = score
      best = item
    }
  }
  return best
}

export const moveLayoutItemToIndex = (list, activeKey, targetIndex) => {
  const next = [...list]
  const activeIndex = next.indexOf(activeKey)
  const normalizedTargetIndex = Math.max(0, Math.min(Number(targetIndex) || 0, next.length - 1))
  if (activeIndex < 0 || activeIndex === normalizedTargetIndex) {
    return next
  }
  const [moved] = next.splice(activeIndex, 1)
  next.splice(normalizedTargetIndex, 0, moved)
  return next
}
