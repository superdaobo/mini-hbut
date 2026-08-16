/**
 * Redirect URI / Scope / 表单校验纯函数测试（issue #624 负向规则）。
 *
 * Redirect URI Server validation（服务端权威，前端复用）：
 *  - Web Production 必须 https；本地开发可放行 http://localhost / 127.0.0.1；
 *  - 禁止 fragment / userinfo / wildcard / 裸协议 / substring 式宽松写法；
 *  - Native loopback 仅 127.0.0.1 / [::1]（允许动态端口），按 RFC 8252；
 *  - Native custom scheme 非 http/https、合法 scheme 字符、必须含冒号与路径；
 *  - 数量上限 / 长度上限 / 精确去重。
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_REDIRECT_URIS,
  kindAllowedFor,
  validateRedirectUri,
  validateRedirectUriSet,
} from '../lib/developer/redirect-uri'
import {
  homepageRequiredFor,
  isSensitiveScope,
  isWhitelistedScope,
  validateScopeRequest,
} from '../lib/developer/scopes'
import {
  sanitizeCreateAppInput,
  sanitizeRedirectUris,
  sanitizeScopeRequests,
  validateCreateAppInput,
  validateUpdateAppInput,
  validateUrlField,
} from '../lib/developer/validation'

describe('web_https 正例', () => {
  it('标准 https 回调通过', () => {
    expect(validateRedirectUri('https://course.example.com/oauth/callback', 'web_https').ok).toBe(true)
  })

  it('本地开发环境放行 http://localhost 与 http://127.0.0.1（仅 allowLocalhostDev）', () => {
    expect(validateRedirectUri('http://localhost:3000/callback', 'web_https', { allowLocalhostDev: true }).ok).toBe(true)
    expect(validateRedirectUri('http://127.0.0.1/cb', 'web_https', { allowLocalhostDev: true }).ok).toBe(true)
  })

  it('生产环境（allowLocalhostDev=false 默认）拒绝 http', () => {
    expect(validateRedirectUri('http://localhost:3000/callback', 'web_https').ok).toBe(false)
    expect(validateRedirectUri('http://example.com/cb', 'web_https', { allowLocalhostDev: true }).ok).toBe(false)
  })
})

describe('web_https 负向规则', () => {
  it('禁止通配符 *', () => {
    const r = validateRedirectUri('https://example.com/*', 'web_https')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('通配符')
  })

  it('禁止 fragment（#）', () => {
    const r = validateRedirectUri('https://example.com/cb#frag', 'web_https')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('fragment')
  })

  it('禁止 userinfo（@）', () => {
    const r = validateRedirectUri('https://user@example.com/cb', 'web_https')
    expect(r.ok).toBe(false)
    expect(r.error).toContain('userinfo')
  })

  it('禁止裸协议/缺主机（substring 宽松写法的根）', () => {
    expect(validateRedirectUri('https://', 'web_https').ok).toBe(false)
    expect(validateRedirectUri('https://example.com', 'web_https').ok).toBe(true) // 根 URL 合法（精确匹配语义由注册值决定）
  })

  it('拒绝非 URL 与带控制字符/超长', () => {
    expect(validateRedirectUri('not a url', 'web_https').ok).toBe(false)
    expect(validateRedirectUri('https://example.com/\u0007cb', 'web_https').ok).toBe(false)
    expect(validateRedirectUri('https://example.com/' + 'a'.repeat(3000), 'web_https').ok).toBe(false)
    expect(validateRedirectUri('', 'web_https').ok).toBe(false)
  })

  it('不能把 web_https 类型注册到 Native 应用（kind 与 client_type 匹配）', () => {
    expect(kindAllowedFor('web_https', 'native_public')).toBe(false)
    expect(kindAllowedFor('native_custom', 'web_confidential')).toBe(false)
    expect(kindAllowedFor('native_loopback', 'web_confidential')).toBe(false)
    expect(kindAllowedFor('web_https', 'web_confidential')).toBe(true)
  })
})

describe('Native loopback（RFC 8252 §7.3）', () => {
  it('仅接受 127.0.0.1 / [::1] 的 http，可带动态端口', () => {
    expect(validateRedirectUri('http://127.0.0.1:5281/callback', 'native_loopback').ok).toBe(true)
    expect(validateRedirectUri('http://[::1]:5281/callback', 'native_loopback').ok).toBe(true)
    expect(validateRedirectUri('http://127.0.0.1/cb', 'native_loopback').ok).toBe(true)
  })

  it('拒绝 localhost 主机名、非 127 地址、https、非法端口', () => {
    expect(validateRedirectUri('http://localhost:3000/cb', 'native_loopback').ok).toBe(false)
    expect(validateRedirectUri('http://127.0.0.2/cb', 'native_loopback').ok).toBe(false)
    expect(validateRedirectUri('https://127.0.0.1/cb', 'native_loopback').ok).toBe(false)
    expect(validateRedirectUri('http://127.0.0.1:0/cb', 'native_loopback').ok).toBe(false)
    expect(validateRedirectUri('http://127.0.0.1:99999/cb', 'native_loopback').ok).toBe(false)
  })
})

describe('Native custom scheme（RFC 8252 §7.1）', () => {
  it('合法自定义 scheme 通过', () => {
    expect(validateRedirectUri('my-app:/oauth/callback', 'native_custom').ok).toBe(true)
    expect(validateRedirectUri('com.example.app:/cb?x=1', 'native_custom').ok).toBe(true)
  })

  it('拒绝 http/https scheme、无冒号、空路径、非法 scheme 字符', () => {
    expect(validateRedirectUri('https://x/cb', 'native_custom').ok).toBe(false)
    expect(validateRedirectUri('myapp/callback', 'native_custom').ok).toBe(false)
    expect(validateRedirectUri('my-app:', 'native_custom').ok).toBe(false)
    expect(validateRedirectUri('1app:/cb', 'native_custom').ok).toBe(false)
    expect(validateRedirectUri('my app:/cb', 'native_custom').ok).toBe(false)
  })
})

describe('URI 集合校验', () => {
  it('空集合拒绝（至少一个）', () => {
    const r = validateRedirectUriSet([], 'web_confidential')
    expect(r.ok).toBe(false)
  })

  it('精确去重：完全相同才判重，前缀不判重', () => {
    const dup = validateRedirectUriSet(
      [
        { uri: 'https://example.com/cb', kind: 'web_https' },
        { uri: 'https://example.com/cb', kind: 'web_https' },
      ],
      'web_confidential',
    )
    expect(dup.ok).toBe(false)
    expect(dup.error).toContain('重复')
    // 前缀写法合法但语义独立（不存在 substring 扩展）
    const prefix = validateRedirectUriSet(
      [
        { uri: 'https://example.com/cb', kind: 'web_https' },
        { uri: 'https://example.com/cb/x', kind: 'web_https' },
      ],
      'web_confidential',
    )
    expect(prefix.ok).toBe(true)
  })

  it('数量上限（MAX_REDIRECT_URIS）', () => {
    const many = Array.from({ length: MAX_REDIRECT_URIS + 1 }, (_, i) => ({
      uri: `https://example.com/cb${i}`,
      kind: 'web_https' as const,
    }))
    const r = validateRedirectUriSet(many, 'web_confidential')
    expect(r.ok).toBe(false)
    expect(r.error).toContain(String(MAX_REDIRECT_URIS))
    const ok = validateRedirectUriSet(many.slice(0, MAX_REDIRECT_URIS), 'web_confidential')
    expect(ok.ok).toBe(true)
  })

  it('类型不匹配的条目拒绝', () => {
    const r = validateRedirectUriSet([{ uri: 'my-app:/cb', kind: 'native_custom' }], 'web_confidential')
    expect(r.ok).toBe(false)
  })
})

describe('Scope 校验', () => {
  it('白名单与敏感级别', () => {
    expect(isWhitelistedScope('openid')).toBe(true)
    expect(isWhitelistedScope('student.identity')).toBe(true)
    expect(isWhitelistedScope('grades')).toBe(false) // 学业 scope 不在 V1
    expect(isSensitiveScope('student.identity')).toBe(true)
    expect(isSensitiveScope('offline_access')).toBe(true)
    expect(isSensitiveScope('profile')).toBe(false)
  })

  it('必须包含 openid；非白名单拒绝', () => {
    const noOpenid = validateScopeRequest({
      scopes: ['profile'],
      justifications: {},
      privacyPolicyUrl: null,
      contact: null,
    })
    expect(noOpenid.ok).toBe(false)
    const bad = validateScopeRequest({
      scopes: ['openid', 'grades'],
      justifications: {},
      privacyPolicyUrl: null,
      contact: null,
    })
    expect(bad.ok).toBe(false)
    expect(bad.error).toContain('白名单')
  })

  it('敏感 scope 必须填写使用理由（至少 10 字），且要求隐私政策与联系方式', () => {
    const noReason = validateScopeRequest({
      scopes: ['openid', 'student.identity'],
      justifications: { 'student.identity': '短' },
      privacyPolicyUrl: 'https://example.com/privacy',
      contact: 'dev@example.com',
    })
    expect(noReason.ok).toBe(false)
    expect(noReason.error).toContain('使用理由')

    const noPrivacy = validateScopeRequest({
      scopes: ['openid', 'offline_access'],
      justifications: { offline_access: '用于在后台同步课程表，需要长期访问令牌' },
      privacyPolicyUrl: null,
      contact: 'dev@example.com',
    })
    expect(noPrivacy.ok).toBe(false)
    expect(noPrivacy.error).toContain('隐私政策')

    const noContact = validateScopeRequest({
      scopes: ['openid', 'offline_access'],
      justifications: { offline_access: '用于在后台同步课程表，需要长期访问令牌' },
      privacyPolicyUrl: 'https://example.com/privacy',
      contact: null,
    })
    expect(noContact.ok).toBe(false)
    expect(noContact.error).toContain('联系方式')

    const ok = validateScopeRequest({
      scopes: ['openid', 'offline_access'],
      justifications: { offline_access: '用于在后台同步课程表，需要长期访问令牌' },
      privacyPolicyUrl: 'https://example.com/privacy',
      contact: 'dev@example.com',
    })
    expect(ok.ok).toBe(true)
  })

  it('普通 scope（profile）不需要理由', () => {
    const r = validateScopeRequest({
      scopes: ['openid', 'profile'],
      justifications: {},
      privacyPolicyUrl: null,
      contact: null,
    })
    expect(r.ok).toBe(true)
  })

  it('主页 URL 对 web_confidential 必填，native 不要求', () => {
    expect(homepageRequiredFor('web_confidential')).toBe(true)
    expect(homepageRequiredFor('native_public')).toBe(false)
  })
})

describe('表单校验（create/update 输入）', () => {
  const validCreate = {
    name: '课程表助手',
    description: '展示课程与考试安排的第三方工具',
    homepage_url: 'https://course.example.com',
    client_type: 'web_confidential' as const,
    privacy_policy_url: null,
    contact: null,
    redirect_uris: [{ uri: 'https://course.example.com/oauth/callback', kind: 'web_https' as const }],
    scopes: [{ scope: 'openid', justification: null }],
  }

  it('合法创建输入通过', () => {
    expect(validateCreateAppInput(validCreate).ok).toBe(true)
  })

  it('名称/描述必填；超长拒绝', () => {
    expect(validateCreateAppInput({ ...validCreate, name: '' }).ok).toBe(false)
    expect(validateCreateAppInput({ ...validCreate, description: '' }).ok).toBe(false)
    expect(validateCreateAppInput({ ...validCreate, name: 'x'.repeat(81) }).ok).toBe(false)
  })

  it('Web 应用主页必填且必须 https', () => {
    expect(validateCreateAppInput({ ...validCreate, homepage_url: null }).ok).toBe(false)
    expect(validateCreateAppInput({ ...validCreate, homepage_url: 'http://example.com' }).ok).toBe(false)
  })

  it('敏感 scope 时隐私政策与联系方式必填（create 级别）', () => {
    const withSensitive = {
      ...validCreate,
      scopes: [
        { scope: 'openid', justification: null },
        { scope: 'student.identity', justification: '用于在课程社区展示实名身份，需要学校身份声明' },
      ],
    }
    expect(validateCreateAppInput(withSensitive).ok).toBe(false) // 缺 privacy/contact
    const filled = {
      ...withSensitive,
      privacy_policy_url: 'https://course.example.com/privacy',
      contact: 'dev@example.com',
    }
    expect(validateCreateAppInput(filled).ok).toBe(true)
  })

  it('update 输入：可部分更新，URL 必须合法', () => {
    expect(validateUpdateAppInput({ name: '新名字' }).ok).toBe(true)
    expect(validateUpdateAppInput({ homepage_url: 'https://new.example.com' }).ok).toBe(true)
    expect(validateUpdateAppInput({ homepage_url: 'javascript:alert(1)' }).ok).toBe(false)
    expect(validateUpdateAppInput({ name: '' }).ok).toBe(false)
  })

  it('URL 字段校验（validateUrlField）', () => {
    expect(validateUrlField(null, 'x').ok).toBe(true)
    expect(validateUrlField('https://a.com', 'x').ok).toBe(true)
    expect(validateUrlField('ftp://a.com', 'x').ok).toBe(false)
    expect(validateUrlField('http://localhost:3000', 'x').ok).toBe(true)
  })
})

describe('输入清洗（sanitize，拒绝非法 shape）', () => {
  it('sanitizeRedirectUris：拒绝非数组/错误类型/未知 kind', () => {
    expect(sanitizeRedirectUris(null).ok).toBe(false)
    expect(sanitizeRedirectUris([{ uri: 'x' }]).ok).toBe(false)
    expect(sanitizeRedirectUris([{ uri: 'https://a.com/cb', kind: 'regex' }]).ok).toBe(false)
    const ok = sanitizeRedirectUris([{ uri: 'https://a.com/cb', kind: 'web_https' }])
    expect(ok.ok).toBe(true)
  })

  it('sanitizeScopeRequests：拒绝空数组/非法条目；清洗 justification 空白', () => {
    expect(sanitizeScopeRequests([]).ok).toBe(false)
    expect(sanitizeScopeRequests([{ scope: 123 }]).ok).toBe(false)
    const ok = sanitizeScopeRequests([{ scope: 'openid', justification: '  用途说明  ' }])
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.value[0]!.justification).toBe('用途说明')
    }
  })

  it('sanitizeCreateAppInput：拒绝 client_type 非法与未知字段污染', () => {
    expect(sanitizeCreateAppInput({ client_type: 'browser_public' }).ok).toBe(false)
    const raw = sanitizeCreateAppInput({
      name: ' x ',
      description: ' desc ',
      homepage_url: 'https://a.com',
      client_type: 'native_public',
      privacy_policy_url: null,
      contact: '  c@example.com ',
      redirect_uris: [{ uri: 'my-app:/cb', kind: 'native_custom' }],
      scopes: [{ scope: 'openid', justification: null }],
      developer_id: 'attacker', // 越权面：必须被忽略
      student_id: '2023xxxx', // 越权面：必须被忽略
    })
    expect(raw.ok).toBe(true)
    if (raw.ok) {
      expect(raw.value.name).toBe('x')
      expect(raw.value.contact).toBe('c@example.com')
      expect('developer_id' in raw.value).toBe(false)
      expect('student_id' in raw.value).toBe(false)
    }
  })
})
