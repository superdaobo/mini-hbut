/**
 * #773 轻量多语言模块单元测试。
 * 覆盖：默认值、非法存储值回落、setLocale 持久化 + 事件派发、t() 回落链。
 *
 * 说明：vitest 全局环境为 node（无 localStorage/window），且模块持有
 * 模块级状态（currentLocale），因此参照 night_mode.spec 的做法：
 * stub localStorage/window + vi.resetModules 动态 import，保证用例互不污染。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as AppI18nModule from './app_i18n'

type AppI18n = typeof AppI18nModule

const storageMap = new Map<string, string>()
const stubStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => {
    storageMap.set(key, String(value))
  },
  removeItem: (key: string) => {
    storageMap.delete(key)
  },
  clear: () => storageMap.clear(),
  key: (index: number) => Array.from(storageMap.keys())[index] ?? null,
  length: 0
}

const loadModule = async (): Promise<AppI18n> => {
  vi.resetModules()
  return (await import('./app_i18n')) as AppI18n
}

describe('app_i18n（#773 语言偏好）', () => {
  beforeEach(() => {
    storageMap.clear()
    ;(globalThis as { localStorage?: Storage }).localStorage = stubStorage as unknown as Storage
    ;(globalThis as { window?: unknown }).window = {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }
  })

  afterEach(() => {
    vi.clearAllMocks()
    delete (globalThis as { localStorage?: unknown }).localStorage
    delete (globalThis as { window?: unknown }).window
  })

  it('默认语言为 zh-CN，存储无值时 getLocale 返回默认', async () => {
    const i18n = await loadModule()

    expect(i18n.DEFAULT_LOCALE).toBe('zh-CN')
    expect(i18n.getLocale()).toBe('zh-CN')
  })

  it('模块加载时读取存储：合法值生效，非法/损坏值回落 zh-CN', async () => {
    // 合法值
    storageMap.set('hbu_app_locale', 'en')
    expect((await loadModule()).getLocale()).toBe('en')

    // 非法值（外部写坏的数据）
    storageMap.set('hbu_app_locale', 'fr-FR')
    expect((await loadModule()).getLocale()).toBe('zh-CN')

    storageMap.set('hbu_app_locale', '{"malformed')
    expect((await loadModule()).getLocale()).toBe('zh-CN')
  })

  it('resolveLocale：非法/空值回落 zh-CN，合法值原样通过', async () => {
    const i18n = await loadModule()

    expect(i18n.resolveLocale('en')).toBe('en')
    expect(i18n.resolveLocale('zh-CN')).toBe('zh-CN')
    expect(i18n.resolveLocale(null)).toBe('zh-CN')
    expect(i18n.resolveLocale('')).toBe('zh-CN')
    expect(i18n.resolveLocale('fr-FR')).toBe('zh-CN')
    expect(i18n.resolveLocale(123)).toBe('zh-CN')
  })

  it('setLocale 持久化到 hbu_app_locale 并派发 hbu-locale-changed 事件', async () => {
    const i18n = await loadModule()

    const dispatch = vi.fn()
    ;(globalThis as { window?: unknown }).window = {
      dispatchEvent: dispatch,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }

    i18n.setLocale('en')

    expect(storageMap.get('hbu_app_locale')).toBe('en')
    expect(i18n.getLocale()).toBe('en')
    expect(dispatch).toHaveBeenCalledTimes(1)
    const event = dispatch.mock.calls[0][0] as CustomEvent
    expect(event.type).toBe('hbu-locale-changed')
    expect(event.detail).toEqual({ locale: 'en' })
  })

  it('setLocale 对非法入参回落默认值（不写入垃圾数据）', async () => {
    const i18n = await loadModule()

    // @ts-expect-error 故意传入非法值验证兜底
    i18n.setLocale('xx-YY')

    expect(i18n.getLocale()).toBe('zh-CN')
    expect(storageMap.get('hbu_app_locale')).toBe('zh-CN')
  })

  it('t()：当前 locale 取词，切换后即时生效', async () => {
    const i18n = await loadModule()

    expect(i18n.t('settings.title')).toBe('设置中心')
    i18n.setLocale('en')
    expect(i18n.t('settings.title')).toBe('Settings')
    expect(i18n.t('tab.home')).toBe('Home')
  })

  it('t() 回落链：en 缺失 key → zh-CN 字典 → 仍缺失返回 key 本身', async () => {
    const i18n = await loadModule()

    i18n.setLocale('en')
    // 临时向 zh-CN 注入 en 缺失的 key，验证回落到 zh-CN 字典（用后清理）
    const probeKey = 'test.fallback.only-zh'
    i18n.messages['zh-CN'][probeKey] = '仅中文'
    try {
      expect(i18n.t(probeKey)).toBe('仅中文')
    } finally {
      delete i18n.messages['zh-CN'][probeKey]
    }
    // 双侧都不存在的 key → 返回 key 本身，保证永不空白
    expect(i18n.t('no.such.key')).toBe('no.such.key')
    // 清理后字典 key 集合恢复一致
    expect(Object.keys(i18n.messages['zh-CN'])).not.toContain(probeKey)
  })

  it('useLocale：监听 hbu-locale-changed 事件，locale ref 跟随更新', async () => {
    const i18n = await loadModule()

    const localeChangedHandlers: Array<(event: unknown) => void> = []
    ;(globalThis as { window?: unknown }).window = {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn((type: string, cb: (event: unknown) => void) => {
        if (type === 'hbu-locale-changed') localeChangedHandlers.push(cb)
      }),
      removeEventListener: vi.fn()
    }

    const { locale, t: tFn } = i18n.useLocale()
    expect(locale.value).toBe('zh-CN')

    // setLocale 更新模块状态 + 派发事件（本 stub 只记录监听器，手动回调验证跟随）
    i18n.setLocale('en')
    expect(localeChangedHandlers.length).toBeGreaterThan(0)
    localeChangedHandlers.forEach((cb) => cb({ detail: { locale: 'en' } }))
    expect(locale.value).toBe('en')
    // t() 内部读模块级状态，已按新语言取词
    expect(tFn('tab.me')).toBe('Me')
  })

  it('字典：zh-CN 与 en 的 key 集合完全一致（防止漏翻译）', async () => {
    const i18n = await loadModule()

    const zhKeys = Object.keys(i18n.messages['zh-CN']).sort()
    const enKeys = Object.keys(i18n.messages.en).sort()
    expect(enKeys).toEqual(zhKeys)
  })
})

