import './style.css'
import {
  CAMPUS_BOARD,
  CAMPUS_INVESTMENTS,
  MONOPOLY_STAGES,
  applyActionCard,
  applyEventChoice,
  createDeterministicDice,
  createInitialState,
  investInCampusSite,
  playTurn,
  restartGame
} from './game/monopoly.js'

const MODULE_ID = 'hbut_monopoly'
const dice = createDeterministicDice()
let state = createInitialState()

const app = document.getElementById('app')

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
  return `目标：${state.targetCredits} 绩点 / ${state.targetInfluence} 影响力`
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
      </section>

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
  `

  document.getElementById('roll-button')?.addEventListener('click', () => {
    state = playTurn(state, dice())
    render()
  })
  document.getElementById('restart-button')?.addEventListener('click', () => {
    state = restartGame()
    render()
  })
  for (const button of app.querySelectorAll('[data-choice-id]')) {
    button.addEventListener('click', () => {
      state = applyEventChoice(state, button.dataset.choiceId)
      render()
    })
  }
  for (const button of app.querySelectorAll('[data-card-id]')) {
    button.addEventListener('click', () => {
      state = applyActionCard(state, button.dataset.cardId)
      render()
    })
  }
  for (const button of app.querySelectorAll('[data-site-id]')) {
    button.addEventListener('click', () => {
      state = investInCampusSite(state, button.dataset.siteId)
      render()
    })
  }
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
