export const CAMPUS_MEMORY_PAIRS = Object.freeze([
  Object.freeze({ id: 'south-lake', label: '南湖', hint: '湖畔晚风', category: 'campus' }),
  Object.freeze({ id: 'library', label: '图书馆', hint: '书香自习', category: 'study' }),
  Object.freeze({ id: 'engineering', label: '工程楼', hint: '齿轮与图纸', category: 'study' }),
  Object.freeze({ id: 'canteen', label: '西区食堂', hint: '热干面补给', category: 'life' }),
  Object.freeze({ id: 'sports', label: '运动场', hint: '晨跑打卡', category: 'life' }),
  Object.freeze({ id: 'lab', label: '实验室', hint: '调试到深夜', category: 'study' }),
  Object.freeze({ id: 'gate', label: '校门', hint: '启程返校', category: 'campus' }),
  Object.freeze({ id: 'club', label: '社团招新', hint: '摊位与海报', category: 'campus' })
])

export const MEMORY_LEVELS = Object.freeze([
  Object.freeze({
    name: '南湖热身',
    pairCount: 3,
    timeLeftMs: 42000,
    previewMs: 5200,
    matchScore: 100,
    comboBonus: 70,
    mismatchPenalty: 24,
    hintMode: 'full'
  }),
  Object.freeze({
    name: '图书馆夜读',
    pairCount: 4,
    timeLeftMs: 52000,
    previewMs: 4100,
    matchScore: 120,
    comboBonus: 82,
    mismatchPenalty: 34,
    hintMode: 'full'
  }),
  Object.freeze({
    name: '工程楼速记',
    pairCount: 6,
    timeLeftMs: 64000,
    previewMs: 3100,
    matchScore: 145,
    comboBonus: 96,
    mismatchPenalty: 48,
    hintMode: 'category'
  }),
  Object.freeze({
    name: '社团招新终局',
    pairCount: 8,
    timeLeftMs: 78000,
    previewMs: 2300,
    matchScore: 170,
    comboBonus: 112,
    mismatchPenalty: 64,
    hintMode: 'minimal'
  })
])

const DEFAULT_LEVEL_INDEX = 0
const MAX_LOG_ITEMS = 6

const cloneCard = (card) => ({ ...card })
const clonePair = (pair) => ({ ...pair })

const cloneState = (state) => ({
  ...state,
  cards: state.cards.map(cloneCard),
  pairs: state.pairs.map(clonePair),
  allPairs: state.allPairs.map(clonePair),
  selectedCardIds: [...state.selectedCardIds],
  pendingMismatch: state.pendingMismatch ? [...state.pendingMismatch] : null,
  log: [...state.log]
})

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))

const finiteOr = (value, fallback) => (Number.isFinite(value) ? value : fallback)

const levelAt = (levelIndex) => {
  const index = clamp(Number.isFinite(levelIndex) ? Math.trunc(levelIndex) : DEFAULT_LEVEL_INDEX, 0, MEMORY_LEVELS.length - 1)
  return { index, level: MEMORY_LEVELS[index] }
}

const createSeededRandom = (seed = 1) => {
  let value = Math.abs(Math.trunc(seed)) || 1
  return () => {
    value = (value * 48271) % 0x7fffffff
    return value / 0x7fffffff
  }
}

const shuffleCards = (cards, seed) => {
  const random = createSeededRandom(seed)
  const next = cards.map(cloneCard)
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const temp = next[index]
    next[index] = next[swapIndex]
    next[swapIndex] = temp
  }
  return next
}

const buildCards = (pairs, revealed = false) =>
  pairs.flatMap((pair) => [
    {
      id: `${pair.id}-a`,
      pairId: pair.id,
      label: pair.label,
      hint: pair.hint,
      category: pair.category,
      revealed,
      matched: false
    },
    {
      id: `${pair.id}-b`,
      pairId: pair.id,
      label: pair.label,
      hint: pair.hint,
      category: pair.category,
      revealed,
      matched: false
    }
  ])

export function createInitialMemoryState(options = {}) {
  const pairSource = Array.isArray(options.pairs) ? options.pairs : CAMPUS_MEMORY_PAIRS
  const { index: levelIndex, level } = levelAt(options.levelIndex)
  const requestedPairCount = Number.isFinite(options.pairCount) ? Math.trunc(options.pairCount) : level.pairCount
  const pairCount = clamp(requestedPairCount, 2, pairSource.length)
  const timeLeftMs = Math.max(0, finiteOr(options.timeLeftMs, level.timeLeftMs))
  const previewLeftMs = Math.max(0, finiteOr(options.previewLeftMs, level.previewMs))
  const status = options.status || (previewLeftMs > 0 ? 'preview' : 'playing')
  const revealedForPreview = status === 'preview' && previewLeftMs > 0
  const pairs = pairSource.slice(0, pairCount).map(clonePair)
  const builtCards = buildCards(pairs, revealedForPreview)
  const seed = finiteOr(options.seed, levelIndex + 1)
  const shouldShuffle = options.shuffle !== false
  const cards = shouldShuffle ? shuffleCards(builtCards, seed) : builtCards

  return {
    status,
    levelIndex,
    levelNumber: levelIndex + 1,
    levelName: level.name,
    totalLevels: MEMORY_LEVELS.length,
    hintMode: level.hintMode,
    timeLimitMs: timeLeftMs,
    timeLeftMs,
    previewLeftMs,
    moves: finiteOr(options.moves, 0),
    matchedPairs: 0,
    startedAt: Number.isFinite(options.startedAt) ? options.startedAt : 0,
    elapsedMs: Number.isFinite(options.elapsedMs) ? options.elapsedMs : 0,
    score: Math.max(0, finiteOr(options.score, 0)),
    combo: Math.max(0, finiteOr(options.combo, 0)),
    mistakes: Math.max(0, finiteOr(options.mistakes, 0)),
    pairs,
    allPairs: pairSource.map(clonePair),
    cards,
    selectedCardIds: [],
    pendingMismatch: null,
    seed,
    shuffle: shouldShuffle,
    log: options.log ? [...options.log].slice(0, MAX_LOG_ITEMS) : [`第 ${levelIndex + 1} 关：${level.name}，先记住牌面位置。`]
  }
}

export function restartMemoryGame(state, options = {}) {
  const sourcePairs = state?.allPairs?.length ? state.allPairs : CAMPUS_MEMORY_PAIRS
  return createInitialMemoryState({
    pairs: sourcePairs,
    levelIndex: Number.isFinite(options.levelIndex) ? options.levelIndex : 0,
    seed: options.seed || 1,
    shuffle: options.shuffle
  })
}

function hidePendingMismatch(state) {
  if (!state.pendingMismatch) return
  const pendingSet = new Set(state.pendingMismatch)
  for (const card of state.cards) {
    if (pendingSet.has(card.id) && !card.matched) {
      card.revealed = false
    }
  }
  state.pendingMismatch = null
  state.selectedCardIds = []
}

function revealCard(state, card) {
  card.revealed = true
  state.selectedCardIds.push(card.id)
}

function trimLog(state) {
  state.log = state.log.slice(0, MAX_LOG_ITEMS)
}

function addLog(state, message) {
  state.log.unshift(message)
  trimLog(state)
}

function matchScoreFor(state) {
  const level = MEMORY_LEVELS[state.levelIndex]
  const nextCombo = state.combo + 1
  return level.matchScore + level.comboBonus * nextCombo
}

function enterNextLevel(state) {
  const nextLevelIndex = state.levelIndex + 1
  const nextState = createInitialMemoryState({
    pairs: state.allPairs,
    levelIndex: nextLevelIndex,
    score: state.score,
    seed: state.seed + 101,
    shuffle: state.shuffle
  })
  nextState.log = [`进入第 ${nextState.levelNumber} 关：${nextState.levelName}`, ...state.log].slice(0, MAX_LOG_ITEMS)
  return nextState
}

function resolveSelection(state) {
  if (state.selectedCardIds.length < 2) return
  const selectedCards = state.selectedCardIds.map((id) => state.cards.find((card) => card.id === id))
  const [first, second] = selectedCards
  if (!first || !second) return

  state.moves += 1
  if (first.pairId === second.pairId) {
    first.matched = true
    second.matched = true
    state.matchedPairs += 1
    const gainedScore = matchScoreFor(state)
    state.combo += 1
    state.score += gainedScore
    addLog(state, `连击 ${state.combo}：${first.label} +${gainedScore}`)
    state.selectedCardIds = []
    state.pendingMismatch = null
  } else {
    state.pendingMismatch = [first.id, second.id]
    state.mistakes += 1
    state.combo = 0
    state.score = Math.max(0, state.score - MEMORY_LEVELS[state.levelIndex].mismatchPenalty)
    addLog(state, `错配 ${state.mistakes} 次：${first.label} 和 ${second.label}`)
  }

  if (state.matchedPairs >= state.pairs.length) {
    if (state.levelIndex < MEMORY_LEVELS.length - 1) {
      return enterNextLevel(state)
    }
    state.status = 'won'
    state.score += Math.ceil(state.timeLeftMs / 1000) * 12
    addLog(state, `全部通关，共 ${state.moves} 步，剩余时间已折算奖励。`)
  }

  return state
}

export function flipMemoryCard(state, cardId) {
  const next = cloneState(state)
  if (next.status !== 'playing') return next

  hidePendingMismatch(next)

  const card = next.cards.find((item) => item.id === cardId)
  if (!card || card.revealed || card.matched) return next

  revealCard(next, card)
  return resolveSelection(next) || next
}

export function tickMemoryGame(state, deltaMs) {
  const next = cloneState(state)
  const elapsedDelta = Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0)

  if (next.status === 'preview') {
    next.previewLeftMs = Math.max(0, next.previewLeftMs - elapsedDelta)
    if (next.previewLeftMs === 0) {
      for (const card of next.cards) {
        if (!card.matched) card.revealed = false
      }
      next.status = 'playing'
      addLog(next, `第 ${next.levelNumber} 关开始，倒计时 ${Math.ceil(next.timeLeftMs / 1000)} 秒。`)
    }
    return next
  }

  if (next.status === 'playing') {
    next.elapsedMs += elapsedDelta
    next.timeLeftMs = Math.max(0, next.timeLeftMs - elapsedDelta)
    if (next.timeLeftMs === 0) {
      next.status = 'lost'
      next.combo = 0
      next.selectedCardIds = []
      next.pendingMismatch = null
      addLog(next, `时间耗尽：停在第 ${next.levelNumber} 关。`)
    }
  }
  return next
}
