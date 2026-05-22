import './style.css'
import {
  BOARD_SIZE,
  PLAYERS,
  createInitialState,
  getPlayerName,
  placeStone,
  restartGame
} from './game/gomoku.js'

const MODULE_ID = 'hbut_gomoku'
let state = createInitialState()

const app = document.getElementById('app')

function notifyHostHeight() {
  if (typeof window === 'undefined' || window.parent === window) return
  requestAnimationFrame(() => {
    const height = Math.max(
      document.documentElement.scrollHeight,
      document.documentElement.offsetHeight,
      document.body.scrollHeight,
      document.body.offsetHeight,
      window.visualViewport?.height || 0
    )
    window.parent.postMessage(
      {
        type: 'mini-hbut:module-size',
        moduleId: MODULE_ID,
        module_id: MODULE_ID,
        height
      },
      '*'
    )
  })
}

function syncViewport() {
  const viewportHeight =
    window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight
  document.documentElement.style.setProperty('--module-vh', `${viewportHeight * 0.01}px`)
  notifyHostHeight()
}

function cellKey(row, col) {
  return `${row}:${col}`
}

function buildWinLineSet() {
  return new Set((state.winLine || []).map(([row, col]) => cellKey(row, col)))
}

function statusTitle() {
  if (state.status === 'won') return `${getPlayerName(state.winner)}五连成功`
  if (state.status === 'draw') return '棋盘已满，平局'
  return `${getPlayerName(state.currentPlayer)}落子`
}

function statusDetail() {
  if (state.status === 'won') return '本地双人对局结束，可重新开局再战。'
  if (state.status === 'draw') return '没有形成五连，双方平分秋色。'
  if (state.lastError) return state.lastError
  if (!state.moves.length) return '点击棋盘棋位落子，先连成五枚即获胜。'
  const last = state.lastMove
  return `上手：${getPlayerName(last.player)}落在 ${last.row + 1} 行 ${last.col + 1} 列。`
}

function renderBoard() {
  const winLine = buildWinLineSet()
  const cells = []
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const player = state.board[row][col]
      const classes = ['board-cell']
      if (player) classes.push(player)
      if (state.lastMove?.row === row && state.lastMove?.col === col) classes.push('last')
      if (winLine.has(cellKey(row, col))) classes.push('win')
      cells.push(`
        <button
          class="${classes.join(' ')}"
          data-row="${row}"
          data-col="${col}"
          type="button"
          aria-label="${row + 1} 行 ${col + 1} 列${player ? `，${getPlayerName(player)}` : '，空位'}"
          ${state.status !== 'playing' || player ? 'disabled' : ''}
        >
          <span></span>
        </button>
      `)
    }
  }
  return cells.join('')
}

function renderMoveList() {
  if (!state.moves.length) return '<li>等待黑子先手。</li>'
  return state.moves
    .slice(-8)
    .reverse()
    .map(
      (move, index) =>
        `<li><strong>${state.moves.length - index}</strong><span>${getPlayerName(move.player)} · ${move.row + 1} 行 ${move.col + 1} 列</span></li>`
    )
    .join('')
}

function render() {
  app.innerHTML = `
    <main class="app-shell">
      <section class="score-strip" aria-label="对局状态">
        <div>
          <span>模式</span>
          <strong>本地双人</strong>
        </div>
        <div>
          <span>手数</span>
          <strong>${state.moves.length}</strong>
        </div>
        <div>
          <span>黑子</span>
          <strong>${state.moves.filter((move) => move.player === PLAYERS.black).length}</strong>
        </div>
        <div>
          <span>白子</span>
          <strong>${state.moves.filter((move) => move.player === PLAYERS.white).length}</strong>
        </div>
      </section>

      <section class="status-panel" aria-live="polite">
        <div class="turn-mark ${state.status === 'playing' ? state.currentPlayer : state.winner || 'draw'}"></div>
        <div>
          <p class="eyebrow">湖工五子棋</p>
          <h1>${statusTitle()}</h1>
          <p>${statusDetail()}</p>
        </div>
      </section>

      <section class="board-panel" aria-label="十五路五子棋棋盘">
        <div class="board-grid">
          ${renderBoard()}
        </div>
      </section>

      <section class="control-panel">
        <button id="restart-button" class="primary-action" type="button">重新开局</button>
        <div class="legend" aria-label="棋子说明">
          <span><i class="stone black"></i>黑子先手</span>
          <span><i class="stone white"></i>白子后手</span>
        </div>
      </section>

      <section class="history-panel" aria-label="最近落子">
        <div class="section-heading">
          <strong>最近落子</strong>
          <span>${state.status === 'playing' ? '对局中' : '已结束'}</span>
        </div>
        <ol>${renderMoveList()}</ol>
      </section>
    </main>
  `

  for (const button of app.querySelectorAll('[data-row][data-col]')) {
    button.addEventListener('click', () => {
      state = placeStone(state, Number(button.dataset.row), Number(button.dataset.col))
      render()
    })
  }

  document.getElementById('restart-button')?.addEventListener('click', () => {
    state = restartGame()
    render()
  })

  notifyHostHeight()
}

window.addEventListener('resize', syncViewport)
window.addEventListener('orientationchange', syncViewport)
window.visualViewport?.addEventListener('resize', syncViewport)

if ('ResizeObserver' in window) {
  new ResizeObserver(notifyHostHeight).observe(document.documentElement)
}

syncViewport()
render()
