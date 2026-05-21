import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const readSource = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('bottom tab bar safe area contract', () => {
  const appVue = () => readSource('src/App.vue')
  const uxCss = () => readSource('src/styles/ui_ux_pro_max.css')

  it('marks the bottom tab bar with an iOS-specific class', () => {
    expect(appVue()).toContain("'bottom-tab-bar--ios': isIOSLike")
  })

  it('anchors the iOS bottom tab bar to the viewport bottom', () => {
    expect(uxCss()).toMatch(
      /\.bottom-tab-bar--ios\s*\{[^}]*--bottom-tab-bar-bottom:\s*0px;/s
    )
  })

  it('does not add safe-area-inset-bottom to compact tab bar bottom positioning', () => {
    const compactRule = uxCss().match(/html\[data-ui-nav='compact'\]\s+\.bottom-tab-bar\s*\{(?<body>[^}]*)\}/s)

    expect(compactRule?.groups?.body).toBeTruthy()
    expect(compactRule?.groups?.body).not.toContain('env(safe-area-inset-bottom')
  })
})
