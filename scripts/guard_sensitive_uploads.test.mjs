/**
 * SecretGuard 单元测试（node --test scripts/guard_sensitive_uploads.test.mjs）
 *
 * 覆盖 #618 + #626 新增的 Identity 敏感值类别：
 * - 正例：Vercel Token / PG 连接串（含密码）/ PEM 私钥 / OIDC 私钥 JWK /
 *         Identity 密钥类环境变量赋值 / 服务令牌 / handoff 样例；
 * - 反例：普通 JSON、占位模板（.env.example 风格）、非敏感 issuer 赋值、
 *         短 handoff 值、无引号 env 赋值不得误报。
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sensitivePatterns, scanContent } from './guard_sensitive_uploads.mjs'

const scan = (text) => scanContent('fixtures.txt', text, 'test')

test('sensitivePatterns 覆盖 #618/#626 要求的新类别', () => {
  const names = sensitivePatterns.map((p) => p.name)
  for (const expected of [
    'Vercel Token',
    'PostgreSQL 连接串（含密码）',
    'PEM 私钥块',
    'OIDC 私钥 JWK（kty+d 组合）',
    'Identity 平台密钥类环境变量赋值',
    'Identity handoff/令牌样例赋值',
  ]) {
    assert.ok(names.includes(expected), `缺少类别: ${expected}`)
  }
})

test('正例：Vercel Token 命中', () => {
  const findings = scan('const t = "vercel_abc123ABC456def789GHI012jkl345";')
  assert.ok(findings.some((f) => f.rule === 'Vercel Token'))
})

test('正例：PostgreSQL 连接串（含密码）命中', () => {
  const findings = scan('DATABASE_URL=postgresql://admin:s3cr3t-pass!word@db.neon.tech/mini_hbut')
  assert.ok(findings.some((f) => f.rule === 'PostgreSQL 连接串（含密码）'))
})

test('正例：PEM 私钥块命中', () => {
  const findings = scan('-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFA\n-----END PRIVATE KEY-----')
  assert.ok(findings.some((f) => f.rule === 'PEM 私钥块'))
})

test('正例：OIDC 私钥 JWK（kty+d 组合）命中', () => {
  const jwk = '{"kty":"EC","crv":"P-256","d":"abcdefghijklmnopqrstuvwxyz123456","x":"AA","y":"BB"}'
  const findings = scan(jwk)
  assert.ok(findings.some((f) => f.rule === 'OIDC 私钥 JWK（kty+d 组合）'))
})

test('正例：Identity 密钥类环境变量赋值命中', () => {
  const findings = scan('const env = { IDENTITY_CLIENT_SECRET_KEK: "0123456789abcdef0123456789abcdef" };')
  assert.ok(findings.some((f) => f.rule === 'Identity 平台密钥类环境变量赋值'))
})

test('正例：#626 服务令牌/其他密钥 env 赋值命中', () => {
  const a = scan('process.env.IDENTITY_SERVICE_TOKEN = "svc-token-0123456789abcdef0123456789abcdef";')
  assert.ok(a.some((f) => f.rule === 'Identity 平台密钥类环境变量赋值'))
  const b = scan('const keys = { IDENTITY_COOKIE_KEYS: "cookie-sign-key-0123456789abcdef0123456789abcdef" };')
  assert.ok(b.some((f) => f.rule === 'Identity 平台密钥类环境变量赋值'))
})

test('正例：#626 handoff/服务令牌头样例命中', () => {
  const a = scan('fetch(url, { headers: { "x-identity-handoff": "ho_7hF2kPq9wXyZ4vB6nM1cJ8dL3sA5tR0uE0123" } });')
  assert.ok(a.some((f) => f.rule === 'Identity handoff/令牌样例赋值'))
  const b = scan('const h = { "x-identity-service-token": "svc-token-0123456789abcdef0123456789abcdef" };')
  assert.ok(b.some((f) => f.rule === 'Identity handoff/令牌样例赋值'))
})

test('反例：普通 JSON 不误报', () => {
  const findings = scan('{"name":"张三","scores":[98,87,76],"remark":"d: ok","note":"kty not really"}')
  assert.equal(findings.length, 0)
})

test('反例：短 d 值 JSON（非 JWK）不误报', () => {
  assert.equal(scan('{"kty":"RSA","d":"123"}').length, 0)
})

test('反例：.env.example 占位模板不误报（无引号 + 尖括号）', () => {
  const placeholder = 'IDENTITY_DATABASE_URL=postgresql://<user>:<password>@<host>:5432/<database>'
  assert.equal(scan(placeholder).length, 0)
})

test('反例：非敏感 issuer 赋值不误报', () => {
  assert.equal(scan('IDENTITY_ISSUER=https://id.xn--vhq74jc2fzpchter27a.com').length, 0)
})

test('反例：无凭据 PG URL 不误报', () => {
  assert.equal(scan('const db = "postgres://localhost:5432/myapp";').length, 0)
})

test('反例：普通文本与短 secret 值不误报', () => {
  assert.equal(scan('今天天气不错，成绩查询应用工作正常。').length, 0)
  assert.equal(scan('{"client_secret":"none"}').length, 0)
})

test('反例：#626 短 handoff 值 / 无引号 env 占位 / 说明文字不误报', () => {
  assert.equal(scan('headers: { "x-identity-handoff": "short" }').length, 0)
  assert.equal(scan('IDENTITY_SERVICE_TOKEN=<your-service-token>').length, 0)
  assert.equal(scan('文档提到 x-identity-handoff header 用于转发凭据，不携带具体值').length, 0)
})
