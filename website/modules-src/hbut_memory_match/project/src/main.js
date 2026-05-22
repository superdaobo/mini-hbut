import './style.css'
import {
  CAMPUS_MEMORY_PAIRS,
  MEMORY_LEVELS,
  createInitialMemoryState,
  flipMemoryCard,
  restartMemoryGame,
  tickMemoryGame
} from './game/memory.js'

const MODULE_ID = 'hbut_memory_match'
const app = document.getElementById('app')

let state = createInitialMemoryState({ levelIndex: 0, seed: 9 })
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
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(seconds / 60)
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function statusTitle() {
  if (state.status === 'preview') return '记住牌面位置'
  if (state.status === 'won') return '四关全部通关'
  if (state.status === 'lost') return '时间耗尽'
  if (state.pendingMismatch) return '记住位置，继续翻牌'
  if (state.selectedCardIds.length === 1) return '再翻一张试试'
  return '翻开校园记忆'
}

function statusDetail() {
  if (state.status === 'preview') return `预览剩余 ${formatTime(state.previewLeftMs)}`
  if (state.status === 'won') return `最终得分 ${state.score}`
  if (state.status === 'lost') return `停在第 ${state.levelNumber} 关，得分 ${state.score}`
  return `剩余 ${formatTime(state.timeLeftMs)}，错配 ${state.mistakes} 次`
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
  if (state.pendingMismatch?.includes(card.id)) classes.push('mismatch')
  return classes.join(' ')
}

function visibleHint(card) {
  if (state.status === 'preview') return card.hint
  if (state.hintMode === 'minimal' && !card.matched) return '线索隐藏'
  if (state.hintMode === 'category' && !card.matched) return categoryText(card.category)
  return card.hint
}

function renderCards() {
  return state.cards
    .map(
      (card) => `
        <button class="${cardClass(card)}" type="button" data-card-id="${card.id}" aria-label="${card.label}" ${state.status !== 'playing' ? 'disabled' : ''}>
          <span class="card-back">
            <strong>HBUT</strong>
            <small>${state.levelNumber}-${categoryText(card.category)}</small>
          </span>
          <span class="card-front">
            <strong>${card.label}</strong>
            <small>${visibleHint(card)}</small>
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
  app.querySelector('[data-level]').textContent = `${state.levelNumber}/${state.totalLevels}`
  app.querySelector('[data-pairs]').textContent = `${state.matchedPairs}/${state.pairs.length}`
  app.querySelector('[data-time]').textContent =
    state.status === 'preview' ? formatTime(state.previewLeftMs) : formatTime(state.timeLeftMs)
  app.querySelector('[data-score]').textContent = String(state.score)
  app.querySelector('[data-combo]').textContent = `x${state.combo}`
  app.querySelector('[data-mistakes]').textContent = String(state.mistakes)
  app.querySelector('[data-level-name]').textContent = state.levelName
  app.querySelector('[data-detail]').textContent = statusDetail()
  app.querySelector('[data-progress]').textContent =
    state.hintMode === 'minimal' ? '隐藏线索' : `${state.pairs.length} 组校园记忆`
  app.querySelector('[data-log-scope]').textContent = `${state.pairs.length} 组校园记忆`
  app.querySelector('[data-status]').textContent = statusTitle()
  app.querySelector('[data-board]').innerHTML = renderCards()
  app.querySelector('[data-log]').innerHTML = renderLog()
  app.querySelector('[data-remaining]').textContent = `${state.cards.length - state.matchedPairs * 2} 张未配对`
  app.querySelector('[data-restart-label]').textContent = state.status === 'lost' ? '再挑战' : '重新开始'

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
          <span>关卡</span>
          <strong data-level>1/${MEMORY_LEVELS.length}</strong>
        </div>
        <div>
          <span>配对</span>
          <strong data-pairs>0/${CAMPUS_MEMORY_PAIRS.length}</strong>
        </div>
        <div>
          <span>倒计时</span>
          <strong data-time>00:00</strong>
        </div>
        <div>
          <span>得分</span>
          <strong data-score>0</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工记忆牌 · <span data-level-name>${state.levelName}</span></p>
          <h1 data-status>${statusTitle()}</h1>
          <p class="status-detail" data-detail>${statusDetail()}</p>
        </div>
        <div class="count-card">
          <span data-progress>${state.pairs.length} 组校园记忆</span>
          <strong data-remaining>${state.cards.length} 张</strong>
        </div>
      </section>

      <section class="board-panel" aria-label="湖工记忆牌牌桌">
        <div class="memory-grid" data-board></div>
      </section>

      <section class="control-panel">
        <div class="quick-stats" aria-label="当前表现">
          <span>连击 <strong data-combo>x0</strong></span>
          <span>错配 <strong data-mistakes>0</strong></span>
        </div>
        <button id="restart-button" class="primary-action" type="button"><span data-restart-label>重新开始</span></button>
      </section>

      <section class="log-panel" aria-label="配对记录">
        <div class="log-heading">
          <strong>配对记录</strong>
          <span data-log-scope>${state.pairs.length} 组校园记忆</span>
        </div>
        <ol data-log></ol>
      </section>
    </main>
  `

  document.getElementById('restart-button')?.addEventListener('click', () => {
    state = restartMemoryGame(state, { levelIndex: 0, seed: Date.now() % 100000 })
    lastFrame = performance.now()
    updateUi()
  })

  updateUi()
}

function tick(now) {
  const delta = now - lastFrame
  lastFrame = now
  const previousStatus = state.status
  const previousSecond =
    state.status === 'preview' ? Math.ceil(state.previewLeftMs / 1000) : Math.ceil(state.timeLeftMs / 1000)
  state = tickMemoryGame(state, delta)
  const currentSecond =
    state.status === 'preview' ? Math.ceil(state.previewLeftMs / 1000) : Math.ceil(state.timeLeftMs / 1000)
  if (state.status !== previousStatus || currentSecond !== previousSecond) {
    updateUi()
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
