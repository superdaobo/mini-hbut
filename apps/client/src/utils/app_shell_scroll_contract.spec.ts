// #681 契约测试：防止 app-shell 滚动装配与切页回顶机制回归。
// 背景：全应用唯一滚动容器 <main class="app-shell"> 曾从未绑定 state.appShellRef，
// 切页回顶（forceScrollTop）因此全程空转——首页滚动位置跨 Tab 串扰，
// 课表页叠加 overflow:hidden 后直接卡死在底部且无法滑回。
import { describe, it, expect } from 'vitest'
import { readContractSource } from './contract_source_test'

const appVue = readContractSource('src/App.vue')
const navigationTs = readContractSource('src/app/coordinators/NavigationCoordinator.ts')
const lifecycleTs = readContractSource('src/app/coordinators/LifecycleCoordinator.ts')
const appStateTs = readContractSource('src/app/state/appState.ts')

describe('app-shell 滚动装配契约（#681）', () => {
  it('App.vue 的 main.app-shell 必须经 bindAppShellRef 装配 DOM 引用', () => {
    // 缺失该绑定时 appShellRef 恒为 null，切页回顶与首页滚动恢复全部失效
    expect(appVue).toMatch(/<main\s+:ref="bindAppShellRef"\s+class="app-shell"/)
  })

  it('bindAppShellRef 必须把元素写入 state.appShellRef', () => {
    expect(appVue).toMatch(/state\.appShellRef\.value = \(el as HTMLElement \| null\) \?\? null/)
  })
})

describe('切页回顶实现契约（#681）', () => {
  it('forceScrollTop 必须清零共享容器的 scrollTop', () => {
    // window/document 层清零在 html/body overflow:hidden 下全是 no-op，
    // 真正生效的只有 .app-shell 这一层
    expect(navigationTs).toMatch(/state\.appShellRef\.value\.scrollTop = 0/)
  })

  it('getAppShellScrollTop 必须优先读 appShellRef', () => {
    expect(navigationTs).toMatch(/const shell = state\.appShellRef\.value/)
  })

  it('forceScrollTop 唯一实现收敛在 NavigationCoordinator', () => {
    // 曾存在两份相同副本双处维护；LifecycleCoordinator 一律经 runtime.navigation 调用
    expect(lifecycleTs).not.toMatch(/const forceScrollTop = \(\)/)
    expect(lifecycleTs).toContain('runtime.navigation.forceScrollTop()')
  })
})

describe('死代码清理契约（#681）', () => {
  it('pendingScrollToTopOnViewChange 死旗标不得回归', () => {
    // 该旗标曾有 5 处写入、0 处读取
    for (const source of [navigationTs, lifecycleTs, appStateTs]) {
      expect(source).not.toContain('pendingScrollToTopOnViewChange')
    }
  })

  it('syncFromHash 的 scrollToTop 死参数不得回归（唯一消费者曾是上述死旗标）', () => {
    expect(navigationTs).toMatch(/const syncFromHash = async \(\) => \{/)
  })
})
