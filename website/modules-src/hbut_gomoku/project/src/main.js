import './style.css'
import {
  BOARD_SIZE,
  PLAYERS,
  createInitialState,
  getPlayerName,
  placeStone,
  restartGame
} from './game/gomoku.js'
import {
  applyLocalMove,
  applyLocalRestart,
  applyPeerJoined,
  applyPeerLeft,
  applyRemoteMove,
  applyRemoteRestart,
  applySnapshotMessage,
  buildSnapshotMessage,
  createOnlineState,
  createRoomCode,
  createTrysteroGomokuRoom,
  formatRoomCode,
  markOnlineTimeout,
  normalizeRoomCode
} from './game/online.js'

const MODULE_ID = 'hbut_gomoku'
const ONLINE_CONNECT_TIMEOUT_MS = 18000
const DEFAULT_ONLINE_STRATEGY = 'nostr'
let state = createInitialState()
let onlineClient = null
let roomInputValue = ''
let onlineBusy = false
let onlineError = ''
let onlineTimeoutId = 0

const app = document.getElementById('app')

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

function syncViewport() {
  const viewportHeight =
    window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight
  document.documentElement.style.setProperty('--module-vh', `${viewportHeight * 0.01}px`)
  notifyHostHeight()
}

function cellKey(row, col) {
  return `${row}:${col}`
}

function buildWinLineSet() {
  return new Set((state.winLine || []).map(([row, col]) => cellKey(row, col)))
}

function isOnlineMode() {
  return state.mode === 'online_room'
}

function isLocalSeatActive() {
  if (!isOnlineMode()) return true
  return Boolean(state.localPlayer && state.players?.[state.localPlayer] === state.localPeerId)
}

function canLocalPlace() {
  if (!isOnlineMode()) return state.status === 'playing'
  return (
    state.status === 'playing' &&
    state.onlineStatus === 'connected' &&
    state.currentPlayer === state.localPlayer &&
    isLocalSeatActive()
  )
}

function modeLabel() {
  if (!isOnlineMode()) return '本地双人'
  return state.role === 'host' ? '联机房主' : '联机加入'
}

function onlineStatusText() {
  if (!isOnlineMode()) return '离线可玩'
  if (onlineBusy) return '连接中'
  if (state.onlineStatus === 'connected') return '已连接'
  if (state.onlineStatus === 'waiting_peer') return '等待对手'
  if (state.onlineStatus === 'retrying') return '切换线路'
  if (state.onlineStatus === 'peer_left') return '对手离开'
  if (state.onlineStatus === 'failed') return '连接失败'
  return '连接中'
}

function statusTitle() {
  if (state.status === 'won') return `${getPlayerName(state.winner)}五连成功`
  if (state.status === 'draw') return '棋盘已满，平局'
  if (isOnlineMode() && state.onlineStatus !== 'connected') return onlineStatusText()
  if (isOnlineMode() && !isLocalSeatActive()) return '旁观席'
  if (isOnlineMode() && state.currentPlayer !== state.localPlayer) return '等待对手落子'
  return `${getPlayerName(state.currentPlayer)}落子`
}

function statusDetail() {
  if (state.status === 'won') return isOnlineMode() ? '联机对局结束，可发起同步重开。' : '本地双人对局结束，可重新开局再战。'
  if (state.status === 'draw') return '没有形成五连，双方平分秋色。'
  if (onlineError) return onlineError
  if (state.lastError) return state.lastError
  if (isOnlineMode() && state.connectionMessage) return state.connectionMessage
  if (isOnlineMode() && !isLocalSeatActive()) return '本房间已有黑白双方，可返回本地双人或重新加入其他房间。'
  if (!state.moves.length) return '点击棋盘棋位落子，先连成五枚即获胜。'
  const last = state.lastMove
  return `上手：${getPlayerName(last.player)}落在 ${last.row + 1} 行 ${last.col + 1} 列。`
}

function renderBoard() {
  const winLine = buildWinLineSet()
  const cells = []
  const localCanPlace = canLocalPlace()
  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const player = state.board[row][col]
      const classes = ['board-cell']
      if (player) classes.push(player)
      if (state.lastMove?.row === row && state.lastMove?.col === col) classes.push('last')
      if (winLine.has(cellKey(row, col))) classes.push('win')
      cells.push(`
        <button
          class="${classes.join(' ')}"
          data-row="${row}"
          data-col="${col}"
          type="button"
          aria-label="${row + 1} 行 ${col + 1} 列${player ? `，${getPlayerName(player)}` : '，空位'}"
          ${!localCanPlace || player ? 'disabled' : ''}
        >
          <span></span>
        </button>
      `)
    }
  }
  return cells.join('')
}

function renderMoveList() {
  if (!state.moves.length) return '<li>等待黑子先手。</li>'
  return state.moves
    .slice(-8)
    .reverse()
    .map(
      (move, index) =>
        `<li><strong>${state.moves.length - index}</strong><span>${getPlayerName(move.player)} · ${move.row + 1} 行 ${move.col + 1} 列</span></li>`
    )
    .join('')
}

function renderOnlinePanel() {
  const roomCode = isOnlineMode() ? formatRoomCode(state.sessionId) : ''
  const seatText = isOnlineMode() ? (isLocalSeatActive() ? getPlayerName(state.localPlayer) : '旁观') : '本地'
  return `
    <section class="online-panel" aria-label="联机对战">
      <div class="online-summary">
        <div>
          <span>联机</span>
          <strong>${onlineStatusText()}</strong>
        </div>
        <div>
          <span>房间</span>
          <strong>${roomCode || '未连接'}</strong>
        </div>
        <div>
          <span>席位</span>
          <strong>${seatText}</strong>
        </div>
      </div>
      <div class="room-controls">
        <input
          id="room-input"
          type="text"
          inputmode="latin"
          autocomplete="off"
          maxlength="16"
          placeholder="输入房间号"
          value="${roomInputValue}"
          aria-label="房间号"
        >
        <button id="create-room-button" class="room-button" type="button" ${onlineBusy ? 'disabled' : ''}>创建</button>
        <button id="join-room-button" class="room-button" type="button" ${onlineBusy ? 'disabled' : ''}>加入</button>
        <button id="local-mode-button" class="room-button muted" type="button">本地</button>
      </div>
    </section>
  `
}

function render() {
  app.innerHTML = `
    <main class="app-shell">
      ${renderOnlinePanel()}

      <section class="score-strip" aria-label="对局状态">
        <div>
          <span>模式</span>
          <strong>${modeLabel()}</strong>
        </div>
        <div>
          <span>手数</span>
          <strong>${state.moves.length}</strong>
        </div>
        <div>
          <span>黑子</span>
          <strong>${state.moves.filter((move) => move.player === PLAYERS.black).length}</strong>
        </div>
        <div>
          <span>白子</span>
          <strong>${state.moves.filter((move) => move.player === PLAYERS.white).length}</strong>
        </div>
      </section>

      <section class="status-panel" aria-live="polite">
        <div class="turn-mark ${state.status === 'playing' ? state.currentPlayer : state.winner || 'draw'}"></div>
        <div>
          <p class="eyebrow">湖工五子棋</p>
          <h1>${statusTitle()}</h1>
          <p>${statusDetail()}</p>
        </div>
      </section>

      <section class="board-panel" aria-label="十五路五子棋棋盘">
        <div class="board-grid">
          ${renderBoard()}
        </div>
      </section>

      <section class="control-panel">
        <button id="restart-button" class="primary-action" type="button">重新开局</button>
        <div class="legend" aria-label="棋子说明">
          <span><i class="stone black"></i>黑子先手</span>
          <span><i class="stone white"></i>白子后手</span>
        </div>
      </section>

      <section class="history-panel" aria-label="最近落子">
        <div class="section-heading">
          <strong>最近落子</strong>
          <span>${state.status === 'playing' ? '对局中' : '已结束'}</span>
        </div>
        <ol>${renderMoveList()}</ol>
      </section>
    </main>
  `

  bindEvents()
  notifyHostHeight()
}

function bindEvents() {
  for (const button of app.querySelectorAll('[data-row][data-col]')) {
    button.addEventListener('click', () => {
      handlePlaceStone(Number(button.dataset.row), Number(button.dataset.col))
    })
  }

  document.getElementById('restart-button')?.addEventListener('click', handleRestart)
  document.getElementById('create-room-button')?.addEventListener('click', handleCreateRoom)
  document.getElementById('join-room-button')?.addEventListener('click', handleJoinRoom)
  document.getElementById('local-mode-button')?.addEventListener('click', switchToLocalMode)
  document.getElementById('room-input')?.addEventListener('input', (event) => {
    roomInputValue = formatRoomCode(event.target.value)
    event.target.value = roomInputValue
  })
}

async function sendOnlineMessage(message, targetPeerId = state.remotePeerId) {
  if (!onlineClient || !message) return
  try {
    await onlineClient.send(message, targetPeerId || undefined)
  } catch (error) {
    onlineError = `发送失败：${error?.message || '网络不可用'}`
    state = {
      ...state,
      onlineStatus: 'failed',
      connectionMessage: onlineError
    }
    render()
  }
}

function clearOnlineTimeout() {
  if (!onlineTimeoutId) return
  window.clearTimeout(onlineTimeoutId)
  onlineTimeoutId = 0
}

function armOnlineTimeout(role = state.role, roomCode = state.sessionId) {
  clearOnlineTimeout()
  onlineTimeoutId = window.setTimeout(() => {
    if (!isOnlineMode() || state.onlineStatus === 'connected') return
    const nextState = markOnlineTimeout(state)
    state = nextState
    onlineError = state.connectionMessage
    render()
    if (nextState.onlineStatus === 'retrying') {
      void connectOnlineRoom(role, roomCode, {
        strategy: nextState.onlineStrategy,
        statusMessage: nextState.connectionMessage
      })
    }
  }, ONLINE_CONNECT_TIMEOUT_MS)
}

function handlePlaceStone(row, col) {
  onlineError = ''
  if (isOnlineMode()) {
    const result = applyLocalMove(state, row, col, state.localPeerId)
    state = result.state
    render()
    if (result.accepted) void sendOnlineMessage(result.message)
    return
  }

  state = placeStone(state, row, col)
  render()
}

function handleRestart() {
  onlineError = ''
  if (isOnlineMode()) {
    const result = applyLocalRestart(state, state.localPeerId)
    state = result.state
    render()
    void sendOnlineMessage(result.message)
    return
  }

  state = restartGame()
  render()
}

async function resetOnlineClient() {
  clearOnlineTimeout()
  if (!onlineClient) return
  try {
    onlineClient.close()
  } catch {
    // 关闭旧房间失败不影响重新连接。
  }
  onlineClient = null
}

function strategyLabel(strategy) {
  return strategy === 'torrent' ? 'tracker 后备' : 'Nostr relay'
}

async function connectOnlineRoom(role, rawRoomCode, options = {}) {
  const roomCode = normalizeRoomCode(rawRoomCode)
  if (!roomCode) {
    onlineError = '请先输入房间号'
    render()
    return
  }

  const strategy = options.strategy || DEFAULT_ONLINE_STRATEGY
  onlineBusy = true
  onlineError = options.statusMessage || ''
  render()

  try {
    await resetOnlineClient()
    onlineClient = await createTrysteroGomokuRoom({
      roomCode,
      strategy,
      onEvent: handleOnlineEvent
    })
    state = createOnlineState({
      roomCode,
      role,
      selfPeerId: onlineClient.selfPeerId,
      strategy: onlineClient.strategy || strategy
    })
    if (options.statusMessage) {
      state = {
        ...state,
        connectionMessage: options.statusMessage
      }
    }
    roomInputValue = formatRoomCode(roomCode)
    armOnlineTimeout(role, roomCode)
  } catch (error) {
    onlineClient = null
    state = {
      ...createOnlineState({
        roomCode,
        role,
        selfPeerId: '',
        strategy
      }),
      onlineStatus: 'failed',
      connectionMessage: `${strategyLabel(strategy)} 联机服务不可用：${error?.message || '请稍后重试'}`,
      lastError: ''
    }
    onlineError = state.connectionMessage
  } finally {
    onlineBusy = false
    render()
  }
}

function handleCreateRoom() {
  const roomCode = createRoomCode()
  roomInputValue = roomCode
  void connectOnlineRoom('host', roomCode)
}

function handleJoinRoom() {
  void connectOnlineRoom('guest', roomInputValue)
}

async function switchToLocalMode() {
  await resetOnlineClient()
  onlineBusy = false
  onlineError = ''
  roomInputValue = ''
  state = createInitialState()
  render()
}

function handleOnlineEvent(event) {
  if (!event) return
  onlineError = ''

  if (event.type === 'peer_join') {
    clearOnlineTimeout()
    state = applyPeerJoined(state, event.peerId)
    render()
    if (state.role === 'host') {
      void sendOnlineMessage(buildSnapshotMessage(state, state.localPeerId, event.peerId), event.peerId)
    }
    return
  }

  if (event.type === 'peer_leave') {
    state = applyPeerLeft(state, event.peerId)
    render()
    return
  }

  if (event.type !== 'message') return
  const message = event.message || {}
  let nextState = state
  if (message.type === 'move') {
    nextState = applyRemoteMove(state, message, event.peerId)
  } else if (message.type === 'snapshot') {
    nextState = applySnapshotMessage(state, message, event.peerId)
  } else if (message.type === 'restart') {
    nextState = applyRemoteRestart(state, message, event.peerId)
  } else {
    return
  }
  state = nextState
  if (state.onlineStatus === 'connected' && !state.lastError) clearOnlineTimeout()
  render()
}

window.addEventListener('resize', syncViewport)
window.addEventListener('orientationchange', syncViewport)
window.visualViewport?.addEventListener('resize', syncViewport)

if ('ResizeObserver' in window) {
  new ResizeObserver(notifyHostHeight).observe(document.documentElement)
}

syncViewport()
render()
