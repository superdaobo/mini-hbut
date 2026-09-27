import './style.css'
import { GameManager } from './game/GameManager.js'
import { MiniHBUTGame } from '../../../_sdk/src/index.js'
import { HBUT_2048_ADAPTER } from './utils/game_sdk_adapter.js'

// 模块宿主高度桥接：通知父 iframe 当前页面实际高度
function notifyHostHeight() {
  if (typeof window === 'undefined' || window.parent === window) return
  const height = Math.max(
    document.documentElement.scrollHeight,
    document.documentElement.offsetHeight,
    document.body.scrollHeight,
    document.body.offsetHeight
  )
  window.parent.postMessage({
    type: 'mini-hbut:module-size',
    moduleId: 'hbut_2048',
    module_id: 'hbut_2048',
    height
  }, '*')
}

const MODULE_ID = 'hbut_2048'

// SDK 句柄：同步创建（Host 握手 / ticket 兑换在后台进行），不阻塞渲染与玩法
const sdkGame = MiniHBUTGame.create({ gameId: MODULE_ID, adapter: HBUT_2048_ADAPTER })
// 同步预判能力：有 ticket 或旧版上下文（student_id + rank_api）时为 true，行为与旧 canUseGameRank 一致
let rankEnabled = sdkGame.capabilities.canSubmit
let leaderboardAvailable = sdkGame.capabilities.leaderboard

// run 生命周期由 SDK 管理（run_id 生成、幂等、降级、pending 重试）；加载即开局
let run = sdkGame.startRun()
let gameManager = null
let submitPending = false // 是否有待重试的提交（payload 由 SDK 冻结复用，不再自己保存）

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

// 游戏结束回调（只在无步可走时由 GameManager 触发）
async function handleGameEnd(result) {
  if (!rankEnabled) return

  // 字段与迁移前逐字一致（仅去掉 runId：run_id 由 SDK 生成并保证幂等）
  const payload = {
    score: result.score,
    maxLevel: result.maxTile,
    durationMs: result.durationMs,
    moveCount: result.moveCount,
    endedReason: result.won ? 'win' : 'game_over',
    extra: { maxTile: result.maxTile }
  }

  submitPending = true
  showSubmitStatus('uploading')

  try {
    // SDK 负责幂等、降级与重试；同一 run 只允许一份 payload
    const outcome = await run.finish(payload)
    if (outcome.success) {
      submitPending = false
      // standalone（本地记录，未上传）不显示「✓ 成绩已上传」，也不显示失败（与旧代码无排行上下文时一致）
      showSubmitStatus(outcome.uploaded === false ? '' : 'success')
    } else {
      console.error('排行榜提交失败:', outcome.error?.code || outcome.message)
      showSubmitStatus('failed')
    }
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
    // SDK 复用同一 run 的 pending payload（字节级一致，服务端 content_hash 稳定）
    const outcome = await run.retry()
    if (outcome.success) {
      submitPending = false
      showSubmitStatus('success')
    } else {
      console.error('排行榜重试失败:', outcome.error?.code || outcome.message)
      showSubmitStatus('failed')
    }
  } catch (err) {
    console.error('排行榜重试失败:', err)
    showSubmitStatus('failed')
  }
}

/** 排行榜可用性跟随最终模式（standalone 时隐藏入口） */
function applyRankAvailability() {
  const button = document.getElementById('leaderboard-button')
  if (button) button.hidden = !leaderboardAvailable
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
      if (!leaderboardAvailable) return
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
    // SDK 统一榜单读取：verified 走 V2 榜，compatibility 走经典榜，失败自动降级
    const data = await sdkGame.leaderboard({ scope, limit: 20 })
    if (!data.success) {
      // 异常文本只允许经 textContent 写入，避免被当作 HTML 解释（CodeQL js/xss-through-exception）
      content.innerHTML = '<div class="leaderboard-error"></div>'
      const errorBox = content.firstElementChild
      if (errorBox) errorBox.textContent = `加载失败: ${data.message || '未知错误'}`
      return
    }
    renderLeaderboard(data, scope)
  } catch (err) {
    // 异常文本只允许经 textContent 写入，避免 err.message 被当作 HTML 解释（CodeQL js/xss-through-exception）
    content.innerHTML = '<div class="leaderboard-error"></div>'
    const errorBox = content.firstElementChild
    if (errorBox) errorBox.textContent = `加载失败: ${err.message}`
  }
}

function renderLeaderboard(data, scope) {
  const content = document.getElementById('leaderboard-content')
  // SDK 归一化条目：rank / player_name / class_name / score / total_score / is_self
  const list = Array.isArray(data.entries) ? data.entries : []

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
      ? (item.class_name || '未知班级')
      : (item.player_name || '匿名')
    const score = isClassTotal
      ? (item.total_score ?? item.score ?? 0)
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

  // 显示自己的排名（经典榜响应仍带 my_rank；V2 榜无该字段时不显示）
  const myRank = data.raw?.my_rank || data.raw?.myRank
  if (myRank) {
    html += `<div class="my-rank">我的排名: 第 ${myRank.rank || '?'} 名 (${myRank.score || 0} 分)</div>`
  }

  content.innerHTML = html
}

// 监听新游戏（重开 = 新 run）
function setupRestartHook() {
  const btn = document.getElementById('restart-button')
  if (btn) {
    btn.addEventListener('click', () => {
      // 新一局 = 新 run_id（旧 run 未结算的成绩随旧 run 丢弃，与既有行为一致）
      run = sdkGame.startRun({ replaceActive: true })
      submitPending = false
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

  // 通知宿主当前页面高度
  requestAnimationFrame(() => {
    notifyHostHeight()
    // 延迟再通知一次（等 DOM 完全渲染）
    setTimeout(notifyHostHeight, 300)
  })
}

// DOM 就绪后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}

// 窗口 resize 时也通知高度
window.addEventListener('resize', () => {
  requestAnimationFrame(notifyHostHeight)
})

// 模式判定（Host 握手 / ticket 兑换）完成后刷新排行可用性：只影响入口显隐与提交判定，不阻塞玩法
void sdkGame.ready.then(() => {
  rankEnabled = sdkGame.capabilities.canSubmit
  leaderboardAvailable = sdkGame.capabilities.leaderboard
  applyRankAvailability()
})
