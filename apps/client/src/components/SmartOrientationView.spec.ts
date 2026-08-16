import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const viewPath = resolve(__dirname, 'SmartOrientationView.vue')
const source = readFileSync(viewPath, 'utf8')

describe('SmartOrientationView contract (#459)', () => {
  it('registers five readonly tabs', () => {
    for (const id of ['messages', 'mentor', 'counselor', 'dorm', 'profile']) {
      expect(source).toContain(`id: '${id}'`)
    }
  })

  it('calls only readonly smart_orientation invokes', () => {
    expect(source).toContain("smart_orientation_list_panels")
    expect(source).toContain("smart_orientation_list_messages")
    expect(source).toContain("smart_orientation_profile_blocks")
    expect(source).not.toMatch(/smart_orientation_.*(submit|save|upload|confirm)/i)
  })

  it('uses grade-style building blocks and theme tokens', () => {
    expect(source).toContain('TPageHeader')
    expect(source).toContain('TEmptyState')
    expect(source).toContain('var(--ui-')
    expect(source).toMatch(/loading|TEmptyState type="loading"/)
    expect(source).toMatch(/type="empty"/)
    expect(source).toMatch(/type="error"/)
  })

  it('does not render submit/write form actions', () => {
    expect(source).not.toMatch(/type=["']submit["']/)
    expect(source).not.toMatch(/@click="[^"]*(submit|upload|confirmSave)/i)
    expect(source).toContain('只读展示')
    expect(source).toContain('填报请前往官方门户')
  })
})
