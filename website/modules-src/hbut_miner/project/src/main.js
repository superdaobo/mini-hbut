import './style.css'
import {
  LEVELS,
  createInitialMinerState,
  fireHook,
  restartMinerGame,
  stepMinerGame
} from './game/miner.js'
import {
  canUseGameRank,
  createRunId,
  fetchGameLeaderboard,
  readGameModuleContext,
  submitGameRank
} from './utils/game_rank.js'

const MODULE_ID = 'hbut_miner'
const app = document.getElementById('app')

const moduleContext = readGameModuleContext()
const rankEnabled = canUseGameRank(moduleContext)

let state = createInitialMinerState()
let lastFrame = performance.now()
let canvas
let ctx
let currentRunId = createRunId()
let runStartedAt = Date.now()
let submitPending = null
let lastTerminalStatus = ''
let currentLeaderboardScope = moduleContext.className ? 'class' : 'school'

function syncViewport() {
  const viewportHeight = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight
  document.documentElement.style.setProperty('--module-vh', `${viewportHeight * 0.01}px`)
  resizeCanvas()
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
  return Math.max(0, Math.ceil(ms / 1000))
}

function statusText() {
  if (state.status === 'won') return '全部通关'
  if (state.status === 'lost') return '时间耗尽'
  if (state.hook.mode === 'extending') return '吊钩下探'
  if (state.hook.mode === 'returning') return state.hook.carrying ? '正在回收' : '空钩返回'
  return `${state.levelName} 瞄准中`
}

function renderShell() {
  app.innerHTML = `
    <main class="miner-shell">
      <section class="top-strip" aria-label="矿工状态">
        <div>
          <span>关卡</span>
          <strong data-level>1/${LEVELS.length}</strong>
        </div>
        <div>
          <span>得分</span>
          <strong data-score>0</strong>
        </div>
        <div>
          <span>目标</span>
          <strong data-target>0</strong>
        </div>
        <div>
          <span>时间</span>
          <strong data-time>0s</strong>
        </div>
      </section>

      <section class="scene-panel" aria-label="湖工矿区">
        <canvas id="miner-canvas" aria-label="湖工矿工游戏画面"></canvas>
      </section>

      <section class="status-panel" aria-live="polite">
        <div>
          <p class="kicker">湖工矿工</p>
          <h1 data-status>${statusText()}</h1>
          <p class="level-name" data-level-name></p>
        </div>
        <div class="progress-card">
          <span>进度</span>
          <strong data-progress>0%</strong>
        </div>
      </section>

      <section class="control-panel">
        <button id="launch-button" class="primary-action" type="button">发射吊钩</button>
        <button id="restart-button" class="secondary-action" type="button">重新开始</button>
        ${rankEnabled ? '<button id="leaderboard-button" class="secondary-action" type="button">排行榜</button>' : ''}
      </section>

      <div id="submit-status" class="submit-status" aria-live="polite"></div>

      <section class="log-panel" aria-label="矿区记录">
        <div class="log-heading">
          <strong>矿区记录</strong>
          <span data-count></span>
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

  canvas = document.getElementById('miner-canvas')
  ctx = canvas.getContext('2d')

  document.getElementById('launch-button')?.addEventListener('click', launchHook)
  document.getElementById('restart-button')?.addEventListener('click', () => {
    state = restartMinerGame(state)
    currentRunId = createRunId()
    runStartedAt = Date.now()
    lastTerminalStatus = ''
    submitPending = null
    showSubmitStatus('')
    lastFrame = performance.now()
    updateUi()
  })
  canvas.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    launchHook()
  })
  setupLeaderboard()

  resizeCanvas()
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
    moveCount: Number(state.shotCount || 0),
    endedReason,
    extra: {
      levelName: state.levelName || '',
      targetScore: state.targetScore || 0
    }
  }
  submitPending = payload
  showSubmitStatus('uploading')
  try {
    await submitGameRank(moduleContext, payload)
    submitPending = null
    showSubmitStatus('success')
  } catch (error) {
    console.warn('[hbut_miner] rank submit failed', error)
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
    console.warn('[hbut_miner] rank retry failed', error)
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

function launchHook() {
  state = fireHook(state)
  updateUi()
}

function resizeCanvas() {
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const ratio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2))
  const width = Math.max(1, Math.floor(rect.width * ratio))
  const height = Math.max(1, Math.floor(rect.height * ratio))
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width
    canvas.height = height
  }
  drawScene()
}

function worldMetrics() {
  const width = canvas.width
  const height = canvas.height
  const scale = Math.min(width / 430, height / 620)
  return {
    width,
    height,
    scale,
    originX: width / 2,
    originY: 38 * scale
  }
}

function toCanvas(point, metrics) {
  return {
    x: metrics.originX + point.x * metrics.scale,
    y: metrics.originY + point.y * metrics.scale
  }
}

function drawRoundedRect(x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + width, y, x + width, y + height, r)
  ctx.arcTo(x + width, y + height, x, y + height, r)
  ctx.arcTo(x, y + height, x, y, r)
  ctx.arcTo(x, y, x + width, y, r)
  ctx.closePath()
  ctx.fill()
}

function drawBackground(metrics) {
  const gradient = ctx.createLinearGradient(0, 0, 0, metrics.height)
  gradient.addColorStop(0, '#d9ecff')
  gradient.addColorStop(0.42, '#eaf4ed')
  gradient.addColorStop(1, '#c18a50')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, metrics.width, metrics.height)

  ctx.fillStyle = 'rgba(25, 79, 144, 0.18)'
  drawRoundedRect(metrics.width * 0.07, metrics.height * 0.14, metrics.width * 0.28, 16 * metrics.scale, 8 * metrics.scale)
  drawRoundedRect(metrics.width * 0.58, metrics.height * 0.2, metrics.width * 0.32, 18 * metrics.scale, 8 * metrics.scale)

  ctx.fillStyle = '#8cc2e6'
  ctx.beginPath()
  ctx.ellipse(metrics.width * 0.26, metrics.height * 0.82, metrics.width * 0.28, 24 * metrics.scale, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = '#f4d160'
  drawRoundedRect(metrics.originX - 76 * metrics.scale, 0, 152 * metrics.scale, 24 * metrics.scale, 6 * metrics.scale)
  ctx.fillStyle = '#164b86'
  ctx.font = `${12 * metrics.scale}px "Microsoft YaHei", sans-serif`
  ctx.textAlign = 'center'
  ctx.fillText('HBUT 矿区吊机', metrics.originX, 17 * metrics.scale)
}

function itemColor(item) {
  if (item.type === 'powerup') return '#7c5cff'
  if (item.type === 'hazard') return '#d85b53'
  if (item.type === 'bonus') return '#f2b84b'
  if (item.type === 'heavy') return '#5d6f85'
  return '#4fb18a'
}

function drawItems(metrics) {
  for (const item of state.items) {
    const center = toCanvas(item, metrics)
    const radius = item.radius * metrics.scale
    ctx.fillStyle = itemColor(item)
    ctx.beginPath()
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2)
    ctx.fill()
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)'
    ctx.lineWidth = Math.max(2, 2 * metrics.scale)
    ctx.stroke()

    ctx.fillStyle = '#102235'
    ctx.font = `${10 * metrics.scale}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText(String(item.value), center.x, center.y + 3 * metrics.scale)
  }
}

function drawHook(metrics) {
  const radians = (state.hook.angle * Math.PI) / 180
  const tip = toCanvas(
    {
      x: Math.sin(radians) * state.hook.length,
      y: Math.cos(radians) * state.hook.length
    },
    metrics
  )
  const base = toCanvas({ x: 0, y: 0 }, metrics)

  ctx.strokeStyle = '#2f4256'
  ctx.lineWidth = Math.max(3, 3 * metrics.scale)
  ctx.beginPath()
  ctx.moveTo(base.x, base.y)
  ctx.lineTo(tip.x, tip.y)
  ctx.stroke()

  ctx.fillStyle = '#102235'
  ctx.beginPath()
  ctx.arc(base.x, base.y, 7 * metrics.scale, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = '#102235'
  ctx.lineWidth = Math.max(4, 4 * metrics.scale)
  ctx.beginPath()
  ctx.arc(tip.x, tip.y + 7 * metrics.scale, 10 * metrics.scale, 0.15 * Math.PI, 0.88 * Math.PI)
  ctx.stroke()

  if (state.hook.carrying) {
    ctx.fillStyle = itemColor(state.hook.carrying)
    ctx.beginPath()
    ctx.arc(tip.x, tip.y + 20 * metrics.scale, state.hook.carrying.radius * 0.85 * metrics.scale, 0, Math.PI * 2)
    ctx.fill()
  }
}

function drawScene() {
  if (!ctx || !canvas) return
  const metrics = worldMetrics()
  ctx.clearRect(0, 0, metrics.width, metrics.height)
  drawBackground(metrics)
  drawItems(metrics)
  drawHook(metrics)
}

function updateUi() {
  app.querySelector('[data-level]').textContent = `${state.levelNumber}/${LEVELS.length}`
  app.querySelector('[data-score]').textContent = String(state.score)
  app.querySelector('[data-target]').textContent = String(state.targetScore)
  app.querySelector('[data-time]').textContent = `${formatTime(state.timeLeftMs)}s`
  app.querySelector('[data-status]').textContent = statusText()
  app.querySelector('[data-level-name]').textContent = `第 ${state.levelNumber} 关 · ${state.levelName}`
  app.querySelector('[data-progress]').textContent = `${Math.min(100, Math.round((state.score / state.targetScore) * 100))}%`
  app.querySelector('[data-count]').textContent = `第 ${state.levelNumber} 关剩余 ${state.items.length} 件`
  app.querySelector('[data-log]').innerHTML = state.log.map((item) => `<li>${item}</li>`).join('')

  const launchButton = document.getElementById('launch-button')
  launchButton.disabled = state.status !== 'aiming' || state.hook.mode !== 'swinging'
  if (state.status === 'won') launchButton.textContent = '目标达成'
  else if (state.status === 'lost') launchButton.textContent = '重新开始后挑战'
  else launchButton.textContent = state.hook.mode === 'swinging' ? '发射吊钩' : '回收中'

  drawScene()
}

function tick(now) {
  const delta = now - lastFrame
  lastFrame = now
  state = stepMinerGame(state, delta)
  if ((state.status === 'won' || state.status === 'lost') && state.status !== lastTerminalStatus) {
    lastTerminalStatus = state.status
    void submitTerminalScore(state.status === 'won' ? 'won' : 'lost')
  }
  updateUi()
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
updateUi()
requestAnimationFrame(tick)
