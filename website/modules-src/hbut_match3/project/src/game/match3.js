/** 校园主题棋子类型（色块 + 文案） */
export const TILE_TYPES = Object.freeze([
  Object.freeze({ id: 'canteen', label: '食堂', color: '#f97316' }),
  Object.freeze({ id: 'library', label: '图书馆', color: '#2563eb' }),
  Object.freeze({ id: 'lake', label: '南湖', color: '#0ea5e9' }),
  Object.freeze({ id: 'dorm', label: '宿舍', color: '#8b5cf6' }),
  Object.freeze({ id: 'lab', label: '实验楼', color: '#10b981' }),
  Object.freeze({ id: 'gate', label: '校门', color: '#eab308' })
])

export const BOARD_SIZE = 7
export const MOVE_LIMIT = 30
export const BASE_MATCH_SCORE = 10

const TYPE_IDS = TILE_TYPES.map((item) => item.id)

const clampIndex = (value, size) => Math.max(0, Math.min(size - 1, Math.trunc(value)))

export function createSeededRandom(seed = 1) {
  let value = Math.abs(Math.floor(Number(seed) || 1)) % 2147483647
  if (value === 0) value = 1
  return () => {
    value = (value * 48271) % 2147483647
    return value / 2147483647
  }
}

export function randomTileId(random = Math.random) {
  const index = Math.floor(random() * TYPE_IDS.length) % TYPE_IDS.length
  return TYPE_IDS[index]
}

export function createEmptyBoard(size = BOARD_SIZE) {
  return Array.from({ length: size }, () => Array.from({ length: size }, () => null))
}

export function cloneBoard(board) {
  return board.map((row) => row.slice())
}

/**
 * 查找所有长度 >= 3 的横/竖匹配单元坐标。
 * @returns {Array<{row:number,col:number}>}
 */
export function findMatches(board) {
  const size = board.length
  const matched = new Set()
  const key = (r, c) => `${r},${c}`

  for (let r = 0; r < size; r += 1) {
    let runStart = 0
    for (let c = 1; c <= size; c += 1) {
      const prev = board[r][c - 1]
      const cur = c < size ? board[r][c] : null
      if (c < size && cur && prev && cur === prev) continue
      const runLen = c - runStart
      if (prev && runLen >= 3) {
        for (let i = runStart; i < c; i += 1) matched.add(key(r, i))
      }
      runStart = c
    }
  }

  for (let c = 0; c < size; c += 1) {
    let runStart = 0
    for (let r = 1; r <= size; r += 1) {
      const prev = board[r - 1][c]
      const cur = r < size ? board[r][c] : null
      if (r < size && cur && prev && cur === prev) continue
      const runLen = r - runStart
      if (prev && runLen >= 3) {
        for (let i = runStart; i < r; i += 1) matched.add(key(i, c))
      }
      runStart = r
    }
  }

  return [...matched].map((item) => {
    const [row, col] = item.split(',').map(Number)
    return { row, col }
  })
}

export function clearMatches(board, matches) {
  const next = cloneBoard(board)
  for (const cell of matches) {
    next[cell.row][cell.col] = null
  }
  return next
}

/** 重力下落：空位向上冒泡填充 */
export function applyGravity(board) {
  const size = board.length
  const next = createEmptyBoard(size)
  for (let c = 0; c < size; c += 1) {
    const stack = []
    for (let r = size - 1; r >= 0; r -= 1) {
      if (board[r][c]) stack.push(board[r][c])
    }
    let write = size - 1
    for (const tile of stack) {
      next[write][c] = tile
      write -= 1
    }
  }
  return next
}

export function fillBoard(board, random = Math.random) {
  const size = board.length
  const next = cloneBoard(board)
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      if (!next[r][c]) next[r][c] = randomTileId(random)
    }
  }
  return next
}

export function areAdjacent(a, b) {
  if (!a || !b) return false
  const dr = Math.abs(a.row - b.row)
  const dc = Math.abs(a.col - b.col)
  return (dr === 1 && dc === 0) || (dr === 0 && dc === 1)
}

export function swapCells(board, a, b) {
  const next = cloneBoard(board)
  const tmp = next[a.row][a.col]
  next[a.row][a.col] = next[b.row][b.col]
  next[b.row][b.col] = tmp
  return next
}

/**
 * 解析连锁：匹配→清除→重力→填充，直到无匹配。
 * @returns {{ board, scoreGained, chainCount, cleared }}
 */
export function resolveBoard(board, random = Math.random) {
  let current = cloneBoard(board)
  let scoreGained = 0
  let chainCount = 0
  let cleared = 0
  // safety cap against pathological boards
  for (let guard = 0; guard < 40; guard += 1) {
    const matches = findMatches(current)
    if (!matches.length) break
    chainCount += 1
    cleared += matches.length
    const chainMultiplier = chainCount
    scoreGained += matches.length * BASE_MATCH_SCORE * chainMultiplier
    current = fillBoard(applyGravity(clearMatches(current, matches)), random)
  }
  return { board: current, scoreGained, chainCount, cleared }
}

export function createStableBoard(size = BOARD_SIZE, random = Math.random) {
  let board = fillBoard(createEmptyBoard(size), random)
  for (let i = 0; i < 30; i += 1) {
    const matches = findMatches(board)
    if (!matches.length) return board
    board = fillBoard(applyGravity(clearMatches(board, matches)), random)
  }
  return board
}

/**
 * 尝试交换：必须相邻且交换后产生至少一组匹配，否则回弹。
 */
export function trySwap(board, a, b, random = Math.random) {
  if (!areAdjacent(a, b)) {
    return { ok: false, reason: 'not_adjacent', board: cloneBoard(board), scoreGained: 0, chainCount: 0 }
  }
  const swapped = swapCells(board, a, b)
  if (!findMatches(swapped).length) {
    return { ok: false, reason: 'no_match', board: cloneBoard(board), scoreGained: 0, chainCount: 0 }
  }
  const resolved = resolveBoard(swapped, random)
  return {
    ok: true,
    reason: 'matched',
    board: resolved.board,
    scoreGained: resolved.scoreGained,
    chainCount: resolved.chainCount,
    cleared: resolved.cleared
  }
}

export function createInitialMatch3State(options = {}) {
  const size = Math.trunc(options.size || BOARD_SIZE)
  const seed = Number.isFinite(options.seed) ? options.seed : Date.now() % 100000
  const random = createSeededRandom(seed)
  return {
    status: 'playing',
    size,
    board: createStableBoard(size, random),
    score: 0,
    movesLeft: Math.trunc(options.movesLeft || MOVE_LIMIT),
    moveLimit: Math.trunc(options.movesLeft || MOVE_LIMIT),
    selected: null,
    seed,
    chainPeak: 0,
    /** UI 反馈：select | deselect | invalid | matched */
    feedback: null,
    log: ['限步 30：点选或滑动交换相邻格，三连消除。']
  }
}

export function restartMatch3Game(options = {}) {
  return createInitialMatch3State(options)
}

function addLog(state, message) {
  return { ...state, log: [message, ...(state.log || [])].slice(0, 6) }
}

/**
 * 点选/滑动共用：首次选中；同格取消；相邻合法交换；非法则反馈并改选目标格。
 */
export function selectCell(state, row, col) {
  if (!state || state.status !== 'playing') return state
  const r = clampIndex(row, state.size)
  const c = clampIndex(col, state.size)
  const selected = state.selected
  if (!selected) {
    return {
      ...state,
      selected: { row: r, col: c },
      feedback: { type: 'select', at: { row: r, col: c }, token: Date.now() }
    }
  }
  if (selected.row === r && selected.col === c) {
    return {
      ...state,
      selected: null,
      feedback: { type: 'deselect', at: { row: r, col: c }, token: Date.now() }
    }
  }
  const random = createSeededRandom(state.seed + state.movesLeft * 17 + r * 31 + c)
  const result = trySwap(state.board, selected, { row: r, col: c }, random)
  if (!result.ok) {
    const message =
      result.reason === 'not_adjacent' ? '只能交换相邻格子。' : '这样交换不会形成三连。'
    return addLog(
      {
        ...state,
        selected: { row: r, col: c },
        feedback: {
          type: 'invalid',
          reason: result.reason,
          from: { ...selected },
          at: { row: r, col: c },
          token: Date.now()
        }
      },
      message
    )
  }
  const movesLeft = state.movesLeft - 1
  let next = {
    ...state,
    board: result.board,
    score: state.score + result.scoreGained,
    movesLeft,
    selected: null,
    chainPeak: Math.max(state.chainPeak, result.chainCount || 0),
    seed: state.seed + 1,
    feedback: {
      type: 'matched',
      scoreGained: result.scoreGained,
      chainCount: result.chainCount || 0,
      from: { ...selected },
      at: { row: r, col: c },
      token: Date.now()
    }
  }
  next = addLog(next, `消除 +${result.scoreGained}（连锁 x${result.chainCount}）`)
  if (movesLeft <= 0) {
    next = { ...next, status: 'lost' }
    next = addLog(next, `步数用尽，最终得分 ${next.score}。`)
  }
  return next
}

/**
 * 从起点格向主方向滑动一格并尝试交换（供 pointer 手势调用）。
 * @returns 新 state；方向无效时返回原 state
 */
export function swipeFromCell(state, row, col, direction) {
  if (!state || state.status !== 'playing') return state
  const r = clampIndex(row, state.size)
  const c = clampIndex(col, state.size)
  let tr = r
  let tc = c
  switch (direction) {
    case 'up':
      tr -= 1
      break
    case 'down':
      tr += 1
      break
    case 'left':
      tc -= 1
      break
    case 'right':
      tc += 1
      break
    default:
      return state
  }
  if (tr < 0 || tr >= state.size || tc < 0 || tc >= state.size) {
    return {
      ...state,
      selected: { row: r, col: c },
      feedback: { type: 'invalid', reason: 'out_of_bounds', at: { row: r, col: c }, token: Date.now() }
    }
  }
  const primed = {
    ...state,
    selected: { row: r, col: c },
    feedback: null
  }
  return selectCell(primed, tr, tc)
}
