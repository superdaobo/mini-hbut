import './style.css'
import {
  PARKING_LEVELS,
  applyDirectionInput,
  computeParkingScore,
  createInitialParkingState,
  directionFromKey,
  restartParkingGame,
  selectVehicle,
  vehicleCells
} from './game/parking.js'
import { MiniHBUTGame, readLegacyModuleContext } from '../../../_sdk/src/index.js'
import { HBUT_PARKING_ADAPTER } from './utils/game_sdk_adapter.js'

const MODULE_ID = 'hbut_parking'
const app = document.getElementById('app')

// SDK 句柄：同步创建（Host 握手 / ticket 兑换在后台进行），不阻塞渲染与玩法
const sdkGame = MiniHBUTGame.create({ gameId: MODULE_ID, adapter: HBUT_PARKING_ADAPTER })
// 同步预判能力：有 ticket 或旧版上下文（student_id + rank_api）时为 true，行为与旧 canUseGameRank 一致
let rankEnabled = sdkGame.capabilities.canSubmit
let leaderboardAvailable = sdkGame.capabilities.leaderboard
// 班级上下文只用于选择默认榜单 scope（展示用途，不参与身份判定）
const launchContext = readLegacyModuleContext({ gameId: MODULE_ID })

let state = createInitialParkingState({ levelIndex: 0 })
// run 生命周期由 SDK 管理（run_id 生成、幂等、降级、pending 重试）
let run = sdkGame.startRun()
let lastTerminalStatus = ''
let lastSubmitUiStatus = ''
let currentLeaderboardScope = launchContext.className ? 'class' : 'school'

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
  return Math.max(0, Date.now() - run.startedAt)
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

function showSubmitStatus(status, text = '') {
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
      el.textContent = text || '✓ 成绩已上传'
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
      el.textContent = text || '上传失败，点此重试'
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

/** 结算后统一更新提交状态（SDK 已把三种模式归一为同一 outcome） */
function applySubmitOutcome(outcome) {
  rankEnabled = sdkGame.capabilities.canSubmit
  leaderboardAvailable = sdkGame.capabilities.leaderboard
  applyRankAvailability()
  if (outcome?.success) {
    showSubmitStatus('success', outcome.uploaded ? '✓ 成绩已上传' : outcome.message || '成绩已记录')
    return
  }
  showSubmitStatus('failed', outcome?.retryable ? '上传失败，点此重试' : '本局成绩仅本地保留')
}

async function submitTerminalScore(endedReason) {
  if (!rankEnabled) return
  // durationMs 只取一次并复用：score 公式与 duration_ms 字段必须来自同一时刻（旧代码调用了两次）
  const duration = durationMs()
  showSubmitStatus('uploading')
  try {
    // 只有通关（won）会走到这里；一个 run 只允许一份 payload，重复 finish 不发第二次请求
    const outcome = await run.finish({
      score: computeParkingScore({
        clearedLevels: state.clearedLevels,
        totalSteps: state.totalSteps,
        durationMs: duration
      }),
      maxLevel: state.clearedLevels || state.levelNumber || 1,
      durationMs: duration,
      moveCount: state.totalSteps,
      endedReason,
      extra: {
        clearedLevels: state.clearedLevels,
        totalSteps: state.totalSteps,
        levelIndex: state.levelIndex
      }
    })
    applySubmitOutcome(outcome)
  } catch (error) {
    console.warn('[hbut_parking] rank submit failed', error?.code || error)
    showSubmitStatus('failed')
  }
}

async function retrySubmit() {
  if (!rankEnabled || !run) return
  showSubmitStatus('uploading')
  try {
    // SDK 内部复用同一 pending payload，保证服务端 content_hash 稳定
    applySubmitOutcome(await run.retry())
  } catch (error) {
    console.warn('[hbut_parking] rank retry failed', error?.code || error)
    showSubmitStatus('failed')
  }
}

/** 排行榜可用性跟随最终模式（standalone 时隐藏入口） */
function applyRankAvailability() {
  const button = document.getElementById('leaderboard-button')
  if (button) button.hidden = !leaderboardAvailable
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
    // SDK 统一榜单读取：verified 走 V2 榜，compatibility 走经典榜，失败自动降级
    const data = await sdkGame.leaderboard({ scope, limit: 20 })
    const list = data.entries || []
    if (!data.success && data.message) {
      content.innerHTML = '<div class="leaderboard-empty"></div>'
      const box = content.firstElementChild
      if (box) box.textContent = data.message
      return
    }
    if (!list.length) {
      content.innerHTML = '<div class="leaderboard-empty">暂无数据</div>'
      return
    }
    const isClassTotal = scope === 'class_total'
    content.innerHTML = `<div class="leaderboard-list">${list
      .map((item, index) => {
        const rank = item.rank || index + 1
        const name = item.display_name || (isClassTotal ? '未知班级' : '匿名')
        const score = isClassTotal ? item.total_score ?? 0 : item.score ?? 0
        return `<div class="leaderboard-item"><span class="rank-badge">${rank}</span><span class="rank-name">${name}</span><span class="rank-score">${score}</span></div>`
      })
      .join('')}</div>`
  } catch (error) {
    // 异常文本只允许经 textContent 写入，避免 error.message 被当作 HTML 解释（CodeQL js/xss-through-exception）
    content.innerHTML = '<div class="leaderboard-error"></div>'
    const errorBox = content.firstElementChild
    if (errorBox) errorBox.textContent = `加载失败: ${error?.message || '未知错误'}`
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

/**
 * 用百分比绝对定位车辆，避免 CSS grid 跨格在重绘时出现「压扁/不动」错觉。
 */
function vehicleStyle(vehicle) {
  const cells = vehicleCells(vehicle)
  const rows = cells.map((c) => c.row)
  const cols = cells.map((c) => c.col)
  const r0 = Math.min(...rows)
  const c0 = Math.min(...cols)
  const r1 = Math.max(...rows)
  const c1 = Math.max(...cols)
  const w = Math.max(1, state.width)
  const h = Math.max(1, state.height)
  const left = (c0 / w) * 100
  const top = (r0 / h) * 100
  const width = ((c1 - c0 + 1) / w) * 100
  const height = ((r1 - r0 + 1) / h) * 100
  return `left:${left}%;top:${top}%;width:${width}%;height:${height}%;`
}

function exitStyle() {
  const w = Math.max(1, state.width)
  const h = Math.max(1, state.height)
  const left = (state.exit.col / w) * 100
  const top = (state.exit.row / h) * 100
  const width = (1 / w) * 100
  const height = (1 / h) * 100
  return `left:${left}%;top:${top}%;width:${width}%;height:${height}%;`
}

function renderBoard() {
  const vehiclesHtml = state.vehicles
    .map((vehicle) => {
      const selected = state.selectedId === vehicle.id ? 'selected' : ''
      const target = vehicle.target ? 'target' : ''
      const axis = vehicle.orientation === 'h' ? 'h' : 'v'
      return `<button type="button" class="vehicle ${selected} ${target} axis-${axis}" data-vehicle-id="${vehicle.id}" data-axis="${axis}" style="${vehicleStyle(vehicle)}" aria-label="${vehicle.label}">${vehicle.label}</button>`
    })
    .join('')
  return `
    <div class="board-grid" style="--cols:${state.width};--rows:${state.height}">
      <div class="board-cells" aria-hidden="true">
      ${Array.from({ length: state.width * state.height })
        .map(() => '<span class="cell"></span>')
        .join('')}
      </div>
      <span class="exit-marker" style="${exitStyle()}">出</span>
      ${vehiclesHtml}
    </div>
  `
}

function handleDirection(dir) {
  const result = applyDirectionInput(state, dir)
  state = result.state
  afterChange()
}

function render() {
  app.innerHTML = `
    <main class="parking-shell">
      <section class="metric-strip" aria-label="挪车状态">
        <div>
          <span>关卡</span>
          <strong data-mcp-metric="level">${state.levelNumber}/${state.totalLevels}</strong>
        </div>
        <div>
          <span>通关</span>
          <strong data-mcp-metric="cleared">${state.clearedLevels}</strong>
        </div>
        <div>
          <span>步数</span>
          <strong data-mcp-metric="steps">${state.totalSteps}</strong>
        </div>
        <div>
          <span>得分</span>
          <strong data-mcp-metric="score">${liveScore()}</strong>
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

  for (const button of app.querySelectorAll('[data-dir]')) {
    button.addEventListener('click', () => {
      handleDirection(button.dataset.dir)
    })
  }

  document.getElementById('restart-button')?.addEventListener('click', () => {
    state = restartParkingGame()
    // 新一局 = 新 run_id（旧 run 未结算的成绩随旧 run 丢弃，与既有行为一致）
    run = sdkGame.startRun({ replaceActive: true })
    lastTerminalStatus = ''
    lastSubmitUiStatus = ''
    showSubmitStatus('')
    afterChange()
  })

  setupLeaderboard()
  if (lastSubmitUiStatus) showSubmitStatus(lastSubmitUiStatus)
  notifyHostHeight()
}

function onKeyDown(event) {
  const dir = directionFromKey(event.key)
  if (!dir) return
  const tag = String(event.target?.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea') return
  event.preventDefault()
  handleDirection(dir)
}

window.addEventListener('keydown', onKeyDown)
window.addEventListener('resize', syncViewport)
window.addEventListener('orientationchange', syncViewport)
window.visualViewport?.addEventListener('resize', syncViewport)
if ('ResizeObserver' in window) {
  new ResizeObserver(syncViewport).observe(document.documentElement)
}

syncViewport()
render()

// 模式判定（Host 握手 / ticket 兑换）完成后刷新排行可用性：只影响入口显隐，不阻塞玩法
void sdkGame.ready.then(() => {
  rankEnabled = sdkGame.capabilities.canSubmit
  leaderboardAvailable = sdkGame.capabilities.leaderboard
  applyRankAvailability()
})
