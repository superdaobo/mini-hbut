import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = () => readFileSync(new URL('./ExportCenterView.vue', import.meta.url), 'utf8')

describe('ExportCenterView initialization contract (#863)', () => {
  it('脚本侧遍历 computed moduleGroups 时显式解包 value，避免进入页面即白屏', () => {
    const vue = source()

    expect(vue).toContain('const moduleGroups = computed(() => [')
    expect(vue).toContain('moduleGroups.value.forEach((group) => {')
    expect(vue).not.toContain('moduleGroups.forEach((group) => {')
  })

  it('moduleMap 仍由响应式 computed 提供给首屏派生状态', () => {
    const vue = source()

    expect(vue).toContain('const moduleMap = computed(() => {')
    expect(vue).toContain('moduleMap.value.get(id)?.semesterAware')
    expect(vue).toContain('.map((id) => moduleMap.value.get(id))')
  })
})
