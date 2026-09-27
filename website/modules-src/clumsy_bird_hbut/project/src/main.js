/**
 * 笨鸟先飞 - 主入口
 * 构建 UI、初始化游戏、集成排行榜
 */
import './style.css'
import FlappyGame from './game/FlappyGame.js'
import { MiniHBUTGame } from '../../../_sdk/src/index.js'
import { CLUMSY_BIRD_ADAPTER } from './utils/game_sdk_adapter.js'

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
  game?.resize()
  notifyHostHeight()
}

function scheduleModuleFrameSync() {
  if (typeof window === 'undefined') return
  if (syncTimer) window.clearTimeout(syncTimer)
  window.requestAnimationFrame(syncModuleFrame)
  syncTimer = window.setTimeout(syncModuleFrame, 180)
}

// ========== 全局状态 ==========
// SDK 句柄：同步创建（Host 握手 / ticket 兑换在后台进行），不阻塞渲染与玩法
const sdkGame = MiniHBUTGame.create({ gameId: MODULE_ID, adapter: CLUMSY_BIRD_ADAPTER })
// 同步预判能力：有 ticket 或旧版上下文（student_id + rank_api）时为 true，与旧 canUseGameRank 一致
let rankEnabled = sdkGame.capabilities.canSubmit
let leaderboardAvailable = sdkGame.capabilities.leaderboard
// run 生命周期由 SDK 管理（run_id 生成、幂等、降级、pending 重试）
let run = sdkGame.startRun()
let retryAvailable = false // 仅 SDK 判定 retryable 的失败才给「点此重试」入口
let game = null

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
/** 排行榜入口跟随最终模式（standalone 时隐藏；DOM 结构不变，仅切 hidden） */
function applyRankAvailability() {
  const button = document.getElementById('rank-btn')
  if (button) button.hidden = !leaderboardAvailable
}

/** 结算后统一更新提交状态（SDK 已把三种模式归一为同一 outcome） */
function applySubmitOutcome(outcome) {
  rankEnabled = sdkGame.capabilities.canSubmit
  leaderboardAvailable = sdkGame.capabilities.leaderboard
  applyRankAvailability()
  if (outcome?.success) {
    retryAvailable = false
    // standalone（本地记录）时给出 SDK 的中文说明，其余仍是既有的「成绩已上传」
    showUploadStatus(outcome.uploaded === false ? outcome.message : '成绩已上传', 'success')
    return
  }
  if (outcome?.retryable === true) {
    retryAvailable = true
    showUploadStatus('上传失败，点此重试', 'error')
    return
  }
  // 确定性失败（SCHEMA_INVALID / RUN_ALREADY_FINISHED 等）不再给重试入口
  retryAvailable = false
  showUploadStatus(outcome?.message || '本局成绩仅保留在本地', 'error')
}

async function submitScore(data) {
  if (!rankEnabled) return

  // 数值语义与迁移前逐字一致（仅 run_id/durationMs 交给 SDK）；maxLevel 是历史最高分（registry §4.4）
  const payload = {
    score: data.score,
    maxLevel: data.bestScore,
    durationMs: data.durationMs,
    moveCount: data.flapCount,
    endedReason: 'collision'
  }

  try {
    applySubmitOutcome(await run.finish(payload))
  } catch (err) {
    console.warn('排行榜提交失败:', err)
    retryAvailable = true
    showUploadStatus('上传失败，点此重试', 'error')
  }
}

async function retrySubmit() {
  if (!rankEnabled || !retryAvailable) return
  hideUploadStatus()
  try {
    // SDK 内部复用同一 pending payload，保证服务端 content_hash 稳定
    applySubmitOutcome(await run.retry())
  } catch (err) {
    console.warn('排行榜重试失败:', err)
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

  if (!leaderboardAvailable) {
    content.innerHTML = '<div class="leaderboard-empty">排行榜不可用（缺少用户信息）</div>'
    return
  }

  content.innerHTML = '<div class="leaderboard-loading">加载中...</div>'

  try {
    // SDK 统一榜单读取：verified 走 V2 榜，compatibility 走经典榜，失败自动降级
    const result = await sdkGame.leaderboard({ scope, limit: 20 })
    const list = result.entries || []

    if (!result.success) {
      content.innerHTML = '<div class="leaderboard-empty"></div>'
      const box = content.firstElementChild
      // 服务端文案只允许经 textContent 写入（禁止 innerHTML 插值）
      if (box) box.textContent = result.message || '排行榜加载失败'
      return
    }

    if (!list.length) {
      content.innerHTML = '<div class="leaderboard-empty">暂无数据</div>'
      return
    }

    const isClassTotal = scope === 'class_total'
    const html = list.map((item, index) => {
      const rank = item.rank || index + 1
      // 条目已由 SDK 去 PII 并解析展示名（学号绝不出现在榜单里）
      const name = item.display_name || (isClassTotal ? '未知班级' : '匿名')
      // class_total 的历史展示是「N 人」；SDK 归一化条目没有 player_count 时回落班级名
      const meta =
        isClassTotal && (item.player_count || item.playerCount)
          ? `${Number(item.player_count || item.playerCount)}人`
          : item.class_name || ''
      const score = isClassTotal ? (item.total_score ?? item.score ?? 0) : (item.score ?? 0)
      return `
        <li class="rank-item ${item.is_self ? 'rank-self' : ''}">
          <span class="rank-num">${rank}</span>
          <div class="rank-info">
            <div class="rank-name">${escapeHtml(name)}</div>
            <div class="rank-class">${escapeHtml(meta)}</div>
          </div>
          <span class="rank-score">${score}</span>
        </li>
      `
    }).join('')

    // 「我的最高分」汇总只在经典榜响应体里（SDK 归一化条目不包含）；只读其中数字字段，
    // 不渲染任何身份信息（学号已在 SDK 边界剔除）
    const raw = result.raw && typeof result.raw === 'object' ? result.raw : null
    const player = raw?.player || raw?.my_rank || raw?.myRank || null
    const myRankHtml = player
      ? `<div class="my-rank">我的最高分 ${player.score ?? 0}${player.class_rank ? ` · 班级第 ${player.class_rank} 名` : ''}${player.school_rank ? ` · 全校第 ${player.school_rank} 名` : ''}${player.class_total_rank ? ` · 班级总分第 ${player.class_total_rank} 名` : ''}</div>`
      : ''
    content.innerHTML = `<ul class="rank-list">${html}</ul>${myRankHtml}`
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

  // 上传失败重试（仅 SDK 判定 retryable 的失败）
  document.getElementById('upload-status')?.addEventListener('click', () => {
    if (!retryAvailable) return
    void retrySubmit()
  })
}

// ========== 初始化 ==========
function init() {
  setModuleViewportVars()

  // 构建 UI
  buildUI()

  // 首屏按同步预判能力决定排行榜入口显隐（ready 后会用最终值再刷一次）
  applyRankAvailability()

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
      // 首次 flap 是显式开局事件：新一局 = 新 run（旧 run 未结算的成绩随旧 run 丢弃，与既有行为一致）
      run = sdkGame.startRun({ replaceActive: true })
      retryAvailable = false
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

// 模式判定（Host 握手 / ticket 兑换）完成后刷新排行可用性：只影响入口显隐，不阻塞玩法
void sdkGame.ready.then(() => {
  rankEnabled = sdkGame.capabilities.canSubmit
  leaderboardAvailable = sdkGame.capabilities.leaderboard
  applyRankAvailability()
})

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
