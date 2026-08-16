/**
 * "打开 Mini-HBUT" 主操作区（纯展示组件）。
 * 使用 <a> 携带 scheme（minihbut://identity?request_id=&handoff=），
 * 天然具备键盘 focus 与无障碍语义；不携带 student id / client 展示数据 / scope / token。
 */
import { IconExternalLink } from './icons'

export function OpenAppButton({ href }: { href: string }) {
  return (
    <div className="primary-action">
      <a className="open-app-btn" href={href}>
        <IconExternalLink aria-hidden="true" />
        <span>打开 Mini-HBUT App</span>
      </a>
      <p className="primary-action-hint">手机端将自动唤起 App</p>
    </div>
  )
}
