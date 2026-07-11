import './style.css'
import {
  PARKING_LEVELS,
  computeParkingScore,
  createInitialParkingState,
  restartParkingGame,
  selectVehicle,
  slideSelected,
  vehicleCells
} from './game/parking.js'
import {
  canUseGameRank,
  createRunId,
  fetchGameLeaderboard,
  readGameModuleContext,
  submitGameRank
} from './utils/game_rank.js'

const MODULE_ID = 'hbut_parking'
const app = document.getElementById('app')
const moduleContext = readGameModuleContext()
const rankEnabled = canUseGameRank(moduleContext)

let state = createInitialParkingState({ levelIndex: 0 })
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

function durationMs() {
  return Math.max(0, Date.now() - runStartedAt)
}

function liveScore() {
  return computeParkingScore({
    clearedLevels: state.clearedLevels + (state.status === 'won' ? 0 : 0),
    totalSteps: state.totalSteps,
    durationMs: durationMs()
  })
}

function statusTitle() {
  if (state.status === 'won') return '全部出库'
  if (state.selectedId) return `已选 ${state.selectedId}`
  return '点选车辆后滑动'
}

function statusDetail() {
  if (state.status === 'won') {
    return `通关 ${state.clearedLevels} 关 · 得分 ${computeParkingScore({
      clearedLevels: state.clearedLevels,
      totalSteps: state.totalSteps,
      durationMs: durationMs()
    })}`
  }
  return `${state.levelName} · 步数 ${state.totalSteps} · 实时分 ${liveScore()}`
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
    score: computeParkingScore({
      clearedLevels: state.clearedLevels,
      totalSteps: state.totalSteps,
      durationMs: durationMs()
    }),
    maxLevel: state.clearedLevels || state.levelNumber || 1,
    durationMs: durationMs(),
    moveCount: state.totalSteps,
    endedReason,
    extra: {
      clearedLevels: state.clearedLevels,
      totalSteps: state.totalSteps,
      levelIndex: state.levelIndex
    }
  }
  submitPending = payload
  showSubmitStatus('uploading')
  try {
    await submitGameRank(moduleContext, payload)
    submitPending = null
    showSubmitStatus('success')
  } catch (error) {
    console.warn('[hbut_parking] rank submit failed', error)
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
    console.warn('[hbut_parking] rank retry failed', error)
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
  if (state.status === 'won' && state.status !== lastTerminalStatus) {
    lastTerminalStatus = state.status
    void submitTerminalScore('won')
  }
}

function afterChange() {
  maybeSubmitTerminal()
  render()
}

function vehicleStyle(vehicle) {
  const cells = vehicleCells(vehicle)
  const rows = cells.map((c) => c.row)
  const cols = cells.map((c) => c.col)
  const r0 = Math.min(...rows)
  const c0 = Math.min(...cols)
  const r1 = Math.max(...rows)
  const c1 = Math.max(...cols)
  return `grid-row: ${r0 + 1} / ${r1 + 2}; grid-column: ${c0 + 1} / ${c1 + 2};`
}

function renderBoard() {
  const vehiclesHtml = state.vehicles
    .map((vehicle) => {
      const selected = state.selectedId === vehicle.id ? 'selected' : ''
      const target = vehicle.target ? 'target' : ''
      return `<button type="button" class="vehicle ${selected} ${target}" data-vehicle-id="${vehicle.id}" style="${vehicleStyle(vehicle)}" aria-label="${vehicle.label}">${vehicle.label}</button>`
    })
    .join('')
  return `
    <div class="board-grid" style="--cols:${state.width};--rows:${state.height}">
      ${Array.from({ length: state.width * state.height })
        .map(() => '<span class="cell"></span>')
        .join('')}
      <span class="exit-marker" style="grid-row:${state.exit.row + 1};grid-column:${state.exit.col + 1}">出</span>
      ${vehiclesHtml}
    </div>
  `
}

function render() {
  app.innerHTML = `
    <main class="parking-shell">
      <section class="metric-strip" aria-label="挪车状态">
        <div>
          <span>关卡</span>
          <strong>${state.levelNumber}/${state.totalLevels}</strong>
        </div>
        <div>
          <span>通关</span>
          <strong>${state.clearedLevels}</strong>
        </div>
        <div>
          <span>步数</span>
          <strong>${state.totalSteps}</strong>
        </div>
        <div>
          <span>得分</span>
          <strong>${liveScore()}</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工挪车 · ${state.levelName}</p>
          <h1>${statusTitle()}</h1>
          <p class="status-detail">${statusDetail()}</p>
        </div>
        <div class="count-card">
          <span>目标</span>
          <strong>校车出库</strong>
        </div>
      </section>

      <section class="board-panel" aria-label="停车场">${renderBoard()}</section>

      <section class="control-panel">
        <div class="move-pad" aria-label="移动方向">
          <button type="button" class="pad-btn" data-dir="up">↑</button>
          <button type="button" class="pad-btn" data-dir="left">←</button>
          <button type="button" class="pad-btn" data-dir="right">→</button>
          <button type="button" class="pad-btn" data-dir="down">↓</button>
        </div>
        <button id="restart-button" class="secondary-action" type="button">重新开始</button>
        ${rankEnabled ? '<button id="leaderboard-button" class="secondary-action" type="button">排行榜</button>' : ''}
      </section>

      <div id="submit-status" class="submit-status" aria-live="polite"></div>

      <section class="log-panel" aria-label="挪车记录">
        <div class="log-heading">
          <strong>挪车记录</strong>
          <span>${PARKING_LEVELS.length} 关</span>
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

  for (const button of app.querySelectorAll('[data-vehicle-id]')) {
    button.addEventListener('click', () => {
      state = selectVehicle(state, button.dataset.vehicleId)
      afterChange()
    })
  }

  const dirMap = {
    left: -1,
    right: 1,
    up: -1,
    down: 1
  }
  for (const button of app.querySelectorAll('[data-dir]')) {
    button.addEventListener('click', () => {
      const dir = button.dataset.dir
      const selected = state.vehicles.find((item) => item.id === state.selectedId)
      if (!selected) {
        state = { ...state, log: ['请先点选一辆车。', ...(state.log || [])].slice(0, 6) }
        afterChange()
        return
      }
      if ((dir === 'left' || dir === 'right') && selected.orientation !== 'h') {
        state = { ...state, log: ['该车只能上下移动。', ...(state.log || [])].slice(0, 6) }
        afterChange()
        return
      }
      if ((dir === 'up' || dir === 'down') && selected.orientation !== 'v') {
        state = { ...state, log: ['该车只能左右移动。', ...(state.log || [])].slice(0, 6) }
        afterChange()
        return
      }
      state = slideSelected(state, dirMap[dir])
      afterChange()
    })
  }

  document.getElementById('restart-button')?.addEventListener('click', () => {
    state = restartParkingGame()
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
