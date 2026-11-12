/**
 * 接入申请：/apps/new（server page + 登录守卫）。
 * P4-4（mini-hbut#1219）：自建注册表退役，应用创建表单移除。
 * 接入方式 = 在清单仓库（mini-hbut-ocr-service）对 manifest/apps.json
 * 提交 PR，经审核合并后由清单仓库 + 接入程序完成 provisioning。
 * 本页只保留入口与说明，不含任何写凭据。
 */
import { requireDeveloperSession } from '@/lib/auth-session/guard'

export const dynamic = 'force-dynamic'

/** 清单仓库 manifest/apps.json（权威源）的 GitHub 入口 */
const MANIFEST_GITHUB_URL =
  'https://github.com/superdaobo/mini-hbut-ocr-service/blob/main/manifest/apps.json'
/** 清单仓库仓库根（manifest 路径未合入 main 前的兜底入口） */
const REPO_ROOT_URL = 'https://github.com/superdaobo/mini-hbut-ocr-service'

export default async function DeveloperApplyPage() {
  await requireDeveloperSession()
  return (
    <div>
      <div className="dev-page-head">
        <h1 className="dev-page-title">接入申请</h1>
      </div>

      <div className="dev-panel" style={{ padding: 20, maxWidth: 720 }}>
        <p style={{ margin: '0 0 12px' }}>
          自建注册表已退役（P4-4）。应用接入改由<b>清单仓库 + PR 审核</b>：
          在清单仓库的 <span className="dev-mono">manifest/apps.json</span> 中新增/修改
          你的应用条目并提交 Pull Request，审核通过合并后由接入程序完成 provisioning。
        </p>
        <ol style={{ margin: '0 0 16px', paddingLeft: 20, lineHeight: 1.9 }}>
          <li>打开清单仓库的 <span className="dev-mono">manifest/apps.json</span>；</li>
          <li>按 <span className="dev-mono">manifest/README.md</span> 的字段说明填写应用条目；</li>
          <li>开 PR 提交审核（无需在本站点填写任何凭据）。</li>
        </ol>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <a className="dev-btn dev-btn-primary" href={MANIFEST_GITHUB_URL} target="_blank" rel="noreferrer">
            打开 manifest/apps.json（GitHub）
          </a>
          <a className="dev-btn" href={REPO_ROOT_URL} target="_blank" rel="noreferrer">
            清单仓库仓库根
          </a>
        </div>

        <p style={{ marginTop: 16, marginBottom: 0 }}>
          <span className="dev-inline-hint">
            链接若 404（manifest 尚未合入 main），请先访问仓库根目录查看 manifest/ 目录。
          </span>
        </p>
      </div>
    </div>
  )
}
