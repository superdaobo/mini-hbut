'use client'

/**
 * 授权接力客户端组件（#630）。
 *
 * 职责：从 location.hash 读取一次性 handoff 到内存 → 拉取请求详情 →
 * 展示 App 唤起/二维码/倒计时 → 短轮询等待 App 处理结果 → APPROVED 后调 BFF resume
 * 并跟随 Core（oidc-provider）决定的回调。
 *
 * 安全边界（issue #630）：
 *  - handoff 只从 location.hash 读到内存，不写 localStorage/IndexedDB，不进 URL/query，
 *    不经服务端渲染 HTML（服务端拿不到 hash）；
 *  - 本页没有任何密码表单，也没有允许/拒绝按钮（批准面只在 Mini-HBUT App 内）；
 *  - 不使用 WebSocket / Server-Sent Event（V1 只靠短轮询，正确性只依赖数据库状态）；
 *  - 轮询：可见 1s / 隐藏 5s / 失败指数退避（上限 30s）/ 每次请求独立 AbortController /
 *    卸载清理 timer / 终态停 / 本地时间超过 expires_at 停 / BFF 响应 no-store。
 */
import { useEffect, useReducer, useRef, useState } from 'react'
import { createBffClient, isAbortError, type BffClient } from '@/lib/auth/bff-client'
import {
  buildIdentityDeepLink,
  parseHandoffFromHash,
  resolveSafeRedirect,
} from '@/lib/auth/handoff'
import {
  handoffReducer,
  INITIAL_HANDOFF_STATE,
  isPollablePhase,
  type HandoffState,
} from '@/lib/auth/state'
import { formatCountdown, nextPollDelayMs, remainingMs, shouldStopPolling } from '@/lib/auth/polling'
import {
  buildIdentityQrPayload,
  buildQrFallbackUrl,
  isIdentityQrExpired,
  shouldRenderIdentityQr,
} from '@/lib/auth/qr'
import { IconClock } from '../../_components/icons'
import { RequestCard } from '../../_components/request-card'
import { StatusView } from '../../_components/status-view'
import { OpenAppButton } from '../../_components/open-app-button'
import { IdentityQr } from '../../_components/identity-qr'

export default function HandoffClient({ requestId }: { requestId: string }) {
  const [state, dispatch] = useReducer(handoffReducer, INITIAL_HANDOFF_STATE)
  const [visible, setVisible] = useState(() =>
    typeof document === 'undefined' ? true : document.visibilityState === 'visible',
  )
  // 倒计时时钟：每秒 tick，驱动本地过期判断与剩余时间展示
  const [now, setNow] = useState(() => Date.now())
  // handoff 是否已解析完成（驱动轮询 effect 启动）
  const [handoffReady, setHandoffReady] = useState(false)

  // 可变引用：轮询循环读取最新值，但不希望每次渲染重建定时器
  const handoffRef = useRef<string | null>(null)
  const clientRef = useRef<BffClient | null>(null)
  const detailRef = useRef<HandoffState['detail']>(null)
  const phaseRef = useRef<HandoffState['phase']>('LOADING')
  const failuresRef = useRef(0)
  const visibleRef = useRef(visible)
  const resumeInFlightRef = useRef(false)

  // 渲染期同步 ref（本组件约定的低开销模式，不触发额外渲染）
  phaseRef.current = state.phase
  detailRef.current = state.detail
  visibleRef.current = visible

  const expiresAtMs = state.detail ? Date.parse(state.detail.expires_at) : NaN

  // 初始化：从 location.hash 读取一次性 handoff（刷新页面后 hash 仍在，可恢复流程）
  useEffect(() => {
    const handoff = parseHandoffFromHash(window.location.hash)
    if (!handoff) {
      dispatch({ type: 'MISSING_HANDOFF' })
      return
    }
    handoffRef.current = handoff
    clientRef.current = createBffClient()
    setHandoffReady(true)
  }, [requestId])

  // 页面可见性：隐藏时轮询降频到 5s
  useEffect(() => {
    const onVisibilityChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [])

  // 倒计时时钟：只在详情加载后运行
  useEffect(() => {
    if (!state.detail) {
      return
    }
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [state.detail])

  // 本地时间超过服务器 expires_at：进入 EXPIRED（真正过期判断始终以 Core 为准）
  useEffect(() => {
    if (state.detail && !Number.isNaN(expiresAtMs) && Date.now() >= expiresAtMs) {
      dispatch({ type: 'EXPIRE_LOCAL' })
    }
  }, [now, state.detail, expiresAtMs])

  // 短轮询主循环：详情未加载先拉详情，否则轮询最小状态端点
  useEffect(() => {
    const handoff = handoffRef.current
    const client = clientRef.current
    if (!handoff || !client || !handoffReady) {
      return
    }
    if (!isPollablePhase(phaseRef.current)) {
      return
    }

    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    let controller: AbortController | null = null

    const stop = () => {
      stopped = true
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      if (controller) {
        controller.abort()
        controller = null
      }
    }

    const shouldStop = () =>
      shouldStopPolling({
        phase: phaseRef.current,
        nowMs: Date.now(),
        expiresAtMs: Number.isNaN(expiresAtMs) ? null : expiresAtMs,
      })

    const schedule = (delayMs: number) => {
      if (stopped) {
        return
      }
      timer = setTimeout(() => {
        timer = null
        void poll()
      }, delayMs)
    }

    const poll = async () => {
      if (stopped || shouldStop()) {
        stop()
        return
      }
      // 网络错误恢复：先回到可轮询阶段（LOADING/WAITING_APP）
      if (phaseRef.current === 'NETWORK_ERROR') {
        dispatch({ type: 'RETRY' })
      }
      controller = new AbortController()
      const signal = controller.signal
      try {
        if (detailRef.current === null) {
          // 详情未加载：拉详情（失败按退避重试）
          const res = await client.getDetail(requestId, handoff, signal)
          if (stopped) {
            return
          }
          if (res.ok) {
            failuresRef.current = 0
            dispatch({ type: 'DETAIL_OK', detail: res.value })
          } else {
            failuresRef.current += 1
            dispatch({ type: 'DETAIL_ERROR', code: res.code })
          }
        } else {
          // 详情已加载：轮询最小状态端点
          const res = await client.getStatus(requestId, handoff, signal)
          if (stopped) {
            return
          }
          if (res.ok) {
            failuresRef.current = 0
            dispatch({ type: 'STATUS', status: res.value.status })
          } else if (res.status === 401 || res.status === 404 || res.status === 400) {
            // handoff 失效/请求不存在：进入 INVALID（终态，不再重试）
            failuresRef.current = 0
            dispatch({ type: 'DETAIL_ERROR', code: res.code })
          } else if (res.status === 410) {
            // Core 判定过期
            failuresRef.current = 0
            dispatch({ type: 'DETAIL_ERROR', code: 'expired' })
          } else {
            // 5xx 等：网络级错误，退避重试
            failuresRef.current += 1
            dispatch({ type: 'NETWORK_ERROR' })
          }
        }
      } catch (err) {
        if (stopped || isAbortError(err)) {
          return
        }
        failuresRef.current += 1
        dispatch({ type: 'NETWORK_ERROR' })
      } finally {
        controller = null
        if (!stopped && !shouldStop()) {
          schedule(
            nextPollDelayMs({
              visible: visibleRef.current,
              consecutiveFailures: failuresRef.current,
            }),
          )
        }
      }
    }

    // 无失败历史时立即拉取（首次进入/状态转移后），否则按退避延迟
    if (failuresRef.current > 0) {
      schedule(
        nextPollDelayMs({
          visible: visibleRef.current,
          consecutiveFailures: failuresRef.current,
        }),
      )
    } else {
      void poll()
    }
    return stop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.phase, state.detail, expiresAtMs, handoffReady, requestId])

  // APPROVED：调用一次 BFF resume（幂等；同一轮由 in-flight ref 保证只发一次）
  useEffect(() => {
    if (state.phase !== 'APPROVED') {
      return
    }
    const handoff = handoffRef.current
    const client = clientRef.current
    if (!handoff || !client) {
      return
    }
    if (resumeInFlightRef.current) {
      return
    }
    resumeInFlightRef.current = true
    const controller = new AbortController()
    let cancelled = false
    client
      .resume(requestId, handoff, controller.signal)
      .then((res) => {
        if (cancelled) {
          return
        }
        if (res.ok) {
          dispatch({ type: 'RESUME_OK', redirectTo: res.value.redirect_to ?? null })
        } else {
          dispatch({ type: 'RESUME_ERROR' })
        }
      })
      .catch((err) => {
        if (cancelled || isAbortError(err)) {
          return
        }
        dispatch({ type: 'RESUME_ERROR' })
      })
      .finally(() => {
        resumeInFlightRef.current = false
      })
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [state.phase, state.resumeAttempt, requestId])

  // REDIRECTING：跟随 Core（oidc-provider）决定的回调；绝不读取 URL 中的 next= 参数
  useEffect(() => {
    if (state.phase !== 'REDIRECTING' || !state.redirectTo) {
      return
    }
    const target = resolveSafeRedirect(state.redirectTo)
    if (!target) {
      return
    }
    // 短暂停留让用户看到"正在返回"提示，再跳转
    const id = setTimeout(() => {
      window.location.assign(target)
    }, 300)
    return () => clearTimeout(id)
  }, [state.phase, state.redirectTo])

  // ---- 渲染 ----

  // 无详情阶段的简单状态视图
  if (state.phase === 'LOADING') {
    return <StatusView phase="LOADING" />
  }
  if (state.phase === 'INVALID') {
    return <StatusView phase="INVALID" lastError={state.lastError} />
  }
  if (state.phase === 'EXPIRED') {
    return <StatusView phase="EXPIRED" />
  }
  if (state.phase === 'DENIED') {
    return <StatusView phase="DENIED" />
  }
  if (state.phase === 'CLIENT_UNAVAILABLE') {
    return <StatusView phase="CLIENT_UNAVAILABLE" />
  }
  if (state.phase === 'REDIRECTING') {
    return <StatusView phase="REDIRECTING" />
  }
  if (state.phase === 'APPROVED') {
    return <StatusView phase="APPROVED" lastError={state.lastError} onRetry={state.lastError === 'resume' ? () => dispatch({ type: 'RETRY_RESUME' }) : undefined} />
  }
  if (state.phase === 'NETWORK_ERROR' && !state.detail) {
    return <StatusView phase="NETWORK_ERROR" />
  }

  // 详情已加载：请求卡片 + 倒计时 + App 唤起 + 二维码 + 状态
  const detail = state.detail!
  const deepLink = buildIdentityDeepLink(requestId, handoffRef.current ?? '')
  const countdownMs = Number.isNaN(expiresAtMs) ? 0 : remainingMs(expiresAtMs, now)
  // #627：QR 与「打开 App」共用同一 AuthRequest（同 request_id / handoff），
  // payload 只加 source=qr 来源标记；终态立即隐藏，本地倒计时结束则模糊。
  const qrPayload = buildIdentityQrPayload(requestId, handoffRef.current ?? '')
  const qrHidden = !shouldRenderIdentityQr(state.phase, !!state.detail)
  const qrExpired = isIdentityQrExpired(countdownMs)
  const qrFallbackUrl =
    typeof window === 'undefined'
      ? undefined
      : buildQrFallbackUrl(window.location.origin, requestId, handoffRef.current ?? '')
  return (
    <div className="auth-flow">
      <RequestCard detail={detail} />
      <p className={`countdown${countdownMs > 0 && countdownMs <= 30000 ? ' urgent' : ''}`} aria-live="polite">
        <IconClock aria-hidden="true" />
        <span>
          请求将在 <span className="countdown-value">{formatCountdown(countdownMs)}</span> 后过期
        </span>
      </p>
      <OpenAppButton href={deepLink} />
      <IdentityQr
        payload={qrPayload}
        hidden={qrHidden}
        expired={qrExpired}
        fallbackUrl={qrFallbackUrl}
      />
      {/* APPROVED/resume 失败的重试按钮由上方 APPROVED 分支渲染 */}
      <StatusView phase={state.phase} lastError={state.lastError} />
    </div>
  )
}
