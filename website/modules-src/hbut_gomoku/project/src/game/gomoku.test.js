import { describe, expect, it } from 'vitest'
import {
  BOARD_SIZE,
  PLAYERS,
  createInitialState,
  getCell,
  placeStone,
  restartGame
} from './gomoku.js'

const playLine = (state, stones) =>
  stones.reduce((current, [row, col]) => placeStone(current, row, col), state)

describe('湖工五子棋规则', () => {
  it('初始化 15 路空棋盘，并由黑子先手', () => {
    const state = createInitialState()

    expect(BOARD_SIZE).toBe(15)
    expect(state.board).toHaveLength(BOARD_SIZE)
    expect(state.board.every((row) => row.length === BOARD_SIZE)).toBe(true)
    expect(state.board.flat().every((cell) => cell === null)).toBe(true)
    expect(state.currentPlayer).toBe(PLAYERS.black)
    expect(state.status).toBe('playing')
    expect(state.moves).toEqual([])
  })

  it('合法落子后记录棋子、切换回合并拒绝占用与越界', () => {
    const first = placeStone(createInitialState(), 7, 7)

    expect(getCell(first.board, 7, 7)).toBe(PLAYERS.black)
    expect(first.currentPlayer).toBe(PLAYERS.white)
    expect(first.moves).toEqual([{ row: 7, col: 7, player: PLAYERS.black }])

    const occupied = placeStone(first, 7, 7)
    expect(occupied).toMatchObject({
      currentPlayer: PLAYERS.white,
      lastError: '该位置已有棋子'
    })
    expect(occupied.moves).toHaveLength(1)

    const outOfBounds = placeStone(first, -1, 0)
    expect(outOfBounds).toMatchObject({
      currentPlayer: PLAYERS.white,
      lastError: '落子位置超出棋盘'
    })
    expect(outOfBounds.moves).toHaveLength(1)
  })

  it('能判断横向、纵向、斜向和反斜向五连胜', () => {
    const blackHorizontal = playLine(createInitialState(), [
      [7, 3], [0, 0],
      [7, 4], [0, 1],
      [7, 5], [0, 2],
      [7, 6], [0, 3],
      [7, 7]
    ])
    expect(blackHorizontal.status).toBe('won')
    expect(blackHorizontal.winner).toBe(PLAYERS.black)
    expect(blackHorizontal.winLine).toEqual([
      [7, 3], [7, 4], [7, 5], [7, 6], [7, 7]
    ])

    const blackVertical = playLine(createInitialState(), [
      [2, 9], [0, 0],
      [3, 9], [0, 1],
      [4, 9], [0, 2],
      [5, 9], [0, 3],
      [6, 9]
    ])
    expect(blackVertical.status).toBe('won')
    expect(blackVertical.winLine).toEqual([
      [2, 9], [3, 9], [4, 9], [5, 9], [6, 9]
    ])

    const blackDiagonal = playLine(createInitialState(), [
      [3, 3], [0, 0],
      [4, 4], [0, 1],
      [5, 5], [0, 2],
      [6, 6], [0, 3],
      [7, 7]
    ])
    expect(blackDiagonal.status).toBe('won')
    expect(blackDiagonal.winLine).toEqual([
      [3, 3], [4, 4], [5, 5], [6, 6], [7, 7]
    ])

    const blackAntiDiagonal = playLine(createInitialState(), [
      [3, 9], [0, 0],
      [4, 8], [0, 1],
      [5, 7], [0, 2],
      [6, 6], [0, 3],
      [7, 5]
    ])
    expect(blackAntiDiagonal.status).toBe('won')
    expect(blackAntiDiagonal.winLine).toEqual([
      [3, 9], [4, 8], [5, 7], [6, 6], [7, 5]
    ])
  })

  it('对局结束后拒绝继续落子，并可重新开始', () => {
    const won = playLine(createInitialState(), [
      [7, 3], [0, 0],
      [7, 4], [0, 1],
      [7, 5], [0, 2],
      [7, 6], [0, 3],
      [7, 7]
    ])
    const ignored = placeStone(won, 8, 8)

    expect(ignored.moves).toHaveLength(9)
    expect(ignored.lastError).toBe('对局已结束，请重新开始')

    const restarted = restartGame(won)
    expect(restarted.status).toBe('playing')
    expect(restarted.winner).toBeNull()
    expect(restarted.currentPlayer).toBe(PLAYERS.black)
    expect(restarted.board.flat().every((cell) => cell === null)).toBe(true)
  })

  it('保留房间元信息并校验显式落子方与手数顺序', () => {
    const state = createInitialState({
      mode: 'online_room',
      sessionId: 'room-2026',
      players: {
        [PLAYERS.black]: 'host',
        [PLAYERS.white]: 'guest'
      },
      localPlayer: PLAYERS.black
    })

    expect(state).toMatchObject({
      mode: 'online_room',
      sessionId: 'room-2026',
      players: {
        [PLAYERS.black]: 'host',
        [PLAYERS.white]: 'guest'
      },
      localPlayer: PLAYERS.black
    })

    const wrongPlayer = placeStone(state, 7, 7, {
      player: PLAYERS.white,
      moveIndex: 0
    })
    expect(wrongPlayer.lastError).toBe('未轮到该玩家')
    expect(wrongPlayer.moves).toHaveLength(0)

    const first = placeStone(state, 7, 7, {
      player: PLAYERS.black,
      moveIndex: 0
    })
    expect(first.moves).toHaveLength(1)

    const stale = placeStone(first, 7, 8, {
      player: PLAYERS.white,
      moveIndex: 0
    })
    expect(stale.lastError).toBe('落子顺序已过期')
    expect(stale.moves).toHaveLength(1)

    const second = placeStone(first, 7, 8, {
      player: PLAYERS.white,
      moveIndex: 1
    })
    expect(second.moves).toHaveLength(2)
    expect(second.currentPlayer).toBe(PLAYERS.black)

    const restarted = restartGame(second)
    expect(restarted).toMatchObject({
      mode: 'online_room',
      sessionId: 'room-2026',
      players: {
        [PLAYERS.black]: 'host',
        [PLAYERS.white]: 'guest'
      },
      localPlayer: PLAYERS.black
    })
    expect(restarted.moves).toEqual([])
  })

  it('长连胜利时高亮完整连续棋线并包含最后一手', () => {
    const state = createInitialState()
    for (let col = 3; col <= 7; col += 1) {
      state.board[7][col] = PLAYERS.black
      state.moves.push({ row: 7, col, player: PLAYERS.black })
    }
    state.currentPlayer = PLAYERS.black

    const won = placeStone(state, 7, 8)

    expect(won.status).toBe('won')
    expect(won.winLine).toEqual([
      [7, 3], [7, 4], [7, 5], [7, 6], [7, 7], [7, 8]
    ])
  })

  it('棋盘下满且没有五连时判定平局', () => {
    let state = createInitialState()
    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const isLastCell = row === BOARD_SIZE - 1 && col === BOARD_SIZE - 1
        const player = isLastCell
          ? null
          : (Math.floor(col / 2) + row) % 2 === 0
            ? PLAYERS.black
            : PLAYERS.white
        state.board[row][col] = player
        if (player) {
          state.moves.push({ row, col, player })
        }
      }
    }
    state.currentPlayer = PLAYERS.white

    const drawn = placeStone(state, BOARD_SIZE - 1, BOARD_SIZE - 1)

    expect(drawn.status).toBe('draw')
    expect(drawn.winner).toBeNull()
    expect(drawn.moves).toHaveLength(BOARD_SIZE * BOARD_SIZE)
  })
})
