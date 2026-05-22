export const SWING_LIMIT_DEGREES = 58
export const DEFAULT_TARGET_SCORE = 820
export const DEFAULT_TIME_LEFT_MS = 60000

const freezeItems = (items) => Object.freeze(items.map((item) => Object.freeze({ ...item })))

export const CAMPUS_MINER_ITEMS = freezeItems([
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

const LAB_MINER_ITEMS = freezeItems([
  {
    id: 'freshman-card',
    name: '新生校园卡',
    type: 'light',
    x: -118,
    y: 154,
    radius: 14,
    value: 90,
    drag: 0.84
  },
  {
    id: 'lab-key',
    name: '实验室钥匙',
    type: 'bonus',
    x: 82,
    y: 186,
    radius: 15,
    value: 130,
    drag: 0.92
  },
  {
    id: 'time-supply',
    name: '社团补给卡',
    type: 'powerup',
    x: -16,
    y: 248,
    radius: 16,
    value: 60,
    drag: 0.78,
    effect: { type: 'time', amountMs: 6000 }
  },
  {
    id: 'robot-arm',
    name: '机器人手臂',
    type: 'heavy',
    x: 128,
    y: 292,
    radius: 23,
    value: 250,
    drag: 1.78
  },
  {
    id: 'innovation-medal',
    name: '创新奖章',
    type: 'bonus',
    x: -142,
    y: 350,
    radius: 18,
    value: 210,
    drag: 1.08
  },
  {
    id: 'long-hook-kit',
    name: '工程楼长钩',
    type: 'powerup',
    x: 36,
    y: 402,
    radius: 17,
    value: 80,
    drag: 0.86,
    effect: { type: 'hookBoost', amount: 72 }
  },
  {
    id: 'server-core',
    name: '数据中心核心',
    type: 'heavy',
    x: 112,
    y: 486,
    radius: 24,
    value: 300,
    drag: 1.95
  }
])

const EAST_CAMPUS_ITEMS = freezeItems([
  {
    id: 'bus-pass',
    name: '校车通行证',
    type: 'light',
    x: -88,
    y: 142,
    radius: 13,
    value: 80,
    drag: 0.82
  },
  {
    id: 'maker-token',
    name: '创客币',
    type: 'bonus',
    x: 96,
    y: 174,
    radius: 16,
    value: 160,
    drag: 1
  },
  {
    id: 'rusted-bolt',
    name: '生锈螺栓',
    type: 'hazard',
    x: -28,
    y: 244,
    radius: 18,
    value: -80,
    drag: 1.1
  },
  {
    id: 'competition-multiplier',
    name: '竞赛倍率卡',
    type: 'powerup',
    x: 134,
    y: 284,
    radius: 16,
    value: 120,
    drag: 0.9,
    effect: { type: 'scoreMultiplier', multiplier: 2 }
  },
  {
    id: 'forge-anvil',
    name: '工训铁砧',
    type: 'heavy',
    x: -124,
    y: 350,
    radius: 26,
    value: 330,
    drag: 2.18
  },
  {
    id: 'map-fragment',
    name: '矿区地图碎片',
    type: 'powerup',
    x: 48,
    y: 410,
    radius: 17,
    value: 90,
    drag: 0.88,
    effect: { type: 'time', amountMs: 4500 }
  },
  {
    id: 'east-campus-crystal',
    name: '东区能量晶体',
    type: 'bonus',
    x: 0,
    y: 526,
    radius: 20,
    value: 260,
    drag: 1.24
  }
])

const FINAL_MINER_ITEMS = freezeItems([
  {
    id: 'graduation-pin',
    name: '毕业徽针',
    type: 'light',
    x: -136,
    y: 150,
    radius: 14,
    value: 100,
    drag: 0.8
  },
  {
    id: 'library-gem',
    name: '馆藏宝石',
    type: 'bonus',
    x: 108,
    y: 202,
    radius: 18,
    value: 210,
    drag: 1.02
  },
  {
    id: 'broken-router',
    name: '报废路由器',
    type: 'hazard',
    x: 12,
    y: 270,
    radius: 18,
    value: -120,
    drag: 1.2
  },
  {
    id: 'double-score-badge',
    name: '双创加成章',
    type: 'powerup',
    x: -108,
    y: 322,
    radius: 17,
    value: 150,
    drag: 0.94,
    effect: { type: 'scoreMultiplier', multiplier: 2.4 }
  },
  {
    id: 'precision-hook',
    name: '精密长钩组',
    type: 'powerup',
    x: 134,
    y: 370,
    radius: 16,
    value: 110,
    drag: 0.9,
    effect: { type: 'hookBoost', amount: 96 }
  },
  {
    id: 'thesis-safe',
    name: '论文保险箱',
    type: 'heavy',
    x: -38,
    y: 456,
    radius: 28,
    value: 420,
    drag: 2.45
  },
  {
    id: 'hbut-core',
    name: '湖工矿脉核心',
    type: 'bonus',
    x: 82,
    y: 548,
    radius: 23,
    value: 360,
    drag: 1.38
  }
])

export const LEVELS = Object.freeze([
  Object.freeze({
    id: 'south-lake',
    name: '南湖浅层',
    targetScore: DEFAULT_TARGET_SCORE,
    timeLeftMs: DEFAULT_TIME_LEFT_MS,
    items: CAMPUS_MINER_ITEMS
  }),
  Object.freeze({
    id: 'lab-depth',
    name: '实验楼深层',
    targetScore: 980,
    timeLeftMs: 58000,
    items: LAB_MINER_ITEMS,
    hook: { extendSpeed: 302, returnSpeed: 356 }
  }),
  Object.freeze({
    id: 'east-campus',
    name: '东区工训矿道',
    targetScore: 1120,
    timeLeftMs: 56000,
    items: EAST_CAMPUS_ITEMS,
    hook: { extendSpeed: 318, returnSpeed: 372 }
  }),
  Object.freeze({
    id: 'final-core',
    name: '毕业矿脉核心',
    targetScore: 1280,
    timeLeftMs: 54000,
    items: FINAL_MINER_ITEMS,
    hook: { extendSpeed: 330, returnSpeed: 388 }
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

const clampLevelIndex = (levelIndex) => clamp(
  Number.isInteger(levelIndex) ? levelIndex : 0,
  0,
  LEVELS.length - 1
)

const deepestReach = (items) =>
  items.reduce((max, item) => Math.max(max, Math.hypot(item.x, item.y) + item.radius), BASE_HOOK_LENGTH)

function resolveHook(level, items, optionsHook = {}) {
  const hasCustomMaxLength = Number.isFinite(optionsHook.maxLength)
  const minimumReach = deepestReach(items) + 24
  const levelHook = level.hook || {}
  const maxLength = hasCustomMaxLength
    ? optionsHook.maxLength
    : Math.max(DEFAULT_HOOK.maxLength, levelHook.maxLength || 0, minimumReach)

  return {
    ...DEFAULT_HOOK,
    ...levelHook,
    ...optionsHook,
    maxLength,
    length: Number.isFinite(optionsHook.length) ? optionsHook.length : DEFAULT_HOOK.baseLength,
    carrying: optionsHook.carrying ? cloneItem(optionsHook.carrying) : null
  }
}

export function createInitialMinerState(options = {}) {
  const levelIndex = clampLevelIndex(options.levelIndex)
  const level = LEVELS[levelIndex]
  const items = Array.isArray(options.items) ? options.items.map(cloneItem) : level.items.map(cloneItem)
  const hook = resolveHook(level, items, options.hook || {})

  return {
    status: options.status || 'aiming',
    levelIndex,
    levelNumber: levelIndex + 1,
    levelId: level.id,
    levelName: level.name,
    score: Number.isFinite(options.score) ? options.score : 0,
    targetScore: Number.isFinite(options.targetScore) ? options.targetScore : level.targetScore,
    timeLeftMs: Number.isFinite(options.timeLeftMs) ? options.timeLeftMs : level.timeLeftMs,
    items,
    hook,
    log: Array.isArray(options.log) ? [...options.log] : [`第 ${levelIndex + 1} 关：${level.name}，瞄准湖工宝物。`]
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

function scoreText(value) {
  if (value > 0) return `+${value}`
  return String(value)
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

export function applyMinerItemEffect(state, item) {
  const next = cloneState(state)
  const effect = item.effect || null
  let scoreDelta = item.value
  let message = `带回 ${item.name}，得分 ${scoreText(scoreDelta)}`

  if (effect?.type === 'time') {
    next.timeLeftMs = Math.max(0, next.timeLeftMs + effect.amountMs)
    message = `带回 ${item.name}，时间 +${Math.round(effect.amountMs / 1000)}s，得分 ${scoreText(scoreDelta)}`
  } else if (effect?.type === 'scoreMultiplier') {
    scoreDelta = Math.round(item.value * effect.multiplier)
    message = `带回 ${item.name}，倍率得分 ${scoreText(scoreDelta)}`
  } else if (effect?.type === 'hookBoost') {
    next.hook.maxLength += effect.amount
    message = `带回 ${item.name}，吊钩延长 ${effect.amount}，得分 ${scoreText(scoreDelta)}`
  }

  next.score = Math.max(0, next.score + scoreDelta)
  next.log.unshift(message)
  next.log = next.log.slice(0, 5)
  return next
}

function advanceToNextLevel(state) {
  const nextLevelIndex = state.levelIndex + 1
  if (nextLevelIndex >= LEVELS.length) {
    state.status = 'won'
    state.log.unshift('完成全部矿区目标，湖工矿脉满载而归。')
    state.log = state.log.slice(0, 5)
    return
  }

  const nextLevelState = createInitialMinerState({
    levelIndex: nextLevelIndex,
    log: [`进入第 ${nextLevelIndex + 1} 关：${LEVELS[nextLevelIndex].name}。`, ...state.log].slice(0, 5)
  })

  Object.assign(state, nextLevelState)
}

function finishReturn(state) {
  const carrying = state.hook.carrying
  if (carrying) {
    Object.assign(state, applyMinerItemEffect(state, carrying))
  }

  state.hook = {
    ...state.hook,
    mode: 'swinging',
    length: state.hook.baseLength,
    carrying: null
  }

  if (state.score >= state.targetScore) {
    state.log.unshift(`第 ${state.levelNumber} 关目标达成。`)
    state.log = state.log.slice(0, 5)
    advanceToNextLevel(state)
  } else {
    state.status = 'aiming'
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
