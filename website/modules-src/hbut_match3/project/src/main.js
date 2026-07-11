import './style.css'
import {
  MOVE_LIMIT,
  TILE_TYPES,
  createInitialMatch3State,
  restartMatch3Game,
  selectCell
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

function renderBoard() {
  const cells = []
  for (let r = 0; r < state.size; r += 1) {
    for (let c = 0; c < state.size; c += 1) {
      const id = state.board[r][c]
      const meta = typeMap.get(id) || { label: '?', color: '#94a3b8' }
      const selected =
        state.selected && state.selected.row === r && state.selected.col === c ? 'selected' : ''
      cells.push(
        `<button type="button" class="tile ${selected}" data-row="${r}" data-col="${c}" style="--tile:${meta.color}" aria-label="${meta.label}">${meta.label.slice(0, 2)}</button>`
      )
    }
  }
  return `<div class="match-grid" style="--size:${state.size}">${cells.join('')}</div>`
}

function render() {
  app.innerHTML = `
    <main class="match-shell">
      <section class="metric-strip" aria-label="消消乐状态">
        <div>
          <span>得分</span>
          <strong>${state.score}</strong>
        </div>
        <div>
          <span>剩余步数</span>
          <strong>${state.movesLeft}</strong>
        </div>
        <div>
          <span>最高连锁</span>
          <strong>x${state.chainPeak}</strong>
        </div>
        <div>
          <span>限步</span>
          <strong>${MOVE_LIMIT}</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工消消乐</p>
          <h1>${state.status === 'lost' ? '本局结束' : '交换相邻校园格'}</h1>
          <p class="status-detail">${state.status === 'lost' ? `最终得分 ${state.score}` : '点选两格相邻交换，三连消除，连锁加分'}</p>
        </div>
        <div class="count-card">
          <span>棋盘</span>
          <strong>${state.size}×${state.size}</strong>
        </div>
      </section>

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

  for (const button of app.querySelectorAll('[data-row]')) {
    button.addEventListener('click', () => {
      if (state.status !== 'playing') return
      state = selectCell(state, Number(button.dataset.row), Number(button.dataset.col))
      afterChange()
    })
  }

  document.getElementById('restart-button')?.addEventListener('click', () => {
    state = restartMatch3Game({ seed: Date.now() % 100000 })
    currentRunId = createRunId()
    runStartedAt = Date.now()
    lastTerminalStatus = ''
    submitPending = null
    lastSubmitUiStatus = ''
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
