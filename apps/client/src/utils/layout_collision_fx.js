let layoutCollisionFxSeed = 0

const DEFAULT_PALETTE = ['#5b8cff', '#8fd6ff', '#f6c56f']

const clampNumber = (value, min, max) => {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return min
  return Math.min(max, Math.max(min, numeric))
}

const nextFxId = (prefix) => `${prefix}-${Date.now()}-${layoutCollisionFxSeed += 1}`

export const resolveCollisionPalette = (...colors) => {
  const palette = colors
    .flat()
    .map((item) => String(item || '').trim())
    .filter(Boolean)
  return palette.length ? palette : [...DEFAULT_PALETTE]
}

export const resolveRelativeCollisionPoint = ({ rootRect, sourceRect, targetRect }) => {
  if (!rootRect || !targetRect) {
    return { x: 0, y: 0 }
  }
  const targetCenterX = targetRect.left + targetRect.width / 2
  const targetCenterY = targetRect.top + targetRect.height / 2
  const sourceCenterX = sourceRect ? sourceRect.left + sourceRect.width / 2 : targetCenterX
  const sourceCenterY = sourceRect ? sourceRect.top + sourceRect.height / 2 : targetCenterY
  return {
    x: (sourceCenterX + targetCenterX) / 2 - rootRect.left,
    y: (sourceCenterY + targetCenterY) / 2 - rootRect.top
  }
}

export const createLayoutCollisionBurst = ({
  x = 0,
  y = 0,
  colors = DEFAULT_PALETTE,
  sparkCount = 12
} = {}) => {
  const palette = resolveCollisionPalette(colors)
  const burst = [
    {
      id: nextFxId('ring'),
      kind: 'ring',
      x,
      y,
      radius: 18,
      growth: 3.1 + Math.random() * 0.8,
      life: 0.92,
      decay: 0.07,
      color: palette[0]
    },
    {
      id: nextFxId('core'),
      kind: 'core',
      x,
      y,
      size: 12,
      life: 0.72,
      decay: 0.09,
      color: palette[Math.min(1, palette.length - 1)] || palette[0]
    }
  ]

  for (let index = 0; index < sparkCount; index += 1) {
    const angle = (Math.PI * 2 * index) / sparkCount + (Math.random() - 0.5) * 0.22
    const speed = 2 + Math.random() * 3.8
    burst.push({
      id: nextFxId('spark'),
      kind: 'spark',
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      gravity: 0.08 + Math.random() * 0.08,
      life: 1,
      decay: 0.045 + Math.random() * 0.025,
      size: 2.6 + Math.random() * 3.1,
      color: palette[index % palette.length]
    })
  }

  return burst
}

export const advanceLayoutCollisionFx = (items, deltaMs = 16.67) => {
  if (!Array.isArray(items) || items.length === 0) return []
  const step = clampNumber(deltaMs / 16.67, 0.72, 1.9)
  return items
    .map((item) => {
      if (!item) return null
      const next = { ...item }
      if (next.kind === 'spark') {
        next.x += next.vx * step
        next.y += next.vy * step
        next.vy += next.gravity * step
        next.vx *= 0.984
        next.life -= next.decay * step
        next.size *= 0.994
      } else if (next.kind === 'ring') {
        next.radius += next.growth * step
        next.life -= next.decay * step
      } else {
        next.size += 0.18 * step
        next.life -= next.decay * step
      }
      return next.life > 0.02 ? next : null
    })
    .filter(Boolean)
}
