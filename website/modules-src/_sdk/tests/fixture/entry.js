/**
 * SDK 打包冒烟夹具入口：只依赖 SDK 公共 API + 一个游戏 adapter。
 * 用途：验证「游戏源码 → 相对路径 import SDK → 被 bundler 内联」这条链路成立，
 * 且产物中不残留 `_sdk/src` 运行时引用（即 SDK 已被注入/打包进模块 bundle）。
 *
 * 本文件不是游戏模块（_sdk 目录没有 module.json），不参与 modules-src 的模块构建。
 */
import MiniHBUTGameDefault, { MiniHBUTGame, createGameAdapter } from '../../src/index.js'

const adapter = createGameAdapter({
  gameId: 'hbut_stack',
  displayName: '湖工叠塔',
  capabilities: { ranked: true, economyEligible: true, seasonEligible: true, classicMirror: true, legacyCompatible: true },
  metric: { name: 'layers', semantics: 'count', max: 100000, label: '层数' },
  legacy: { maxLevelRule: '1:1', endedReasonMap: { lost: 'lost' } },
  result: { extraKeys: ['perfectCount', 'perfectCombo'] }
})

export const createSmokeGame = (options = {}) =>
  MiniHBUTGame.create({ gameId: 'hbut_stack', adapter, ...options })

export const sdkVersion = MiniHBUTGame.sdkVersion
export const protocolVersion = MiniHBUTGame.protocolVersion
export const facadeIsSame = MiniHBUTGame === MiniHBUTGameDefault
