/**
 * Tab 公共 props 类型。
 */
import type { Dispatch, SetStateAction } from 'react'
import type { DeveloperAppDetailDTO } from '@/lib/developer/contract'
import type { MeResult } from '../api'

export interface TabProps {
  app: DeveloperAppDetailDTO
  me: MeResult
  setApp: Dispatch<SetStateAction<DeveloperAppDetailDTO | null>>
  /** 一次性 secret（rotate 响应），仅内存持有 */
  oneTimeSecret: string | null
  setOneTimeSecret: Dispatch<SetStateAction<string | null>>
  reload: () => Promise<void>
}

/** 可编辑状态提示（draft/rejected 之外锁定） */
export function editLocked(app: DeveloperAppDetailDTO): boolean {
  return app.status !== 'draft' && app.status !== 'rejected'
}

export function editLockedHint(app: DeveloperAppDetailDTO): string {
  return editLocked(app)
    ? `当前状态（${app.status}）下信息锁定：如需修改，请等待审核结果或先撤销后重建。`
    : ''
}
