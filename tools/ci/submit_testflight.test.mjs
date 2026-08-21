/**
 * submit_testflight.mjs 纯函数单测（node --test）。
 * 运行：node --test tools/ci/submit_testflight.test.mjs
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  buildWhatsNew,
  createAppEncryptionDeclarationLookupPath,
  createBetaBuildLocalizationBody,
  createBuildEncryptionDeclarationLinkageBody,
  createJwt,
  createPrereleaseBuildsPath,
  createPrereleaseLookupPath,
  parseTestAccount,
} from './submit_testflight.mjs'

test('createPrereleaseLookupPath 过滤 App/版本/平台', () => {
  const path = createPrereleaseLookupPath({ appId: '6787857278', versionName: '1.4.7' })
  assert.match(path, /^\/preReleaseVersions\?/)
  assert.match(path, /filter%5Bapp%5D=6787857278/)
  assert.match(path, /filter%5Bversion%5D=1\.4\.7/)
  assert.match(path, /filter%5Bplatform%5D=IOS/)
})

test('createPrereleaseBuildsPath 定位版本下构建', () => {
  const path = createPrereleaseBuildsPath('prv-123')
  assert.equal(path, '/preReleaseVersions/prv-123/builds?fields%5Bbuilds%5D=version%2CprocessingState%2CuploadedDate%2Cexpired&limit=200')
})

test('createAppEncryptionDeclarationLookupPath 含 app 过滤与所需字段', () => {
  const path = createAppEncryptionDeclarationLookupPath({ appId: '6787857278' })
  assert.match(path, /^\/appEncryptionDeclarations\?/)
  assert.match(path, /filter%5Bapp%5D=6787857278/)
  assert.match(path, /appEncryptionDeclarationState/)
  assert.match(path, /usesEncryption/)
  const limited = createAppEncryptionDeclarationLookupPath({ appId: 'a1', limit: 50 })
  assert.match(limited, /limit=50/)
})

test('createBuildEncryptionDeclarationLinkageBody 结构正确', () => {
  const body = createBuildEncryptionDeclarationLinkageBody('decl-9')
  assert.deepEqual(body, {
    data: { type: 'appEncryptionDeclarations', id: 'decl-9' },
  })
})

test('createBetaBuildLocalizationBody 结构正确', () => {
  const body = createBetaBuildLocalizationBody({ buildId: 'b1', locale: 'zh-Hans', whatsNew: 'hello' })
  assert.equal(body.data.type, 'betaBuildLocalizations')
  assert.equal(body.data.attributes.whatsNew, 'hello')
  assert.equal(body.data.relationships.build.data.id, 'b1')
})

test('createJwt 非 PEM 输入报错（结构校验）', () => {
  // 不使用真实密钥材料：仅验证非法 PM 时抛错，且不触碰 secret-guard 扫描
  assert.throws(() => createJwt({ keyId: 'k1', issuerId: 'i1', privateKeyPem: 'not-a-pem' }))
})

test('buildWhatsNew 手动输入优先并支持字面 \\n', () => {
  const text = buildWhatsNew({ manual: '行一\\n行二', versionName: '1.4.7', buildNumber: '28' })
  assert.equal(text, '行一\n行二')
})

test('buildWhatsNew 自动生成包含版本与 commit、不含账号明文校验', () => {
  const text = buildWhatsNew({
    manual: '',
    versionName: '1.4.7',
    buildNumber: '28',
    commits: ['abc123 修复A'],
    account: { username: 'demo-user', password: 'demo-pwd' },
  })
  assert.ok(text.includes('v1.4.7（build 28）'))
  assert.ok(text.includes('- abc123 修复A'))
  assert.ok(text.includes('演示测试账号：demo-user / demo-pwd'))
})

test('buildWhatsNew 超过 4000 字符截断', () => {
  const text = buildWhatsNew({ manual: 'x'.repeat(4200), versionName: '1', buildNumber: '1' })
  assert.ok(text.length <= 4000)
})

test('parseTestAccount 从源码提取账号', () => {
  const source = "export const TEST_ACCOUNT = { username: 'u1', password: 'p1', studentId: '123' }"
  const acc = parseTestAccount(source)
  assert.equal(acc.username, 'u1')
  assert.equal(acc.password, 'p1')
  assert.equal(acc.studentId, '123')
})

test('parseTestAccount 缺字段返回 null', () => {
  assert.equal(parseTestAccount('export const X = { username: "a" }'), null)
  assert.equal(parseTestAccount(''), null)
})