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
  // #692 后续：元数据编辑覆盖 draft/rejected/approved/active；
  // 仅审核中（会使内容寻址审核失效）、suspended、revoked 锁定。
  return (
    app.status === 'pending_review' || app.status === 'suspended' || app.status === 'revoked'
  )
}

export function editLockedHint(app: DeveloperAppDetailDTO): string {
  if (!editLocked(app)) return ''
  if (app.status === 'pending_review') {
    return '当前状态（审核中）下信息锁定：编辑会使本次审核失效。请等待审核结果。'
  }
  return `当前状态（${app.status}）下信息锁定：请先恢复可用后再编辑。`
}
