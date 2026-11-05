/**
 * 模块能力授予的「不扩权」规则（#1168 T07 / ⛳ G-F 复核发现）。
 *
 * 问题：模块更新后清单可能声明**更多** permissions。若直接把清单权限当授予集，
 * 一次普通更新就能悄悄扩权（用户以为自己只是更新了页面）。
 *
 * 规则（本文件实现，纯函数便于测试）：
 * - 首次打开（没有历史授予记录）→ 授予清单里声明的全部能力（视为安装同意）；
 * - 后续更新 → 只授予「历史已同意集合 ∩ 新清单」；新增能力**不自动授予**，
 *   并把 `needsConsent` 标出来，等待后续的同意流程（T11/T13 的 permission_epoch）。
 *
 * 注意：这里只是「授予集」的收缩；能否真正取数仍由 Rust 侧能力登记表 + 实例信任决定。
 */

/**
 * @param {string[]} previousGranted 上次已同意授予的能力（空数组 = 已记录但什么都没给）
 * @param {string[]} requested 当前清单声明的能力
 * @param {{ firstInstall?: boolean }} [options]
 * @returns {{ granted: string[], needsConsent: string[] }}
 */
export const computeGrantedCapabilities = (previousGranted, requested, options = {}) => {
  const requestedList = Array.isArray(requested)
    ? Array.from(new Set(requested.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())))
    : []
  const previousList = Array.isArray(previousGranted)
    ? Array.from(new Set(previousGranted.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())))
    : []

  // 首次安装（**没有历史记录**，不是「记录了空集」）：清单即同意范围
  const noRecord = previousGranted === null || previousGranted === undefined
  if (options.firstInstall || noRecord) {
    return { granted: [...requestedList].sort(), needsConsent: [] }
  }

  const previousSet = new Set(previousList)
  const granted = requestedList.filter((item) => previousSet.has(item)).sort()
  const needsConsent = requestedList.filter((item) => !previousSet.has(item)).sort()
  return { granted, needsConsent }
}

/** 授予记录的存储键（按模块，跨版本）。 */
export const moduleGrantStorageKey = (moduleId) => `hbu_module_grants:${String(moduleId || '').trim()}`

/** 读取历史授予（非法内容按「无记录」处理，不放大权限）。 */
export const readModuleGrant = (moduleId, storage = globalThis?.localStorage) => {
  const key = moduleGrantStorageKey(moduleId)
  try {
    const raw = storage?.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null
    return parsed.filter((item) => typeof item === 'string' && item.trim())
  } catch {
    return null
  }
}

/** 写入授予记录（只存字符串数组）。 */
export const writeModuleGrant = (moduleId, granted, storage = globalThis?.localStorage) => {
  const key = moduleGrantStorageKey(moduleId)
  try {
    storage?.setItem(key, JSON.stringify(Array.isArray(granted) ? granted : []))
    return true
  } catch {
    return false
  }
}
