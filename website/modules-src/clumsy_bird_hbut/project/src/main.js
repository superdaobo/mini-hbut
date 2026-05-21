/**
 * 笨鸟先飞 - 主入口
 * 构建 UI、初始化游戏、集成排行榜
 */
import './style.css'
import FlappyGame from './game/FlappyGame.js'
import {
  readGameModuleContext,
  canUseGameRank,
  submitGameRank,
  fetchGameLeaderboard,
  createRunId
} from './utils/game_rank.js'

const MODULE_ID = 'clumsy_bird_hbut'
let syncTimer = null
let sizeObserver = null

function setModuleViewportVars() {
  if (typeof window === 'undefined') return
  const viewportHeight = window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight || 0
  const viewportWidth = window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth || 0
  if (viewportHeight > 0) {
    document.documentElement.style.setProperty('--module-vh', `${viewportHeight * 0.01}px`)
  }
  if (viewportWidth > 0) {
    document.documentElement.style.setProperty('--module-vw', `${viewportWidth * 0.01}px`)
  }
}

// 模块宿主高度桥接
function notifyHostHeight() {
  if (typeof window === 'undefined' || window.parent === window) return
  const height = Math.max(
    window.visualViewport?.height || 0,
    window.innerHeight || 0,
    document.documentElement.clientHeight,
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight,
    document.body.scrollHeight,
    document.body.offsetHeight
  )
  window.parent.postMessage({
    type: 'mini-hbut:module-size',
    moduleId: MODULE_ID,
    module_id: MODULE_ID,
    height
  }, '*')
}

function syncModuleFrame() {
  setModuleViewportVars()
  notifyHostHeight()
}

function scheduleModuleFrameSync() {
  if (typeof window === 'undefined') return
  if (syncTimer) window.clearTimeout(syncTimer)
  window.requestAnimationFrame(syncModuleFrame)
  syncTimer = window.setTimeout(syncModuleFrame, 180)
}

// ========== 全局状态 ==========
let game = null
let moduleContext = null
let currentRunId = createRunId()
let pendingSubmit = null // 用于重试

// ========== DOM 构建 ==========
function buildUI() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="game-header">
      <span class="title">笨鸟先飞 · 湖工飞行训练</span>
      <div class="scores">
        <span>分数: <span class="current" id="score-display">0</span></span>
        <span>最高: <span id="best-display">0</span></span>
      </div>
      <button class="rank-btn" id="rank-btn">排行榜</button>
    </div>
    <div class="game-canvas-wrapper">
      <canvas id="game-canvas"></canvas>
    </div>
    <div class="leaderboard-overlay" id="leaderboard-overlay">
      <div class="leaderboard-modal">
        <div class="leaderboard-header">
          <h3>排行榜</h3>
          <button class="leaderboard-close" id="leaderboard-close">✕</button>
        </div>
        <div class="leaderboard-tabs">
          <button class="active" data-scope="class">班级榜</button>
          <button data-scope="school">全校榜</button>
          <button data-scope="class_total">班级总分榜</button>
        </div>
        <div class="leaderboard-content" id="leaderboard-content">
          <div class="leaderboard-empty">暂无数据</div>
        </div>
      </div>
    </div>
    <div class="upload-status" id="upload-status"></div>
  `
}

// ========== 分数显示更新 ==========
function updateScoreDisplay(score) {
  const el = document.getElementById('score-display')
  if (el) el.textContent = score
}

function updateBestDisplay(best) {
  const el = document.getElementById('best-display')
  if (el) el.textContent = best
}

// ========== 上传状态提示 ==========
function showUploadStatus(message, type = 'success') {
  const el = document.getElementById('upload-status')
  if (!el) return
  el.textContent = message
  el.className = `upload-status show ${type}`

  if (type === 'success') {
    setTimeout(() => {
      el.className = 'upload-status'
    }, 2500)
  }
}

function hideUploadStatus() {
  const el = document.getElementById('upload-status')
  if (el) el.className = 'upload-status'
}

// ========== 排行榜提交 ==========
async function submitScore(data) {
  if (!canUseGameRank(moduleContext)) return

  const payload = {
    runId: currentRunId,
    score: data.score,
    maxLevel: data.bestScore,
    durationMs: data.durationMs,
    moveCount: data.flapCount,
    endedReason: 'collision'
  }

  pendingSubmit = payload

  try {
    await submitGameRank(moduleContext, payload)
    pendingSubmit = null
    showUploadStatus('成绩已上传', 'success')
  } catch (err) {
    console.warn('排行榜提交失败:', err)
    showUploadStatus('上传失败，点此重试', 'error')
  }
}

// ========== 排行榜展示 ==========
let currentScope = 'class'

function openLeaderboard() {
  const overlay = document.getElementById('leaderboard-overlay')
  if (overlay) {
    overlay.classList.add('active')
    loadLeaderboard(currentScope)
  }
}

function closeLeaderboard() {
  const overlay = document.getElementById('leaderboard-overlay')
  if (overlay) overlay.classList.remove('active')
}

async function loadLeaderboard(scope) {
  currentScope = scope
  const content = document.getElementById('leaderboard-content')
  if (!content) return

  // 更新标签页激活状态
  const tabs = document.querySelectorAll('.leaderboard-tabs button')
  tabs.forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.scope === scope)
  })

  if (!canUseGameRank(moduleContext)) {
    content.innerHTML = '<div class="leaderboard-empty">排行榜不可用（缺少用户信息）</div>'
    return
  }

  content.innerHTML = '<div class="leaderboard-loading">加载中...</div>'

  try {
    const result = await fetchGameLeaderboard(moduleContext, { scope, limit: 20 })
    const list = result.leaderboard || result.data || []

    if (!list.length) {
      content.innerHTML = '<div class="leaderboard-empty">暂无数据</div>'
      return
    }

    const html = list.map((item, index) => `
      <li class="rank-item">
        <span class="rank-num">${index + 1}</span>
        <div class="rank-info">
          <div class="rank-name">${escapeHtml(item.player_name || item.student_id || '匿名')}</div>
          <div class="rank-class">${escapeHtml(item.class_name || '')}</div>
        </div>
        <span class="rank-score">${item.score ?? 0}</span>
      </li>
    `).join('')

    content.innerHTML = `<ul class="rank-list">${html}</ul>`
  } catch (err) {
    console.warn('排行榜加载失败:', err)
    content.innerHTML = `<div class="leaderboard-error">加载失败，点击重试</div>`
    content.querySelector('.leaderboard-error')?.addEventListener('click', () => {
      loadLeaderboard(scope)
    })
  }
}

function escapeHtml(str) {
  const div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

// ========== 事件绑定 ==========
function bindEvents() {
  // 排行榜按钮
  document.getElementById('rank-btn')?.addEventListener('click', (e) => {
    e.stopPropagation()
    openLeaderboard()
  })

  // 关闭排行榜
  document.getElementById('leaderboard-close')?.addEventListener('click', closeLeaderboard)

  // 点击遮罩关闭
  document.getElementById('leaderboard-overlay')?.addEventListener('click', (e) => {
    if (e.target.id === 'leaderboard-overlay') closeLeaderboard()
  })

  // 排行榜标签页切换
  document.querySelectorAll('.leaderboard-tabs button').forEach((tab) => {
    tab.addEventListener('click', () => {
      loadLeaderboard(tab.dataset.scope)
    })
  })

  // 上传失败重试
  document.getElementById('upload-status')?.addEventListener('click', async () => {
    if (!pendingSubmit) return
    hideUploadStatus()
    try {
      await submitGameRank(moduleContext, pendingSubmit)
      pendingSubmit = null
      showUploadStatus('成绩已上传', 'success')
    } catch (err) {
      showUploadStatus('上传失败，点此重试', 'error')
    }
  })
}

// ========== 初始化 ==========
function init() {
  setModuleViewportVars()

  // 读取模块上下文
  moduleContext = readGameModuleContext()

  // 构建 UI
  buildUI()

  // 初始化游戏
  const canvas = document.getElementById('game-canvas')
  game = new FlappyGame(canvas)

  // 更新最高分显示
  updateBestDisplay(game.getBestScore())

  // 游戏事件回调
  game.onScoreChange = (score) => {
    updateScoreDisplay(score)
  }

  game.onGameOver = (data) => {
    updateBestDisplay(data.bestScore)
    submitScore(data)
  }

  game.onStateChange = (state) => {
    if (state === 'playing') {
      currentRunId = createRunId()
      pendingSubmit = null
      hideUploadStatus()
    }
    if (state === 'ready') {
      updateScoreDisplay(0)
    }
  }

  // 绑定 UI 事件
  bindEvents()

  // 启动游戏循环
  game.start()

  // 通知宿主当前页面高度
  scheduleModuleFrameSync()
}

// 启动
init()

// 窗口 resize 时也通知高度
window.addEventListener('resize', scheduleModuleFrameSync, { passive: true })
window.addEventListener('orientationchange', scheduleModuleFrameSync, { passive: true })
window.visualViewport?.addEventListener('resize', scheduleModuleFrameSync, { passive: true })

if (typeof ResizeObserver !== 'undefined') {
  sizeObserver = new ResizeObserver(scheduleModuleFrameSync)
  sizeObserver.observe(document.documentElement)
  if (document.body) sizeObserver.observe(document.body)
}

window.addEventListener('beforeunload', () => {
  if (syncTimer) window.clearTimeout(syncTimer)
  sizeObserver?.disconnect()
})
