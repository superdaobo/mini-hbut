import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (relativePath: string) => readFileSync(path.join(process.cwd(), relativePath), 'utf8')

describe('schedule offline banner contract (#372)', () => {
  it('does not treat SWR offline cache as 教务暂不可用 for logged-in users', () => {
    const view = read('src/components/ScheduleView.vue')
    const api = read('src/utils/api.js')

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
})
