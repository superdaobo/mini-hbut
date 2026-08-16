import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = process.cwd()
const readText = (relativePath: string) => {
  const full = resolve(repoRoot, relativePath)
  return existsSync(full) ? readFileSync(full, 'utf8') : ''
}

/** Structural contract for PrivacyDataView + MeView "关于 Mini-HBUT" polish (#464). */
describe('privacy & about Mini-HBUT UI contract (#464)', () => {
  const privacyPath = 'src/components/PrivacyDataView.vue'
  const mePath = 'src/components/MeView.vue'
  const darkPath = 'src/styles/dark-mode.css'

  it('exists and uses unified page header + surface tokens on Privacy & Data', () => {
    const source = readText(privacyPath)
    expect(existsSync(resolve(repoRoot, privacyPath))).toBe(true)

    // Prefer TPageHeader; allow grade-stitch-style tokens as alternate shell language
    const hasTPageHeader = source.includes('<TPageHeader') && source.includes("from './templates'")
    const hasGradeStitchTokens =
      source.includes('grade-stitch-header') || source.includes('--ui-surface')
    expect(hasTPageHeader || hasGradeStitchTokens).toBe(true)

    expect(source).toContain('--ui-surface')
    expect(source).toContain('--ui-surface-border')
    expect(source).toContain('--ui-text')
    expect(source).toContain('--ui-muted')
    expect(source).toContain('privacy-card')
    expect(source).toContain('privacySlideUp')
    expect(source).toContain('prefers-reduced-motion')
  })

  it('keeps all data-control actions and external policy links (no behavior regression)', () => {
    const source = readText(privacyPath)

    expect(source).toContain('PRIVACY_POLICY_URL')
    expect(source).toContain('SECURITY_DOCS_URL')
    expect(source).toContain('SUPPORT_DOCS_URL')
    expect(source).toContain('PROJECT_HOME_URL')
    expect(source).toContain('GITHUB_URL')
    expect(source).toContain('FEEDBACK_URL')
    expect(source).toContain('clearLocalCaches')
    expect(source).toContain('clearSession')
    expect(source).toContain('clearAllLocal')
    expect(source).toContain('disableCloudAndStats')
    expect(source).toContain('exportLocalMeta')
    expect(source).toContain("emit('logout')")
    expect(source).toContain("emit('cleared')")
    expect(source).toContain("emit('back')")

    // Must not hard-require secrets / passwords in this page
    expect(source).not.toMatch(/password\s*[:=]/i)
    expect(source).not.toMatch(/api[_-]?key/i)
    expect(source).not.toMatch(/secret[_-]?key/i)
    expect(source).not.toContain('localStorage.getItem(\'password')
  })

  it('does not hardcode pure white card/button surfaces on Privacy & Data', () => {
    const source = readText(privacyPath)
    const styleBlock = source.match(/<style[\s\S]*?<\/style>/)?.[0] || ''

    // Old prototype used background: #fff on cards/buttons
    expect(styleBlock).not.toMatch(/background:\s*#fff\b/i)
    expect(styleBlock).not.toMatch(/background:\s*#ffffff\b/i)
    expect(styleBlock).toContain('var(--ui-surface')
  })

  it('brands MeView about Mini-HBUT privacy entry with icon + tokens', () => {
    const source = readText(mePath)
    expect(existsSync(resolve(repoRoot, mePath))).toBe(true)

    expect(source).toContain('关于 Mini-HBUT')
    expect(source).toContain('privacy-policy-entry')
    expect(source).toContain('PRIVACY_POLICY_URL')
    expect(source).toContain('openExternal(PRIVACY_POLICY_URL)')
    expect(source).toMatch(/privacy-policy-entry[\s\S]*shield|material-symbols-outlined[\s\S]*shield/)
    expect(source).toContain('--ui-surface')
    expect(source).toContain('--ui-text')
    expect(source).toContain('--ui-muted')
    expect(source).toContain('prefers-reduced-motion')
  })

  it('registers dark-mode readability for privacy page and about privacy entry', () => {
    const dark = readText(darkPath)
    expect(dark).toContain('html.dark .privacy-data-view')
    expect(dark).toContain('html.dark .privacy-data-view .privacy-card')
    expect(dark).toContain('html.dark .me-view .privacy-policy-entry')
  })

  it('preserves non-official disclaimer copy sources without embedding secrets', () => {
    const privacy = readText(privacyPath)
    const me = readText(mePath)

    expect(privacy).toContain('NON_OFFICIAL_DISCLAIMER_ZH')
    expect(privacy).toContain('NON_OFFICIAL_DISCLAIMER_EN')
    expect(me).toContain('NON_OFFICIAL_DISCLAIMER_ZH')
    expect(me).toContain('NON_OFFICIAL_DISCLAIMER_EN')

    // Export meta still excludes password by toast/copy intent
    expect(privacy).toContain('不含密码')
  })
})
