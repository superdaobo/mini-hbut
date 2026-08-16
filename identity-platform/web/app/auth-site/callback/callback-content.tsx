'use client'

/**
 * 测试回调页内容（客户端读取 URL 中的 code）。
 * code 只用于展示与手动测试，不落 storage、不上报。
 */
import { useSearchParams } from 'next/navigation'
import { IconCheckSolid, IconWarning } from '../_components/icons'

export function TestCallbackContent() {
  const params = useSearchParams()
  const code = params.get('code')
  const error = params.get('error')
  const errorDesc = params.get('error_description')

  if (error) {
    return (
      <div className="callback-result callback-error">
        <h2>授权未完成</h2>
        <p>
          错误码：{error}
          {errorDesc ? `（${errorDesc}）` : ''}
        </p>
        <p>可返回测试链接重新发起授权。</p>
      </div>
    )
  }

  if (!code) {
    return (
      <div className="callback-result">
        <p>未收到授权码（地址栏没有 code 参数）。请从测试链接重新发起授权。</p>
      </div>
    )
  }

  return (
    <>
      <div className="callback-result callback-success">
        <span className="success-icon" aria-hidden="true">
          <IconCheckSolid />
        </span>
        <div>
          <h2>授权成功</h2>
          <p>已成功获得授权码，可用于换取访问令牌。</p>
        </div>
      </div>
      <div className="callback-code-section">
        <h3>授权码（仅本次有效，约 60 秒过期）</h3>
        <code className="callback-code-value">{code}</code>
      </div>
      <p className="callback-warn">
        <IconWarning aria-hidden="true" />
        <span>此授权码仅用于测试换取令牌，不会保存到任何地方。</span>
      </p>
    </>
  )
}
