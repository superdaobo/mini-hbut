import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('student info offline banner contract (#516)', () => {
  it('page-level offline banner is driven only by student basic info, not login-access block', () => {
    const source = readText('src/components/StudentInfoView.vue')

    const refreshBlock = source.match(/const refreshData = async \(options = \{\}\) => \{[\s\S]*?refreshing\.value = false\s*\n\}/)?.[0] || ''

    // 整页离线状态只由学生基本信息决定（#516：login_access 失败不应拖累整页）
    expect(refreshBlock).toContain('const basicOffline = !!basicRes?.offline && !basicRes?._fromCache && !basicRes?._stale')
    expect(refreshBlock).toContain('offline.value = basicOffline')
    // 登录访问记录独立标记，仅用于区块级提示
    expect(refreshBlock).toContain('const accessCached = !!accessRes?.offline')
    expect(refreshBlock).toContain('accessOffline.value = accessCached')
    // 不允许再把 access 的 offline 并入整页离线判定
    expect(refreshBlock).not.toContain('offline.value = basicOffline || accessOffline')
    expect(refreshBlock).not.toContain('|| accessOffline')
  })

  it('shows block-level cache hint for login records while page stays online', () => {
    const source = readText('src/components/StudentInfoView.vue')

    expect(source).toContain('const accessOffline = ref(false)')
    expect(source).toContain('const accessSyncTime = ref(\'\')')
    expect(source).toContain('class="cache-hint"')
    expect(source).toContain('登录记录暂不可用，当前显示缓存数据')
    expect(source).toContain('formatRelativeTime(accessSyncTime)')
    // 离线横幅保持原语义（仅整页离线时出现）
    expect(source).toContain('当前显示离线数据，更新于 {{ formatRelativeTime(syncTime) }}')
  })
})
