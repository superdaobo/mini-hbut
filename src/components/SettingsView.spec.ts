import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('SettingsView emits declaration', () => {
  it('declares the workspace layout event passed by App.vue', () => {
    const source = readFileSync(new URL('./SettingsView.vue', import.meta.url), 'utf8')

    expect(source).toContain("defineEmits(['back', 'openWorkspaceLayout'])")
  })
})
