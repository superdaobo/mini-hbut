// 论坛 API 门面：在不破坏 utils/forum_api 公共函数签名的前提下，为其提供 TS 类型门面
// 描述：ForumView 领域拆分后统一从这里导入 API 函数与客户端工厂。
export {
  normalizeForumEndpoint,
  buildForumApiBase,
  readForumProfile,
  writeForumProfile,
  saveForumAdminSecret,
  loadForumAdminSecret,
  createForumApiClient
} from '../../../utils/forum_api'

import { createForumApiClient } from '../../../utils/forum_api'

/** 论坛 API 客户端类型（由工厂函数推导） */
export type ForumApiClient = ReturnType<typeof createForumApiClient>
