/** 世界坐标系：横向 0..WORLD_WIDTH，方块以 left/width 表示区间 */
export const WORLD_WIDTH = 100
export const BASE_BLOCK_WIDTH = 56
export const BLOCK_HEIGHT = 10
export const PERFECT_THRESHOLD = 1.2
export const LAYER_SCORE = 100
export const PERFECT_BONUS = 50
export const COMBO_PERFECT_BONUS = 25
export const MIN_SPEED = 28
export const SPEED_STEP = 2.2
export const MAX_SPEED = 78

const LAYER_NAMES = Object.freeze([
  '校门基座',
  '教学楼一层',
  '图书馆阅览',
  '实验中心',
  '南湖观景',
  '体育馆',
  '创业基地',
  '行政楼',
  '宿舍天台',
  '毕业钟楼'
])

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const finiteOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback)

/**
 * 裁剪当前块相对底座的悬挑部分。
 * @returns {{ overlapLeft: number, overlapWidth: number, cut: boolean, perfect: boolean, missed: boolean }}
 */
export function cutBlockAgainstBase(moving, base, perfectThreshold = PERFECT_THRESHOLD) {
  const moveLeft = finiteOr(moving?.left, 0)
  const moveWidth = Math.max(0, finiteOr(moving?.width, 0))
  const baseLeft = finiteOr(base?.left, 0)
  const baseWidth = Math.max(0, finiteOr(base?.width, 0))
  const moveRight = moveLeft + moveWidth
  const baseRight = baseLeft + baseWidth

  const overlapLeft = Math.max(moveLeft, baseLeft)
  const overlapRight = Math.min(moveRight, baseRight)
  const overlapWidth = overlapRight - overlapLeft

  if (overlapWidth <= 0.0001) {
    return {
      overlapLeft: 0,
      overlapWidth: 0,
      cut: false,
      perfect: false,
      missed: true
    }
  }

  const leftDelta = Math.abs(moveLeft - baseLeft)
  const widthDelta = Math.abs(moveWidth - baseWidth)
  const perfect = leftDelta <= perfectThreshold && widthDelta <= perfectThreshold

  return {
    overlapLeft: perfect ? baseLeft : overlapLeft,
    overlapWidth: perfect ? baseWidth : overlapWidth,
    cut: !perfect && (moveLeft < baseLeft - 0.0001 || moveRight > baseRight + 0.0001),
    perfect,
    missed: false
  }
}

/**
 * 单层得分：基础层分 + 完美奖励 + 连击加成。
 * score 累计 = 层数相关 + perfect 奖励。
 */
export function scoreForSuccessfulDrop({ perfect = false, perfectCombo = 0 } = {}) {
  let score = LAYER_SCORE
  if (perfect) {
    score += PERFECT_BONUS
    const combo = Math.max(0, Math.trunc(perfectCombo) - 1)
    if (combo > 0) score += combo * COMBO_PERFECT_BONUS
  }
  return score
}

export function layerLabel(layerIndex) {
  return LAYER_NAMES[layerIndex % LAYER_NAMES.length]
}

export function speedForLayer(layerIndex) {
  return clamp(MIN_SPEED + layerIndex * SPEED_STEP, MIN_SPEED, MAX_SPEED)
}

/**
 * 计算叠塔画布的相机纵向偏移（向下为正时用于 y' = y + offset）。
 * 目标：让「当前可玩层 / 移动块」落在视口上部区域，塔升高时视野上移。
 *
 * @param {{ blockCount: number, blockHeightPx: number, viewportHeight: number, groundY?: number, focusRatio?: number }} opts
 * @returns {number} cameraOffsetY（加到绘制 y 上）
 */
export function computeCameraOffsetY({
  blockCount = 1,
  blockHeightPx = BLOCK_HEIGHT,
  viewportHeight = 400,
  groundY,
  focusRatio = 0.38
} = {}) {
  const h = Math.max(1, finiteOr(viewportHeight, 400))
  const bh = Math.max(1, finiteOr(blockHeightPx, BLOCK_HEIGHT))
  const count = Math.max(1, Math.trunc(finiteOr(blockCount, 1)))
  // 包含尚未落下的移动层：可玩顶 = 已放置块数（底座+已叠）对应移动块层索引
  const topLayerIndex = count // moving sits on top of blocks.length
  const gy = Number.isFinite(groundY) ? Number(groundY) : h * 0.88
  const rawTopY = gy - (topLayerIndex + 1) * bh
  const desiredTopY = h * clamp(finiteOr(focusRatio, 0.38), 0.2, 0.55)
  // 若顶层仍在 desired 之下，无需上移（offset=0）；否则把顶层拉到 desired
  const offset = desiredTopY - rawTopY
  return Math.max(0, offset)
}

function makeBlock({ left, width, layerIndex, perfect = false }) {
  return {
    left: finiteOr(left, (WORLD_WIDTH - BASE_BLOCK_WIDTH) / 2),
    width: Math.max(2, finiteOr(width, BASE_BLOCK_WIDTH)),
    layerIndex: Math.max(0, Math.trunc(finiteOr(layerIndex, 0))),
    label: layerLabel(layerIndex),
    perfect: !!perfect
  }
}

export function createInitialStackState(options = {}) {
  const seed = finiteOr(options.seed, 1)
  const base = makeBlock({
    left: (WORLD_WIDTH - BASE_BLOCK_WIDTH) / 2,
    width: BASE_BLOCK_WIDTH,
    layerIndex: 0
  })
  return {
    status: 'playing',
    score: 0,
    layers: 0,
    perfectCount: 0,
    perfectCombo: 0,
    blocks: [base],
    moving: {
      left: 8,
      width: BASE_BLOCK_WIDTH,
      direction: 1,
      speed: speedForLayer(0)
    },
    lastDrop: null,
    seed,
    log: ['校门基座已就位，点击落下下一层。']
  }
}

export function restartStackGame(options = {}) {
  return createInitialStackState(options)
}

function addLog(state, message) {
  const log = [message, ...(state.log || [])].slice(0, 6)
  return { ...state, log }
}

export function tickMovingBlock(state, deltaMs) {
  if (!state || state.status !== 'playing' || !state.moving) return state
  const dt = Math.max(0, finiteOr(deltaMs, 0)) / 1000
  if (dt <= 0) return state

  const moving = { ...state.moving }
  const span = WORLD_WIDTH - moving.width
  let left = moving.left + moving.direction * moving.speed * dt
  if (left <= 0) {
    left = 0
    moving.direction = 1
  } else if (left >= span) {
    left = span
    moving.direction = -1
  }
  moving.left = left
  return { ...state, moving }
}

export function dropStackBlock(state) {
  if (!state || state.status !== 'playing' || !state.moving) return state
  const base = state.blocks[state.blocks.length - 1]
  const cut = cutBlockAgainstBase(state.moving, base)

  if (cut.missed) {
    return addLog(
      {
        ...state,
        status: 'lost',
        moving: null,
        lastDrop: { ...cut, scored: 0 }
      },
      `悬空失手，叠到第 ${state.layers} 层，得分 ${state.score}。`
    )
  }

  const nextPerfectCombo = cut.perfect ? state.perfectCombo + 1 : 0
  const gained = scoreForSuccessfulDrop({
    perfect: cut.perfect,
    perfectCombo: nextPerfectCombo
  })
  const nextLayers = state.layers + 1
  const placed = makeBlock({
    left: cut.overlapLeft,
    width: cut.overlapWidth,
    layerIndex: nextLayers,
    perfect: cut.perfect
  })
  const nextMovingWidth = cut.overlapWidth
  const nextState = {
    ...state,
    score: state.score + gained,
    layers: nextLayers,
    perfectCount: state.perfectCount + (cut.perfect ? 1 : 0),
    perfectCombo: nextPerfectCombo,
    blocks: [...state.blocks, placed],
    moving: {
      left: 0,
      width: nextMovingWidth,
      direction: nextLayers % 2 === 0 ? 1 : -1,
      speed: speedForLayer(nextLayers)
    },
    lastDrop: { ...cut, scored: gained }
  }

  const message = cut.perfect
    ? `完美对齐！${placed.label} +${gained}（连击 ${nextPerfectCombo}）`
    : cut.cut
      ? `切除悬挑：${placed.label} +${gained}`
      : `稳稳叠上：${placed.label} +${gained}`
  return addLog(nextState, message)
}
