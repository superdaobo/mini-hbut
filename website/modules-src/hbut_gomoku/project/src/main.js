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
  DEFAULT_HF_RELAY_BASE_URL,
  HF_RELAY_STRATEGY,
  MATCHMAKING_ROOM_CODE,
  applyLobbyMessage,
  applyLocalMove,
  applyLocalRestart,
  applyPeerJoined,
  applyPeerLeft,
  applyRemoteMove,
  applyRemoteRestart,
  applySnapshotMessage,
  buildCancelMessage,
  buildLobbyPresenceMessage,
  buildMatchStartMessage,
  buildQueueMessage,
  buildSnapshotMessage,
  createMatchmakingState,
  createHfRelayGomokuRoom,
  createOnlineState,
  createRoomCode,
  createTrysteroGomokuRoom,
  formatRoomCode,
  getMatchmakingOnlineCount,
  getMatchmakingQueueCount,
  markOnlineTimeout,
  normalizeRoomCode
} from './game/online.js'

const MODULE_ID = 'hbut_gomoku'
const ONLINE_CONNECT_TIMEOUT_MS = 18000
const LOBBY_PRESENCE_INTERVAL_MS = 10_000
const DEFAULT_ONLINE_STRATEGY = HF_RELAY_STRATEGY
const DEFAULT_FALLBACK_STRATEGY = 'nostr'
let state = createInitialState()
let onlineClient = null
let lobbyClient = null
let matchmakingState = createMatchmakingState()
let roomInputValue = ''
let onlineBusy = false
let onlineError = ''
let onlineTimeoutId = 0
let lobbyBusy = false
let lobbyStatus = 'offline'
let lobbyError = ''
let activeMatchRoomCode = ''
let lobbyPresenceTimer = 0

const app = document.getElementById('app')

function safeUrlParam(name) {
  try {
    return String(new URLSearchParams(window.location.search || '').get(name) || '').trim()
  } catch {
    return ''
  }
}

const GOMOKU_RELAY_BASE_URL =
  safeUrlParam('gomoku_api') ||
  safeUrlParam('relay_api') ||
  DEFAULT_HF_RELAY_BASE_URL

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

function isQueuedForMatch() {
  return Boolean(matchmakingState.selfQueued)
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

function lobbyStatusText() {
  if (isQueuedForMatch()) return '匹配中'
  if (lobbyBusy) return '连接中'
  if (lobbyStatus === 'online') return '大厅在线'
  if (lobbyStatus === 'failed') return '大厅不可用'
  return '大厅离线'
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
  if (lobbyError && lobbyStatus === 'failed') return lobbyError
  if (isQueuedForMatch()) return '已进入匹配队列，匹配到同学后会自动进入 PK 对局。'
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
  const onlineCount = lobbyStatus === 'online' ? getMatchmakingOnlineCount(matchmakingState) : 0
  const queueCount = lobbyStatus === 'online' ? getMatchmakingQueueCount(matchmakingState) : 0
  const matchButtonText = isQueuedForMatch() ? '取消' : '匹配'
  return `
    <section class="online-panel" aria-label="联机对战">
      <div class="online-summary">
        <div>
          <span>大厅</span>
          <strong>${lobbyStatus === 'online' ? `${onlineCount} 人` : lobbyStatusText()}</strong>
        </div>
        <div>
          <span>队列</span>
          <strong>${lobbyStatus === 'online' ? `${queueCount} 人` : '-'}</strong>
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
        <button id="match-button" class="room-button match" type="button" ${onlineBusy || lobbyBusy ? 'disabled' : ''}>${matchButtonText}</button>
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
  document.getElementById('match-button')?.addEventListener('click', handleMatchToggle)
  document.getElementById('local-mode-button')?.addEventListener('click', switchToLocalMode)
  document.getElementById('room-input')?.addEventListener('input', (event) => {
    roomInputValue = formatRoomCode(event.target.value)
    event.target.value = roomInputValue
  })
}

function createLocalLobbyMessage(type, extra = {}) {
  const senderId = lobbyClient?.selfPeerId || matchmakingState.selfPeerId
  return {
    type,
    messageId: `${senderId || 'peer'}:${type}:${Date.now().toString(36)}:${Math.random()
      .toString(36)
      .slice(2, 8)}`,
    senderId,
    sentAt: Date.now(),
    ...extra
  }
}

async function sendLobbyMessage(message, targetPeerId = '') {
  if (!lobbyClient || !message) return false
  try {
    await lobbyClient.send(message, targetPeerId || undefined)
    return true
  } catch (error) {
    lobbyStatus = 'failed'
    lobbyError = `大厅消息发送失败：${error?.message || '网络不可用'}`
    render()
    return false
  }
}

async function publishLobbyPresence(targetPeerId = '') {
  if (!lobbyClient?.selfPeerId) return
  await sendLobbyMessage(
    buildLobbyPresenceMessage({
      selfPeerId: lobbyClient.selfPeerId,
      queued: matchmakingState.selfQueued
    }),
    targetPeerId
  )
}

function clearLobbyPresenceHeartbeat() {
  if (!lobbyPresenceTimer) return
  window.clearInterval(lobbyPresenceTimer)
  lobbyPresenceTimer = 0
}

function startLobbyPresenceHeartbeat() {
  clearLobbyPresenceHeartbeat()
  lobbyPresenceTimer = window.setInterval(() => {
    if (lobbyStatus !== 'online' || !lobbyClient?.selfPeerId) return
    void publishLobbyPresence()
  }, LOBBY_PRESENCE_INTERVAL_MS)
}

async function connectMatchmakingLobby(strategy = DEFAULT_ONLINE_STRATEGY) {
  if (lobbyBusy || lobbyClient) return
  lobbyBusy = true
  lobbyStatus = 'connecting'
  lobbyError = ''
  render()

  try {
    lobbyClient = await createNetworkRoom({
      roomCode: MATCHMAKING_ROOM_CODE,
      strategy,
      onEvent: handleLobbyEvent
    })
    matchmakingState = createMatchmakingState({
      selfPeerId: lobbyClient.selfPeerId
    })
    lobbyStatus = 'online'
    await publishLobbyPresence()
    startLobbyPresenceHeartbeat()
  } catch (error) {
    if (strategy === HF_RELAY_STRATEGY) {
      lobbyBusy = false
      lobbyClient = null
      await connectMatchmakingLobby(DEFAULT_FALLBACK_STRATEGY)
      return
    }
    lobbyClient = null
    matchmakingState = createMatchmakingState()
    lobbyStatus = 'failed'
    lobbyError = `匹配大厅暂时不可用：${error?.message || '请稍后重试'}`
    clearLobbyPresenceHeartbeat()
  } finally {
    lobbyBusy = false
    render()
  }
}

async function resetMatchmakingQueue() {
  if (!matchmakingState.selfQueued) {
    clearLobbyMatch()
    return
  }
  const message = buildCancelMessage({
    selfPeerId: lobbyClient?.selfPeerId || matchmakingState.selfPeerId
  })
  matchmakingState = applyLobbyMessage(matchmakingState, message, matchmakingState.selfPeerId)
  clearLobbyMatch()
  render()
  await sendLobbyMessage(message)
}

async function startMatchedGame(match, source = '') {
  if (!match?.roomCode || activeMatchRoomCode === match.roomCode) return
  activeMatchRoomCode = match.roomCode
  onlineError = source === 'match_start' ? '匹配成功，正在进入 PK 对局。' : '匹配到同学，正在进入 PK 对局。'
  roomInputValue = formatRoomCode(match.roomCode)
  matchmakingState = {
    ...matchmakingState,
    selfQueued: false,
    match: null
  }
  render()

  if (lobbyClient && match.role === 'host') {
    await sendLobbyMessage(
      buildMatchStartMessage(match, lobbyClient.selfPeerId),
      match.opponentPeerId
    )
  }
  if (lobbyClient?.selfPeerId) {
    await sendLobbyMessage(buildCancelMessage({
      selfPeerId: lobbyClient.selfPeerId
    }))
  }

  await connectOnlineRoom(match.role, match.roomCode, {
    fromMatch: true,
    match,
    peerId: lobbyClient?.selfPeerId || matchmakingState.selfPeerId,
    selfPeerId: matchmakingState.selfPeerId || lobbyClient?.selfPeerId || '',
    statusMessage: '匹配成功，正在等待 PK 对局连接。'
  })
}

function resolveLobbyMatch(source = '') {
  const match = matchmakingState.match
  if (!match) return
  void startMatchedGame(match, source)
}

function clearLobbyMatch() {
  if (!matchmakingState.match) return
  matchmakingState = {
    ...matchmakingState,
    match: null
  }
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
        statusMessage: nextState.connectionMessage,
        match: state.matchPair || null,
        selfPeerId: state.localPeerId,
        peerId: state.localPeerId,
        onlineRetryAttempts: nextState.onlineRetryAttempts
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
  if (strategy === HF_RELAY_STRATEGY) return 'HF 中转'
  return strategy === 'torrent' ? 'tracker 后备' : 'Nostr relay'
}

function createNetworkRoom({ roomCode, strategy, onEvent, peerId }) {
  if (strategy === HF_RELAY_STRATEGY) {
    return createHfRelayGomokuRoom({
      roomCode,
      peerId,
      baseUrl: GOMOKU_RELAY_BASE_URL,
      onEvent
    })
  }
  return createTrysteroGomokuRoom({
    roomCode,
    strategy,
    onEvent
  })
}

async function connectOnlineRoom(role, rawRoomCode, options = {}) {
  const roomCode = normalizeRoomCode(rawRoomCode)
  if (!roomCode) {
    onlineError = '请先输入房间号'
    render()
    return
  }

  const strategy = options.strategy || DEFAULT_ONLINE_STRATEGY
  if (!options.fromMatch) activeMatchRoomCode = ''
  onlineBusy = true
  onlineError = options.statusMessage || ''
  render()

  try {
    await resetMatchmakingQueue()
    await resetOnlineClient()
    onlineClient = await createNetworkRoom({
      roomCode,
      strategy,
      peerId: options.peerId,
      onEvent: handleOnlineEvent
    })
    state = createOnlineState({
      roomCode,
      role,
      selfPeerId: options.selfPeerId || onlineClient.selfPeerId,
      transportPeerId: onlineClient.selfPeerId,
      strategy: onlineClient.strategy || strategy,
      match: options.match || null,
      onlineRetryAttempts: options.onlineRetryAttempts || 0
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
    const failedState = createOnlineState({
      roomCode,
      role,
      selfPeerId: options.selfPeerId || state.localPeerId || '',
      strategy,
      match: options.match || state.matchPair || null,
      onlineRetryAttempts: options.onlineRetryAttempts || state.onlineRetryAttempts || 0
    })
    const retryState = markOnlineTimeout(failedState)
    state =
      retryState.onlineStatus === 'retrying'
        ? {
            ...retryState,
            connectionMessage: `${strategyLabel(strategy)} 联机服务不可用，${retryState.connectionMessage}`
          }
        : {
            ...failedState,
            onlineStatus: 'failed',
            connectionMessage: `${strategyLabel(strategy)} 联机服务不可用：${error?.message || '请稍后重试'}`,
            lastError: ''
          }
    onlineError = state.connectionMessage
    if (options.fromMatch && activeMatchRoomCode === roomCode) {
      activeMatchRoomCode = ''
    }
    if (state.onlineStatus === 'retrying') {
      void connectOnlineRoom(role, roomCode, {
        ...options,
        strategy: state.onlineStrategy,
        statusMessage: state.connectionMessage,
        selfPeerId: state.localPeerId,
        peerId: state.localPeerId,
        onlineRetryAttempts: state.onlineRetryAttempts
      })
    }
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

async function handleMatchToggle() {
  if (isQueuedForMatch()) {
    await resetMatchmakingQueue()
    return
  }

  if (!lobbyClient) {
    await connectMatchmakingLobby()
  }
  if (!lobbyClient?.selfPeerId) return

  onlineError = ''
  lobbyError = ''
  const queueMessage = buildQueueMessage({
    selfPeerId: lobbyClient.selfPeerId
  })
  matchmakingState = applyLobbyMessage(matchmakingState, queueMessage, lobbyClient.selfPeerId)
  render()
  const sent = await sendLobbyMessage(queueMessage)
  if (!sent) {
    matchmakingState = applyLobbyMessage(
      matchmakingState,
      buildCancelMessage({
        selfPeerId: matchmakingState.selfPeerId
      }),
      matchmakingState.selfPeerId
    )
    clearLobbyMatch()
    render()
    return
  }
  resolveLobbyMatch('queue')
}

async function switchToLocalMode() {
  await resetMatchmakingQueue()
  await resetOnlineClient()
  onlineBusy = false
  onlineError = ''
  roomInputValue = ''
  activeMatchRoomCode = ''
  clearLobbyMatch()
  state = createInitialState()
  render()
}

function handleLobbyEvent(event) {
  if (!event) return

  if (event.type === 'peer_join') {
    matchmakingState = applyLobbyMessage(
      matchmakingState,
      buildLobbyPresenceMessage({
        selfPeerId: event.peerId,
        queued: false
      }),
      event.peerId
    )
    render()
    void publishLobbyPresence(event.peerId)
    return
  }

  if (event.type === 'peer_leave') {
    matchmakingState = applyLobbyMessage(
      matchmakingState,
      createLocalLobbyMessage('lobby_leave', {
        senderId: event.peerId
      }),
      event.peerId
    )
    render()
    return
  }

  if (event.type !== 'message') return
  matchmakingState = applyLobbyMessage(matchmakingState, event.message || {}, event.peerId)
  render()
  if (matchmakingState.match) {
    resolveLobbyMatch(event.message?.type === 'lobby_match_start' ? 'match_start' : 'message')
  }
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
window.addEventListener('beforeunload', () => {
  clearLobbyPresenceHeartbeat()
  if (lobbyClient?.selfPeerId) {
    void sendLobbyMessage(createLocalLobbyMessage('lobby_leave'))
  }
  try {
    lobbyClient?.close()
    onlineClient?.close()
  } catch {
    // 页面卸载时忽略连接关闭异常。
  }
})

if ('ResizeObserver' in window) {
  new ResizeObserver(notifyHostHeight).observe(document.documentElement)
}

syncViewport()
render()
void connectMatchmakingLobby()
