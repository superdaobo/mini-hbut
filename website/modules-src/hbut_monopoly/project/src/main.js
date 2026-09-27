import './style.css'
import {
  CAMPUS_BOARD,
  CAMPUS_INVESTMENTS,
  MONOPOLY_STAGES,
  applyActionCard,
  applyEventChoice,
  computeRankScore,
  createDeterministicDice,
  createInitialState,
  investInCampusSite,
  playTurn,
  restartGame
} from './game/monopoly.js'
import { MiniHBUTGame, readLegacyModuleContext } from '../../../_sdk/src/index.js'
import { HBUT_MONOPOLY_ADAPTER } from './utils/game_sdk_adapter.js'

const MODULE_ID = 'hbut_monopoly'
const dice = createDeterministicDice()
let state = createInitialState()

const app = document.getElementById('app')

// SDK 句柄：同步创建（宿主握手 / ticket 兑换在后台进行），不阻塞渲染与玩法
const sdkGame = MiniHBUTGame.create({ gameId: MODULE_ID, adapter: HBUT_MONOPOLY_ADAPTER })
// 同步预判能力：有 ticket 或旧版上下文（student_id + rank_api）时为 true，行为与旧 canUseGameRank 一致
let rankEnabled = sdkGame.capabilities.canSubmit
let leaderboardAvailable = sdkGame.capabilities.leaderboard

// 班级上下文只用于选择默认榜单 scope（展示用途，不参与身份判定）
const launchContext = readLegacyModuleContext({ gameId: MODULE_ID })

// run 生命周期由 SDK 管理（run_id 生成、幂等、降级、pending 重试）
let run = sdkGame.startRun()
let lastTerminalStatus = ''
let lastSubmitUiStatus = ''
let lastSubmitUiText = ''
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

function tileClass(index) {
  const tile = CAMPUS_BOARD[index]
  const classes = ['tile', tile.type]
  if (index === state.position) classes.push('current')
  if (index === 0) classes.push('start')
  if (state.investments?.[tile.siteId || tile.id]) classes.push('invested')
  return classes.join(' ')
}

function statusTitle() {
  if (state.status === 'won') return '三阶段通关'
  if (state.status === 'lost') return '经营失衡'
  if (state.pendingEvent) return '处理校园事件'
  return '规划下一回合'
}

function statusDetail() {
  if (state.status === 'won') return '目标全部达成，湖工经营路线完成。'
  if (state.status === 'lost') return '资金、精力或压力已越界，需要重新规划。'
  if (state.pendingEvent) return state.pendingEvent.description
  return `目标：${state.targetCredits} 绩点 / ${state.targetInfluence} 影响力 · 综合分 ${computeRankScore(state)}`
}

function resourceClass(value, mode) {
  if (mode === 'stress') {
    if (value >= 80) return 'danger'
    if (value >= 60) return 'warn'
    return 'ok'
  }
  if (value <= 20) return 'danger'
  if (value <= 40) return 'warn'
  return 'ok'
}

function progressPercent(value, target) {
  if (target <= 0) return 0
  return Math.max(0, Math.min(100, Math.round((value / target) * 100)))
}

function renderProgress(label, value, target) {
  const percent = progressPercent(value, target)
  return `
    <div class="goal-row">
      <span>${label}</span>
      <strong>${value}/${target}</strong>
      <i style="--value: ${percent}%"></i>
    </div>
  `
}

function renderResourceGauge(label, value, mode) {
  return `
    <div class="gauge ${resourceClass(value, mode)}">
      <span>${label}</span>
      <strong>${value}</strong>
      <i style="--value: ${Math.max(0, Math.min(100, value))}%"></i>
    </div>
  `
}

function renderBoard() {
  return CAMPUS_BOARD.map((tile, index) => `
    <button class="${tileClass(index)}" data-index="${index}" type="button" aria-label="${tile.name}">
      <span class="tile-index">${index + 1}</span>
      <span class="tile-name">${tile.name}</span>
      <span class="tile-type">${tile.type === 'event' ? '事件' : tile.type === 'study' ? '学习' : tile.type === 'grant' ? '补给' : tile.type === 'card' ? '卡牌' : tile.type === 'rest' ? '恢复' : tile.type === 'fee' ? '支出' : '起点'}</span>
    </button>
  `).join('')
}

function renderLog() {
  return state.log.map((item) => `<li>${item}</li>`).join('')
}

function renderEventChoices() {
  if (!state.pendingEvent) {
    const tile = CAMPUS_BOARD[state.position]
    return `
      <div class="event-empty">
        <strong>${tile.name}</strong>
        <span>${tile.description}</span>
      </div>
    `
  }

  return `
    <div class="choice-list">
      <strong>${state.pendingEvent.title}</strong>
      ${state.pendingEvent.choices
        .map(
          (choice) => `
            <button class="choice-button" data-choice-id="${choice.id}" type="button">
              <span>${choice.label}</span>
              <small>${effectText(choice.effects)}</small>
            </button>
          `
        )
        .join('')}
    </div>
  `
}

function effectText(effects = {}) {
  const labels = [
    ['coins', '资金'],
    ['credits', '绩点'],
    ['influence', '影响力'],
    ['energy', '精力'],
    ['stress', '压力']
  ]
  return labels
    .map(([key, label]) => {
      const value = Number(effects[key] || 0)
      return value ? `${label}${value > 0 ? '+' : ''}${value}` : ''
    })
    .filter(Boolean)
    .join(' / ')
}

function renderCards() {
  if (!state.cards.length) {
    return '<span class="empty-note">暂无行动卡</span>'
  }

  const isBlocked = state.status !== 'playing' || state.phase === 'choice'
  return state.cards
    .map(
      (card) => `
        <button class="tool-button" data-card-id="${card.id}" type="button" ${isBlocked ? 'disabled' : ''}>
          <span>${card.name}</span>
          <small>${card.description || '立即使用'}</small>
        </button>
      `
    )
    .join('')
}

function renderInvestments() {
  return CAMPUS_INVESTMENTS.map((site) => {
    const currentLevel = state.investments?.[site.id]?.level || 0
    const cost = site.cost + currentLevel * site.costStep
    const isMaxed = currentLevel >= site.maxLevel
    const disabled = state.status !== 'playing' || state.phase === 'choice' || state.coins < cost || isMaxed
    return `
      <button class="tool-button investment-button" data-site-id="${site.id}" type="button" ${disabled ? 'disabled' : ''}>
        <span>${site.name} Lv.${currentLevel}/${site.maxLevel}</span>
        <small>${isMaxed ? '已满级' : `${cost} 资金 · +${site.influence} 影响力`}</small>
      </button>
    `
  }).join('')
}

function showSubmitStatus(status, text = '') {
  lastSubmitUiStatus = status || ''
  // 记录自定义文案，re-render 后（DOM 被重建）仍能恢复同一提示
  lastSubmitUiText = status === 'success' || status === 'failed' ? text : ''
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
          lastSubmitUiText = ''
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

/** 结算后统一更新提交状态（SDK 已把 verified / compatibility / standalone 归一为同一 outcome） */
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
  showSubmitStatus('uploading')
  try {
    // 数值语义与迁移前逐字一致（maxLevel 仍是 stageIndex+1，由 adapter.fromLegacyMaxLevel 换算 metric）
    const outcome = await run.finish({
      score: computeRankScore(state),
      maxLevel: (state.stageIndex || 0) + 1,
      durationMs: Math.max(0, Date.now() - run.startedAt),
      moveCount: Number(state.turn || 0),
      endedReason,
      extra: {
        credits: state.credits,
        influence: state.influence,
        coins: state.coins,
        energy: state.energy,
        stress: state.stress,
        stage: state.stageName,
        stageIndex: state.stageIndex
      }
    })
    applySubmitOutcome(outcome)
  } catch (error) {
    console.warn('[hbut_monopoly] rank submit failed', error?.code || error)
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
    console.warn('[hbut_monopoly] rank retry failed', error?.code || error)
    showSubmitStatus('failed')
  }
}

/** 排行榜可用性跟随最终模式（standalone 时隐藏入口） */
function applyRankAvailability() {
  const button = document.getElementById('leaderboard-button')
  if (button) button.hidden = !leaderboardAvailable
}

function setupLeaderboard() {
  const overlay = document.getElementById('leaderboard-overlay')
  const openBtn = document.getElementById('leaderboard-button')
  const closeBtn = document.getElementById('leaderboard-close')
  if (!overlay || !openBtn) return
  openBtn.addEventListener('click', () => {
    if (!leaderboardAvailable) return
    overlay.style.display = 'flex'
    void loadLeaderboard(currentLeaderboardScope)
  })
  closeBtn?.addEventListener('click', () => {
    overlay.style.display = 'none'
  })
  overlay.addEventListener('click', (event) => {
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
  if ((state.status === 'won' || state.status === 'lost') && state.status !== lastTerminalStatus) {
    lastTerminalStatus = state.status
    void submitTerminalScore(state.status === 'won' ? 'won' : 'lost')
  }
}

function afterStateChange() {
  maybeSubmitTerminal()
  render()
}

function render() {
  app.innerHTML = `
    <main class="app-shell">
      <section class="metric-strip" aria-label="当前资源">
        <div>
          <span>阶段</span>
          <strong>${state.stageIndex + 1}/${MONOPOLY_STAGES.length}</strong>
        </div>
        <div>
          <span>资金</span>
          <strong>${state.coins}</strong>
        </div>
        <div>
          <span>回合</span>
          <strong>${state.turn}</strong>
        </div>
        <div>
          <span>骰子</span>
          <strong>${state.dice || '-'}</strong>
        </div>
      </section>

      <section class="hero-panel">
        <div>
          <p class="kicker">湖工大富翁 · ${state.stageName}</p>
          <h1>${statusTitle()}</h1>
          <p class="status-detail">${statusDetail()}</p>
        </div>
        <div class="goal-card" aria-label="阶段目标">
          ${renderProgress('绩点', state.credits, state.targetCredits)}
          ${renderProgress('影响力', state.influence, state.targetInfluence)}
        </div>
      </section>

      <section class="board-panel" aria-label="湖工校园棋盘">
        <div class="board-grid">
          ${renderBoard()}
        </div>
      </section>

      <section class="resource-panel" aria-label="精力与压力">
        ${renderResourceGauge('精力', state.energy, 'energy')}
        ${renderResourceGauge('压力', state.stress, 'stress')}
      </section>

      <section class="control-panel">
        <button id="roll-button" class="primary-action" type="button" ${state.status === 'playing' && state.phase === 'roll' ? '' : 'disabled'}>
          ${state.pendingEvent ? '先处理事件' : '投骰前进'}
        </button>
        <button id="restart-button" class="secondary-action" type="button">重新开始</button>
        ${rankEnabled ? '<button id="leaderboard-button" class="secondary-action" type="button">排行榜</button>' : ''}
      </section>

      <div id="submit-status" class="submit-status" aria-live="polite"></div>

      <section class="action-panel" aria-label="回合选择">
        <div class="panel-section event-section">
          ${renderEventChoices()}
        </div>
        <div class="panel-section">
          <div class="section-heading">
            <strong>行动卡</strong>
            <span>${state.cards.length} 张</span>
          </div>
          <div class="tool-list">${renderCards()}</div>
        </div>
        <div class="panel-section">
          <div class="section-heading">
            <strong>据点投资</strong>
            <span>${Object.keys(state.investments || {}).length}/${CAMPUS_INVESTMENTS.length}</span>
          </div>
          <div class="tool-list">${renderInvestments()}</div>
        </div>
      </section>

      <section class="log-panel" aria-label="事件记录">
        <div class="section-heading">
          <strong>校园记录</strong>
          <span>${CAMPUS_BOARD[state.position].name}</span>
        </div>
        <ol>${renderLog()}</ol>
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

  document.getElementById('roll-button')?.addEventListener('click', () => {
    state = playTurn(state, dice())
    afterStateChange()
  })
  document.getElementById('restart-button')?.addEventListener('click', () => {
    state = restartGame()
    // 新一局 = 新 run_id（旧 run 未结算的成绩随旧 run 丢弃，与既有行为一致）
    run = sdkGame.startRun({ replaceActive: true })
    lastTerminalStatus = ''
    lastSubmitUiStatus = ''
    lastSubmitUiText = ''
    afterStateChange()
  })
  for (const button of app.querySelectorAll('[data-choice-id]')) {
    button.addEventListener('click', () => {
      state = applyEventChoice(state, button.dataset.choiceId)
      afterStateChange()
    })
  }
  for (const button of app.querySelectorAll('[data-card-id]')) {
    button.addEventListener('click', () => {
      state = applyActionCard(state, button.dataset.cardId)
      afterStateChange()
    })
  }
  for (const button of app.querySelectorAll('[data-site-id]')) {
    button.addEventListener('click', () => {
      state = investInCampusSite(state, button.dataset.siteId)
      afterStateChange()
    })
  }
  setupLeaderboard()
  if (lastSubmitUiStatus) showSubmitStatus(lastSubmitUiStatus, lastSubmitUiText)
  notifyHostHeight()
}

window.addEventListener('resize', syncViewport)
window.addEventListener('orientationchange', syncViewport)
window.visualViewport?.addEventListener('resize', syncViewport)

if ('ResizeObserver' in window) {
  new ResizeObserver(notifyHostHeight).observe(document.documentElement)
}

syncViewport()
render()

// 模式判定（宿主握手 / ticket 兑换）完成后刷新排行可用性：只影响入口显隐，不阻塞玩法
void sdkGame.ready.then(() => {
  rankEnabled = sdkGame.capabilities.canSubmit
  leaderboardAvailable = sdkGame.capabilities.leaderboard
  applyRankAvailability()
})
