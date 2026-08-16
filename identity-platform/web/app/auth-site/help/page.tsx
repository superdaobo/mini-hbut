/**
 * /help 帮助页（#630）：无法打开 App / 安装帮助。
 * 帮助页不要求用户输入学校密码；任何要求密码的页面都不是本服务。
 */
import type { Metadata } from 'next'
import { IconQuestionMark, IconShieldCheck } from '../_components/icons'

export const metadata: Metadata = {
  title: '帮助 - Mini-HBUT Identity',
}

export default function HelpPage() {
  return (
    <div className="card auth-help">
      <div className="help-header">
        <div className="help-icon" aria-hidden="true">
          <IconQuestionMark />
        </div>
        <h1>无法打开 Mini-HBUT？</h1>
      </div>
      <ol className="help-list">
        <li className="help-item">
          <span className="help-step" aria-hidden="true">
            1
          </span>
          <div className="help-item-text">
            <h2>没有安装 Mini-HBUT</h2>
            <p>
              请在应用商店搜索“Mini-HBUT”并安装，然后回到本授权页，重新点击“打开
              Mini-HBUT”。
            </p>
          </div>
        </li>
        <li className="help-item">
          <span className="help-step" aria-hidden="true">
            2
          </span>
          <div className="help-item-text">
            <h2>点击“打开 Mini-HBUT”后没有反应</h2>
            <p>
              请确认已安装最新版 App；也可以手动打开 Mini-HBUT App，在本授权页保持等待即可，
              页面会自动检测 App 的处理结果。
            </p>
          </div>
        </li>
        <li className="help-item">
          <span className="help-step" aria-hidden="true">
            3
          </span>
          <div className="help-item-text">
            <h2>提示授权请求已过期</h2>
            <p>
              授权请求有较短的有效期（以服务器时间为准）。过期后请回到原应用，重新发起登录，
              获得一个新的授权链接。
            </p>
          </div>
        </li>
      </ol>
      <p className="help-note">
        <IconShieldCheck aria-hidden="true" />
        <span>
          本服务不会在任何网页要求你输入学校账号或密码，也不会在网页上批准权限；
          批准或拒绝请在 Mini-HBUT App 内完成。
        </span>
      </p>
    </div>
  )
}
