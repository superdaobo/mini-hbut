/**
 * 状态横幅（纯展示组件，可服务端渲染/单测）。
 * 可访问性：role="status" + aria-live="polite"；状态不只靠颜色（文字 + 图标）。
 */
import type { HandoffLastError, HandoffPhase } from '@/lib/auth/state'
import { IconCheckSolid, IconInfoSolid, IconWarning } from './icons'

export const PHASE_TEXT: Record<HandoffPhase, string> = {
  LOADING: '正在加载授权信息…',
  WAITING_APP: '请在 Mini-HBUT 中确认此次登录',
  APP_OPENED: '已在 Mini-HBUT 中打开，请在 App 中确认此次登录',
  APPROVED: '授权已完成，正在返回…',
  REDIRECTING: '授权已完成，正在返回原应用…',
  DENIED: '你已在 Mini-HBUT 中拒绝此次授权',
  EXPIRED: '此次登录请求已过期，请回到原应用重新发起',
  INVALID: '授权链接无效或已失效，请回到原应用重新发起登录',
  CLIENT_UNAVAILABLE: '该应用当前不可用，请稍后再试',
  NETWORK_ERROR: '网络连接中断，正在自动重试…',
}

/** 缺少一次性凭据时的专属文案（区别于一般 INVALID） */
const MISSING_HANDOFF_TEXT =
  '链接缺少一次性凭据，无法读取授权信息，请回到原应用重新发起登录'

export interface StatusViewProps {
  phase: HandoffPhase
  lastError?: HandoffLastError
  /** 提供时展示"重试"按钮（当前仅 APPROVED + resume 失败时使用） */
  onRetry?: () => void
}

export function StatusView({ phase, lastError, onRetry }: StatusViewProps) {
  const text =
    phase === 'INVALID' && lastError === 'missing_handoff'
      ? MISSING_HANDOFF_TEXT
      : PHASE_TEXT[phase]
  const tone =
    phase === 'DENIED' ||
    phase === 'EXPIRED' ||
    phase === 'INVALID' ||
    phase === 'CLIENT_UNAVAILABLE' ||
    phase === 'NETWORK_ERROR'
      ? 'error'
      : phase === 'APPROVED' || phase === 'REDIRECTING'
        ? 'ok'
        : 'info'
  const Icon =
    tone === 'error' ? IconWarning : tone === 'ok' ? IconCheckSolid : IconInfoSolid

  return (
    <div className={`status-banner status-${tone}`} role="status" aria-live="polite">
      <p className="status-text">
        <Icon aria-hidden="true" />
        <span>{text}</span>
      </p>
      {onRetry && (
        <button type="button" className="retry-btn" onClick={onRetry}>
          重新返回原应用
        </button>
      )}
    </div>
  )
}
