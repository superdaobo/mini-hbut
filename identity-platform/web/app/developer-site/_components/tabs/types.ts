/**
 * Tab 公共 props 类型。
 * P4-4（mini-hbut#1219）：自建注册表退役后，所有 Tab 只读；
 * oneTimeSecret/写能力相关 props 移除。
 */
import type { DeveloperAppDetailDTO } from '@/lib/developer/contract'
import type { MeResult } from '../api'

export interface TabProps {
  app: DeveloperAppDetailDTO
  me: MeResult
  reload: () => Promise<void>
}
