/**
 * 运行环境惰性访问层。
 *
 * 约束：**模块顶层不得触碰 window / document / localStorage**（Node 测试环境没有这些全局）。
 * 所有访问都必须是惰性 + 容错，任何一次访问都不得抛错。
 */

/** 全局对象（浏览器 = window，Node = globalThis） */
export const getGlobal = () => {
  if (typeof globalThis !== 'undefined') return globalThis
  return {}
}

/**
 * 取浏览器 window：优先 globalThis.window（测试常用 vi.stubGlobal('window', ...) 注入），
 * 否则在 globalThis 自身带 location/document 时回退到 globalThis。
 */
export const getWindow = () => {
  const scope = getGlobal()
  const candidate = scope.window
  if (candidate && typeof candidate === 'object') return candidate
  if (scope.location || scope.document) return scope
  return null
}

/** location（缺省返回 null） */
export const getLocation = () => {
  const scope = getGlobal()
  const windowRef = getWindow()
  const candidate = windowRef?.location || scope.location
  return candidate && typeof candidate === 'object' ? candidate : null
}

/** history（缺省返回 null） */
export const getHistory = () => {
  const windowRef = getWindow()
  const candidate = windowRef?.history || getGlobal().history
  return candidate && typeof candidate === 'object' ? candidate : null
}

/** document（缺省返回 null） */
export const getDocument = () => {
  const windowRef = getWindow()
  const candidate = windowRef?.document || getGlobal().document
  return candidate && typeof candidate === 'object' ? candidate : null
}

/** navigator（缺省返回 null） */
export const getNavigator = () => {
  const scope = getGlobal()
  const windowRef = getWindow()
  const candidate = windowRef?.navigator || scope.navigator
  return candidate && typeof candidate === 'object' ? candidate : null
}

/** localStorage（不可用时返回 null：隐私模式/无权限一律降级，不抛错） */
export const getLocalStorage = () => {
  try {
    const windowRef = getWindow()
    const candidate = windowRef?.localStorage || getGlobal().localStorage
    if (!candidate || typeof candidate.getItem !== 'function') return null
    return candidate
  } catch {
    return null
  }
}

/** 读取 URL query（返回可 get 的对象；无 location 时返回空 URLSearchParams） */
export const readSearchParams = (searchOverride) => {
  const location = getLocation()
  const search = typeof searchOverride === 'string' ? searchOverride : String(location?.search || '')
  try {
    return new URLSearchParams(search || '')
  } catch {
    return new URLSearchParams('')
  }
}

/** 当前页面 origin（缺省空串） */
export const getPageOrigin = () => {
  const location = getLocation()
  return String(location?.origin || '')
}

/** 当前页面协议（缺省空串） */
export const getPageProtocol = () => {
  const location = getLocation()
  return String(location?.protocol || '')
}

/** document.referrer 的 origin（宿主页地址；空串表示不可得） */
export const getReferrerOrigin = () => {
  const documentRef = getDocument()
  const referrer = String(documentRef?.referrer || '')
  if (!referrer) return ''
  try {
    return new URL(referrer).origin
  } catch {
    return ''
  }
}

/** 是否处于 iframe 内（无 window.parent 或 parent === window → 非嵌入） */
export const isEmbedded = () => {
  const windowRef = getWindow()
  if (!windowRef) return false
  const parentRef = windowRef.parent
  if (!parentRef) return false
  return parentRef !== windowRef
}

/** 取宿主窗口（非嵌入时返回 null） */
export const getHostWindow = () => {
  const windowRef = getWindow()
  if (!windowRef || !isEmbedded()) return null
  return windowRef.parent
}
