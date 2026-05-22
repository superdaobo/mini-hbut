import { describe, expect, it } from 'vitest'
import { getCell } from './gomoku.js'
import {
  DEFAULT_NOSTR_RELAY_URLS,
  DEFAULT_TORRENT_TRACKER_URLS,
  ONLINE_APP_ID,
  TRYSTERO_TORRENT_URL,
  applyLocalMove,
  applyPeerJoined,
  applyRemoteMove,
  applyRemoteRestart,
  applySnapshotMessage,
  buildRestartMessage,
  buildSnapshotMessage,
  createOnlineState,
  createRoomCode,
  createTrysteroGomokuRoom,
  markOnlineTimeout,
  nextOnlineStrategy,
  normalizeRoomCode
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

  it('连接等待超时后先切换 tracker 后备，后备仍失败才提示本地降级', () => {
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

    const fallbackFailed = markOnlineTimeout(timedOut)
    expect(fallbackFailed.onlineStatus).toBe('failed')
    expect(fallbackFailed.onlineStrategy).toBe('torrent')
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
})
