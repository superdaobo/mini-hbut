/**
 * auth 站点组件测试（renderToStaticMarkup，node 环境，无需 jsdom）。
 *  - XSS payload（app name/host/developer）渲染后被转义；
 *  - 应用卡片展示名称/域名/开发者/审核状态/scope（防钓鱼信息齐全）；
 *  - 状态文案与关键验收文案；
 *  - 源码静态扫描：无 dangerouslySetInnerHTML、无密码表单、无 storage 写入、
 *    无 WebSocket/SSE（#630 Done 标准）。
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { OpenAppButton } from '../app/auth-site/_components/open-app-button'
import { QrPlaceholder } from '../app/auth-site/_components/qr-placeholder'
import { RequestCard, reviewStatusLabel } from '../app/auth-site/_components/request-card'
import { StatusView } from '../app/auth-site/_components/status-view'
import { BASE_DETAIL, VALID_HANDOFF } from './fixtures'

/** 递归收集目录下所有文件（绝对路径） */
function collectFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      collectFiles(full, out)
    } else {
      out.push(full)
    }
  }
  return out
}

const AUTH_SITE_DIR = join(__dirname, '..', 'app', 'auth-site')

describe('RequestCard：应用信息与转义', () => {
  it('XSS payload 在应用名/域名/开发者名中被转义', () => {
    const payload = '<script>alert(1)</script>'
    const detail = {
      ...BASE_DETAIL,
      client: {
        ...BASE_DETAIL.client,
        name: payload,
        homepage_host: payload,
        developer_display_name: payload,
      },
    }
    const html = renderToStaticMarkup(<RequestCard detail={detail} />)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('同时展示应用名/主页 hostname/开发者/审核状态/scope（防钓鱼信息）', () => {
    const html = renderToStaticMarkup(<RequestCard detail={BASE_DETAIL} />)
    expect(html).toContain('课程助手')
    expect(html).toContain('course.example.com')
    expect(html).toContain('课程助手开发者')
    expect(html).toContain('已通过审核')
    expect(html).toContain('获取你的学校身份')
    expect(html).toContain('确认你的 Mini-HBUT 身份')
    expect(html).toContain('敏感')
    // 页面只做说明，不存在允许/拒绝按钮（批准面只在 App 内）
    expect(html).not.toContain('<button')
  })

  it('scope 明细渲染', () => {
    const html = renderToStaticMarkup(<RequestCard detail={BASE_DETAIL} />)
    expect(html).toContain('scope-item')
    expect(html).toContain('获取你的学校身份')
  })

  it('reviewStatusLabel 映射', () => {
    expect(reviewStatusLabel('verified')).toBe('已通过审核')
    expect(reviewStatusLabel('pending')).toBe('审核中')
    expect(reviewStatusLabel('rejected')).toBe('未通过审核')
    expect(reviewStatusLabel('unknown-status')).toBe('unknown-status')
  })
})

describe('StatusView：状态文案与可访问性', () => {
  it('各状态关键文案（issue 原文）', () => {
    const cases: Array<[Parameters<typeof StatusView>[0]['phase'], string]> = [
      ['APP_OPENED', '已在 Mini-HBUT 中打开'],
      ['APPROVED', '授权已完成，正在返回'],
      ['DENIED', '你已在 Mini-HBUT 中拒绝此次授权'],
      ['EXPIRED', '此次登录请求已过期，请回到原应用重新发起'],
      ['WAITING_APP', '请在 Mini-HBUT 中确认此次登录'],
      ['CLIENT_UNAVAILABLE', '该应用当前不可用'],
    ]
    for (const [phase, text] of cases) {
      const html = renderToStaticMarkup(<StatusView phase={phase} />)
      expect(html).toContain(text)
      // role=status 可被屏幕阅读器读取
      expect(html).toContain('role="status"')
    }
  })

  it('缺少 handoff 的 INVALID 使用专属文案', () => {
    const html = renderToStaticMarkup(<StatusView phase="INVALID" lastError="missing_handoff" />)
    expect(html).toContain('缺少一次性凭据')
  })

  it('resume 失败时展示重试按钮', () => {
    const html = renderToStaticMarkup(
      <StatusView phase="APPROVED" lastError="resume" onRetry={() => undefined} />,
    )
    expect(html).toContain('重新返回原应用')
    expect(html).toContain('<button')
  })
})

describe('OpenAppButton / QrPlaceholder', () => {
  it('打开 App 按钮是带 href 的 <a>（可键盘 focus），文案为"打开 Mini-HBUT"', () => {
    const html = renderToStaticMarkup(
      <OpenAppButton href={`minihbut://identity?request_id=ar_1&handoff=${VALID_HANDOFF}`} />,
    )
    expect(html).toContain('打开 Mini-HBUT')
    expect(html).toContain('minihbut://identity?')
    expect(html).toContain('<a')
  })

  it('二维码占位带 aria-label 与文字 fallback（#627 实现前）', () => {
    const html = renderToStaticMarkup(<QrPlaceholder />)
    expect(html).toContain('role="img"')
    expect(html).toContain('aria-label')
    expect(html).toContain('由 #627 实现')
  })
})

describe('源码静态扫描（#630 Done 标准）', () => {
  const sources = collectFiles(AUTH_SITE_DIR).filter((f) => /\.(ts|tsx)$/.test(f))

  it('存在接力页/BFF/帮助页源码', () => {
    const joined = sources.join('\n')
    expect(joined).toContain('handoff-client.tsx')
    expect(joined).toContain('resume')
    expect(joined).toContain('help')
  })

  it('无 dangerouslySetInnerHTML（XSS 面最小化）', () => {
    for (const file of sources) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('dangerouslySetInnerHTML')
    }
  })

  it('无密码表单（type=password / <form）', () => {
    for (const file of sources) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/type=["']password["']/i)
      expect(src, file).not.toMatch(/<form/i)
    }
  })

  it('无 localStorage / sessionStorage / IndexedDB 写入（handoff 不落存储）', () => {
    // 只匹配属性访问形态（localStorage.xxx / indexedDB.xxx），注释提及不算
    for (const file of sources) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/localStorage\.|sessionStorage\.|indexedDB\./i)
      expect(src, file).not.toMatch(/window\s*\[\s*['"]localStorage['"]\s*\]/i)
    }
  })

  it('无 WebSocket / EventSource（V1 只靠短轮询）', () => {
    for (const file of sources) {
      const src = readFileSync(file, 'utf8')
      expect(src, file).not.toMatch(/new WebSocket|EventSource/i)
    }
  })
})
