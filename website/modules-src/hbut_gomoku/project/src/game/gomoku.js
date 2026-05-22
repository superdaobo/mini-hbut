export const BOARD_SIZE = 15

export const PLAYERS = Object.freeze({
  black: 'black',
  white: 'white'
})

const PLAYER_NAMES = Object.freeze({
  [PLAYERS.black]: '黑子',
  [PLAYERS.white]: '白子'
})

const DIRECTIONS = Object.freeze([
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1]
])

export const getPlayerName = (player) => PLAYER_NAMES[player] || ''

export const createBoard = () =>
  Array.from({ length: BOARD_SIZE }, () => Array.from({ length: BOARD_SIZE }, () => null))

export const createInitialState = (options = {}) => ({
  board: createBoard(),
  currentPlayer: PLAYERS.black,
  status: 'playing',
  winner: null,
  winLine: [],
  moves: [],
  lastMove: null,
  lastError: '',
  mode: options.mode || 'local_two_player',
  sessionId: options.sessionId || '',
  players: options.players || null,
  localPlayer: options.localPlayer || null
})

export const getCell = (board, row, col) => board?.[row]?.[col] ?? null

const isInsideBoard = (row, col) =>
  Number.isInteger(row) &&
  Number.isInteger(col) &&
  row >= 0 &&
  row < BOARD_SIZE &&
  col >= 0 &&
  col < BOARD_SIZE

const cloneBoard = (board) => board.map((row) => row.slice())

const nextPlayer = (player) => (player === PLAYERS.black ? PLAYERS.white : PLAYERS.black)

const scanDirection = (board, row, col, player, rowStep, colStep) => {
  const cells = [[row, col]]

  for (const sign of [-1, 1]) {
    let nextRow = row + rowStep * sign
    let nextCol = col + colStep * sign
    while (isInsideBoard(nextRow, nextCol) && getCell(board, nextRow, nextCol) === player) {
      cells.push([nextRow, nextCol])
      nextRow += rowStep * sign
      nextCol += colStep * sign
    }
  }

  return cells.sort(([leftRow, leftCol], [rightRow, rightCol]) =>
    leftRow === rightRow ? leftCol - rightCol : leftRow - rightRow
  )
}

const resolveWinLine = (board, row, col, player) => {
  for (const [rowStep, colStep] of DIRECTIONS) {
    const line = scanDirection(board, row, col, player, rowStep, colStep)
    if (line.length >= 5) return line
  }
  return []
}

export const placeStone = (state, row, col, options = {}) => {
  if (!state || state.status !== 'playing') {
    return {
      ...state,
      lastError: '对局已结束，请重新开始'
    }
  }

  if (options.player && options.player !== state.currentPlayer) {
    return {
      ...state,
      lastError: '未轮到该玩家'
    }
  }

  // 联机模式复用这里的玩家与手数校验，避免同步消息绕过核心规则。
  if (Number.isInteger(options.moveIndex) && options.moveIndex !== state.moves.length) {
    return {
      ...state,
      lastError: options.moveIndex < state.moves.length ? '落子顺序已过期' : '落子顺序超前'
    }
  }

  if (!isInsideBoard(row, col)) {
    return {
      ...state,
      lastError: '落子位置超出棋盘'
    }
  }

  if (getCell(state.board, row, col)) {
    return {
      ...state,
      lastError: '该位置已有棋子'
    }
  }

  const player = state.currentPlayer
  const board = cloneBoard(state.board)
  board[row][col] = player

  const move = { row, col, player }
  const moves = [...state.moves, move]
  const winLine = resolveWinLine(board, row, col, player)

  if (winLine.length >= 5) {
    return {
      ...state,
      board,
      status: 'won',
      winner: player,
      winLine,
      moves,
      lastMove: move,
      lastError: ''
    }
  }

  if (moves.length >= BOARD_SIZE * BOARD_SIZE) {
    return {
      ...state,
      board,
      status: 'draw',
      winner: null,
      winLine: [],
      moves,
      lastMove: move,
      lastError: ''
    }
  }

  return {
    ...state,
    board,
    currentPlayer: nextPlayer(player),
    moves,
    lastMove: move,
    lastError: ''
  }
}

export const restartGame = (state = {}) =>
  createInitialState({
    mode: state.mode,
    sessionId: state.sessionId,
    players: state.players,
    localPlayer: state.localPlayer
  })
