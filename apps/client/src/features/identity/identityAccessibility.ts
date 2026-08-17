// src/features/identity/identityAccessibility.ts
//
// #623：授权 Overlay 键盘可达性纯函数（可单测，无 DOM 依赖）。
//
// 要求（issue #623「Accessibility/响应式」）：
//   - 键盘 Tab/focus trap：焦点在 Overlay 卡片内循环，不逃逸到背景页面；
//   - Escape 不得无声关闭并仍批准：等价 cancel（由 Overlay 组件绑定）；
//   - 焦点移入 Overlay 时自动聚焦卡片（组件层实现）。

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'

/** 卡片内可聚焦元素（排除 disabled 与负 tabindex） */
export const getFocusableElements = (card: Element | null): HTMLElement[] => {
  if (!card) return []
  return Array.from(card.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0
  )
}

/**
 * Tab 焦点陷阱：
 * - 焦点在第一个元素时按 Shift+Tab -> 跳到最后一个；
 * - 焦点在最后一个元素时按 Tab -> 跳回第一个；
 * - 焦点不在卡片内（初进）时，Tab 强制落到第一个元素。
 * 卡片内没有可聚焦元素时阻止 Tab 逃逸。
 */
export const trapTabFocus = (
  card: Element | null,
  event: { key: string; shiftKey: boolean; preventDefault: () => void },
  activeElement: Element | null
): void => {
  if (!card || event.key !== 'Tab') return
  const focusables = getFocusableElements(card)
  if (focusables.length === 0) {
    event.preventDefault()
    return
  }
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const inside = activeElement !== null && card.contains(activeElement)
  if (!inside) {
    event.preventDefault()
    first.focus()
    return
  }
  if (event.shiftKey && activeElement === first) {
    event.preventDefault()
    last.focus()
    return
  }
  if (!event.shiftKey && activeElement === last) {
    event.preventDefault()
    first.focus()
  }
}

/** 将焦点移入卡片（打开 Overlay 时调用；失败静默降级） */
export const focusCard = (card: Element | null): void => {
  if (!card) return
  try {
    ;(card as HTMLElement).focus?.()
  } catch {
    // 焦点不可用（如隐藏环境）：静默降级
  }
}
