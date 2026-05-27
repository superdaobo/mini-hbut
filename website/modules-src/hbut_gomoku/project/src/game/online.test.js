import { describe, expect, it } from 'vitest'
import { getCell } from './gomoku.js'
import {
  DEFAULT_NOSTR_RELAY_URLS,
  DEFAULT_TORRENT_TRACKER_URLS,
  MATCHMAKING_ROOM_CODE,
  ONLINE_APP_ID,
  TRYSTERO_TORRENT_URL,
  applyLocalMove,
  applyLobbyMessage,
  applyPeerJoined,
  applyRemoteMove,
  applyRemoteRestart,
  applySnapshotMessage,
  buildCancelMessage,
  buildLobbyPresenceMessage,
  buildMatchStartMessage,
  buildQueueMessage,
  buildRestartMessage,
  buildSnapshotMessage,
  createMatchmakingState,
  createHfRelayGomokuRoom,
  createOnlineState,
  createRoomCode,
  createTrysteroGomokuRoom,
  getMatchmakingOnlineCount,
  getMatchmakingQueueCount,
  markOnlineTimeout,
  nextOnlineStrategy,
  normalizeRoomCode,
  resolveMatchPair
} from './online.js'

describe('湖工五子棋联机协议', () => {
  it('规范化房间号并创建可分享房间号', () => {
    expect(normalizeRoomCode(' hbut-12_3  ')).toBe('HBUT123')
    expect(normalizeRoomCode('')).toBe('')
    expect(createRoomCode(() => 0.123456)).toMatch(/^HBUT-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
  })

  it('按房主/加入者初始化在线状态和座位', () => {
    const host = createOnlineState({
      roomCode: 'hbut-2026',
      role: 'host',
      selfPeerId: 'peer-host'
    })
    const guest = createOnlineState({
      roomCode: 'hbut-2026',
      role: 'guest',
      selfPeerId: 'peer-guest'
    })

    expect(host).toMatchObject({
      mode: 'online_room',
      sessionId: 'HBUT2026',
      localPeerId: 'peer-host',
      localPlayer: 'black',
      hostPeerId: 'peer-host',
      onlineStatus: 'waiting_peer',
      players: {
        black: 'peer-host',
        white: ''
      }
    })
    expect(guest).toMatchObject({
      mode: 'online_room',
      sessionId: 'HBUT2026',
      localPeerId: 'peer-guest',
      localPlayer: 'white',
      hostPeerId: '',
      onlineStatus: 'connecting',
      players: {
        black: '',
        white: 'peer-guest'
      }
    })
  })

  it('匹配对局按大厅 peerId 固定黑白席位，避免进入 PK 房间后双方都等待', () => {
    const pair = resolveMatchPair('peer-z', 'peer-a')
    const guest = createOnlineState({
      roomCode: pair.roomCode,
      role: pair.role,
      selfPeerId: 'peer-z',
      strategy: 'hf-relay',
      match: pair
    })

    expect(pair.role).toBe('guest')
    expect(guest).toMatchObject({
      localPeerId: 'peer-z',
      localPlayer: 'white',
      hostPeerId: 'peer-a',
      remotePeerId: 'peer-a',
      players: {
        black: 'peer-a',
        white: 'peer-z'
      }
    })

    const connectedGuest = applyPeerJoined(guest, 'peer-a')
    expect(connectedGuest.onlineStatus).toBe('connected')
    expect(connectedGuest.players).toEqual({
      black: 'peer-a',
      white: 'peer-z'
    })
  })

  it('匹配对局绑定首个真实对手连接后不被后续 peer_join 覆盖', () => {
    const pair = resolveMatchPair('peer-a', 'peer-z')
    const host = createOnlineState({
      roomCode: pair.roomCode,
      role: pair.role,
      selfPeerId: 'peer-a',
      transportPeerId: 'transport-a',
      strategy: 'nostr',
      match: pair
    })

    const connected = applyPeerJoined(host, 'transport-z')
    const afterSpectator = applyPeerJoined(connected, 'transport-spectator')

    expect(connected.remotePeerId).toBe('transport-z')
    expect(afterSpectator.remotePeerId).toBe('transport-z')
    expect(afterSpectator.players).toEqual({
      black: 'peer-a',
      white: 'peer-z'
    })
  })

  it('同步落子时校验座位、手数和消息幂等', () => {
    let host = createOnlineState({
      roomCode: 'A100',
      role: 'host',
      selfPeerId: 'host-peer'
    })
    host = applyPeerJoined(host, 'guest-peer')

    const local = applyLocalMove(host, 7, 7, 'host-peer')
    expect(local.accepted).toBe(true)
    expect(local.message).toMatchObject({
      type: 'move',
      player: 'black',
      moveIndex: 0,
      senderId: 'host-peer'
    })

    const guestMove = {
      type: 'move',
      messageId: 'move-guest-1',
      roomCode: 'A100',
      row: 7,
      col: 8,
      player: 'white',
      moveIndex: 1,
      senderId: 'guest-peer'
    }
    const moved = applyRemoteMove(local.state, guestMove, 'guest-peer')
    expect(getCell(moved.board, 7, 8)).toBe('white')
    expect(moved.moves).toHaveLength(2)
    expect(moved.appliedMessageIds).toContain('move-guest-1')

    const duplicate = applyRemoteMove(moved, guestMove, 'guest-peer')
    expect(duplicate.moves).toHaveLength(2)
    expect(duplicate.lastError).toBe('')

    const illegalSeat = applyRemoteMove(local.state, {
      ...guestMove,
      messageId: 'move-guest-2',
      player: 'black',
      moveIndex: 1
    }, 'guest-peer')
    expect(illegalSeat.lastError).toBe('玩家身份不匹配')
    expect(illegalSeat.moves).toHaveLength(1)

    const stale = applyRemoteMove(local.state, {
      ...guestMove,
      messageId: 'move-guest-3',
      moveIndex: 0
    }, 'guest-peer')
    expect(stale.lastError).toBe('落子顺序已过期')
    expect(stale.moves).toHaveLength(1)

    const missingRoom = applyRemoteMove(local.state, {
      ...guestMove,
      messageId: 'move-guest-no-room',
      roomCode: ''
    }, 'guest-peer')
    expect(missingRoom.lastError).toBe('房间号不匹配')
    expect(missingRoom.moves).toHaveLength(1)
  })

  it('拒绝跨房间落子并把同一逻辑落子视为幂等', () => {
    let host = createOnlineState({
      roomCode: 'ROOM-A',
      role: 'host',
      selfPeerId: 'host-peer'
    })
    host = applyPeerJoined(host, 'guest-peer')
    host = applyLocalMove(host, 7, 7, 'host-peer').state

    const crossRoom = applyRemoteMove(host, {
      type: 'move',
      messageId: 'move-cross-room',
      roomCode: 'ROOM-B',
      row: 7,
      col: 8,
      player: 'white',
      moveIndex: 1,
      senderId: 'guest-peer'
    }, 'guest-peer')
    expect(crossRoom.lastError).toBe('房间号不匹配')
    expect(crossRoom.moves).toHaveLength(1)

    const moved = applyRemoteMove(host, {
      type: 'move',
      messageId: 'move-white-1-a',
      roomCode: 'ROOM-A',
      row: 7,
      col: 8,
      player: 'white',
      moveIndex: 1,
      senderId: 'guest-peer'
    }, 'guest-peer')
    const sameLogicalMove = applyRemoteMove(moved, {
      type: 'move',
      messageId: 'move-white-1-b',
      roomCode: 'ROOM-A',
      row: 7,
      col: 8,
      player: 'white',
      moveIndex: 1,
      senderId: 'guest-peer'
    }, 'guest-peer')
    expect(sameLogicalMove.moves).toHaveLength(2)
    expect(sameLogicalMove.lastError).toBe('')

    const conflict = applyRemoteMove(moved, {
      type: 'move',
      messageId: 'move-white-1-conflict',
      roomCode: 'ROOM-A',
      row: 8,
      col: 8,
      player: 'white',
      moveIndex: 1,
      senderId: 'guest-peer'
    }, 'guest-peer')
    expect(conflict.lastError).toBe('落子冲突，请等待房主同步')
    expect(conflict.moves).toHaveLength(2)
  })

  it('通过快照和重开消息恢复房间状态', () => {
    let host = createOnlineState({
      roomCode: 'SYNC',
      role: 'host',
      selfPeerId: 'host-peer'
    })
    host = applyPeerJoined(host, 'guest-peer')
    host = applyLocalMove(host, 7, 7, 'host-peer').state

    const guest = createOnlineState({
      roomCode: 'SYNC',
      role: 'guest',
      selfPeerId: 'guest-peer'
    })
    const snapshot = buildSnapshotMessage(host, 'host-peer')
    const syncedGuest = applySnapshotMessage(guest, snapshot, 'host-peer')

    expect(syncedGuest.localPeerId).toBe('guest-peer')
    expect(syncedGuest.localPlayer).toBe('white')
    expect(syncedGuest.hostPeerId).toBe('host-peer')
    expect(syncedGuest.moves).toHaveLength(1)
    expect(getCell(syncedGuest.board, 7, 7)).toBe('black')

    const restartMessage = buildRestartMessage(host, 'host-peer')
    const restartedGuest = applyRemoteRestart(syncedGuest, restartMessage, 'host-peer')
    expect(restartedGuest.moves).toEqual([])
    expect(restartedGuest.sessionId).toBe('SYNC')
    expect(restartedGuest.localPeerId).toBe('guest-peer')
    expect(restartedGuest.localPlayer).toBe('white')

    const crossRoomRestart = applyRemoteRestart(syncedGuest, {
      ...restartMessage,
      messageId: 'restart-cross-room',
      roomCode: 'OTHER'
    }, 'host-peer')
    expect(crossRoomRestart.moves).toHaveLength(1)
    expect(crossRoomRestart.lastError).toBe('房间号不匹配')
  })

  it('快照只接受同房间且目标匹配的房主同步', () => {
    const guest = createOnlineState({
      roomCode: 'TARGET',
      role: 'guest',
      selfPeerId: 'guest-peer'
    })
    const host = applyPeerJoined(
      createOnlineState({
        roomCode: 'TARGET',
        role: 'host',
        selfPeerId: 'host-peer'
      }),
      'guest-peer'
    )

    const targetOther = applySnapshotMessage(
      guest,
      buildSnapshotMessage(host, 'host-peer', 'other-peer'),
      'host-peer'
    )
    expect(targetOther.moves).toHaveLength(0)
    expect(targetOther.lastError).toBe('')

    const crossRoomSnapshot = applySnapshotMessage(
      guest,
      {
        ...buildSnapshotMessage(host, 'host-peer', 'guest-peer'),
        messageId: 'snapshot-cross-room',
        roomCode: 'OTHER',
        snapshot: {
          ...buildSnapshotMessage(host, 'host-peer', 'guest-peer').snapshot,
          sessionId: 'OTHER'
        }
      },
      'host-peer'
    )
    expect(crossRoomSnapshot.sessionId).toBe('TARGET')
    expect(crossRoomSnapshot.lastError).toBe('房间号不匹配')

    const syncedGuest = applySnapshotMessage(
      guest,
      buildSnapshotMessage(host, 'host-peer', 'guest-peer'),
      'host-peer'
    )
    const rogueHost = applyPeerJoined(
      createOnlineState({
        roomCode: 'TARGET',
        role: 'host',
        selfPeerId: 'rogue-peer'
      }),
      'guest-peer'
    )
    const forgedSnapshot = applySnapshotMessage(
      syncedGuest,
      buildSnapshotMessage(
        applyLocalMove(rogueHost, 7, 7, 'rogue-peer').state,
        'rogue-peer',
        'guest-peer'
      ),
      'rogue-peer'
    )
    expect(forgedSnapshot.hostPeerId).toBe('host-peer')
    expect(forgedSnapshot.moves).toHaveLength(0)
    expect(forgedSnapshot.lastError).toBe('只接受房主同步')
  })

  it('房主快照能携带指定加入者的白子席位', () => {
    const host = createOnlineState({
      roomCode: 'SEAT',
      role: 'host',
      selfPeerId: 'host-peer'
    })

    const snapshot = buildSnapshotMessage(host, 'host-peer', 'new-guest-peer')

    expect(snapshot.targetPeerId).toBe('new-guest-peer')
    expect(snapshot.snapshot.players).toEqual({
      black: 'host-peer',
      white: 'new-guest-peer'
    })
    expect(snapshot.snapshot.remotePeerId).toBe('new-guest-peer')
  })

  it('房主只接受首个白子加入，后续 peer 保持旁观不覆盖席位', () => {
    let host = createOnlineState({
      roomCode: 'SEAT',
      role: 'host',
      selfPeerId: 'host-peer'
    })

    host = applyPeerJoined(host, 'guest-one')
    const afterSecondJoin = applyPeerJoined(host, 'guest-two')
    const secondSnapshot = buildSnapshotMessage(afterSecondJoin, 'host-peer', 'guest-two')

    expect(afterSecondJoin.players.white).toBe('guest-one')
    expect(afterSecondJoin.remotePeerId).toBe('guest-one')
    expect(secondSnapshot.snapshot.players.white).toBe('guest-one')
    expect(secondSnapshot.snapshot.remotePeerId).toBe('guest-one')
  })

  it('连接等待超时后会在 HF、Nostr 和 tracker 之间多轮重试，最后才提示本地降级', () => {
    const host = createOnlineState({
      roomCode: 'TIME',
      role: 'host',
      selfPeerId: 'host-peer',
      strategy: 'nostr'
    })

    const timedOut = markOnlineTimeout(host)

    expect(nextOnlineStrategy('nostr')).toBe('torrent')
    expect(TRYSTERO_TORRENT_URL).toContain('@trystero-p2p/torrent')
    expect(timedOut.onlineStatus).toBe('retrying')
    expect(timedOut.onlineStrategy).toBe('torrent')
    expect(timedOut.connectionMessage).toContain('tracker 后备')
    expect(timedOut.sessionId).toBe('TIME')
    expect(timedOut.moves).toEqual([])

    const secondRetry = markOnlineTimeout(timedOut)
    expect(secondRetry.onlineStatus).toBe('retrying')
    expect(secondRetry.onlineStrategy).toBe('hf-relay')
    expect(secondRetry.connectionMessage).toContain('HF 中转')

    const fallbackFailed = markOnlineTimeout({
      ...secondRetry,
      onlineRetryAttempts: 5
    })
    expect(fallbackFailed.onlineStatus).toBe('failed')
    expect(fallbackFailed.onlineStrategy).toBe('hf-relay')
    expect(fallbackFailed.connectionMessage).toContain('公共信令连接超时')
    expect(fallbackFailed.moves).toEqual([])
  })

  it('使用 Trystero Nostr 适配器加入房间、收发消息并关闭连接', async () => {
    const calls = []
    const handlers = {}
    const room = {
      makeAction(actionId) {
        calls.push(['makeAction', actionId])
        return [
          (payload, targetPeer) => {
            calls.push(['send', payload, targetPeer])
            return Promise.resolve()
          },
          (handler) => {
            handlers.message = handler
          }
        ]
      },
      onPeerJoin(handler) {
        handlers.join = handler
      },
      onPeerLeave(handler) {
        handlers.leave = handler
      },
      leave() {
        calls.push(['leave'])
      }
    }
    const events = []
    const client = await createTrysteroGomokuRoom({
      roomCode: 'hbut-1234',
      importTrystero: () =>
        Promise.resolve({
          selfId: 'self-peer',
          joinRoom(config, roomId) {
            calls.push(['joinRoom', config, roomId])
            return room
          }
        }),
      onEvent: (event) => events.push(event)
    })

    expect(client.selfPeerId).toBe('self-peer')
    expect(client.strategy).toBe('nostr')
    expect(calls[0]).toEqual([
      'joinRoom',
      {
        appId: ONLINE_APP_ID,
        relayConfig: {
          urls: DEFAULT_NOSTR_RELAY_URLS
        }
      },
      'HBUT1234'
    ])
    expect(calls[1]).toEqual(['makeAction', 'gomoku'])

    handlers.join('peer-b')
    handlers.message({ type: 'hello', messageId: 'hello-1' }, 'peer-b')
    handlers.leave('peer-b')
    await client.send({ type: 'hello', messageId: 'hello-self' }, 'peer-b')
    client.close()

    expect(events).toEqual([
      { type: 'peer_join', peerId: 'peer-b' },
      { type: 'message', message: { type: 'hello', messageId: 'hello-1' }, peerId: 'peer-b' },
      { type: 'peer_leave', peerId: 'peer-b' }
    ])
    expect(calls.at(-2)).toEqual(['send', { type: 'hello', messageId: 'hello-self' }, 'peer-b'])
    expect(calls.at(-1)).toEqual(['leave'])
  })

  it('使用 HF 中转适配器加入房间、收发消息、轮询事件并关闭连接', async () => {
    const calls = []
    const events = []
    const fetchImpl = async (url, options = {}) => {
      const parsed = new URL(url)
      calls.push([parsed.pathname, options.method || 'GET', options.body || ''])
      if (parsed.pathname.endsWith('/join')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            room_code: 'ROOM1',
            peer_id: 'peer-a',
            cursor: 3,
            peers: ['peer-b', 'peer-a']
          })
        }
      }
      if (parsed.pathname.endsWith('/send')) {
        return {
          ok: true,
          json: async () => ({ success: true, event_id: 4, cursor: 4 })
        }
      }
      if (parsed.pathname.endsWith('/poll')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            cursor: 5,
            peers: ['peer-a', 'peer-b'],
            events: [
              {
                id: 5,
                type: 'message',
                peer_id: 'peer-b',
                message: { type: 'move', messageId: 'move-b' }
              }
            ]
          })
        }
      }
      if (parsed.pathname.endsWith('/leave')) {
        return {
          ok: true,
          json: async () => ({ success: true })
        }
      }
      throw new Error(`unexpected ${parsed.pathname}`)
    }

    const client = await createHfRelayGomokuRoom({
      roomCode: 'room-1',
      peerId: 'peer-a',
      baseUrl: 'https://mini-hbut-ocr-service.hf.space/api/gomoku-relay',
      fetchImpl,
      pollIntervalMs: 0,
      onEvent: (event) => events.push(event)
    })

    expect(client.selfPeerId).toBe('peer-a')
    expect(client.roomCode).toBe('ROOM1')
    expect(client.strategy).toBe('hf-relay')
    expect(events).toEqual([{ type: 'peer_join', peerId: 'peer-b' }])

    await client.send({ type: 'hello', messageId: 'hello-a' }, 'peer-b')
    await client.pollOnce()
    await client.close()

    const sendBody = JSON.parse(calls.find((item) => item[0].endsWith('/send'))[2])
    expect(sendBody).toEqual({
      room_code: 'ROOM1',
      peer_id: 'peer-a',
      target_peer_id: 'peer-b',
      message: { type: 'hello', messageId: 'hello-a' }
    })
    expect(calls.some((item) => item[0].endsWith('/poll'))).toBe(true)
    expect(calls.at(-1)[0]).toMatch(/\/leave$/)
    expect(events.at(-1)).toEqual({
      type: 'message',
      message: { type: 'move', messageId: 'move-b' },
      peerId: 'peer-b'
    })
  })

  it('HF 中转发送本端消息后不推进轮询游标，避免跳过未拉取的对手事件', async () => {
    const pollUrls = []
    const events = []
    const fetchImpl = async (url, options = {}) => {
      const parsed = new URL(url)
      if (parsed.pathname.endsWith('/join')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            room_code: 'ROOM1',
            peer_id: 'peer-a',
            cursor: 1,
            peers: ['peer-a']
          })
        }
      }
      if (parsed.pathname.endsWith('/send')) {
        return {
          ok: true,
          json: async () => ({ success: true, event_id: 3, cursor: 3 })
        }
      }
      if (parsed.pathname.endsWith('/poll')) {
        pollUrls.push(parsed)
        return {
          ok: true,
          json: async () => ({
            success: true,
            cursor: 3,
            peers: ['peer-a', 'peer-b'],
            events: [
              {
                id: 2,
                type: 'message',
                peer_id: 'peer-b',
                message: { type: 'move', messageId: 'move-b' }
              }
            ]
          })
        }
      }
      if (parsed.pathname.endsWith('/leave')) {
        return {
          ok: true,
          json: async () => ({ success: true })
        }
      }
      throw new Error(`unexpected ${parsed.pathname}`)
    }

    const client = await createHfRelayGomokuRoom({
      roomCode: 'room-1',
      peerId: 'peer-a',
      fetchImpl,
      pollIntervalMs: 0,
      onEvent: (event) => events.push(event)
    })

    await client.send({ type: 'hello', messageId: 'hello-a' })
    await client.pollOnce()
    await client.close()

    expect(pollUrls[0].searchParams.get('cursor')).toBe('1')
    expect(events).toContainEqual({
      type: 'message',
      message: { type: 'move', messageId: 'move-b' },
      peerId: 'peer-b'
    })
  })

  it('HF 中转轮询发现移动端 peer 过期后会用同一 peerId 自动重入房间并继续拉取事件', async () => {
    let joinAttempts = 0
    let pollAttempts = 0
    const events = []
    const fetchImpl = async (url, options = {}) => {
      const parsed = new URL(url)
      if (parsed.pathname.endsWith('/join')) {
        joinAttempts += 1
        return {
          ok: true,
          json: async () => ({
            success: true,
            room_code: 'ROOM1',
            peer_id: 'peer-a',
            cursor: joinAttempts === 1 ? 1 : 2,
            peers: joinAttempts === 1 ? ['peer-a'] : ['peer-a', 'peer-b']
          })
        }
      }
      if (parsed.pathname.endsWith('/poll')) {
        pollAttempts += 1
        if (pollAttempts === 1) {
          return {
            ok: false,
            status: 404,
            json: async () => ({ success: false, error: '房间或 peer 不存在' })
          }
        }
        return {
          ok: true,
          json: async () => ({
            success: true,
            cursor: 3,
            peers: ['peer-a', 'peer-b'],
            events: [
              {
                id: 3,
                type: 'message',
                peer_id: 'peer-b',
                message: { type: 'move', messageId: 'move-after-rejoin' }
              }
            ]
          })
        }
      }
      if (parsed.pathname.endsWith('/leave')) {
        return {
          ok: true,
          json: async () => ({ success: true })
        }
      }
      throw new Error(`unexpected ${parsed.pathname}`)
    }

    const client = await createHfRelayGomokuRoom({
      roomCode: 'room-1',
      peerId: 'peer-a',
      fetchImpl,
      pollIntervalMs: 0,
      onEvent: (event) => events.push(event)
    })

    await client.pollOnce()
    await client.close()

    expect(joinAttempts).toBe(2)
    expect(pollAttempts).toBe(2)
    expect(events).toContainEqual({ type: 'peer_join', peerId: 'peer-b' })
    expect(events).toContainEqual({
      type: 'message',
      message: { type: 'move', messageId: 'move-after-rejoin' },
      peerId: 'peer-b'
    })
  })

  it('HF 中转发送遇到短暂失败会重试，避免移动网络抖动直接断开对局', async () => {
    let sendAttempts = 0
    const fetchImpl = async (url) => {
      const parsed = new URL(url)
      if (parsed.pathname.endsWith('/join')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            room_code: 'ROOM1',
            peer_id: 'peer-a',
            cursor: 1,
            peers: ['peer-a', 'peer-b']
          })
        }
      }
      if (parsed.pathname.endsWith('/send')) {
        sendAttempts += 1
        if (sendAttempts === 1) {
          return {
            ok: false,
            status: 503,
            json: async () => ({ success: false, error: '服务临时不可用' })
          }
        }
        return {
          ok: true,
          json: async () => ({ success: true, event_id: 2, cursor: 2 })
        }
      }
      if (parsed.pathname.endsWith('/leave')) {
        return {
          ok: true,
          json: async () => ({ success: true })
        }
      }
      throw new Error(`unexpected ${parsed.pathname}`)
    }

    const client = await createHfRelayGomokuRoom({
      roomCode: 'room-1',
      peerId: 'peer-a',
      fetchImpl,
      pollIntervalMs: 0
    })

    await client.send({ type: 'move', messageId: 'retry-send' }, 'peer-b')
    await client.close()

    expect(sendAttempts).toBe(2)
  })

  it('兼容新版 Trystero makeAction 对象返回值', async () => {
    const calls = []
    const handlers = {}
    const room = {
      makeAction(actionId) {
        calls.push(['makeAction', actionId])
        return {
          send(payload, targetPeer) {
            calls.push(['send', payload, targetPeer])
            return Promise.resolve()
          },
          get onMessage() {
            return handlers.message || null
          },
          set onMessage(handler) {
            handlers.message = handler
          }
        }
      },
      get onPeerJoin() {
        return handlers.join || null
      },
      set onPeerJoin(handler) {
        handlers.join = handler
      },
      get onPeerLeave() {
        return handlers.leave || null
      },
      set onPeerLeave(handler) {
        handlers.leave = handler
      },
      leave() {
        calls.push(['leave'])
      }
    }
    const events = []

    const client = await createTrysteroGomokuRoom({
      roomCode: 'object-api',
      importTrystero: () =>
        Promise.resolve({
          selfId: 'object-peer',
          joinRoom() {
            return room
          }
        }),
      onEvent: (event) => events.push(event)
    })

    handlers.message({ type: 'hello', messageId: 'object-hello' }, { peerId: 'peer-b' })
    handlers.join({ peerId: 'peer-c' })
    handlers.leave({ peerId: 'peer-c' })
    await client.send({ type: 'hello', messageId: 'object-self' }, 'peer-b')
    client.close()

    expect(client.selfPeerId).toBe('object-peer')
    expect(calls[0]).toEqual(['makeAction', 'gomoku'])
    expect(events).toEqual([
      { type: 'message', message: { type: 'hello', messageId: 'object-hello' }, peerId: 'peer-b' },
      { type: 'peer_join', peerId: 'peer-c' },
      { type: 'peer_leave', peerId: 'peer-c' }
    ])
    expect(calls.at(-2)).toEqual([
      'send',
      { type: 'hello', messageId: 'object-self' },
      { target: 'peer-b' }
    ])
    expect(calls.at(-1)).toEqual(['leave'])
  })

  it('新版 Trystero 对象 API 缺少 send 时创建阶段直接失败', async () => {
    const room = {
      makeAction() {
        return {
          set onMessage(handler) {
            this.messageHandler = handler
          }
        }
      },
      onPeerJoin() {},
      onPeerLeave() {},
      leave() {}
    }

    await expect(createTrysteroGomokuRoom({
      roomCode: 'bad-object-api',
      importTrystero: () =>
        Promise.resolve({
          selfId: 'object-peer',
          joinRoom() {
            return room
          }
        })
    })).rejects.toThrow('Trystero 消息通道不可用')
  })

  it('兼容新版 Trystero 对象 API 的函数式 onMessage 注册', async () => {
    const handlers = {}
    const room = {
      makeAction() {
        return {
          send() {
            return Promise.resolve()
          },
          onMessage(handler) {
            handlers.message = handler
          }
        }
      },
      onPeerJoin(handler) {
        handlers.join = handler
      },
      onPeerLeave(handler) {
        handlers.leave = handler
      },
      leave() {}
    }
    const events = []

    await createTrysteroGomokuRoom({
      roomCode: 'function-message-api',
      importTrystero: () =>
        Promise.resolve({
          selfId: 'object-peer',
          joinRoom() {
            return room
          }
        }),
      onEvent: (event) => events.push(event)
    })

    handlers.message({ type: 'hello' }, { peerId: 'peer-fn' })

    expect(events).toEqual([
      { type: 'message', message: { type: 'hello' }, peerId: 'peer-fn' }
    ])
  })

  it('使用 Trystero torrent 适配器加入 tracker 后备房间', async () => {
    const calls = []
    const room = {
      makeAction() {
        return [() => Promise.resolve(), () => {}]
      },
      onPeerJoin() {},
      onPeerLeave() {},
      leave() {}
    }

    const client = await createTrysteroGomokuRoom({
      roomCode: 'hbut-bak',
      strategy: 'torrent',
      importTrystero: () =>
        Promise.resolve({
          selfId: 'torrent-peer',
          joinRoom(config, roomId) {
            calls.push(['joinRoom', config, roomId])
            return room
          }
        })
    })

    expect(client.selfPeerId).toBe('torrent-peer')
    expect(client.strategy).toBe('torrent')
    expect(calls[0]).toEqual([
      'joinRoom',
      {
        appId: ONLINE_APP_ID,
        relayConfig: {
          urls: DEFAULT_TORRENT_TRACKER_URLS
        }
      },
      'HBUTBAK'
    ])
  })

  it('保留未知策略输入的本地安全默认值', () => {
    const state = createOnlineState({
      roomCode: 'SAFE',
      role: 'guest',
      selfPeerId: 'peer-safe',
      strategy: 'unknown'
    })

    expect(state.onlineStrategy).toBe('nostr')
  })

  it('默认 Nostr relay 排除当前会稳定拒绝或关闭连接的节点', () => {
    expect(DEFAULT_NOSTR_RELAY_URLS).not.toContain('wss://relay.damus.io')
    expect(DEFAULT_NOSTR_RELAY_URLS).not.toContain('wss://nostr.wine')
    expect(DEFAULT_NOSTR_RELAY_URLS).not.toContain('wss://relay.nostr.band')
    expect(DEFAULT_NOSTR_RELAY_URLS.length).toBeGreaterThanOrEqual(2)
  })

  it('连接等待超时后兼容无策略旧状态的本地降级入口', () => {
    const host = createOnlineState({
      roomCode: 'OLD',
      role: 'host',
      selfPeerId: 'host-peer'
    })
    const timedOut = markOnlineTimeout({
      ...host,
      onlineStrategy: ''
    })

    expect(timedOut.onlineStatus).toBe('failed')
    expect(timedOut.connectionMessage).toContain('公共信令连接超时')
    expect(timedOut.sessionId).toBe('OLD')
    expect(timedOut.moves).toEqual([])
  })

  it('维护匹配大厅在线人数和排队人数', () => {
    let lobby = createMatchmakingState({
      selfPeerId: 'self-peer'
    })

    lobby = applyLobbyMessage(lobby, buildLobbyPresenceMessage({
      selfPeerId: 'peer-a',
      queued: false
    }), 'peer-a')
    lobby = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-b'
    }), 'peer-b')

    expect(MATCHMAKING_ROOM_CODE).toBe('HBUTGOMOKUMATCH')
    expect(getMatchmakingOnlineCount(lobby)).toBe(3)
    expect(getMatchmakingQueueCount(lobby)).toBe(1)

    lobby = applyLobbyMessage(lobby, {
      type: 'lobby_cancel',
      messageId: 'cancel-peer-b',
      senderId: 'peer-b'
    }, 'peer-b')

    expect(getMatchmakingOnlineCount(lobby)).toBe(3)
    expect(getMatchmakingQueueCount(lobby)).toBe(0)
  })

  it('使用统一取消消息退出匹配队列，避免大厅保留脏排队状态', () => {
    let lobby = createMatchmakingState({
      selfPeerId: 'peer-a'
    })
    lobby = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-a'
    }), 'peer-a')
    lobby = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-z'
    }), 'peer-z')

    const canceled = applyLobbyMessage(lobby, buildCancelMessage({
      selfPeerId: 'peer-a'
    }), 'peer-a')

    expect(canceled.match).toBe(null)
    expect(canceled.selfQueued).toBe(false)
    expect(canceled.peers['peer-a'].queued).toBe(false)
    expect(getMatchmakingQueueCount(canceled)).toBe(0)
  })

  it('本机进入匹配队列时会和已有排队玩家生成同一个 PK 房间', () => {
    let lobby = createMatchmakingState({
      selfPeerId: 'peer-z'
    })
    lobby = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-a'
    }), 'peer-a')

    const queued = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-z'
    }), 'peer-z')
    const localPair = resolveMatchPair('peer-z', 'peer-a')
    const remotePair = resolveMatchPair('peer-a', 'peer-z')

    expect(queued.selfQueued).toBe(false)
    expect(queued.match).toMatchObject({
      roomCode: localPair.roomCode,
      role: 'guest',
      opponentPeerId: 'peer-a'
    })
    expect(localPair.roomCode).toBe(remotePair.roomCode)
    expect(localPair.role).toBe('guest')
    expect(remotePair.role).toBe('host')
  })

  it('匹配大厅忽略超过活跃窗口的旧排队 peer，避免配到已经离开的对手', () => {
    const now = Date.now()
    let lobby = createMatchmakingState({
      selfPeerId: 'peer-z'
    })
    lobby = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-old',
      sentAt: now - 60_000
    }), 'peer-old')

    const queued = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-z',
      sentAt: now
    }), 'peer-z')

    expect(queued.selfQueued).toBe(true)
    expect(queued.match).toBe(null)
    expect(getMatchmakingQueueCount(queued)).toBe(1)
  })

  it('匹配大厅收到活跃排队心跳后可以正常生成 PK 对局', () => {
    const now = Date.now()
    let lobby = createMatchmakingState({
      selfPeerId: 'peer-z'
    })
    lobby = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-a',
      sentAt: now - 60_000
    }), 'peer-a')
    lobby = applyLobbyMessage(lobby, buildLobbyPresenceMessage({
      selfPeerId: 'peer-a',
      queued: true,
      sentAt: now
    }), 'peer-a')

    const queued = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-z',
      sentAt: now
    }), 'peer-z')
    const pair = resolveMatchPair('peer-z', 'peer-a')

    expect(queued.selfQueued).toBe(false)
    expect(queued.match).toMatchObject({
      roomCode: pair.roomCode,
      opponentPeerId: 'peer-a'
    })
  })

  it('收到对手排队消息时如果自己已在队列中会直接生成 PK 对局', () => {
    let lobby = createMatchmakingState({
      selfPeerId: 'peer-a'
    })
    lobby = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-a'
    }), 'peer-a')

    const matched = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-z'
    }), 'peer-z')

    expect(matched.match).toMatchObject({
      role: 'host',
      opponentPeerId: 'peer-z'
    })
    expect(matched.match.roomCode).toMatch(/^PK[A-Z0-9]{10}$/)
  })

  it('取消匹配或匹配对手离开时清理旧 PK 对局', () => {
    let lobby = createMatchmakingState({
      selfPeerId: 'peer-a'
    })
    lobby = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-a'
    }), 'peer-a')
    lobby = applyLobbyMessage(lobby, buildQueueMessage({
      selfPeerId: 'peer-z'
    }), 'peer-z')
    expect(lobby.match).toMatchObject({
      opponentPeerId: 'peer-z'
    })

    const canceled = applyLobbyMessage(lobby, {
      type: 'lobby_cancel',
      messageId: 'cancel-self-after-match',
      senderId: 'peer-a'
    }, 'peer-a')
    expect(canceled.match).toBe(null)

    const opponentLeft = applyLobbyMessage(lobby, {
      type: 'lobby_leave',
      messageId: 'leave-opponent-after-match',
      senderId: 'peer-z'
    }, 'peer-z')
    expect(opponentLeft.match).toBe(null)
  })

  it('只接受匹配双方发出的开始对局消息', () => {
    const pair = resolveMatchPair('peer-a', 'peer-z')
    let lobby = createMatchmakingState({
      selfPeerId: 'peer-z'
    })

    const accepted = applyLobbyMessage(
      lobby,
      buildMatchStartMessage(pair, 'peer-a'),
      'peer-a'
    )
    expect(accepted.match).toMatchObject({
      roomCode: pair.roomCode,
      role: 'guest',
      opponentPeerId: 'peer-a'
    })

    lobby = createMatchmakingState({
      selfPeerId: 'peer-z'
    })
    const rejected = applyLobbyMessage(
      lobby,
      {
        ...buildMatchStartMessage(pair, 'peer-x'),
        senderId: 'peer-x',
        hostPeerId: 'peer-x'
      },
      'peer-x'
    )
    expect(rejected.match).toBe(null)
    expect(rejected.lastError).toBe('匹配发起者不在对局双方中')
  })
})
