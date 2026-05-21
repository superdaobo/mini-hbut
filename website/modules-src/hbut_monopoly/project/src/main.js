import './style.css'
import {
  CAMPUS_BOARD,
  WIN_CREDITS,
  createDeterministicDice,
  createInitialState,
  playTurn,
  restartGame
} from './game/monopoly.js'

const MODULE_ID = 'hbut_monopoly'
const dice = createDeterministicDice()
let state = createInitialState()

const app = document.getElementById('app')

function syncViewport() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight
  document.documentElement.style.setProperty('--module-vh', `${viewportHeight * 0.01}px`)
  notifyHostHeight()
}

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

function tileClass(index) {
  if (index === state.position) return 'tile current'
  if (index === 0) return 'tile start'
  return `tile ${CAMPUS_BOARD[index].type}`
}

function statusTitle() {
  if (state.status === 'won') return '绩点达标，成功毕业'
  if (state.status === 'lost') return '金币耗尽，挑战失败'
  return '投骰前进，经营湖工生活'
}

function renderBoard() {
  return CAMPUS_BOARD.map((tile, index) => `
    <button class="${tileClass(index)}" data-index="${index}" type="button" aria-label="${tile.name}">
      <span class="tile-index">${index + 1}</span>
      <span class="tile-name">${tile.name}</span>
    </button>
  `).join('')
}

function renderLog() {
  return state.log.map((item) => `<li>${item}</li>`).join('')
}

function render() {
  app.innerHTML = `
    <main class="app-shell">
      <section class="status-bar" aria-label="当前资源">
        <div>
          <span class="metric-label">金币</span>
          <strong>${state.coins}</strong>
        </div>
        <div>
          <span class="metric-label">绩点</span>
          <strong>${state.credits}/${WIN_CREDITS}</strong>
        </div>
        <div>
          <span class="metric-label">回合</span>
          <strong>${state.turn}</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工大富翁</p>
          <h1>${statusTitle()}</h1>
        </div>
        <div class="dice-card" aria-live="polite">
          <span class="dice-label">骰子</span>
          <strong>${state.dice || '-'}</strong>
        </div>
      </section>

      <section class="board-panel" aria-label="湖工校园棋盘">
        <div class="board-grid">
          ${renderBoard()}
        </div>
      </section>

      <section class="control-panel">
        <button id="roll-button" class="primary-action" type="button" ${state.status === 'playing' ? '' : 'disabled'}>
          投骰前进
        </button>
        <button id="restart-button" class="secondary-action" type="button">重新开始</button>
      </section>

      <section class="event-panel" aria-label="事件记录">
        <div class="event-heading">
          <strong>校园事件</strong>
          <span>${CAMPUS_BOARD[state.position].name}</span>
        </div>
        <ol>${renderLog()}</ol>
      </section>
    </main>
  `

  document.getElementById('roll-button')?.addEventListener('click', () => {
    state = playTurn(state, dice())
    render()
  })
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
