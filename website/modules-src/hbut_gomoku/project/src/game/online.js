import { PLAYERS, createInitialState, placeStone, restartGame } from './gomoku.js'

export const ONLINE_APP_ID = 'mini-hbut-gomoku'
export const MATCHMAKING_ROOM_CODE = 'HBUTGOMOKUMATCH'
export const TRYSTERO_NOSTR_URL = 'https://esm.sh/trystero/nostr?bundle'
export const TRYSTERO_TORRENT_URL = 'https://esm.sh/@trystero-p2p/torrent?bundle'
export const DEFAULT_NOSTR_RELAY_URLS = Object.freeze([
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://relay.snort.social'
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
const MATCH_ROOM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'

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

const addAppliedLobbyMessageId = (state, messageId) => {
  if (!messageId) return state
  const current = Array.isArray(state.appliedLobbyMessageIds) ? state.appliedLobbyMessageIds : []
  if (current.includes(messageId)) return state
  return {
    ...state,
    appliedLobbyMessageIds: [...current, messageId].slice(-160)
  }
}

const hashToToken = (value) => {
  let hash = 2166136261
  const text = String(value || '')
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 16777619) >>> 0
  }
  let token = ''
  let current = hash || 1
  for (let index = 0; index < 10; index += 1) {
    current = Math.imul(current ^ (index + 97), 16777619) >>> 0
    token += MATCH_ROOM_ALPHABET[current % MATCH_ROOM_ALPHABET.length]
  }
  return token
}

const normalizePeerId = (peerId) => String(peerId || '').trim()

export const createMatchmakingState = ({ selfPeerId = '' } = {}) => {
  const normalizedSelf = normalizePeerId(selfPeerId)
  return {
    selfPeerId: normalizedSelf,
    peers: normalizedSelf
      ? {
          [normalizedSelf]: {
            peerId: normalizedSelf,
            queued: false
          }
        }
      : {},
    selfQueued: false,
    match: null,
    lastError: '',
    appliedLobbyMessageIds: []
  }
}

export const getMatchmakingOnlineCount = (state) => Object.keys(state?.peers || {}).length

export const getMatchmakingQueueCount = (state) =>
  Object.values(state?.peers || {}).filter((peer) => peer?.queued).length

export const resolveMatchPair = (selfPeerId, opponentPeerId) => {
  const self = normalizePeerId(selfPeerId)
  const opponent = normalizePeerId(opponentPeerId)
  const [hostPeerId, guestPeerId] = [self, opponent].sort((left, right) =>
    left.localeCompare(right)
  )
  const roomCode = `PK${hashToToken(`${hostPeerId}:${guestPeerId}`)}`
  const localPlayer = self === hostPeerId ? PLAYERS.black : PLAYERS.white
  return {
    roomCode,
    role: self === hostPeerId ? 'host' : 'guest',
    localPlayer,
    hostPeerId,
    guestPeerId,
    opponentPeerId: self === hostPeerId ? guestPeerId : hostPeerId
  }
}

export const buildLobbyPresenceMessage = ({ selfPeerId = '', queued = false } = {}) => ({
  type: 'lobby_presence',
  messageId: createMessageId(selfPeerId, 'lobby_presence', queued ? 1 : 0),
  senderId: normalizePeerId(selfPeerId),
  queued: Boolean(queued)
})

export const buildQueueMessage = ({ selfPeerId = '' } = {}) => ({
  type: 'lobby_queue',
  messageId: createMessageId(selfPeerId, 'lobby_queue', 1),
  senderId: normalizePeerId(selfPeerId),
  queued: true
})

export const buildCancelMessage = ({ selfPeerId = '' } = {}) => ({
  type: 'lobby_cancel',
  messageId: createMessageId(selfPeerId, 'lobby_cancel', 0),
  senderId: normalizePeerId(selfPeerId),
  queued: false
})

export const buildMatchStartMessage = (pair, senderId = '') => ({
  type: 'lobby_match_start',
  messageId: createMessageId(senderId, 'lobby_match_start', 1),
  senderId: normalizePeerId(senderId),
  roomCode: pair?.roomCode || '',
  hostPeerId: pair?.hostPeerId || '',
  guestPeerId: pair?.guestPeerId || ''
})

const upsertLobbyPeer = (state, peerId, queued) => {
  const normalizedPeer = normalizePeerId(peerId)
  if (!normalizedPeer) return state
  const peers = {
    ...state.peers,
    [normalizedPeer]: {
      ...(state.peers?.[normalizedPeer] || {}),
      peerId: normalizedPeer,
      queued: Boolean(queued)
    }
  }
  return {
    ...state,
    peers,
    selfQueued: normalizedPeer === state.selfPeerId ? Boolean(queued) : state.selfQueued
  }
}

const resolveQueuedOpponent = (state) =>
  Object.values(state.peers || {})
    .filter((peer) => peer?.peerId && peer.peerId !== state.selfPeerId && peer.queued)
    .map((peer) => peer.peerId)
    .sort((left, right) => left.localeCompare(right))[0] || ''

const withResolvedMatch = (state, peerId) => {
  if (!state.selfPeerId || !peerId || peerId === state.selfPeerId) return state
  const pair = resolveMatchPair(state.selfPeerId, peerId)
  return {
    ...state,
    selfQueued: false,
    match: pair,
    lastError: '',
    peers: {
      ...state.peers,
      [state.selfPeerId]: {
        ...(state.peers?.[state.selfPeerId] || {}),
        peerId: state.selfPeerId,
        queued: false
      },
      [peerId]: {
        ...(state.peers?.[peerId] || {}),
        peerId,
        queued: false
      }
    }
  }
}

const clearMatchIfPeerInvolved = (state, peerId) => {
  const normalizedPeer = normalizePeerId(peerId)
  const match = state.match
  if (
    !normalizedPeer ||
    !match ||
    ![state.selfPeerId, match.opponentPeerId, match.hostPeerId, match.guestPeerId].includes(
      normalizedPeer
    )
  ) {
    return state
  }
  return {
    ...state,
    match: null
  }
}

const applyMatchStartMessage = (state, message = {}, senderId = '') => {
  const hostPeerId = normalizePeerId(message.hostPeerId)
  const guestPeerId = normalizePeerId(message.guestPeerId)
  const sender = normalizePeerId(message.senderId || senderId)
  if (!hostPeerId || !guestPeerId || !sender || (sender !== hostPeerId && sender !== guestPeerId)) {
    return {
      ...state,
      lastError: '匹配发起者不在对局双方中'
    }
  }
  const expectedRoom = resolveMatchPair(hostPeerId, guestPeerId).roomCode
  if (expectedRoom !== normalizeRoomCode(message.roomCode)) {
    return {
      ...state,
      lastError: '匹配发起者不在对局双方中'
    }
  }
  if (state.selfPeerId !== hostPeerId && state.selfPeerId !== guestPeerId) return state
  return withResolvedMatch(state, state.selfPeerId === hostPeerId ? guestPeerId : hostPeerId)
}

export const applyLobbyMessage = (state, message = {}, peerId = '') => {
  if (!state) return state
  const senderId = normalizePeerId(message.senderId || peerId)
  if (message.messageId && state.appliedLobbyMessageIds?.includes(message.messageId)) return state
  if (peerId && senderId && senderId !== peerId) {
    return {
      ...state,
      lastError: '大厅身份不匹配'
    }
  }

  let next = state
  if (message.type === 'lobby_presence') {
    next = upsertLobbyPeer(state, senderId, Boolean(message.queued))
  } else if (message.type === 'lobby_queue') {
    next = upsertLobbyPeer(state, senderId, true)
    if (senderId === state.selfPeerId) {
      const opponentPeerId = resolveQueuedOpponent(next)
      if (opponentPeerId) next = withResolvedMatch(next, opponentPeerId)
    } else if (next.selfQueued) {
      next = withResolvedMatch(next, senderId)
    }
  } else if (message.type === 'lobby_cancel') {
    next = clearMatchIfPeerInvolved(upsertLobbyPeer(state, senderId, false), senderId)
  } else if (message.type === 'lobby_leave') {
    const peers = { ...(state.peers || {}) }
    delete peers[senderId]
    next = clearMatchIfPeerInvolved(
      {
        ...state,
        peers,
        selfQueued: senderId === state.selfPeerId ? false : state.selfQueued
      },
      senderId
    )
  } else if (message.type === 'lobby_match_start') {
    next = applyMatchStartMessage(state, message, peerId)
  } else {
    return state
  }
  return addAppliedLobbyMessageId(next, message.messageId)
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

const resolveTrysteroAction = (action) => {
  // 兼容 Trystero 旧版数组 API 和新版对象 API，避免大厅连接在运行时失败。
  if (Array.isArray(action)) {
    const [send, receive] = action
    if (typeof send !== 'function' || typeof receive !== 'function') {
      return { send: null, receive: null }
    }
    return {
      send(message, targetPeerId) {
        return send(message, targetPeerId)
      },
      receive
    }
  }
  if (action && typeof action === 'object') {
    if (typeof action.send !== 'function') {
      return { send: null, receive: null }
    }
    return {
      send(message, targetPeerId) {
        return action.send(message, targetPeerId ? { target: targetPeerId } : undefined)
      },
      receive(handler) {
        const wrappedHandler = (message, peer) => {
          handler(message, peer?.peerId || peer)
        }
        if (typeof action.onMessage === 'function') {
          action.onMessage(wrappedHandler)
          return
        }
        try {
          action.onMessage = wrappedHandler
        } catch {
          throw new Error('Trystero 消息通道不可用')
        }
      }
    }
  }
  return { send: null, receive: null }
}

const resolvePeerEventId = (peer) => normalizePeerId(peer?.peerId || peer)

const registerTrysteroPeerEvent = (room, eventName, handler) => {
  const wrappedHandler = (peer) => handler(resolvePeerEventId(peer))
  if (typeof room?.[eventName] === 'function') {
    room[eventName](wrappedHandler)
    return
  }
  const descriptor = Object.getOwnPropertyDescriptor(room || {}, eventName)
  if (descriptor?.set || eventName in (room || {})) {
    room[eventName] = wrappedHandler
    return
  }
  throw new Error('Trystero 房间事件不可用')
}

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
  const action = resolveTrysteroAction(room.makeAction('gomoku'))
  if (typeof action.send !== 'function' || typeof action.receive !== 'function') {
    throw new Error('Trystero 消息通道不可用')
  }

  action.receive((message, peerId) => {
    onEvent({ type: 'message', message, peerId })
  })
  registerTrysteroPeerEvent(room, 'onPeerJoin', (peerId) => {
    onEvent({ type: 'peer_join', peerId })
  })
  registerTrysteroPeerEvent(room, 'onPeerLeave', (peerId) => {
    onEvent({ type: 'peer_leave', peerId })
  })

  return {
    roomCode: normalizedRoom,
    selfPeerId: trystero.selfId || '',
    strategy: onlineStrategy,
    send(message, targetPeerId) {
      return action.send(message, targetPeerId)
    },
    close() {
      room.leave()
    }
  }
}
