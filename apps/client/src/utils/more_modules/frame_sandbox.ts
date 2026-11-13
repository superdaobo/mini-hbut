// src/utils/more_modules/frame_sandbox.ts
//
// Epic #1243（G2-02 / mini-hbut#1251）：远端模块 iframe 的**默认拒绝**沙箱策略。
//
// 现状（#1165 T04）：只有**本机模块内容**（我们自己的内容服务 origin）加 sandbox；
// 远端 iframe 的 `frameSandbox` 返回 `undefined`（= **完全没有沙箱**）。
// 这是 Epic 报告的 R-06（P0）：「部分远端 iframe 无统一沙箱，敏感宿主 IPC/HTTP 隔离
// 未全面真机验证」。T04 当时故意没顺手改，以免打断 11 个游戏。
//
// 本模块把决策抽成**纯函数**，让「哪些源给什么能力」可以被穷举测试：
//
// | 场景 | sandbox | 理由 |
// |---|---|---|
// | 无 src | `undefined`（不渲染） | 没有地址就没有帧 |
// | 本机模块内容 origin | LOCAL 能力集 | 我们自己的内容服务（现状不变） |
// | 远端 + 强制开关**关**（默认） | `undefined` | **保持现状**：11 个游戏零风险 |
// | 远端 + 开关**开** + 白名单 host | REMOTE_APPROVED | 经审核的 CDN（https + 白名单 host + 无 userinfo） |
// | 远端 + 开关**开** + 非白名单 | `''`（**最严格**） | 未审核源连脚本都不给 |
//
// 为什么默认关：沙箱一旦加到远端帧上，fullscreen/输入聚焦/弹窗等行为可能与浏览器实现
// 相关地变化，而**本机无法验证 11 个游戏的运行时回归**（需真机/真实 CDN）。因此先交
// 「可测试的判定 + 默认零变化」，把启用与回归验证留给有真机条件时执行（见 PR 的 BLOCKED）。
//
// 依赖纪律：本模块**不 import `core.js`**（它是无类型声明的 .js，直接 import 会让
// `vue-tsc` 报 TS7016）。源的分类（是否本机内容 / 是否白名单远端）由调用方用既有
// `isLocalModuleContentOrigin` / `isTrustedRemoteModuleUrl` / `isDevLoopbackModuleUrl`
// 算好传进来——那些函数本身已有测试，本模块只负责「分类 → 能力集」的映射。

/** 本机模块内容的能力集（与改动前的字面量**逐字一致**，不得悄悄放宽）。 */
export const SANDBOX_LOCAL =
  'allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-downloads'

/**
 * 经审核的远端 CDN 的能力集：与本机内容**同一套**，但**不含**：
 * - `allow-top-navigation*`（不能把宿主窗口导航走）
 * - `allow-modals`（不能弹 alert/confirm 卡住宿主）
 * - `allow-popups-to-escape-sandbox`（弹窗必须继承沙箱）
 * `allow-same-origin` 保留：跨源帧本来就拿不到宿主 DOM，去掉会清空游戏自己的
 * localStorage/IndexedDB 存档（玩家进度）。
 */
export const SANDBOX_REMOTE_APPROVED = SANDBOX_LOCAL

/** 未审核远端源：最严格沙箱（空字符串 = 连脚本都不给）。 */
export const SANDBOX_REMOTE_DENIED = ''

export type FrameSandboxReason =
  | 'no_src'
  | 'local_module_content'
  | 'remote_flag_off'
  | 'remote_approved'
  | 'remote_untrusted'
  | 'invalid_url'

export interface FrameSandboxDecision {
  /** `undefined` = 不加 sandbox 属性（浏览器按无沙箱处理） */
  sandbox: string | undefined
  reason: FrameSandboxReason
}

export interface FrameSandboxInput {
  src: string
  /** 调用方判定：该地址是否**本机模块内容** origin（`isLocalModuleContentOrigin`） */
  isLocalModuleOrigin: boolean
  /** 调用方判定：该地址是否**经审核的远端**（`isTrustedRemoteModuleUrl`） */
  isTrustedRemote: boolean
  /** 调用方判定：DEV 回环豁免（`isDevLoopbackModuleUrl`，仅 DEV 构建传 true） */
  isDevLoopback?: boolean
  /** 是否强制远端沙箱（默认关；由调用点从构建变量注入，便于灰度与回滚） */
  enforceRemoteSandbox: boolean
}

/**
 * 纯函数：给定分类结果与开关，返回该帧应使用的 sandbox 属性值。
 *
 * 安全不变量：
 * 1. 本机内容 origin 的能力集由常量锁死（改动需同时改测试）；
 * 2. 开关关闭时远端帧**逐字保持** `undefined`（零行为变化）；
 * 3. 开关开启时，**非白名单远端源拿不到脚本能力**（`''` 而不是 `undefined`）。
 */
export const decideFrameSandbox = (input: FrameSandboxInput): FrameSandboxDecision => {
  const src = String(input?.src || '').trim()
  if (!src) return { sandbox: undefined, reason: 'no_src' }

  if (input.isLocalModuleOrigin) {
    return { sandbox: SANDBOX_LOCAL, reason: 'local_module_content' }
  }

  if (!input.enforceRemoteSandbox) {
    // 默认路径：保持 #1165 T04 的现状（远端不加 sandbox），零风险
    return { sandbox: undefined, reason: 'remote_flag_off' }
  }

  const approved = Boolean(input.isTrustedRemote) || Boolean(input.isDevLoopback)
  return approved
    ? { sandbox: SANDBOX_REMOTE_APPROVED, reason: 'remote_approved' }
    : { sandbox: SANDBOX_REMOTE_DENIED, reason: 'remote_untrusted' }
}

/**
 * 是否强制远端沙箱。
 *
 * 默认**关**（见模块头注释）；只有显式设置 `VITE_ENFORCE_REMOTE_MODULE_SANDBOX=1`
 * 才开启，便于灰度与回滚（改构建变量即可，不用改代码）。
 */
export const isRemoteSandboxEnforced = (): boolean => {
  try {
    return String(import.meta?.env?.VITE_ENFORCE_REMOTE_MODULE_SANDBOX || '') === '1'
  } catch {
    return false
  }
}
