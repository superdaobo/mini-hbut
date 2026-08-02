// 动效方向契约测试：防止导航方向逻辑回归（#527）
// 通过读取 App.vue 源码做字符串断言，验证：
// 1) 返回链（goToParentView / popstate fallback / 返回首页）显式传 direction: 'back'
// 2) 视图过渡 computed 在 'none'（replace/tab）时不传自定义类（回落 name 纯淡入）
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { describe, it, expect } from 'vitest'

const appVue = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'App.vue'), 'utf8')

describe('App.vue 视图切换方向契约', () => {
  it('goToParentView 显式传 direction: back（不被 goToViewInternal 覆盖）', () => {
    // goToViewInternal 内会无条件 navDirection = direction || (push ? 'forward' : 'none')
    // 因此返回链必须显式传 direction:'back'，前置赋值是无效且误导的
    expect(appVue).toMatch(/goToViewInternal\(parentView,\s*\{\s*push: false,\s*restoreScroll: parentView === 'home',\s*direction: 'back'\s*\}/)
  })

  it('popstate 无父级回退首页显式传 direction: back', () => {
    expect(appVue).toMatch(/goToViewInternal\('home', \{ push: false, restoreScroll: true, direction: 'back' \}\)/)
  })

  it('返回仪表盘显式传 direction: back', () => {
    expect(appVue).toMatch(/goToView\('home', \{ restoreScroll: true, direction: 'back' \}\)/)
  })

  it('replace（none 方向）不传自定义过渡类，回落 name=module-fade', () => {
    // navDirection==='none' 时 computed 返回 undefined
    expect(appVue).toMatch(/\? 'module-fade-fwd-enter-active'\s*: undefined/)
  })

  it('isCurrentViewDomHealthy 过渡短路覆盖 fwd/back 方向类', () => {
    expect(appVue).toMatch(/module-fade-fwd-leave-active, \.module-fade-fwd-enter-active/)
    expect(appVue).toMatch(/module-fade-back-leave-active, \.module-fade-back-enter-active/)
  })
})
