'use client'

/**
 * 跨设备登录二维码（#627，替换 #630 的 QrPlaceholder 占位）。
 *
 * 实现约定：
 *  - 使用本地 qrcode 库在浏览器 client-side 渲染（canvas），不调用任何外部
 *    QR 服务/图片 API；QR payload 只在 JS 内存中，不经过服务器（handoff 本来
 *    也只存在于 location.hash -> 内存）；
 *  - request 创建后 handoff 固定：payload 不变时不重新生成 QR（不每秒重渲染）；
 *  - 过期（本地倒计时结束）时用遮罩模糊 QR 并提示；终态由调用方直接隐藏组件；
 *  - canvas 数据/QR 内容不写入任何日志（渲染失败静默）；
 *  - https fallback（系统相机对 custom scheme 兼容差时）：提供可复制链接，
 *    secret 只在 fragment（#h=<secret>），绝不放 query；复制失败时展示文本。
 */
import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { IconCopy } from './icons'

export interface IdentityQrProps {
  /** QR payload（minihbut://identity?request_id=&handoff=&source=qr） */
  payload: string
  /** 是否隐藏整个 QR（终态：APPROVED/DENIED/EXPIRED/INVALID 等） */
  hidden: boolean
  /** 是否已过期（本地倒计时 <= 0）：模糊 + 提示，不再可扫 */
  expired: boolean
  /** https fallback 链接（含 fragment secret）；不提供则不渲染该区域 */
  fallbackUrl?: string
}

export function IdentityQr({ payload, hidden, expired, fallbackUrl }: IdentityQrProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const payloadRef = useRef(payload)
  const [copied, setCopied] = useState(false)

  const renderQr = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    // 静默失败：QR 内容不写日志（渲染失败只影响展示，不影响轮询流程）
    QRCode.toCanvas(canvas, payload, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
    }).catch(() => {
      /* 渲染失败静默：不把 payload 写入任何日志 */
    })
  }

  // 初始渲染
  useEffect(() => {
    renderQr()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // payload 固定后不重复生成；仅当 payload 变化（理论上不会）才重渲染
  useEffect(() => {
    if (payloadRef.current === payload) return
    payloadRef.current = payload
    renderQr()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payload])

  if (hidden) return null

  const copyFallback = async () => {
    if (!fallbackUrl) return
    try {
      await navigator.clipboard.writeText(fallbackUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // 剪贴板不可用：文本本身已展示，可长按复制
    }
  }

  return (
    <div className="qr-box">
      <div className="qr-layout">
        <div className="qr-render-wrap">
          <canvas
            ref={canvasRef}
            className="qr-canvas"
            role="img"
            aria-label="跨设备登录二维码：使用 Mini-HBUT App 扫描以完成登录"
          />
          {expired ? (
            <div className="qr-expired-overlay" aria-live="polite">
              二维码已过期
            </div>
          ) : null}
        </div>
        <div className="qr-side">
          <h4 className="qr-title">使用 Mini-HBUT App</h4>
          <p className="qr-fallback">
            扫描上方二维码完成登录（桌面端）。
          </p>
          {fallbackUrl ? (
            <div className="qr-browser-fallback">
              <p className="qr-browser-fallback-hint">系统相机无法识别时，可复制以下链接到 Mini-HBUT：</p>
              <code className="qr-browser-fallback-url">{fallbackUrl}</code>
              <button type="button" className="qr-browser-fallback-copy" onClick={copyFallback}>
                <IconCopy aria-hidden="true" />
                {copied ? '已复制' : '复制链接'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
