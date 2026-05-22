export const PASS_START_BONUS = 80
export const WIN_CREDITS = 16
export const INITIAL_COINS = 320

const MAX_LOG_ITEMS = 7
const RESOURCE_MIN = 0
const RESOURCE_MAX = 100
const DEFAULT_STAGE_INDEX = 0

export const MONOPOLY_STAGES = Object.freeze([
  Object.freeze({
    name: '新生探索季',
    targetCredits: 8,
    targetInfluence: 4,
    initialCoins: INITIAL_COINS,
    initialEnergy: 82,
    initialStress: 18,
    startingCards: ['library-pass']
  }),
  Object.freeze({
    name: '社团创业季',
    targetCredits: 12,
    targetInfluence: 8,
    initialCoins: 360,
    initialEnergy: 76,
    initialStress: 24,
    startingCards: ['library-pass', 'club-network']
  }),
  Object.freeze({
    name: '毕业冲刺季',
    targetCredits: WIN_CREDITS,
    targetInfluence: 12,
    initialCoins: 420,
    initialEnergy: 72,
    initialStress: 30,
    startingCards: ['library-pass', 'energy-drink']
  })
])

export const ACTION_CARDS = Object.freeze([
  Object.freeze({
    id: 'library-pass',
    name: '图书馆通宵卡',
    description: '本回合追加绩点，但消耗精力；下一次投骰更容易抵达关键据点。',
    effects: { credits: 2, energy: -12, stress: 5 },
    activeEffects: [Object.freeze({ type: 'diceBoost', amount: 1, turns: 1, label: '通宵检索路线' })]
  }),
  Object.freeze({
    id: 'energy-drink',
    name: '运动补给包',
    description: '恢复精力并降低压力。',
    effects: { energy: 20, stress: -10 }
  }),
  Object.freeze({
    id: 'club-network',
    name: '社团人脉卡',
    description: '用社团资源换取校园影响力。',
    effects: { influence: 2, coins: -20, stress: 4 }
  })
])

export const CAMPUS_INVESTMENTS = Object.freeze([
  Object.freeze({
    id: 'library',
    name: '图书馆学习据点',
    cost: 120,
    costStep: 60,
    maxLevel: 3,
    influence: 2,
    credits: 1,
    description: '建设固定自习区，经过图书馆时额外获得影响力。'
  }),
  Object.freeze({
    id: 'innovation-hub',
    name: '创新创业据点',
    cost: 160,
    costStep: 80,
    maxLevel: 2,
    influence: 3,
    credits: 1,
    description: '扶持路演与竞赛团队，强化后期阶段目标。'
  }),
  Object.freeze({
    id: 'stadium',
    name: '操场补给据点',
    cost: 95,
    costStep: 45,
    maxLevel: 3,
    influence: 1,
    energy: 10,
    description: '设置训练补给点，减少长线经营的精力压力。'
  })
])

export const CAMPUS_EVENTS = Object.freeze([
  Object.freeze({
    id: 'lab-roadshow',
    title: '实验室路演',
    description: '导师给了一个展示机会，你可以选择稳扎稳打或快速拉赞助。',
    choices: Object.freeze([
      Object.freeze({ id: 'sponsor', label: '拉赞助', effects: { coins: 90, stress: 12, influence: 2 } }),
      Object.freeze({ id: 'polish', label: '打磨项目', effects: { coins: -30, credits: 2, energy: -10 } })
    ])
  }),
  Object.freeze({
    id: 'club-fair',
    title: '社团招新',
    description: '摊位人流很大，适合扩大影响力，也可能拖慢学习节奏。',
    choices: Object.freeze([
      Object.freeze({ id: 'host', label: '主持招新', effects: { influence: 3, stress: 8, energy: -8 } }),
      Object.freeze({ id: 'support', label: '后勤支援', effects: { coins: 45, influence: 1, energy: -4 } })
    ])
  }),
  Object.freeze({
    id: 'final-week',
    title: '期末周排期',
    description: '课程、竞赛和答辩撞在一起，需要决定优先级。',
    choices: Object.freeze([
      Object.freeze({ id: 'focus', label: '集中复习', effects: { credits: 3, stress: 14, energy: -14 } }),
      Object.freeze({ id: 'balance', label: '均衡安排', effects: { credits: 1, influence: 2, stress: -4, coins: -25 } })
    ])
  })
])

export const CAMPUS_BOARD = Object.freeze([
  Object.freeze({
    id: 'gate',
    name: '校门起点',
    type: 'start',
    description: '从湖工校门出发，开始阶段经营。'
  }),
  Object.freeze({
    id: 'south-lake-run',
    name: '南湖晨跑',
    type: 'grant',
    effects: Object.freeze({ coins: 35, influence: 1, stress: -3 }),
    description: '晨跑打卡带来状态和人气。'
  }),
  Object.freeze({
    id: 'library',
    name: '图书馆研修',
    type: 'study',
    siteId: 'library',
    effects: Object.freeze({ coins: -35, credits: 2, energy: -5 }),
    description: '刷题和查资料，稳步累积绩点。'
  }),
  Object.freeze({
    id: 'canteen',
    name: '西区食堂排队',
    type: 'fee',
    effects: Object.freeze({ coins: -12 }),
    description: '排队耽误时间，花费一顿补给。'
  }),
  Object.freeze({
    id: 'engineering',
    name: '工程楼实训',
    type: 'study',
    effects: Object.freeze({ coins: -28, credits: 1, influence: 1, energy: -6, stress: 3 }),
    description: '完成实训报告，提升专业存在感。'
  }),
  Object.freeze({
    id: 'club-roadshow',
    name: '社团路演',
    type: 'event',
    eventId: 'club-fair',
    description: '路演摊位触发选择事件。'
  }),
  Object.freeze({
    id: 'lab',
    name: '实验室耗材',
    type: 'fee',
    effects: Object.freeze({ coins: -48, credits: 1, stress: 6 }),
    description: '补买耗材，项目继续推进。'
  }),
  Object.freeze({
    id: 'cs-college',
    name: '学院项目验收',
    type: 'grant',
    effects: Object.freeze({ coins: 58, credits: 1, influence: 1 }),
    description: '项目验收通过，学院奖励到账。'
  }),
  Object.freeze({
    id: 'stadium',
    name: '操场加训',
    type: 'rest',
    siteId: 'stadium',
    effects: Object.freeze({ energy: 12, stress: -8, coins: -18 }),
    description: '运动恢复状态，也需要补给。'
  }),
  Object.freeze({
    id: 'dorm',
    name: '宿舍夜谈',
    type: 'card',
    cardId: 'club-network',
    effects: Object.freeze({ stress: -4, influence: 1 }),
    description: '和同学交流，获得一张行动卡。'
  }),
  Object.freeze({
    id: 'startup-base',
    name: '创业基地',
    type: 'event',
    siteId: 'innovation-hub',
    eventId: 'lab-roadshow',
    description: '创业基地触发项目事件。'
  }),
  Object.freeze({
    id: 'south-lake-night',
    name: '南湖夜读',
    type: 'study',
    effects: Object.freeze({ coins: -25, credits: 2, energy: -10, stress: 5 }),
    description: '夜读效率高，但精力消耗明显。'
  }),
  Object.freeze({
    id: 'scholarship',
    name: '奖学金公示',
    type: 'grant',
    effects: Object.freeze({ coins: 90, stress: -4 }),
    description: '阶段性成果被认可，资金补给到账。'
  }),
  Object.freeze({
    id: 'office',
    name: '教务处排期',
    type: 'event',
    eventId: 'final-week',
    description: '课程安排改变，需要做一次取舍。'
  }),
  Object.freeze({
    id: 'bus-stop',
    name: '校车站',
    type: 'card',
    cardId: 'energy-drink',
    effects: Object.freeze({ coins: 20, energy: 6 }),
    description: '赶上校车，顺手补充物资。'
  }),
  Object.freeze({
    id: 'defense',
    name: '毕设答辩',
    type: 'study',
    effects: Object.freeze({ coins: -45, credits: 3, influence: 2, energy: -12, stress: 10 }),
    description: '答辩顺利，但压力陡增。'
  })
])

const ACTION_CARD_MAP = new Map(ACTION_CARDS.map((card) => [card.id, card]))
const EVENT_MAP = new Map(CAMPUS_EVENTS.map((event) => [event.id, event]))
const INVESTMENT_MAP = new Map(CAMPUS_INVESTMENTS.map((site) => [site.id, site]))

const clamp = (value, min, max) => Math.max(min, Math.min(max, value))
const finiteOr = (value, fallback) => (Number.isFinite(Number(value)) ? Number(value) : fallback)
const positiveIntOr = (value, fallback) => {
  const next = Number(value)
  return Number.isInteger(next) && next >= 0 ? next : fallback
}

const stageAt = (stageIndex) => {
  const index = clamp(Number.isInteger(stageIndex) ? stageIndex : DEFAULT_STAGE_INDEX, 0, MONOPOLY_STAGES.length - 1)
  return { index, stage: MONOPOLY_STAGES[index] }
}

const cloneEffect = (effect) => ({ ...effect })
const cloneCard = (card) => ({ ...card })
const cloneChoice = (choice) => ({ ...choice, effects: { ...(choice.effects || {}) } })
const cloneEvent = (event) =>
  event
    ? {
        ...event,
        choices: Array.isArray(event.choices) ? event.choices.map(cloneChoice) : []
      }
    : null

const cloneInvestments = (investments = {}) =>
  Object.fromEntries(Object.entries(investments || {}).map(([id, item]) => [id, { ...item }]))

const trimLog = (log) => log.slice(0, MAX_LOG_ITEMS)

const addLog = (state, message) => ({
  ...state,
  log: trimLog([message, ...(Array.isArray(state.log) ? state.log : [])])
})

const cardFromId = (cardId) => {
  const card = ACTION_CARD_MAP.get(cardId)
  return card ? { id: card.id, name: card.name, description: card.description } : null
}

const describeEffects = (effects = {}) => {
  const parts = []
  const labels = [
    ['coins', '资金'],
    ['credits', '绩点'],
    ['influence', '影响力'],
    ['energy', '精力'],
    ['stress', '压力']
  ]
  for (const [key, label] of labels) {
    const value = Number(effects[key] || 0)
    if (value !== 0) parts.push(`${label}${value > 0 ? '+' : ''}${value}`)
  }
  return parts.join('，')
}

const clampResource = (value) => clamp(Math.round(value), RESOURCE_MIN, RESOURCE_MAX)

const applyResourceEffects = (state, effects = {}) => ({
  ...state,
  coins: Math.round(finiteOr(state.coins, 0) + finiteOr(effects.coins, 0)),
  credits: Math.max(0, Math.round(finiteOr(state.credits, 0) + finiteOr(effects.credits, 0))),
  influence: Math.max(0, Math.round(finiteOr(state.influence, 0) + finiteOr(effects.influence, 0))),
  energy: clampResource(finiteOr(state.energy, 0) + finiteOr(effects.energy, 0)),
  stress: clampResource(finiteOr(state.stress, 0) + finiteOr(effects.stress, 0))
})

const clampDice = (dice) => {
  const value = Number(dice)
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    throw new Error(`骰子点数必须是 1-6 的整数，当前为 ${dice}`)
  }
  return value
}

const normalizeState = (candidate) => {
  const raw = candidate && typeof candidate === 'object' ? candidate : {}
  const { index: stageIndex, stage } = stageAt(Number.isInteger(raw.stageIndex) ? raw.stageIndex : DEFAULT_STAGE_INDEX)
  const stageCards = Array.isArray(raw.cards)
    ? raw.cards.map(cloneCard)
    : stage.startingCards.map(cardFromId).filter(Boolean)
  const pendingEvent = cloneEvent(raw.pendingEvent)
  const status = raw.status || 'playing'

  return {
    position: clamp(positiveIntOr(raw.position, 0), 0, CAMPUS_BOARD.length - 1),
    coins: Math.round(finiteOr(raw.coins, stage.initialCoins)),
    credits: Math.max(0, Math.round(finiteOr(raw.credits, 0))),
    influence: Math.max(0, Math.round(finiteOr(raw.influence, 0))),
    energy: clampResource(finiteOr(raw.energy, stage.initialEnergy)),
    stress: clampResource(finiteOr(raw.stress, stage.initialStress)),
    stageIndex,
    stageName: stage.name,
    targetCredits: stage.targetCredits,
    targetInfluence: stage.targetInfluence,
    totalStages: MONOPOLY_STAGES.length,
    turn: positiveIntOr(raw.turn, 0),
    dice: positiveIntOr(raw.dice, 0),
    baseDice: positiveIntOr(raw.baseDice, 0),
    status,
    phase: raw.phase || (pendingEvent ? 'choice' : status === 'playing' ? 'roll' : 'result'),
    passedStart: Boolean(raw.passedStart),
    pendingEvent,
    eventHistory: Array.isArray(raw.eventHistory) ? raw.eventHistory.map((item) => ({ ...item })) : [],
    cards: stageCards,
    activeEffects: Array.isArray(raw.activeEffects) ? raw.activeEffects.map(cloneEffect) : [],
    investments: cloneInvestments(raw.investments),
    log: Array.isArray(raw.log)
      ? trimLog([...raw.log])
      : [`第 ${stageIndex + 1} 阶段：${stage.name}，先达成 ${stage.targetCredits} 绩点和 ${stage.targetInfluence} 影响力。`]
  }
}

const consumeDiceEffects = (state, dice) => {
  let boost = 0
  const activeEffects = []
  for (const effect of state.activeEffects) {
    if (effect.type === 'diceBoost') {
      boost += Number(effect.amount || 1)
      if (Number(effect.turns || 0) > 1) {
        activeEffects.push({ ...effect, turns: effect.turns - 1 })
      }
      continue
    }
    activeEffects.push({ ...effect })
  }
  return {
    dice: clamp(dice + boost, 1, 6),
    activeEffects,
    boost
  }
}

const applySiteVisitBonus = (state, tile) => {
  const siteId = tile.siteId || tile.id
  const investment = state.investments[siteId]
  if (!investment?.level) return state

  const bonus = {
    influence: investment.level,
    energy: siteId === 'stadium' ? investment.level * 3 : 0
  }
  const next = applyResourceEffects(state, bonus)
  return addLog(next, `${investment.name}提供据点加成：${describeEffects(bonus)}`)
}

const applyTile = (state, tile) => {
  let next = applyResourceEffects(state, tile.effects || {})
  next = applySiteVisitBonus(next, tile)

  const effectText = describeEffects(tile.effects)
  next = addLog(next, `${tile.name}: ${tile.description}${effectText ? `（${effectText}）` : ''}`)

  if (tile.cardId) {
    const card = cardFromId(tile.cardId)
    if (card) {
      next = {
        ...next,
        cards: [...next.cards, card]
      }
      next = addLog(next, `获得行动卡：${card.name}`)
    }
  }

  if (tile.eventId) {
    const event = cloneEvent(EVENT_MAP.get(tile.eventId))
    if (!event) {
      return addLog(next, `${tile.name}事件配置缺失，本回合继续前进。`)
    }
    next = {
      ...next,
      pendingEvent: event,
      phase: 'choice'
    }
    next = addLog(next, `触发事件：${event.title}`)
  } else {
    next = {
      ...next,
      phase: 'roll'
    }
  }

  return next
}

export const createInitialState = (options = {}) => normalizeState(options)

export const resolveStageProgress = (currentState) => {
  let state = normalizeState(currentState)
  if (state.status !== 'playing') return state
  if (state.pendingEvent && state.phase === 'choice') return state

  const failedReasons = []
  if (state.coins < 0) failedReasons.push('资金')
  if (state.energy <= 0) failedReasons.push('精力')
  if (state.stress >= RESOURCE_MAX) failedReasons.push('压力')

  if (failedReasons.length > 0) {
    return addLog(
      {
        ...state,
        status: 'lost',
        phase: 'result',
        pendingEvent: null
      },
      `${failedReasons.join('、')}失衡，校园经营挑战失败。`
    )
  }

  if (state.credits < state.targetCredits || state.influence < state.targetInfluence) {
    return state
  }

  if (state.stageIndex >= MONOPOLY_STAGES.length - 1) {
    return addLog(
      {
        ...state,
        status: 'won',
        phase: 'result',
        pendingEvent: null
      },
      '三阶段目标全部完成，湖工大富翁挑战通关。'
    )
  }

  const { index: nextStageIndex, stage: nextStage } = stageAt(state.stageIndex + 1)
  return addLog(
    {
      ...state,
      stageIndex: nextStageIndex,
      stageName: nextStage.name,
      targetCredits: nextStage.targetCredits,
      targetInfluence: nextStage.targetInfluence,
      energy: Math.max(state.energy, nextStage.initialEnergy),
      stress: Math.min(state.stress, nextStage.initialStress),
      phase: 'roll',
      pendingEvent: null
    },
    `进入第 ${nextStageIndex + 1} 阶段：${nextStage.name}`
  )
}

export const applyEventChoice = (currentState, choiceId) => {
  const state = normalizeState(currentState)
  const event = state.pendingEvent
  if (!event) {
    return addLog(state, '当前没有待处理事件。')
  }

  const choice = event.choices.find((item) => item.id === choiceId)
  if (!choice) {
    return addLog(state, '无法处理该事件选择。')
  }

  const next = applyResourceEffects(
    {
      ...state,
      pendingEvent: null,
      phase: 'roll',
      eventHistory: [...state.eventHistory, { eventId: event.id, choiceId: choice.id }]
    },
    choice.effects
  )

  return resolveStageProgress(
    addLog(next, `${event.title || '校园事件'}选择「${choice.label}」：${describeEffects(choice.effects)}`)
  )
}

export const applyActionCard = (currentState, cardId) => {
  const state = normalizeState(currentState)
  if (state.pendingEvent && state.phase === 'choice') {
    return addLog(state, '请先处理当前校园事件，再使用行动卡。')
  }

  const cardIndex = state.cards.findIndex((card) => card.id === cardId)
  if (cardIndex < 0) {
    return addLog(state, '没有找到这张行动卡。')
  }

  const ownedCard = state.cards[cardIndex]
  const card = ACTION_CARD_MAP.get(cardId) || ownedCard
  const remainingCards = state.cards.filter((_, index) => index !== cardIndex)
  const next = applyResourceEffects(
    {
      ...state,
      cards: remainingCards,
      activeEffects: [
        ...state.activeEffects,
        ...((card.activeEffects || []).map(cloneEffect))
      ]
    },
    card.effects
  )

  return resolveStageProgress(addLog(next, `使用行动卡：${card.name}（${describeEffects(card.effects)}）`))
}

export const investInCampusSite = (currentState, siteId) => {
  const state = normalizeState(currentState)
  if (state.pendingEvent && state.phase === 'choice') {
    return addLog(state, '请先处理当前校园事件，再进行据点投资。')
  }

  const site = INVESTMENT_MAP.get(siteId)
  if (!site) return addLog(state, '无法投资未知校园据点。')

  const currentLevel = state.investments[site.id]?.level || 0
  if (currentLevel >= site.maxLevel) {
    return addLog(state, `${site.name}已达到最高等级，无法继续投资。`)
  }

  const cost = site.cost + currentLevel * site.costStep
  if (state.coins < cost) {
    return addLog(state, `${site.name}需要 ${cost} 资金，资金不足，无法投资。`)
  }

  const nextLevel = currentLevel + 1
  const effects = {
    coins: -cost,
    influence: site.influence,
    credits: site.credits || 0,
    energy: site.energy || 0
  }
  const next = applyResourceEffects(
    {
      ...state,
      investments: {
        ...state.investments,
        [site.id]: {
          id: site.id,
          name: site.name,
          level: nextLevel,
          totalSpent: (state.investments[site.id]?.totalSpent || 0) + cost
        }
      },
      activeEffects: [
        ...state.activeEffects,
        { type: 'siteBonus', siteId: site.id, level: nextLevel, label: site.name }
      ]
    },
    effects
  )

  return resolveStageProgress(addLog(next, `投资${site.name} Lv.${nextLevel}：${describeEffects(effects)}`))
}

export const playTurn = (currentState, diceInput) => {
  const state = normalizeState(currentState)
  if (state.status !== 'playing') return state
  if (state.phase === 'choice' && state.pendingEvent) {
    return addLog(state, '请先处理当前校园事件，再继续投骰。')
  }

  const baseDice = clampDice(typeof diceInput === 'function' ? diceInput() : diceInput)
  const diceEffect = consumeDiceEffects(state, baseDice)
  const rawPosition = state.position + diceEffect.dice
  const passedStart = rawPosition >= CAMPUS_BOARD.length
  const position = rawPosition % CAMPUS_BOARD.length
  const tile = CAMPUS_BOARD[position]

  let next = applyResourceEffects(
    {
      ...state,
      position,
      dice: diceEffect.dice,
      baseDice,
      turn: state.turn + 1,
      passedStart,
      activeEffects: diceEffect.activeEffects,
      phase: 'roll'
    },
    { energy: -5, stress: 5 }
  )

  if (passedStart) {
    next = applyResourceEffects(next, { coins: PASS_START_BONUS, stress: -3 })
    next = addLog(next, `经过校门，获得阶段补给：资金+${PASS_START_BONUS}，压力-3`)
  }

  if (diceEffect.boost > 0) {
    next = addLog(next, `行动卡生效：骰子+${diceEffect.boost}`)
  }

  next = applyTile(next, tile)
  return resolveStageProgress(next)
}

export const restartGame = (options = {}) => createInitialState(options)

export const createDeterministicDice = (seed = Date.now()) => {
  let value = Math.abs(Math.floor(Number(seed) || 1)) % 2147483647
  if (value === 0) value = 1
  return () => {
    value = (value * 48271) % 2147483647
    return (value % 6) + 1
  }
}
