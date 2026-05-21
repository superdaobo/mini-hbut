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

const DEFAULT_PAIR_COUNT = 6

const cloneCard = (card) => ({ ...card })
const clonePair = (pair) => ({ ...pair })

const cloneState = (state) => ({
  ...state,
  cards: state.cards.map(cloneCard),
  pairs: state.pairs.map(clonePair),
  selectedCardIds: [...state.selectedCardIds],
  pendingMismatch: state.pendingMismatch ? [...state.pendingMismatch] : null,
  log: [...state.log]
})

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

const buildCards = (pairs) =>
  pairs.flatMap((pair) => [
    {
      id: `${pair.id}-a`,
      pairId: pair.id,
      label: pair.label,
      hint: pair.hint,
      category: pair.category,
      revealed: false,
      matched: false
    },
    {
      id: `${pair.id}-b`,
      pairId: pair.id,
      label: pair.label,
      hint: pair.hint,
      category: pair.category,
      revealed: false,
      matched: false
    }
  ])

export function createInitialMemoryState(options = {}) {
  const pairSource = Array.isArray(options.pairs) ? options.pairs : CAMPUS_MEMORY_PAIRS
  const pairCount = Math.max(2, Math.min(options.pairCount || DEFAULT_PAIR_COUNT, pairSource.length))
  const pairs = pairSource.slice(0, pairCount).map(clonePair)
  const builtCards = buildCards(pairs)
  const cards = options.shuffle === false ? builtCards : shuffleCards(builtCards, options.seed || 1)

  return {
    status: 'playing',
    moves: 0,
    matchedPairs: 0,
    startedAt: Number.isFinite(options.startedAt) ? options.startedAt : 0,
    elapsedMs: Number.isFinite(options.elapsedMs) ? options.elapsedMs : 0,
    pairs,
    cards,
    selectedCardIds: [],
    pendingMismatch: null,
    log: ['翻开两张湖工记忆牌，找出同一组校园记忆。']
  }
}

export function restartMemoryGame(state, options = {}) {
  const sourcePairs = state?.pairs?.length ? state.pairs : CAMPUS_MEMORY_PAIRS
  return createInitialMemoryState({
    pairs: sourcePairs,
    pairCount: sourcePairs.length,
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
    state.log.unshift(`配对成功：${first.label}，${first.hint}`)
    state.selectedCardIds = []
    state.pendingMismatch = null
  } else {
    state.pendingMismatch = [first.id, second.id]
    state.log.unshift(`暂未匹配：${first.label} 和 ${second.label}`)
  }

  state.log = state.log.slice(0, 5)
  if (state.matchedPairs >= state.pairs.length) {
    state.status = 'won'
    state.log.unshift(`全部配对完成，共 ${state.moves} 步。`)
  }
}

export function flipMemoryCard(state, cardId) {
  const next = cloneState(state)
  if (next.status !== 'playing') return next

  hidePendingMismatch(next)

  const card = next.cards.find((item) => item.id === cardId)
  if (!card || card.revealed || card.matched) return next

  revealCard(next, card)
  resolveSelection(next)
  return next
}

export function tickMemoryGame(state, deltaMs) {
  const next = cloneState(state)
  if (next.status === 'playing') {
    next.elapsedMs += Math.max(0, Number.isFinite(deltaMs) ? deltaMs : 0)
  }
  return next
}
