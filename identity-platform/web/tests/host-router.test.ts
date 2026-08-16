/**
 * Host 路由分类测试（#618 验收：auth / developer / unknown 三类 Host）。
 * 全部走纯函数 classifyHost，无需浏览器环境。
 */
import { describe, expect, it } from 'vitest'
import { classifyHost, normalizeHost } from '../lib/host-router'

const AUTH = 'https://auth.xn--vhq74jc2fzpchter27a.com'
const DEVELOPER = 'https://developer.xn--vhq74jc2fzpchter27a.com'

const config = {
  authOrigin: AUTH,
  developerOrigin: DEVELOPER,
  previewHosts: ['my-web-preview.vercel.app'],
  allowLocalhostDev: false,
}

describe('host 规范化', () => {
  it('中文域名与 Punycode 域名规范化后相等', () => {
    expect(normalizeHost('auth.湖北工业大学.com')).toBe('auth.xn--vhq74jc2fzpchter27a.com')
    expect(normalizeHost('auth.湖北工业大学.com:3000')).toBe('auth.xn--vhq74jc2fzpchter27a.com')
    expect(normalizeHost('developer.xn--vhq74jc2fzpchter27a.com')).toBe(
      'developer.xn--vhq74jc2fzpchter27a.com',
    )
  })
})

describe('三个 Host 类别（验收标准）', () => {
  it('auth.<domain> -> auth 站点', () => {
    expect(classifyHost('auth.xn--vhq74jc2fzpchter27a.com', config)).toEqual({ kind: 'auth' })
    // 中文域名同样识别
    expect(classifyHost('auth.湖北工业大学.com', config)).toEqual({ kind: 'auth' })
  })

  it('developer.<domain> -> developer 站点', () => {
    expect(classifyHost('developer.xn--vhq74jc2fzpchter27a.com', config)).toEqual({
      kind: 'developer',
    })
    expect(classifyHost('developer.湖北工业大学.com', config)).toEqual({ kind: 'developer' })
  })

  it('unknown host -> 404（fail closed，不落到管理后台）', () => {
    expect(classifyHost('evil.example.com', config)).toEqual({ kind: 'blocked', status: 404 })
    expect(classifyHost('', config)).toEqual({ kind: 'blocked', status: 404 })
    expect(classifyHost('id.xn--vhq74jc2fzpchter27a.com', config)).toEqual({
      kind: 'blocked',
      status: 404,
    })
  })

  it('畸形 Host（无法解析）-> 404 而非 500', () => {
    // Node 对原始字节 Host 可能给出无法解析的字符串，必须 fail closed
    expect(classifyHost('!!!', config)).toEqual({ kind: 'blocked', status: 404 })
    expect(classifyHost('auth.�xn--vhq74jc2fzpchter27a.com', config)).toEqual({
      kind: 'blocked',
      status: 404,
    })
  })

  it('Preview host 必须显式列入白名单，未列出的 *.vercel.app 一律 404', () => {
    expect(classifyHost('my-web-preview.vercel.app', config)).toEqual({ kind: 'preview' })
    expect(classifyHost('other-preview.vercel.app', config)).toEqual({
      kind: 'blocked',
      status: 404,
    })
    // 空白名单时 preview 也不放行
    expect(classifyHost('my-web-preview.vercel.app', { ...config, previewHosts: [] })).toEqual({
      kind: 'blocked',
      status: 404,
    })
  })
})

describe('fail closed 细节', () => {
  it('evil 子域不能绕过精确匹配（evil.auth.<domain> -> 404）', () => {
    expect(classifyHost('evil.auth.xn--vhq74jc2fzpchter27a.com', config)).toEqual({
      kind: 'blocked',
      status: 404,
    })
    expect(classifyHost('auth.xn--vhq74jc2fzpchter27a.com.evil.com', config)).toEqual({
      kind: 'blocked',
      status: 404,
    })
  })

  it('localhost 仅在 allowLocalhostDev=true 时放行到 auth', () => {
    expect(classifyHost('localhost:3000', { ...config, allowLocalhostDev: true })).toEqual({
      kind: 'auth',
    })
    expect(classifyHost('127.0.0.1', { ...config, allowLocalhostDev: true })).toEqual({
      kind: 'auth',
    })
    // 生产/预览语义下 localhost 不放行
    expect(classifyHost('localhost:3000', config)).toEqual({ kind: 'blocked', status: 404 })
  })

  it('未配置任何 origin 时所有 host 都 404（全新部署安全默认）', () => {
    expect(classifyHost('auth.xn--vhq74jc2fzpchter27a.com', {})).toEqual({
      kind: 'blocked',
      status: 404,
    })
  })
})
