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
    expect(source).toContain("const accessSyncTime = ref('')")
    expect(source).toContain('class="cache-hint"')
    // i18n 批次 D（#789）：文案接入 t()，契约改为断言 key 存在于字典且组件内引用
    expect(source).toContain("t('studentinfo.error.cacheHintPrefix')")
    expect(source).toContain('formatRelativeTime(accessSyncTime)')
    // 离线横幅保持原语义（仅整页离线时出现）
    expect(source).toContain('{{ t(\'common.offline.prefix\') }} {{ formatRelativeTime(syncTime) }}')
    const i18nSource = readText('src/utils/i18n/messages/zh-CN.ts')
    expect(i18nSource).toMatch(/'studentinfo\.error\.cacheHintPrefix': '登录记录暂不可用，当前显示缓存数据/)
  })
})
