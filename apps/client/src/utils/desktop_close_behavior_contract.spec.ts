// 桌面窗口关闭契约（#875）。
// 目标：系统窗口关闭与应用内返回彻底分离，防止 PC 标题栏 × 再次退化成“返回键”。
import { describe, expect, it } from 'vitest'
import { readContractSource } from './contract_source_test'

const navigationSource = readContractSource('src/app/coordinators/NavigationCoordinator.ts')

const readFunctionBody = (name: string) => {
  const start = navigationSource.indexOf(`const ${name} =`)
  expect(start, `${name} 应存在`).toBeGreaterThanOrEqual(0)
  const nextFunction = navigationSource.indexOf('\n  const ', start + 1)
  return navigationSource.slice(start, nextFunction > start ? nextFunction : undefined)
}

describe('Desktop window close behavior (#875)', () => {
  it('桌面 Tauri 在注册 CloseRequested 之前直接返回', () => {
    const body = readFunctionBody('installCloseInterceptor')
    expect(body).toContain('if (!hasTauri || isDesktopLike) return')

    const guardIndex = body.indexOf('if (!hasTauri || isDesktopLike) return')
    const windowIndex = body.indexOf('getCurrentNativeWindow()')
    const listenerIndex = body.indexOf('onCloseRequested')

    expect(guardIndex).toBeGreaterThanOrEqual(0)
    expect(windowIndex).toBeGreaterThan(guardIndex)
    expect(listenerIndex).toBeGreaterThan(guardIndex)
  })

  it('移动端 CloseRequested 保护逻辑仍然保留', () => {
    const body = readFunctionBody('installCloseInterceptor')
    expect(body).toContain('event.preventDefault()')
    expect(body).toContain('window.history.back()')
    expect(body).toContain('state.showExitDialog.value = true')
  })

  it('应用内 popstate 返回逻辑与系统关闭逻辑保持独立', () => {
    const closeBody = readFunctionBody('installCloseInterceptor')
    const popStateBody = readFunctionBody('handlePopState')

    expect(popStateBody).toContain('goToParentView()')
    expect(closeBody).not.toContain('handlePopState')
  })
})
