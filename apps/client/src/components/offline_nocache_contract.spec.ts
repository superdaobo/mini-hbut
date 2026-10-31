/**
 * P0-2（issue #1158）：视图离线无缓存可读态 —— 源码契约测试。
 *
 * 项目为 node 环境（无 @vue/test-utils / DOM），无法挂载组件；参照仓库既有
 * 「源码契约」测试模式（CampusCodeView.spec / GradeDistributionView.spec），
 * 直接断言视图源码与三语字典的关键行为，防止后续改动回退：
 * - RankingView / StudentInfoView / ExamView 均须识别 P0-1 的 `data.noCache` 空态，
 *   并渲染 `common.offline.noCache` 可读文案（而非原始错误）；
 * - RankingView / ExamView 的 catch 分支在离线时不得显示原始网络错误；
 * - 三语字典 `common.offline.noCache` 必须齐备且非空（i18n_coverage 测试 2 同口径）。
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { messages, ensureLocaleMessages } from '../utils/app_i18n'

const read = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

describe('P0-2 视图离线无缓存可读态（#1158 源码契约）', () => {
  it('三语字典 common.offline.noCache 齐备且非空', async () => {
    await ensureLocaleMessages('en')
    await ensureLocaleMessages('ja')
    const zh = messages['zh-CN']['common.offline.noCache']
    const en = messages.en['common.offline.noCache']
    const ja = messages.ja['common.offline.noCache']
    expect(typeof zh).toBe('string')
    expect(zh.length).toBeGreaterThan(0)
    expect(typeof en).toBe('string')
    expect(en.length).toBeGreaterThan(0)
    expect(typeof ja).toBe('string')
    expect(ja.length).toBeGreaterThan(0)
    // 三语 key 集合一致（i18n_coverage 测试 2 同口径的最小自检）
    expect(zh).toBeDefined()
    expect(en).toBeDefined()
    expect(ja).toBeDefined()
  })

  it('RankingView：识别 data.noCache 空态并渲染 common.offline.noCache（离线时不显示原始错误）', () => {
    const source = read('./RankingView.vue')
    // 新增状态位
    expect(source).toContain('const offlineNoCache = ref(false)')
    // 识别 P0-1 标准离线空态
    expect(source).toMatch(/if \(data\?\.noCache\)/)
    // 模板渲染新文案
    expect(source).toContain("t('common.offline.noCache')")
    // 离线时 catch 不再走原始网络错误分支
    expect(source).toMatch(/isDeviceOffline\(\)/)
  })

  it('StudentInfoView：infoError / accessError 两分支在离线无缓存时走可读态', () => {
    const source = read('./StudentInfoView.vue')
    expect(source).toContain('const infoNoCache = ref(false)')
    expect(source).toContain('const accessNoCache = ref(false)')
    // 基本信息：识别 P0-1 noCache 空态
    expect(source).toMatch(/if \(data\?\.noCache\)/)
    // 登录访问记录：裸 axios 失败在离线时走可读态
    expect(source).toMatch(/isDeviceOffline\(\)/)
    // 两处均渲染新文案
    expect(source.match(/t\('common\.offline\.noCache'\)/g)?.length).toBeGreaterThanOrEqual(2)
  })

  it('ExamView：识别 data.noCache 空态并渲染 common.offline.noCache', () => {
    const source = read('./ExamView.vue')
    expect(source).toContain('const offlineNoCache = ref(false)')
    expect(source).toMatch(/if \(data\?\.noCache\)/)
    expect(source).toContain("t('common.offline.noCache')")
    expect(source).toMatch(/isDeviceOffline\(\)/)
  })
})
