import { PLAYERS, createInitialState, placeStone, restartGame } from './gomoku.js'

export const ONLINE_APP_ID = 'mini-hbut-gomoku'
export const TRYSTERO_NOSTR_URL = 'https://esm.sh/trystero/nostr?bundle'
export const TRYSTERO_TORRENT_URL = 'https://esm.sh/@trystero-p2p/torrent?bundle'
export const DEFAULT_NOSTR_RELAY_URLS = Object.freeze([
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social',
  'wss://nostr.wine',
  'wss://relay.nostr.band'
])
export const DEFAULT_TORRENT_TRACKER_URLS = Object.freeze([
  'wss://tracker.openwebtorrent.com',
  'wss://tracker.webtorrent.dev'
])

const ONLINE_STRATEGIES = Object.freeze({
  nostr: 'nostr',
  torrent: 'torrent'
})

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export const normalizeRoomCode = (value) =>
  String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 16)

export const formatRoomCode = (value) => {
  const normalized = normalizeRoomCode(value)
  if (normalized.length <= 4) return normalized
  return normalized.replace(/(.{4})/g, '$1-').replace(/-$/, '')
}

export const createRoomCode = (random = Math.random) => {
  let code = ''
  for (let index = 0; index < 8; index += 1) {
    code += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length) % ROOM_ALPHABET.length]
  }
  return `HBUT-${code.slice(0, 4)}-${code.slice(4)}`
}

const createMessageId = (senderId, type, index = 0) =>
  `${senderId || 'peer'}:${type}:${index}:${Date.now().toString(36)}:${Math.random()
    .toString(36)
    .slice(2, 8)}`

const addAppliedMessageId = (state, messageId) => {
  if (!messageId) return state
  const current = Array.isArray(state.appliedMessageIds) ? state.appliedMessageIds : []
  if (current.includes(messageId)) return state
  return {
    ...state,
    appliedMessageIds: [...current, messageId].slice(-120)
  }
}

const normalizeOnlineStrategy = (strategy) =>
  strategy === ONLINE_STRATEGIES.torrent ? ONLINE_STRATEGIES.torrent : ONLINE_STRATEGIES.nostr

export const nextOnlineStrategy = (strategy) =>
  normalizeOnlineStrategy(strategy) === ONLINE_STRATEGIES.nostr ? ONLINE_STRATEGIES.torrent : ''

const getStrategyRelayUrls = (strategy) =>
  normalizeOnlineStrategy(strategy) === ONLINE_STRATEGIES.torrent
    ? DEFAULT_TORRENT_TRACKER_URLS
    : DEFAULT_NOSTR_RELAY_URLS

const getStrategyLabel = (strategy) =>
  normalizeOnlineStrategy(strategy) === ONLINE_STRATEGIES.torrent ? 'tracker 后备' : 'Nostr relay'

const sameRoom = (state, message = {}) => {
  const stateRoom = normalizeRoomCode(state?.sessionId)
  const messageRoom = normalizeRoomCode(message.roomCode || message.snapshot?.sessionId)
  return Boolean(stateRoom && messageRoom && stateRoom === messageRoom)
}

const rejectRoomMismatch = (state) => ({
  ...state,
  lastError: '房间号不匹配'
})

const resolveSeatByPeer = (state, peerId) => {
  if (!peerId) return ''
  if (state.players?.[PLAYERS.black] === peerId) return PLAYERS.black
  if (state.players?.[PLAYERS.white] === peerId) return PLAYERS.white
  return ''
}

const createPlayers = (role, selfPeerId) => ({
  [PLAYERS.black]: role === 'host' ? selfPeerId : '',
  [PLAYERS.white]: role === 'guest' ? selfPeerId : ''
})

export const createOnlineState = ({
  roomCode = '',
  role = 'host',
  selfPeerId = '',
  strategy = ONLINE_STRATEGIES.nostr
} = {}) => {
  const normalizedRoom = normalizeRoomCode(roomCode)
  const localPlayer = role === 'guest' ? PLAYERS.white : PLAYERS.black
  const onlineStrategy = normalizeOnlineStrategy(strategy)
  const strategyLabel = getStrategyLabel(onlineStrategy)
  return {
    ...createInitialState({
      mode: 'online_room',
      sessionId: normalizedRoom,
      players: createPlayers(role, selfPeerId),
      localPlayer
    }),
    role,
    localPeerId: selfPeerId,
    hostPeerId: role === 'host' ? selfPeerId : '',
    remotePeerId: '',
    onlineStrategy,
    onlineStatus: role === 'host' ? 'waiting_peer' : 'connecting',
    appliedMessageIds: [],
    connectionMessage:
      role === 'host'
        ? `${strategyLabel} 房间已创建，等待对手加入。`
        : `正在通过 ${strategyLabel} 加入房间，等待房主同步棋盘。`
  }
}

export const applyPeerJoined = (state, peerId) => {
  if (!peerId || peerId === state.localPeerId) return state
  if (state.role === 'guest') {
    return {
      ...state,
      players: {
        ...state.players,
        [PLAYERS.black]: state.players?.[PLAYERS.black] || peerId
      },
      hostPeerId: state.hostPeerId || peerId,
      remotePeerId: peerId,
      onlineStatus: 'connected',
      connectionMessage: '已连接房主，等待同步棋盘。'
    }
  }

  if (state.players?.[PLAYERS.white] && state.players[PLAYERS.white] !== peerId) {
    return {
      ...state,
      connectionMessage: '已有白子对手，新的连接将作为旁观者等待。'
    }
  }

  return {
    ...state,
    players: {
      ...state.players,
      [PLAYERS.white]: state.players?.[PLAYERS.white] || peerId
    },
    remotePeerId: peerId,
    onlineStatus: 'connected',
    connectionMessage: '对手已加入，可以开始对局。'
  }
}

export const applyPeerLeft = (state, peerId) => {
  if (!peerId || (peerId !== state.remotePeerId && peerId !== state.hostPeerId)) return state
  return {
    ...state,
    onlineStatus: 'peer_left',
    connectionMessage: '对手已离开，可保留棋局或回到本地双人。'
  }
}

export const markOnlineTimeout = (state) => ({
  ...state,
  ...(state.onlineStrategy && nextOnlineStrategy(state.onlineStrategy)
    ? {
        onlineStatus: 'retrying',
        onlineStrategy: nextOnlineStrategy(state.onlineStrategy),
        connectionMessage: 'Nostr relay 连接超时，正在切换 tracker 后备。',
        lastError: ''
      }
    : {
        onlineStatus: 'failed',
        connectionMessage: '公共信令连接超时，可重试联机或切回本地双人。',
        lastError: ''
      })
})

const buildMoveMessage = (state, move, senderId, messageId = '') => ({
  type: 'move',
  messageId: messageId || createMessageId(senderId, 'move', state.moves.length),
  roomCode: state.sessionId,
  row: move.row,
  col: move.col,
  player: move.player,
  moveIndex: state.moves.length,
  senderId
})

export const applyLocalMove = (state, row, col, senderId = state.localPeerId) => {
  if (state.mode === 'online_room') {
    if (state.onlineStatus !== 'connected') {
      return {
        accepted: false,
        state: {
          ...state,
          lastError: '等待对手连接'
        },
        message: null
      }
    }
    if (state.players?.[state.localPlayer] !== senderId) {
      return {
        accepted: false,
        state: {
          ...state,
          lastError: '当前房间席位已满'
        },
        message: null
      }
    }
    if (state.currentPlayer !== state.localPlayer) {
      return {
        accepted: false,
        state: {
          ...state,
          lastError: '等待对手落子'
        },
        message: null
      }
    }
  }

  const next = placeStone(state, row, col, {
    player: state.localPlayer || state.currentPlayer,
    moveIndex: state.moves.length
  })
  const accepted = next.moves.length === state.moves.length + 1 && !next.lastError
  if (!accepted) {
    return {
      accepted: false,
      state: next,
      message: null
    }
  }

  const message = buildMoveMessage(state, next.lastMove, senderId)
  return {
    accepted: true,
    state: addAppliedMessageId(next, message.messageId),
    message
  }
}

export const applyRemoteMove = (state, message = {}, peerId = '') => {
  if (!sameRoom(state, message)) return rejectRoomMismatch(state)
  if (message.messageId && state.appliedMessageIds?.includes(message.messageId)) {
    return {
      ...state,
      lastError: ''
    }
  }

  const senderId = message.senderId || peerId
  const expectedPlayer = resolveSeatByPeer(state, senderId)
  if (!expectedPlayer || expectedPlayer !== message.player) {
    return {
      ...state,
      lastError: '玩家身份不匹配'
    }
  }

  const moveIndex = Number(message.moveIndex)
  if (Number.isInteger(moveIndex) && moveIndex < state.moves.length) {
    const existingMove = state.moves[moveIndex]
    if (
      existingMove?.row === Number(message.row) &&
      existingMove?.col === Number(message.col) &&
      existingMove?.player === message.player
    ) {
      return addAppliedMessageId(
        {
          ...state,
          lastError: ''
        },
        message.messageId
      )
    }
    if (existingMove?.player !== message.player) {
      return {
        ...state,
        lastError: '落子顺序已过期'
      }
    }
    return {
      ...state,
      lastError: '落子冲突，请等待房主同步'
    }
  }

  const next = placeStone(state, Number(message.row), Number(message.col), {
    player: message.player,
    moveIndex
  })
  if (next.lastError) return next
  return addAppliedMessageId(
    {
      ...next,
      onlineStatus: 'connected',
      connectionMessage: '对手已落子，轮到你了。'
    },
    message.messageId
  )
}

const snapshotFromState = (state) => ({
  board: state.board,
  currentPlayer: state.currentPlayer,
  status: state.status,
  winner: state.winner,
  winLine: state.winLine,
  moves: state.moves,
  lastMove: state.lastMove,
  players: state.players,
  sessionId: state.sessionId,
  hostPeerId: state.hostPeerId,
  remotePeerId: state.remotePeerId
})

export const buildSnapshotMessage = (state, senderId = state.localPeerId, targetPeerId = '') => ({
  type: 'snapshot',
  messageId: createMessageId(senderId, 'snapshot', state.moves.length),
  roomCode: state.sessionId,
  senderId,
  targetPeerId,
  snapshot: snapshotFromState((() => {
    const whitePeer = state.players?.[PLAYERS.white] || ''
    const canAssignTargetAsWhite = targetPeerId && (!whitePeer || whitePeer === targetPeerId)
    return {
      ...state,
      players: canAssignTargetAsWhite
        ? {
            ...state.players,
            [PLAYERS.white]: targetPeerId
          }
        : state.players,
      remotePeerId: canAssignTargetAsWhite ? targetPeerId : state.remotePeerId
    }
  })())
})

export const applySnapshotMessage = (state, message = {}, peerId = '') => {
  if (message.targetPeerId && message.targetPeerId !== state.localPeerId) return state
  if (!sameRoom(state, message)) return rejectRoomMismatch(state)
  const senderId = message.senderId || peerId
  if (state.hostPeerId && senderId && state.hostPeerId !== senderId) {
    return {
      ...state,
      lastError: '只接受房主同步'
    }
  }
  if (message.messageId && state.appliedMessageIds?.includes(message.messageId)) return state
  const snapshot = message.snapshot || {}
  const next = {
    ...state,
    board: Array.isArray(snapshot.board) ? snapshot.board.map((row) => row.slice()) : state.board,
    currentPlayer: snapshot.currentPlayer || state.currentPlayer,
    status: snapshot.status || state.status,
    winner: snapshot.winner || null,
    winLine: Array.isArray(snapshot.winLine) ? snapshot.winLine : [],
    moves: Array.isArray(snapshot.moves) ? snapshot.moves : [],
    lastMove: snapshot.lastMove || null,
    players: snapshot.players || state.players,
    sessionId: normalizeRoomCode(snapshot.sessionId || message.roomCode || state.sessionId),
    hostPeerId: snapshot.hostPeerId || senderId || state.hostPeerId,
    remotePeerId: senderId || state.remotePeerId,
    onlineStatus: 'connected',
    connectionMessage: '棋盘已同步，可以继续对局。',
    lastError: ''
  }
  return addAppliedMessageId(next, message.messageId)
}

export const buildRestartMessage = (state, senderId = state.localPeerId) => ({
  type: 'restart',
  messageId: createMessageId(senderId, 'restart', state.moves.length),
  roomCode: state.sessionId,
  senderId
})

const restartOnlineState = (state) => ({
  ...restartGame(state),
  role: state.role,
  localPeerId: state.localPeerId,
  hostPeerId: state.hostPeerId,
  remotePeerId: state.remotePeerId,
  onlineStatus: state.remotePeerId ? 'connected' : state.onlineStatus,
  connectionMessage: '棋局已重开。',
  appliedMessageIds: Array.isArray(state.appliedMessageIds) ? state.appliedMessageIds : []
})

export const applyRemoteRestart = (state, message = {}, peerId = '') => {
  if (!sameRoom(state, message)) return rejectRoomMismatch(state)
  if (message.messageId && state.appliedMessageIds?.includes(message.messageId)) return state
  const senderId = message.senderId || peerId
  if (!resolveSeatByPeer(state, senderId)) {
    return {
      ...state,
      lastError: '玩家身份不匹配'
    }
  }
  return addAppliedMessageId(restartOnlineState(state), message.messageId)
}

export const applyLocalRestart = (state, senderId = state.localPeerId) => {
  const message = buildRestartMessage(state, senderId)
  return {
    state: addAppliedMessageId(restartOnlineState(state), message.messageId),
    message
  }
}

export const loadTrysteroNostr = () => import(/* @vite-ignore */ TRYSTERO_NOSTR_URL)
export const loadTrysteroTorrent = () => import(/* @vite-ignore */ TRYSTERO_TORRENT_URL)

export const loadTrysteroStrategy = (strategy) =>
  normalizeOnlineStrategy(strategy) === ONLINE_STRATEGIES.torrent
    ? loadTrysteroTorrent()
    : loadTrysteroNostr()

export const createTrysteroGomokuRoom = async ({
  roomCode = '',
  strategy = ONLINE_STRATEGIES.nostr,
  importTrystero,
  onEvent = () => {}
} = {}) => {
  const normalizedRoom = normalizeRoomCode(roomCode)
  if (!normalizedRoom) throw new Error('房间号不能为空')
  const onlineStrategy = normalizeOnlineStrategy(strategy)

  const trystero = await (importTrystero
    ? importTrystero(onlineStrategy)
    : loadTrysteroStrategy(onlineStrategy))
  const room = trystero.joinRoom(
    {
      appId: ONLINE_APP_ID,
      relayConfig: {
        urls: getStrategyRelayUrls(onlineStrategy)
      }
    },
    normalizedRoom
  )
  const [sendRawMessage, receiveRawMessage] = room.makeAction('gomoku')

  receiveRawMessage((message, peerId) => {
    onEvent({ type: 'message', message, peerId })
  })
  room.onPeerJoin((peerId) => {
    onEvent({ type: 'peer_join', peerId })
  })
  room.onPeerLeave((peerId) => {
    onEvent({ type: 'peer_leave', peerId })
  })

  return {
    roomCode: normalizedRoom,
    selfPeerId: trystero.selfId || '',
    strategy: onlineStrategy,
    send(message, targetPeerId) {
      return sendRawMessage(message, targetPeerId)
    },
    close() {
      room.leave()
    }
  }
}
