/**
 * 模块 URL 的「环境上下文」注入（P1-A 版本串 / P1-B 宿主 origin）。
 *
 * 与身份注入（`profile.appendIdentityQueryParams`，契约 D）严格分层：本模块只处理
 * **不是身份** 的两个参数，两者都与登录态无关，必须**始终注入**（含游客态）：
 *
 * - `app_version`：客户端构建版本（`import.meta.env.VITE_APP_VERSION`，由
 *   `vite.config.ts` 注入 `pkg.version`）。服务端灰度 deny 名单按版本串匹配；
 *   不注入（或注入空值）会让客户端上报 `unknown`，灰度在生产**空转**（跨仓阻塞点）。
 * - `host_origin`：宿主自身 origin（用既有 `normalizeGameOrigin` 归一，不手写字符串比较）。
 *   SDK 侧只接受**显式**来源（`config.hostOrigins` > URL 注入的 `host_origin`），
 *   无任何显式来源即 fail closed（不握手、零 V2 请求）；本参数是宿主唯一的自证渠道。
 *
 * 两条铁律：
 * 1. **非空才注入**（与 `rank_api` / `gomoku_api` 同一风格）：空值会被模块侧判为
 *    「宿主没声明」，反而让它回落 localStorage 历史值或 `unknown`；
 * 2. **绝不携带身份**：本模块不读写任何学号 / 昵称 / 班级字段。
 */

import { normalizeGameOrigin } from './base'

/** 版本字面量形状（与 SDK `runtime.resolveClientVersion` 同口径：只接受安全字符集） */
const CLIENT_VERSION_RE = /^[0-9A-Za-z._+-]{1,64}$/

/** 归一化构建版本：缺失 / 非法 → 空串（调用方按「非空才注入」处理，绝不注入假版本）。 */
export const normalizeAppVersion = (value: unknown): string => {
  const text = String(value ?? '').trim()
  return CLIENT_VERSION_RE.test(text) ? text : ''
}

/**
 * 当前构建版本。`override` 供测试显式注入；缺省读取构建期注入的 `VITE_APP_VERSION`
 * （vitest 下无该 define 时为 `undefined` → 空串，绝不误报版本）。
 */
export const resolveBuildAppVersion = (override?: unknown): string =>
  normalizeAppVersion(override ?? import.meta.env?.VITE_APP_VERSION)

/** 宿主自身 origin 归一（http(s) / Capacitor/Tauri 自定义 scheme；`*` / `null` / 非法 → 空串）。 */
export const resolveHostOrigin = (value: unknown): string => normalizeGameOrigin(value)

export interface ModuleEnvQueryOptions {
  /** 构建期版本（`resolveBuildAppVersion()` 的产物） */
  appVersion?: unknown
  /** 宿主自身 origin（`window.location.origin`） */
  hostOrigin?: unknown
}

/**
 * 把 `app_version` / `host_origin` 写入模块 iframe URL（**非空才注入**）。
 * @returns 实际注入的参数名（供诊断与测试断言）
 */
export const appendModuleEnvQueryParams = (
  url: URL,
  options: ModuleEnvQueryOptions = {}
): string[] => {
  const applied: string[] = []
  const version = normalizeAppVersion(options.appVersion)
  if (version) {
    url.searchParams.set('app_version', version)
    applied.push('app_version')
  }
  const hostOrigin = resolveHostOrigin(options.hostOrigin)
  if (hostOrigin) {
    url.searchParams.set('host_origin', hostOrigin)
    applied.push('host_origin')
  }
  return applied
}
