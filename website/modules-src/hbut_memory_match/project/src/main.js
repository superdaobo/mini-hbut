import './style.css'
import {
  CAMPUS_MEMORY_PAIRS,
  MEMORY_LEVELS,
  createInitialMemoryState,
  flipMemoryCard,
  restartMemoryGame,
  tickMemoryGame
} from './game/memory.js'
import {
  canUseGameRank,
  createRunId,
  fetchGameLeaderboard,
  readGameModuleContext,
  submitGameRank
} from './utils/game_rank.js'

const MODULE_ID = 'hbut_memory_match'
const app = document.getElementById('app')

const moduleContext = readGameModuleContext()
const rankEnabled = canUseGameRank(moduleContext)

let state = createInitialMemoryState({ levelIndex: 0, seed: 9 })
let lastFrame = performance.now()
let currentRunId = createRunId()
let runStartedAt = Date.now()
let submitPending = null
let lastTerminalStatus = ''
let currentLeaderboardScope = moduleContext.className ? 'class' : 'school'

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

function showSubmitStatus(status) {
  const el = document.getElementById('submit-status')
  if (!el) return
  switch (status) {
    case 'uploading':
      el.textContent = '正在上传成绩...'
      el.className = 'submit-status uploading'
      el.onclick = null
      break
    case 'success':
      el.textContent = '✓ 成绩已上传'
      el.className = 'submit-status success'
      el.onclick = null
      setTimeout(() => {
        if (el.classList.contains('success')) {
          el.textContent = ''
          el.className = 'submit-status'
        }
      }, 3000)
      break
    case 'failed':
      el.textContent = '上传失败，点此重试'
      el.className = 'submit-status failed'
      el.onclick = () => {
        void retrySubmit()
      }
      break
    default:
      el.textContent = ''
      el.className = 'submit-status'
      el.onclick = null
  }
}

async function submitTerminalScore(endedReason) {
  if (!rankEnabled) return
  const payload = {
    runId: currentRunId,
    score: state.score,
    maxLevel: state.levelNumber || 1,
    durationMs: Math.max(0, Date.now() - runStartedAt),
    moveCount: Number(state.moves || 0),
    endedReason,
    extra: {
      mistakes: state.mistakes || 0,
      levelIndex: state.levelIndex || 0,
      combo: state.combo || 0
    }
  }
  submitPending = payload
  showSubmitStatus('uploading')
  try {
    await submitGameRank(moduleContext, payload)
    submitPending = null
    showSubmitStatus('success')
  } catch (error) {
    console.warn('[hbut_memory_match] rank submit failed', error)
    showSubmitStatus('failed')
  }
}

async function retrySubmit() {
  if (!submitPending || !rankEnabled) return
  showSubmitStatus('uploading')
  try {
    await submitGameRank(moduleContext, submitPending)
    submitPending = null
    showSubmitStatus('success')
  } catch (error) {
    console.warn('[hbut_memory_match] rank retry failed', error)
    showSubmitStatus('failed')
  }
}

function setupLeaderboard() {
  if (!rankEnabled) return
  const overlay = document.getElementById('leaderboard-overlay')
  const openBtn = document.getElementById('leaderboard-button')
  const closeBtn = document.getElementById('leaderboard-close')
  openBtn?.addEventListener('click', () => {
    if (overlay) overlay.style.display = 'flex'
    void loadLeaderboard(currentLeaderboardScope)
  })
  closeBtn?.addEventListener('click', () => {
    if (overlay) overlay.style.display = 'none'
  })
  overlay?.addEventListener('click', (event) => {
    if (event.target === overlay) overlay.style.display = 'none'
  })
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((item) => item.classList.remove('active'))
      btn.classList.add('active')
      currentLeaderboardScope = btn.dataset.scope || 'class'
      void loadLeaderboard(currentLeaderboardScope)
    })
  })
}

async function loadLeaderboard(scope) {
  const content = document.getElementById('leaderboard-content')
  if (!content) return
  content.innerHTML = '<div class="leaderboard-loading">加载中...</div>'
  try {
    const data = await fetchGameLeaderboard(moduleContext, { scope, limit: 20 })
    const list = data.leaderboard || data.data || []
    if (!list.length) {
      content.innerHTML = '<div class="leaderboard-empty">暂无数据</div>'
      return
    }
    const isClassTotal = scope === 'class_total'
    content.innerHTML = `<div class="leaderboard-list">${list
      .map((item, index) => {
        const rank = item.rank || index + 1
        const name = isClassTotal
          ? item.class_name || item.className || '未知班级'
          : item.player_name || item.playerName || item.student_id || '匿名'
        const score = isClassTotal ? item.total_score ?? item.totalScore ?? 0 : item.score ?? 0
        return `<div class="leaderboard-item"><span class="rank-badge">${rank}</span><span class="rank-name">${name}</span><span class="rank-score">${score}</span></div>`
      })
      .join('')}</div>`
  } catch (error) {
    content.innerHTML = `<div class="leaderboard-error">加载失败: ${error?.message || '未知错误'}</div>`
  }
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
      maybeSubmitTerminal()
      updateUi()
    })
  }
  notifyHostHeight()
}

function maybeSubmitTerminal() {
  if ((state.status === 'won' || state.status === 'lost') && state.status !== lastTerminalStatus) {
    lastTerminalStatus = state.status
    void submitTerminalScore(state.status === 'won' ? 'won' : 'lost')
  }
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
        ${rankEnabled ? '<button id="leaderboard-button" class="secondary-action" type="button">排行榜</button>' : ''}
      </section>

      <div id="submit-status" class="submit-status" aria-live="polite"></div>

      <section class="log-panel" aria-label="配对记录">
        <div class="log-heading">
          <strong>配对记录</strong>
          <span data-log-scope>${state.pairs.length} 组校园记忆</span>
        </div>
        <ol data-log></ol>
      </section>
    </main>

    ${rankEnabled ? `
    <div class="leaderboard-overlay" id="leaderboard-overlay" style="display:none">
      <div class="leaderboard-modal">
        <div class="leaderboard-header">
          <h2>🏆 排行榜</h2>
          <button class="leaderboard-close" id="leaderboard-close" type="button">&times;</button>
        </div>
        <div class="leaderboard-tabs">
          <button class="tab-btn ${currentLeaderboardScope === 'class' ? 'active' : ''}" data-scope="class" type="button">班级榜</button>
          <button class="tab-btn ${currentLeaderboardScope === 'school' ? 'active' : ''}" data-scope="school" type="button">全校榜</button>
          <button class="tab-btn ${currentLeaderboardScope === 'class_total' ? 'active' : ''}" data-scope="class_total" type="button">班级总分榜</button>
        </div>
        <div class="leaderboard-content" id="leaderboard-content">
          <div class="leaderboard-loading">加载中...</div>
        </div>
      </div>
    </div>` : ''}
  `

  document.getElementById('restart-button')?.addEventListener('click', () => {
    state = restartMemoryGame(state, { levelIndex: 0, seed: Date.now() % 100000 })
    currentRunId = createRunId()
    runStartedAt = Date.now()
    lastTerminalStatus = ''
    submitPending = null
    showSubmitStatus('')
    lastFrame = performance.now()
    updateUi()
  })
  setupLeaderboard()
  updateUi()
}

function tick(now) {
  const delta = now - lastFrame
  lastFrame = now
  const previousStatus = state.status
  const previousSecond =
    state.status === 'preview' ? Math.ceil(state.previewLeftMs / 1000) : Math.ceil(state.timeLeftMs / 1000)
  state = tickMemoryGame(state, delta)
  maybeSubmitTerminal()
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
