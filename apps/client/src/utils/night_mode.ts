/**
 * 深浅色模式（#757 三态模型：跟随系统 / 白天 / 夜间）。
 *
 * 偏好三态：'system'（跟随系统，默认）| 'light'（白天）| 'dark'（夜间）。
 *
 * 存储与迁移：
 * - 新键 hbu_theme_mode 存三态值 'system' | 'light' | 'dark'；
 * - 旧键 hbu_dark_mode（'1'/'0'）仅在首次读取时一次性迁移：
 *   '1' → dark、'0' → light，老用户深浅色语义不变，迁移结果落盘新键；
 *   旧键保留不清除，读取永远以新键优先，重复迁移无副作用。
 * - 两键均无值 → system（默认跟随系统，与旧版「无值保留 DOM 状态」不同，
 *   这是 #757 的目标行为：未设置过的用户自动跟随系统深浅色）。
 *
 * DOM 语义不变：html.dark 表示当前深色生效（ui_settings.isNightModeEnabled、
 * dark-mode.css 等消费方不受影响）。
 * system 态通过 matchMedia('(prefers-color-scheme: dark)') 决定 dark class，
 * 并监听 change 事件即时切换（无需重启）；手动 light/dark 行为与旧版一致。
 */
export type NightModePreference = 'system' | 'light' | 'dark'

/** 旧版二态存储键：仅用于一次性迁移读取 */
const NIGHT_MODE_LEGACY_KEY = 'hbu_dark_mode'
/** 三态偏好存储键 */
const NIGHT_MODE_PREF_KEY = 'hbu_theme_mode'

/** 夜晚模式切换事件：供 ui_settings 等模块重新注入语义色 token */
export const NIGHT_MODE_CHANGED_EVENT = 'hbu-night-mode-changed'

const PREFERENCE_VALUES: readonly NightModePreference[] = ['system', 'light', 'dark']
const SYSTEM_DARK_QUERY = '(prefers-color-scheme: dark)'

// 模块级：系统深浅色媒体查询与监听（幂等注册；handler 内实时判断偏好，
// 因此手动 light/dark 模式下系统变化不会影响 DOM，无需注销）
let systemDarkQuery: MediaQueryList | null = null
let systemDarkListener: ((event: MediaQueryListEvent) => void) | null = null

const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    // localStorage 不可用时按无值处理
    return null
  }
}

const writeStorage = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value)
  } catch {
    // localStorage 不可用时仅同步当前 DOM 状态
  }
}

/**
 * 解析存储值为三态偏好：
 * 合法三态原样返回；旧键语义迁移 '1' → dark、'0' → light；空/非法值 → system。
 */
export const resolveNightModePreference = (raw: string | null | undefined): NightModePreference => {
  const value = String(raw ?? '').trim()
  if ((PREFERENCE_VALUES as readonly string[]).includes(value)) {
    return value as NightModePreference
  }
  if (value === '1') return 'dark'
  if (value === '0') return 'light'
  return 'system'
}

/**
 * 读取当前偏好：新键优先；仅存旧键时一次性迁移并落盘新键；均无值 → system。
 */
export const getNightModePreference = (): NightModePreference => {
  const stored = readStorage(NIGHT_MODE_PREF_KEY)
  if (stored !== null) return resolveNightModePreference(stored)
  const legacy = readStorage(NIGHT_MODE_LEGACY_KEY)
  if (legacy === null) return 'system'
  const migrated = resolveNightModePreference(legacy)
  writeStorage(NIGHT_MODE_PREF_KEY, migrated)
  return migrated
}

/** 查询系统是否偏好深色（matchMedia 不可用或异常时按浅色处理） */
const systemPrefersDark = (): boolean => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  try {
    return !!window.matchMedia(SYSTEM_DARK_QUERY).matches
  } catch {
    return false
  }
}

/** 解析三态偏好当前应生效的深色布尔值（设置页动画方向等 UI 消费） */
export const resolveNightModeDark = (mode: NightModePreference): boolean =>
  mode === 'dark' || (mode === 'system' && systemPrefersDark())

const dispatchNightModeChanged = (enabled: boolean) => {
  if (typeof window === 'undefined') return
  try {
    window.dispatchEvent(new CustomEvent(NIGHT_MODE_CHANGED_EVENT, { detail: { enabled } }))
  } catch {
    // 事件派发失败不影响主流程
  }
}

/**
 * #757 跨线协作：把应用当前模式同步给小组件（线B在 widget_bridge 预留
 * writeWidgetThemeMode）。动态 import + 静默吞错：模块加载失败或线B代码
 * 未合并（函数尚不存在）时不得影响主流程。
 */
const syncWidgetThemeMode = (mode: NightModePreference) => {
  if (typeof window === 'undefined') return
  import('./widget_bridge')
    .then((mod) => {
      const bridge = mod as unknown as {
        writeWidgetThemeMode?: (mode: NightModePreference) => void
      }
      if (typeof bridge.writeWidgetThemeMode === 'function') {
        bridge.writeWidgetThemeMode(mode)
      }
    })
    .catch(() => {
      // widget_bridge 加载失败（环境不支持/依赖缺失）：静默忽略
    })
}

const applyDarkClass = (enabled: boolean) => {
  if (typeof document === 'undefined') return
  const classList = document.documentElement.classList
  if (enabled) {
    classList.add('dark')
  } else {
    classList.remove('dark')
  }
}

/** 按偏好应用 dark class + 派发变更事件 + 同步小组件；返回当前深色布尔值 */
const applyNightModeInternal = (mode: NightModePreference): boolean => {
  const enabled = resolveNightModeDark(mode)
  applyDarkClass(enabled)
  dispatchNightModeChanged(enabled)
  syncWidgetThemeMode(mode)
  return enabled
}

/** 注册系统深浅色 change 监听（幂等）；仅 system 态在 handler 内生效 */
const ensureSystemDarkListener = () => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
  try {
    if (!systemDarkQuery) {
      systemDarkQuery = window.matchMedia(SYSTEM_DARK_QUERY)
    }
    if (systemDarkListener || !systemDarkQuery) return
    systemDarkListener = () => {
      // 手动 light/dark 模式不跟随系统；仅偏好仍为 system 时即时切换
      if (getNightModePreference() !== 'system') return
      applyNightModeInternal('system')
    }
    if (typeof systemDarkQuery.addEventListener === 'function') {
      systemDarkQuery.addEventListener('change', systemDarkListener)
    } else if (typeof (systemDarkQuery as { addListener?: unknown }).addListener === 'function') {
      // 兼容旧版 WebView 的 addListener API
      ;(systemDarkQuery as unknown as { addListener: (cb: typeof systemDarkListener) => void }).addListener(
        systemDarkListener
      )
    }
  } catch {
    // matchMedia 异常：system 态按浅色处理，不阻塞初始化
  }
}

/**
 * 设置偏好（三态）：'system' 跟随系统 / 'light' 白天 / 'dark' 夜间。
 * 写入新键并立即应用；返回当前深色布尔值。
 */
export const setNightModePreference = (mode: NightModePreference): boolean => {
  const normalized = resolveNightModePreference(mode)
  writeStorage(NIGHT_MODE_PREF_KEY, normalized)
  ensureSystemDarkListener()
  return applyNightModeInternal(normalized)
}

/**
 * 旧版二态 API（保持兼容：debug_bridge 等消费方仍以 boolean 切换）。
 * true → dark、false → light；返回当前深色布尔值。
 */
export const applyNightModePreference = (enabled: boolean): boolean =>
  setNightModePreference(enabled ? 'dark' : 'light')

/**
 * 启动初始化：读取偏好（含旧键一次性迁移）、注册系统深浅色监听并应用。
 * 返回当前深色布尔值。
 */
export const initNightModeClass = (): boolean => {
  if (typeof document === 'undefined') return false
  const mode = getNightModePreference()
  ensureSystemDarkListener()
  return applyNightModeInternal(mode)
}

export const isNightModeEnabled = (): boolean => {
  if (typeof document === 'undefined') return false
  const classList = document.documentElement.classList
  return typeof classList.contains === 'function' ? classList.contains('dark') : false
}
