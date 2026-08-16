/**
 * 请求方应用卡片（纯展示组件，可服务端渲染/单测）。
 *
 * 要求（issue #630）：必须同时显示应用名称、应用主页 hostname、开发者名称、
 * Mini-HBUT 审核状态——域名是防钓鱼的重要信息，不能只显示应用名。
 * 所有字段经 React 文本节点渲染（自动转义，XSS 见安全测试）。
 */
import type { RequestDetailDTO } from '@/lib/core-client/contract'
import {
  IconApp,
  IconCalendar,
  IconChart,
  IconCheckCircle,
  IconCheckSmall,
  IconExternalLink,
  IconFlask,
  IconInfo,
  IconUser,
  IconUserCircle,
} from './icons'

/** 审核状态展示文案（未知状态原样展示，不猜测语义） */
export function reviewStatusLabel(status: string): string {
  switch (status) {
    case 'verified':
      return '已通过审核'
    case 'pending':
      return '审核中'
    case 'rejected':
      return '未通过审核'
    default:
      return status
  }
}

/** scope id → 展示图标（未知 scope 用默认人像图标） */
function scopeIcon(id: string) {
  switch (id) {
    case 'openid':
      return IconUser
    case 'profile':
      return IconUserCircle
    case 'student.schedule':
      return IconCalendar
    case 'student.grades':
    case 'student.identity':
      return IconChart
    default:
      return IconUser
  }
}

export function RequestCard({ detail }: { detail: RequestDetailDTO }) {
  const { client, scopes } = detail
  return (
    <section className="card app-card" aria-label="请求方应用">
      {client.is_test && (
        <div className="test-banner" role="note">
          <IconFlask aria-hidden="true" />
          <span>
            <strong>测试应用</strong>：本授权请求仅用于链路测试，
            不会获取、保存或使用你的任何真实数据。
          </span>
        </div>
      )}
      <div className="app-header">
        <div className="app-icon" aria-hidden="true">
          <IconApp />
        </div>
        <div className="app-header-info">
          <h1 className="app-name">{client.name}</h1>
          <dl className="app-meta">
            <div className="app-meta-row">
              <dt>应用主页</dt>
              <dd>
                <span className="homepage-chip">
                  {client.homepage_host || '—'}
                  {client.homepage_host ? (
                    <a
                      href={`https://${client.homepage_host}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`打开 ${client.homepage_host}`}
                    >
                      <IconExternalLink aria-hidden="true" />
                    </a>
                  ) : null}
                </span>
              </dd>
            </div>
            <div className="app-meta-row">
              <dt>开发者</dt>
              <dd>{client.developer_display_name}</dd>
            </div>
            <div className="app-meta-row">
              <dt>审核状态</dt>
              <dd>
                <span className={`review-badge review-${client.review_status}`}>
                  <IconCheckSmall aria-hidden="true" />
                  {reviewStatusLabel(client.review_status)}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      <hr className="app-divider" />

      <h2 className="scope-title">请求的权限</h2>
      <ul className="scope-list">
        {scopes.map((scope) => {
          const Icon = scopeIcon(scope.id)
          return (
            <li key={scope.id} className="scope-item">
              <div className="scope-item-left">
                <Icon aria-hidden="true" />
                <span className="scope-label">{scope.label}</span>
                {scope.risk === 'sensitive' && <span className="risk-tag">敏感</span>}
              </div>
              <IconCheckCircle aria-hidden="true" />
            </li>
          )
        })}
      </ul>
      <p className="scope-note">
        <IconInfo aria-hidden="true" />
        <span>本页面仅作说明，允许/拒绝按钮只存在于 Mini-HBUT App 内</span>
      </p>
    </section>
  )
}
