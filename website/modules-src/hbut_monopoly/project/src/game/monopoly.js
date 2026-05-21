export const PASS_START_BONUS = 80
export const WIN_CREDITS = 12
export const INITIAL_COINS = 320

export const CAMPUS_BOARD = Object.freeze([
  Object.freeze({
    id: 'gate',
    name: '校门起点',
    type: 'start',
    description: '从湖工校门出发，开启一轮校园经营挑战。'
  }),
  Object.freeze({
    id: 'south-lake-run',
    name: '南湖晨跑',
    type: 'grant',
    coins: 40,
    credits: 1,
    description: '晨跑打卡获得学院奖励。'
  }),
  Object.freeze({
    id: 'library',
    name: '图书馆研修',
    type: 'study',
    coins: -40,
    credits: 2,
    description: '花时间刷题，绩点稳步上涨。'
  }),
  Object.freeze({
    id: 'canteen',
    name: '西区食堂',
    type: 'fee',
    coins: -35,
    credits: 0,
    description: '请小队吃饭，钱包变轻。'
  }),
  Object.freeze({
    id: 'engineering',
    name: '工程楼实训',
    type: 'study',
    coins: -30,
    credits: 1,
    description: '完成实训报告，积累专业绩点。'
  }),
  Object.freeze({
    id: 'club-roadshow',
    name: '社团路演',
    type: 'event',
    coins: 50,
    credits: 0,
    description: '展示项目拉到赞助。'
  }),
  Object.freeze({
    id: 'lab',
    name: '实验室耗材',
    type: 'fee',
    coins: -55,
    credits: 0,
    description: '补买实验耗材。'
  }),
  Object.freeze({
    id: 'cs-college',
    name: '计算机学院项目',
    type: 'grant',
    coins: 60,
    credits: 1,
    description: '项目验收通过，奖金到账。'
  }),
  Object.freeze({
    id: 'stadium',
    name: '操场加训',
    type: 'study',
    coins: -20,
    credits: 1,
    description: '体测训练提升状态。'
  }),
  Object.freeze({
    id: 'dorm',
    name: '宿舍维修',
    type: 'fee',
    coins: -45,
    credits: 0,
    description: '临时维修支出。'
  }),
  Object.freeze({
    id: 'startup-base',
    name: '创业基地',
    type: 'event',
    coins: -20,
    credits: 2,
    description: '熬夜路演，换来创新学分。'
  }),
  Object.freeze({
    id: 'south-lake-night',
    name: '南湖夜读',
    type: 'study',
    coins: -25,
    credits: 2,
    description: '夜读效率很高。'
  }),
  Object.freeze({
    id: 'scholarship',
    name: '奖学金公示',
    type: 'grant',
    coins: 90,
    credits: 0,
    description: '奖学金到账。'
  }),
  Object.freeze({
    id: 'office',
    name: '教务处补卡',
    type: 'fee',
    coins: -35,
    credits: 0,
    description: '补办材料产生费用。'
  }),
  Object.freeze({
    id: 'bus-stop',
    name: '校车站',
    type: 'event',
    coins: 25,
    credits: 1,
    description: '赶上校车，省钱又准点。'
  }),
  Object.freeze({
    id: 'defense',
    name: '毕设答辩',
    type: 'study',
    coins: -50,
    credits: 3,
    description: '答辩顺利，离胜利更近。'
  })
])

const clampDice = (dice) => {
  const value = Number(dice)
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    throw new Error(`骰子点数必须是 1-6 的整数，当前为 ${dice}`)
  }
  return value
}

const applyTile = (state, tile) => {
  const coins = state.coins + Number(tile.coins || 0)
  const credits = state.credits + Number(tile.credits || 0)
  const coinText = tile.coins ? `，金币${tile.coins > 0 ? '+' : ''}${tile.coins}` : ''
  const creditText = tile.credits ? `，绩点+${tile.credits}` : ''

  return {
    ...state,
    coins,
    credits,
    log: [`${tile.name}: ${tile.description}${coinText}${creditText}`, ...state.log].slice(0, 5)
  }
}

const resolveStatus = (state) => {
  if (state.credits >= WIN_CREDITS) return 'won'
  if (state.coins <= 0) return 'lost'
  return 'playing'
}

export const createInitialState = () => ({
  position: 0,
  coins: INITIAL_COINS,
  credits: 0,
  turn: 0,
  dice: 0,
  status: 'playing',
  passedStart: false,
  log: ['从校门出发，攒金币、修绩点，先拿到 12 绩点即获胜。']
})

export const playTurn = (currentState, diceInput) => {
  const state = currentState && typeof currentState === 'object' ? currentState : createInitialState()
  if (state.status !== 'playing') return state

  const dice = clampDice(diceInput)
  const rawPosition = state.position + dice
  const passedStart = rawPosition >= CAMPUS_BOARD.length
  const position = rawPosition % CAMPUS_BOARD.length
  const tile = CAMPUS_BOARD[position]
  const withMove = {
    ...state,
    position,
    dice,
    turn: state.turn + 1,
    passedStart,
    coins: state.coins + (passedStart ? PASS_START_BONUS : 0),
    log: passedStart
      ? [`经过校门，获得奖学金补给 +${PASS_START_BONUS} 金币`, ...state.log].slice(0, 5)
      : state.log
  }
  const settled = applyTile(withMove, tile)

  return {
    ...settled,
    status: resolveStatus(settled)
  }
}

export const restartGame = () => createInitialState()

export const createDeterministicDice = (seed = Date.now()) => {
  let value = Math.abs(Math.floor(Number(seed) || 1)) % 2147483647
  if (value === 0) value = 1
  return () => {
    value = (value * 48271) % 2147483647
    return (value % 6) + 1
  }
}
