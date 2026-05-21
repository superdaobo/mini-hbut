import './style.css'
import {
  CAMPUS_MEMORY_PAIRS,
  createInitialMemoryState,
  flipMemoryCard,
  restartMemoryGame,
  tickMemoryGame
} from './game/memory.js'

const MODULE_ID = 'hbut_memory_match'
const app = document.getElementById('app')

let state = createInitialMemoryState({ pairCount: 6, seed: 9 })
let lastFrame = performance.now()

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

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function statusTitle() {
  if (state.status === 'won') return '全部配对完成'
  if (state.pendingMismatch) return '记住位置，继续翻牌'
  if (state.selectedCardIds.length === 1) return '再翻一张试试'
  return '翻开校园记忆'
}

function categoryText(category) {
  if (category === 'study') return '学习'
  if (category === 'life') return '生活'
  return '校园'
}

function cardClass(card) {
  const classes = ['memory-card', card.category]
  if (card.revealed || card.matched) classes.push('revealed')
  if (card.matched) classes.push('matched')
  return classes.join(' ')
}

function renderCards() {
  return state.cards
    .map(
      (card) => `
        <button class="${cardClass(card)}" type="button" data-card-id="${card.id}" aria-label="${card.label}">
          <span class="card-back">HBUT</span>
          <span class="card-front">
            <strong>${card.label}</strong>
            <small>${card.hint}</small>
            <em>${categoryText(card.category)}</em>
          </span>
        </button>
      `
    )
    .join('')
}

function renderLog() {
  return state.log.map((item) => `<li>${item}</li>`).join('')
}

function updateUi() {
  app.querySelector('[data-moves]').textContent = String(state.moves)
  app.querySelector('[data-pairs]').textContent = `${state.matchedPairs}/${state.pairs.length}`
  app.querySelector('[data-time]').textContent = formatTime(state.elapsedMs)
  app.querySelector('[data-status]').textContent = statusTitle()
  app.querySelector('[data-board]').innerHTML = renderCards()
  app.querySelector('[data-log]').innerHTML = renderLog()
  app.querySelector('[data-remaining]').textContent = `${state.cards.length - state.matchedPairs * 2} 张未配对`

  for (const button of app.querySelectorAll('[data-card-id]')) {
    button.addEventListener('click', () => {
      state = flipMemoryCard(state, button.dataset.cardId)
      updateUi()
    })
  }
  notifyHostHeight()
}

function renderShell() {
  app.innerHTML = `
    <main class="memory-shell">
      <section class="metric-strip" aria-label="记忆牌状态">
        <div>
          <span>步数</span>
          <strong data-moves>0</strong>
        </div>
        <div>
          <span>配对</span>
          <strong data-pairs>0/${CAMPUS_MEMORY_PAIRS.length}</strong>
        </div>
        <div>
          <span>用时</span>
          <strong data-time>00:00</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工记忆牌</p>
          <h1 data-status>${statusTitle()}</h1>
        </div>
        <div class="count-card">
          <span>牌组</span>
          <strong data-remaining>${state.cards.length} 张</strong>
        </div>
      </section>

      <section class="board-panel" aria-label="湖工记忆牌牌桌">
        <div class="memory-grid" data-board></div>
      </section>

      <section class="control-panel">
        <button id="restart-button" class="primary-action" type="button">重新开始</button>
      </section>

      <section class="log-panel" aria-label="配对记录">
        <div class="log-heading">
          <strong>配对记录</strong>
          <span>${state.pairs.length} 组校园记忆</span>
        </div>
        <ol data-log></ol>
      </section>
    </main>
  `

  document.getElementById('restart-button')?.addEventListener('click', () => {
    state = restartMemoryGame(state, { seed: Date.now() % 100000 })
    lastFrame = performance.now()
    updateUi()
  })

  updateUi()
}

function tick(now) {
  const delta = now - lastFrame
  lastFrame = now
  const previousSecond = Math.floor(state.elapsedMs / 1000)
  state = tickMemoryGame(state, delta)
  if (Math.floor(state.elapsedMs / 1000) !== previousSecond) {
    app.querySelector('[data-time]').textContent = formatTime(state.elapsedMs)
  }
  requestAnimationFrame(tick)
}

window.addEventListener('resize', syncViewport)
window.addEventListener('orientationchange', syncViewport)
window.visualViewport?.addEventListener('resize', syncViewport)

if ('ResizeObserver' in window) {
  new ResizeObserver(syncViewport).observe(document.documentElement)
}

renderShell()
syncViewport()
requestAnimationFrame(tick)
