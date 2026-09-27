/**
 * 跳出湖工大 —— SDK 句柄（模块作用域单例，App.vue 与 LeaderboardPanel.vue 共用同一会话）。
 *
 * 为什么单独一个文件：排行榜面板是独立组件，如果各自 `MiniHBUTGame.create` 会产生两次
 * Host 握手 / 两次 ticket 兑换 / 两份 mode 状态；这里只创建一个句柄，两个组件 import 同一个。
 *
 * 旧协议要点（`docs/game-platform/sdk-migration-guide.md` §6）：
 * - `legacyProtocol: 'jump_out'` → 路由到 `_sdk/src/legacy/legacy-jump-out.js`（snake_case、失败不 throw、无默认 API base）；
 * - URL 无 `rank_api` 时 `canSubmit=false` → SDK 落 standalone（等价旧 `{success:false,error:'no_api'}`）。
 */
import { MiniHBUTGame } from '../../../../_sdk/src/index.js'
import { JUMP_OUT_HBUT_ADAPTER } from './game_sdk_adapter.js'

export const MODULE_ID = 'jump_out_hbut'

// 同步创建句柄（Host 握手 / ticket 兑换在后台），不阻塞渲染与玩法
export const sdkGame = MiniHBUTGame.create({
  gameId: MODULE_ID,
  adapter: JUMP_OUT_HBUT_ADAPTER,
  legacyProtocol: 'jump_out'
})

export default sdkGame
