/**
 * Tab 2：Redirect URIs —— 只读列表（完整 URI / 类型 / 校验状态）。
 * P4-4（mini-hbut#1219）：新增/删除表单移除（自建注册表退役）；
 * 回调地址变更改由清单仓库 manifest/apps.json + PR 审核。
 */
'use client'

import type { RedirectUriKind } from '@/lib/developer/contract'
import type { TabProps } from './types'

const KIND_LABEL: Record<RedirectUriKind, string> = {
  web_https: 'Web https',
  native_custom: 'Native 自定义 scheme',
  native_loopback: 'Native loopback',
}

export function RedirectUrisTab({ app }: TabProps) {
  return (
    <div className="dev-card">
      <h2>回调地址</h2>
      <p className="dev-inline-hint">
        登录成功后跳回你网站的地址（只读）；必须与你代码中使用的完全一致（一个字符都不能差）。
        需要变更时，请在清单仓库对 <code>manifest/apps.json</code> 提交 PR。
      </p>

      {app.redirect_uris.length === 0 ? (
        <div className="dev-empty">暂无注册回调地址</div>
      ) : (
        <ul className="dev-list">
          {app.redirect_uris.map((r) => (
            <li key={r.id}>
              <span>
                <code>{r.uri}</code>
                <span className="dev-inline-hint">
                  {' '}
                  [{KIND_LABEL[r.kind]} ·{' '}
                  {r.validation_status === 'approved' ? '已生效' : '待审核'}]
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
