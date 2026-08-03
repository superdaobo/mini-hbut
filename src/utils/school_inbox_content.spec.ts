import { describe, expect, it } from 'vitest'
import {
  buildSchoolInboxDetailHtml,
  looksLikeHtml,
  linkifyPlainText,
  sanitizeSchoolInboxHtml
} from './school_inbox_content'

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

  // SSR（无 DOM）分支 = sanitizeHtmlWithoutDom 白名单 tokenizer
  describe('SSR sanitize（无 DOM 分支）恶意标签变体', () => {
    const sanitize = (html: string) => {
      // 确保测试环境走无 DOM 分支
      expect(typeof document).toBe('undefined')
      return buildSchoolInboxDetailHtml(html)
    }

    it('剥除带空格闭合变体的 script（</script >）', () => {
      const out = sanitize('<p>hi</p><script>alert(1)</script >')
      expect(out).toContain('<p>hi</p>')
      expect(out).not.toContain('<script')
      expect(out).not.toContain('</script')
    })

    it('剥除大小写混合 script 变体', () => {
      const out = sanitize('<ScRiPt>alert(1)</sCrIpT>')
      expect(out).not.toContain('script')
      expect(out).not.toContain('SCRIPT')
    })

    it('剥除 img/iframe 及事件属性（onerror/onclick）', () => {
      const out = sanitize('<img src=x onerror=alert(1)><iframe src="https://evil.example"></iframe>')
      expect(out).not.toContain('<img')
      expect(out).not.toContain('<iframe')
      expect(out).not.toContain('onerror')
    })

    it('A 标签仅保留 https?:// href，丢弃 javascript: 伪协议', () => {
      const out = sanitize('<a href="javascript:alert(1)">点我</a>')
      expect(out).toContain('<a>点我</a>')
      expect(out).not.toContain('javascript:')
      expect(out).not.toContain('href')
    })

    it('A 标签保留安全 href 并丢弃其余属性', () => {
      const out = sanitize('<a href="https://hbut.edu.cn" onclick="alert(1)" style="color:red">官网</a>')
      expect(out).toContain('href="https://hbut.edu.cn"')
      expect(out).toContain('target="_blank"')
      expect(out).toContain('rel="noopener noreferrer"')
      expect(out).not.toContain('onclick')
      expect(out).not.toContain('style=')
    })

    it('白名单容器标签重建且剥除属性，保留子内容', () => {
      const out = sanitize('<div style="background:url(javascript:x)">正文</div>')
      expect(out).toContain('<div>正文</div>')
      expect(out).not.toContain('style')
      expect(out).not.toContain('javascript:')
    })

    it('未知标签整体剥除，内容保留为文本', () => {
      const out = sanitize('<marquee><b>滚动</b></marquee>')
      expect(out).not.toContain('marquee')
      expect(out).toContain('<b>滚动</b>')
    })

    it('组合攻击载荷不产生可执行标签', () => {
      const payload = '<p>a</p><script>evil()</script><a href="javascript:void(0)">b</a><img src=x onerror=alert(2)>'
      const out = sanitize(payload)
      expect(out).not.toMatch(/<script[\s>]/i)
      expect(out).not.toMatch(/<img[\s>]/i)
      expect(out).not.toContain('javascript:')
      expect(out).not.toContain('onerror')
      expect(out).toContain('<p>a</p>')
    })

    it('非标签的 < 字符按普通文本输出', () => {
      expect(sanitizeSchoolInboxHtml('1 < 3 且 5 > 2')).toBe('1 < 3 且 5 > 2')
      expect(sanitizeSchoolInboxHtml('<3 爱心')).toBe('<3 爱心')
    })
  })
})
