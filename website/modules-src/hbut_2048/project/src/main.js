import './style.css'
import { GameManager } from './game/GameManager.js'
import {
  readGameModuleContext,
  canUseGameRank,
  submitGameRank,
  fetchGameLeaderboard,
  createRunId
} from './utils/game_rank.js'

// 初始化模块上下文
const moduleContext = readGameModuleContext()
const rankEnabled = canUseGameRank(moduleContext)

let currentRunId = createRunId()
let gameManager = null
let submitPending = null // 保存待重试的提交数据

// 构建页面 DOM
function buildUI() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="container">
      <header class="header">
        <div class="header-top">
          <h1 class="title">2048 <span class="subtitle">湖工大版</span></h1>
          <div class="scores-container">
            <div class="score-box">
              <div class="score-label">分数</div>
              <div class="score-value" id="score-value">0</div>
            </div>
            <div class="score-box">
              <div class="score-label">最高</div>
              <div class="score-value" id="best-value">0</div>
            </div>
          </div>
        </div>
        <div class="header-actions">
          <button id="restart-button" class="btn btn-new-game">新游戏</button>
          ${rankEnabled ? '<button id="leaderboard-button" class="btn btn-rank">🏆 排行榜</button>' : ''}
        </div>
        ${rankEnabled ? `<div class="rank-info" id="rank-info"></div>` : ''}
        <div class="submit-status" id="submit-status"></div>
      </header>

      <div id="game-container" class="game-container">
        <div class="grid-container">
          <div class="grid-row">
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
          </div>
          <div class="grid-row">
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
          </div>
          <div class="grid-row">
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
          </div>
          <div class="grid-row">
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
            <div class="grid-cell"></div>
          </div>
        </div>
        <div class="tile-container"></div>
        <div class="game-message" style="display:none">
          <p class="message-text"></p>
          <div class="message-actions">
            <button id="keep-playing-button" class="btn btn-keep">继续挑战</button>
            <button class="btn btn-retry" onclick="document.getElementById('restart-button').click()">再来一局</button>
          </div>
        </div>
      </div>

      <div class="game-explanation">
        <p>使用 <strong>方向键</strong> 或 <strong>滑动屏幕</strong> 移动方块。相同数字的方块碰撞时会合并！</p>
      </div>
    </div>

    <!-- 排行榜弹窗 -->
    <div class="leaderboard-overlay" id="leaderboard-overlay" style="display:none">
      <div class="leaderboard-modal">
        <div class="leaderboard-header">
          <h2>🏆 排行榜</h2>
          <button class="leaderboard-close" id="leaderboard-close">&times;</button>
        </div>
        <div class="leaderboard-tabs">
          <button class="tab-btn active" data-scope="class">班级榜</button>
          <button class="tab-btn" data-scope="school">全校榜</button>
          <button class="tab-btn" data-scope="class_total">班级总分榜</button>
        </div>
        <div class="leaderboard-content" id="leaderboard-content">
          <div class="leaderboard-loading">加载中...</div>
        </div>
      </div>
    </div>
  `
}

// 分数变化回调
function handleScoreChange(score, maxTile) {
  // 分数由 HTMLActuator 直接更新 DOM
}

// 游戏结束回调
async function handleGameEnd(result) {
  if (!rankEnabled) return

  const payload = {
    runId: currentRunId,
    score: result.score,
    maxLevel: result.maxTile,
    durationMs: result.durationMs,
    moveCount: result.moveCount,
    endedReason: result.won ? 'win' : 'game_over',
    extra: { maxTile: result.maxTile }
  }

  submitPending = payload
  showSubmitStatus('uploading')

  try {
    await submitGameRank(moduleContext, payload)
    submitPending = null
    showSubmitStatus('success')
  } catch (err) {
    console.error('排行榜提交失败:', err)
    showSubmitStatus('failed')
  }
}

// 重试提交
async function retrySubmit() {
  if (!submitPending) return
  showSubmitStatus('uploading')
  try {
    await submitGameRank(moduleContext, submitPending)
    submitPending = null
    showSubmitStatus('success')
  } catch (err) {
    console.error('排行榜重试失败:', err)
    showSubmitStatus('failed')
  }
}

// 显示提交状态
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
      setTimeout(() => { el.textContent = ''; el.className = 'submit-status' }, 3000)
      break
    case 'failed':
      el.textContent = '上传失败，点此重试'
      el.className = 'submit-status failed'
      el.onclick = retrySubmit
      break
    default:
      el.textContent = ''
      el.className = 'submit-status'
      el.onclick = null
  }
}

// 排行榜相关
let currentScope = 'class'

function setupLeaderboard() {
  if (!rankEnabled) return

  const overlay = document.getElementById('leaderboard-overlay')
  const openBtn = document.getElementById('leaderboard-button')
  const closeBtn = document.getElementById('leaderboard-close')
  const tabs = document.querySelectorAll('.tab-btn')

  if (openBtn) {
    openBtn.addEventListener('click', () => {
      overlay.style.display = 'flex'
      loadLeaderboard(currentScope)
    })
  }

  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      overlay.style.display = 'none'
    })
  }

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.style.display = 'none'
    }
  })

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'))
      tab.classList.add('active')
      currentScope = tab.dataset.scope
      loadLeaderboard(currentScope)
    })
  })
}

async function loadLeaderboard(scope) {
  const content = document.getElementById('leaderboard-content')
  content.innerHTML = '<div class="leaderboard-loading">加载中...</div>'

  try {
    const data = await fetchGameLeaderboard(moduleContext, { scope, limit: 20 })
    renderLeaderboard(data, scope)
  } catch (err) {
    content.innerHTML = `<div class="leaderboard-error">加载失败: ${err.message}</div>`
  }
}

function renderLeaderboard(data, scope) {
  const content = document.getElementById('leaderboard-content')
  const list = data.leaderboard || data.data || []

  if (!list.length) {
    content.innerHTML = '<div class="leaderboard-empty">暂无数据</div>'
    return
  }

  const isClassTotal = scope === 'class_total'
  let html = '<div class="leaderboard-list">'

  list.forEach((item, index) => {
    const rank = index + 1
    const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`
    const name = isClassTotal
      ? (item.class_name || item.className || '未知班级')
      : (item.player_name || item.playerName || '匿名')
    const score = isClassTotal
      ? (item.total_score || item.totalScore || 0)
      : (item.score || 0)

    html += `
      <div class="leaderboard-item ${rank <= 3 ? 'top-three' : ''}">
        <span class="rank-badge">${medal}</span>
        <span class="rank-name">${name}</span>
        <span class="rank-score">${score}</span>
      </div>
    `
  })

  html += '</div>'

  // 显示自己的排名
  if (data.my_rank || data.myRank) {
    const myRank = data.my_rank || data.myRank
    html += `<div class="my-rank">我的排名: 第 ${myRank.rank || '?'} 名 (${myRank.score || 0} 分)</div>`
  }

  content.innerHTML = html
}

// 监听新游戏（重置 runId）
function setupRestartHook() {
  const btn = document.getElementById('restart-button')
  if (btn) {
    btn.addEventListener('click', () => {
      currentRunId = createRunId()
      submitPending = null
      showSubmitStatus('')
    })
  }
}

// 初始化
function init() {
  buildUI()
  setupLeaderboard()
  setupRestartHook()

  // 初始化最高分显示
  const bestEl = document.getElementById('best-value')
  if (bestEl) {
    bestEl.textContent = localStorage.getItem('hbut_2048_best') || '0'
  }

  // 启动游戏
  gameManager = new GameManager(4, handleScoreChange, handleGameEnd)
}

// DOM 就绪后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
