export const SWING_LIMIT_DEGREES = 58
export const DEFAULT_TARGET_SCORE = 820
export const DEFAULT_TIME_LEFT_MS = 60000

export const CAMPUS_MINER_ITEMS = Object.freeze([
  Object.freeze({
    id: 'south-lake-pearl',
    name: '南湖珍珠',
    type: 'bonus',
    x: -96,
    y: 176,
    radius: 18,
    value: 180,
    drag: 1
  }),
  Object.freeze({
    id: 'library-scroll',
    name: '图书馆书卷',
    type: 'bonus',
    x: 72,
    y: 132,
    radius: 17,
    value: 160,
    drag: 1
  }),
  Object.freeze({
    id: 'engineering-gear',
    name: '工程楼齿轮',
    type: 'heavy',
    x: -28,
    y: 248,
    radius: 22,
    value: 220,
    drag: 1.55
  }),
  Object.freeze({
    id: 'canteen-coupon',
    name: '食堂餐券',
    type: 'light',
    x: 118,
    y: 244,
    radius: 15,
    value: 90,
    drag: 0.92
  }),
  Object.freeze({
    id: 'lab-chip',
    name: '实验室芯片',
    type: 'bonus',
    x: -140,
    y: 318,
    radius: 16,
    value: 150,
    drag: 1
  }),
  Object.freeze({
    id: 'north-gate-stone',
    name: '北门校石',
    type: 'heavy',
    x: 28,
    y: 346,
    radius: 24,
    value: 260,
    drag: 1.85
  }),
  Object.freeze({
    id: 'club-badge',
    name: '社团徽章',
    type: 'light',
    x: 144,
    y: 362,
    radius: 14,
    value: 80,
    drag: 0.88
  }),
  Object.freeze({
    id: 'graduate-seal',
    name: '毕设印章',
    type: 'bonus',
    x: -64,
    y: 428,
    radius: 18,
    value: 190,
    drag: 1.12
  }),
  Object.freeze({
    id: 'network-router',
    name: '校园网路由',
    type: 'heavy',
    x: 92,
    y: 456,
    radius: 21,
    value: 210,
    drag: 1.45
  })
])

const BASE_HOOK_LENGTH = 34
const DEFAULT_HOOK = Object.freeze({
  mode: 'swinging',
  angle: -24,
  angleVelocity: 72,
  length: BASE_HOOK_LENGTH,
  baseLength: BASE_HOOK_LENGTH,
  maxLength: 326,
  extendSpeed: 286,
  returnSpeed: 342,
  carrying: null
})

const clamp = (value, min, max) => Math.min(max, Math.max(min, value))
const toSeconds = (deltaMs) => clamp(Number.isFinite(deltaMs) ? deltaMs : 0, 0, 2400) / 1000
const cloneItem = (item) => ({ ...item })
const cloneHook = (hook) => ({
  ...hook,
  carrying: hook.carrying ? cloneItem(hook.carrying) : null
})

const cloneState = (state) => ({
  ...state,
  items: state.items.map(cloneItem),
  hook: cloneHook(state.hook),
  log: [...state.log]
})

export function createInitialMinerState(options = {}) {
  const items = Array.isArray(options.items) ? options.items.map(cloneItem) : CAMPUS_MINER_ITEMS.map(cloneItem)
  const hook = {
    ...DEFAULT_HOOK,
    ...(options.hook || {}),
    carrying: options.hook?.carrying ? cloneItem(options.hook.carrying) : null
  }

  return {
    status: options.status || 'aiming',
    score: Number.isFinite(options.score) ? options.score : 0,
    targetScore: Number.isFinite(options.targetScore) ? options.targetScore : DEFAULT_TARGET_SCORE,
    timeLeftMs: Number.isFinite(options.timeLeftMs) ? options.timeLeftMs : DEFAULT_TIME_LEFT_MS,
    items,
    hook,
    log: Array.isArray(options.log) ? [...options.log] : ['瞄准湖工宝物，等待发射。']
  }
}

export function restartMinerGame() {
  return createInitialMinerState()
}

export function fireHook(state) {
  const next = cloneState(state)
  if (next.status !== 'aiming' || next.hook.mode !== 'swinging') return next
  next.hook.mode = 'extending'
  next.hook.length = next.hook.baseLength
  return next
}

function hookPoint(angle, length) {
  const radians = (angle * Math.PI) / 180
  return {
    x: Math.sin(radians) * length,
    y: Math.cos(radians) * length
  }
}

function distancePointToSegment(point, start, end) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const lengthSquared = dx * dx + dy * dy
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y)
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared, 0, 1)
  const closest = {
    x: start.x + dx * t,
    y: start.y + dy * t
  }
  return Math.hypot(point.x - closest.x, point.y - closest.y)
}

function itemDistanceOnHook(angle, item) {
  const radians = (angle * Math.PI) / 180
  const direction = {
    x: Math.sin(radians),
    y: Math.cos(radians)
  }
  return Math.max(BASE_HOOK_LENGTH, item.x * direction.x + item.y * direction.y)
}

function findHookCollision(items, angle, previousLength, nextLength) {
  const start = hookPoint(angle, previousLength)
  const end = hookPoint(angle, nextLength)
  const reachableItems = items
    .map((item, index) => ({
      item,
      index,
      distance: distancePointToSegment({ x: item.x, y: item.y }, start, end),
      hookDistance: itemDistanceOnHook(angle, item)
    }))
    .filter((entry) => entry.hookDistance >= previousLength - entry.item.radius)
    .filter((entry) => entry.hookDistance <= nextLength + entry.item.radius)
    .filter((entry) => entry.distance <= entry.item.radius + 8)
    .sort((a, b) => a.hookDistance - b.hookDistance)

  return reachableItems[0] || null
}

function swingHook(hook, deltaSeconds) {
  let angle = hook.angle + hook.angleVelocity * deltaSeconds
  let angleVelocity = hook.angleVelocity

  if (angle > SWING_LIMIT_DEGREES) {
    angle = SWING_LIMIT_DEGREES - (angle - SWING_LIMIT_DEGREES)
    angleVelocity = -Math.abs(angleVelocity)
  } else if (angle < -SWING_LIMIT_DEGREES) {
    angle = -SWING_LIMIT_DEGREES + (-SWING_LIMIT_DEGREES - angle)
    angleVelocity = Math.abs(angleVelocity)
  }

  return {
    ...hook,
    angle: clamp(angle, -SWING_LIMIT_DEGREES, SWING_LIMIT_DEGREES),
    angleVelocity
  }
}

function finishReturn(state) {
  const carrying = state.hook.carrying
  if (carrying) {
    state.score += carrying.value
    state.log.unshift(`带回 ${carrying.name}，得分 +${carrying.value}`)
    state.log = state.log.slice(0, 5)
  }

  state.hook = {
    ...state.hook,
    mode: 'swinging',
    length: state.hook.baseLength,
    carrying: null
  }
  state.status = state.score >= state.targetScore ? 'won' : 'aiming'
  if (state.status === 'won') {
    state.log.unshift('达成本轮目标，湖工矿区满载而归。')
  }
}

export function stepMinerGame(state, deltaMs) {
  const next = cloneState(state)
  if (next.status === 'won' || next.status === 'lost') return next

  const deltaSeconds = toSeconds(deltaMs)
  next.timeLeftMs = Math.max(0, next.timeLeftMs - deltaSeconds * 1000)

  if (next.hook.mode === 'swinging') {
    next.hook = swingHook(next.hook, deltaSeconds)
  } else if (next.hook.mode === 'extending') {
    const previousLength = next.hook.length
    const nextLength = Math.min(next.hook.maxLength, previousLength + next.hook.extendSpeed * deltaSeconds)
    const collision = findHookCollision(next.items, next.hook.angle, previousLength, nextLength)

    if (collision) {
      next.hook.mode = 'returning'
      next.hook.length = collision.hookDistance
      next.hook.carrying = cloneItem(collision.item)
      next.items.splice(collision.index, 1)
    } else {
      next.hook.length = nextLength
      if (nextLength >= next.hook.maxLength) {
        next.hook.mode = 'returning'
      }
    }
  } else if (next.hook.mode === 'returning') {
    const drag = Math.max(0.7, next.hook.carrying?.drag || 1)
    next.hook.length = Math.max(
      next.hook.baseLength,
      next.hook.length - (next.hook.returnSpeed / drag) * deltaSeconds
    )
    if (next.hook.length <= next.hook.baseLength + 0.001) {
      finishReturn(next)
    }
  }

  if (next.status !== 'won' && next.timeLeftMs <= 0) {
    next.status = 'lost'
    next.hook.mode = 'swinging'
    next.log.unshift('时间耗尽，矿区收工。')
    next.log = next.log.slice(0, 5)
  }

  return next
}
