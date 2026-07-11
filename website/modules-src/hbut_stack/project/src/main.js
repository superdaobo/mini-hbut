import './style.css'
import {
  BLOCK_HEIGHT,
  WORLD_WIDTH,
  computeCameraOffsetY,
  createInitialStackState,
  dropStackBlock,
  restartStackGame,
  tickMovingBlock
} from './game/stack.js'
import {
  canUseGameRank,
  createRunId,
  fetchGameLeaderboard,
  readGameModuleContext,
  submitGameRank
} from './utils/game_rank.js'

const MODULE_ID = 'hbut_stack'
const app = document.getElementById('app')

const moduleContext = readGameModuleContext()
const rankEnabled = canUseGameRank(moduleContext)

let state = createInitialStackState({ seed: 7 })
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

function statusText() {
  if (state.status === 'lost') return '塔倒了'
  if (state.perfectCombo >= 3) return `完美连击 x${state.perfectCombo}`
  return '点击落下'
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
    maxLevel: state.layers || 0,
    durationMs: Math.max(0, Date.now() - runStartedAt),
    moveCount: state.layers || 0,
    endedReason,
    extra: {
      perfectCount: state.perfectCount || 0,
      perfectCombo: state.perfectCombo || 0
    }
  }
  submitPending = payload
  showSubmitStatus('uploading')
  try {
    await submitGameRank(moduleContext, payload)
    submitPending = null
    showSubmitStatus('success')
  } catch (error) {
    console.warn('[hbut_stack] rank submit failed', error)
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
    console.warn('[hbut_stack] rank retry failed', error)
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

function dropNow() {
  if (state.status !== 'playing') return
  state = dropStackBlock(state)
  maybeSubmitTerminal()
  updateUi()
}

function renderShell() {
  app.innerHTML = `
    <main class="stack-shell">
      <section class="metric-strip" aria-label="叠塔状态">
        <div>
          <span>层数</span>
          <strong data-layers data-mcp-metric="layers">0</strong>
        </div>
        <div>
          <span>得分</span>
          <strong data-score data-mcp-metric="score">0</strong>
        </div>
        <div>
          <span>完美</span>
          <strong data-perfect data-mcp-metric="perfect">0</strong>
        </div>
        <div>
          <span>连击</span>
          <strong data-combo data-mcp-metric="combo">0</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工叠塔</p>
          <h1 data-status>${statusText()}</h1>
          <p class="status-detail" data-detail>点击或触控落下方块</p>
        </div>
        <div class="count-card">
          <span>当前高度</span>
          <strong data-height>1 层</strong>
        </div>
      </section>

      <section class="scene-panel" aria-label="叠塔画面">
        <canvas id="stack-canvas" aria-label="湖工叠塔游戏画面"></canvas>
      </section>

      <section class="control-panel">
        <button id="drop-button" class="primary-action" type="button">落下</button>
        <button id="restart-button" class="secondary-action" type="button">重新开始</button>
        ${rankEnabled ? '<button id="leaderboard-button" class="secondary-action" type="button">排行榜</button>' : ''}
      </section>

      <div id="submit-status" class="submit-status" aria-live="polite"></div>

      <section class="log-panel" aria-label="叠塔记录">
        <div class="log-heading">
          <strong>叠塔记录</strong>
          <span data-log-scope>教学楼层</span>
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

  canvas = document.getElementById('stack-canvas')
  ctx = canvas.getContext('2d')

  document.getElementById('drop-button')?.addEventListener('click', dropNow)
  document.getElementById('restart-button')?.addEventListener('click', () => {
    state = restartStackGame({ seed: Date.now() % 100000 })
    currentRunId = createRunId()
    runStartedAt = Date.now()
    lastTerminalStatus = ''
    submitPending = null
    showSubmitStatus('')
    lastFrame = performance.now()
    updateUi()
  })
  canvas?.addEventListener('pointerdown', (event) => {
    event.preventDefault()
    dropNow()
  })
  setupLeaderboard()
  resizeCanvas()
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

function drawScene() {
  if (!ctx || !canvas) return
  const w = canvas.width
  const h = canvas.height
  const scaleX = w / WORLD_WIDTH
  const scaleY = Math.min(scaleX, h / 180)
  const blockH = BLOCK_HEIGHT * scaleY
  const groundY = h * 0.88
  // 相机：塔升高时把「移动层」固定在视口上部，避免高层冲出画布
  const cameraOffsetY = computeCameraOffsetY({
    blockCount: state.blocks.length,
    blockHeightPx: blockH,
    viewportHeight: h,
    groundY,
    focusRatio: 0.36
  })
  const gy = groundY + cameraOffsetY

  ctx.clearRect(0, 0, w, h)
  const sky = ctx.createLinearGradient(0, 0, 0, h)
  sky.addColorStop(0, '#cfe8ff')
  sky.addColorStop(0.45, '#eef7f2')
  sky.addColorStop(1, '#d5e8db')
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, w, h)

  // 远景软装饰
  ctx.fillStyle = 'rgba(37, 99, 235, 0.08)'
  ctx.beginPath()
  ctx.ellipse(w * 0.18, h * 0.22, w * 0.16, h * 0.05, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.fillStyle = 'rgba(15, 118, 110, 0.1)'
  ctx.beginPath()
  ctx.ellipse(w * 0.78, h * 0.28, w * 0.2, h * 0.06, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.fillStyle = 'rgba(35, 95, 118, 0.16)'
  ctx.fillRect(0, gy, w, Math.max(0, h - gy + 4))
  ctx.fillStyle = 'rgba(255,255,255,0.35)'
  ctx.fillRect(0, gy, w, 2)

  const maxVisible = Math.max(8, Math.floor((gy - h * 0.08) / blockH) + 2)
  const visible = state.blocks.slice(-maxVisible)
  const startIndex = Math.max(0, state.blocks.length - visible.length)

  visible.forEach((block, i) => {
    const layerFromBottom = startIndex + i
    const y = gy - (layerFromBottom + 1) * blockH
    const x = block.left * scaleX
    const bw = block.width * scaleX
    const bh = blockH * 0.92
    const grad = ctx.createLinearGradient(x, y, x, y + bh)
    if (block.perfect) {
      grad.addColorStop(0, '#3ecf8e')
      grad.addColorStop(1, '#1f9b63')
    } else if (layerFromBottom % 2 === 0) {
      grad.addColorStop(0, '#3b82f6')
      grad.addColorStop(1, '#1d4ed8')
    } else {
      grad.addColorStop(0, '#2563eb')
      grad.addColorStop(1, '#1e3a8a')
    }
    ctx.fillStyle = grad
    roundRect(ctx, x, y, bw, bh, Math.min(6, bh * 0.25))
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.stroke()
    if (block.label && bw > 28 * scaleX) {
      ctx.fillStyle = 'rgba(255,255,255,0.9)'
      ctx.font = `${Math.max(9, Math.min(12, bh * 0.55))}px "Microsoft YaHei", sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(block.label).slice(0, 6), x + bw / 2, y + bh / 2)
    }
  })

  if (state.moving && state.status === 'playing') {
    const topLayer = state.blocks.length
    const y = gy - (topLayer + 1) * blockH
    const x = state.moving.left * scaleX
    const bw = state.moving.width * scaleX
    const bh = blockH * 0.92
    const grad = ctx.createLinearGradient(x, y, x, y + bh)
    grad.addColorStop(0, '#fb923c')
    grad.addColorStop(1, '#ea580c')
    ctx.fillStyle = grad
    roundRect(ctx, x, y, bw, bh, Math.min(6, bh * 0.25))
    ctx.fill()
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 1.5
    ctx.stroke()
    ctx.lineWidth = 1
  }

  if (state.status === 'lost') {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)'
    ctx.fillRect(0, 0, w, h)
    ctx.fillStyle = '#fff'
    ctx.font = `600 ${Math.max(16, 18 * scaleY)}px "Microsoft YaHei", sans-serif`
    ctx.textAlign = 'center'
    ctx.fillText('挑战结束', w / 2, h * 0.42)
    ctx.font = `${Math.max(12, 13 * scaleY)}px "Microsoft YaHei", sans-serif`
    ctx.fillText(`得分 ${state.score} · ${state.layers} 层`, w / 2, h * 0.5)
  }
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.arcTo(x + w, y, x + w, y + h, radius)
  ctx.arcTo(x + w, y + h, x, y + h, radius)
  ctx.arcTo(x, y + h, x, y, radius)
  ctx.arcTo(x, y, x + w, y, radius)
  ctx.closePath()
}

function updateUi() {
  app.querySelector('[data-layers]').textContent = String(state.layers)
  app.querySelector('[data-score]').textContent = String(state.score)
  app.querySelector('[data-perfect]').textContent = String(state.perfectCount)
  app.querySelector('[data-combo]').textContent = String(state.perfectCombo)
  app.querySelector('[data-status]').textContent = statusText()
  app.querySelector('[data-detail]').textContent =
    state.status === 'lost'
      ? `最终 ${state.layers} 层，得分 ${state.score}`
      : '点击或触控落下方块'
  app.querySelector('[data-height]').textContent = `${state.layers + 1} 层`
  app.querySelector('[data-log]').innerHTML = (state.log || []).map((item) => `<li>${item}</li>`).join('')
  const dropButton = document.getElementById('drop-button')
  if (dropButton) {
    dropButton.disabled = state.status !== 'playing'
    dropButton.textContent = state.status === 'lost' ? '已结束' : '落下'
  }
  drawScene()
}

function tick(now) {
  const delta = now - lastFrame
  lastFrame = now
  if (state.status === 'playing') {
    state = tickMovingBlock(state, delta)
    drawScene()
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
updateUi()
requestAnimationFrame(tick)
