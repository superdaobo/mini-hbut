import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const repoRoot = process.cwd()
const readText = (relativePath: string) =>
  fs.readFileSync(path.join(repoRoot, relativePath), 'utf8')

describe('IOSSelect theme contract', () => {
  it('keeps the controlled select behavior while using the Mini-HBUT themed picker shell', () => {
    const source = readText('src/components/IOSSelect.vue')

    expect(source).toContain('class="ios26-select-native"')
    expect(source).toContain('<teleport to="body">')
    expect(source).toContain("defineEmits(['update:modelValue', 'change'])")
    expect(source).toContain('const parseOutgoingValue = (value) =>')

    expect(source).toContain('--ios-select-accent')
    expect(source).toContain('--ios-select-accent-2')
    expect(source).toContain('--ios-select-panel')
    expect(source).toContain('--ios-select-active')
    expect(source).toContain('--ios-select-safe-bottom')
    expect(source).toContain('--ios-select-trigger-bg: #ffffff')
    expect(source).toContain('--ios-select-panel: #ffffff')
    expect(source).toContain('--ios-select-active: var(--ios-select-accent)')
    expect(source).toContain('--ios-select-shadow: 0 9px 21px rgba(15, 23, 42, 0.08)')
    expect(source).toContain('0 4px 9px rgba(15, 23, 42, 0.04)')
    expect(source).not.toContain('linear-gradient(135deg, var(--ios-select-accent), var(--ios-select-accent-2))')
  })

  it('has explicit light and dark themed states for the picker overlay', () => {
    const source = readText('src/components/IOSSelect.vue')
    const darkModeSource = readText('src/styles/dark-mode.css')

    expect(source).toContain(":global(html.dark) .ios26-select")
    expect(source).toContain(":global(html[data-theme='graphite_night']) .ios26-select")
    expect(source).toContain('prefers-reduced-motion: reduce')
    expect(source).toContain('backdrop-filter: blur(14px)')

    expect(darkModeSource).toContain('iOS 选择器暗色模式')
    expect(darkModeSource).toContain('--ios-select-panel')
    expect(darkModeSource).toContain('--ios-select-active')
  })

  it('does not leave thick white gutters in the dark picker sheet', () => {
    const source = readText('src/components/IOSSelect.vue')
    const darkModeSource = readText('src/styles/dark-mode.css')

    expect(source).toContain('--ios-select-panel: #0f172a')
    expect(source).toContain('--ios-select-item: #1e293b')
    expect(source).toContain('.ios26-select-list')
    expect(source).toContain('padding: 2px 10px 10px')
    expect(source).toContain('.ios26-select-cancel')
    expect(source).toContain('background: var(--ios-select-panel)')
    expect(darkModeSource).toContain('--ios-select-panel: #0f172a')
    expect(darkModeSource).toContain('--ios-select-item: #1e293b')
  })
})
