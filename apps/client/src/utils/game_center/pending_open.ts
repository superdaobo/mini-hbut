/**
 * Game Center → 经典启动链路的一次性「开局意图」通道（#905）。
 *
 * 关键决策：**不复制 MoreView 的启动状态机**（manifest 拉取 / 缓存校验 / bundle 准备 /
 * 高度上报参数注入共 200+ 行，且被 `website_game_modules_contract.spec.ts` 的源码锚点看守）。
 * 游乐场「游戏」Tab 只登记一个待打开 module id 并导航到 `more`，
 * 由 MoreView 在卡片就绪后消费该意图，走**完全相同**的既有链路。
 *
 * 语义：一次性（consume 后立即清空）+ 进程内（不落盘，避免跨会话脏意图）。
 */

let pendingModuleId = ''

/** 登记待打开的游戏（仅接受非空字符串） */
export const requestGameOpen = (moduleId: unknown): boolean => {
  const id = String(moduleId ?? '').trim()
  if (!id) return false
  pendingModuleId = id
  return true
}

/** 读取并清空待打开意图（无则空串） */
export const consumeGameOpen = (): string => {
  const id = pendingModuleId
  pendingModuleId = ''
  return id
}

/** 仅用于测试断言：当前是否存在待打开意图 */
export const peekGameOpen = (): string => pendingModuleId
