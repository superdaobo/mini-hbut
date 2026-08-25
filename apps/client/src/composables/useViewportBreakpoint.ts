import { ref, onScopeDispose, type Ref } from 'vue'

/**
 * 宽屏断点查询串全仓唯一收口（#714）：
 * JS 侧一律从这里取查询串，禁止再散落手写 innerWidth 阈值；
 * CSS 侧 @media 断点（600 / 768 / 1024）必须与此处语义保持一致。
 */
export const VIEWPORT_QUERY = Object.freeze({
  tablet: '(min-width: 768px)',
  desktop: '(min-width: 1024px)'
} as const)

export type ViewportQueryKey = keyof typeof VIEWPORT_QUERY

/**
 * matchMedia 驱动的最小宽度侦测（change 事件，非 resize 轮询）。
 * 无 window 环境（vitest node / SSR）安全降级为常量 false。
 */
export const useMinWidth = (query: string): Ref<boolean> => {
  const matches = ref(false)
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return matches
  }
  const mediaList = window.matchMedia(query)
  matches.value = mediaList.matches
  const handleChange = (event: MediaQueryListEvent) => {
    matches.value = event.matches
  }
  mediaList.addEventListener('change', handleChange)
  onScopeDispose(() => {
    mediaList.removeEventListener('change', handleChange)
  })
  return matches
}

/** 主断点：≥768px（首页双栏/平板竖屏）；传 'desktop' 取 ≥1024px 档 */
export const useViewportBreakpoint = (key: ViewportQueryKey = 'tablet'): Ref<boolean> =>
  useMinWidth(VIEWPORT_QUERY[key])
