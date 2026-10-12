/**
 * 首页模块可见性与实际可操作性必须分离（#1043）。
 *
 * 缓存身份足以保留本机已登录用户熟悉的功能目录，但不能作为在线认证凭证。
 * 所有导航、深链和敏感执行仍只采信已验证会话。
 */
export interface HomeModuleSession {
  isLoggedIn: boolean
  isDemoSession: boolean
}

/** 仅用于首页目录、快捷入口及本地布局编辑，严禁作为授权输入。 */
export const homeModuleDisplaySession = (
  hasCachedIdentity: boolean,
  isDemoSession: boolean
): HomeModuleSession => ({
  isLoggedIn: Boolean(hasCachedIdentity),
  isDemoSession: Boolean(isDemoSession)
})

/** 仅用于点击导航等实际操作；缓存身份无法获得额外权限。 */
export const homeModuleAccessSession = (
  hasCachedIdentity: boolean,
  sessionVerified: boolean,
  isDemoSession: boolean
): HomeModuleSession => ({
  isLoggedIn: Boolean(hasCachedIdentity && sessionVerified),
  isDemoSession: Boolean(isDemoSession)
})
