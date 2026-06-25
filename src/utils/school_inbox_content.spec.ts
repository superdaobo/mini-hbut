import { describe, expect, it } from 'vitest'
import { buildSchoolInboxDetailHtml, looksLikeHtml, linkifyPlainText } from './school_inbox_content'

describe('school_inbox_content', () => {
  it('detects html bodies', () => {
    expect(looksLikeHtml('<p>hello</p>')).toBe(true)
    expect(looksLikeHtml('plain text')).toBe(false)
  })

  it('linkifies plain text urls', () => {
    const html = linkifyPlainText('访问 https://example.com/a 查看')
    expect(html).toContain('href="https://example.com/a"')
    expect(html).toContain('https://example.com/a')
  })

  it('builds detail html for plain and html bodies', () => {
    expect(buildSchoolInboxDetailHtml('')).toContain('暂无正文内容')
    expect(buildSchoolInboxDetailHtml('https://hbut.edu.cn')).toContain('href="https://hbut.edu.cn"')
    expect(buildSchoolInboxDetailHtml('<p>安全</p><script>alert(1)</script>')).toContain('<p>安全</p>')
    expect(buildSchoolInboxDetailHtml('<p>安全</p><script>alert(1)</script>')).not.toContain('<script')
  })
})
