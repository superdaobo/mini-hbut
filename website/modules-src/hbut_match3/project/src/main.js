import './style.css'
import {
  MOVE_LIMIT,
  TILE_TYPES,
  createInitialMatch3State,
  restartMatch3Game,
  selectCell,
  swipeFromCell
} from './game/match3.js'
import {
  canUseGameRank,
  createRunId,
  fetchGameLeaderboard,
  readGameModuleContext,
  submitGameRank
} from './utils/game_rank.js'

const MODULE_ID = 'hbut_match3'
const app = document.getElementById('app')
const moduleContext = readGameModuleContext()
const rankEnabled = canUseGameRank(moduleContext)
const typeMap = new Map(TILE_TYPES.map((item) => [item.id, item]))

let state = createInitialMatch3State({ seed: 42 })
let currentRunId = createRunId()
let runStartedAt = Date.now()
let submitPending = null
let lastTerminalStatus = ''
let lastSubmitUiStatus = ''
let currentLeaderboardScope = moduleContext.className ? 'class' : 'school'
/** pointer 手势：点击双选 / 滑动交换 */
let boardGesture = null
const SWIPE_THRESHOLD_PX = 28

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

function showSubmitStatus(status) {
  lastSubmitUiStatus = status || ''
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
          lastSubmitUiStatus = ''
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
    maxLevel: 1,
    durationMs: Math.max(0, Date.now() - runStartedAt),
    moveCount: state.moveLimit - state.movesLeft,
    endedReason,
    extra: {
      movesLeft: state.movesLeft,
      chainPeak: state.chainPeak,
      moveLimit: state.moveLimit
    }
  }
  submitPending = payload
  showSubmitStatus('uploading')
  try {
    await submitGameRank(moduleContext, payload)
    submitPending = null
    showSubmitStatus('success')
  } catch (error) {
    console.warn('[hbut_match3] rank submit failed', error)
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
    console.warn('[hbut_match3] rank retry failed', error)
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

function maybeSubmitTerminal() {
  if (state.status === 'lost' && state.status !== lastTerminalStatus) {
    lastTerminalStatus = state.status
    void submitTerminalScore('lost')
  }
}

function afterChange() {
  maybeSubmitTerminal()
  render()
}

function tileExtraClass(r, c) {
  const classes = []
  if (state.selected && state.selected.row === r && state.selected.col === c) {
    classes.push('selected')
  }
  const fb = state.feedback
  if (!fb) return classes.join(' ')
  if (fb.type === 'invalid' && fb.at && fb.at.row === r && fb.at.col === c) {
    classes.push('invalid')
  }
  if (fb.type === 'invalid' && fb.from && fb.from.row === r && fb.from.col === c) {
    classes.push('invalid')
  }
  if (fb.type === 'matched' && fb.at && fb.at.row === r && fb.at.col === c) {
    classes.push('pulse')
  }
  if (fb.type === 'matched' && fb.from && fb.from.row === r && fb.from.col === c) {
    classes.push('pulse')
  }
  return classes.join(' ')
}

function feedbackBanner() {
  const fb = state.feedback
  if (!fb) {
    return `<div class="feedback-banner idle" role="status">点选两格交换，或按住格子向相邻方向滑动</div>`
  }
  if (fb.type === 'invalid') {
    const text =
      fb.reason === 'not_adjacent'
        ? '只能交换相邻格子'
        : fb.reason === 'out_of_bounds'
          ? '已经到边界了'
          : '这样交换不会形成三连'
    return `<div class="feedback-banner invalid" role="status">${text}</div>`
  }
  if (fb.type === 'matched') {
    return `<div class="feedback-banner matched" role="status">消除 +${fb.scoreGained || 0} · 连锁 x${fb.chainCount || 1}</div>`
  }
  if (fb.type === 'select') {
    return `<div class="feedback-banner select" role="status">已选中 · 点相邻格或向相邻方向滑动</div>`
  }
  if (fb.type === 'deselect') {
    return `<div class="feedback-banner idle" role="status">已取消选中</div>`
  }
  return `<div class="feedback-banner idle" role="status">点选两格交换，或按住格子向相邻方向滑动</div>`
}

function renderBoard() {
  const cells = []
  for (let r = 0; r < state.size; r += 1) {
    for (let c = 0; c < state.size; c += 1) {
      const id = state.board[r][c]
      const meta = typeMap.get(id) || { label: '?', color: '#94a3b8' }
      const extra = tileExtraClass(r, c)
      cells.push(
        `<button type="button" class="tile ${extra}" data-row="${r}" data-col="${c}" style="--tile:${meta.color}" aria-label="${meta.label}" aria-pressed="${extra.includes('selected') ? 'true' : 'false'}">${meta.label.slice(0, 2)}</button>`
      )
    }
  }
  return `<div class="match-grid" style="--size:${state.size}" data-feedback="${state.feedback?.type || ''}">${cells.join('')}</div>`
}

function applyBoardChange(nextState) {
  state = nextState
  afterChange()
}

function directionFromDelta(dx, dy) {
  if (Math.abs(dx) < SWIPE_THRESHOLD_PX && Math.abs(dy) < SWIPE_THRESHOLD_PX) return null
  if (Math.abs(dx) >= Math.abs(dy)) return dx > 0 ? 'right' : 'left'
  return dy > 0 ? 'down' : 'up'
}

function bindBoardGestures() {
  const grid = app.querySelector('.match-grid')
  if (!grid) return

  const readCell = (target) => {
    const button = target?.closest?.('[data-row]')
    if (!button || !grid.contains(button)) return null
    return { row: Number(button.dataset.row), col: Number(button.dataset.col) }
  }

  grid.addEventListener('pointerdown', (event) => {
    if (state.status !== 'playing') return
    if (event.button != null && event.button !== 0) return
    const cell = readCell(event.target)
    if (!cell) return
    boardGesture = {
      start: cell,
      x: event.clientX,
      y: event.clientY,
      done: false,
      pointerId: event.pointerId
    }
    try {
      grid.setPointerCapture(event.pointerId)
    } catch {
      /* ignore */
    }
    event.preventDefault()
  })

  grid.addEventListener('pointermove', (event) => {
    if (!boardGesture || boardGesture.done || state.status !== 'playing') return
    const direction = directionFromDelta(event.clientX - boardGesture.x, event.clientY - boardGesture.y)
    if (!direction) return
    const start = boardGesture.start
    boardGesture.done = true
    boardGesture = null
    applyBoardChange(swipeFromCell(state, start.row, start.col, direction))
  })

  const endGesture = () => {
    if (!boardGesture) return
    const gesture = boardGesture
    boardGesture = null
    if (gesture.done || state.status !== 'playing') return
    // 未滑动：按点击双选逻辑
    applyBoardChange(selectCell(state, gesture.start.row, gesture.start.col))
  }

  grid.addEventListener('pointerup', endGesture)
  grid.addEventListener('pointercancel', () => {
    boardGesture = null
  })
}

function render() {
  const tip =
    state.status === 'lost'
      ? `最终得分 ${state.score} · 点「重新开始」再来一局`
      : '点选两格交换，或按住格子向相邻方向滑动'

  app.innerHTML = `
    <main class="match-shell">
      <section class="metric-strip" aria-label="消消乐状态">
        <div class="metric-card metric-score">
          <span>得分</span>
          <strong data-mcp-metric="score">${state.score}</strong>
        </div>
        <div class="metric-card metric-moves">
          <span>剩余步数</span>
          <strong data-mcp-metric="moves_left">${state.movesLeft}</strong>
        </div>
        <div class="metric-card metric-chain">
          <span>最高连锁</span>
          <strong data-mcp-metric="chain_peak">x${state.chainPeak}</strong>
        </div>
        <div class="metric-card metric-limit">
          <span>限步</span>
          <strong data-mcp-metric="move_limit">${MOVE_LIMIT}</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工消消乐</p>
          <h1>${state.status === 'lost' ? '本局结束' : '交换相邻校园格'}</h1>
          <p class="status-detail">${tip}</p>
        </div>
        <div class="count-card">
          <span>棋盘</span>
          <strong>${state.size}×${state.size}</strong>
        </div>
      </section>

      ${feedbackBanner()}

      <section class="board-panel" aria-label="三消棋盘">${renderBoard()}</section>

      <section class="control-panel">
        <button id="restart-button" class="primary-action" type="button">重新开始</button>
        ${rankEnabled ? '<button id="leaderboard-button" class="secondary-action" type="button">排行榜</button>' : ''}
      </section>

      <div id="submit-status" class="submit-status" aria-live="polite"></div>

      <section class="log-panel" aria-label="消除记录">
        <div class="log-heading">
          <strong>消除记录</strong>
          <span>${TILE_TYPES.length} 种主题</span>
        </div>
        <ol>${(state.log || []).map((item) => `<li>${item}</li>`).join('')}</ol>
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

  bindBoardGestures()

  document.getElementById('restart-button')?.addEventListener('click', () => {
    state = restartMatch3Game({ seed: Date.now() % 100000 })
    currentRunId = createRunId()
    runStartedAt = Date.now()
    lastTerminalStatus = ''
    submitPending = null
    lastSubmitUiStatus = ''
    boardGesture = null
    afterChange()
  })

  setupLeaderboard()
  if (lastSubmitUiStatus) showSubmitStatus(lastSubmitUiStatus)
  notifyHostHeight()
}

window.addEventListener('resize', syncViewport)
window.addEventListener('orientationchange', syncViewport)
window.visualViewport?.addEventListener('resize', syncViewport)
if ('ResizeObserver' in window) {
  new ResizeObserver(syncViewport).observe(document.documentElement)
}

syncViewport()
render()
