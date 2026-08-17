import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('schedule offline banner contract (#372)', () => {
  it('does not treat SWR offline cache as 教务暂不可用 for logged-in users', () => {
    const view =
      read('src/components/ScheduleView.vue') +
      '\n' +
      read('src/features/schedule/composables/useScheduleData.ts')
    const api = read('src/utils/api.ts')

    expect(api).toContain('withOfflineMeta')
    expect(api).toContain('getStaleCachedData')
    expect(view).toContain('silentCachePaint')
    expect(view).toContain('forceOfflineBanner')
    expect(view).toContain('treatAsSilentCache')
    expect(view).toContain('revalidateScheduleOnline')
    expect(view).toContain('fromCache')
    // 登录态成功 payload 不因 offline 标记误报
    expect(view).toContain('!silentCachePaint && !loggedIn')
    expect(view).toContain('当前显示为缓存课表，教务暂不可用。')
  })

  it('clears remote schedule data when switching semester (#633)', () => {
    // 切换学期时若不清空 remoteScheduleData，旧学期数据会在新学期无数据（接口失败）
    // 时被当成"本学期缓存"展示：误报「缓存课表/连接恢复」横幅 + 渲染错误课表。
    // 契约：切换分支（requestedSemester !== previousSemester）内必须同时清空两端数据源。
    const data = read('src/features/schedule/composables/useScheduleData.ts')
    const switchBlockStart = data.indexOf('requestedSemester !== previousSemester')
    expect(switchBlockStart).toBeGreaterThanOrEqual(0)
    const switchBlock = data.slice(switchBlockStart, switchBlockStart + 400)
    expect(switchBlock).toContain('customScheduleData.value = []')
    expect(switchBlock).toContain('remoteScheduleData.value = []')
    expect(switchBlock).toContain('mergeScheduleSources')
  })
})
