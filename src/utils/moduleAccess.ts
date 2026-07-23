/**
 * 首页/深链模块入口的唯一准入策略。
 * Dashboard.navigateTo、App.goToView 等必须调用 canOpenModule，
 * 禁止只改 modules[].available 却不拦 navigate。
 */

export type ModuleAccessSession = {
  isLoggedIn?: boolean
}

export type ModuleAccessInput = {
  id: string
  available?: boolean
  requiresLogin?: boolean
  /** 不可用时的用户可见原因 */
  unavailableReason?: string
  desc?: string
}

export type ModuleAccessResult = {
  ok: boolean
  reason?: string
  /** 需要跳登录而非 toast */
  needLogin?: boolean
}

/** 硬禁用注册表（与 Dashboard 数据一致；navigate 以此为准） */
export const DISABLED_HOME_MODULE_REASONS: Readonly<Record<string, string>> = Object.freeze({
  // 场馆 H5 依赖 172.16.54.20 校园网 + accessToken；外网 third/open 无法落地
  sports_venue: '运动场馆需校园内网，当前环境暂不可用'
})

export function isHomeModuleHardDisabled(moduleId: string): boolean {
  return Object.prototype.hasOwnProperty.call(
    DISABLED_HOME_MODULE_REASONS,
    String(moduleId || '').trim()
  )
}

/**
 * 是否允许打开模块。
 * @param module 模块 id 或带 available/requiresLogin 的对象
 */
export function canOpenModule(
  module: ModuleAccessInput | string | null | undefined,
  session: ModuleAccessSession = {}
): ModuleAccessResult {
  const id =
    typeof module === 'string'
      ? String(module || '').trim()
      : String(module?.id || '').trim()
  if (!id) {
    return { ok: false, reason: '未知模块' }
  }

  if (isHomeModuleHardDisabled(id)) {
    return {
      ok: false,
      reason: DISABLED_HOME_MODULE_REASONS[id] || '暂不可用'
    }
  }

  if (typeof module === 'object' && module) {
    if (module.available === false) {
      return {
        ok: false,
        reason:
          String(module.unavailableReason || module.desc || '').trim() || '暂不可用'
      }
    }
    if (module.requiresLogin && !session.isLoggedIn) {
      return { ok: false, reason: '请先登录', needLogin: true }
    }
  }

  return { ok: true }
}
